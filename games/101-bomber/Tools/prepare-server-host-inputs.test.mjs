import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { REQUIRED_ENV } from './test-server-host.mjs';
import {
  FIXTURE_FILES,
  parseArguments,
  prepare,
  releaseLayout,
  resolveInputs,
  resolveRelease,
  resolveVoxelFixture,
} from './prepare-server-host-inputs.mjs';

const BINARY = 'a'.repeat(64);
const scratch = () => mkdtempSync(join(tmpdir(), 'lumio-hostci-'));

/** A fake Engine/ release for linux-x64 carrying what the host cases load, plus the game-authored fixture. */
function releaseTree({ binarySha256 = BINARY, evidenceSha = BINARY, omit = [] } = {}) {
  const layout = releaseLayout(join(scratch(), 'Engine'), 'linux-x64');
  const files = {
    hostEntry: layout.hostEntry,
    replicationAssembly: layout.replicationAssembly,
    ecsAssembly: layout.ecsAssembly,
    engineNative: layout.engineNative,
  };
  for (const [key, path] of Object.entries(files)) {
    if (omit.includes(key)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'binary');
  }
  mkdirSync(dirname(layout.engineNative), { recursive: true });
  if (!omit.includes('sidecar')) {
    writeFileSync(join(dirname(layout.engineNative), 'build-info.json'),
      JSON.stringify({ buildId: 'b'.repeat(32), abiHash: 'c'.repeat(64), binarySha256 }));
  }
  // Authored by this game (CatalogWorldTests with LUMIO_BOMBER_CATALOG_WORLD_OUTPUT), not shipped by the release.
  const fixture = join(dirname(layout.root), 'catalog-world');
  mkdirSync(fixture, { recursive: true });
  for (const file of FIXTURE_FILES) {
    if (omit.includes(file)) continue;
    writeFileSync(join(fixture, file), file.endsWith('evidence.json')
      ? JSON.stringify({ BinarySha256: evidenceSha, captureSha256: 'd'.repeat(64) })
      : 'fixture');
  }
  layout.fixture = fixture;
  return layout;
}

function gameplayTree({ present = true } = {}) {
  const bin = join(scratch(), 'bin');
  mkdirSync(bin, { recursive: true });
  if (present) writeFileSync(join(bin, 'Lumio.Bomber.Gameplay.dll'), 'dll');
  return bin;
}

test('the resolved set is exactly what the suite requires, so a new input cannot arrive empty', () => {
  const fixture = scratch();
  const values = resolveInputs({ gameplayBin: gameplayTree(), fixtureDirectory: fixture });
  assert.deepEqual(Object.keys(values).sort(), [...REQUIRED_ENV].sort());
  // No engine artefact is a variable any more: the cases read Engine/ themselves (ADR-123).
  for (const name of Object.keys(values)) assert.doesNotMatch(name, /HOSTENTRY|RUNTIME_.*_DLL|ENGINE_NATIVE/u);
});

test('a missing gameplay build fails by variable name', () => {
  assert.throws(() => resolveInputs({ gameplayBin: gameplayTree({ present: false }), fixtureDirectory: scratch() }),
    /MISSING_INPUT: LUMIO_BOMBER_GAMEPLAY_DLL/u);
});

test('every engine file the cases load must be in the release; a missing one is a named failure', () => {
  for (const key of ['hostEntry', 'replicationAssembly', 'ecsAssembly', 'engineNative', 'sidecar']) {
    const layout = releaseTree({ omit: [key] });
    assert.throws(() => resolveRelease(layout), /MISSING_INPUT: Engine\/ release/u, key);
  }
  assert.equal(resolveRelease(releaseTree()).native.info.binarySha256, BINARY);
});

test('the game-authored catalog world must be authored on the release native, or it is refused', () => {
  const layout = releaseTree({ evidenceSha: 'e'.repeat(64) });
  const { native } = resolveRelease(layout);
  assert.throws(() => resolveVoxelFixture(layout.fixture, native), /VOXEL_FIXTURE_NATIVE_MISMATCH/u);
  for (const file of FIXTURE_FILES) {
    const partial = releaseTree({ omit: [file] });
    assert.throws(() => resolveVoxelFixture(partial.fixture, resolveRelease(partial).native), /MISSING_INPUT: LUMIO_TEST_VOXEL_FIXTURE_DIR/u, file);
  }
  // No --voxel-fixture at all: named, not skipped, and the release is never searched for one.
  assert.throws(() => resolveVoxelFixture(undefined, native), /MISSING_INPUT: LUMIO_TEST_VOXEL_FIXTURE_DIR.*--voxel-fixture/u);
});

test('prepare exports the game-side values through GITHUB_ENV and names the release identity', () => {
  const layout = releaseTree();
  const githubEnv = join(scratch(), 'github-env');
  writeFileSync(githubEnv, '');
  const result = prepare({ layout, gameplayBin: gameplayTree(), voxelFixture: layout.fixture, env: { GITHUB_ENV: githubEnv } });
  const written = new Map(readFileSync(githubEnv, 'utf8').trim().split('\n').map((line) => line.split('=')));
  assert.deepEqual([...written.keys()].sort(), [...REQUIRED_ENV].sort());
  assert.equal(written.get('LUMIO_TEST_VOXEL_FIXTURE_DIR'), layout.fixture);
  assert.equal(result.nativeSha256, BINARY);
  assert.equal(result.rid, 'linux-x64');
});

test('an empty Engine/ is refused before any input is named', () => {
  const root = scratch();
  assert.throws(() => prepare({ root, gameplayBin: gameplayTree(), env: {} }), /BLOCKED_ENV: Engine\/ is empty/u);
  rmSync(root, { recursive: true, force: true });
});

test('arguments are the game-side inputs; engine paths are not arguments any more', () => {
  assert.deepEqual(parseArguments(['--gameplay-bin', 'a', '--voxel-fixture', 'f', '--config-dir', 'b']), { gameplayBin: 'a', voxelFixture: 'f', configDir: 'b' });
  for (const flag of ['--engine-root', '--hostentry-dir', '--output']) {
    assert.throws(() => parseArguments([flag, 'x']), /bad argument/u);
  }
});
