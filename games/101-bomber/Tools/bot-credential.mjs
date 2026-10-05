#!/usr/bin/env node

/**
 * Resolve the secrets a Platform login needs. This file never mints tickets.
 *
 * Admission / account-auth credentials are signed only by LumioPlatform.
 * Bot-namespace logins still need a bot-tool claim, but that claim is issued
 * by the Platform deployment and injected here — it is not a Room ticket
 * and this module does not sign one.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const LOGIN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/;
export const BOT_NAMESPACE_PATTERN = /^Bot[0-9]+$/;
export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
export const ACCOUNT_ID_PATTERN = /^acct_[0-9a-f]{32}$/;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const UNBOUND_SENTINEL = '__unbound__';

export const ENV_PASSWORD = 'LUMIO_ACCOUNT_PASSWORD';
export const ENV_BOT_TOOL = 'LUMIO_BOT_TOOL_CREDENTIAL';
export const ENV_BOT_TOOL_FILE = 'LUMIO_BOT_TOOL_CREDENTIAL_FILE';

export class CredentialError extends Error {
  constructor(code, detail) {
    super(detail);
    this.name = 'CredentialError';
    this.code = code;
    this.detail = detail;
  }
}

export function isBotLoginName(loginName) {
  return BOT_NAMESPACE_PATTERN.test(String(loginName ?? ''));
}

export function assertLoginName(loginName) {
  const value = String(loginName ?? '');
  if (!LOGIN_NAME_PATTERN.test(value)) {
    throw new CredentialError('invalid_username', 'loginName does not match the account-port grammar.');
  }
  return value;
}

export function assertPassword(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new CredentialError('invalid_password', `password length must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH}.`);
  }
  return value;
}

export function assertBase64Url(value, label) {
  const text = String(value ?? '');
  if (!BASE64URL_PATTERN.test(text) || text.length > 16_384) {
    throw new CredentialError('invalid_request', `${label} must be base64url and no longer than 16384 characters.`);
  }
  return text;
}

/** Ephemeral test password for this process. Never written to disk. */
export function generateSessionPassword() {
  return randomBytes(18).toString('base64url');
}

/**
 * Password comes from the environment, or is generated for this run.
 * The contract's Hello-World test default is not copied into this repo
 * so a grep for password material stays empty.
 */
export function resolvePassword(env = process.env) {
  const fromEnv = env[ENV_PASSWORD];
  if (fromEnv != null && String(fromEnv).length > 0) {
    return { password: assertPassword(fromEnv), source: 'env', generated: false };
  }
  return { password: generateSessionPassword(), source: 'generated', generated: true };
}

/** Load a Platform-issued bot-tool claim. Missing is null — never invented. */
export function resolveBotToolCredential(env = process.env) {
  const fromEnv = env[ENV_BOT_TOOL];
  if (fromEnv != null && String(fromEnv).length > 0) {
    return assertBase64Url(fromEnv, ENV_BOT_TOOL);
  }
  const path = env[ENV_BOT_TOOL_FILE];
  if (path != null && String(path).length > 0) {
    const text = readFileSync(String(path), 'utf8').trim();
    return assertBase64Url(text, ENV_BOT_TOOL_FILE);
  }
  return null;
}

export function requireBotToolCredential(loginName, botToolCredential) {
  const name = assertLoginName(loginName);
  if (isBotLoginName(name) && (botToolCredential == null || String(botToolCredential).length === 0)) {
    throw new CredentialError(
      'bot_namespace_register_forbidden',
      'Bot-namespace loginName requires a Platform-issued bot-tool credential (LUMIO_BOT_TOOL_CREDENTIAL). This client does not mint one.',
    );
  }
  return botToolCredential == null || String(botToolCredential).length === 0
    ? null
    : assertBase64Url(botToolCredential, 'botToolCredential');
}

export function resolveLoginSecrets(loginName, env = process.env) {
  const name = assertLoginName(loginName);
  const password = resolvePassword(env);
  const botToolCredential = requireBotToolCredential(name, resolveBotToolCredential(env));
  return { loginName: name, ...password, botToolCredential };
}

const SECRET_KEYS = new Set(['password', 'botToolCredential', 'accountAuthCredential', 'admissionCredential']);

/** Replace known secret strings in text. Used for logs and error surfaces. */
export function redactSecrets(text, secrets) {
  let result = String(text ?? '');
  for (const secret of secrets) {
    if (secret == null || String(secret).length === 0) continue;
    result = result.split(String(secret)).join('<redacted>');
  }
  return result;
}

export function collectSecrets(record) {
  const secrets = [];
  const visit = (value) => {
    if (value == null) return;
    if (typeof value === 'string') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEYS.has(key) && item != null) secrets.push(String(item));
      else visit(item);
    }
  };
  visit(record);
  return secrets;
}

export function publicLoginView(login) {
  return {
    accepted: login.accepted,
    accountNewlyCreated: login.accountNewlyCreated,
    accountId: login.accountId,
    loginName: login.loginName,
    accountAuthExpiresAt: login.accountAuthExpiresAt,
  };
}

export function publicLaunchView(launch) {
  return {
    wsUrl: launch.wsUrl,
    subprotocol: launch.subprotocol,
    serverAudience: launch.serverAudience,
    gameId: launch.gameId,
    gameReleaseId: launch.gameReleaseId,
    contractId: launch.contractId,
    roomId: launch.roomId,
    allocationId: launch.allocationId,
    admissionExpiresAt: launch.admissionExpiresAt,
    accountId: launch.accountId,
    loginName: launch.loginName,
  };
}
