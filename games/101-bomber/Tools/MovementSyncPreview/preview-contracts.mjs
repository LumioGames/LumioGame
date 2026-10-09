import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex64 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const ordinaryFile = path => isAbsolute(path) && lstatSync(path).isFile();
const canonicalPath = path => resolve(path).toLowerCase();
const cleanAbsolute = path => text(path) && isAbsolute(path) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path);

export function verifyFinalGate({ candidateSealPath, reviewReleasePath, expectedReviewSha256,
  engineRelease, engineNative, expectedGameReleaseId, spectatorRoot, botScenarioDll, gameplayDll,
  serverGameplayDll, dsConfig, gameHead, infrastructure,
  now = Date.now() }) {
  assert(hex64(expectedReviewSha256), 'expected review hash required');
  assert(ordinaryFile(reviewReleasePath) && ordinaryFile(candidateSealPath), 'final receipts must be regular files');
  const reviewBytes = readFileSync(reviewReleasePath);
  assert.equal(sha256(reviewBytes), expectedReviewSha256, 'review hash mismatch');
  const review = JSON.parse(reviewBytes);
  assert.equal(review.kind, 'PRIVATE_MOVEMENT_PREVIEW_SPEC_QUALITY_RELEASE');
  assert.equal(review.spec, 'PASS');
  assert.equal(review.quality, 'APPROVED');
  assert.equal(review.launchReleased, true);
  assert.equal(review.Owner, 'OPEN');
  assert.equal(review.handfeel, 'FAIL_PENDING_USER');
  assert.equal(review.PR280, 'NEVER_MERGE');
  assert(text(review.expiresAt) && Number.isFinite(Date.parse(review.expiresAt))
    && Date.parse(review.expiresAt) > now, 'review expired');
  const sealBytes = readFileSync(candidateSealPath);
  assert.equal(sha256(sealBytes), review.candidateSealSha256, 'candidate seal hash mismatch');
  const seal = JSON.parse(sealBytes);
  assert.equal(seal.kind, 'PRIVATE_MOVEMENT_PREVIEW_CANDIDATE');
  assert.equal(seal.scene, 'movement-sync-preview');
  assert(text(seal.previewId) && text(seal.arm), 'candidate identity required');
  assert(['F1', 'F1_ORIGINAL98_F3'].includes(seal.arm), 'candidate arm invalid');
  assert(/^[0-9a-f]{40}$/.test(seal.gameHead), 'candidate gameHead invalid');
  for (const key of ['previewId', 'arm', 'gameHead']) assert.equal(review[key], seal[key], `${key} mismatch`);
  for (const [key, expected] of Object.entries({ engineRelease, engineNative, gameReleaseId: expectedGameReleaseId,
    spectatorRoot, botScenarioDll, gameplayDll, serverGameplayDll, dsConfig, gameHead })) {
    assert(text(expected), `${key} input required`);
    assert.equal(seal[key], expected, `${key} mismatch`);
  }
  for (const key of ['engineRelease', 'engineNative', 'spectatorRoot', 'botScenarioDll', 'gameplayDll',
    'serverGameplayDll', 'dsConfig'])
    assert(cleanAbsolute(seal[key]), `${key} must be absolute`);
  assert(infrastructure && typeof infrastructure === 'object', 'infrastructure input required');
  assert.deepEqual(seal.infrastructure, infrastructure, 'infrastructure mismatch');
  for (const key of ['platformDll', 'platformRoot', 'postgresBin', 'dotnet', 'gamesRoot'])
    assert(cleanAbsolute(infrastructure[key]), `infrastructure ${key} invalid`);
  assert.equal(infrastructure.platformSource, 'a68f57d1661d31136ff17c66ae5f0552c408fc57',
    'Platform source identity mismatch');
  assert(resolve(infrastructure.platformDll).startsWith(resolve(infrastructure.platformRoot) + sep),
    'platform DLL outside platform root');
  assert(/^[a-z][a-z0-9_]*$/.test(infrastructure.pgRole)
    && /^[a-z][a-z0-9_]*$/.test(infrastructure.pgDatabase), 'PostgreSQL identity invalid');
  assert(infrastructure.ports && Object.values(infrastructure.ports).length === 4
    && Object.values(infrastructure.ports).every(port => Number.isInteger(port) && port > 1024 && port <= 65535)
    && new Set(Object.values(infrastructure.ports)).size === 4, 'infrastructure ports invalid');
  assert(!Object.values(infrastructure.ports).some(port => PROTECTED_PORTS.includes(port)), 'protected port selected');
  const fields = infrastructure.allocation?.fields;
  const bindingKeys = ['AllocationId', 'WsUrl', 'Subprotocol', 'ServerAudience', 'GameId',
    'GameReleaseId', 'ContractId', 'RoomId', 'NotAfter', 'LocalTest'];
  assert(infrastructure.allocation?.slug === 'bomber' && fields
    && Object.keys(fields).sort().join(',') === bindingKeys.sort().join(',')
    && bindingKeys.every(key => text(String(fields[key] ?? '')))
    && fields.GameId === 'bomber' && fields.GameReleaseId === expectedGameReleaseId
    && new URL(fields.WsUrl).hostname === '127.0.0.1'
    && Number(new URL(fields.WsUrl).port) === infrastructure.ports.ds
    && Number(fields.NotAfter) > Math.floor(now / 1000)
    && String(fields.LocalTest).toLowerCase() === 'true', 'allocation binding invalid');
  assert(Array.isArray(seal.files) && seal.files.length > 0, 'candidate artifact list required');
  const canonical = new Set();
  for (const file of seal.files) {
    assert(cleanAbsolute(file?.path) && !canonical.has(canonicalPath(file.path)),
      'duplicate or invalid artifact path');
    canonical.add(canonicalPath(file.path));
    assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && hex64(file.sha256), 'artifact metadata invalid');
    assert(ordinaryFile(file.path), `artifact is not an ordinary file: ${file.path}`);
    const bytes = readFileSync(file.path);
    assert.equal(bytes.length, file.bytes, `artifact bytes mismatch: ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `artifact hash mismatch: ${file.path}`);
  }
  const hasFile = path => canonical.has(canonicalPath(path));
  assert(hasFile(seal.botScenarioDll), 'Bot scenario artifact missing from candidate');
  const template = JSON.parse(readFileSync(seal.dsConfig, 'utf8'));
  assert(template.transport?.listen_address === '127.0.0.1'
    && template.transport?.listen_port === infrastructure.ports.ds
    && canonicalPath(resolve(dirname(seal.dsConfig), template.clr?.registry_assembly ?? ''))
      === canonicalPath(seal.serverGameplayDll),
  'selected DS template does not bind sealed server Gameplay or private port');
  for (const required of [infrastructure.platformDll, infrastructure.dotnet,
    join(infrastructure.platformRoot, 'BouncyCastle.Cryptography.dll'),
    join(infrastructure.platformRoot, 'Lumio.Platform.Account.dll'),
    ...['initdb.exe', 'pg_ctl.exe', 'psql.exe'].map(name => join(infrastructure.postgresBin, name)),
    join(infrastructure.gamesRoot, 'bomber', 'index.html'), join(seal.spectatorRoot, 'index.html'),
    seal.gameplayDll, seal.serverGameplayDll, seal.dsConfig, seal.engineNative])
    assert(hasFile(required), `required artifact missing from candidate: ${required}`);
  return seal;
}

export function reserveAccountPrefix(historyRoot, suffix) {
  assert(/^[0-9a-f]{8,32}$/.test(suffix), 'prefix suffix invalid');
  const prefix = `MoveLab-${suffix}`;
  const loginNames = ['A', 'B', 'Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5', 'Bot6'].map(label => `${prefix}-${label}`);
  const scanned = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.startsWith('prefix') && entry.name.endsWith('.json')) {
        assert(entry.isFile(), `prefix receipt is not a regular file: ${file}`);
        const bytes = readFileSync(file);
        scanned.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
        const prior = JSON.parse(bytes);
        const values = [];
        const collect = value => {
          if (typeof value === 'string') values.push(value);
          else if (Array.isArray(value)) value.forEach(collect);
          else if (value && typeof value === 'object') Object.values(value).forEach(collect);
        };
        collect(prior);
        assert(!values.some(value => value === prefix || loginNames.includes(value)), 'prefix collision');
      }
    }
  };
  visit(historyRoot);
  return { kind: 'MOVEMENT_PREVIEW_PREFIX_RESERVED_NOT_REGISTERED', createdUtc: new Date().toISOString(),
    prefix, loginNames, scanned: scanned.sort((a, b) => a.path.localeCompare(b.path)),
    accountsRegistered: false, passwordPersisted: false };
}

export const PROTECTED_PORTS = Object.freeze([18081, 18082, 18084, 18085, 18092, 18093, 18094, 18095, 18096, 18097]);

export function protectedSnapshot(rows, candidatePorts) {
  assert(Array.isArray(rows) && Array.isArray(candidatePorts), 'listener inventory invalid');
  assert(!candidatePorts.some(port => PROTECTED_PORTS.includes(port)), 'candidate overlaps protected port');
  assert(!rows.some(row => candidatePorts.includes(row.localPort)), 'candidate port occupied');
  const protectedRows = rows.filter(row => PROTECTED_PORTS.includes(row.localPort));
  for (const row of protectedRows)
    assert(row.identityAvailable === true && Number.isInteger(row.pid) && row.pid > 0
      && Number.isFinite(Date.parse(row.startTime)) && text(row.exe), 'protected listener identity unavailable');
  return protectedRows.sort((a, b) => a.localPort - b.localPort || a.pid - b.pid);
}

export function sameIdentity(expected, actual) {
  return expected?.pid === actual?.pid && expected?.startTime === actual?.startTime
    && expected?.exe === actual?.exe && Number.isInteger(expected?.pid) && expected.pid > 0
    && text(expected?.startTime) && text(expected?.exe);
}

const secretKey = key => /^(?:PLATFORM_|Platform__|LUMIO_|PG|LumioBot)/i.test(key);
const allowedGameEnv = new Set(['LUMIO_BOMBER_BOT_INDEX', 'LUMIO_BOMBER_BOT_COUNT',
  'LUMIO_BOMBER_HUMAN_PARTICIPANTS', 'LUMIO_BOT_WIRE_PROFILE']);

export function childEnvironment(inherited, additions = {}) {
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !secretKey(key)));
  for (const [key, value] of Object.entries(additions)) {
    assert(!secretKey(key) || allowedGameEnv.has(key), `child environment secret forbidden: ${key}`);
    env[key] = String(value);
  }
  return env;
}

export function scrubBotTicket(executable, args, environment, officialBotHost) {
  const ticketAt = args.indexOf('--admission-ticket');
  assert(ticketAt > 0 && ticketAt + 1 < args.length && args[0] === officialBotHost
    && args.filter(arg => arg === '--admission-ticket').length === 1,
  'ticket interception requires recognized official Bot child');
  const ticket = args[ticketAt + 1];
  assert(text(ticket), 'Bot ticket required');
  return { executable, args: args.filter((_, index) => index !== ticketAt && index !== ticketAt + 1),
    env: { ...environment, LumioBotAdmissionTicket: ticket } };
}
