#!/usr/bin/env node

/**
 * LumioBomber S-4 account client.
 *
 * 1. WebSocket `/account` + subprotocol `lumio-account-v1` → LoginOrRegister
 *    (login-or-register). The ack is an unbound account-auth credential.
 * 2. `POST /api/games/{slug}/launch` with that credential as Bearer → a
 *    Room-bound admission ticket. The six allocation fields are server-owned;
 *    this client sends no body, query, or hint headers.
 *
 * Tickets are never signed here. Transports (`connect`, `fetchImpl`) are
 * injectable so tests can stay hermetic without a live Platform.
 */

import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_ID_PATTERN,
  BASE64URL_PATTERN,
  CredentialError,
  UNBOUND_SENTINEL,
  assertLoginName,
  assertPassword,
  collectSecrets,
  publicLaunchView,
  publicLoginView,
  redactSecrets,
  requireBotToolCredential,
  resolveLoginSecrets,
} from './bot-credential.mjs';

export const ACCOUNT_SUBPROTOCOL = 'lumio-account-v1';
export const LOGIN_OR_REGISTER = 'LoginOrRegister';
export const LOGIN_OR_REGISTER_ACK = 'LoginOrRegisterAck';
export const ERROR_MESSAGE = 'Error';
export const DEFAULT_GAME_SLUG = 'bomber';
export const BINDING_FIELDS = Object.freeze([
  'serverAudience', 'gameId', 'gameReleaseId', 'contractId', 'roomId', 'allocationId',
]);
export const LAUNCH_FIELDS = Object.freeze([
  'wsUrl', 'subprotocol', ...BINDING_FIELDS,
  'admissionCredential', 'admissionExpiresAt', 'accountId', 'loginName',
]);
export const FORBIDDEN_LAUNCH_HEADERS = Object.freeze([
  'x-lumio-server-audience', 'x-lumio-game-id', 'x-lumio-game-release-id',
  'x-lumio-contract-id', 'x-lumio-room-id', 'x-lumio-allocation-id',
  'x-lumio-ws-url', 'x-lumio-endpoint', 'x-lumio-allocation',
]);

const MAX_FRAME_BYTES = 65_536;
const DEFAULT_TIMEOUT_MS = 15_000;

export class AccountClientError extends Error {
  constructor(code, detail) {
    super(detail);
    this.name = 'AccountClientError';
    this.code = code;
    this.detail = detail;
  }
}

export function toAccountWsUrl(origin) {
  const url = new URL(requiredOrigin(origin));
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new AccountClientError('invalid_request', 'Platform origin must be http(s) or ws(s).');
  }
  url.pathname = '/account';
  url.search = '';
  url.hash = '';
  return url.href;
}

export function toLaunchUrl(origin, slug = DEFAULT_GAME_SLUG) {
  const url = new URL(requiredOrigin(origin));
  if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol === 'wss:') url.protocol = 'https:';
  const safeSlug = encodeURIComponent(String(slug ?? DEFAULT_GAME_SLUG));
  url.pathname = `/api/games/${safeSlug}/launch`;
  url.search = '';
  url.hash = '';
  return url.href;
}

function requiredOrigin(origin) {
  const value = String(origin ?? '').trim();
  if (!value) throw new AccountClientError('invalid_request', 'Platform origin is required.');
  return value;
}

function defaultConnect(url) {
  if (typeof WebSocket !== 'function') {
    throw new AccountClientError('invalid_request', 'WebSocket is unavailable in this runtime.');
  }
  return new WebSocket(url, [ACCOUNT_SUBPROTOCOL]);
}

function waitOpen(socket, timeoutMs) {
  if (socket.readyState === 1) return Promise.resolve();
  return once(socket, 'open', timeoutMs, 'account WebSocket did not open');
}

function readTextFrame(socket, timeoutMs) {
  return once(socket, 'message', timeoutMs, 'account WebSocket did not reply').then((event) => {
    const data = event?.data ?? event;
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    throw new AccountClientError('invalid_request', 'account WebSocket reply was not a text frame.');
  });
}

function once(socket, type, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new AccountClientError('invalid_request', `${label} within ${timeoutMs}ms.`));
    }, timeoutMs);
    const onEvent = (event) => {
      cleanup();
      resolve(event);
    };
    const onError = () => {
      cleanup();
      reject(new AccountClientError('invalid_request', 'account WebSocket failed.'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener?.(type, onEvent);
      socket.removeEventListener?.('error', onError);
      if (typeof socket.off === 'function') {
        socket.off(type, onEvent);
        socket.off('error', onError);
      }
    };
    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener(type, onEvent, { once: true });
      socket.addEventListener('error', onError, { once: true });
    } else if (typeof socket.once === 'function') {
      socket.once(type, onEvent);
      socket.once('error', onError);
    } else {
      clearTimeout(timer);
      reject(new AccountClientError('invalid_request', 'connect() did not return an evented socket.'));
    }
  });
}

function closeQuietly(socket) {
  try { socket.close?.(); } catch { /* already closed */ }
}

function writeLog(log, secrets, record) {
  if (typeof log !== 'function') return;
  const line = typeof record === 'string' ? record : JSON.stringify(record);
  log(redactSecrets(line, secrets));
}

export async function loginOrRegister(options = {}) {
  const loginName = assertLoginName(options.loginName);
  const password = assertPassword(options.password);
  const botToolCredential = requireBotToolCredential(loginName, options.botToolCredential);
  const secrets = [password, botToolCredential].filter(Boolean);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const connect = options.connect ?? defaultConnect;
  const url = toAccountWsUrl(options.origin);
  const request = {
    messageType: LOGIN_OR_REGISTER,
    loginName,
    password,
  };
  if (botToolCredential) request.botToolCredential = botToolCredential;

  writeLog(options.log, secrets, { event: 'account.login.send', loginName, ws: url });
  const socket = await connect(url, { protocol: ACCOUNT_SUBPROTOCOL });
  try {
    await waitOpen(socket, timeoutMs);
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload) > MAX_FRAME_BYTES) {
      throw new AccountClientError('invalid_request', 'LoginOrRegister frame exceeds maxFrameBytes.');
    }
    socket.send(payload);
    const raw = await readTextFrame(socket, timeoutMs);
    if (Buffer.byteLength(raw) > MAX_FRAME_BYTES) {
      throw new AccountClientError('invalid_request', 'account reply exceeds maxFrameBytes.');
    }
    let message;
    try { message = JSON.parse(raw); }
    catch { throw new AccountClientError('invalid_request', 'account reply was not JSON.'); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new AccountClientError('invalid_request', 'account reply must be a JSON object.');
    }
    if (message.messageType === ERROR_MESSAGE) {
      throw new AccountClientError(String(message.code ?? 'invalid_request'), String(message.detail ?? ''));
    }
    if (message.messageType !== LOGIN_OR_REGISTER_ACK) {
      throw new AccountClientError('invalid_request', 'account reply was not LoginOrRegisterAck.');
    }
    if (message.accepted !== true) {
      throw new AccountClientError('invalid_request', 'LoginOrRegisterAck.accepted was not true.');
    }
    if (typeof message.accountNewlyCreated !== 'boolean') {
      throw new AccountClientError('invalid_request', 'LoginOrRegisterAck.accountNewlyCreated must be a boolean.');
    }
    if (!ACCOUNT_ID_PATTERN.test(String(message.accountId ?? ''))) {
      throw new AccountClientError('invalid_request', 'LoginOrRegisterAck.accountId is not an AccountId.');
    }
    if (message.loginName !== loginName) {
      throw new AccountClientError('invalid_request', 'LoginOrRegisterAck.loginName does not match the request.');
    }
    const accountAuthCredential = assertBase64UrlField(message.accountAuthCredential, 'accountAuthCredential');
    const accountAuthExpiresAt = readEpoch(message.accountAuthExpiresAt, 'accountAuthExpiresAt');
    const login = {
      accepted: true,
      accountNewlyCreated: message.accountNewlyCreated,
      accountId: message.accountId,
      loginName: message.loginName,
      accountAuthCredential,
      accountAuthExpiresAt,
    };
    secrets.push(accountAuthCredential);
    writeLog(options.log, secrets, { event: 'account.login.ack', ...publicLoginView(login) });
    return login;
  } finally {
    closeQuietly(socket);
  }
}

function assertBase64UrlField(value, label) {
  const text = String(value ?? '');
  if (!BASE64URL_PATTERN.test(text) || text.length > 16_384) {
    throw new AccountClientError('invalid_request', `${label} must be base64url.`);
  }
  return text;
}

function readEpoch(value, label) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new AccountClientError('invalid_request', `${label} must be a positive integer epoch.`);
  }
  return number;
}

export function assertBoundLaunch(launch) {
  if (!launch || typeof launch !== 'object' || Array.isArray(launch)) {
    throw new AccountClientError('invalid_request', 'launch response must be a JSON object.');
  }
  for (const field of LAUNCH_FIELDS) {
    if (launch[field] == null || String(launch[field]).length === 0) {
      throw new AccountClientError('invalid_request', `launch response missing ${field}.`);
    }
  }
  for (const field of BINDING_FIELDS) {
    if (String(launch[field]) === UNBOUND_SENTINEL) {
      throw new AccountClientError('admission_credential_unbound', `launch ${field} is still the unbound sentinel.`);
    }
  }
  if (!ACCOUNT_ID_PATTERN.test(String(launch.accountId))) {
    throw new AccountClientError('invalid_request', 'launch.accountId is not an AccountId.');
  }
  const ticket = assertBase64UrlField(launch.admissionCredential, 'admissionCredential');
  const admissionExpiresAt = readEpoch(launch.admissionExpiresAt, 'admissionExpiresAt');
  return {
    wsUrl: String(launch.wsUrl),
    subprotocol: String(launch.subprotocol),
    serverAudience: String(launch.serverAudience),
    gameId: String(launch.gameId),
    gameReleaseId: String(launch.gameReleaseId),
    contractId: String(launch.contractId),
    roomId: String(launch.roomId),
    allocationId: String(launch.allocationId),
    admissionCredential: ticket,
    admissionExpiresAt,
    accountId: String(launch.accountId),
    loginName: String(launch.loginName),
  };
}

export async function launchGame(options = {}) {
  const slug = String(options.slug ?? DEFAULT_GAME_SLUG);
  const accountAuthCredential = assertBase64UrlField(options.accountAuthCredential, 'accountAuthCredential');
  const secrets = [accountAuthCredential];
  const url = toLaunchUrl(options.origin, slug);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AccountClientError('invalid_request', 'fetch is unavailable in this runtime.');
  }
  writeLog(options.log, secrets, { event: 'account.launch.send', slug, url });
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accountAuthCredential}` },
  });
  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try { body = JSON.parse(text); }
    catch { throw new AccountClientError('invalid_request', 'launch reply was not JSON.'); }
  }
  if (!response.ok) {
    const code = body?.code ?? `http_${response.status}`;
    const detail = body?.detail ?? `launch failed with HTTP ${response.status}`;
    throw new AccountClientError(String(code), String(detail));
  }
  const launch = assertBoundLaunch(body);
  secrets.push(launch.admissionCredential);
  writeLog(options.log, secrets, { event: 'account.launch.ack', ...publicLaunchView(launch) });
  return launch;
}

export async function loginAndLaunch(options = {}) {
  const secrets = resolveLoginSecrets(options.loginName, options.env ?? process.env);
  const password = options.password ?? secrets.password;
  const botToolCredential = options.botToolCredential === undefined
    ? secrets.botToolCredential
    : requireBotToolCredential(options.loginName, options.botToolCredential);
  const login = await loginOrRegister({
    origin: options.origin,
    loginName: secrets.loginName,
    password,
    botToolCredential,
    connect: options.connect,
    log: options.log,
    timeoutMs: options.timeoutMs,
  });
  const launch = await launchGame({
    origin: options.origin,
    slug: options.slug ?? DEFAULT_GAME_SLUG,
    accountAuthCredential: login.accountAuthCredential,
    fetchImpl: options.fetchImpl,
    log: options.log,
  });
  if (launch.accountId !== login.accountId || launch.loginName !== login.loginName) {
    throw new AccountClientError('invalid_request', 'launch identity does not match the login.');
  }
  return { login, launch, passwordGenerated: secrets.generated === true && options.password == null };
}

export function summarizeSession(session) {
  return {
    login: publicLoginView(session.login),
    launch: publicLaunchView(session.launch),
    passwordGenerated: session.passwordGenerated === true,
  };
}

function parseCli(argv, env) {
  const options = {
    origin: env.LUMIO_PLATFORM_ORIGIN,
    loginName: env.LUMIO_ACCOUNT_LOGIN,
    slug: env.LUMIO_GAME_SLUG || DEFAULT_GAME_SLUG,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!flag.startsWith('--') || i + 1 >= argv.length) {
      throw new AccountClientError('invalid_request', `unknown or incomplete option: ${flag}`);
    }
    const value = argv[++i];
    if (flag === '--origin') options.origin = value;
    else if (flag === '--login-name') options.loginName = value;
    else if (flag === '--slug') options.slug = value;
    else throw new AccountClientError('invalid_request', `unknown option: ${flag}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node Tools/account-client.mjs --origin <url> --login-name <name> [--slug bomber]',
    'Password: LUMIO_ACCOUNT_PASSWORD, or a one-shot generated test password.',
    'Bot names: LUMIO_BOT_TOOL_CREDENTIAL (Platform-issued; this client does not sign).',
    'Stdout is a public summary (no secrets). The Room ticket stays in-process for callers that import the module.',
  ].join('\n');
}

export { UNBOUND_SENTINEL, collectSecrets, publicLaunchView, publicLoginView, redactSecrets };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseCli(process.argv.slice(2), process.env);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      const session = await loginAndLaunch(options);
      process.stdout.write(`${JSON.stringify(summarizeSession(session), null, 2)}\n`);
    }
  } catch (error) {
    const secrets = collectSecrets(error);
    const message = redactSecrets(error?.message ?? error, secrets);
    process.stderr.write(`${message}\n`);
    if (error instanceof CredentialError || error instanceof AccountClientError) {
      process.stderr.write(`code=${error.code}\n`);
    }
    process.exitCode = 1;
  }
}
