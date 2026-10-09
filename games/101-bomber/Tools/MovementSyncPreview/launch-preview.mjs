import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProcessTools } from '../engine-tools.mjs';
import { hostRid, releaseLayout } from '../engine-release.mjs';
import { runLauncher } from '../launcher.mjs';
import { childEnvironment, protectedSnapshot, reserveAccountPrefix, sameIdentity,
  verifyFinalGate } from './preview-contracts.mjs';
import { createPreviewProcessTools } from './preview-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const identityScript = join(HERE, 'process-identity.ps1');
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const wait = ms => new Promise(done => setTimeout(done, ms));

export function readLaunchInputs(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const { gate, infrastructure, gameRoot, historyRoot, evidenceRoot } = config;
  assert(gate && infrastructure && gameRoot && historyRoot && evidenceRoot, 'preview launch inputs incomplete');
  const seal = verifyFinalGate({ ...gate, infrastructure });
  assert([gameRoot, historyRoot, evidenceRoot].every(path => isAbsolute(path)
    && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)), 'preview roots must be absolute');
  const head = execFileSync('git', ['-C', gameRoot, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(head, seal.gameHead, 'gameHead no longer matches candidate');
  const dsTemplate = JSON.parse(readFileSync(seal.dsConfig, 'utf8'));
  const serverTables = resolve(dirname(seal.dsConfig), dsTemplate.config_dir);
  const clientTables = join(gameRoot, 'Client', 'Config', 'Tables');
  const readSeed = (directory, side) => {
    const rows = JSON.parse(readFileSync(join(directory, side, 'game.json'), 'utf8')).rows;
    assert(Array.isArray(rows) && rows.length === 1 && rows[0].name === 'default', 'selected seed row invalid');
    return rows[0].initial_seed;
  };
  const seed = readSeed(serverTables, 'server');
  assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
    && seed === readSeed(clientTables, 'client'), 'sealed seed exports differ');
  return { config, seal, seed };
}

export async function launchPreview(configPath, { startInfrastructure } = {}) {
  const { config, seal, seed } = readLaunchInputs(configPath);
  const infra = config.infrastructure;
  const signer = process.env.LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX;
  const publicKey = process.env.LUMIO_ACCOUNT_ADMISSION_PUBLIC_KEY_HEX;
  delete process.env.LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX;
  delete process.env.LUMIO_ACCOUNT_ADMISSION_PUBLIC_KEY_HEX;
  delete process.env.LUMIO_ACCOUNT_PASSWORD;
  assert(/^[0-9a-f]{64}$/.test(signer ?? '') && /^[0-9a-f]{64}$/.test(publicKey ?? ''),
    'official signer handoff required');
  const cleanEnv = childEnvironment(process.env);
  const identify = pid => {
    const rows = JSON.parse(execFileSync(config.pwsh ?? 'pwsh',
      ['-NoProfile', '-File', identityScript, '-Pids', String(pid)],
      { encoding: 'utf8', windowsHide: true, env: cleanEnv }));
    assert(Array.isArray(rows) && rows.length === 1, 'owned identity read failed');
    return rows[0];
  };
  const listeners = () => JSON.parse(execFileSync(config.pwsh ?? 'pwsh',
    ['-NoProfile', '-File', identityScript, '-Listeners'],
    { encoding: 'utf8', windowsHide: true, env: cleanEnv }));
  const candidatePorts = Object.values(infra.ports);
  const before = protectedSnapshot(listeners(), candidatePorts);
  const suffix = randomBytes(8).toString('hex');
  const prefix = reserveAccountPrefix(config.historyRoot, suffix);
  const run = join(config.evidenceRoot, `${seal.previewId}-${suffix}`);
  assert(!existsSync(run), 'preview run directory already exists');
  mkdirSync(run, { recursive: true });
  save(join(run, 'prefix.json'), prefix);
  save(join(run, 'ports-before.json'), { previewId: seal.previewId, at: new Date().toISOString(),
    candidatePorts, protected: before });
  let ordinal = 0;
  const secrets = new Set([signer]);
  const redact = value => [...secrets].reduce((text, secret) => secret ? text.replaceAll(secret, '[REDACTED]') : text,
    String(value));
  const receipt = value => save(join(run, `process-${String(++ordinal).padStart(3, '0')}.json`), value);
  const official = await loadProcessTools({ engineRoot: seal.engineRelease });
  const rid = hostRid({ dotnet: infra.dotnet });
  const layout = releaseLayout(seal.engineRelease, rid);
  assert.equal(resolve(layout.engineNative).toLowerCase(), resolve(seal.engineNative).toLowerCase(),
    'sealed Native does not match selected release RID');
  const tools = createPreviewProcessTools(official, {
    officialBotHost: layout.botHost,
    platformDll: infra.platformDll, readIdentity: identify, previewId: seal.previewId,
    record: receipt, onTicket: ticket => secrets.add(ticket),
  });
  const context = { config, seal, infra, run, tools, cleanEnv, signer, publicKey, identify, listeners, before };
  let services;
  let firstFailure;
  try {
    services = await (startInfrastructure ?? startLocalInfrastructure)(context);
    assert.equal(services.origin, `http://127.0.0.1:${infra.ports.platform}`);
    assert.deepEqual(protectedSnapshot(listeners(), []), before, 'protected listeners changed after Platform startup');
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const report = await runLauncher({
        root: config.gameRoot, engineRelease: seal.engineRelease, player: true, playerCount: 2,
        rid,
        dsConfig: seal.dsConfig, seed,
        bots: 6, fleetPerProcess: 1, playerBotScenario: 'movement-sync-preview',
        startPlatform: false, origin: services.origin, expectedGameReleaseId: seal.gameReleaseId,
        spectatorRoot: seal.spectatorRoot, spectatorStaticPort: infra.ports.page,
        scenarioDll: seal.botScenarioDll, evidenceDir: join(run, 'launcher'),
        gameplay: seal.gameplayDll,
        processTools: tools, signal: controller.signal,
        env: { ...cleanEnv, LUMIO_PLATFORM_ADMISSION_KEY: publicKey }, slug: 'bomber',
        loginPrefix: `${prefix.prefix}-Bot`, spectatorLogin: `${prefix.prefix}-`,
        dotnet: infra.dotnet,
      });
      save(join(run, 'launcher-return.json'), { status: report.status, evidence: report.evidence,
        requiredBots: report.requiredBots ?? null, admittedBots: report.admittedBots ?? null,
        players: report.players?.map(({ label, url, loginName }) => ({ label, url, loginName })) ?? [] });
      if (report.status !== 'SERVING') throw new Error(`normal launcher returned ${report.status}: ${report.error ?? ''}`);
      assert.deepEqual(protectedSnapshot(listeners(), []), before, 'protected listeners changed after launcher');
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  } catch (error) {
    firstFailure = error;
    save(join(run, 'first-failure.json'), { at: new Date().toISOString(),
      error: redact(error), stack: error?.stack ? redact(error.stack) : null, previewId: seal.previewId });
  } finally {
    try { await services?.stop(); } catch (error) {
      save(join(run, 'cleanup-failure.json'), { at: new Date().toISOString(), error: redact(error) });
      firstFailure ??= error;
    }
    try {
      const after = protectedSnapshot(listeners(), []);
      save(join(run, 'ports-after.json'), { at: new Date().toISOString(), protected: after });
      assert.deepEqual(after, before, 'protected listeners changed');
    } catch (error) { firstFailure ??= error; }
  }
  if (firstFailure) throw new Error(`Private movement preview failed; see ${run}`);
  return run;
}

async function startLocalInfrastructure({ seal, infra, run, tools, cleanEnv, signer, identify }) {
  const command = (name, executable, args) => {
    const started = new Date().toISOString();
    const result = spawnSync(executable, args, { env: cleanEnv, cwd: run, encoding: 'utf8',
      windowsHide: true, timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(join(run, `${name}.stdout.txt`), result.stdout ?? '', { flag: 'wx' });
    writeFileSync(join(run, `${name}.stderr.txt`), result.stderr ?? '', { flag: 'wx' });
    save(join(run, `${name}.receipt.json`), { started, finished: new Date().toISOString(),
      executable, args, rawExitCode: result.status, signal: result.signal,
      error: result.error ? String(result.error) : null });
    if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.status ?? result.signal ?? result.error}`);
    return result.stdout ?? '';
  };
  const pg = name => join(infra.postgresBin, `${name}.exe`);
  const pgdata = join(run, 'pgdata');
  const pglog = join(run, 'postgres.log');
  command('initdb', pg('initdb'), ['-D', pgdata, '-U', infra.pgRole,
    '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
  let postgresIdentity;
  let platform;
  const stop = async () => {
    let failure;
    if (platform) try { await tools.forceCleanup(platform); } catch (error) { failure ??= error; }
    if (postgresIdentity) try {
      assert(sameIdentity(postgresIdentity, identify(postgresIdentity.pid)), 'PostgreSQL identity mismatch');
      command('pg-stop', pg('pg_ctl'), ['-D', pgdata, '-m', 'fast', '-w', 'stop']);
    } catch (error) { failure ??= error; }
    if (failure) throw failure;
  };
  try {
    command('pg-start', pg('pg_ctl'), ['-D', pgdata, '-l', pglog, '-o',
      `-h 127.0.0.1 -p ${infra.ports.postgres}`, '-w', 'start']);
    const postgresPid = Number(readFileSync(join(pgdata, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0]);
    postgresIdentity = identify(postgresPid);
    save(join(run, 'postgres-identity.json'), { previewId: seal.previewId,
      ...postgresIdentity, pgdata, port: infra.ports.postgres });
    const psql = (name, database, sql) => command(name, pg('psql'), ['-h', '127.0.0.1',
      '-p', String(infra.ports.postgres), '-U', infra.pgRole, '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql]);
    psql('db-create', 'postgres', `CREATE DATABASE ${infra.pgDatabase} OWNER ${infra.pgRole}`);
    const origin = `http://127.0.0.1:${infra.ports.platform}`;
    const platformEnv = { ...cleanEnv,
      PLATFORM_DB_CONNECTION_STRING: `Host=127.0.0.1;Port=${infra.ports.postgres};Database=${infra.pgDatabase};Username=${infra.pgRole}`,
      PLATFORM_LISTEN_URL: origin, PLATFORM_PUBLIC_ORIGIN: origin,
      PLATFORM_GAMES_ROOT: infra.gamesRoot, PLATFORM_REGISTRATION_PROFILE: 'test',
      LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX: signer, LUMIO_ACCOUNT_ADMISSION_KEY_ID: '1',
      LUMIO_ACCOUNT_BOT_TOOL_PUBLIC_KEY_HEX: '0'.repeat(64) };
    for (const [key, value] of Object.entries(infra.allocation.fields))
      platformEnv[`Platform__Allocations__bomber__${key}`] = String(value);
    platform = tools.startPlatform(infra.dotnet, [infra.platformDll],
      { cwd: infra.platformRoot, log: join(run, 'platform.log'), env: platformEnv });
    const deadline = Date.now() + 120000;
    let ready;
    while (Date.now() < deadline) {
      if (platform.closed || platform.error) throw new Error(`Platform exited before readiness: ${platform.code ?? platform.error}`);
      const line = platform.stdout.split(/\r?\n/).find(value => value.startsWith('PLATFORM_READY '));
      if (line) { ready = JSON.parse(line.slice('PLATFORM_READY '.length)); break; }
      await wait(100);
    }
    assert(ready && ready.port === infra.ports.platform && ready.database === 'postgresql',
      'Platform readiness mismatch');
    save(join(run, 'platform-ready.json'), ready);
    const health = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200, 'Platform health failed');
    const seedStarted = new Date().toISOString();
    psql('game-seed', infra.pgDatabase, "INSERT INTO games(slug,name,summary,cover_url,status,bundle_dir,server_ws_url,subprotocol,contract_id,sort_order,created_at,updated_at) VALUES('bomber','Lumio Bomber','Private movement preview','/games/bomber/cover.svg','published','bomber','','','',1,now(),now())");
    const readback = JSON.parse(psql('seed-readback', infra.pgDatabase,
      "SELECT json_build_object('games',(SELECT coalesce(json_agg(row_to_json(g)),'[]'::json) FROM (SELECT slug,status,bundle_dir,created_at FROM games ORDER BY slug) g),'migrations',(SELECT coalesce(json_agg(\"MigrationId\" ORDER BY \"MigrationId\"),'[]'::json) FROM \"__EFMigrationsHistory\"));").trim());
    assert(Array.isArray(readback.migrations) && readback.migrations.length > 0
      && readback.games?.length === 1 && readback.games[0].slug === 'bomber'
      && readback.games[0].status === 'published' && readback.games[0].bundle_dir === 'bomber'
      && Date.parse(readback.games[0].created_at) >= Date.parse(seedStarted), 'fresh game seed readback invalid');
    save(join(run, 'game-seed-readback.json'), { at: new Date().toISOString(), readback });
    return { origin, stop };
  } catch (error) {
    await stop().catch(cleanup => save(join(run, 'infrastructure-cleanup-failure.json'),
      { at: new Date().toISOString(), error: String(cleanup) }));
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [mode, configPath] = process.argv.slice(2);
  try {
    if (mode === '--verify') readLaunchInputs(configPath);
    else if (mode === '--run') await launchPreview(configPath);
    else throw new Error('usage: launch-preview.mjs --verify|--run <absolute-config.json>');
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
