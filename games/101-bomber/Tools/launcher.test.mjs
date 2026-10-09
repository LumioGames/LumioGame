import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadProcessTools, processToolsPath } from './engine-tools.mjs';
import { engineDir, hostRid, releaseLayout } from './engine-release.mjs';
import {
  collectLaunchTickets,
  botScenarioSelection,
  assertLegacyMapSelection,
  startReleasePlatform,
  choosePlatformHostPort,
  DEFAULT_SPECTATOR_LOGIN,
  injectSpectatorLaunch,
  normalizeSpectatorPageUrl,
  parseBotAdmit,
  parseLaunchArgs,
  planLaunchLogins,
  resolveBotVoxelConfig,
  resolveTourBudget,
  runLauncher,
  startSpectatorHost,
} from './launcher.mjs';
import { DS_CLR_INPUTS } from './ds-config.mjs';
import {
  formatStep,
  judgeTourSteps,
  gameplayEvents,
  parseLogfmt,
  planBotLogins,
  scenarioVerdict,
  parseBotResult,
  TOUR_ASSERTIONS,
  TOUR_SCENARIO,
  TOUR_STEPS,
} from './tour-steps.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FROZEN_DS_CONFIG = JSON.parse(readFileSync(new URL('../Server/Config/Startup/server.json', import.meta.url), 'utf8'));

test('movement preview selects only its explicit Bot scenario', () => {
  assert.equal(botScenarioSelection({ player: true, index: 0, scenarioDll: 'bots.dll' }).scenarioName,
    'Lumio.Bomber.Bots.BomberPlayScenario');
  assert.equal(botScenarioSelection({ player: true, index: 0, scenarioDll: 'bots.dll',
    playerBotScenario: 'movement-sync-preview' }).scenarioName,
    'Lumio.Bomber.Bots.MovementSyncPreviewScenario');
  assert.throws(() => botScenarioSelection({ player: true, index: 0, scenarioDll: 'bots.dll',
    playerBotScenario: 'other' }), /playerBotScenario/);
  assert.throws(() => botScenarioSelection({ player: false, index: 0, scenarioDll: 'bots.dll',
    playerBotScenario: 'movement-sync-preview' }), /playerBotScenario/);
});

test('movement preview rejects all invalid shapes before creating a run folder', async () => {
  const invalid = [
    { player: false }, { player: true, playerCount: 1 }, { player: true, bots: 5 },
    { player: true, fleetPerProcess: 2 }, { player: true, spectator: true },
    { player: true, admissionOnly: true }, { player: true, spectatorUrl: 'http://127.0.0.1/' },
    { player: true, playerBotScenario: 'other' },
  ];
  for (const shape of invalid) {
    const root = mkdtempSync(join(tmpdir(), 'lumio-preview-reject-'));
    try {
      await assert.rejects(runLauncher({ root, env: {}, bots: 6, playerCount: 2, fleetPerProcess: 1,
        playerBotScenario: 'movement-sync-preview', ...shape }), /playerBotScenario|movement-sync-preview/);
      assert.equal(existsSync(join(root, '.run')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('launcher preflight keeps custom DS, client, and snapshot selections on the frozen room', () => {
  const root = resolve(HERE, '..');
  const scratch = mkdtempSync(join(tmpdir(), 'bomber-authoring-admission-'));
  const defaultConfig = JSON.parse(readFileSync(join(root, 'Server/Config/Startup/server.json'), 'utf8'));
  const template = join(scratch, 'server.json');
  const frozenMap = join(root, 'Server/Assets/Maps/bomber.voxel');
  const write = config => writeFileSync(template, `${JSON.stringify(config)}\n`);
  const legacy = { ...defaultConfig, config_dir: join(root, 'Server/Config/Tables'), base_map_path: frozenMap };
  write(legacy);
  assert.doesNotThrow(() => assertLegacyMapSelection({ root, dsConfig: template }));
  write({ ...legacy, config_dir: join(root, 'Server/Config/Profiles/m2-map-19') });
  assert.throws(() => assertLegacyMapSelection({ root, dsConfig: template }), /AUTHOR_ONLY_MAP_PROFILE/);
  write(legacy);
  assert.throws(() => assertLegacyMapSelection({ root, dsConfig: template,
    configDir: join(root, 'Client/Config/Tables/profiles/m2-map-23') }), /AUTHOR_ONLY_MAP_PROFILE/);
  write({ ...legacy, base_map_path: join(root, 'Server/Assets/Maps/m2-map-19.voxel') });
  assert.throws(() => assertLegacyMapSelection({ root, dsConfig: template }), /AUTHOR_ONLY_MAP_SNAPSHOT/);
});

test('map admission fails closed with persisted reports before Platform or DS side effects', async context => {
  const cases = [
    ['missing DS template', ({ files }) => rmSync(files.dsConfig), /DS map selection template/, 'BLOCKED_ENV'],
    ['missing base_map_path with an M2 client', ({ config, options }) => {
      delete config.base_map_path;
      options.configDir = join(HERE, '../Client/Config/Tables/profiles/m2-map-23');
    }, /config_dir and base_map_path are required/, 'FAIL'],
    ['missing config_dir', ({ config }) => { delete config.config_dir; }, /config_dir and base_map_path are required/, 'FAIL'],
    ...['Server', 'Client'].map(end => [`missing ${end} map and game tables`, ({ isolated }) => {
      for (const table of ['map', 'game']) rmSync(join(isolated, end, 'Config/Tables', end.toLowerCase(), `${table}.json`));
    }, /Selected .* map table/, 'BLOCKED_ENV']),
    ['missing frozen snapshot', ({ isolated }) => rmSync(join(isolated, 'Server/Assets/Maps/bomber.voxel')), /Frozen legacy base map/, 'BLOCKED_ENV'],
    ['M2 client with complete DS', ({ options }) => {
      options.configDir = join(HERE, '../Client/Config/Tables/profiles/m2-map-23');
    }, /AUTHOR_ONLY_MAP_PROFILE/, 'FAIL'],
  ];
  for (const [name, mutate, reason, status] of cases) {
    await context.test(name, async subtest => {
      const isolated = mkdtempSync(join(tmpdir(), 'bomber-map-preflight-'));
      subtest.after(() => rmSync(isolated, { recursive: true, force: true }));
      const files = launchFiles(isolated);
      const config = JSON.parse(readFileSync(files.dsConfig, 'utf8'));
      const options = {};
      mutate({ isolated, files, config, options });
      if (existsSync(files.dsConfig)) writeFileSync(files.dsConfig, JSON.stringify(config));
      let sideEffects = 0;
      const unexpected = () => { sideEffects++; throw new Error('unexpected launch side effect'); };
      const evidenceDir = join(isolated, 'evidence');
      const report = await runLauncher({
        root: isolated, env: {}, bots: 1, ...files, ...options, evidenceDir, log() {},
        startPlatform: true, startReleasePlatform: unexpected, loginAndLaunch: unexpected,
        processTools: { command: unexpected, startLogged: unexpected, forceCleanup: unexpected },
      });
      assert.equal(sideEffects, 0);
      assert.equal(report.status, status);
      assert.match(report.error, reason);
      assert.equal(report.steps.length, 14);
      assert.ok(report.steps.slice(2).every(step => step.status === 'BLOCKED_ENV'));
      assert.deepEqual(JSON.parse(readFileSync(join(evidenceDir, 'verification.json'), 'utf8')), report);
    });
  }
});

function admitLine(account = 'Bot1') {
  return [
    `2026-09-08T00:00:00.0000000Z INF tick=1 world=0 lang=cs cat=Lumio.Client.Bot.Host.Connection`,
    `msg="session state changed ${account} Active Connecting established 1 1 True True True"`,
    `account=${account} state=Active previous=Connecting reason=established generation=1`,
    `handshakeBegin=1 baselineAck=True scopeActivated=True runtimeCommitted=True`,
  ].join(' ');
}

function rejectLine(account = 'Bot1') {
  return [
    `2026-09-08T00:00:00.0000000Z INF tick=0 world=0 lang=cs cat=Lumio.Client.Bot.Host.Connection`,
    `msg="session login requested ${account} ws://127.0.0.1:9110/session False"`,
    `account=${account} server=ws://127.0.0.1:9110/session accepted=False`,
  ].join(' ');
}

function faultLine(account = 'Bot1') {
  return [
    `2026-09-08T00:00:00.0000000Z ERR tick=2 world=0 lang=cs cat=Lumio.Client.Bot.Host.Connection`,
    `msg="session state changed ${account} Faulted Connecting session_faulted 1 0 False False False"`,
    `account=${account} state=Faulted previous=Connecting reason=session_faulted generation=1`,
  ].join(' ');
}

function session(name, ticket) {
  return {
    login: { loginName: name, accountId: `acct_${name}` },
    launch: { admissionCredential: ticket, roomId: `room-${name}` },
  };
}

function touch(root, name) {
  const path = join(root, name);
  writeFileSync(path, '');
  return path;
}

function processTools({ evidenceDir, botLogs = [] } = {}) {
  let starts = 0;
  const events = [];
  return {
    events,
    command() { return ''; },
    startLogged(_exe, args = [], { log } = {}) {
      starts += 1;
      events.push({ kind: 'start', at: Date.now(), starts, args: [...args], exe: _exe });
      if (starts === 1) {
        return {
          stdout: 'DS_READY {"pid":1,"endpoint":"ws://127.0.0.1:9110"}\n',
          child: { pid: 1, kill() {} },
          closed: false,
        };
      }
      const index = starts - 2;
      const text = botLogs[index] ?? '';
      if (log) writeFileSync(log, text);
      if (evidenceDir) {
        const botDir = join(evidenceDir, `bot-${index + 1}`);
        mkdirSync(botDir, { recursive: true });
        writeFileSync(join(botDir, '2026-09-08_000.log'), text);
      }
      return {
        stdout: text,
        child: { pid: 10 + index, kill() {} },
        closed: false,
      };
    },
    assertAlive() {},
    waitExit() { return Promise.resolve(); },
    forceCleanup() {
      events.push({ kind: 'cleanup', at: Date.now() });
      return Promise.resolve();
    },
  };
}

/** The game's own CLR input; the engine half comes from the (fake) Engine/ release. */
const CLR_FILES = {
  registry_assembly: 'Lumio.Bomber.Gameplay.Server.dll',
};

/** Layout fields of the release a run reads; each becomes an empty file in the fake tree. */
const ENGINE_FILES = ['dsExe', 'hostEntry', 'hostEntryRuntimeConfig', 'replicationAssembly', 'ecsAssembly', 'engineNative', 'botHost'];

/**
 * An ADR-123 Engine/ tree for this machine's <rid>, already "verified": the shape runLauncher
 * gets back from prepareEngine. Files are empty; process-tools are injected per test.
 */
function fakeEngine(isolated, { rid = hostRid(), platformImage = 'ghcr.io/lumiogames/lumio-platform:0.0.1@sha256:00' } = {}) {
  const dir = join(isolated, 'Engine');
  const layout = releaseLayout(dir, rid);
  for (const key of ENGINE_FILES) {
    mkdirSync(resolve(layout[key], '..'), { recursive: true });
    writeFileSync(layout[key], '');
  }
  const manifest = { formatVersion: 1, version: '0.0.1', platforms: [rid], platformImage, sources: {}, files: {} };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  return { dir, manifest, rid, initialized: false, layout };
}

function runnableDsConfig() {
  return {
    clr: {
      ...CLR_FILES,
      kernel_config: { maxContexts: 64, maxHandles: 4096, maxNativeBytes: 67108864, maxJobsQueued: 256, maxJobsRunning: 4, maxCompletionItems: 1024, logMailboxCapacity: 8192 },
    },
    checkpoint_seconds: 30,
    logging: { dir: 'logs', min_level: 'info' },
    config_dir: 'Server/Config/Tables',
    base_map_path: 'Server/Assets/Maps/bomber.voxel',
    base_map_id: FROZEN_DS_CONFIG.base_map_id,
    base_map_version: FROZEN_DS_CONFIG.base_map_version,
    base_map_content_sha256: FROZEN_DS_CONFIG.base_map_content_sha256,
    allocation: {
      serverAudience: 'bomber-local',
      gameId: 'bomber',
      gameReleaseId: 'bomber-local',
      contractId: 'bomber-local',
      roomId: 'bomber',
      allocationId: 'bomber-local',
    },
    admission_public_key_hex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
}

/** The committed budget plus its catalog, copied so an isolated root resolves them the same way. */
function voxelBudgetFiles(isolated) {
  const maps = join(isolated, 'Server', 'Assets', 'Maps');
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, 'official-catalog.json'), readFileSync(join(HERE, '..', 'Server', 'Assets', 'Maps', 'official-catalog.json')));
  writeFileSync(join(maps, 'bot-voxel-budget.json'), readFileSync(join(HERE, '..', 'Server', 'Assets', 'Maps', 'bot-voxel-budget.json')));
  return join(maps, 'bot-voxel-budget.json');
}

function frozenMapFiles(isolated) {
  const maps = join(isolated, 'Server', 'Assets', 'Maps');
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, 'bomber.voxel'), readFileSync(join(HERE, '..', 'Server', 'Assets', 'Maps', 'bomber.voxel')));
  for (const [end, side] of [['Server', 'server'], ['Client', 'client']]) {
    const relative = join(end, 'Config', 'Tables', side);
    mkdirSync(join(isolated, relative), { recursive: true });
    for (const table of ['map', 'game']) {
      writeFileSync(join(isolated, relative, `${table}.json`), readFileSync(join(HERE, '..', relative, `${table}.json`)));
    }
    for (const path of [join(end, 'Config', 'Tables', 'manifest.json'), join(relative, 'manifest.json')])
      writeFileSync(join(isolated, path), readFileSync(join(HERE, '..', path)));
  }
}

const SPECTATOR_INDEX = [
  '<!doctype html><html><head>',
  '<script type="importmap">{"imports":{}}</script>',
  '</head><body><script type="module" src="./main.js"></script></body></html>',
].join('\n');

function injectedLaunch(html) {
  const match = html.match(/<script>window\.__lumioLaunch = (.*?);<\/script>/s);
  assert.ok(match, 'served HTML contains the injected launch');
  return JSON.parse(match[1]);
}

/** A stand-in for the published spectator bundle (publish/wwwroot). */
function spectatorBundle(isolated) {
  const root = join(isolated, 'spectator-wwwroot');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.html'), SPECTATOR_INDEX);
  writeFileSync(join(root, 'main.js'), 'export {};\n');
  return root;
}

function launchFiles(isolated) {
  const dsConfig = join(isolated, 'server.json');
  writeFileSync(dsConfig, `${JSON.stringify(runnableDsConfig())}\n`);
  // The run config resolves these against server.json's own directory, so they sit beside it.
  for (const name of Object.values(CLR_FILES)) touch(isolated, name);
  voxelBudgetFiles(isolated);
  frozenMapFiles(isolated);
  return {
    engine: fakeEngine(isolated),
    hostfxr: touch(isolated, 'hostfxr.dll'),
    dsConfig,
    gameplay: touch(isolated, 'Lumio.Bomber.Gameplay.dll'),
  };
}

const BLOCKED_TOUR_STEPS = ['05', '07', '08', '09', '10', '11', '12', '13', '14'];

function assertTourHonesty(report, lines = []) {
  for (const id of BLOCKED_TOUR_STEPS) {
    assert.equal(report.steps.find((step) => step.id === id).status, 'BLOCKED_ENV');
  }
  assert.notEqual(report.steps.find((step) => step.id === '05').status, 'PASS');
  assert.notEqual(report.steps.find((step) => step.id === '14').status, 'PASS');
  const joined = `${JSON.stringify(report)}\n${lines.join('\n')}`;
  assert.doesNotMatch(joined, /local-paint/);
  assert.doesNotMatch(joined, /SetLocalPose/);
  assert.doesNotMatch(joined, /step=0[5-9] status=PASS|step=1[0-4] status=PASS/);
}

test('tour steps are the fourteen bomber.md steps with step=NN labels', () => {
  assert.equal(TOUR_STEPS.length, 14);
  assert.deepEqual(TOUR_STEPS.map((step) => step.id), [
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14',
  ]);
  assert.equal(formatStep('07', 'BLOCKED_ENV', 'waiting'), 'step=07 status=BLOCKED_ENV waiting');
});

test('--bots N plans unique Bot namespace names without reuse', () => {
  assert.deepEqual(planBotLogins(3), ['Bot1', 'Bot2', 'Bot3']);
  assert.equal(new Set(planBotLogins(100)).size, 100);
  assert.throws(() => planBotLogins(0));
});

test('CLI parses --bots and --stagger-ms over environment', () => {
  const options = parseLaunchArgs(['--bots', '8', '--stagger-ms', '40'], { LUMIO_BOTS: '2', LUMIO_STAGGER_MS: '250' });
  assert.equal(options.bots, 8);
  assert.equal(options.staggerMs, 40);
});

test('all launcher entry points reject seeds outside exact uint32 bounds before side effects', async () => {
  for (const seed of [0x100000000, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => parseLaunchArgs(['--seed', String(seed)], {}), /unsigned 32-bit/);
    assert.throws(() => parseLaunchArgs([], { LUMIO_GAME_SEED: String(seed) }), /unsigned 32-bit/);
    await assert.rejects(runLauncher({ seed, env: {} }), /unsigned 32-bit/);
  }
  for (const seed of [0, 1, 0xffffffff]) assert.equal(parseLaunchArgs(['--seed', String(seed)], {}).seed, seed);
});

test('launcher supplies the actual seed export to DS and every client without changing source tables', async context => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-seed-launch-'));
  context.after(() => rmSync(isolated, { recursive: true, force: true }));
  const files = tourFiles(isolated);
  const root = resolve(HERE, '..');
  for (const path of ['Gameplay/Tables', 'Server/Config/Tables', 'Client/Config/Tables'])
    cpSync(join(root, path), join(isolated, path), { recursive: true });
  const dir = resolve(process.env.LUMIO_ENGINE_CANDIDATE_ROOT || engineDir(root));
  files.engine = { dir, rid: hostRid(), layout: releaseLayout(dir, hostRid()), manifest: JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) };
  const tools = tourTools();
  const { report } = await runTour(tools, { isolated, files, seed: 101, bots: 8 });
  assert.equal(report.status, 'PASS', report.error);
  assert.equal(report.seed, 101);
  const ds = JSON.parse(readFileSync(join(isolated, 'evidence/server.boot-1.json'), 'utf8'));
  assert.equal(JSON.parse(readFileSync(join(ds.config_dir, 'server/game.json'), 'utf8')).rows[0].initial_seed, 101);
  const bots = tools.events.filter(event => event.kind === 'start' && event.args.includes('--account-from'));
  assert.equal(bots.length, 8);
  for (const bot of bots) {
    const selected = argValue(bot.args, '--config-dir');
    assert.equal(JSON.parse(readFileSync(join(selected, 'client/game.json'), 'utf8')).rows[0].initial_seed, 101);
    assert.equal(bot.settings.env.LumioBotConfigDirectory, selected);
  }
  assert.equal(report.configSelection.seed, 101);
  assert.equal(report.configSelection.compiled, true);
  assert.match(report.configSelection.releaseManifestSha256, /^[a-f0-9]{64}$/);
  for (const [end, side] of [['Server', 'server'], ['Client', 'client']])
    assert.equal(JSON.parse(readFileSync(join(isolated, end, `Config/Tables/${side}/game.json`), 'utf8')).rows[0].initial_seed, 1);
});

test('parsed DS config selection reaches the actual root template or explicit cwd-relative override', async (context) => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-config-cwd-'));
  const root = join(isolated, 'game');
  const cwd = join(isolated, 'parent');
  const relative = join('Server', 'Config', 'Startup');
  const source = readFileSync(new URL('../Server/Config/Startup/server.json', import.meta.url), 'utf8');
  const committed = JSON.parse(source);
  const rootStartup = join(root, relative);
  const cwdStartup = join(cwd, relative);
  mkdirSync(rootStartup, { recursive: true });
  mkdirSync(cwdStartup, { recursive: true });
  frozenMapFiles(root);
  frozenMapFiles(cwd);
  writeFileSync(join(rootStartup, 'server.json'), source);
  for (const [name, checkpoint] of [['server.json', 11], ['env.json', 41], ['cli.json', 42]]) {
    writeFileSync(join(cwdStartup, name), `${JSON.stringify({ ...committed,
      base_map_path: join(root, 'Server/Assets/Maps/bomber.voxel'), checkpoint_seconds: checkpoint })}\n`);
  }
  for (const startup of [rootStartup, cwdStartup]) {
    const registry = resolve(startup, committed.clr.registry_assembly);
    mkdirSync(resolve(registry, '..'), { recursive: true });
    writeFileSync(registry, '');
  }
  const engine = fakeEngine(root);
  const hostfxr = touch(root, 'hostfxr.dll');
  const originalCwd = process.cwd();
  context.after(() => rmSync(isolated, { recursive: true, force: true }));
  try {
    process.chdir(cwd);
    for (const [name, args, environment, checkpoint, selectedStartup] of [
      ['default', [], {}, committed.checkpoint_seconds, rootStartup],
      ['environment', [], { LUMIO_DS_CONFIG: join(relative, 'env.json') }, 41, cwdStartup],
      ['CLI over environment', ['--ds-config', join(relative, 'cli.json')],
        { LUMIO_DS_CONFIG: join(relative, 'env.json') }, 42, cwdStartup],
    ]) {
      const evidenceDir = join(isolated, `evidence-${name.replaceAll(' ', '-')}`);
      const tools = processTools();
      const report = await runLauncher({
        ...parseLaunchArgs(['--bots', '1', ...args], environment),
        root, env: environment, engine, hostfxr,
        sessions: [session('Bot1', `ticket-${name}`)],
        processTools: tools, evidenceDir, log() {},
      });
      assert.equal(report.steps.find((step) => step.id === '03').status, 'PASS', name);
      assert.ok(tools.events.some((event) => event.kind === 'start' && event.args[0] === '--config'), name);
      const selected = JSON.parse(readFileSync(join(evidenceDir, 'server.boot-1.json'), 'utf8'));
      assert.equal(selected.checkpoint_seconds, checkpoint, name);
      assert.equal(selected.config_dir, resolve(selectedStartup, committed.config_dir), name);
      assert.equal(selected.clr.registry_assembly, resolve(selectedStartup, committed.clr.registry_assembly), name);
    }
  } finally {
    process.chdir(originalCwd);
  }
});

test('parsed default and explicit missing DS configs still fail loudly from another cwd', async (context) => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-missing-config-cwd-'));
  const root = join(isolated, 'game');
  const cwd = join(isolated, 'parent');
  mkdirSync(root, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const engine = fakeEngine(root);
  const hostfxr = touch(root, 'hostfxr.dll');
  const originalCwd = process.cwd();
  context.after(() => rmSync(isolated, { recursive: true, force: true }));
  try {
    process.chdir(cwd);
    for (const [name, args, environment, missing] of [
      ['default', [], {}, join(root, 'Server', 'Config', 'Startup', 'server.json')],
      ['environment', [], { LUMIO_DS_CONFIG: join('missing', 'env.json') }, join('missing', 'env.json')],
      ['CLI', ['--ds-config', join('missing', 'cli.json')],
        { LUMIO_DS_CONFIG: join('missing', 'env.json') }, join('missing', 'cli.json')],
    ]) {
      const tools = processTools();
      const report = await runLauncher({
        ...parseLaunchArgs(['--bots', '1', ...args], environment),
        root, env: environment, engine, hostfxr,
        sessions: [session('Bot1', `ticket-${name}`)],
        processTools: tools,
        evidenceDir: join(isolated, `evidence-${name}`), log() {},
      });
      assert.equal(report.status, 'BLOCKED_ENV', name);
      assert.ok(report.error.includes(`DS map selection template does not point to a file: ${resolve(missing)}`), name);
      assert.equal(tools.events.length, 0, name);
      assert.equal(report.steps.length, 14, name);
    }
  } finally {
    process.chdir(originalCwd);
  }
});

test('removed offline CLI option is rejected even when set to false', () => {
  for (const args of [['--offline'], ['--offline', 'false'], ['--offline=true']]) {
    assert.throws(() => parseLaunchArgs(args, {}), { code: 'USAGE' });
  }
});

test('removed offline environment entry is rejected rather than ignored', () => {
  for (const value of ['1', 'true', 'false', '0', '']) {
    assert.throws(() => parseLaunchArgs([], { LUMIO_OFFLINE: value }), { code: 'USAGE' });
  }
});

for (const [name, options] of [
  ['enabled option', { offline: true }],
  ['disabled option', { offline: false }],
  ['tick option', { offlineTicks: 10 }],
  ['environment entry', { env: { LUMIO_OFFLINE: '1' } }],
]) {
  test(`removed offline ${name} rejects direct calls before creating evidence`, async (context) => {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-reject-offline-'));
    context.after(() => rmSync(isolated, { recursive: true, force: true }));
    const lines = [];
    await assert.rejects(() => runLauncher({
      root: isolated,
      env: {},
      log: (line) => lines.push(line),
      evidenceDir: join(isolated, 'evidence'),
      ...options,
    }), { code: 'USAGE' });
    assert.deepEqual(lines, []);
    assert.deepEqual(readdirSync(isolated), []);
  });
}

for (const [name, args, environment] of [
  ['CLI option', ['--offline'], {}],
  ['environment entry', [], { LUMIO_OFFLINE: '1' }],
]) {
  test(`removed offline ${name} exits nonzero without PASS or Bot evidence`, (context) => {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-reject-offline-cli-'));
    context.after(() => rmSync(isolated, { recursive: true, force: true }));
    const env = { ...process.env };
    delete env.LUMIO_OFFLINE;
    const result = spawnSync(process.execPath, [
      join(HERE, 'launcher.mjs'), ...args,
      '--bots', '8', '--seed', '101', '--evidence-dir', join(isolated, 'evidence'),
    ], { cwd: isolated, env: { ...env, ...environment }, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /offline/i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /status=PASS|VERIFICATION_STATUS=PASS/);
    assert.deepEqual(readdirSync(isolated), []);
  });
}

test('CLI parses --fleet-per-process as an integer, not a leftover string', () => {
  // 回归:numeric 集合曾漏 fleetPerProcess,"20" 留成字符串被整数校验误拒(R-00588 打包压测)。
  assert.equal(parseLaunchArgs(['--fleet-per-process', '20'], {}).fleetPerProcess, 20);
  assert.equal(parseLaunchArgs(['--fleet-per-process', '1'], {}).fleetPerProcess, 1);
  assert.throws(() => parseLaunchArgs(['--fleet-per-process', 'x'], {}), /--fleet-per-process must be an integer/);
  assert.throws(() => parseLaunchArgs(['--fleet-per-process', '0'], {}), /--fleet-per-process must be an integer/);
});

test('CLI parses --gameplay and --duration-ms', () => {
  const options = parseLaunchArgs(['--gameplay', 'Lumio.Bomber.Gameplay.dll', '--duration-ms', '80'], {});
  assert.equal(options.gameplay, 'Lumio.Bomber.Gameplay.dll');
  assert.equal(options.durationMs, 80);
});

test('typed config export can be selected by environment or CLI', () => {
  assert.equal(parseLaunchArgs([], { LUMIO_CONFIG_DIR: 'export/env' }).configDir, 'export/env');
  assert.equal(parseLaunchArgs(['--config-dir', 'export/cli'], { LUMIO_CONFIG_DIR: 'export/env' }).configDir, 'export/cli');
});

test('CLI parses --spectator as a boolean flag without a value', () => {
  const options = parseLaunchArgs(['--bots', '100', '--spectator', '--duration-ms', '80'], {});
  assert.equal(options.bots, 100);
  assert.equal(options.spectator, true);
  assert.equal(options.durationMs, 80);
  assert.equal(options.spectatorLogin, DEFAULT_SPECTATOR_LOGIN);
});

test('CLI parses --spectator-url, --spectator-root and the static port', () => {
  const flagged = parseLaunchArgs(
    ['--spectator-url', 'http://127.0.0.1:8080/games/bomber/'],
    {},
  );
  assert.equal(flagged.spectator, true);
  assert.equal(flagged.spectatorUrl, 'http://127.0.0.1:8080/games/bomber/');
  const fromEnv = parseLaunchArgs(['--spectator'], {
    LUMIO_SPECTATOR_ROOT: 'out/wwwroot',
    LUMIO_SPECTATOR_STATIC_PORT: '9410',
    LUMIO_SPECTATOR_LOGIN: 'Spectator1',
  });
  assert.equal(fromEnv.spectator, true);
  assert.equal(fromEnv.spectatorRoot, 'out/wwwroot');
  assert.equal(fromEnv.spectatorStaticPort, '9410');
  assert.equal(fromEnv.spectatorLogin, 'Spectator1');
  assert.equal(parseLaunchArgs(['--spectator-root', 'cli/wwwroot'], { LUMIO_SPECTATOR_ROOT: 'env' }).spectatorRoot, 'cli/wwwroot');
  assert.throws(() => parseLaunchArgs(['--spectator-static-port', 'x'], {}), /--spectator-static-port/);
  assert.throws(() => parseLaunchArgs(['--spectator-origin', 'http://127.0.0.1:9090'], {}), /unknown option/);
  assert.throws(() => parseLaunchArgs(['--not-a-flag'], {}), /unknown option/);
});

test('default login names are ordinary without a bot-tool credential and Bot* with one (R-00785)', () => {
  // The engine release's Platform compose accepts no bot-tool credential, so a clean-machine run
  // with no LUMIO_BOT_TOOL_CREDENTIAL must not plan Bot* names (they are refused before login).
  assert.equal(parseLaunchArgs([], {}).loginPrefix, 'Player');
  assert.equal(parseLaunchArgs([], { LUMIO_BOT_TOOL_CREDENTIAL: 'abc_DEF-123' }).loginPrefix, 'Bot');
  assert.equal(parseLaunchArgs([], { LUMIO_LOGIN_PREFIX: 'Tour' }).loginPrefix, 'Tour');
  assert.equal(parseLaunchArgs(['--login-prefix', 'Tour'], {}).loginPrefix, 'Tour');
});

test('spectator login is appended after Bot1..BotN and does not collide', () => {
  assert.deepEqual(planLaunchLogins(3, { spectator: true }), ['Bot1', 'Bot2', 'Bot3', 'Spectator1']);
  const hundred = planLaunchLogins(100, { spectator: true });
  assert.equal(hundred.length, 101);
  assert.equal(hundred[99], 'Bot100');
  assert.equal(hundred[100], 'Spectator1');
  assert.equal(new Set(hundred).size, 101);
  assert.throws(
    () => planLaunchLogins(2, { spectator: true, spectatorLogin: 'Bot2' }),
    /collides/,
  );
});

test('an external spectator URL is printed without credentials', () => {
  assert.equal(
    normalizeSpectatorPageUrl('http://user:ticket-secret@127.0.0.1:8/games/bomber?admission=ticket-secret#x'),
    'http://127.0.0.1:8/games/bomber/',
  );
  assert.equal(normalizeSpectatorPageUrl('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080/');
});

test('the launch is injected as window.__lumioLaunch in front of the first script', () => {
  const roomId = ' Room/观众:"</script><b> ';
  const html = injectSpectatorLaunch(SPECTATOR_INDEX, {
    wsUrl: 'ws://127.0.0.1:9110/session',
    subprotocol: 'lumio.mvp.v0',
    admissionCredential: 'ticket-</script><b>',
    roomId,
    extra: 'dropped',
  });
  const injectAt = html.indexOf('window.__lumioLaunch');
  assert.ok(injectAt > 0);
  assert.ok(injectAt < html.indexOf('type="importmap"'));
  assert.ok(injectAt < html.indexOf('src="./main.js"'));
  assert.doesNotMatch(html, /ticket-<\/script>/);
  assert.doesNotMatch(html, /Room\/观众:.*<\/script><b>/);
  assert.doesNotMatch(html, /dropped/);
  assert.deepEqual(injectedLaunch(html), {
    wsUrl: 'ws://127.0.0.1:9110/session',
    subprotocol: 'lumio.mvp.v0',
    admissionCredential: 'ticket-</script><b>',
    roomId,
  });
  assert.throws(() => injectSpectatorLaunch('<html></html>', { wsUrl: 'ws://x' }), /no <script>/);
});

for (const roomId of [undefined, null, '']) {
  test(`launch injection preserves ${String(roomId)} Room without inventing one`, () => {
    const launch = {
      wsUrl: 'ws://127.0.0.1:9110/session?roomId=url-room',
      admissionCredential: 'ticket-spec',
      roomId,
      room: 'untrusted-room',
    };
    const result = injectedLaunch(injectSpectatorLaunch(SPECTATOR_INDEX, launch));
    assert.equal(result.roomId, roomId);
    assert.equal(Object.hasOwn(result, 'roomId'), roomId !== undefined);
    assert.equal(Object.hasOwn(result, 'room'), false);
  });
}

test('the spectator host serves the bundle on loopback with the launch in index.html only', async (context) => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-host-'));
  context.after(() => rmSync(isolated, { recursive: true, force: true }));
  const root = spectatorBundle(isolated);
  writeFileSync(join(isolated, 'outside.txt'), 'outside');
  const launch = {
    wsUrl: 'ws://127.0.0.1:9110/session',
    subprotocol: 'lumio.mvp.v0',
    admissionCredential: 'ticket-spec',
    roomId: 'Room-观众/Case-Sensitive',
  };
  const { server, url } = await startSpectatorHost({ root, port: 0, launch });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.doesNotMatch(url, /ticket-spec/);
    for (const path of ['', 'index.html']) {
      const page = await fetch(new URL(path, url));
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('cache-control'), 'no-store');
      assert.deepEqual(injectedLaunch(await page.text()), launch);
    }
    const script = await fetch(new URL('main.js', url));
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.doesNotMatch(await script.text(), /ticket-spec/);
    assert.equal((await fetch(new URL('missing.js', url))).status, 404);
    assert.equal((await fetch(`${url}%2e%2e%2foutside.txt`)).status, 403);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  }
});

test('process-tools come from Engine/tools only and a missing one is BLOCKED_ENV, not a local helper', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-'));
  assert.equal(processToolsPath(join(isolated, 'Engine')), join(isolated, 'Engine', 'tools', 'process-tools.mjs'));
  await assert.rejects(() => loadProcessTools({ repoRoot: isolated }), (error) => {
    assert.equal(error.code, 'BLOCKED_ENV');
    assert.match(error.message, /Engine\/tools\/process-tools\.mjs is missing/);
    return true;
  });
  const tools = join(isolated, 'Engine', 'tools');
  mkdirSync(tools, { recursive: true });
  writeFileSync(join(tools, 'process-tools.mjs'), ['command', 'startLogged', 'assertAlive', 'waitExit', 'forceCleanup']
    .map((name) => `export function ${name}() {}`).join('\n'));
  const loaded = await loadProcessTools({ repoRoot: isolated });
  assert.equal(typeof loaded.forceCleanup, 'function');
});

test('an empty Engine/ is filled once with the submodule command, and still empty is BLOCKED_ENV on every step', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-root-'));
  writeFileSync(join(isolated, 'movement-placeholder'), '');
  const lines = [];
  const gitCalls = [];
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 2,
    // No network in a test: the one init attempt fails the way an offline clone would.
    git: (args, { cwd }) => {
      gitCalls.push({ args, cwd });
      return { status: 128, stdout: '', stderr: 'fatal: unable to access github.com' };
    },
    log: (line) => lines.push(line),
    evidenceDir: join(isolated, 'evidence'),
  });
  assert.deepEqual(gitCalls, [{ args: ['submodule', 'update', '--init', '--depth', '1', 'Engine'], cwd: isolated }]);
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.equal(report.steps.length, 14);
  assert.deepEqual(lines.filter((line) => !line.startsWith('step=')), ['Engine/ is empty; running: git submodule update --init --depth 1 Engine']);
  for (const step of report.steps.slice(1)) {
    assert.match(step.detail, /git submodule update --init --depth 1 Engine" did not fill it/);
  }
  assert.ok(report.steps.every((step) => step.status === 'BLOCKED_ENV'));
  assert.match(report.steps.find((step) => step.id === '01').detail, /typed Reader via M9 loader/);
});

test('step 01 is READY when both end manifests exist even without Platform', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-manifest-'));
  // split-export/1 writes one manifest per end; step 01 covers the whole export.
  for (const end of [['Server', 'Config', 'Tables'], ['Client', 'Config', 'Tables']]) {
    mkdirSync(join(isolated, ...end), { recursive: true });
    writeFileSync(join(isolated, ...end, 'manifest.json'), '{"revisionId":"test"}\n');
  }
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 2,
    log() {},
    evidenceDir: join(isolated, 'evidence'),
  });
  assert.equal(report.steps.find((step) => step.id === '01').status, 'READY');
  assert.match(report.steps.find((step) => step.id === '01').detail, /typed Reader via M9 loader/);
  assert.equal(report.steps.find((step) => step.id === '02').status, 'BLOCKED_ENV');
  assert.equal(report.status, 'BLOCKED_ENV');
  for (const id of ['05', '07', '08', '09', '10', '11', '12', '13', '14']) {
    assert.equal(report.steps.find((step) => step.id === id).status, 'BLOCKED_ENV');
  }
});

test('injected tickets must stay unique per bot', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-tickets-'));
  const ticket = 'ticket-reuse';
  const session = {
    login: { loginName: 'Bot1', accountId: 'acct_00000000000000000000000000000001' },
    launch: { admissionCredential: ticket },
  };
  await assert.rejects(
    () => runLauncher({
      root: isolated,
      env: {},
      bots: 2,
      ...launchFiles(isolated),
      sessions: [session, session],
      processTools: {
        command() { return ''; },
        startLogged() { return { stdout: '', child: { pid: 1 } }; },
        assertAlive() {},
        waitExit() { return Promise.resolve(); },
        forceCleanup() { return Promise.resolve(); },
      },
      log() {},
      evidenceDir: join(isolated, 'evidence'),
    }),
    /unique/,
  );
});

test('started bots stay up for --duration-ms before forceCleanup', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-hold-'));
  const evidenceDir = join(isolated, 'evidence');
  const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    durationMs: 80,
    timeoutMs: 5_000,
    sessions: [session('Bot1', 'ticket-one')],
    ...launchFiles(isolated),
    processTools: tools,
    log() {},
    evidenceDir,
  });
  const firstStart = tools.events.find((event) => event.kind === 'start');
  const firstCleanup = tools.events.find((event) => event.kind === 'cleanup');
  assert.ok(firstStart);
  assert.ok(firstCleanup);
  assert.ok(firstCleanup.at - firstStart.at >= 70, `cleanup raced start by ${firstCleanup.at - firstStart.at}ms`);
  assert.equal(report.steps.find((step) => step.id === '04').status, 'PASS');
  assert.equal(report.admittedBots, 1);
  const botStart = tools.events.find((event) => event.kind === 'start' && event.args.includes('--gameplay'));
  assert.equal(botStart.args[botStart.args.indexOf('--room-id') + 1], 'room-Bot1');
  // Bots are clients: they get the C export, never the DS's S+V tables.
  assert.equal(botStart.args[botStart.args.indexOf('--config-dir') + 1], join(isolated, 'Client', 'Config', 'Tables'));
  // No scenario assembly: step 04 is still proven, 05–14 name what is missing and nothing runs a scenario.
  for (const id of ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14']) {
    const step = report.steps.find((entry) => entry.id === id);
    assert.equal(step.status, 'BLOCKED_ENV');
    assert.match(step.detail, /LUMIO_SCENARIO_DLL is not set/);
  }
  assert.ok(!botStart.args.includes('--scenario'));
});

test('fleet manifest retains each account\'s own authenticated room', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-rooms-'));
  const evidenceDir = join(isolated, 'evidence');
  const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1'), `${admitLine('Bot2')}\n${admitLine('Bot3')}`] });
  const startLogged = tools.startLogged.bind(tools);
  let manifest;
  tools.startLogged = (exe, args, options) => {
    const ticketAt = args.indexOf('--admission-ticket');
    if (ticketAt >= 0 && String(args[ticketAt + 1]).endsWith('.json')) {
      manifest = JSON.parse(readFileSync(args[ticketAt + 1], 'utf8'));
      assert.equal(args.includes('--room-id'), false);
    }
    return startLogged(exe, args, options);
  };
  await runLauncher({
    root: isolated, env: {}, bots: 3, fleetPerProcess: 2,
    staggerMs: 0, durationMs: 0, timeoutMs: 1000,
    sessions: [session('Bot1', 'ticket-one'), session('Bot2', 'ticket-two'), session('Bot3', 'ticket-three')],
    ...launchFiles(isolated), processTools: tools, log() {}, evidenceDir,
  });
  assert.deepEqual(manifest.accounts.map(({ launch }) => launch.roomId), ['room-Bot2', 'room-Bot3']);
  const single = tools.events.find((event) => event.kind === 'start' && event.args.includes('--room-id'));
  assert.equal(single.args[single.args.indexOf('--room-id') + 1], 'room-Bot1');
});

test('a runtime+voxel DS with --voxel-config off blocks step 04 loudly (ADR-112 rev2 ix)', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-voxel-'));
  const evidenceDir = join(isolated, 'evidence');
  const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
  const files = launchFiles(isolated);
  const config = runnableDsConfig();
  config.world_profile = 'runtime+voxel';
  writeFileSync(files.dsConfig, JSON.stringify(config) + '\n');
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    durationMs: 80,
    timeoutMs: 5_000,
    // The committed budget is on by default (launchFiles copies it in); off is the only road to a
    // budget-less bot, so that is what the gate has to catch.
    voxelConfig: 'off',
    sessions: [session('Bot1', 'ticket-one')],
    ...files,
    processTools: tools,
    log() {},
    evidenceDir,
  });
  const step04 = report.steps.find((step) => step.id === '04');
  assert.equal(step04.status, 'BLOCKED_ENV');
  assert.match(step04.detail, /LUMIO_BOT_VOXEL_CONFIG/);
  assert.match(report.steps.find((step) => step.id === '07').detail, /waiting for a voxel-capable bot fleet/);
  assert.equal(report.status, 'BLOCKED_ENV');
  // No bot process may start: an entity-only fleet would session_fault on the first SectionFrame.
  assert.ok(!tools.events.some((event) => event.kind === 'start' && event.args.includes('--gameplay')));
});

test('admit wait keeps timers alive so Linux node --test cannot drop the timeout', () => {
  const text = readFileSync(new URL('launcher.mjs', import.meta.url), 'utf8');
  assert.match(text, /await sleepFn\(25, \{ keepAlive: true \}\)/);
  assert.match(text, /await sleep\(25, \{ keepAlive: true \}\)/);
});

test('parseBotAdmit requires Active+established and rejects ticket/fault', () => {
  assert.equal(parseBotAdmit(admitLine('Bot1')).admitted, true);
  assert.equal(parseBotAdmit('session login requested Bot1 ws://x True').admitted, false);
  assert.equal(parseBotAdmit(rejectLine('Bot1')).rejected, true);
  assert.equal(parseBotAdmit(rejectLine('Bot1')).admitted, false);
  assert.equal(parseBotAdmit(faultLine('Bot1')).faulted, true);
  assert.equal(parseBotAdmit('').admitted, false);
});

test('rejected ticket does not mark step 04 PASS', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-reject-'));
  const evidenceDir = join(isolated, 'evidence');
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    durationMs: 80,
    timeoutMs: 1_000,
    sessions: [session('Bot1', 'ticket-reject')],
    ...launchFiles(isolated),
    processTools: processTools({ evidenceDir, botLogs: [rejectLine('Bot1')] }),
    log() {},
    evidenceDir,
  });
  assert.notEqual(report.steps.find((step) => step.id === '04').status, 'PASS');
  assert.equal(report.steps.find((step) => step.id === '04').status, 'FAIL');
  assert.equal(report.admittedBots, 0);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.steps.find((step) => step.id === '05').status, 'BLOCKED_ENV');
  assert.equal(report.steps.find((step) => step.id === '14').status, 'BLOCKED_ENV');
});

test('no welcome does not mark step 04 PASS', { timeout: 15_000 }, async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-nowelcome-'));
  const evidenceDir = join(isolated, 'evidence');
  const connecting = 'session state changed Bot1 Connecting None transport_connect 1 0 False False False';
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    durationMs: 0,
    timeoutMs: 1_000,
    sessions: [session('Bot1', 'ticket-silent')],
    ...launchFiles(isolated),
    processTools: processTools({ evidenceDir, botLogs: [connecting] }),
    log() {},
    evidenceDir,
  });
  assert.notEqual(report.steps.find((step) => step.id === '04').status, 'PASS');
  assert.equal(report.admittedBots, 0);
  assert.equal(report.steps.find((step) => step.id === '05').status, 'BLOCKED_ENV');
});

test('partial admit timeout does not mark step 04 PASS', { timeout: 15_000 }, async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-partial-'));
  const evidenceDir = join(isolated, 'evidence');
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 2,
    staggerMs: 0,
    durationMs: 0,
    timeoutMs: 1_000,
    sessions: [session('Bot1', 'ticket-a'), session('Bot2', 'ticket-b')],
    ...launchFiles(isolated),
    processTools: processTools({ evidenceDir, botLogs: [admitLine('Bot1'), ''] }),
    log() {},
    evidenceDir,
  });
  assert.notEqual(report.steps.find((step) => step.id === '04').status, 'PASS');
  assert.equal(report.admittedBots, 1);
  assert.equal(report.requiredBots, 2);
  assert.equal(report.steps.find((step) => step.id === '05').status, 'BLOCKED_ENV');
  assert.equal(report.steps.find((step) => step.id === '14').status, 'BLOCKED_ENV');
});

test('launcher and helpers contain no retired Game harness paths', () => {
  const files = [
    'launcher.mjs',
    'engine-tools.mjs',
    'account-client.mjs',
    'tour-steps.mjs',
    'ds-config.mjs',
  ];
  for (const name of files) {
    const text = readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /lumio-entity-chat-replay/);
    assert.doesNotMatch(text, /LumioServer\/account-server/);
    assert.doesNotMatch(text, /\/Users\//);
    assert.doesNotMatch(text, /\/home\//);
    // No machine's checkout, dotnet install or admission key may stand in for a missing variable.
    assert.doesNotMatch(text, /[A-Za-z]:[\\/](?:Work|Users|Program Files)/);
    assert.doesNotMatch(text, /\.dotnet[\\/]host[\\/]fxr/);
    assert.doesNotMatch(text, /9593f57065df3c73/);
  }
});

test('this test file does not keep formal-ds-smoke as the launcher', () => {
  assert.doesNotMatch(HERE, /formal-ds-smoke/);
});

test('missing env with --spectator stays BLOCKED_ENV and never fakes PASS', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-env-'));
  const lines = [];
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 100,
    spectator: true,
    log: (line) => lines.push(line),
    evidenceDir: join(isolated, 'evidence'),
  });
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.equal(report.steps.length, 14);
  assert.ok(report.steps.every((step) => step.status === 'BLOCKED_ENV' || step.status === 'READY'));
  assert.equal(report.steps.find((step) => step.id === '02').status, 'BLOCKED_ENV');
  assertTourHonesty(report, lines);
});

test('100 bots + spectator mint 101 unique tickets and start 100 Bot.Host processes', { timeout: 30_000 }, async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-100-'));
  const evidenceDir = join(isolated, 'evidence');
  const minted = [];
  const botLogs = Array.from({ length: 100 }, (_, index) => admitLine(`Bot${index + 1}`));
  const tools = processTools({ evidenceDir, botLogs });
  const lines = [];
  const report = await runLauncher({
    root: isolated,
    env: {},
    origin: 'http://127.0.0.1:1',
    bots: 100,
    spectator: true,
    spectatorRoot: spectatorBundle(isolated),
    staggerMs: 0,
    durationMs: 5_000,
    timeoutMs: 5_000,
    spectatorConnected: true,
    loginAndLaunch: async ({ loginName }) => {
      minted.push(loginName);
      return session(loginName, `ticket-${loginName}`);
    },
    ...launchFiles(isolated),
    processTools: tools,
    log: (line) => lines.push(line),
    evidenceDir,
  });

  assert.deepEqual(minted, planLaunchLogins(100, { spectator: true }));
  assert.equal(minted.length, 101);
  assert.equal(minted[100], 'Spectator1');
  const tickets = collectLaunchTickets(minted.map((name) => session(name, `ticket-${name}`)));
  assert.equal(tickets.length, 101);
  assert.equal(new Set(tickets).size, 101);
  assert.equal(report.loginAndLaunchCount, 101);
  assert.equal(report.requiredBots, 100);
  assert.equal(report.admittedBots, 100);
  assert.equal(report.botHostsStarted, 100);
  assert.equal(report.spectatorLogin, 'Spectator1');
  assert.equal(report.spectatorPage.status, 'HOSTED');
  assert.match(report.spectatorUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);

  const starts = tools.events.filter((event) => event.kind === 'start');
  assert.equal(starts.length, 101, '1 lumio-ds + 100 Bot.Host');
  const botStarts = starts.slice(1);
  assert.equal(botStarts.length, 100);
  const startedArgs = botStarts.flatMap((event) => event.args);
  assert.ok(!startedArgs.includes('Spectator1'));
  assert.ok(!startedArgs.includes('ticket-Spectator1'));
  assert.ok(!startedArgs.some((value) => String(value).includes('ticket-Spectator1')));

  const urlLine = lines.find((line) => line.startsWith('spectator-url='));
  assert.equal(urlLine, `spectator-url=${report.spectatorUrl}`);
  assert.doesNotMatch(urlLine, /ticket-|admissionCredential|Spectator1-ticket/);
  for (const name of minted) {
    assert.doesNotMatch(urlLine, new RegExp(`ticket-${name}`));
  }

  assert.equal(report.steps.find((step) => step.id === '02').status, 'PASS');
  assert.match(report.steps.find((step) => step.id === '02').detail, /100 bot tickets \+ 1 spectator ticket/);
  assert.equal(report.steps.find((step) => step.id === '04').status, 'PASS');
  assert.match(report.steps.find((step) => step.id === '04').detail, /spectator ticket held without Bot.Host/);
  assert.equal(report.status, 'BLOCKED_ENV');
  assertTourHonesty(report, lines);
});

for (const [name, roomId] of [['trusted Room', ' Room/旁观:MiXeD-09 '], ['missing Room', undefined]]) {
  test(`runLauncher spectator page preserves its own ${name} from loginAndLaunch`, { timeout: 10_000 }, async (context) => {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-room-'));
    context.after(() => rmSync(isolated, { recursive: true, force: true }));
    const evidenceDir = join(isolated, 'evidence');
    const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
    const lines = [];
    const minted = [];
    const spectatorLaunch = {
      wsUrl: 'ws://127.0.0.1:9999/session?roomId=url-room',
      subprotocol: 'lumio.mvp.v0',
      admissionCredential: 'ticket-spec-private',
      ...(roomId === undefined ? {} : { roomId }),
    };
    let resolvePageUrl;
    const pageUrl = new Promise((resolvePromise) => { resolvePageUrl = resolvePromise; });
    let finishObservation;
    const spectatorConnected = new Promise((resolvePromise) => { finishObservation = resolvePromise; });
    const running = runLauncher({
      root: isolated,
      env: {},
      origin: 'http://127.0.0.1:1',
      bots: 1,
      spectator: true,
      spectatorRoot: spectatorBundle(isolated),
      staggerMs: 0,
      durationMs: 5_000,
      timeoutMs: 5_000,
      spectatorConnected,
      loginAndLaunch: async ({ loginName }) => {
        minted.push(loginName);
        if (loginName === 'Spectator1') {
          return { login: { loginName, accountId: 'acct_Spectator1', roomId: 'login-room' }, launch: spectatorLaunch };
        }
        return session(loginName, `ticket-${loginName}`);
      },
      ...launchFiles(isolated),
      processTools: tools,
      log: (line) => {
        lines.push(line);
        if (line.startsWith('spectator-url=')) resolvePageUrl(line.slice('spectator-url='.length));
      },
      evidenceDir,
    });
    let page;
    let html;
    let script;
    let report;
    try {
      const url = await Promise.race([
        pageUrl,
        running.then(() => { throw new Error('launcher ended before serving the spectator page'); }),
      ]);
      page = await fetch(url);
      html = await page.text();
      script = await (await fetch(new URL('main.js', url))).text();
    } finally {
      finishObservation();
      report = await running;
    }

    assert.deepEqual(minted, ['Bot1', 'Spectator1']);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.deepEqual(injectedLaunch(html), {
      wsUrl: 'ws://127.0.0.1:9110/',
      subprotocol: spectatorLaunch.subprotocol,
      admissionCredential: spectatorLaunch.admissionCredential,
      ...(roomId === undefined ? {} : { roomId }),
    });
    assert.equal(report.spectatorPage.status, 'HOSTED');
    assert.equal(report.spectatorLogin, 'Spectator1');
    assert.equal(report.botHostsStarted, 1);
    assert.equal(report.steps.find((step) => step.id === '04').status, 'PASS');
    assert.equal(report.status, 'BLOCKED_ENV');
    assertTourHonesty(report, lines);
    const publicEvidence = [report.spectatorUrl, JSON.stringify(report), lines.join('\n'), script].join('\n');
    assert.doesNotMatch(publicEvidence, /ticket-spec-private|ticket-Bot1/);
    assert.ok(!tools.events.filter((event) => event.kind === 'start').some((event) => event.args.includes(spectatorLaunch.admissionCredential)));
    assert.equal(readFileSync(join(isolated, 'spectator-wwwroot', 'index.html'), 'utf8'), SPECTATOR_INDEX);
    await assert.rejects(() => fetch(report.spectatorUrl));
  });
}

test('injected 100 bot + spectator tickets stay unique and still skip a 101st Bot.Host', { timeout: 30_000 }, async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-inject-'));
  const evidenceDir = join(isolated, 'evidence');
  const sessions = [
    ...Array.from({ length: 100 }, (_, index) => session(`Bot${index + 1}`, `ticket-Bot${index + 1}`)),
    session('Spectator1', 'ticket-Spectator1'),
  ];
  assert.equal(collectLaunchTickets(sessions).length, 101);
  const botLogs = Array.from({ length: 100 }, (_, index) => admitLine(`Bot${index + 1}`));
  const tools = processTools({ evidenceDir, botLogs });
  const lines = [];
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 100,
    spectator: true,
    spectatorUrl: 'http://127.0.0.1:8080/games/bomber/',
    staggerMs: 0,
    durationMs: 5_000,
    timeoutMs: 5_000,
    spectatorConnected: true,
    sessions,
    ...launchFiles(isolated),
    processTools: tools,
    log: (line) => lines.push(line),
    evidenceDir,
  });
  assert.equal(report.loginAndLaunchCount, 101);
  assert.equal(report.botHostsStarted, 100);
  assert.equal(tools.events.filter((event) => event.kind === 'start').length, 101);
  assert.equal(report.spectatorPage.status, 'EXTERNAL');
  const urlLine = lines.find((line) => line.startsWith('spectator-url='));
  assert.equal(urlLine, 'spectator-url=http://127.0.0.1:8080/games/bomber/');
  assert.doesNotMatch(urlLine, /ticket-Spectator1|admissionCredential/);
  assertTourHonesty(report, lines);
});

test('--spectator hold ends when the page reports connected without opening a browser', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-hold-'));
  const evidenceDir = join(isolated, 'evidence');
  const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
  let resolveConnected;
  const spectatorConnected = new Promise((resolvePromise) => {
    resolveConnected = resolvePromise;
  });
  const hold = runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    spectator: true,
    staggerMs: 0,
    durationMs: 5_000,
    timeoutMs: 5_000,
    spectatorConnected,
    sessions: [session('Bot1', 'ticket-bot'), session('Spectator1', 'ticket-spec')],
    ...launchFiles(isolated),
    processTools: tools,
    log() {},
    evidenceDir,
  });
  setTimeout(() => resolveConnected(), 40);
  const report = await hold;
  const firstStart = tools.events.find((event) => event.kind === 'start');
  const firstCleanup = tools.events.find((event) => event.kind === 'cleanup');
  assert.ok(firstCleanup.at - firstStart.at < 1_000, `hold ignored spectator connect (${firstCleanup.at - firstStart.at}ms)`);
  assert.ok(firstCleanup.at - firstStart.at >= 20);
  assert.equal(report.botHostsStarted, 1);
  assert.equal(report.loginAndLaunchCount, 2);
  // No published bundle under this root: the page is not served and nothing pretends it is.
  assert.equal(report.spectatorPage.status, 'BLOCKED_ENV');
  assert.equal(report.spectatorUrl, undefined);
  assertTourHonesty(report);
});

test('--spectator hold falls back to --duration-ms when the page never connects', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-spec-duration-'));
  const evidenceDir = join(isolated, 'evidence');
  const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    spectator: true,
    staggerMs: 0,
    durationMs: 80,
    timeoutMs: 5_000,
    sessions: [session('Bot1', 'ticket-bot'), session('Spectator1', 'ticket-spec')],
    ...launchFiles(isolated),
    processTools: tools,
    log() {},
    evidenceDir,
  });
  const firstStart = tools.events.find((event) => event.kind === 'start');
  const firstCleanup = tools.events.find((event) => event.kind === 'cleanup');
  assert.ok(firstCleanup.at - firstStart.at >= 70, `duration hold raced start by ${firstCleanup.at - firstStart.at}ms`);
  assert.equal(report.botHostsStarted, 1);
  assert.equal(report.steps.find((step) => step.id === '05').status, 'BLOCKED_ENV');
});

test('launcher source does not green local-paint', () => {
  const text = readFileSync(new URL('launcher.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /SetLocalPose/);
  assert.doesNotMatch(text, /local-paint/);
  assert.doesNotMatch(text, /BotStressMovement/);
});

test('root README names the launcher and does not keep formal-ds-smoke', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Tools\/launcher\.mjs/);
  assert.doesNotMatch(readme, /formal-ds-smoke\.mjs/);
  assert.doesNotMatch(readme, /端到端启动器还没有/);
});

test('committed server.json and tour no longer claim runtime-only', () => {
  const server = readFileSync(new URL('../Server/Config/Startup/server.json', import.meta.url), 'utf8');
  const tour = readFileSync(new URL('../.spec/knowledge/features/bomber-tour.md', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(server, /"world_profile": "runtime\+voxel"/);
  assert.match(server, /"durability": "snapshot_only"/);
  assert.doesNotMatch(server, /process-crash|power-loss|"runtime-only"/);
  assert.doesNotMatch(server, /replace-server-audience|REPLACE_WITH_PLATFORM_32_BYTE_PUBLIC_KEY_HEX/);
  assert.match(tour, /runtime\+voxel/);
  assert.doesNotMatch(tour, /仍是 `runtime-only`/);
  assert.match(readme, /runtime\+voxel/);
  assert.match(readme, /\.run\/launch-\*/);
  assert.match(readme, /server\.boot-1\.json/);
});

test('a release without lumio-ds for this platform is BLOCKED_ENV naming the Engine/ path, not replace-* tokens', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-nodye-'));
  const evidenceDir = join(isolated, 'evidence');
  const files = launchFiles(isolated);
  const engine = files.engine;
  rmSync(engine.layout.dsExe);
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    ...files,
    sessions: [session('Bot1', 'ticket-nodye')],
    processTools: {
      command() { throw new Error('must not run lumio-ds'); },
      startLogged() { throw new Error('must not start lumio-ds'); },
      assertAlive() {},
      waitExit() { return Promise.resolve(); },
      forceCleanup() { return Promise.resolve(); },
    },
    log() {},
    evidenceDir,
  });
  const step03 = report.steps.find((step) => step.id === '03');
  assert.equal(step03.status, 'BLOCKED_ENV');
  assert.equal(step03.detail, `${engine.layout.dsExe} is missing from the Engine/ release.`);
  assert.doesNotMatch(step03.detail, /replace-|REPLACE_WITH_PLATFORM|missing required value/);
});

test('step 03 with the release lumio-ds boots on the committed template without replace-* tokens', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-dsconfig-'));
  const evidenceDir = join(isolated, 'evidence');
  const committed = JSON.parse(readFileSync(new URL('../Server/Config/Startup/server.json', import.meta.url), 'utf8'));
  // The template names only the game's assembly; put it where the template says, relative to itself.
  const startup = join(isolated, 'Server', 'Config', 'Startup');
  mkdirSync(startup, { recursive: true });
  writeFileSync(join(startup, 'server.json'), `${JSON.stringify(committed)}\n`);
  const registry = resolve(startup, committed.clr.registry_assembly);
  mkdirSync(resolve(registry, '..'), { recursive: true });
  writeFileSync(registry, '');
  voxelBudgetFiles(isolated);
  frozenMapFiles(isolated);
  const engine = fakeEngine(isolated);
  const events = [];
  const report = await runLauncher({
    root: isolated,
    env: {},
    engine,
    hostfxr: touch(isolated, 'hostfxr.dll'),
    bots: 1,
    staggerMs: 0,
    durationMs: 0,
    timeoutMs: 1_000,
    sessions: [session('Bot1', 'ticket-ds')],
    dsConfig: join(startup, 'server.json'),
    processTools: {
      command() { return 'configuration_valid'; },
      startLogged(exe, args) {
        events.push({ exe, args });
        return {
          stdout: 'DS_READY {"pid":1,"endpoint":"ws://127.0.0.1:9110"}\n',
          child: { pid: 1, kill() {} },
          closed: false,
        };
      },
      assertAlive() {},
      waitExit() { return Promise.resolve(); },
      forceCleanup() { return Promise.resolve(); },
    },
    log() {},
    evidenceDir,
  });
  const step03 = report.steps.find((step) => step.id === '03');
  assert.equal(step03.status, 'PASS');
  assert.doesNotMatch(step03.detail, /replace-|REPLACE_WITH_PLATFORM/);
  // The DS that started is the release's, and its run config names the release's engine half.
  assert.equal(events[0].exe, engine.layout.dsExe);
  const clr = JSON.parse(readFileSync(events[0].args[1], 'utf8')).clr;
  assert.equal(clr.engine_native, engine.layout.engineNative);
  assert.equal(clr.assembly, engine.layout.hostEntry);
  assert.equal(clr.registry_assembly, registry);
  assert.deepEqual(report.engine, { version: '0.0.1', rid: engine.rid, dir: engine.dir });
});

test('unfilled bomber tokens on the DS config are a loud missing-value FAIL, not BLOCKED_ENV', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-unfilled-'));
  const evidenceDir = join(isolated, 'evidence');
  const bomber = JSON.parse(readFileSync(new URL('../Server/Config/Startup/server.bomber.json', import.meta.url), 'utf8'));
  frozenMapFiles(isolated);
  bomber.config_dir = 'Server/Config/Tables';
  bomber.base_map_path = 'Server/Assets/Maps/bomber.voxel';
  writeFileSync(join(isolated, 'server.json'), `${JSON.stringify(bomber)}\n`);
  const report = await runLauncher({
    root: isolated,
    env: {},
    bots: 1,
    staggerMs: 0,
    durationMs: 0,
    timeoutMs: 1_000,
    sessions: [session('Bot1', 'ticket-unfilled')],
    engine: fakeEngine(isolated),
    hostfxr: touch(isolated, 'hostfxr.dll'),
    dsConfig: join(isolated, 'server.json'),
    processTools: {
      command() { return ''; },
      startLogged() { throw new Error('must not start DS on unfilled tokens'); },
      assertAlive() {},
      waitExit() { return Promise.resolve(); },
      forceCleanup() { return Promise.resolve(); },
    },
    log() {},
    evidenceDir,
  });
  assert.equal(report.steps.find((step) => step.id === '03').status, 'FAIL');
  assert.match(report.steps.find((step) => step.id === '03').detail, /missing required value/);
  assert.doesNotMatch(report.steps.find((step) => step.id === '03').detail, /BLOCKED_ENV/);
});

test('the committed Bot voxel budget states every field BotVoxelConfig has no default for', () => {
  const budget = JSON.parse(readFileSync(new URL('../Server/Assets/Maps/bot-voxel-budget.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    Object.keys(budget).sort(),
    ['catalogPath', 'prediction', 'receiptRetentionEntries', 'residentSectionBudget'],
  );
  // catalogPath resolves against the budget file's OWN directory, not the process cwd.
  assert.ok(existsSync(resolve(HERE, '..', 'Server', 'Assets', 'Maps', budget.catalogPath)));
  // Native refuses receiptRetentionEntries=0 (sdk-native voxel.rs NativeVoxelProvider::create),
  // so a zero here would pass the loader and then be rejected at world creation.
  assert.ok(budget.receiptRetentionEntries >= 1);
  // The bomber map is 32x32x16 = 4 Sections (server.json voxel_baseline_region 0,0,0..1,0,1).
  assert.ok(budget.residentSectionBudget >= 4);
  assert.deepEqual(Object.keys(budget.prediction).sort(), [
    'bindingTextSlotBytes', 'maxBindingJournal', 'maxBindingTextEntries', 'maxBlockJournal',
    'maxOverlaySlots', 'maxRecords', 'maxValidationCellsPerSection', 'maxValidationSections',
    'totalRetainedPayloadCeiling',
  ]);
  const p = budget.prediction;
  // required_retained_bytes() refuses max_records=0 or a zero ceiling outright, then refuses the
  // session when the summed array layout exceeds the ceiling. The measured floor for these nine
  // values is 13424 bytes (lumio-voxel-world prediction::required_retained_bytes).
  assert.ok(p.maxRecords > 0);
  assert.ok(p.totalRetainedPayloadCeiling >= 13_424);
  // Overlay keys are one per distinct (cell, binding) pair across both journals; a smaller
  // budget would refuse a journal the other two limits allow.
  assert.ok(p.maxOverlaySlots >= p.maxBlockJournal + p.maxBindingJournal);
  // One text slot per retained binding write, and NetEntityId.ToHex() is 32 UTF-8 bytes.
  assert.ok(p.maxBindingTextEntries >= p.maxBindingJournal);
  assert.ok(p.bindingTextSlotBytes >= 32);
});

test('bots carry the committed voxel budget by default and --voxel-config off keeps entity-only', () => {
  assert.equal(parseLaunchArgs([], {}).voxelConfig, undefined);
  assert.equal(parseLaunchArgs([], { LUMIO_BOT_VOXEL_CONFIG: 'off' }).voxelConfig, 'off');
  assert.equal(
    parseLaunchArgs(['--voxel-config', 'off'], { LUMIO_BOT_VOXEL_CONFIG: 'maps/x.json' }).voxelConfig,
    'off',
  );

  const bomberRoot = resolve(HERE, '..');
  assert.equal(resolveBotVoxelConfig(undefined, bomberRoot), join(bomberRoot, 'Server', 'Assets', 'Maps', 'bot-voxel-budget.json'));
  for (const off of ['off', 'OFF', 'none', 'false', '0', '', '  ']) {
    assert.equal(resolveBotVoxelConfig(off, bomberRoot), null, `${JSON.stringify(off)} must be entity-only`);
  }
  // A budget the operator named but that is not there is a loud launcher refusal, never a silent
  // fall back to the entity-only bot that then faults on its first SectionFrame.
  assert.throws(() => resolveBotVoxelConfig('maps/not-here.json', bomberRoot), /--voxel-config/);
});

test('started bots receive --voxel-config, and off starts them without it', async () => {
  for (const [voxelConfig, expected] of [[undefined, true], ['off', false]]) {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-launch-voxel-'));
    const evidenceDir = join(isolated, 'evidence');
    const tools = processTools({ evidenceDir, botLogs: [admitLine('Bot1')] });
    const report = await runLauncher({
      root: isolated,
      env: {},
      bots: 1,
      staggerMs: 0,
      durationMs: 0,
      timeoutMs: 5_000,
      voxelConfig,
      sessions: [session('Bot1', 'ticket-one')],
      ...launchFiles(isolated),
      processTools: tools,
      log() {},
      evidenceDir,
    });
    const botStart = tools.events.find((event) => event.kind === 'start' && event.args.includes('--gameplay'));
    assert.equal(botStart.args.includes('--voxel-config'), expected);
    if (expected) {
      assert.equal(
        botStart.args[botStart.args.indexOf('--voxel-config') + 1],
        join(isolated, 'Server', 'Assets', 'Maps', 'bot-voxel-budget.json'),
      );
      assert.equal(report.botVoxelConfig, join(isolated, 'Server', 'Assets', 'Maps', 'bot-voxel-budget.json'));
    } else {
      assert.equal(report.botVoxelConfig, null);
    }
  }
});

// Bomber's full-match evidence, distinct from the first-round admission scenario.
const TOUR_DS_READY = 'DS_READY {"pid":1,"endpoint":"ws://127.0.0.1:9110","worldProfile":"runtime+voxel"}\n';
const FRESH_BOOT_LOGS = 'cat=ds msg="empty store: first boot opens the world from the configured base map"';
const RESTORED_BOOT_LOGS = 'cat=ds msg="recovered checkpoint outranks base_map_path"';
const EVENT_NAMES = ['match_started', 'bomb_placed', 'bomb_detonated', 'chain_resolved',
  'damage_applied', 'player_respawned', 'final_circle_started', 'match_ended', 'match_started'];
const GAMEPLAY_LOG_TARGET = 'Lumio.Bomber.Gameplay.Contracts.Components.BomberMatchState';
// The released CoreCLR provider carries category + message through the Native mailbox.
// The DS writes target/lang/world outside msg; textual gameplay fields remain inside it.
const GREEN_EVENTS = EVENT_NAMES.map((event, index) =>
  'level=INFO lang=cs target=' + GAMEPLAY_LOG_TARGET + ' world=1 tick=' + (40 + index) + ' msg='
  + JSON.stringify('event=' + event + ' roomId=room-01 matchId=' + (index === 8 ? '2' : '1')
  + ' gameTick=' + (40 + index) + ' eventSequence=' + (index + 1)));
const GREEN_BOOT_LOGS = [FRESH_BOOT_LOGS, ...GREEN_EVENTS].join('\n');

function resultLines({ passed = true, failed = '', run = true } = {}) {
  const lines = [JSON.stringify({ kind: 'assert', bot: 'bot-0', step: 900, passed, failed })];
  if (run) lines.push(JSON.stringify({ kind: 'run', bots: 1, ticks: 900, uplinks: 40, commandStreamSha256: 'ab', passed }));
  return lines.join('\n') + '\n';
}
function failedResult(...names) { return resultLines({ passed: false, failed: names.join(',') }); }
function argValue(args, flag) { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; }

function tourTools({ logs = GREEN_BOOT_LOGS, tourResult = resultLines(), tourAdmit = account => admitLine(account),
  tourExit = { code: 0, signal: null }, dsDiesWithTour = false } = {}) {
  const events = [];
  let ds;
  let tourStarted = false;
  return {
    events,
    command() { return 'configuration_valid'; },
    startLogged(exe, args = [], settings = {}) {
      const started = { kind: 'start', exe, args: [...args], settings, at: Date.now() };
      events.push(started);
      if (args[0] === '--config') {
        const config = JSON.parse(readFileSync(args[1], 'utf8'));
        mkdirSync(config.logging.dir, { recursive: true });
        writeFileSync(join(config.logging.dir, 'lumio-ds-0.log'), logs + '\n');
        started.pid = 1;
        ds = { child: { pid: 1, kill() {} }, closed: false, config, stdout: TOUR_DS_READY };
        return ds;
      }
      const logDir = argValue(args, '--log-dir');
      const scenario = argValue(args, '--scenario-name');
      mkdirSync(logDir, { recursive: true });
      writeFileSync(join(logDir, '2026-09-27_000.log'), tourAdmit(argValue(args, '--account-from')) + '\n');
      const isTour = scenario === TOUR_SCENARIO;
      if (isTour) tourStarted = true;
      if (isTour && tourResult != null) writeFileSync(join(logDir, 'result.ndjson'), tourResult);
      started.pid = isTour ? 50 : 70 + events.length;
      return { stdout: '', child: { pid: started.pid, kill() {} }, closed: isTour, ...(isTour ? tourExit : {}) };
    },
    assertAlive(state) {
      if (state?.config && state.closed) throw new Error('DS exited');
      if (state === ds && dsDiesWithTour && tourStarted)
        queueMicrotask(() => { ds.closed = true; });
    },
    waitExit() { return Promise.resolve(); },
    forceCleanup(state) { events.push({ kind: 'cleanup', pid: state?.child?.pid }); return Promise.resolve(); },
  };
}
function tourFiles(isolated) {
  const files = launchFiles(isolated);
  const config = { ...runnableDsConfig(), config_dir: 'Server/Config/Tables', world_profile: 'runtime+voxel' };
  writeFileSync(files.dsConfig, `${JSON.stringify(config)}\n`);
  for (const end of [['Server', 'Config', 'Tables'], ['Client', 'Config', 'Tables']]) {
    mkdirSync(join(isolated, ...end), { recursive: true });
    writeFileSync(join(isolated, ...end, 'manifest.json'), '{"revisionId":"test"}\n');
  }
  const gameDir = join(isolated, 'Server', 'Config', 'Tables', 'server');
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(gameDir, 'game.json'), JSON.stringify({ table: 'game', target: 'S', rows: [{
    id: 100001, name: 'default', tick_rate_hz: 20, warmup_ms: 3000,
    map_size: 19, player_count: 8, initial_seed: 1,
    match_duration_ms: 420000, podium_ms: 10000, results_ms: 6000,
  }] }));
  return { ...files, scenarioDll: touch(isolated, 'Lumio.Bomber.Bots.dll') };
}

test('tour budget covers capped match, settlement and next warmup using selected server table', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-budget-'));
  const files = tourFiles(isolated);
  const configDir = join(isolated, 'Server', 'Config', 'Tables');
  const budget = resolveTourBudget({ config_dir: configDir }, {});
  assert.equal(budget.phaseMs, 442_000);
  assert.equal(budget.ticks, Math.ceil((442_000 + 60_000) / 16));
  assert.ok(budget.timeoutMs > 442_000);

  const gamePath = join(configDir, 'server', 'game.json');
  const table = JSON.parse(readFileSync(gamePath, 'utf8'));
  table.rows[0].match_duration_ms = 480_000;
  writeFileSync(gamePath, JSON.stringify(table));
  const alternate = resolveTourBudget({ config_dir: configDir }, {});
  assert.equal(alternate.phaseMs, 502_000);
  assert.ok(alternate.ticks > budget.ticks);
  assert.ok(alternate.timeoutMs > budget.timeoutMs);

  const explicit = resolveTourBudget({ config_dir: configDir }, { tourTicks: 900, tourTimeoutMs: 7000 });
  assert.equal(explicit.ticks, 900);
  assert.equal(explicit.timeoutMs, 7000);
  rmSync(isolated, { recursive: true, force: true });
});

test('tour starts Bot.Host with the selected profile budget and preserves explicit limits', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-profile-'));
  const files = tourFiles(isolated);
  const tablePath = join(isolated, 'Server', 'Config', 'Tables', 'server', 'game.json');
  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  table.rows[0].match_duration_ms = 480_000;
  writeFileSync(tablePath, JSON.stringify(table));
  const tools = tourTools();
  await runTour(tools, { isolated, files });
  const start = tools.events.find(event => event.kind === 'start' && event.args.includes(TOUR_SCENARIO));
  assert.equal(Number(argValue(start.args, '--ticks')), Math.ceil((502_000 + 60_000) / 16));

  const limited = tourTools();
  await runTour(limited, { isolated, files, tourTicks: 900, tourTimeoutMs: 7000 });
  const limitedStart = limited.events.find(event => event.kind === 'start' && event.args.includes(TOUR_SCENARIO));
  assert.equal(Number(argValue(limitedStart.args, '--ticks')), 900);
  rmSync(isolated, { recursive: true, force: true });
});

test('full-match peers use the Game scenario and remain resident', async () => {
  const tools = tourTools();
  const run = await runTour(tools, { bots: 8 });
  try {
    const starts = tools.events.filter(event => event.kind === 'start' && event.args.includes('--account-from'));
    assert.equal(starts.length, 8);
    assert.equal(argValue(starts[0].args, '--scenario-name'), TOUR_SCENARIO);
    assert.ok(Number(argValue(starts[0].args, '--ticks')) > 0);
    for (const peer of starts.slice(1)) {
      assert.equal(argValue(peer.args, '--scenario-name'), 'Lumio.Bomber.Bots.BomberMatchPeerScenario');
      assert.equal(argValue(peer.args, '--scenario'), argValue(starts[0].args, '--scenario'));
      assert.equal(argValue(peer.args, '--ticks'), undefined);
      assert.equal(peer.settings.env?.LumioBotConfigDirectory, argValue(peer.args, '--config-dir'));
    }
  } finally { rmSync(run.isolated, { recursive: true, force: true }); }
});

test('every Bot uses the actual Platform launch wire profile instead of an inherited legacy default', async () => {
  const tools = tourTools();
  const profile = 'lumio.successor-binding-receipts-parts.v1';
  const run = await runTour(tools, { bots: 8, env: { LUMIO_BOT_WIRE_PROFILE: 'lumio.mvp.v0' },
    loginAndLaunch: async ({ loginName }) => ({ ...session(loginName, `test-ticket-${loginName}`),
      launch: { ...session(loginName, `test-ticket-${loginName}`).launch, subprotocol: profile } }),
  });
  try {
    const starts = tools.events.filter(event => event.kind === 'start' && event.args.includes('--account-from'));
    assert.equal(starts.length, 8);
    for (const start of starts) assert.equal(start.settings.env?.LUMIO_BOT_WIRE_PROFILE, profile);
  } finally { rmSync(run.isolated, { recursive: true, force: true }); }
});

test('full-match scenarios reject packed accounts before launch', async () => {
  assert.throws(() => parseLaunchArgs(['--scenario-dll', 'Bots.dll', '--fleet-per-process', '2'], {}), /fleet-per-process 1/);
  await assert.rejects(runLauncher({ scenarioDll: 'Bots.dll', fleetPerProcess: 2, env: {} }), /fleet-per-process 1/);
});

test('tour scenario receives the same client config directory as Bot.Host', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-selected-config-'));
  const files = tourFiles(isolated);
  const selected = join(isolated, 'selected/client/export/client');
  mkdirSync(selected, { recursive: true });
  for (const table of ['map', 'game']) {
    writeFileSync(join(selected, `${table}.json`), readFileSync(join(isolated, 'Client/Config/Tables/client', `${table}.json`)));
  }
  const tools = tourTools();
  await runTour(tools, { isolated, files, configDir: 'selected/client/export' });
  const start = tools.events.find(event => event.kind === 'start' && event.args.includes(TOUR_SCENARIO));
  assert.equal(start.settings.env?.LumioBotConfigDirectory, argValue(start.args, '--config-dir'));
  assert.ok(start.settings.env.LumioBotConfigDirectory.endsWith(join('selected', 'client', 'export')));
});

async function runTour(tools, overrides = {}) {
  const isolated = overrides.isolated ?? mkdtempSync(join(tmpdir(), 'lumio-tour-'));
  const evidenceDir = join(isolated, 'evidence');
  const logins = [];
  const lines = [];
  // `files` lets a test hand in a fixture it already edited; otherwise a green one is written.
  const { isolated: _unused, files = tourFiles(isolated), ...rest } = overrides;
  if (rest.admissionOnly) {
    const admissionDll = join(isolated, 'Client', 'Bots', 'bin', 'Debug', 'net10.0', 'Lumio.Bomber.Bots.dll');
    mkdirSync(resolve(admissionDll, '..'), { recursive: true });
    writeFileSync(admissionDll, '');
    files.scenarioDll = undefined;
  }
  const report = await runLauncher({
    root: isolated,
    env: {},
    origin: 'http://127.0.0.1:1',
    bots: rest.admissionOnly ? 8 : 1,
    staggerMs: 0,
    durationMs: 0,
    timeoutMs: 5_000,
    loginAndLaunch: async ({ loginName, password }) => {
      logins.push({ loginName, password });
      return session(loginName, `ticket-${loginName}-${logins.length}`);
    },
    ...files,
    processTools: tools,
    log: (line) => lines.push(line),
    evidenceDir,
    ...rest,
  });
  const status = (id) => report.steps.find((step) => step.id === id)?.status;
  const detail = (id) => report.steps.find((step) => step.id === id)?.detail;
  return { report, logins, lines, evidenceDir, isolated, status, detail };
}


for (const [reason, tourExit] of [
  ['nonzero exit', { code: 1, signal: null }],
  ['termination signal', { code: null, signal: 'SIGTERM' }],
  ['termination signal with zero code', { code: 0, signal: 'SIGTERM' }],
  ['process error', { code: 0, signal: null, error: new Error('scenario host failure') }],
  ['missing exit metadata', {}],
]) {
  test(`tour rejects successful evidence after ${reason}`, async () => {
    const { report, isolated } = await runTour(tourTools({ tourExit }));
    try {
      assert.equal(report.status, 'FAIL');
      assert.deepEqual(report.steps.slice(4).map(step => step.status), Array(10).fill('FAIL'));
      assert.ok(report.steps.slice(4).every(step => step.detail.includes('did not exit naturally')));
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
}

for (const deadlineExpired of [false, true]) {
  test(`tour rejects DS loss when both processes close before ${deadlineExpired ? 'deadline fallback' : 'poll'}`, async (t) => {
    if (deadlineExpired) {
      let now = Date.now();
      t.mock.method(Date, 'now', () => ++now);
    }
    const { report, isolated } = await runTour(tourTools({ dsDiesWithTour: true }),
      { tourTimeoutMs: deadlineExpired ? 1 : 5000 });
    try {
      assert.equal(report.status, 'FAIL');
      assert.deepEqual(report.steps.slice(4).map(step => step.status), Array(10).fill('FAIL'));
      assert.ok(report.steps.slice(4).every(step => step.detail.includes('lumio-ds exited')));
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
}

test('the complete tour uses one DS boot through next match, with no save/restart scenario', async () => {
  const tools = tourTools();
  const { report, logins } = await runTour(tools, { bots: 2 });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.steps.slice(4).map(step => step.status), Array(10).fill('PASS'));
  const boots = tools.events.filter(event => event.kind === 'start' && event.args[0] === '--config');
  assert.equal(boots.length, 1);
  assert.deepEqual(logins.map(login => login.loginName), ['Bot1', 'Bot2']);
  assert.equal(report.steps.at(-1).id, '14');
  assert.equal(TOUR_STEPS.at(-1).key, 'next-match');
  assert.ok(!tools.events.some(event => event.kind === 'start' && String(argValue(event.args, '--scenario-name')).includes('Restore')));
});

test('missing, empty, truncated, malformed and contradictory results cannot pass the match', async () => {
  for (const tourResult of [null, '', resultLines({ run: false }), resultLines() + 'bad\n',
    resultLines({ passed: true, failed: 'damage_applied' })]) {
    const { report } = await runTour(tourTools({ tourResult }));
    assert.equal(report.status, 'FAIL');
    assert.ok(report.steps.slice(4).every(step => step.status === 'FAIL'));
  }
});

test('a reused evidence directory cannot supply this runs missing Bot result', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-old-result-'));
  const files = tourFiles(isolated);
  const botDir = join(isolated, 'evidence', 'bot-1');
  mkdirSync(botDir, { recursive: true });
  writeFileSync(join(botDir, 'result.ndjson'), resultLines());
  const { report } = await runTour(tourTools({ tourResult: null }), { isolated, files });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.steps.find(step => step.id === '14').status, 'FAIL');
});

test('without a full scenario only real admission is proven and the whole run stays blocked', async () => {
  const tools = tourTools();
  const { report, status } = await runTour(tools, { scenarioDll: undefined, durationMs: 20 });
  assert.equal(status('04'), 'PASS');
  for (const step of report.steps.slice(4)) assert.equal(step.status, 'BLOCKED_ENV');
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.ok(!tools.events.some(event => event.kind === 'start' && event.args.includes('--scenario')));
});

const ADMISSION_SCENARIO = 'Lumio.Bomber.Bots.BomberAdmissionScenario';
const admissionResult = (passed = true) => [
  JSON.stringify({ kind: 'assert', bot: 'bot-0', step: 1, passed, failed: passed ? '' : 'self_bound' }),
  JSON.stringify({ kind: 'run', bots: 1, ticks: 1, uplinks: 0,
    commandStreamSha256: 'a'.repeat(64), passed }),
  '',
].join('\n');

function admissionTools({ result = admissionResult(), botCode = 0, botSignal = null, dsDies = false, botClosed = true } = {}) {
  const tools = tourTools({ tourResult: null });
  const startLogged = tools.startLogged;
  tools.startLogged = (exe, args, settings) => {
    const state = startLogged(exe, args, settings);
    if (args[0] === '--config') {
      if (dsDies) state.closed = true;
    } else {
      assert.equal(argValue(args, '--scenario-name'), ADMISSION_SCENARIO);
      assert.equal(settings.env?.LumioBotConfigDirectory, argValue(args, '--config-dir'));
      if (result != null) writeFileSync(join(argValue(args, '--log-dir'), 'result.ndjson'), result);
      Object.assign(state, { closed: botClosed, code: botCode, signal: botSignal, error: null });
    }
    return state;
  };
  tools.assertAlive = (state) => { if (state?.config && state.closed) throw new Error('DS exited'); };
  return tools;
}

test('admission-only accepts every independent finite Bot after real admission and natural exit', async () => {
  const tools = admissionTools();
  const { report, status } = await runTour(tools, { admissionOnly: true, bots: 8,
    scenarioDll: undefined });
  assert.equal(report.status, 'PASS');
  assert.equal(report.scope, 'bomber-admission-only');
  assert.equal(status('04'), 'PASS');
  assert.equal(report.admittedBots, 8);
  assert.equal(report.botHostsStarted, 8);
  assert.deepEqual(report.steps.slice(4).map(step => step.status), Array(10).fill('NOT_RUN'));
  const starts = tools.events.filter(event => event.kind === 'start' && event.args.includes('--gameplay'));
  assert.equal(starts.length, 8);
  assert.ok(starts.every(event => argValue(event.args, '--scenario-name') === ADMISSION_SCENARIO));
});

test('admission-only rejects missing, malformed, failed, duplicated and truncated results', async () => {
  for (const result of [null, '', admissionResult().slice(0, -1),
    admissionResult() + admissionResult(), admissionResult(false),
    admissionResult().replace('"passed":true', '"passed":true,"passed":true'),
    admissionResult().replace('"bots":1', '"bots":2'),
    admissionResult().replace('"uplinks":0', '"uplinks":1'),
    admissionResult().replace('"commandStreamSha256":"' + 'a'.repeat(64) + '"', '"commandStreamSha256":"bad"')]) {
    const { report, status } = await runTour(admissionTools({ result }), { admissionOnly: true });
    assert.equal(report.status, 'FAIL');
    assert.equal(status('04'), 'FAIL');
  }
});

test('admission-only rejects nonzero or signaled Bot exits and DS death', async () => {
  for (const change of [{ botCode: 1 }, { botCode: null, botSignal: 'SIGSEGV' }, { dsDies: true }]) {
    const { report } = await runTour(admissionTools(change), { admissionOnly: true });
    assert.equal(report.status, 'FAIL');
  }
});

test('admission-only rejects a Bot that never exits even with a passing result', async () => {
  const { report, status } = await runTour(admissionTools({ botClosed: false }),
    { admissionOnly: true, admissionTimeoutMs: 30 });
  assert.equal(report.status, 'FAIL');
  assert.equal(status('04'), 'FAIL');
});

test('admission-only CLI requires independent hosts and forbids full-match selection', () => {
  assert.equal(parseLaunchArgs(['--admission-only'], {}).admissionOnly, true);
  assert.throws(() => parseLaunchArgs(['--admission-only', '--fleet-per-process', '2'], {}), /fleet-per-process/);
  assert.throws(() => parseLaunchArgs(['--admission-only', '--scenario-dll', 'x'], {}), /scenario-dll/);
  for (const count of [1, 7, 9])
    assert.throws(() => parseLaunchArgs(['--admission-only', '--bots', String(count)], {}), /requires --bots 8/);
  assert.throws(() => parseLaunchArgs(['--admission-only'], { LUMIO_BOTS: '1' }), /requires --bots 8/);
});

test('admission-only direct calls require eight owned processes before any side effects', async () => {
  for (const bots of [1, 7, 9]) {
    const tools = admissionTools();
    await assert.rejects(() => runTour(tools, { admissionOnly: true, bots }), /requires --bots 8/);
    assert.deepEqual(tools.events, []);
  }
  await assert.rejects(() => runTour(admissionTools(), {
    admissionOnly: true, bots: undefined, env: { LUMIO_BOTS: '1' },
  }), /requires --bots 8/);
});

test('admission-only preflight failures keep the full match outside the evaluated scope', async () => {
  for (const missing of ['dsExe', 'botHost']) {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-admission-preflight-'));
    const files = tourFiles(isolated);
    rmSync(files.engine.layout[missing]);
    const { report } = await runTour(admissionTools(), { isolated, files, admissionOnly: true });
    assert.equal(report.status, 'BLOCKED_ENV');
    assert.deepEqual(report.steps.slice(4).map(step => step.status), Array(10).fill('NOT_RUN'));
  }
});

function judge(change = {}) {
  return judgeTourSteps({ dsStdout: TOUR_DS_READY, dsLogs: GREEN_BOOT_LOGS,
    botAdmit: { admitted: true, scopeActivated: true }, botResult: resultLines(), ...change });
}
test('DS and Bot positive evidence is required for every match step', () => {
  assert.ok(judge().every(step => step.status === 'PASS'));
  const steps = ['06', '07', '08', '09', '10', '11', '12', '13', '14'];
  for (let index = 0; index < GREEN_EVENTS.length; index++) {
    const remaining = GREEN_EVENTS.filter((_, at) => at !== index);
    const result = judge({ dsLogs: [FRESH_BOOT_LOGS, ...remaining].join('\n') });
    assert.equal(result.find(step => step.id === steps[index]).status, 'FAIL', EVENT_NAMES[index]);
  }
  for (const [id, names] of Object.entries(TOUR_ASSERTIONS)) {
    for (const name of names)
      assert.equal(judge({ botResult: failedResult(name) }).find(step => step.id === id).status, 'FAIL', name);
  }
});

test('next match must start later with a distinct identity in the same world and room', () => {
  for (const replacement of [
    GREEN_EVENTS.at(-1).replace('matchId=2', 'matchId=1'),
    GREEN_EVENTS.at(-1).replace('roomId=room-01', 'roomId=other'),
    GREEN_EVENTS.at(-1).replace('world=1', 'world=2'),
    GREEN_EVENTS.at(-1).replace('gameTick=48', 'gameTick=47'),
  ]) {
    const result = judge({ dsLogs: [FRESH_BOOT_LOGS, ...GREEN_EVENTS.slice(0, -1), replacement].join('\n') });
    assert.equal(result.at(-1).status, 'FAIL');
  }
});

test('events from a different match cannot fill missing gameplay evidence', () => {
  const wrong = GREEN_EVENTS.map(line => line.includes('event=damage_applied') ? line.replace('matchId=1', 'matchId=99') : line);
  assert.equal(judge({ dsLogs: [FRESH_BOOT_LOGS, ...wrong].join('\n') }).find(step => step.id === '10').status, 'FAIL');
});

test('logfmt event records are distinct from quoted text, malformed fields and duplicate keys', () => {
  assert.equal(parseLogfmt('msg="event=damage_applied" cat=ds').event, undefined);
  assert.equal(parseLogfmt('cat=ds msg="unterminated'), null);
  assert.equal(parseLogfmt('event=good event=bad'), null);
  assert.equal(gameplayEvents('cat=ds msg="' + GREEN_EVENTS[4] + '"').length, 0);
  assert.equal(gameplayEvents(GREEN_EVENTS[4] + '\n' + GREEN_EVENTS[4]).length, 1);
  assert.equal(gameplayEvents(GREEN_EVENTS[4] + '\n' + GREEN_EVENTS[4].replace('damage_applied', 'bomb_placed')).length, 0);
  for (const line of [
    GREEN_EVENTS[4].replace('target=' + GAMEPLAY_LOG_TARGET, 'target=other'),
    GREEN_EVENTS[4].replace('lang=cs', 'lang=rs'),
    GREEN_EVENTS[4] + ' truncated=true',
    GREEN_EVENTS[4].replace('world=1', 'world=0'),
    GREEN_EVENTS[4].replace('matchId=1', 'matchId=0'),
    GREEN_EVENTS[4].replace('gameTick=44', 'gameTick=-1'),
    GREEN_EVENTS[4].replace('eventSequence=5', ''),
  ]) assert.equal(gameplayEvents(line).length, 0);
});

test('gameplay evidence consumes the released DS envelope and rejects the invented flat category shape', () => {
  const [actual] = gameplayEvents(GREEN_EVENTS[4]);
  assert.equal(actual.event, 'damage_applied');
  assert.equal(actual.world, '1');
  assert.equal(actual.gameTick, '44');
  assert.equal(gameplayEvents('cat=bomber.gameplay event=damage_applied world=1 roomId=room-01 matchId=1 gameTick=44 eventSequence=5').length, 0);
  assert.equal(gameplayEvents('level=INFO lang=cs target=' + GAMEPLAY_LOG_TARGET
    + ' world=1 tick=44 msg=' + JSON.stringify('msg="event=damage_applied" roomId=room-01 matchId=1 gameTick=44 eventSequence=5')).length, 0);
});

test('base-map gate requires the initial restore marker, voxel profile and active replica scope', () => {
  for (const change of [
    { dsLogs: GREEN_EVENTS.join('\n') },
    { dsLogs: GREEN_BOOT_LOGS + '\n' + RESTORED_BOOT_LOGS },
    { dsStdout: TOUR_DS_READY.replace('runtime+voxel', 'runtime-only') },
    { botAdmit: { admitted: true, scopeActivated: false } },
  ]) assert.equal(judge(change)[0].status, 'FAIL');
});

test('scenario result must have one closing run after one consistent assertion record', () => {
  assert.equal(scenarioVerdict(parseBotResult(resultLines())).passed, true);
  for (const text of ['', '{}', resultLines({ run: false }), resultLines() + resultLines(),
    resultLines().replace('"bots":1', '"bots":2'), resultLines().replace('"passed":true', '"passed":"true"')])
    assert.equal(scenarioVerdict(parseBotResult(text)).present, false);
});

test('full-match scenario actually declares every assertion consumed by the tour', () => {
  const source = new URL('../Client/Bots/BomberMatchScenario.cs', import.meta.url);
  assert.ok(existsSync(source), 'second-round BomberMatchScenario is not implemented; admission is not a full match');
  const code = readFileSync(source, 'utf8');
  for (const name of new Set(Object.values(TOUR_ASSERTIONS).flat()))
    assert.match(code, new RegExp('sink\\.That\\([^;]*"' + name + '[":]'), name);
});

test('every CLR input the DS needs is BLOCKED_ENV by field when missing, with no fallback path', async () => {
  const engineField = {
    engine_native: 'engineNative',
    assembly: 'hostEntry',
    runtime_config: 'hostEntryRuntimeConfig',
    replication_assembly: 'replicationAssembly',
    ecs_assembly: 'ecsAssembly',
  };
  for (const input of DS_CLR_INPUTS) {
    const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-clr-'));
    const files = tourFiles(isolated);
    if (input.source === 'engine') rmSync(files.engine.layout[engineField[input.field]]);
    if (input.source === 'dotnet') files.hostfxr = join(isolated, 'no-dotnet', 'hostfxr.dll');
    if (input.source === 'game') {
      const config = JSON.parse(readFileSync(files.dsConfig, 'utf8'));
      config.clr.registry_assembly = 'missing/Lumio.Bomber.Gameplay.dll';
      writeFileSync(files.dsConfig, `${JSON.stringify(config)}\n`);
    }
    const tools = tourTools();
    const { status, detail } = await runTour(tools, { isolated, files });
    assert.equal(status('03'), 'BLOCKED_ENV', input.field);
    assert.match(detail('03'), new RegExp(`^DS config clr\\.${input.field} is not a file`));
    assert.ok(!tools.events.some((event) => event.kind === 'start'), `${input.field}: nothing may start`);
  }
});

test('the engine half of clr is the release for this platform, whatever the template says', async () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-tour-release-'));
  const files = tourFiles(isolated);
  const config = JSON.parse(readFileSync(files.dsConfig, 'utf8'));
  for (const field of ['engine_native', 'hostfxr', 'assembly', 'runtime_config', 'replication_assembly', 'ecs_assembly']) {
    config.clr[field] = `not-here/${field}`;
  }
  writeFileSync(files.dsConfig, `${JSON.stringify(config)}\n`);
  const tools = tourTools();
  const { status } = await runTour(tools, { isolated, files });
  assert.equal(status('03'), 'PASS');
  const boot1 = tools.events.find((event) => event.kind === 'start' && event.args[0] === '--config');
  assert.equal(boot1.exe, files.engine.layout.dsExe);
  const clr = JSON.parse(readFileSync(boot1.args[1], 'utf8')).clr;
  const { layout } = files.engine;
  assert.equal(clr.hostfxr, files.hostfxr);
  assert.equal(clr.assembly, layout.hostEntry);
  assert.equal(clr.runtime_config, layout.hostEntryRuntimeConfig);
  assert.equal(clr.engine_native, layout.engineNative);
  assert.equal(clr.replication_assembly, layout.replicationAssembly);
  assert.equal(clr.ecs_assembly, layout.ecsAssembly);
  assert.equal(clr.registry_assembly, join(isolated, CLR_FILES.registry_assembly));
  // Bots are the release's Bot.Host with the release's native.
  const bot = tools.events.find((event) => event.kind === 'start' && event.args.includes('--gameplay'));
  assert.equal(bot.args[0], layout.botHost);
  assert.equal(bot.args[bot.args.indexOf('--engine-native') + 1], layout.engineNative);
});

test('parseBotAdmit reports scopeActivated only on the Active+established line that says so', () => {
  assert.equal(parseBotAdmit(admitLine('Bot1')).scopeActivated, true);
  assert.equal(parseBotAdmit(admitLine('Bot1').replace('scopeActivated=True', 'scopeActivated=False').replace('True True True', 'True False True')).scopeActivated, false);
  assert.equal(parseBotAdmit('').scopeActivated, false);
});

test('CLI parses the tour flags and refuses bad values', () => {
  const options = parseLaunchArgs(
    ['--scenario-dll', 'Bots.dll', '--tour-ticks', '900', '--checkpoint-seconds', '15', '--login-prefix', 'Tour'],
    {},
  );
  assert.equal(options.scenarioDll, 'Bots.dll');
  assert.equal(options.tourTicks, 900);
  assert.equal(options.checkpointSeconds, 15);
  assert.equal(options.loginPrefix, 'Tour');
  const fromEnv = parseLaunchArgs([], { LUMIO_SCENARIO_DLL: 'env.dll', LUMIO_CHECKPOINT_SECONDS: '20', LUMIO_LOGIN_PREFIX: 'Acct' });
  assert.equal(fromEnv.scenarioDll, 'env.dll');
  assert.equal(fromEnv.checkpointSeconds, 20);
  assert.equal(fromEnv.tourTicks, undefined);
  assert.equal(parseLaunchArgs(['--tour-ticks', '900', '--timeout-ms', '7000'], {}).tourTimeoutMs, 7000);
  assert.equal(parseLaunchArgs([], {}).checkpointSeconds, undefined);
  assert.throws(() => parseLaunchArgs(['--checkpoint-seconds', '0'], {}), /checkpoint-seconds/);
  assert.throws(() => parseLaunchArgs(['--tour-ticks', '-1'], {}), /tour-ticks/);
  assert.throws(() => parseLaunchArgs(['--login-prefix', '9x'], {}), /login-prefix/);
  assert.deepEqual(planLaunchLogins(2, { loginPrefix: 'Tour' }), ['Tour1', 'Tour2']);
});

test('the fourteen steps have one driver: tour-run.mjs is gone and nothing points at it', () => {
  assert.equal(existsSync(new URL('tour-run.mjs', import.meta.url)), false);
  const root = resolve(HERE, '..');
  const texts = [
    join(root, 'README.md'),
    join(root, '.spec', 'knowledge', 'features', 'bomber-tour.md'),
    join(root, 'Tools', 'README.md'),
    ...readdirSync(HERE).filter((name) => name.endsWith('.mjs')).map((name) => join(HERE, name)),
  ];
  for (const path of texts) {
    if (path.endsWith('launcher.test.mjs')) continue;
    assert.doesNotMatch(readFileSync(path, 'utf8'), /tour-run/, path);
  }
});

test('Platform host port: LUMIO_PLATFORM_HOST_PORT wins, else 8080 when free, else an ephemeral port', async () => {
  const never = async () => { throw new Error('must not probe'); };
  assert.equal(await choosePlatformHostPort({ env: { LUMIO_PLATFORM_HOST_PORT: '18080' }, isFree: never, pickFree: never }), 18080);
  await assert.rejects(
    choosePlatformHostPort({ env: { LUMIO_PLATFORM_HOST_PORT: 'eighty' }, isFree: never, pickFree: never }),
    /BLOCKED_ENV: LUMIO_PLATFORM_HOST_PORT=eighty is not a TCP port/,
  );
  const probed = [];
  assert.equal(await choosePlatformHostPort({ env: {}, isFree: async (p) => { probed.push(p); return true; }, pickFree: never }), 8080);
  assert.deepEqual(probed, [8080]);
  assert.equal(await choosePlatformHostPort({ env: {}, isFree: async () => false, pickFree: async () => 41234 }), 41234);
});

test('failed release verification records the official DS target and preserves the original error', async t => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-defender-release-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const release = fakeEngine(isolated);
  mkdirSync(resolve(release.layout.verifyRelease, '..'), { recursive: true });
  writeFileSync(release.layout.verifyRelease, '');
  let called = 0;
  await assert.rejects(() => runLauncher({ root: isolated, env: {}, rid: release.rid,
    node: () => ({ status: 1, stdout: '', stderr: 'verification rejected' }),
    collectDefenderDiagnostic: async input => {
      called++;
      assert.equal(input.targetPath, release.layout.dsExe);
      return { status: 'unavailable', reason: 'test' };
    }, log() {}, evidenceDir: join(isolated, 'evidence') }), /verify-release rejected/);
  const report = JSON.parse(readFileSync(join(isolated, 'evidence', 'verification.json'), 'utf8'));
  assert.equal(called, 1);
  assert.equal(report.status, 'FAIL');
  assert.match(report.error, /verify-release rejected/);
  assert.equal(report.defenderDiagnostic.status, 'unavailable');
});

test('missing official DS collects after preflight and keeps BLOCKED_ENV', async t => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-defender-missing-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const files = tourFiles(isolated);
  rmSync(files.engine.layout.dsExe);
  const calls = [];
  const { report } = await runTour(tourTools(), { isolated, files,
    collectDefenderDiagnostic: async input => { calls.push(input); return { status: 'no-related-events' }; } });
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.match(report.steps.find(step => step.id === '03').detail, /missing from the Engine/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].targetPath, files.engine.layout.dsExe);
  assert.equal(report.defenderDiagnostic.status, 'no-related-events');
  assert.deepEqual(JSON.parse(readFileSync(join(isolated, 'evidence', 'verification.json'), 'utf8')), report);
});

test('failed DS spawn and natural DS loss collect after cleanup without replacing failure', async t => {
  for (const failAt of ['spawn', 'runtime']) {
    const isolated = mkdtempSync(join(tmpdir(), `bomber-defender-${failAt}-`));
    t.after(() => rmSync(isolated, { recursive: true, force: true }));
    const files = tourFiles(isolated);
    const tools = tourTools({ dsDiesWithTour: failAt === 'runtime' });
    if (failAt === 'spawn') tools.startLogged = () => { throw new Error('DS spawn refused'); };
    const observations = [];
    const collector = async input => {
      observations.push({ targetPath: input.targetPath,
        cleanups: tools.events.filter(item => item.kind === 'cleanup').length });
      return { status: 'correlated-events', events: [{ eventId: 1117 }] };
    };
    if (failAt === 'spawn') {
      await assert.rejects(() => runTour(tools, { isolated, files,
        collectDefenderDiagnostic: collector }), /DS spawn refused/);
    } else {
      const result = await runTour(tools, { isolated, files, collectDefenderDiagnostic: collector });
      assert.equal(result.report.status, 'FAIL');
      assert.ok(result.report.steps.slice(4).every(step => step.detail.includes('lumio-ds exited')));
    }
    const report = JSON.parse(readFileSync(join(isolated, 'evidence', 'verification.json'), 'utf8'));
    assert.equal(report.status, 'FAIL');
    assert.equal(report.defenderDiagnostic.status, 'correlated-events');
    assert.equal(observations.length, 1);
    assert.equal(observations[0].targetPath, files.engine.layout.dsExe);
    assert.equal(observations[0].cleanups, failAt === 'runtime' ? 3 : 0);
    if (failAt === 'spawn') assert.match(report.error, /DS spawn refused/);
  }
});

test('collector failure cannot replace the original DS spawn error', async t => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-defender-collector-failure-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const files = tourFiles(isolated);
  const tools = tourTools();
  tools.startLogged = () => { throw new Error('original DS spawn error'); };
  await assert.rejects(() => runTour(tools, { isolated, files,
    collectDefenderDiagnostic: async () => { throw new Error('private collector details'); } }),
  /original DS spawn error/);
  const report = JSON.parse(readFileSync(join(isolated, 'evidence', 'verification.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.error, 'original DS spawn error');
  assert.equal(report.defenderDiagnostic.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(report.defenderDiagnostic), /private collector details/);
});

test('non-Windows failed launch does not call the Defender collector', async t => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-defender-other-platform-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const files = tourFiles(isolated);
  rmSync(files.engine.layout.dsExe);
  const { report } = await runTour(tourTools(), { isolated, files, platform: 'linux',
    collectDefenderDiagnostic: async () => { throw new Error('must not query Defender'); } });
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.equal(report.defenderDiagnostic.status, 'not-applicable');
});

test('cleanup rejection preserves the original spawn failure and still records its diagnostic', async t => {
  const isolated = mkdtempSync(join(tmpdir(), 'bomber-defender-cleanup-failure-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const files = tourFiles(isolated);
  const tools = tourTools();
  const startLogged = tools.startLogged.bind(tools);
  tools.startLogged = (exe, args, settings) => {
    if (args[0] !== '--config') throw new Error('original Bot spawn failure');
    return startLogged(exe, args, settings);
  };
  let cleanupAttempts = 0;
  tools.forceCleanup = async () => { cleanupAttempts++; throw new Error('fixture cleanup failed'); };
  await assert.rejects(() => runTour(tools, { isolated, files,
    collectDefenderDiagnostic: async () => {
      assert.equal(cleanupAttempts, 1);
      return { status: 'no-related-events' };
    } }), /original Bot spawn failure/);
  const report = JSON.parse(readFileSync(join(isolated, 'evidence', 'verification.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.error, 'original Bot spawn failure');
  assert.equal(report.defenderDiagnostic.status, 'no-related-events');
});
