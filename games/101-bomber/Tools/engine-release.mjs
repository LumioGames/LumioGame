/**
 * The one place this repository takes the engine from: the read-only submodule `Engine/`
 * (LumioEngineRelease pinned at a release tag, ADR-123), or an explicitly selected complete
 * pack-release output for internal validation. Every tool that needs an engine
 * binary, script or compose file resolves it here; there is no sibling checkout, no
 * environment variable naming a loose artefact, and no other platform standing in for the
 * one this machine is.
 *
 * Failure semantics (ADR-123「失败语义」):
 * - Engine/ empty (cloned without --recursive): run `git submodule update --init --depth 1 Engine`
 *   once; still empty is BLOCKED_ENV.
 * - this machine's <rid> not in manifest.platforms: BLOCKED_ENV naming the <rid>, no fall-back.
 * - Engine/tools/verify-release.mjs rejects the tree (sha256 / version mismatch): a hard
 *   failure (`ENGINE_RELEASE_INVALID`), not an environment block.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, join, posix, resolve } from 'node:path';

export const ENGINE_DIR = 'Engine';
export const ENGINE_URL = 'https://github.com/LumioGames/LumioEngineRelease';
/** The exact command ADR-123 prints wherever Engine/ is found empty. */
export const SUBMODULE_INIT_ARGS = Object.freeze(['submodule', 'update', '--init', '--depth', '1', ENGINE_DIR]);
export const SUBMODULE_INIT_COMMAND = `git ${SUBMODULE_INIT_ARGS.join(' ')}`;

export class BlockedEnvError extends Error {
  constructor(message) {
    super(`BLOCKED_ENV: ${message}`);
    this.name = 'BlockedEnvError';
    this.code = 'BLOCKED_ENV';
  }
}

export function blocked(message) {
  return new BlockedEnvError(message);
}

export class EngineReleaseError extends Error {
  constructor(message) {
    super(`ENGINE_RELEASE_INVALID: ${message}`);
    this.name = 'EngineReleaseError';
    this.code = 'ENGINE_RELEASE_INVALID';
  }
}

/**
 * The `RID:` line of `dotnet --info` (the .NET host's own runtime identifier), or null.
 * `dotnet --info` prints it under "Runtime Environment"; a localized SDK still spells the key `RID`.
 */
export function parseDotnetRid(infoText) {
  const match = /^\s*RID:\s*(\S+)\s*$/m.exec(String(infoText ?? ''));
  return match ? match[1] : null;
}

function defaultDotnetInfo(dotnet) {
  return spawnSync(dotnet, ['--info'], { encoding: 'utf8', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
}

const ridCache = new Map();

/**
 * This machine's platform as the release names it: the RID of the .NET that runs the engine's
 * managed half (DS HostEntry, Bot.Host, tests), read from `dotnet --info` (R-00785). Not the node
 * process's own architecture: on an Apple silicon Mac an x64 .NET under Rosetta needs `osx-x64`
 * while node reports arm64. No .NET, or no RID line, is BLOCKED_ENV; there is no guess.
 */
export function hostRid({ dotnet = 'dotnet', info = defaultDotnetInfo } = {}) {
  if (ridCache.has(dotnet) && info === defaultDotnetInfo) return ridCache.get(dotnet);
  const result = info(dotnet);
  const rid = result?.error ? null : parseDotnetRid(result?.stdout);
  if (!rid) {
    const detail = commandText(result).split('\n').slice(-2).join(' | ');
    throw blocked(`cannot tell this machine's .NET RID from "${dotnet} --info"${detail ? ` (${detail})` : ''}; `
      + 'install the .NET SDK named in global.json and put dotnet on PATH.');
  }
  if (info === defaultDotnetInfo) ridCache.set(dotnet, rid);
  return rid;
}

export function engineDir(repoRoot) {
  return join(resolve(repoRoot), ENGINE_DIR);
}

/** `lumio_engine_native` under the host's library naming. */
export function nativeLibraryName(rid) {
  if (rid.startsWith('win-')) return 'lumio_engine_native.dll';
  if (rid.startsWith('osx-')) return 'liblumio_engine_native.dylib';
  return 'liblumio_engine_native.so';
}

/**
 * The ADR-123 release tree, for one platform. Paths only; nothing here checks existence
 * (verify-release.mjs owns that).
 */
export function releaseLayout(root, rid) {
  // Keep POSIX fixture roots stable when the tests run on Windows. A string such as
  // `/g/Bomber/Engine` is intentionally a portable fixture path, not a Windows drive
  // root; `path.resolve` would silently turn it into `C:\g\...` and make the release
  // contract platform-dependent. Real Windows roots (`C:\...`) continue through the
  // native path implementation.
  const portable = typeof root === 'string' && /^\/[^^\\]/.test(root);
  const base = portable ? posix.normalize(root) : resolve(root);
  const pathJoin = portable ? posix.join : join;
  const server = pathJoin(base, 'server', rid);
  const nativeDir = pathJoin(server, 'SDK', 'Native', rid);
  const application = pathJoin(server, 'Application');
  const managed = pathJoin(server, 'SDK', 'Managed');
  const bot = pathJoin(base, 'bot', rid);
  const web = pathJoin(base, 'web');
  const tools = pathJoin(base, 'tools');
  return {
    root: base,
    rid,
    manifest: pathJoin(base, 'manifest.json'),
    sdkFeed: pathJoin(base, 'sdk'),
    server,
    dsExe: pathJoin(server, rid.startsWith('win-') ? 'lumio-ds.exe' : 'lumio-ds'),
    application,
    hostEntry: pathJoin(application, 'Lumio.Server.HostEntry.dll'),
    hostEntryRuntimeConfig: pathJoin(application, 'Lumio.Server.HostEntry.runtimeconfig.json'),
    managed,
    replicationAssembly: pathJoin(managed, 'Lumio.GameRuntime.Replication.dll'),
    ecsAssembly: pathJoin(managed, 'Lumio.GameRuntime.Ecs.dll'),
    nativeDir,
    engineNative: pathJoin(nativeDir, nativeLibraryName(rid)),
    bot,
    botHost: pathJoin(bot, 'Lumio.Client.Bot.Host.dll'),
    web,
    // web/ layout (repository-architecture「引擎发布物」): *.mjs flat, the voxel wasm, and the
    // netstandard2.1 browser replica (ECS replica, client log, spectator C# parts) as DLLs.
    webReplica: pathJoin(web, 'replica', 'netstandard2.1'),
    voxelWasm: pathJoin(web, 'lumio_voxel_wasm.wasm'),
    tools,
    processTools: pathJoin(tools, 'process-tools.mjs'),
    verifyRelease: pathJoin(tools, 'verify-release.mjs'),
    platformCompose: pathJoin(base, 'platform', 'docker-compose.yml'),
  };
}

export function readManifest(root) {
  const path = join(resolve(root), 'manifest.json');
  if (!existsSync(path)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new EngineReleaseError(`${path} is not valid JSON: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || typeof manifest.version !== 'string' || !Array.isArray(manifest.platforms)) {
    throw new EngineReleaseError(`${path} lacks version / platforms (ADR-123 manifest.json).`);
  }
  return manifest;
}

function defaultGit(args, { cwd }) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function defaultNode(args, { cwd }) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

function commandText(result) {
  return `${result?.stdout ?? ''}${result?.stderr ?? ''}${result?.error ? result.error.message : ''}`.trim();
}

/**
 * Engine/ has a manifest, or gets one from exactly one `git submodule update --init --depth 1
 * Engine`. Anything else is BLOCKED_ENV with the command in the message.
 */
export function ensureEngine({ repoRoot, git = defaultGit, log = () => {} } = {}) {
  const dir = engineDir(repoRoot);
  let manifest = readManifest(dir);
  if (manifest) return { dir, manifest, initialized: false };
  log(`Engine/ is empty; running: ${SUBMODULE_INIT_COMMAND}`);
  const result = git([...SUBMODULE_INIT_ARGS], { cwd: resolve(repoRoot) });
  manifest = readManifest(dir);
  if (!manifest) {
    const detail = commandText(result);
    throw blocked(`Engine/ is empty and "${SUBMODULE_INIT_COMMAND}" did not fill it${detail ? ` (${detail.split('\n').slice(-3).join(' | ')})` : ''}. `
      + 'Check network access to github.com/LumioGames/LumioEngineRelease, then re-run that command.');
  }
  return { dir, manifest, initialized: true };
}

export function assertPlatform(manifest, rid) {
  if (!manifest.platforms.includes(rid)) {
    throw blocked(`this machine is ${rid}, and Engine/manifest.json (v${manifest.version}) ships only [${manifest.platforms.join(', ')}]. `
      + 'No other platform is used in its place; switch to a release that lists this platform.');
  }
}

/**
 * Run the release's own verify-release.mjs for one platform. Its CLI is
 * `node <root>/tools/verify-release.mjs --root <root> --rid <rid>` (exit 0 = the tree matches
 * manifest.json). It is the only implementation of that check (R-00781).
 */
export function verifyRelease({ root, rid, node = defaultNode } = {}) {
  const script = join(resolve(root), 'tools', 'verify-release.mjs');
  if (!existsSync(script)) {
    throw new EngineReleaseError(`${script} is missing; this release cannot be verified.`);
  }
  const result = node([script, '--root', resolve(root), '--rid', rid], { cwd: resolve(root) });
  if (result.error || result.status !== 0) {
    throw new EngineReleaseError(`verify-release rejected ${resolve(root)} for ${rid}: ${commandText(result) || `exit ${result.status}`}`);
  }
  return commandText(result);
}

/** Select one complete release, then check its platform and official verifier. Never fall back. */
export function prepareEngine({ repoRoot, releaseRoot, rid = hostRid(), git, node, log } = {}) {
  let selected;
  if (releaseRoot != null) {
    if (typeof releaseRoot !== 'string' || !releaseRoot.trim()) throw blocked('explicit engine release path is empty.');
    const dir = resolve(releaseRoot);
    const manifest = readManifest(dir);
    if (!manifest) throw blocked(`explicit engine release has no manifest: ${dir}`);
    if (manifest.candidateKind != null || manifest.fullRelease === false) {
      throw new EngineReleaseError('the launcher requires a complete release produced by pack-release; browser validation output is insufficient.');
    }
    selected = { dir, manifest, initialized: false };
  } else {
    selected = ensureEngine({ repoRoot, git, log });
  }
  const { dir, manifest, initialized } = selected;
  assertPlatform(manifest, rid);
  verifyRelease({ root: dir, rid, node });
  return { dir, manifest, rid, initialized, layout: releaseLayout(dir, rid) };
}

function versionKey(name) {
  return name.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? part.padStart(8, '0') : part)).join('.');
}

function whichDotnet(dotnet, env) {
  if (dotnet.includes('/') || dotnet.includes('\\')) return existsSync(dotnet) ? dotnet : null;
  const names = process.platform === 'win32' ? [`${dotnet}.exe`, dotnet] : [dotnet];
  for (const dir of String(env.PATH ?? env.Path ?? '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (dir && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

/**
 * hostfxr of this machine's .NET install (ADR-123: taken from the local dotnet, not from a
 * variable). DOTNET_ROOT when set, else the directory of the `dotnet` on PATH; the highest
 * host/fxr/<version>/ wins.
 */
export function resolveHostfxr({ dotnet = 'dotnet', env = process.env, platform = process.platform } = {}) {
  const roots = [];
  if (env.DOTNET_ROOT) roots.push(resolve(env.DOTNET_ROOT));
  const exe = whichDotnet(dotnet, env);
  if (exe) {
    try { roots.push(dirname(realpathSync(exe))); } catch { roots.push(dirname(exe)); }
  }
  const file = platform === 'win32' ? 'hostfxr.dll' : platform === 'darwin' ? 'libhostfxr.dylib' : 'libhostfxr.so';
  for (const root of roots) {
    const fxr = join(root, 'host', 'fxr');
    if (!existsSync(fxr)) continue;
    const versions = readdirSync(fxr).filter((name) => existsSync(join(fxr, name, file))).sort((a, b) => versionKey(b).localeCompare(versionKey(a)));
    if (versions.length > 0) return join(fxr, versions[0], file);
  }
  throw blocked(`hostfxr (${file}) was not found under ${roots.length ? roots.map((root) => join(root, 'host', 'fxr')).join(', ') : 'any dotnet on PATH'}; install the .NET SDK named in global.json.`);
}
