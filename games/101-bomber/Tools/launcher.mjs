#!/usr/bin/env node

/**
 * The one fourteen-step driver (S-3 / R-00520; ADR-115 acceptance: `node Tools/launcher.mjs`).
 *
 * Real topology: Platform compose + lumio-ds + N C# Bot.Host processes, staggered
 * admit, unique launch tickets. The engine half of every one of them comes from the Engine/
 * submodule (ADR-123): Engine/tools/verify-release.mjs checks this machine's <rid> first, then
 * lumio-ds / HostEntry / the Runtime three-path / native come from Engine/server/<rid>/, Bot.Host
 * from Engine/bot/<rid>/, process-tools from Engine/tools/ and Platform from
 * `docker compose -f Engine/platform/docker-compose.yml` with this game's Tools/compose/ inputs.
 * The game half (gameplay build, tables, maps, scenario assembly) is this repository's. The run
 * directory (configs, store, logs) is under the gitignored .run/.
 * An empty Engine/ is filled once with `git submodule update --init --depth 1 Engine`; still
 * empty, or this <rid> not in the manifest, is BLOCKED_ENV (exit 2). Nothing falls back.
 * Bot.Host production mode requires --gameplay (Client FoundationHostCommand).
 *
 * Bot 1 runs BomberMatchScenario through settlement and the next match in the same room.
 * Steps 05–14 require DS structured events and its complete result.ndjson.
 * Bots 2..N run BomberMatchPeerScenario for Game inputs and remain connected until cleanup.
 * Cleanup is never proof of a completed match.
 * --spectator mints one extra loginAndLaunch ticket; it does not start a Bot.Host for that
 * ticket. Once step 04 passes, the launcher serves the published spectator bundle on loopback
 * and writes that ticket into the served index.html as `window.__lumioLaunch` (the page's
 * local test mode), then prints the page URL. The URL never carries the ticket.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINDING_FIELDS, loginAndLaunch } from './account-client.mjs';
import { LOGIN_NAME_PATTERN, UNBOUND_SENTINEL, resolveBotToolCredential, resolvePassword } from './bot-credential.mjs';
import { buildBotArgs, buildServerArgs, findDsReady, redactArgs, resolveDsEndpoint } from './ds-ready.mjs';
import { assertDsClrInputs, assertRunnableDsConfig, deriveRunDsConfig, engineClrInputs, writeKernelConfigForRun } from './ds-config.mjs';
import { blocked, engineDir, hostRid, prepareEngine, releaseLayout, resolveHostfxr } from './engine-release.mjs';
import { collectDefenderDiagnostic } from './defender-diagnostic.mjs';
import { loadProcessTools } from './engine-tools.mjs';
import { startPlayerHost } from './player-host.mjs';
import { createClientConfigResponse } from './client-config-host.mjs';
import { prepareSeededConfig, validateMatchSeed } from './seeded-config.mjs';
import { BASE_MAP_REPO_RELATIVE, FROZEN_BASE_MAP_ID, FROZEN_BASE_MAP_VERSION } from './server-profile.mjs';
import {
  DEFAULT_LOGIN_PREFIX,
  formatStep,
  judgeTourSteps,
  ORDINARY_LOGIN_PREFIX,
  planBotLogins,
  TOUR_SCENARIO,
  TOUR_STEPS,
  parseBotResult,
  scenarioVerdict,
} from './tour-steps.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function assertLegacyMapSelection({ root = ROOT, dsConfig, configDir } = {}) {
  const templatePath = resolve(dsConfig ?? join(root, DEFAULT_DS_CONFIG));
  requiredFile(templatePath, 'DS map selection template');
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  if (typeof template.config_dir !== 'string' || !template.config_dir.trim()
      || typeof template.base_map_path !== 'string' || !template.base_map_path.trim()) {
    throw new Error('AUTHOR_ONLY_MAP_SELECTION: config_dir and base_map_path are required for map admission');
  }
  const selectedServer = resolve(dirname(templatePath), template.config_dir);
  const selectedClient = configDir == null ? join(root, CLIENT_TABLES) : resolve(root, configDir);
  const readRow = (directory, side, table) => {
    const file = join(directory, side, `${table}.json`);
    requiredFile(file, `Selected ${side} ${table} table`);
    const rows = JSON.parse(readFileSync(file, 'utf8')).rows;
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.name !== 'default') throw new Error(`Selected ${table} table has no single default row: ${file}`);
    return rows[0];
  };
  for (const [directory, side] of [[selectedServer, 'server'], [selectedClient, 'client']]) {
    const map = readRow(directory, side, 'map');
    const game = readRow(directory, side, 'game');
    if (map.layout_kind !== 'LegacyPillars' || map.width !== 19 || map.depth !== 19
        || game.map_size !== 19 || game.player_count !== 8) {
      throw new Error(`AUTHOR_ONLY_MAP_PROFILE: ${directory} is not the frozen legacy 19/8 room`);
    }
  }
  const frozenPath = resolve(root, BASE_MAP_REPO_RELATIVE);
  const selectedPath = resolve(dirname(templatePath), template.base_map_path);
  requiredFile(frozenPath, 'Frozen legacy base map');
  requiredFile(selectedPath, 'Selected base map');
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  if (template.base_map_id !== FROZEN_BASE_MAP_ID || template.base_map_version !== FROZEN_BASE_MAP_VERSION
      || selectedPath !== frozenPath || template.base_map_content_sha256 !== hash(frozenPath)
      || hash(selectedPath) !== template.base_map_content_sha256) {
    throw new Error('AUTHOR_ONLY_MAP_SNAPSHOT: DS config must bind the frozen legacy map path and content SHA');
  }
}
const DEFAULT_STAGGER_MS = 250;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ACCOUNT = 'Bot1';
const DEFAULT_SPECTATOR_LOGIN = 'Spectator1';
/**
 * The deployable spectator page is the publish output, not the source directory: only the
 * published index.html carries the filled import map that resolves `_framework/dotnet.js`
 * (Client/UI/Spectator/README.md "Static host").
 */
const DEFAULT_SPECTATOR_ROOT = 'Client/UI/Spectator/host/bin/Release/net10.0/publish/wwwroot';
/** The page accepts a plaintext ws: DS only when it was itself loaded from loopback. */
const SPECTATOR_HOST = '127.0.0.1';
const BOOLEAN_FLAGS = new Set(['spectator', 'admissionOnly', 'player']);
const ADMISSION_SCENARIO = 'Lumio.Bomber.Bots.BomberAdmissionScenario';
const ADMISSION_BOT_COUNT = 8;
const DEFAULT_ADMISSION_DLL = 'Client/Bots/bin/Debug/net10.0/Lumio.Bomber.Bots.dll';
const DEFAULT_ADMISSION_TICKS = 3_000;
/** Released Bot.Host delays each scenario owner frame by 16 ms. */
const HOST_FRAME_DELAY_MS = 16;
/** Platform from the release compose (ADR-123 决策 8); the game's three inputs live in Tools/compose/. */
const PLATFORM_PROJECT = 'lumio-bomber-platform';
/** Default host port the release compose publishes; the container itself always listens on 8080. */
const DEFAULT_PLATFORM_HOST_PORT = 8080;
const GAME_PLATFORM_DIR = 'Tools/compose';
const DEFAULT_PLATFORM_TIMEOUT_MS = 180_000;
/** Wall-clock allowance per owner frame when bounding a scenario bot's run, plus a fixed margin. */
const SCENARIO_MS_PER_TICK = 20;
const SCENARIO_MARGIN_MS = 60_000;

/**
 * The committed Bot voxel budget (ADR-101 explicit host configuration). It is ON by default
 * because `server.json` freezes this room at `world_profile=runtime+voxel`: the DS pushes
 * SectionFrames at every bot, and a bot with no voxel sink faults on the first one
 * (`ClientSession.HandleSectionFrame` → `FailSession`, ADR-112 修订 2 ⑨ fail-closed). A
 * default of "off" would ship a fourteen-step launcher that is known to fault at step 04.
 *
 * `--voxel-config off` (or `none` / an empty value) keeps the entity-only bot, which is a
 * stated shape, not a downgrade: a spectator or a pure-movement stress bot owns no voxel world
 * and has no business paying for a prediction session. Its sections then never arrive, so it
 * must only be used against a room that sends none.
 */
const DEFAULT_BOT_VOXEL_CONFIG = 'Server/Assets/Maps/bot-voxel-budget.json';
/** ADR-115: startup config is data under the server end; tables are exported per end. */
const DEFAULT_DS_CONFIG = 'Server/Config/Startup/server.json';
const SERVER_TABLES = 'Server/Config/Tables';
const CLIENT_TABLES = 'Client/Config/Tables';
const VOXEL_CONFIG_OFF = new Set(['off', 'none', 'false', '0', '']);

/**
 * Returns the resolved budget path, or null for the stated entity-only bot. The default lives
 * here and nowhere else, so every entry point — CLI, environment, direct `runLauncher` call —
 * gets the same answer and `off` is the only road to entity-only.
 */
export function resolveBotVoxelConfig(value, root = ROOT) {
  const text = String(value ?? DEFAULT_BOT_VOXEL_CONFIG).trim();
  if (VOXEL_CONFIG_OFF.has(text.toLowerCase())) return null;
  return requiredFile(resolve(root, text), '--voxel-config');
}

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.code = 'USAGE';
  }
}

function requiredValue(value, label) {
  if (value == null || String(value).trim() === '') throw blocked(`${label} is not set.`);
  return String(value).trim();
}

function requiredFile(path, label) {
  const value = requiredValue(path, label);
  if (!existsSync(value)) throw blocked(`${label} does not point to a file: ${value}`);
  return resolve(value);
}

function envFlag(value) {
  if (value == null || String(value).trim() === '') return false;
  const text = String(value).trim().toLowerCase();
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return true;
}

function rejectOfflineInputs(options, environment) {
  if (Object.hasOwn(options, 'offline') || Object.hasOwn(options, 'offlineTicks')) {
    throw new UsageError('offline options are no longer supported; verification requires the Engine and real Bot clients.');
  }
  if (Object.hasOwn(environment, 'LUMIO_OFFLINE')) {
    throw new UsageError('LUMIO_OFFLINE is no longer supported; remove it to run verification against the Engine.');
  }
}

export function parseLaunchArgs(argv = process.argv.slice(2), environment = process.env) {
  rejectOfflineInputs({}, environment);
  const options = {
    bots: Number(environment.LUMIO_BOTS || 8),
    seed: Number(environment.LUMIO_GAME_SEED || 1),
    staggerMs: Number(environment.LUMIO_STAGGER_MS || DEFAULT_STAGGER_MS),
    fleetPerProcess: Number(environment.LUMIO_FLEET_PER_PROCESS || 1),
    durationMs: Number(environment.LUMIO_DURATION_MS || 0),
    origin: environment.LUMIO_PLATFORM_ORIGIN,
    expectedGameReleaseId: environment.LUMIO_EXPECTED_GAME_RELEASE_ID,
    // No --origin: the launcher starts Platform from Engine/platform itself; --no-platform opts out.
    startPlatform: true,
    slug: environment.LUMIO_GAME_SLUG || 'bomber',
    dsConfig: environment.LUMIO_DS_CONFIG || undefined,
    gameplay: environment.LUMIO_GAMEPLAY,
    configDir: environment.LUMIO_CONFIG_DIR,
    configSource: environment.LUMIO_CONFIG_SOURCE,
    voxelConfig: environment.LUMIO_BOT_VOXEL_CONFIG,
    endpoint: environment.LUMIO_DS_ENDPOINT,
    dotnet: environment.LUMIO_DOTNET || 'dotnet',
    timeoutMs: Number(environment.LUMIO_LAUNCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    evidenceDir: environment.LUMIO_LAUNCH_EVIDENCE_DIR,
    spectator: envFlag(environment.LUMIO_SPECTATOR),
    player: false,
    playerCount: 1,
    spectatorUrl: environment.LUMIO_SPECTATOR_URL || undefined,
    spectatorRoot: environment.LUMIO_SPECTATOR_ROOT || undefined,
    spectatorLogin: environment.LUMIO_SPECTATOR_LOGIN || DEFAULT_SPECTATOR_LOGIN,
    spectatorStaticPort: environment.LUMIO_SPECTATOR_STATIC_PORT || undefined,
    scenarioDll: environment.LUMIO_SCENARIO_DLL || undefined,
    admissionOnly: envFlag(environment.LUMIO_ADMISSION_ONLY),
    tourTicks: environment.LUMIO_TOUR_TICKS == null ? undefined : Number(environment.LUMIO_TOUR_TICKS),
    tourTimeoutMs: environment.LUMIO_LAUNCH_TIMEOUT_MS == null
      ? undefined : Number(environment.LUMIO_LAUNCH_TIMEOUT_MS),
    checkpointSeconds: environment.LUMIO_CHECKPOINT_SECONDS ? Number(environment.LUMIO_CHECKPOINT_SECONDS) : undefined,
    // Bot* names need a Platform-issued bot-tool credential; without one (the release compose issues
    // none) the run registers ordinary accounts, so the default command works on a clean machine.
    loginPrefix: environment.LUMIO_LOGIN_PREFIX
      || (resolveBotToolCredential(environment) ? DEFAULT_LOGIN_PREFIX : ORDINARY_LOGIN_PREFIX),
  };
  const names = {
    bots: 'bots',
    seed: 'seed',
    'stagger-ms': 'staggerMs',
    'fleet-per-process': 'fleetPerProcess',
    'duration-ms': 'durationMs',
    origin: 'origin',
    'expected-game-release-id': 'expectedGameReleaseId',
    slug: 'slug',
    'ds-config': 'dsConfig',
    gameplay: 'gameplay',
    'config-dir': 'configDir',
    'config-source': 'configSource',
    'voxel-config': 'voxelConfig',
    endpoint: 'endpoint',
    dotnet: 'dotnet',
    'timeout-ms': 'timeoutMs',
    'evidence-dir': 'evidenceDir',
    'engine-release': 'engineRelease',
    spectator: 'spectator',
    player: 'player',
    'player-count': 'playerCount',
    'spectator-url': 'spectatorUrl',
    'spectator-root': 'spectatorRoot',
    'spectator-login': 'spectatorLogin',
    'spectator-static-port': 'spectatorStaticPort',
    'scenario-dll': 'scenarioDll',
    'admission-only': 'admissionOnly',
    'tour-ticks': 'tourTicks',
    'checkpoint-seconds': 'checkpointSeconds',
    'login-prefix': 'loginPrefix',
  };
  // fleetPerProcess 不带 Ms 后缀,漏在 numeric 集合外会把 "20" 留成字符串,被下面的整数校验误拒。
  const numeric = new Set(['bots', 'seed', 'tourTicks', 'checkpointSeconds', 'fleetPerProcess', 'playerCount']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--no-platform') { options.startPlatform = false; continue; }
    if (!flag.startsWith('--')) throw new UsageError(`unknown option: ${flag}`);
    const key = names[flag.slice(2)];
    if (!key) throw new UsageError(`unknown option: ${flag}`);
    if (BOOLEAN_FLAGS.has(key)) {
      const next = argv[index + 1];
      if (next != null && !String(next).startsWith('--')) {
        options[key] = envFlag(argv[++index]);
      } else {
        options[key] = true;
      }
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new UsageError(`${flag} requires a value`);
    const value = argv[++index];
    options[key] = numeric.has(key) || key.endsWith('Ms') ? Number(value) : value;
    if (key === 'timeoutMs') options.tourTimeoutMs = options.timeoutMs;
  }
  if (options.player) {
    if (![1, 2].includes(options.playerCount)) throw new UsageError('--player-count must be 1 or 2.');
    if (!argv.includes('--bots') && !environment.LUMIO_BOTS) options.bots = 8 - options.playerCount;
    if (options.bots + options.playerCount !== 8) throw new UsageError('--player requires eight total bot and browser slots.');
    if (options.spectator || options.spectatorUrl || options.admissionOnly)
      throw new UsageError('--player cannot combine spectator or admission-only modes.');
    const suffix = Date.now().toString(36);
    if (!argv.includes('--login-prefix') && !environment.LUMIO_LOGIN_PREFIX) options.loginPrefix = `Play${suffix}`;
    if (!argv.includes('--spectator-login') && !environment.LUMIO_SPECTATOR_LOGIN) options.spectatorLogin = `Human${suffix}`;
  }
  else if (argv.includes('--player-count')) throw new UsageError('--player-count requires --player.');
  if (!Number.isInteger(options.bots) || options.bots < 1) throw new UsageError('--bots must be a positive integer.');
  try { validateMatchSeed(options.seed); } catch (error) { throw new UsageError(`--seed: ${error.message}`); }
  if (!Number.isInteger(options.staggerMs) || options.staggerMs < 0) throw new UsageError('--stagger-ms must be a non-negative integer.');
  if (!Number.isInteger(options.fleetPerProcess) || options.fleetPerProcess < 1) throw new UsageError('--fleet-per-process must be an integer of at least 1.');
  if (!Number.isInteger(options.durationMs) || options.durationMs < 0) throw new UsageError('--duration-ms must be a non-negative integer.');
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000) throw new UsageError('--timeout-ms must be an integer of at least 1000.');
  if (options.tourTicks !== undefined && (!Number.isInteger(options.tourTicks) || options.tourTicks < 1)) {
    throw new UsageError('--tour-ticks must be a positive integer.');
  }
  if (options.admissionOnly && options.bots !== ADMISSION_BOT_COUNT) throw new UsageError('--admission-only requires --bots 8.');
  if (options.admissionOnly && options.fleetPerProcess !== 1) throw new UsageError('--admission-only requires --fleet-per-process 1.');
  if (options.admissionOnly && options.scenarioDll) throw new UsageError('--admission-only selects BomberAdmissionScenario; do not pass --scenario-dll.');
  if (options.admissionOnly && options.spectator) throw new UsageError('--admission-only does not include a spectator.');
  if (options.scenarioDll && options.fleetPerProcess !== 1) throw new UsageError('--scenario-dll requires --fleet-per-process 1.');
  if (options.checkpointSeconds !== undefined
    && (!Number.isInteger(options.checkpointSeconds) || options.checkpointSeconds < 1 || options.checkpointSeconds > 3600)) {
    throw new UsageError('--checkpoint-seconds must be an integer between 1 and 3600 (lumio-ds range).');
  }
  // `<prefix>1` must satisfy the account-port grammar; `Bot` is the bot namespace (needs
  // LUMIO_BOT_TOOL_CREDENTIAL), any other prefix registers ordinary accounts.
  if (!LOGIN_NAME_PATTERN.test(`${options.loginPrefix}1`)) throw new UsageError('--login-prefix must make valid login names (letter first, [A-Za-z0-9_-]).');
  options.spectatorLogin = String(options.spectatorLogin || DEFAULT_SPECTATOR_LOGIN).trim();
  if (!options.spectatorLogin) throw new UsageError('--spectator-login must be a non-empty login name.');
  if (options.spectatorStaticPort != null && String(options.spectatorStaticPort).trim() !== '') {
    const port = Number(options.spectatorStaticPort);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      throw new UsageError('--spectator-static-port must be an integer between 0 and 65535.');
    }
  }
  if (options.spectatorUrl) options.spectator = true;
  // An operator-named Platform is used as is; the release compose is only for "no --origin".
  if (options.origin) options.startPlatform = false;
  validateExpectedGameReleaseId(options.expectedGameReleaseId);
  return options;
}

export function planLaunchLogins(bots, {
  spectator = false, spectatorLogin = DEFAULT_SPECTATOR_LOGIN, loginPrefix = DEFAULT_LOGIN_PREFIX, playerCount = 0,
} = {}) {
  const logins = planBotLogins(bots, loginPrefix);
  if (!spectator && !playerCount) return logins;
  const name = String(spectatorLogin || DEFAULT_SPECTATOR_LOGIN).trim() || DEFAULT_SPECTATOR_LOGIN;
  const browserLogins = playerCount === 2 ? [`${name}A`, `${name}B`] : [name];
  for (const login of browserLogins) {
    if (logins.includes(login)) {
      throw new UsageError(`spectator login ${login} collides with planBotLogins(${bots}, ${loginPrefix}).`);
    }
  }
  return [...logins, ...browserLogins];
}

/**
 * `--spectator-url` names a page this launcher does not serve, so it cannot inject a launch
 * into it: such a page only works in Platform mode, i.e. at `/games/<slug>/` on a Platform
 * origin the browser is logged in to. The URL is printed without userinfo, query or fragment.
 */
export function normalizeSpectatorPageUrl(value) {
  const url = new URL(String(value).trim());
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url.href;
}

/**
 * Local test mode of the spectator page (Client/UI/Spectator/README.md): whoever loads the
 * page injects the launch as `window.__lumioLaunch` before main.js runs. The launcher is that
 * loader. The script goes in front of the first <script> (the import map), so it has run
 * before the module script is even fetched. `<` is escaped so no value can close the element.
 */
export function injectSpectatorLaunch(html, launch) {
  if (!launch || typeof launch !== 'object') throw new TypeError('spectator launch is required.');
  const payload = JSON.stringify({
    wsUrl: launch.wsUrl,
    subprotocol: launch.subprotocol,
    admissionCredential: launch.admissionCredential,
    roomId: launch.roomId,
  }).replace(/</g, '\\u003c');
  const script = `<script>window.__lumioLaunch = ${payload};</script>\n`;
  const text = String(html);
  const at = text.search(/<script\b/i);
  if (at < 0) throw new Error('spectator index.html has no <script> to inject the launch in front of.');
  return `${text.slice(0, at)}${script}${text.slice(at)}`;
}

const SPECTATOR_MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

/**
 * Serve the published spectator bundle at `http://127.0.0.1:<port>/` (port 0 = any free one).
 * Every index.html response carries the injected launch and `cache-control: no-store`; every
 * other file is served as is. Loopback only: the served page holds an admission credential.
 */
export function startSpectatorHost({ root, port = 0, launch, configDir }) {
  const absoluteRoot = resolve(root);
  const indexPath = join(absoluteRoot, 'index.html');
  const page = injectSpectatorLaunch(readFileSync(indexPath, 'utf8'), launch);
  const configResponse = createClientConfigResponse(configDir);
  const server = createServer((request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${SPECTATOR_HOST}`).pathname);
      if (configResponse(request, response, pathname)) return;
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(absoluteRoot, `.${pathname}`);
      if (!file.startsWith(`${absoluteRoot}/`) && !file.startsWith(`${absoluteRoot}\\`)) {
        response.writeHead(403); response.end(); return;
      }
      if (file === indexPath) {
        response.writeHead(200, { 'content-type': SPECTATOR_MIME['.html'], 'cache-control': 'no-store' });
        response.end(page);
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end('not found'); return; }
      response.writeHead(200, { 'content-type': SPECTATOR_MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(400); response.end('bad request');
    }
  });
  const listenPort = port == null || String(port).trim() === '' ? 0 : Number(port);
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65_535) {
    throw new UsageError('--spectator-static-port must be an integer between 0 and 65535.');
  }
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(listenPort, SPECTATOR_HOST, () => {
      resolvePromise({ server, url: `http://${SPECTATOR_HOST}:${server.address().port}/` });
    });
  });
}

/**
 * Called once step 04 passed, so the DS the page dials is up. The injected address is the
 * DS endpoint the bots were given (DS_READY / --endpoint), not a second guess at it; the
 * credential and Room are the spectator's own Platform launch fields.
 */
async function hostSpectatorPage({ options, root, endpoint, spectatorSession, report, log, configDir }) {
  const pageRoot = resolve(root, options.spectatorRoot ?? DEFAULT_SPECTATOR_ROOT);
  report.spectatorRoot = pageRoot;
  if (!existsSync(join(pageRoot, 'index.html'))) {
    const reason = `spectator bundle not found: ${join(pageRoot, 'index.html')} (dotnet publish Client/UI/Spectator/host, or --spectator-root)`;
    report.spectatorPage = { status: 'BLOCKED_ENV', reason };
    log(`spectator page BLOCKED_ENV: ${reason}`);
    return null;
  }
  const launch = spectatorSession.launch;
  const host = await startSpectatorHost({
    root: pageRoot,
    configDir,
    port: options.spectatorStaticPort,
    launch: {
      wsUrl: endpoint,
      subprotocol: launch.subprotocol,
      admissionCredential: launch.admissionCredential,
      roomId: launch.roomId,
    },
  });
  report.spectatorUrl = host.url;
  report.spectatorPage = { status: 'HOSTED' };
  log(`spectator-url=${host.url}`);
  return host.server;
}

function assertSpectatorUrlHasNoSecret(url, sessions = []) {
  const text = String(url ?? '');
  if (/[?&#].*(ticket|credential|admission)/i.test(text)) {
    throw new Error('spectator URL must not include an admission credential.');
  }
  for (const session of sessions) {
    const secret = session?.launch?.admissionCredential;
    if (secret && text.includes(secret)) {
      throw new Error('spectator URL must not include an admission credential.');
    }
  }
  return text;
}

export function readSpectatorConnectedFlag(path) {
  if (!path || !existsSync(path)) return false;
  try {
    const text = readFileSync(path, 'utf8').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'connected' || text === 'yes';
  } catch {
    return false;
  }
}

function validateExpectedGameReleaseId(value) {
  if (value == null) return;
  if (typeof value !== 'string' || !value.trim()) {
    throw new UsageError('--expected-game-release-id must be a non-empty string.');
  }
}

export function collectLaunchTickets(sessions, { expectedGameReleaseId } = {}) {
  const tickets = sessions.map((session) => session.launch.admissionCredential);
  const unique = new Set(tickets);
  if (unique.size !== tickets.length) {
    throw new Error('launch tickets must be unique per bot; reuse is forbidden.');
  }
  validateExpectedGameReleaseId(expectedGameReleaseId);
  if (expectedGameReleaseId != null) {
    const refuse = (detail) => {
      const error = new Error(`GAME_RELEASE_BINDING_MISMATCH: ${detail}`);
      error.code = 'GAME_RELEASE_BINDING_MISMATCH';
      throw error;
    };
    if (sessions.length === 0) refuse('no Platform launch responses.');
    const first = sessions[0].launch;
    for (const [index, session] of sessions.entries()) {
      for (const field of BINDING_FIELDS) {
        const value = session.launch[field];
        if (typeof value !== 'string' || !value.trim() || value === UNBOUND_SENTINEL) {
          refuse(`launch ${index + 1} has no bound ${field}.`);
        }
        if (value !== first[field]) refuse(`launch ${index + 1} changed ${field}.`);
      }
    }
    if (first.gameReleaseId !== expectedGameReleaseId) {
      refuse('Platform gameReleaseId differs from the operator expectation.');
    }
  }
  return tickets;
}

const LOG_EXTENSIONS = new Set(['.log', '.ndjson', '.jsonl']);

function listLogFiles(root, result = []) {
  if (!root || !existsSync(root)) return result;
  const info = statSync(root);
  if (info.isFile()) {
    if (LOG_EXTENSIONS.has(extname(root).toLowerCase())) result.push(root);
    return result;
  }
  if (!info.isDirectory()) return result;
  for (const name of readdirSync(root).sort()) {
    listLogFiles(join(root, name), result);
  }
  return result;
}

function readTextIfPresent(path) {
  if (!path || !existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export function collectBotEvidenceText({ evidenceDir, index, child } = {}) {
  const chunks = [];
  if (child?.stdout) chunks.push(String(child.stdout));
  if (evidenceDir && Number.isInteger(index) && index >= 0) {
    chunks.push(readTextIfPresent(join(evidenceDir, `bot-${index + 1}.log`)));
    for (const file of listLogFiles(join(evidenceDir, `bot-${index + 1}`))) {
      chunks.push(readTextIfPresent(file));
    }
  }
  return chunks.join('\n');
}

/** Every post-office log file under one directory, concatenated (lumio-ds `logging.dir`). */
function readLogText(dir) {
  return listLogFiles(dir).map((file) => readTextIfPresent(file)).join('\n');
}

/**
 * Client Bot.Host (ADR-081) writes one lifecycle line per transition:
 * `session state changed {account} {state} {previous} {reason} {generation} {handshakeBegin}
 * {baselineAck} {scopeActivated} {runtimeCommitted}`.
 * Active + reason established is the admit receipt. Process start is not.
 * `scopeActivated` (step 05) is the same Active line saying the baseline scope went live.
 */
export function parseBotAdmit(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  let admitted = false;
  let rejected = false;
  let faulted = false;
  let scopeActivated = false;
  for (const line of lines) {
    if (!line) continue;
    if (line.includes('session login requested')) {
      if (/\baccepted=(False|false)\b/.test(line) || /\sFalse\s*$/.test(line) || /\sFalse\s/.test(line)) {
        rejected = true;
      }
    }
    if (line.includes('session state changed')) {
      const active = /\bstate=Active\b/.test(line) || /\sActive\s/.test(line);
      const established = /\breason=established\b/.test(line) || /\bestablished\b/.test(line);
      if (active && established) {
        admitted = true;
        if (/\bscopeActivated=True\b/.test(line) || /\bestablished \d+ \d+ (?:True|False) True (?:True|False)\b/.test(line)) {
          scopeActivated = true;
        }
      }
      if (/\bstate=Faulted\b/.test(line) || /\bsession_faulted\b/.test(line)) faulted = true;
    }
  }
  return { admitted, rejected, faulted, scopeActivated };
}

export function inspectBotAdmit(source) {
  return parseBotAdmit(typeof source === 'string' ? source : collectBotEvidenceText(source ?? {}));
}

/**
 * R-00588 fleet packing (--fleet-per-process > 1): one Bot.Host owns several accounts;
 * its admission-events.ndjson carries one ticket_accepted line per account. The per-bot
 * dirs do not exist in that layout, so fleet admission is counted per account here.
 */
export function countGroupAdmittedBots(groupDirs) {
  const accounts = new Map();
  for (const dir of groupDirs ?? []) {
    const text = readTextIfPresent(join(dir, 'admission-events.ndjson'));
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (typeof event.account !== 'string' || event.account === 'host') continue;
        const state = event.meaning === 'ticket_accepted' ? 'admitted' : event.meaning === 'rejected' ? 'rejected' : null;
        if (state) accounts.set(event.account, state);
      } catch { /* truncated tail line */ }
    }
  }
  let admitted = 0;
  let rejected = 0;
  for (const state of accounts.values()) {
    if (state === 'admitted') admitted += 1;
    else if (state === 'rejected') rejected += 1;
  }
  return { admitted, rejected, accounts: [...accounts.keys()] };
}

export function countAdmittedBots(bots, { evidenceDir, children = [] } = {}) {
  let admitted = 0;
  const details = [];
  for (let index = 0; index < bots; index += 1) {
    const parsed = inspectBotAdmit({ evidenceDir, index, child: children[index] });
    details.push(parsed);
    if (parsed.admitted && !parsed.rejected && !parsed.faulted) admitted += 1;
  }
  return { admitted, details };
}

async function waitBotsAdmitted({
  bots,
  evidenceDir,
  botChildren,
  liveChildren,
  timeoutMs,
  tools,
  sleepFn,
}) {
  const waitMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  let latest = countAdmittedBots(bots, { evidenceDir, children: botChildren });
  while (Date.now() - started < waitMs) {
    for (const child of liveChildren) tools.assertAlive(child);
    latest = countAdmittedBots(bots, { evidenceDir, children: botChildren });
    if (latest.details.some((item) => item.rejected || item.faulted)) return latest;
    if (latest.admitted === bots) return latest;
    // The tour bot is not in liveChildren (it exits by design once its scenario completes); one
    // that is gone before it was ever admitted will not be admitted later.
    if (botChildren.some((child, index) => child?.closed && !latest.details[index]?.admitted)) return latest;
    // keepAlive: node --test on Linux drops unref'd timers and reports
    // "Promise resolution is still pending but the event loop has already resolved".
    await sleepFn(25, { keepAlive: true });
  }
  return latest;
}

function reportStatusFromSteps(steps) {
  if (steps.some((step) => step.status === 'FAIL')) return 'FAIL';
  if (steps.some((step) => step.status === 'BLOCKED_ENV')) return 'BLOCKED_ENV';
  return 'PASS';
}

async function sleep(ms, { keepAlive = true } = {}) {
  if (ms <= 0) return;
  await new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms);
    if (!keepAlive) timer.unref?.();
  });
}

// Bots are clients: Bot.Host's ReplicaWorld needs the client compile of the gameplay
// (LumioEcsSide=client, output net10.0-client). The server compile (net10.0) is the DS's,
// named by the DS template's registry_assembly, and a bot loading it fails its login
// (GAMEPLAY_CLIENT_MARKER). R-00785.
export const DEFAULT_BOT_GAMEPLAY = 'Gameplay/bin/Debug/net10.0-client/Lumio.Bomber.Gameplay.dll';

/** Browser rooms always run the Game's continuing play scenario, never the tour's scripted deaths. */
export function resolvePlayerBotScenario({ root = ROOT, scenarioDll } = {}) {
  const path = resolve(root, scenarioDll || DEFAULT_ADMISSION_DLL);
  if (!existsSync(path) || !statSync(path).isFile())
    throw blocked(`BOMBER_PLAYER_BOTS_MISSING: build Client/Bots/Lumio.Bomber.Bots.csproj or pass --scenario-dll: ${path}`);
  return path;
}

export function botScenarioSelection({ player = false, admissionOnly = false, index, scenarioDll, ticks, playerBotScenario }) {
  if (playerBotScenario != null && playerBotScenario !== 'movement-sync-preview')
    throw new UsageError('Unknown playerBotScenario.');
  if (playerBotScenario === 'movement-sync-preview' && (!player || admissionOnly))
    throw new UsageError('movement-sync-preview playerBotScenario requires player mode.');
  if (!scenarioDll) return {};
  if (admissionOnly) return { scenarioDll, scenarioName: ADMISSION_SCENARIO, ticks: DEFAULT_ADMISSION_TICKS };
  if (playerBotScenario === 'movement-sync-preview')
    return { scenarioDll, scenarioName: 'Lumio.Bomber.Bots.MovementSyncPreviewScenario' };
  if (player) return { scenarioDll, scenarioName: 'Lumio.Bomber.Bots.BomberPlayScenario' };
  return index === 0
    ? { scenarioDll, scenarioName: TOUR_SCENARIO, ticks }
    : { scenarioDll, scenarioName: 'Lumio.Bomber.Bots.BomberMatchPeerScenario' };
}

export function botScenarioEnvironment({ player = false, index, count, configDir }) {
  if (player && (!Number.isInteger(count) || count <= 0 || !Number.isInteger(index) || index < 0 || index >= count))
    throw new UsageError('player Bot index must identify one of the explicitly configured Bots.');
  return { LumioBotConfigDirectory: configDir, ...(player ? {
    LUMIO_BOMBER_BOT_INDEX: String(index), LUMIO_BOMBER_BOT_COUNT: String(count),
  } : {}) };
}
function defaultGameplayPath(root) {
  return join(root, ...DEFAULT_BOT_GAMEPLAY.split('/'));
}

function holdWindowMs(options) {
  if (Number.isInteger(options.durationMs) && options.durationMs > 0) return options.durationMs;
  if (options.player) return Infinity;
  return options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

function isThenable(value) {
  return value != null && typeof value.then === 'function';
}

function spectatorConnected(options, connectedFlag) {
  if (connectedFlag === true) return true;
  if (typeof options.spectatorConnected === 'function') return options.spectatorConnected() === true;
  if (options.spectatorConnected === true) return true;
  if (options.spectatorConnectedFlagPath) return readSpectatorConnectedFlag(options.spectatorConnectedFlagPath);
  return false;
}

async function waitForAcceptance(options, tools, children) {
  if (!children.length && !options.spectator) return;
  // Resident Bot.Host does not exit. Hold the configured window so
  // record('04','PASS') is not immediately followed by SIGKILL.
  // Spectator mode also stops early when the page reports connected
  // (injected promise/flag in tests — no browser).
  const holdMs = holdWindowMs(options);
  const started = Date.now();
  let connectedFlag = false;
  const connectedPromise = isThenable(options.spectatorConnected)
    ? options.spectatorConnected
    : (isThenable(options.spectatorConnectedPromise) ? options.spectatorConnectedPromise : null);
  if (connectedPromise) {
    connectedPromise.then(() => { connectedFlag = true; }, () => {});
  }
  while (Date.now() - started < holdMs && !options.signal?.aborted) {
    for (const child of children) tools.assertAlive(child);
    if (options.spectator && spectatorConnected(options, connectedFlag)) return;
    await sleep(25, { keepAlive: true });
  }
}

/** A directory this run owns outright: files an earlier run left in a reused evidence dir are not this run's evidence. */
function freshDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
  return path;
}

/** Start lumio-ds on one config and wait for its DS_READY line (null on timeout; throws if it dies). */
async function startDs(tools, dsExe, configPath, logPath, children, timeoutMs) {
  const ds = tools.startLogged(dsExe, buildServerArgs(configPath), { cwd: dirname(dsExe), log: logPath });
  children.push(ds);
  const started = Date.now();
  let ready = findDsReady(ds.stdout);
  while (!ready && Date.now() - started < timeoutMs) {
    tools.assertAlive(ds);
    await sleep(25, { keepAlive: true });
    ready = findDsReady(ds.stdout);
  }
  return { ds, ready };
}

/** Wait for a scenario bot to exit while watched processes stay alive. */
async function waitForExit(state, { timeoutMs, watch = [] }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (watch.some((other) => other.closed)) return 'lost-ds';
    if (state.closed) return 'exited';
    await sleep(25, { keepAlive: true });
  }
  if (watch.some((other) => other.closed)) return 'lost-ds';
  return state.closed ? 'exited' : 'timeout';
}

function admissionResultVerdict(text) {
  // Released Bot.Host writes exactly one assert followed by one run, each newline terminated.
  if (!text || !/^\{[^\n]*\}\r?\n\{[^\n]*\}\r?\n$/.test(text)) return false;
  const verdict = scenarioVerdict(parseBotResult(text));
  if (!verdict.present || !verdict.passed) return false;
  const lines = text.trimEnd().split(/\r?\n/);
  const [assertion, run] = lines.map(line => JSON.parse(line));
  const keys = line => [...line.matchAll(/"([^"\\]+)"\s*:/g)].map(match => match[1]);
  return new Set(keys(lines[0])).size === 5 && keys(lines[0]).length === 5
    && new Set(keys(lines[1])).size === 6 && keys(lines[1]).length === 6
    && Object.keys(assertion).sort().join(',') === 'bot,failed,kind,passed,step'
    && Object.keys(run).sort().join(',') === 'bots,commandStreamSha256,kind,passed,ticks,uplinks'
    && assertion.kind === 'assert' && assertion.bot === 'bot-0'
    && Number.isSafeInteger(assertion.step) && assertion.step >= 0
    && assertion.passed === true && assertion.failed === ''
    && run.kind === 'run' && run.bots === 1 && run.passed === true
    && Number.isSafeInteger(run.ticks) && run.ticks >= 1
    && run.uplinks === 0
    && /^[a-f0-9]{64}$/.test(run.commandStreamSha256);
}

async function runAdmissionOnly({ options, tools, record, evidence, ds, bots }) {
  let failure = '';
  for (const [index, bot] of bots.entries()) {
    const outcome = await waitForExit(bot, {
      timeoutMs: options.admissionTimeoutMs ?? scenarioTimeoutMs(DEFAULT_ADMISSION_TICKS),
      watch: [ds],
    });
    if (outcome !== 'exited') { failure = `bot-${index + 1} ${outcome}`; break; }
    if (bot.error || bot.code !== 0 || bot.signal !== null) {
      failure = `bot-${index + 1} did not exit naturally with code=0 signal=null`;
      break;
    }
    if (!admissionResultVerdict(readTextIfPresent(join(evidence, `bot-${index + 1}`, 'result.ndjson')))) {
      failure = `bot-${index + 1} has missing, malformed, failed or incomplete result.ndjson`;
      break;
    }
    try { tools.assertAlive(ds); } catch { failure = 'lumio-ds exited during admission'; break; }
  }
  record('04', failure ? 'FAIL' : 'PASS', failure || `${bots.length} independent Bot.Host admission scenarios passed and exited naturally; DS alive`);
  for (const step of TOUR_STEPS.slice(4)) record(step.id, 'NOT_RUN', 'admission-only; full match not evaluated');
}

const OUTCOME_NOTES = Object.freeze({
  exited: '',
  timeout: '; scenario bot did not finish in time and was killed',
  'lost-ds': '; lumio-ds exited while the scenario bot was running',
});

function scenarioTimeoutMs(ticks) {
  return ticks * SCENARIO_MS_PER_TICK + SCENARIO_MARGIN_MS;
}

/** Bound a full capped first match, settlement, and the following warmup from the DS-selected export. */
export function resolveTourBudget(runConfig, options = {}) {
  const path = join(requiredValue(runConfig.config_dir, 'DS config_dir'), 'server', 'game.json');
  const table = JSON.parse(readFileSync(requiredFile(path, 'selected server game table'), 'utf8'));
  const row = table.table === 'game' && table.target === 'S' && Array.isArray(table.rows)
    ? table.rows.find(candidate => candidate.name === 'default') : null;
  const fields = ['warmup_ms', 'match_duration_ms', 'podium_ms', 'results_ms'];
  if (!row || !Number.isInteger(row.tick_rate_hz) || row.tick_rate_hz < 1
    || fields.some(field => !Number.isSafeInteger(row[field]) || row[field] < 0)) {
    throw blocked(`selected server game table has no valid default timing row: ${path}`);
  }
  const phaseMs = row.warmup_ms * 2 + row.match_duration_ms + row.podium_ms + row.results_ms;
  const ticks = options.tourTicks ?? Math.ceil((phaseMs + SCENARIO_MARGIN_MS) / HOST_FRAME_DELAY_MS);
  const timeoutMs = options.tourTimeoutMs ?? scenarioTimeoutMs(ticks);
  if (!Number.isSafeInteger(ticks) || ticks < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw blocked(`selected server game table exceeds a finite tour budget: ${path}`);
  }
  return { phaseMs, ticks, timeoutMs };
}

/** The complete scenario remains in one room through settlement and the next match. */
async function runTour(context) {
  const { options, tools, record, evidence, ds, bootLogDirs, tourBot, fleet, tourBudget } = context;
  let outcome = await waitForExit(tourBot, {
    timeoutMs: tourBudget.timeoutMs,
    watch: [ds],
  });
  if (ds.closed) outcome = 'lost-ds';
  if (outcome !== 'exited') await tools.forceCleanup(tourBot);
  const normalExit = outcome === 'exited' && tourBot.code === 0
    && tourBot.signal === null && !tourBot.error;
  const exitNote = outcome === 'exited' && !normalExit
    ? '; scenario bot did not exit naturally with code=0 signal=null and no process error'
    : OUTCOME_NOTES[outcome];
  const steps = judgeTourSteps({
    dsReady: context.dsReady,
    dsStdout: String(ds.stdout ?? ''),
    dsLogs: readLogText(bootLogDirs[0]),
    botAdmit: parseBotAdmit(collectBotEvidenceText({ evidenceDir: evidence, index: 0, child: tourBot })),
    botResult: readTextIfPresent(join(evidence, 'bot-1', 'result.ndjson')),
  });
  for (const step of steps) {
    const status = normalExit ? step.status : 'FAIL';
    record(step.id, status, step.detail + exitNote);
  }
  if (!ds.closed && (fleet.length > 0 || options.spectator === true))
    await waitForAcceptance(options, tools, [ds, ...fleet]);
  for (const bot of fleet) await tools.forceCleanup(bot);
}

function commandOutput(result) {
  return `${result?.stdout ?? ''}${result?.stderr ?? ''}${result?.error ? result.error.message : ''}`.trim();
}

/**
 * Step 02's Platform when the operator named none: the release's own compose file
 * (Engine/platform/docker-compose.yml, image = manifest.platformImage) with this game's three
 * inputs from Tools/compose/ (platform.env, seed-games.sql, games/; R-00780 contract).
 * Docker missing or refusing is BLOCKED_ENV: ADR-123 lists Docker as a prerequisite, it is not
 * this run failing. Returns the origin and a stop() that removes the stack and its data, so a
 * second run never meets the first run's accounts.
 */
/**
 * `docker compose ps -a --format json <service>`: one JSON object per line (compose ≥ 2.21) or one
 * JSON array (older). Returns `{ state, exitCode }` of the games-seed container, or null.
 */
export function seedState(result) {
  if (!result || result.error || result.status !== 0) return null;
  const text = String(result.stdout ?? '').trim();
  if (!text) return null;
  let rows;
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = text.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  }
  const row = rows.find((entry) => entry?.Service === 'games-seed') ?? rows[0];
  if (!row) return null;
  return { state: String(row.State ?? '').toLowerCase(), exitCode: Number(row.ExitCode) };
}

/** True when nothing on this machine is bound to `port` on any interface (docker publishes on 0.0.0.0). */
export function portIsFree(port) {
  return new Promise((resolveFree) => {
    const probe = createTcpServer();
    probe.once('error', () => resolveFree(false));
    probe.listen({ port, host: '0.0.0.0', exclusive: true }, () => probe.close(() => resolveFree(true)));
  });
}

/** An ephemeral port the OS just handed out, released again for docker to take. */
export function ephemeralPort() {
  return new Promise((resolvePort, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen({ port: 0, host: '0.0.0.0', exclusive: true }, () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * Host port for the release Platform: LUMIO_PLATFORM_HOST_PORT when set (the operator's choice is
 * used as given), else 8080 when it is free, else an ephemeral port. Shared CI machines and
 * developer boxes often have 8080 taken (bomber-regression run 36158294967).
 */
export async function choosePlatformHostPort({ env = process.env, isFree = portIsFree, pickFree = ephemeralPort } = {}) {
  const configured = String(env.LUMIO_PLATFORM_HOST_PORT ?? '').trim();
  if (configured !== '') {
    const port = Number(configured);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw blocked(`LUMIO_PLATFORM_HOST_PORT=${configured} is not a TCP port.`);
    }
    return port;
  }
  if (await isFree(DEFAULT_PLATFORM_HOST_PORT)) return DEFAULT_PLATFORM_HOST_PORT;
  return pickFree();
}

export async function startReleasePlatform({
  layout, manifest, root, evidence, log = () => {}, run = spawnSync, fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_PLATFORM_TIMEOUT_MS, env = process.env, hostPort,
}) {
  if (!existsSync(layout.platformCompose)) {
    throw blocked(`${layout.platformCompose} is missing from the Engine/ release.`);
  }
  const gameDir = resolve(root, GAME_PLATFORM_DIR);
  for (const name of ['platform.env', 'seed-games.sql', 'games']) {
    if (!existsSync(join(gameDir, name))) throw blocked(`${join(gameDir, name)} is missing (this game's Platform input).`);
  }
  const port = hostPort ?? await choosePlatformHostPort({ env });
  const origin = `http://127.0.0.1:${port}`;
  const composeEnv = {
    ...env,
    LUMIO_PLATFORM_IMAGE: String(manifest.platformImage ?? ''),
    LUMIO_GAME_PLATFORM_DIR: gameDir,
    LUMIO_PLATFORM_HOST_PORT: String(port),
  };
  const base = ['compose', '-f', layout.platformCompose, '-p', PLATFORM_PROJECT];
  const docker = (args, label) => {
    const result = run('docker', [...base, ...args], { env: composeEnv, encoding: 'utf8', cwd: root });
    if (evidence) writeFileSync(join(evidence, `platform.${label}.log`), commandOutput(result));
    return result;
  };
  const version = run('docker', ['compose', 'version'], { env: composeEnv, encoding: 'utf8' });
  if (version.error || version.status !== 0) {
    throw blocked(`docker compose is not available (${commandOutput(version) || 'docker not found'}); ADR-123 lists Docker as a prerequisite.`);
  }
  const stop = () => { docker(['down', '-v', '--remove-orphans'], 'down'); };
  log(`platform: docker compose -f ${layout.platformCompose} up (image ${composeEnv.LUMIO_PLATFORM_IMAGE || 'from compose'}, game dir ${gameDir}, host port ${port})`);
  const up = docker(['up', '-d'], 'up');
  if (up.error || up.status !== 0) {
    stop();
    throw blocked(`docker compose up failed: ${commandOutput(up).split('\n').slice(-3).join(' | ')}`);
  }
  // games-seed runs once platform is healthy; its exit code is the catalog being in place. It is a
  // one-shot psql that often exits before a `docker compose wait` could attach, and `wait` then finds
  // no container at all (R-00785, linux-x64 run), so poll `ps -a` for its state and exit code instead.
  const deadline = Date.now() + timeoutMs;
  let seed = null;
  for (;;) {
    const listed = docker(['ps', '-a', '--format', 'json', 'games-seed'], 'seed');
    seed = seedState(listed);
    if (seed?.state === 'exited' || seed?.state === 'dead' || Date.now() >= deadline) break;
    await sleep(500, { keepAlive: true });
  }
  if (seed?.state !== 'exited' || seed.exitCode !== 0) {
    const logs = docker(['logs', 'games-seed'], 'seed-logs');
    stop();
    throw blocked(`games-seed did not finish cleanly (${seed ? `state=${seed.state} exit=${seed.exitCode}` : 'no games-seed container'}): `
      + `${commandOutput(logs).split('\n').slice(-3).join(' | ')}`);
  }
  let healthy = false;
  while (!healthy && Date.now() < deadline) {
    try {
      const response = await fetchFn(`${origin}/healthz`);
      healthy = response.ok;
    } catch {
      healthy = false;
    }
    if (!healthy) await sleep(500, { keepAlive: true });
  }
  if (!healthy) {
    stop();
    throw blocked(`Platform at ${origin} did not report /healthz within ${timeoutMs} ms.`);
  }
  return { origin, stop };
}

function printStep(log, id, status, detail) {
  const line = formatStep(id, status, detail);
  log(line);
  return line;
}

function usage() {
  return [
    'Usage: node Tools/launcher.mjs --bots N --seed N [--stagger-ms 250] [--origin url | --no-platform] [--scenario-dll path | --admission-only]',
    '  [--spectator | --player] [--spectator-url url] [--duration-ms ms] [--voxel-config path|off]',
    '  [--tour-ticks 15000] [--checkpoint-seconds s] [--login-prefix Bot]',
    '  [--expected-game-release-id <reviewed product release id>]',
    '  [--config-dir <client export>] [--config-source <authored source for custom seed selection>]',
    '  --seed is an exact uint32 (default 1); the selected release compiler produces immutable matching DS/client exports.',
    'Runs fourteen Bomber steps through settlement and the next match in the same room.',
    '  Bot 1 runs BomberMatchScenario; bots 2..N remain connected as the fleet.',
    `  --admission-only requires --bots 8 and runs ${ADMISSION_SCENARIO} in each independent Bot.Host,`,
    `  using ${DEFAULT_ADMISSION_DLL} by default; it checks finite results and natural exits.`,
    '  Its PASS covers admission only: steps 05–14 are NOT_RUN, not a full match.',
    '  --player reserves seven bots and a separate browser account, serves /play/, and stays running until stopped.',
    '  Browser play requires Client/Bots built against the selected release; --scenario-dll can name that Game assembly.',
    '  --player --player-count 2 reserves six bots and independent browser accounts A and B.',
    '  Each browser connection gets a fresh Platform ticket; publish the browser host before launching.',
    'Engine: use the Engine/ submodule, or --engine-release <complete pack-release output> for internal validation.',
    '  The explicitly selected release supplies DS, SDK, Bot, web and Platform together; browser-only output is rejected.',
    '  Build the game against that same release with eng/select-engine-release.mjs and LumioEngineSelectionProps.',
    '  An empty default Engine/ is',
    '  filled once with `git submodule update --init --depth 1 Engine`; Engine/tools/verify-release.mjs',
    '  then checks this machine\'s platform. lumio-ds, HostEntry and native come from Engine/server/<rid>/,',
    '  Bot.Host from Engine/bot/<rid>/, hostfxr from this machine\'s dotnet.',
    'Platform: without --origin the launcher runs `docker compose -f Engine/platform/docker-compose.yml`',
    '  with this game\'s Tools/compose/ inputs and removes the stack afterwards; --no-platform skips it.',
    '  --expected-game-release-id / LUMIO_EXPECTED_GAME_RELEASE_ID rejects stale or mixed Platform claims before DS startup.',
    '  This is a local operator check; it sends no allocation hint and does not register or publish a release.',
    `Bots carry ${DEFAULT_BOT_VOXEL_CONFIG} by default; this room is world_profile=runtime+voxel,`,
    '  and a bot with no voxel budget faults on its first SectionFrame (ADR-112 修订 2 ⑨, by design).',
    '  --voxel-config off keeps the entity-only bot for a room that sends no Sections.',
    `Game inputs: --gameplay (bot gameplay, default ${DEFAULT_BOT_GAMEPLAY}: the client compile), --scenario-dll (Lumio.Bomber.Bots.dll,`,
    `  built from Client/Bots). Login names: ${DEFAULT_LOGIN_PREFIX}1..N with LUMIO_BOT_TOOL_CREDENTIAL, else ordinary ${ORDINARY_LOGIN_PREFIX}1..N`,
    '  (the release compose issues no bot-tool credential); --login-prefix / LUMIO_LOGIN_PREFIX overrides.',
    'DS config: LUMIO_DS_CONFIG (default Server/Config/Startup/server.json) is a template; each run',
    '  writes its own copy with a fresh store under .run/. LUMIO_PLATFORM_ADMISSION_KEY replaces the',
    '  template\'s local admission key when the Platform is not the release compose.',
    'Spectator: after step 04 the launcher serves the published page (--spectator-root, default',
    `  ${DEFAULT_SPECTATOR_ROOT}) on http://127.0.0.1:<--spectator-static-port|any>/`,
    '  with the spectator ticket injected as window.__lumioLaunch; --spectator-url only prints a page',
    '  it does not serve (Platform mode: /games/<slug>/ on a logged-in Platform origin).',
    'Missing prerequisites exit 2 with VERIFICATION_STATUS=BLOCKED_ENV.',
  ].join('\n');
}

export async function runLauncher(options = {}) {
  rejectOfflineInputs(options, options.env ?? process.env);
  if (options.playerBotScenario != null) {
    if (options.playerBotScenario !== 'movement-sync-preview') throw new UsageError('Unknown playerBotScenario.');
    if (!options.player || options.playerCount !== 2 || options.bots !== 6 || (options.fleetPerProcess ?? 1) !== 1
        || options.admissionOnly || options.spectator || options.spectatorUrl)
      throw new UsageError('movement-sync-preview playerBotScenario requires player:true, playerCount:2, bots:6, fleetPerProcess:1, without admission or spectator mode.');
  }
  const expectedGameReleaseId = options.expectedGameReleaseId ?? (options.env ?? process.env).LUMIO_EXPECTED_GAME_RELEASE_ID;
  validateExpectedGameReleaseId(expectedGameReleaseId);
  const seed = options.seed ?? Number((options.env ?? process.env).LUMIO_GAME_SEED ?? 1);
  try { validateMatchSeed(seed); } catch (error) { throw new UsageError(`--seed: ${error.message}`); }
  const requestedBots = options.bots ?? Number((options.env ?? process.env).LUMIO_BOTS || ADMISSION_BOT_COUNT);
  if (options.admissionOnly && requestedBots !== ADMISSION_BOT_COUNT) throw new UsageError('--admission-only requires --bots 8.');
  if (options.admissionOnly && (options.fleetPerProcess ?? 1) !== 1) throw new UsageError('--admission-only requires --fleet-per-process 1.');
  if (options.admissionOnly && options.scenarioDll) throw new UsageError('--admission-only selects BomberAdmissionScenario; do not pass --scenario-dll.');
  if (options.admissionOnly && options.spectator) throw new UsageError('--admission-only does not include a spectator.');
  if (options.scenarioDll && (options.fleetPerProcess ?? 1) !== 1) throw new UsageError('--scenario-dll requires --fleet-per-process 1.');
  const root = resolve(options.root ?? ROOT);
  const log = options.log ?? ((line) => process.stdout.write(`${line}\n`));
  const env = { ...(options.env ?? process.env) };
  if (options.seed != null) env.LUMIO_GAME_SEED = String(options.seed);
  // ADR-123: the run directory (derived configs, store, DS and bot logs) is under the gitignored .run/.
  const parent = join(root, '.run');
  mkdirSync(parent, { recursive: true });
  const evidence = options.evidenceDir ? resolve(options.evidenceDir) : mkdtempSync(join(parent, 'launch-'));
  mkdirSync(evidence, { recursive: true });
  const reportPath = join(evidence, 'verification.json');
  const report = {
    version: 1,
    status: 'RUNNING',
    scope: options.playerBotScenario === 'movement-sync-preview' ? 'bomber-movement-sync-preview'
      : options.player ? 'bomber-browser-player' : options.admissionOnly ? 'bomber-admission-only' : 'bomber-launcher',
    playerBotScenario: options.playerBotScenario ?? null,
    evidence,
    steps: [],
    seed,
    bots: Number.isInteger(options.bots) ? options.bots : Number(env.LUMIO_BOTS || 8),
    gameReleaseBinding: {
      status: expectedGameReleaseId == null ? 'UNVERIFIED' : 'PENDING',
      expectedGameReleaseId: expectedGameReleaseId ?? null,
    },
  };
  const startedAt = new Date().toISOString();
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const record = (id, status, detail) => {
    if (options.admissionOnly && Number(id) > 4) {
      status = 'NOT_RUN';
      detail = 'admission-only; full match not evaluated';
    }
    const line = printStep(log, id, status, detail);
    report.steps.push({ id, status, detail: detail || '', line });
    return line;
  };
  /** Steps after index `from` (0-based) that this run cannot reach, all with one reason. */
  const recordRest = (from, status, detail) => {
    for (const step of TOUR_STEPS.slice(from)) record(step.id, status, detail);
  };

  let tools;
  let spectatorServer = null;
  let platform = null;
  let defenderTarget = options.engine?.layout?.dsExe ?? null;
  const children = [];
  const manifestPaths = [];
  try {
    const botCount = options.admissionOnly ? requestedBots : options.bots ?? 2;
    const spectatorMode = options.spectator === true || options.player === true;
    const browserCount = options.player ? options.playerCount ?? 1 : spectatorMode ? 1 : 0;
    if (options.player && (![1, 2].includes(browserCount) || botCount + browserCount !== 8))
      throw new UsageError('--player requires one or two browser players and eight total slots.');
    const logins = planLaunchLogins(botCount, {
      spectator: spectatorMode,
      spectatorLogin: options.spectatorLogin,
      loginPrefix: options.loginPrefix,
      playerCount: options.player ? browserCount : 0,
    });
    // Check this before account creation or DS startup: idle generic hosts do not constitute game Bots.
    const playerScenario = options.player ? resolvePlayerBotScenario({ root, scenarioDll: options.scenarioDll }) : null;
    // One password for the whole run (LUMIO_ACCOUNT_PASSWORD, else generated once): step 14
    // re-logs the tour account in after the restart, and a per-call one-shot password cannot.
    const password = resolvePassword(env).password;
    record(
      '01',
      // split-export/1 writes one manifest per end; both have to be on disk
      // before the DS and the Bots can each load their own projection.
      existsSync(join(root, SERVER_TABLES, 'manifest.json')) && existsSync(join(root, CLIENT_TABLES, 'manifest.json'))
        ? 'READY' : 'BLOCKED_ENV',
      'LumioConfig export + typed Reader via M9 loader',
    );
    report.plannedLogins = logins;

    const externalSpectatorPage = spectatorMode
      && options.spectatorUrl != null && String(options.spectatorUrl).trim() !== '';
    if (spectatorMode) {
      report.spectatorLogin = options.spectatorLogin || DEFAULT_SPECTATOR_LOGIN;
      if (externalSpectatorPage) {
        const spectatorUrl = assertSpectatorUrlHasNoSecret(normalizeSpectatorPageUrl(options.spectatorUrl));
        report.spectatorUrl = spectatorUrl;
        report.spectatorPage = { status: 'EXTERNAL' };
        log(`spectator-url=${spectatorUrl}`);
      }
    }

    // Resolve and verify one complete release before starting any engine process.
    // `options.engine` is the prepared release used by orchestration/test callers.
    // A tree verify-release rejects (ENGINE_RELEASE_INVALID) is a failure, not BLOCKED_ENV.
    let release;
    try {
      release = options.engine ?? prepareEngine({ repoRoot: root, releaseRoot: options.engineRelease, rid: options.rid, git: options.git, node: options.node, log });
      tools = options.processTools ?? await loadProcessTools({ engineRoot: release.dir });
    } catch (error) {
      if (error?.code !== 'BLOCKED_ENV') throw error;
      recordRest(1, 'BLOCKED_ENV', error.message);
      report.status = reportStatusFromSteps(report.steps);
      report.error = error.message;
      return report;
    }
    const layout = release.layout;
    defenderTarget = layout.dsExe;
    report.engine = { version: release.manifest?.version ?? null, rid: release.rid, dir: release.dir };

    // Validate the room before starting Platform or minting launch tickets.
    try {
      assertLegacyMapSelection({ root, dsConfig: options.dsConfig, configDir: options.configDir });
    } catch (error) {
      const status = error?.code === 'BLOCKED_ENV' ? 'BLOCKED_ENV' : 'FAIL';
      record('02', status, error.message);
      recordRest(2, 'BLOCKED_ENV', 'waiting for a valid map selection');
      report.status = reportStatusFromSteps(report.steps);
      report.error = error.message;
      return report;
    }

    let origin = options.origin;
    if (!origin && !options.sessions && options.startPlatform === true) {
      try {
        platform = await (options.startReleasePlatform ?? startReleasePlatform)({
          layout, manifest: release.manifest, root, evidence, log, env,
        });
        origin = platform.origin;
      } catch (error) {
        if (error?.code !== 'BLOCKED_ENV') throw error;
        record('02', 'BLOCKED_ENV', error.message.replace(/^BLOCKED_ENV: /, ''));
      }
    }
    report.platformOrigin = origin ?? null;

    let sessions = options.sessions;
    if (!sessions) {
      if (!origin) {
        if (!report.steps.some((step) => step.id === '02')) {
          record('02', 'BLOCKED_ENV', 'no Platform: pass --origin, or leave it out so the launcher starts Engine/platform/docker-compose.yml.');
        }
      } else {
        sessions = [];
        for (const [index, loginName] of logins.entries()) {
          if (index > 0) await sleep(options.staggerMs ?? DEFAULT_STAGGER_MS);
          const session = await (options.loginAndLaunch ?? loginAndLaunch)({
            origin,
            loginName,
            slug: options.slug,
            env,
            password,
            log: (line) => log(line),
          });
          sessions.push(session);
        }
        collectLaunchTickets(sessions, { expectedGameReleaseId });
        record('02', 'PASS', spectatorMode
          ? `${botCount} bot tickets + ${browserCount} ${options.player ? 'player' : 'spectator'} ticket(s)`
          : `${sessions.length} unique launch tickets`);
      }
    } else {
      collectLaunchTickets(sessions, { expectedGameReleaseId });
      record('02', 'PASS', spectatorMode
        ? `${botCount} bot tickets + ${browserCount} ${options.player ? 'player' : 'spectator'} ticket(s)`
        : `${sessions.length} unique launch tickets`);
    }

    if (sessions) {
      if (options.admissionOnly && sessions.length !== botCount) {
        throw new Error(`admission-only requires ${botCount} independent Platform launch tickets; got ${sessions.length}.`);
      }
      report.loginAndLaunchCount = sessions.length;
      report.gameReleaseBinding = {
        status: expectedGameReleaseId == null ? 'UNVERIFIED' : 'MATCHED_LAUNCH_RESPONSE',
        expectedGameReleaseId: expectedGameReleaseId ?? null,
        actualGameReleaseId: sessions[0]?.launch?.gameReleaseId ?? null,
      };
      report.plannedLogins = sessions.map((session) => session.login.loginName);
      if (spectatorMode && report.spectatorUrl) {
        assertSpectatorUrlHasNoSecret(report.spectatorUrl, sessions);
      }
    }

    if (!existsSync(layout.dsExe)) {
      record('03', 'BLOCKED_ENV', `${layout.dsExe} is missing from the Engine/ release.`);
      recordRest(3, 'BLOCKED_ENV', 'waiting for lumio-ds');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }

    const dsExe = layout.dsExe;
    let hostfxr;
    try {
      hostfxr = options.hostfxr ?? resolveHostfxr({ dotnet: options.dotnet || 'dotnet', env });
    } catch (error) {
      if (error?.code !== 'BLOCKED_ENV') throw error;
      record('03', 'BLOCKED_ENV', error.message.replace(/^BLOCKED_ENV: /, ''));
      recordRest(3, 'BLOCKED_ENV', 'waiting for lumio-ds');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    const dsTemplate = requiredFile(options.dsConfig ?? join(root, DEFAULT_DS_CONFIG), 'LUMIO_DS_CONFIG');
    // One run owns one fresh store and one log directory per boot. A reused evidence directory must
    // not hand this run an earlier run's checkpoint (step 05 would boot it instead of the base map)
    // or an earlier run's log lines (every step 05–14 reads them).
    const store = mkdtempSync(join(evidence, 'ds-store-'));
    const bootLogDirs = [freshDir(join(evidence, 'ds-boot-1'))];
    const runConfig = deriveRunDsConfig(JSON.parse(readFileSync(dsTemplate, 'utf8')), {
      templatePath: dsTemplate,
      engineClr: engineClrInputs(layout, hostfxr),
      admissionKey: env.LUMIO_PLATFORM_ADMISSION_KEY,
      storePath: store,
      logDir: bootLogDirs[0],
      launch: sessions?.[0]?.launch,
      checkpointSeconds: options.checkpointSeconds,
    });
    // Select one authored immutable config for the DS and every client. Environment variables
    // alone cannot change a World's authoritative seed; generated exports are never patched.
    const configSelection = await prepareSeededConfig({
      root, releaseRoot: release.dir, seed,
      serverDirectory: runConfig.config_dir,
      clientDirectory: options.configDir == null ? join(root, CLIENT_TABLES)
        : resolve(root, requiredValue(options.configDir, '--config-dir')),
      outputRoot: join(evidence, 'seed-config'),
      authoringRoot: options.configSource,
    });
    runConfig.config_dir = configSelection.serverDirectory;
    report.configSelection = configSelection;
    try {
      assertRunnableDsConfig(runConfig);
    } catch (error) {
      if (error?.code === 'MISSING_VALUE') {
        record('03', 'FAIL', error.message);
        recordRest(3, 'BLOCKED_ENV', 'waiting for a filled DS config');
        report.status = reportStatusFromSteps(report.steps);
        return report;
      }
      throw error;
    }
    try {
      assertDsClrInputs(runConfig);
    } catch (error) {
      if (error?.code !== 'BLOCKED_ENV') throw error;
      record('03', 'BLOCKED_ENV', error.message.replace(/^BLOCKED_ENV: /, ''));
      recordRest(3, 'BLOCKED_ENV', 'waiting for lumio-ds');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    // One DS boot owns this complete match and the following match.
    const bootConfigs = bootLogDirs.map((dir, index) => {
      const path = join(evidence, `server.boot-${index + 1}.json`);
      writeFileSync(path, `${JSON.stringify({ ...runConfig, logging: { ...runConfig.logging, dir } }, null, 2)}\n`);
      return path;
    });
    report.dsStore = store;
    const kernelConfigPath = writeKernelConfigForRun(bootConfigs[0], join(evidence, 'kernel-config.json'));
    const check = tools.command(dsExe, [...buildServerArgs(bootConfigs[0]), '--check-config'], { cwd: dirname(dsExe), log: join(evidence, 'lumio-ds.check-config.log') });
    log(`lumio-ds --check-config\n${check ?? ''}`);
    const boot = await startDs(tools, dsExe, bootConfigs[0], join(evidence, 'lumio-ds.log'), children, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!boot.ready) throw new Error(`Timed out waiting for lumio-ds DS_READY. See ${evidence}.`);
    const ds = boot.ds;
    const endpoint = resolveDsEndpoint(boot.ready, options.endpoint);
    record('03', 'PASS', `endpoint=${endpoint}`);

    if (!existsSync(layout.botHost)) {
      record('04', 'BLOCKED_ENV', `${layout.botHost} is missing from the Engine/ release.`);
      recordRest(4, 'BLOCKED_ENV', 'waiting for Bot.Host Activate');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }

    const gameplayCandidate = options.gameplay || defaultGameplayPath(root);
    if (!existsSync(gameplayCandidate)) {
      record('04', 'BLOCKED_ENV', `bot gameplay assembly not found: ${gameplayCandidate} (build the client side: dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -p:LumioEcsSide=client, or pass --gameplay).`);
      recordRest(4, 'BLOCKED_ENV', 'waiting for Bot.Host Activate');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }

    if (!sessions) throw blocked('no launch tickets; cannot admit bots.');
    if (spectatorMode && sessions.length !== botCount + browserCount) {
      throw new Error(`browser mode requires ${botCount} bot tickets + ${browserCount} browser ticket(s).`);
    }
    const engineNative = requiredFile(layout.engineNative, 'Engine/server/<rid>/SDK/Native native library');
    const gameplay = requiredFile(gameplayCandidate, '--gameplay');
    const dotnet = requiredValue(options.dotnet || 'dotnet', 'LUMIO_DOTNET');
    const botDll = layout.botHost;
    // The DS loads its own S+V tables through server.json#config_dir. Bots are
    // clients, so they get the C export; split-export/1 keeps the two ends in
    // separate directories and the server end carries no client projection.
    const configDir = configSelection.clientDirectory;
    // Resolved once, before any bot starts: a budget file the operator named but that is not
    // there is a launcher error, not N bots each faulting on their first SectionFrame.
    const voxelConfig = resolveBotVoxelConfig(options.voxelConfig, root);
    report.botVoxelConfig = voxelConfig;
    // ADR-112 rev2 ix: against a runtime+voxel DS every admitted connection receives the first
    // SectionFrame, and a bot without a voxel budget session_faults on it. The only road to a
    // budget-less bot is an explicit `off`; against such a DS that is a loud BLOCKED_ENV, never a
    // silently entity-only bot fleet.
    const worldProfile = String(runConfig.world_profile ?? '');
    if (voxelConfig == null && worldProfile.includes('voxel')) {
      record('04', 'BLOCKED_ENV', `--voxel-config / LUMIO_BOT_VOXEL_CONFIG is off (required: DS world_profile=${worldProfile}); bots session_fault on the first SectionFrame without it (ADR-112 rev2 ix).`);
      recordRest(4, 'BLOCKED_ENV', 'waiting for a voxel-capable bot fleet');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    log(voxelConfig
      ? `bot voxel budget: ${voxelConfig}`
      : 'bot voxel budget: entity-only (--voxel-config off); this bot faults if the room sends Sections.');
    // Steps 05–14 are driven by the scenario assembly (Client/Bots, built against a LumioClient
    // checkout). Without it bots still prove step 04, and 05–14 say what is missing.
    let scenarioDll = playerScenario;
    let tourBlocked = null;
    if (options.player) {
      report.botScenario = options.playerBotScenario === 'movement-sync-preview'
        ? 'Lumio.Bomber.Bots.MovementSyncPreviewScenario' : 'Lumio.Bomber.Bots.BomberPlayScenario';
    } else if (options.admissionOnly) {
      const candidate = resolve(root, DEFAULT_ADMISSION_DLL);
      if (!existsSync(candidate)) {
        record('04', 'BLOCKED_ENV', `admission scenario DLL does not exist: ${candidate}`);
        for (const step of TOUR_STEPS.slice(4)) record(step.id, 'NOT_RUN', 'admission-only; full match not evaluated');
        report.status = reportStatusFromSteps(report.steps);
        return report;
      }
      scenarioDll = candidate;
    } else if (options.scenarioDll == null || String(options.scenarioDll).trim() === '') {
      tourBlocked = 'LUMIO_SCENARIO_DLL is not set (Lumio.Bomber.Bots.dll drives steps 05–14).';
    } else if (!existsSync(options.scenarioDll)) {
      tourBlocked = `LUMIO_SCENARIO_DLL does not point to a file: ${options.scenarioDll}`;
    } else {
      scenarioDll = resolve(options.scenarioDll);
    }
    const tourBudget = !options.player && !options.admissionOnly && scenarioDll != null
      ? resolveTourBudget(runConfig, options) : null;
    const botSessions = spectatorMode ? sessions.slice(0, botCount) : sessions;
    const fleetPerProcess = options.fleetPerProcess ?? 1;
    const botChildren = [];
    const fleetGroupDirs = [];
    // R-00588 fleet packing: >1 packs N accounts per Bot.Host via a ticket manifest;
    // 一进程一账号(默认)保持逐 Bot 目录不变。
    const packFleet = !spectatorMode && fleetPerProcess > 1 && botSessions.length > 1;
    const singleBotSessions = packFleet ? botSessions.slice(0, 1) : botSessions;
    for (const [index, session] of singleBotSessions.entries()) {
      if (index > 0) await sleep(options.staggerMs ?? DEFAULT_STAGGER_MS);
      const botLogDir = freshDir(join(evidence, `bot-${index + 1}`));
      const tour = !options.player && !options.admissionOnly && index === 0 && scenarioDll != null;
      const peer = !options.admissionOnly && !tour && scenarioDll != null;
      const args = buildBotArgs({
        botDll,
        endpoint,
        admissionTicket: session.launch.admissionCredential,
        roomId: session.launch.roomId,
        engineNative,
        kernelConfig: kernelConfigPath,
        configDir,
        logDir: botLogDir,
        accountFrom: session.login.loginName,
        accountTo: session.login.loginName,
        gameplay,
        voxelConfig,
        ...botScenarioSelection({ player: options.player, admissionOnly: options.admissionOnly,
          index, scenarioDll, ticks: tourBudget?.ticks, playerBotScenario: options.playerBotScenario }),
      });
      log(`$ ${JSON.stringify([dotnet, ...redactArgs(args, session.launch.admissionCredential)])}`);
      const bot = tools.startLogged(dotnet, args, {
        cwd: dirname(botDll),
        log: join(evidence, `bot-${index + 1}.log`),
        env: { ...env,
          ...(session.launch.subprotocol ? { LUMIO_BOT_WIRE_PROFILE: session.launch.subprotocol } : {}),
          ...(options.admissionOnly || tour || peer
            ? botScenarioEnvironment({ player: options.player, index, count: botSessions.length, configDir }) : {}),
        },
      });
      botChildren.push(bot);
      children.push(bot);
    }
    if (packFleet) {
      // 票清单带凭据:只能落在 gitignored 的 .run 下,收尾删除,绝不进证据目录。
      const manifestRoot = mkdtempSync(join(root, '.run', 'fleet-manifests-'));
      manifestPaths.push(manifestRoot);
      const fleetSessions = botSessions.slice(1);
      for (let start = 0; start < fleetSessions.length; start += fleetPerProcess) {
        if (botChildren.length > 0 || start > 0) await sleep(options.staggerMs ?? DEFAULT_STAGGER_MS);
        const group = fleetSessions.slice(start, start + fleetPerProcess);
        if (group.some(session => session.launch.subprotocol !== group[0].launch.subprotocol))
          throw new Error('Packed Bot accounts must use one Platform launch wire profile.');
        const groupId = `bot-group-${Math.floor(start / fleetPerProcess) + 1}`;
        const groupDir = freshDir(join(evidence, groupId));
        const manifestPath = join(manifestRoot, `${groupId}.json`);
        writeFileSync(manifestPath, `${JSON.stringify({
          platformOrigin: origin,
          game: options.slug,
          accounts: group.map((session) => ({ loginName: session.login.loginName, launch: {
            admissionCredential: session.launch.admissionCredential,
            roomId: session.launch.roomId,
          } })),
        })}\n`);
        const args = buildBotArgs({
          botDll,
          endpoint,
          admissionTicket: manifestPath,
          engineNative,
          kernelConfig: kernelConfigPath,
          configDir,
          logDir: groupDir,
          accountFrom: group[0].login.loginName,
          accountTo: group[group.length - 1].login.loginName,
          gameplay,
          voxelConfig,
        });
        log(`$ ${JSON.stringify([dotnet, ...args])} ; accounts=${group.length}`);
        const bot = tools.startLogged(dotnet, args, {
          cwd: dirname(botDll),
          log: join(evidence, `${groupId}.log`),
          env: { ...env, ...(group[0].launch.subprotocol
            ? { LUMIO_BOT_WIRE_PROFILE: group[0].launch.subprotocol } : {}) },
        });
        fleetGroupDirs.push(groupDir);
        botChildren.push(bot);
        children.push(bot);
      }
      log(`fleet packing: ${fleetSessions.length} accounts in ${fleetGroupDirs.length} Bot.Host processes (${fleetPerProcess} per process)`);
    }
    // The tour bot exits by design once its scenario completes; only the fleet must stay alive.
    const tourBot = !options.player && !options.admissionOnly && scenarioDll != null ? botChildren[0] : null;
    const fleet = tourBot ? botChildren.slice(1) : botChildren;
    let admit;
    try { admit = await waitBotsAdmitted({
      bots: packFleet ? 1 : botSessions.length,
      evidenceDir: evidence,
      botChildren,
      liveChildren: options.admissionOnly ? [ds] : [ds, ...fleet],
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      tools,
      sleepFn: sleep,
    }); } catch (error) {
      if (!options.admissionOnly) throw error;
      record('04', 'FAIL', `DS or admission process failed: ${error.message}`);
      for (const step of TOUR_STEPS.slice(4)) record(step.id, 'NOT_RUN', 'admission-only; full match not evaluated');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    let admittedTotal = admit.admitted;
    if (packFleet) {
      // 组进程内逐账号计数:admission-events 每账号一行 ticket_accepted。
      const groupDeadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      let groupCount = countGroupAdmittedBots(fleetGroupDirs);
      while (groupCount.admitted + groupCount.rejected < botSessions.length - 1 && Date.now() < groupDeadline) {
        for (const child of [ds, ...fleet]) tools.assertAlive(child);
        await sleep(2000);
        groupCount = countGroupAdmittedBots(fleetGroupDirs);
      }
      admittedTotal += groupCount.admitted;
      report.fleetRejected = groupCount.rejected;
      report.fleetGroups = fleetGroupDirs.map((dir) => basename(dir));
    }
    report.requiredBots = botSessions.length;
    report.admittedBots = admittedTotal;
    report.botHostsStarted = botChildren.length;
    if (spectatorMode) {
      report.spectatorLogin = sessions[botCount]?.login?.loginName;
      report.loginAndLaunchCount = sessions.length;
    }
    if (admittedTotal !== botSessions.length) {
      record('04', 'FAIL', `${admittedTotal} of ${botSessions.length} bots admitted (reject/no welcome/timeout)`);
      if (options.admissionOnly) {
        for (const step of TOUR_STEPS.slice(4)) record(step.id, 'NOT_RUN', 'admission-only; full match not evaluated');
      } else recordRest(4, 'BLOCKED_ENV', 'waiting for step 04 (every bot admitted)');
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    if (options.admissionOnly) {
      await runAdmissionOnly({ options, tools, record, evidence, ds, bots: botChildren });
      report.status = reportStatusFromSteps(report.steps);
      return report;
    }
    record('04', 'PASS', spectatorMode
      ? `${admittedTotal} bots admitted; ${options.player ? 'browser player account reserved' : 'spectator ticket held'} without Bot.Host`
      : `${admittedTotal} bots admitted with unique tickets`);
    if (options.player) {
      const players = sessions.slice(botCount);
      const host = await startPlayerHost({
        root: resolve(root, options.spectatorRoot ?? DEFAULT_SPECTATOR_ROOT),
        configDir,
        port: options.spectatorStaticPort ?? 0,
        playerCount: browserCount,
        evidenceDir: options.evidenceDir ? join(evidence, 'player-evidence') : undefined,
        getLaunch: async (index = 0) => {
          const expected = players[index];
          const session = await (options.loginAndLaunch ?? loginAndLaunch)({
            origin, loginName: expected.login.loginName, slug: options.slug, password, env,
          });
          for (const field of BINDING_FIELDS) {
            if (session.launch[field] !== sessions[0].launch[field]) throw new Error(`player binding changed: ${field}`);
          }
          if (session.login.accountId !== expected.login.accountId) throw new Error('player account changed');
          return { wsUrl: endpoint, subprotocol: session.launch.subprotocol,
            admissionCredential: session.launch.admissionCredential, roomId: session.launch.roomId,
            loginName: session.login.loginName };
        },
      });
      spectatorServer = host.server;
      report.playerUrl = host.url;
      report.dsEndpoint = endpoint;
      report.playerLogin = players[0].login.loginName;
      report.roomId = players[0].launch.roomId;
      report.players = players.map((session, index) => ({
        label: String.fromCharCode(65 + index), url: host.urls[index], loginName: session.login.loginName,
      }));
      report.status = 'SERVING';
      recordRest(4, 'NOT_RUN', 'browser player session; full match acceptance not evaluated');
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      log(`player-url=${host.url}`);
      for (const entry of report.players) log(`player-${entry.label}-url=${entry.url}`);
      log(`player-evidence=${evidence}`);
      await waitForAcceptance(options, tools, children);
      return report;
    }
    if (spectatorMode && !externalSpectatorPage) {
      spectatorServer = await hostSpectatorPage({
        options, root, endpoint, spectatorSession: sessions[botCount], report, log, configDir,
      });
      if (report.spectatorUrl) assertSpectatorUrlHasNoSecret(report.spectatorUrl, sessions);
    }
    if (!tourBot) {
      recordRest(4, 'BLOCKED_ENV', tourBlocked);
      report.status = reportStatusFromSteps(report.steps);
      // Hold until the acceptance window ends (or spectator page connects), then let finally forceCleanup.
      await waitForAcceptance(options, tools, children);
      return report;
    }
    report.tourLogin = botSessions[0].login.loginName;
    await runTour({
      options, origin, tools, record, log, report, evidence, children, env, password,
      ds, dsReady: boot.ready, dsExe, bootConfigs, bootLogDirs, runConfig, tourBot, fleet, tourBudget,
      tourLogin: botSessions[0].login.loginName,
      bot: { dotnet, botDll, engineNative, kernelConfigPath, configDir, gameplay, voxelConfig, scenarioDll },
    });
    report.status = reportStatusFromSteps(report.steps);
    return report;
  } catch (error) {
    report.status = error?.code === 'BLOCKED_ENV' || String(error?.message).startsWith('BLOCKED_ENV:')
      ? 'BLOCKED_ENV'
      : 'FAIL';
    report.error = String(error?.message ?? error);
    if (report.status === 'FAIL') {
      log(`DS/Bot failure: ${report.error}`);
      log(`evidence=${evidence}`);
    }
    throw error;
  } finally {
    let cleanupFailure = null;
    if (options.admissionOnly) {
      for (const step of TOUR_STEPS.slice(4)) {
        if (!report.steps.some(recorded => recorded.id === step.id)) record(step.id, 'NOT_RUN');
      }
    }
    if (platform) {
      try { platform.stop(); } catch { /* the stack is best-effort teardown; the report is already decided */ }
    }
    if (spectatorServer) {
      // An open browser tab keeps its connection alive; close() alone would wait for it.
      try {
        spectatorServer.closeAllConnections?.();
        await new Promise((resolvePromise) => spectatorServer.close(() => resolvePromise()));
      } catch (error) { cleanupFailure ??= error; }
    }
    if (tools) {
      for (const child of children.reverse()) {
        try { await tools.forceCleanup(child); } catch (error) { cleanupFailure ??= error; }
      }
    }
    // 票清单目录带凭据:进程全部退出后立即删除,不留副本。
    for (const manifestRoot of manifestPaths) {
      try { rmSync(manifestRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    if (cleanupFailure && !['FAIL', 'BLOCKED_ENV'].includes(report.status)) {
      report.status = 'FAIL';
      report.error = String(cleanupFailure?.message ?? cleanupFailure);
    }
    if (!['PASS', 'SERVING', 'RUNNING'].includes(report.status)) {
      try {
        const diagnosticPlatform = options.platform ?? process.platform;
        if (diagnosticPlatform !== 'win32') {
          report.defenderDiagnostic = { status: 'not-applicable' };
        } else {
          if (!defenderTarget) {
            try { defenderTarget = releaseLayout(engineDir(root), options.rid ?? hostRid()).dsExe; }
            catch { /* the release target cannot be resolved without a host RID */ }
          }
          const collector = options.collectDefenderDiagnostic ?? (options.engine ? null : collectDefenderDiagnostic);
          report.defenderDiagnostic = !defenderTarget
            ? { status: 'unavailable', reason: 'target-unresolved' }
            : collector
              ? await collector({ targetPath: defenderTarget, startedAt, platform: diagnosticPlatform })
              : { status: 'not-applicable', reason: 'injected-release-fixture' };
        }
      } catch {
        report.defenderDiagnostic = { status: 'unavailable', reason: 'collector-failed' };
      }
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`VERIFICATION_STATUS=${report.status}\nEVIDENCE_PATH=${evidence}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseLaunchArgs();
    if (options.help) process.stdout.write(`${usage()}\n`);
    else {
      const controller = new AbortController();
      const stop = () => controller.abort();
      if (options.player) {
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        options.signal = controller.signal;
      }
      try {
        const report = await runLauncher(options);
        process.exitCode = report.status === 'PASS' || report.status === 'SERVING' ? 0 : report.status === 'BLOCKED_ENV' ? 2 : 1;
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    }
  } catch (error) {
    if (error?.code === 'USAGE') {
      process.stderr.write(`${error.message}\n${usage()}\n`);
      process.exitCode = 1;
    } else {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = error?.code === 'BLOCKED_ENV' || String(error?.message).startsWith('BLOCKED_ENV:') ? 2 : 1;
    }
  }
}

export {
  DEFAULT_ACCOUNT,
  DEFAULT_SPECTATOR_LOGIN,
  DEFAULT_SPECTATOR_ROOT,
  TOUR_STEPS,
  formatStep,
  planBotLogins,
  usage,
};
