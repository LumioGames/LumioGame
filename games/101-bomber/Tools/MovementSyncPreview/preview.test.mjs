import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyFinalGate, reserveAccountPrefix, protectedSnapshot, sameIdentity,
  scrubBotTicket, childEnvironment } from './preview-contracts.mjs';
import { createPreviewProcessTools } from './preview-process.mjs';
import * as launchPreview from './launch-preview.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const later = () => new Date(Date.now() + 60_000).toISOString();

test('final gate binds review bytes, candidate and every regular artifact before effects', () => {
  const root = mkdtempSync(join(tmpdir(), 'preview-gate-'));
  try {
    const artifact = join(root, 'bots.dll');
    writeFileSync(artifact, 'built');
    const gameplayDll = join(root, 'gameplay.dll');
    writeFileSync(gameplayDll, 'gameplay');
    const serverGameplayDll = join(root, 'server-gameplay.dll');
    writeFileSync(serverGameplayDll, 'server-gameplay');
    const dsConfig = join(root, 'server.json');
    writeFileSync(dsConfig, JSON.stringify({ transport: { listen_address: '127.0.0.1', listen_port: 19083 },
      clr: { registry_assembly: serverGameplayDll } }));
    for (const dir of ['platform', 'postgres', 'games/bomber', 'wwwroot', 'engine/server/win-x64/SDK/Native/win-x64'])
      mkdirSync(join(root, dir), { recursive: true });
    const engineNative = join(root, 'engine/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll');
    writeFileSync(engineNative, 'native');
    const infrastructure = { platformDll: join(root, 'platform', 'lumio-platform.dll'),
      platformRoot: join(root, 'platform'), postgresBin: join(root, 'postgres'), dotnet: join(root, 'dotnet.exe'),
      gamesRoot: join(root, 'games'), ports: { platform: 19081, postgres: 19082, ds: 19083, page: 19084 },
      platformSource: 'a68f57d1661d31136ff17c66ae5f0552c408fc57',
      pgRole: 'preview', pgDatabase: 'preview', allocation: { slug: 'bomber', fields: {
        AllocationId: 'allocation', WsUrl: 'ws://127.0.0.1:19083/bomber', Subprotocol: 'lumio.mvp.v0',
        ServerAudience: 'private', GameId: 'bomber', GameReleaseId: 'release',
        ContractId: 'lumio.gameplay-envelope.v1', RoomId: 'room', NotAfter: '4102444800', LocalTest: 'true' } } };
    const required = [infrastructure.platformDll, infrastructure.dotnet,
      join(infrastructure.platformRoot, 'BouncyCastle.Cryptography.dll'),
      join(infrastructure.platformRoot, 'Lumio.Platform.Account.dll'),
      ...['initdb.exe', 'pg_ctl.exe', 'psql.exe'].map(name => join(infrastructure.postgresBin, name)),
      join(infrastructure.gamesRoot, 'bomber', 'index.html'), join(root, 'wwwroot', 'index.html')];
    for (const file of required) writeFileSync(file, 'x');
    const seal = { kind: 'PRIVATE_MOVEMENT_PREVIEW_CANDIDATE', previewId: 'one', arm: 'F1',
      gameHead: 'a'.repeat(40), engineRelease: join(root, 'engine'), engineNative, gameReleaseId: 'release',
      spectatorRoot: join(root, 'wwwroot'), botScenarioDll: artifact, gameplayDll,
      serverGameplayDll, dsConfig, scene: 'movement-sync-preview', infrastructure,
      files: [artifact, gameplayDll, serverGameplayDll, dsConfig, engineNative, ...required].map(path => ({
        path: path === artifact ? path.replaceAll('\\', '/') : path, bytes: readFileSync(path).length,
        sha256: hash(readFileSync(path)) })) };
    const candidateSealPath = join(root, 'seal.json');
    writeFileSync(candidateSealPath, JSON.stringify(seal));
    const review = { kind: 'PRIVATE_MOVEMENT_PREVIEW_SPEC_QUALITY_RELEASE', previewId: 'one', arm: 'F1',
      gameHead: seal.gameHead, candidateSealSha256: hash(readFileSync(candidateSealPath)),
      spec: 'PASS', quality: 'APPROVED', launchReleased: true,
      expiresAt: new Date(Date.now() + 60000).toISOString(), Owner: 'OPEN',
      handfeel: 'FAIL_PENDING_USER', PR280: 'NEVER_MERGE' };
    const reviewReleasePath = join(root, 'review.json');
    writeFileSync(reviewReleasePath, JSON.stringify(review));
    const inputs = { candidateSealPath, reviewReleasePath, expectedReviewSha256: hash(readFileSync(reviewReleasePath)),
      engineRelease: seal.engineRelease, engineNative, expectedGameReleaseId: 'release', spectatorRoot: seal.spectatorRoot,
      botScenarioDll: artifact, gameplayDll, serverGameplayDll, dsConfig,
      gameHead: seal.gameHead, infrastructure };
    assert.equal(verifyFinalGate(inputs).previewId, 'one');
    writeFileSync(artifact, 'changed');
    assert.throws(() => verifyFinalGate(inputs), /artifact/);
    writeFileSync(artifact, 'built');
    assert.throws(() => verifyFinalGate({ ...inputs, expectedReviewSha256: '0'.repeat(64) }), /review hash/);
    assert.throws(() => verifyFinalGate({ ...inputs, gameHead: 'b'.repeat(40) }), /gameHead/);
    for (const ports of [
      { platform: 19081, postgres: 19082, ds: 19083, other: 19084 },
      { platform: 19081, postgres: 19082, ds: 19083 },
      { platform: 19081, postgres: 19082, ds: 19083, page: 19084, other: 19085 },
    ]) {
      const changed = { ...infrastructure, ports };
      seal.infrastructure = changed;
      writeFileSync(candidateSealPath, JSON.stringify(seal));
      review.candidateSealSha256 = hash(readFileSync(candidateSealPath));
      writeFileSync(reviewReleasePath, JSON.stringify(review));
      assert.throws(() => verifyFinalGate({ ...inputs, infrastructure: changed,
        expectedReviewSha256: hash(readFileSync(reviewReleasePath)) }), /infrastructure ports invalid/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed first child identity remains owned, recovers once, and refuses later mismatch', async () => {
  const calls = [];
  const child = { child: { pid: 42 }, closed: false };
  const original = new Error('first identity read failed');
  let identity;
  let reads = 0;
  const tools = createPreviewProcessTools({ startLogged: () => {
    identity = { pid: 42, startTime: now(), exe: 'C:/dotnet.exe' };
    return child;
  },
    async forceCleanup() { calls.push('stop'); } }, {
    readIdentity: () => {
      if (++reads === 1) throw original;
      if (reads === 2) return { ...identity, exe: 'C:/unrelated.exe' };
      if (reads === 4) return { ...identity, startTime: later() };
      return identity;
    },
    previewId: 'one', record: value => calls.push(value),
  });
  assert.throws(() => tools.startLogged('C:/dotnet.exe', ['x'], { cwd: 'C:/owned' }), error => error === original);
  assert.equal(calls.some(value => value.kind === 'MOVEMENT_PREVIEW_PROCESS_IDENTITY_UNAVAILABLE'
    && value.retainedOwnedStart === true), true);
  await assert.rejects(tools.cleanupRetained(), /identity mismatch/);
  assert.equal(calls.includes('stop'), false);
  await tools.cleanupRetained();
  assert.equal(calls.includes('stop'), true);
  assert.equal(reads, 5);
  assert.equal(calls.some(value => value.kind === 'MOVEMENT_PREVIEW_OWNED_PROCESS_IDENTITY_RECOVERED'), true);
});

test('persistent child identity failure retains cleanup failure and original start error', async () => {
  const original = new Error('first identity read failed');
  const calls = [];
  const tools = createPreviewProcessTools({ startLogged: () => ({ child: { pid: 42 }, closed: false }),
    async forceCleanup() { calls.push('stop'); } }, {
    readIdentity: () => { throw original; }, previewId: 'one', record: value => calls.push(value),
  });
  assert.throws(() => tools.startLogged('C:/dotnet.exe', ['x'], {}), error => error === original);
  await assert.rejects(tools.cleanupRetained(), /identity unavailable/);
  assert.equal(calls.includes('stop'), false);
  assert.equal(calls.some(value => value.kind === 'MOVEMENT_PREVIEW_PROCESS_CLEANUP_FAILED'), true);
});

test('PostgreSQL first identity failure retains start and recovers before exact-triplet stop', async () => {
  const events = [];
  const original = new Error('first PostgreSQL identity read failed');
  const expected = { pid: 54, startTime: now(), exe: 'C:/postgres.exe' };
  let reads = 0;
  let current = expected;
  const pg = launchPreview.createPostgresOwnership({ readPid: () => 54,
    expectedExe: 'C:/postgres.exe',
    identify: () => {
      if (++reads === 1) throw original;
      if (reads === 2) return { ...current, exe: 'C:/unrelated.exe' };
      return current;
    },
    stop: () => events.push('stop'), record: value => events.push(value), previewId: 'one' });
  pg.markStarted({ started: expected.startTime, finished: now() });
  assert.throws(() => pg.captureIdentity(), error => error === original);
  assert.equal(events.some(value => value.kind === 'MOVEMENT_PREVIEW_POSTGRES_IDENTITY_UNAVAILABLE'
    && value.retainedOwnedStart === true), true);
  await pg.stop();
  assert.equal(events.includes('stop'), true);
  assert.equal(reads, 4);
  assert.equal(events.some(value => value.kind === 'MOVEMENT_PREVIEW_POSTGRES_IDENTITY_RECOVERED'), true);
});

test('PostgreSQL refuses identity mismatch and preserves persistent recovery failure', async () => {
  const expected = { pid: 54, startTime: now(), exe: 'C:/postgres.exe' };
  let current = expected;
  let stops = 0;
  const pg = launchPreview.createPostgresOwnership({ readPid: () => 54, identify: () => current,
    expectedExe: 'C:/postgres.exe', stop: () => { stops++; } });
  pg.markStarted({ started: expected.startTime, finished: now() });
  pg.captureIdentity();
  current = { ...expected, startTime: later() };
  await assert.rejects(pg.stop(), /identity mismatch/);
  assert.equal(stops, 0);
  const persistent = launchPreview.createPostgresOwnership({ readPid: () => 54,
    identify: () => { throw new Error('unavailable'); }, expectedExe: 'C:/postgres.exe',
    stop: () => { stops++; } });
  persistent.markStarted({ started: now(), finished: now() });
  await assert.rejects(persistent.stop(), /identity unavailable/);
  assert.equal(stops, 0);
});

test('PostgreSQL recovery refuses a replacement PID after the first PID was retained', async () => {
  const events = [];
  const startTime = now();
  let pid = 54;
  let stops = 0;
  const pg = launchPreview.createPostgresOwnership({ readPid: () => pid,
    identify: () => { throw new Error('first identity unavailable'); },
    expectedExe: 'C:/postgres.exe', stop: () => { stops++; }, record: row => events.push(row) });
  pg.markStarted({ started: startTime, finished: now() });
  assert.throws(() => pg.captureIdentity(), /first identity unavailable/);
  pid = 55;
  await assert.rejects(pg.stop(), /PID mismatch/);
  assert.equal(stops, 0);
  assert.equal(events.some(row => row.kind === 'MOVEMENT_PREVIEW_POSTGRES_CLEANUP_FAILED'
    && row.originalPid === 54 && row.retainedOwnedStart), true);
});

test('PostgreSQL recovery refuses the original PID with a later start time', async () => {
  let stops = 0;
  let reads = 0;
  const startTime = now();
  const pg = launchPreview.createPostgresOwnership({ readPid: () => 54,
    identify: () => {
      if (++reads === 1) throw new Error('first identity unavailable');
      return { pid: 54, startTime: later(), exe: 'C:/postgres.exe' };
    }, expectedExe: 'C:/postgres.exe', stop: () => { stops++; } });
  pg.markStarted({ started: startTime, finished: now() });
  assert.throws(() => pg.captureIdentity(), /first identity unavailable/);
  await assert.rejects(pg.stop(), /start time outside original launch window/);
  assert.equal(stops, 0);
});

test('PostgreSQL repeated capture cannot replace an established identity', async () => {
  const startTime = now();
  const original = { pid: 54, startTime, exe: 'C:/postgres.exe' };
  let current = original;
  let stops = 0;
  const pg = launchPreview.createPostgresOwnership({ readPid: () => 54,
    identify: () => current, expectedExe: original.exe, stop: () => { stops++; } });
  pg.markStarted({ started: startTime, finished: now() });
  assert.deepEqual(pg.captureIdentity(), original);
  current = { ...original, startTime: later() };
  assert.throws(() => pg.captureIdentity(), /identity mismatch/);
  await assert.rejects(pg.stop(), /identity mismatch/);
  assert.equal(stops, 0);
  current = original;
  await pg.stop();
  assert.equal(stops, 1);
});

test('child recovery refuses same PID and executable with a later start time', async () => {
  const events = [];
  let reads = 0;
  const state = { child: { pid: 42 }, closed: false };
  const tools = createPreviewProcessTools({ startLogged: () => state,
    async forceCleanup() { events.push('stop'); } }, { readIdentity: () => {
      if (++reads === 1) throw new Error('first identity unavailable');
      return { pid: 42, startTime: later(), exe: 'C:/dotnet.exe' };
    }, record: row => events.push(row) });
  assert.throws(() => tools.startLogged('C:/dotnet.exe', [], {}), /first identity unavailable/);
  await assert.rejects(tools.cleanupRetained(), /start time outside original launch window/);
  assert.equal(events.includes('stop'), false);
  assert.equal(events.some(row => row.kind === 'MOVEMENT_PREVIEW_PROCESS_CLEANUP_FAILED'
    && row.retainedOwnedStart), true);
});

test('child recovery refuses identity after original handle closes', async () => {
  const events = [];
  const state = { child: { pid: 42 }, closed: false };
  let reads = 0;
  const tools = createPreviewProcessTools({ startLogged: () => state,
    async forceCleanup() { events.push('stop'); } }, { readIdentity: () => {
      if (++reads === 1) throw new Error('first identity unavailable');
      return { pid: 42, startTime: now(), exe: 'C:/dotnet.exe' };
    }, record: row => events.push(row) });
  assert.throws(() => tools.startLogged('C:/dotnet.exe', [], {}), /first identity unavailable/);
  state.closed = true;
  await assert.rejects(tools.cleanupRetained(), /original child handle closed/);
  assert.equal(events.includes('stop'), false);
  assert.equal(events.some(row => row.kind === 'MOVEMENT_PREVIEW_PROCESS_CLEANUP_FAILED'
    && row.retainedOwnedStart), true);
});

test('prefix receipt scans exact regular prefix files and refuses a collision', () => {
  const root = mkdtempSync(join(tmpdir(), 'preview-prefix-'));
  try {
    mkdirSync(join(root, 'old'));
    const old = join(root, 'old', 'prefix-old.json');
    writeFileSync(old, '{"prefix":"Old"}');
    const receipt = reserveAccountPrefix(root, '12345678');
    assert.deepEqual(receipt.loginNames.map(x => x.slice(-1)), ['A', 'B', '1', '2', '3', '4', '5', '6']);
    assert.equal(receipt.scanned.length, 1);
    assert.equal(receipt.scanned[0].path, old);
    assert.equal(receipt.scanned[0].sha256, hash(readFileSync(old)));
    writeFileSync(join(root, 'prefix-collision.json'), JSON.stringify({ name: receipt.loginNames[0] }));
    assert.throws(() => reserveAccountPrefix(root, '12345678'), /collision/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('protected listeners require identity and cleanup requires exact triplet', () => {
  const row = { pid: 12, localPort: 18085, localAddress: '127.0.0.1',
    identityAvailable: true, startTime: '2026-10-09T00:00:00Z', exe: 'C:/owned.exe' };
  assert.equal(protectedSnapshot([row], [19080]).length, 1);
  assert.throws(() => protectedSnapshot([{ ...row, identityAvailable: false }], []), /identity/);
  assert.throws(() => protectedSnapshot([row], [18085]), /protected port/);
  assert.equal(sameIdentity(row, { ...row }), true);
  assert.equal(sameIdentity(row, { ...row, startTime: '2026-10-10T00:00:00Z' }), false);
});

test('only recognized official Bot child receives ticket in its selected env', () => {
  const bot = 'C:/release/Lumio.Client.Bot.Host.dll';
  const args = [bot, '--server', 'ws://127.0.0.1:19080', '--admission-ticket', 'secret', '--scenario-name', 'Scenario'];
  const clean = childEnvironment({ PATH: 'path', LUMIO_ACCOUNT_PASSWORD: 'inherited', PLATFORM_TOKEN: 'inherited' },
    { LUMIO_BOMBER_BOT_INDEX: '0' });
  const result = scrubBotTicket('C:/dotnet.exe', args, clean, bot);
  assert.equal(result.args.includes('secret'), false);
  assert.equal(result.env.LumioBotAdmissionTicket, 'secret');
  assert.equal(result.env.LUMIO_ACCOUNT_PASSWORD, undefined);
  assert.equal(result.env.PLATFORM_TOKEN, undefined);
  assert.throws(() => scrubBotTicket('C:/dotnet.exe', args, clean, 'C:/wrong.dll'), /official Bot/);
});

test('owned process adapter scrubs official ticket and refuses changed PID identity on cleanup', async () => {
  const bot = 'C:/release/Lumio.Client.Bot.Host.dll';
  const calls = [];
  let identity;
  let current;
  const official = { startLogged(exe, args, options) {
    calls.push({ exe, args, options });
    identity = { pid: 42, startTime: now(), exe: 'C:/dotnet.exe' };
    current = identity;
    return { child: { pid: 42 }, closed: false };
  }, async forceCleanup() { calls.push('stop'); }, command() {}, assertAlive() {}, waitExit() {} };
  const adapter = createPreviewProcessTools(official, { officialBotHost: bot, readIdentity: () => current,
    previewId: 'one', record: value => calls.push(value) });
  const state = adapter.startLogged('C:/dotnet.exe', [bot, '--admission-ticket', 'secret'],
    { cwd: 'C:/release', log: 'C:/log', env: { PATH: 'path', LUMIO_ACCOUNT_PASSWORD: 'inherited' } });
  assert.equal(calls[0].args.includes('secret'), false);
  assert.equal(calls[0].options.env.LumioBotAdmissionTicket, 'secret');
  assert.equal(calls[0].options.env.LUMIO_ACCOUNT_PASSWORD, undefined);
  assert.equal(calls[1].pid, 42);
  current = { ...identity, startTime: later() };
  await assert.rejects(adapter.forceCleanup(state), /identity/);
  assert.equal(calls.includes('stop'), false);
  current = identity;
  await adapter.forceCleanup(state);
  assert.equal(calls.includes('stop'), true);
});

test('only the official Bot retains its config directory while inherited secrets stay scrubbed', () => {
  const bot = 'C:/release/Lumio.Client.Bot.Host.dll';
  const calls = [];
  let identity;
  const official = { startLogged(exe, args, options) {
    calls.push({ exe, args, options });
    identity = { pid: 42, startTime: now(), exe: 'C:/dotnet.exe' };
    return { child: { pid: 42 }, closed: false };
  }, command() {}, assertAlive() {}, waitExit() {}, async forceCleanup() {} };
  const adapter = createPreviewProcessTools(official, { officialBotHost: bot,
    readIdentity: () => identity,
    previewId: 'one' });
  const env = { PATH: 'path', LumioBotConfigDirectory: 'C:/owned-config',
    LumioBotAdmissionTicket: 'inherited-ticket', LUMIO_ACCOUNT_PASSWORD: 'inherited-password',
    LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX: 'inherited-key', PLATFORM_TOKEN: 'inherited-platform' };
  adapter.startLogged('C:/dotnet.exe', [bot, '--admission-ticket', 'current-ticket'], { env });
  assert.equal(calls[0].options.env.LumioBotConfigDirectory, 'C:/owned-config');
  assert.equal(calls[0].options.env.LumioBotAdmissionTicket, 'current-ticket');
  assert.equal(calls[0].options.env.LUMIO_ACCOUNT_PASSWORD, undefined);
  assert.equal(calls[0].options.env.LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX, undefined);
  assert.equal(calls[0].options.env.PLATFORM_TOKEN, undefined);
  adapter.startLogged('C:/dotnet.exe', ['C:/unrecognized.dll'], { env });
  assert.equal(calls[1].options.env.LumioBotConfigDirectory, undefined);
  assert.equal(calls[1].options.env.LumioBotAdmissionTicket, undefined);
});
