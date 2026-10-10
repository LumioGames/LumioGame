import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_SUBPROTOCOL,
  BINDING_FIELDS,
  DEFAULT_GAME_SLUG,
  FORBIDDEN_LAUNCH_HEADERS,
  LOGIN_OR_REGISTER,
  UNBOUND_SENTINEL,
  assertBoundLaunch,
  launchGame,
  loginAndLaunch,
  loginOrRegister,
  summarizeSession,
  toAccountWsUrl,
  toLaunchUrl,
} from './account-client.mjs';
import {
  BOT_NAMESPACE_PATTERN,
  ENV_BOT_TOOL,
  ENV_PASSWORD,
  generateSessionPassword,
  isBotLoginName,
  resolveLoginSecrets,
  resolvePassword,
} from './bot-credential.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('normal Node account transport sends its actual Platform Origin in a real upgrade',{timeout:5000},async()=>{
  let headers;
  const server=createServer();server.on('upgrade',(request,socket)=>{
    headers=request.headers;
    // This local header fixture never accepts a connection or receives a login frame.
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    await assert.rejects(loginOrRegister({origin,loginName:'OriginHeaderUser',password:'Header-fixture-1234!',timeoutMs:2000}),/account WebSocket failed/);
    assert.equal(headers?.origin,origin);
    assert.equal(headers['sec-websocket-protocol'],ACCOUNT_SUBPROTOCOL);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

function createAccountStore() {
  const accounts = new Map();
  let next = 0;
  return {
    accounts,
    login(request) {
      const existing = accounts.get(request.loginName);
      if (!existing) {
        next += 1;
        const created = { accountId: `acct_${next.toString(16).padStart(32, '0')}`, password: request.password };
        accounts.set(request.loginName, created);
        return { newlyCreated: true, accountId: created.accountId };
      }
      if (existing.password !== request.password) {
        const error = new Error('wrong_password');
        error.code = 'wrong_password';
        throw error;
      }
      return { newlyCreated: false, accountId: existing.accountId };
    },
  };
}

function createFakeSocket(handler) {
  const listeners = new Map();
  const socket = {
    readyState: 0,
    protocol: ACCOUNT_SUBPROTOCOL,
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((item) => item !== fn));
    },
    emit(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    send(payload) {
      const reply = handler(JSON.parse(payload));
      queueMicrotask(() => socket.emit('message', { data: JSON.stringify(reply) }));
    },
    close() {
      socket.readyState = 3;
    },
  };
  queueMicrotask(() => {
    socket.readyState = 1;
    socket.emit('open');
  });
  return socket;
}

function boundLaunch(accountId, loginName) {
  return {
    wsUrl: 'ws://127.0.0.1:9110/',
    subprotocol: 'lumio.mvp.v0',
    serverAudience: 'game-fleet-test',
    gameId: 'bomber',
    gameReleaseId: 'bomber-0.1.0',
    contractId: 'lumio.gameplay-envelope.v1',
    roomId: 'room_bomber',
    allocationId: 'alloc_bomber_1',
    admissionCredential: `ticket_${accountId.replace('acct_', '')}`,
    admissionExpiresAt: 1_800_000_000,
    accountId,
    loginName,
  };
}

function createPlatform(store) {
  const launches = [];
  return {
    connect(url) {
      assert.equal(new URL(url).pathname, '/account');
      return createFakeSocket((request) => {
        assert.equal(request.messageType, LOGIN_OR_REGISTER);
        if (BOT_NAMESPACE_PATTERN.test(request.loginName) && !request.botToolCredential) {
          return { messageType: 'Error', code: 'bot_namespace_register_forbidden', detail: 'missing bot tool' };
        }
        try {
          const result = store.login(request);
          return {
            messageType: 'LoginOrRegisterAck',
            accepted: true,
            accountNewlyCreated: result.newlyCreated,
            accountId: result.accountId,
            loginName: request.loginName,
            accountAuthCredential: `auth_${result.accountId.replace('acct_', '')}`,
            accountAuthExpiresAt: 1_800_000_000,
          };
        } catch (error) {
          return { messageType: 'Error', code: error.code ?? 'invalid_request', detail: error.message };
        }
      });
    },
    async fetchImpl(url, init = {}) {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, `/api/games/${DEFAULT_GAME_SLUG}/launch`);
      assert.equal(parsed.search, '');
      assert.equal(init.method, 'POST');
      assert.equal(init.body, undefined);
      const headers = new Headers(init.headers);
      for (const name of FORBIDDEN_LAUNCH_HEADERS) {
        assert.equal(headers.has(name), false, `launch must not send ${name}`);
      }
      const authorization = headers.get('authorization');
      assert.match(authorization, /^Bearer /);
      const token = authorization.slice('Bearer '.length);
      const accountId = `acct_${token.replace('auth_', '')}`;
      const loginName = [...store.accounts].find(([, account]) => account.accountId === accountId)?.[0];
      const body = boundLaunch(accountId, loginName ?? 'unknown');
      launches.push({ token, body });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    launches,
  };
}

test('account URLs map HTTP origin to /account and launch with no query', () => {
  assert.equal(toAccountWsUrl('http://127.0.0.1:5080'), 'ws://127.0.0.1:5080/account');
  assert.equal(toAccountWsUrl('https://platform.example'), 'wss://platform.example/account');
  assert.equal(toLaunchUrl('http://127.0.0.1:5080'), 'http://127.0.0.1:5080/api/games/bomber/launch');
  assert.equal(toLaunchUrl('http://127.0.0.1:5080/?hint=1', 'bomber'), 'http://127.0.0.1:5080/api/games/bomber/launch');
});

test('first login creates an account; second login returns the same AccountId', async () => {
  const store = createAccountStore();
  const platform = createPlatform(store);
  const password = generateSessionPassword();
  const logs = [];
  const first = await loginOrRegister({
    origin: 'http://127.0.0.1:5080',
    loginName: 'alice',
    password,
    connect: platform.connect,
    log: (line) => logs.push(line),
  });
  const second = await loginOrRegister({
    origin: 'http://127.0.0.1:5080',
    loginName: 'alice',
    password,
    connect: platform.connect,
    log: (line) => logs.push(line),
  });
  assert.equal(first.accountNewlyCreated, true);
  assert.equal(second.accountNewlyCreated, false);
  assert.equal(first.accountId, second.accountId);
  assert.match(first.accountId, /^acct_[0-9a-f]{32}$/);
  assert.equal(logs.some((line) => line.includes(password)), false);
  assert.equal(logs.some((line) => line.includes(first.accountAuthCredential)), false);
});

test('loginAndLaunch exchanges account-auth for a Room-bound ticket and never reuses one ticket for two names', async () => {
  const store = createAccountStore();
  const platform = createPlatform(store);
  const password = generateSessionPassword();
  const logs = [];
  const first = await loginAndLaunch({
    origin: 'http://127.0.0.1:5080',
    loginName: 'alice',
    password,
    connect: platform.connect,
    fetchImpl: platform.fetchImpl,
    log: (line) => logs.push(line),
  });
  const second = await loginAndLaunch({
    origin: 'http://127.0.0.1:5080',
    loginName: 'bradley',
    password,
    connect: platform.connect,
    fetchImpl: platform.fetchImpl,
    log: (line) => logs.push(line),
  });
  assert.notEqual(first.login.accountId, second.login.accountId);
  assert.notEqual(first.launch.admissionCredential, second.launch.admissionCredential);
  for (const field of BINDING_FIELDS) {
    assert.notEqual(first.launch[field], UNBOUND_SENTINEL);
  }
  const summary = JSON.stringify(summarizeSession(first));
  assert.equal(summary.includes(password), false);
  assert.equal(summary.includes(first.login.accountAuthCredential), false);
  assert.equal(summary.includes(first.launch.admissionCredential), false);
  assert.equal(logs.join('\n').includes(password), false);
});

test('launch rejects an unbound sentinel instead of handing it to DS', () => {
  assert.throws(
    () => assertBoundLaunch({
      ...boundLaunch('acct_00000000000000000000000000000001', 'alice'),
      roomId: UNBOUND_SENTINEL,
    }),
    (error) => error.code === 'admission_credential_unbound',
  );
});

test('Bot loginName without a Platform-issued tool claim fails before any ticket is invented', async () => {
  assert.equal(isBotLoginName('Bot07'), true);
  await assert.rejects(
    () => loginOrRegister({
      origin: 'http://127.0.0.1:5080',
      loginName: 'Bot07',
      password: generateSessionPassword(),
      connect() { throw new Error('must not connect'); },
    }),
    (error) => error.code === 'bot_namespace_register_forbidden',
  );
});

test('password and bot-tool claim come from env or this-run generation; nothing is minted as an admission ticket', () => {
  const generated = resolvePassword({ });
  assert.equal(generated.generated, true);
  assert.ok(generated.password.length >= 6);
  const fromEnv = resolvePassword({ [ENV_PASSWORD]: generated.password });
  assert.equal(fromEnv.source, 'env');
  assert.equal(fromEnv.password, generated.password);
  const bot = resolveLoginSecrets('Bot03', { [ENV_PASSWORD]: generated.password, [ENV_BOT_TOOL]: 'dG9vbA' });
  assert.equal(bot.loginName, 'Bot03');
  assert.equal(bot.botToolCredential, 'dG9vbA');
  const source = [
    readFileSync(join(HERE, 'account-client.mjs'), 'utf8'),
    readFileSync(join(HERE, 'bot-credential.mjs'), 'utf8'),
  ].join('\n');
  assert.equal(source.includes('Issue('), false);
  assert.equal(source.includes('Ed25519'), false);
  assert.equal(source.includes('privateKey'), false);
  assert.equal(source.includes('admissionCredential'), true);
});

test('source files do not embed a password literal', () => {
  const source = [
    readFileSync(join(HERE, 'account-client.mjs'), 'utf8'),
    readFileSync(join(HERE, 'bot-credential.mjs'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /password\s*:\s*['"`][^'"`]+['"`]/);
});

test('wrong password is an error and does not overwrite the stored account', async () => {
  const store = createAccountStore();
  const platform = createPlatform(store);
  const password = generateSessionPassword();
  const first = await loginOrRegister({
    origin: 'http://127.0.0.1:5080',
    loginName: 'carol',
    password,
    connect: platform.connect,
  });
  await assert.rejects(
    () => loginOrRegister({
      origin: 'http://127.0.0.1:5080',
      loginName: 'carol',
      password: generateSessionPassword(),
      connect: platform.connect,
    }),
    (error) => error.code === 'wrong_password',
  );
  const again = await loginOrRegister({
    origin: 'http://127.0.0.1:5080',
    loginName: 'carol',
    password,
    connect: platform.connect,
  });
  assert.equal(again.accountId, first.accountId);
  assert.equal(again.accountNewlyCreated, false);
});
