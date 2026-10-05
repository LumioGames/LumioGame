#!/usr/bin/env node

/**
 * Name every game-side input `Tools/test-server-host.mjs` demands, and check the engine-side
 * ones in the Engine/ release, so the two engine-level admit/spawn cases can run in CI
 * (R-00702, ADR-123).
 *
 *   node Tools/prepare-server-host-inputs.mjs \
 *     --gameplay-bin <Gameplay/bin/Release/net10.0> --voxel-fixture <dir> [--config-dir <Server/Config/Tables>]
 *
 * The engine half — HostEntry, the Runtime three-path, the native image — is the Engine/
 * release for this machine's <rid> (the C# cases read it from there themselves; no variable
 * names it). `--gameplay-bin` is this repository's server-side gameplay built against that
 * same release's Lumio.Engine.SDK, which is the only SDK the build knows (ADR-102: HostEntry
 * answers `sdk_version_mismatch` to anything else).
 *
 * The voxel case needs a catalog world authored against the release's own native image. This
 * game authors it itself (R-00785, ADR-117: no engine test fixture): its base map
 * Server/Assets/Maps/bomber.voxel restored on the release native, one public write, one capture
 * (Server/Tests/Gameplay/CatalogWorld.cs). The Gameplay test `CatalogWorldTests` writes the three
 * files when LUMIO_BOMBER_CATALOG_WORLD_OUTPUT names a directory; `--voxel-fixture` is that
 * directory. Its evidence must carry the release native's `binarySha256` — same-source or fail.
 * Nothing here skips: every missing or mismatched input throws with the variable's name.
 */

import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRid, prepareEngine, releaseLayout } from './engine-release.mjs';
import { REQUIRED_ENV } from './test-server-host.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

/** The three files the release's catalog world carries. */
export const FIXTURE_FILES = ['catalog-world.json', 'catalog-world.capture', 'catalog-world-evidence.json'];

export function missing(variable, why) {
  return new Error(`MISSING_INPUT: ${variable} — ${why}. These cases carry engine guarantees (ADR-113): a missing artifact is a failure, never a skip.`);
}

function requireFile(path, variable, why) {
  if (!path) throw missing(variable, why);
  const full = resolve(path);
  if (!existsSync(full) || !statSync(full).isFile()) throw missing(variable, `${why}; not a file: ${full}`);
  return full;
}

function requireDirectory(path, variable, why) {
  if (!path) throw missing(variable, why);
  const full = resolve(path);
  if (!existsSync(full) || !statSync(full).isDirectory()) throw missing(variable, `${why}; not a directory: ${full}`);
  return full;
}

/** The engine files the C# cases load, from the release layout; each must exist. */
export function resolveRelease(layout) {
  const label = 'Engine/ release';
  const hostEntry = requireFile(layout.hostEntry, label, 'server/<rid>/Application/Lumio.Server.HostEntry.dll');
  requireFile(layout.replicationAssembly, label, 'server/<rid>/SDK/Managed/Lumio.GameRuntime.Replication.dll');
  requireFile(layout.ecsAssembly, label, 'server/<rid>/SDK/Managed/Lumio.GameRuntime.Ecs.dll');
  const image = requireFile(layout.engineNative, label, 'server/<rid>/SDK/Native/<rid> native image');
  const sidecar = requireFile(join(dirname(image), 'build-info.json'), label,
    `the image at ${image} has no build-info.json beside it, so its identity cannot be compared`);
  const info = JSON.parse(readFileSync(sidecar, 'utf8'));
  for (const field of ['buildId', 'abiHash', 'binarySha256']) {
    if (typeof info[field] !== 'string' || info[field] === '') throw missing(label, `build-info.json is missing ${field}: ${sidecar}`);
  }
  return { hostEntry, native: { image, sidecar, info } };
}

/** This game's catalog world (--voxel-fixture), and proof it was authored on this very native image. */
export function resolveVoxelFixture(fixtureDirectory, native) {
  const directory = requireDirectory(fixtureDirectory, 'LUMIO_TEST_VOXEL_FIXTURE_DIR',
    'the catalog world this game authors on the release native (--voxel-fixture: the directory '
    + 'LUMIO_BOMBER_CATALOG_WORLD_OUTPUT gave CatalogWorldTests.AuthorsTheWallSceneOnTheReleaseNative)');
  for (const file of FIXTURE_FILES) requireFile(join(directory, file), 'LUMIO_TEST_VOXEL_FIXTURE_DIR', `the catalog world lacks ${file}`);
  const evidence = JSON.parse(readFileSync(join(directory, 'catalog-world-evidence.json'), 'utf8'));
  if (String(evidence.BinarySha256 ?? '').toLowerCase() !== native.info.binarySha256.toLowerCase()) {
    throw new Error(
      'VOXEL_FIXTURE_NATIVE_MISMATCH: the catalog world was authored against a different native image '
      + `(fixture ${evidence.BinarySha256}, release ${native.info.binarySha256}). `
      + 'This is the drift R-00692 hit as load_suspended_missing_voxel; re-author it on this Engine/ release.');
  }
  return { directory, evidence };
}

/**
 * The named game-side values, resolved and checked. Callers get exactly the set
 * `Tools/test-server-host.mjs` requires — no more, no fewer — so a variable added there fails
 * here by name instead of arriving empty.
 */
export function resolveInputs({ gameplayBin, configDir, fixtureDirectory } = {}) {
  const gameplay = requireDirectory(gameplayBin, 'LUMIO_BOMBER_GAMEPLAY_DLL',
    'the server-side Gameplay build output of this run, built against the Engine/ release SDK (ADR-102)');
  const values = {
    LUMIO_BOMBER_GAMEPLAY_DLL: requireFile(join(gameplay, 'Lumio.Bomber.Gameplay.dll'),
      'LUMIO_BOMBER_GAMEPLAY_DLL', 'this run\'s server-side Bomber gameplay assembly'),
    LUMIO_CONFIG_DIR: requireDirectory(configDir ?? join(ROOT, 'Server/Config/Tables'),
      'LUMIO_CONFIG_DIR', 'the server end\'s config export (Server/Config/Tables)'),
    LUMIO_TEST_VOXEL_FIXTURE_DIR: requireDirectory(fixtureDirectory, 'LUMIO_TEST_VOXEL_FIXTURE_DIR',
      'the catalog world authored against the release native image'),
  };
  const names = Object.keys(values).sort();
  const expected = [...REQUIRED_ENV].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `REQUIRED_ENV_DRIFT: Tools/test-server-host.mjs requires ${expected.join(', ')} but this script resolves ${names.join(', ')}. `
      + 'Teach this script the new input; do not let the suite start with an empty one.');
  }
  return values;
}

/** `--gameplay-bin x` → `{ gameplayBin: 'x' }`. Unknown flags are rejected, not ignored. */
export const FLAGS = {
  '--gameplay-bin': 'gameplayBin',
  '--voxel-fixture': 'voxelFixture',
  '--config-dir': 'configDir',
};

export function parseArguments(argv) {
  const usage = `Usage: node Tools/prepare-server-host-inputs.mjs ${Object.keys(FLAGS).map(flag => `${flag} <dir>`).join(' ')}`;
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!Object.hasOwn(FLAGS, flag ?? '') || value === undefined || value.startsWith('--'))
      throw new Error(`${usage}; bad argument near ${flag}`);
    options[FLAGS[flag]] = value;
  }
  return options;
}

/**
 * `layout` is the verified release (prepareEngine) unless a test hands in one; everything
 * engine-side is read from it.
 */
export function prepare({ gameplayBin, configDir, voxelFixture, layout, root = ROOT, env = process.env } = {}) {
  const release = layout ?? prepareEngine({ repoRoot: root }).layout;
  const { native } = resolveRelease(release);
  const fixture = resolveVoxelFixture(voxelFixture, native);
  const values = resolveInputs({ gameplayBin, configDir, fixtureDirectory: fixture.directory });
  if (env.GITHUB_ENV)
    appendFileSync(env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
  return { ...values, rid: release.rid, nativeBuildId: native.info.buildId, nativeSha256: native.info.binarySha256,
    fixtureCaptureSha256: fixture.evidence.captureSha256 };
}

export { hostRid, releaseLayout };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(prepare(parseArguments(process.argv.slice(2))), null, 2));
}
