import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectVoxelCaptureApi, loadLayout, runCapture, verifyBaseMap } from './capture-basemap.mjs';
import { catalogCoversLayout, loadOfficialCatalog } from './official-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('committed bomber.voxel restores the complete Bomber map and resident air through Engine SDK', () => {
  const evidence = verifyBaseMap();
  const { CellStateSha256, ...counts } = evidence.evidence.verification;
  assert.match(CellStateSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(counts, {
    CheckedCells: 16384, MapLayerCells: 722, FloorCells: 361,
    IronCells: 72, PillarCells: 64, AirCells: 15887,
    WaterCells: 0, PotentialSpaces: 225, BridgeCells: 0, PlazaClearCells: 5,
    ConnectedLandCells: 225,
  });
});

test('all M2 captures restore their own authored SDK geometry and reject a different profile', () => {
  for (const [profile, water, pillars, potential] of [
    ['m2-map-19', 28, 48, 213], ['m2-map-23', 44, 80, 317], ['m2-map-27', 60, 104, 461],
  ]) {
    const output = verifyBaseMap({ profile });
    const counts = output.evidence.verification;
    assert.deepEqual([counts.WaterCells, counts.PillarCells, counts.PotentialSpaces,
      counts.BridgeCells, counts.PlazaClearCells, counts.ConnectedLandCells],
    [water, pillars, potential, 4, 9, potential]);
    const other = profile === 'm2-map-19' ? 'm2-map-23' : 'm2-map-19';
    assert.throws(() => verifyBaseMap({ profile: other, out: output.path }), /BASEMAP_CELL_MISMATCH|M2_GEOMETRY_MISMATCH/);
  }
});

test('two SDK author processes reproduce each committed M2 snapshot byte for byte', () => {
  const output = mkdtempSync(join(tmpdir(), 'bomber-m2-capture-'));
  for (const profile of ['m2-map-19', 'm2-map-23', 'm2-map-27']) {
    const captured = runCapture({ profile, out: join(output, `${profile}.voxel`) });
    assert.equal(captured.evidence.independentCaptures, 2);
    assert.deepEqual(readFileSync(captured.path), readFileSync(join(ROOT, 'Server/Assets/Maps', `${profile}.voxel`)));
  }
});

test('two independent author invocations produce identical complete captures and verify fresh restores', () => {
  const output = mkdtempSync(join(tmpdir(), 'bomber-capture-'));
  const first = runCapture({ out: join(output, 'first.voxel') });
  const second = runCapture({ out: join(output, 'second.voxel') });
  assert.equal(first.evidence.independentCaptures, 2);
  assert.equal(second.evidence.independentCaptures, 2);
  const a = readFileSync(first.path);
  const b = readFileSync(second.path);
  assert.deepEqual(a, b);
  assert.deepEqual(a, readFileSync(join(ROOT, 'Server/Assets/Maps/bomber.voxel')));
  assert.equal(first.sha256, createHash('sha256').update(b).digest('hex'));
});

test('a corrupted snapshot fails actual SDK Restore', () => {
  const output = mkdtempSync(join(tmpdir(), 'bomber-corrupt-'));
  const bytes = readFileSync(join(ROOT, 'Server/Assets/Maps/bomber.voxel'));
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  const out = join(output, 'bad.voxel');
  writeFileSync(out, bytes);
  assert.throws(() => verifyBaseMap({ out }), /Restore|snapshot|digest|VoxelNativeException/i);
});

test('layout consumes generated map and block rows without a Sample vein or runtime random content', () => {
  const layout = loadLayout(ROOT);
  assert.equal(layout.width, 19);
  assert.equal(layout.depth, 19);
  assert.equal(layout.boundary, 1);
  assert.equal(layout.groundLayer, 0);
  assert.equal(layout.obstacleLayer, 1);
  assert.equal(layout.pillarStride, 2);
  assert.equal(layout.vein, undefined);
  assert.equal(catalogCoversLayout(loadOfficialCatalog(ROOT), layout), true);
});

test('M2 layouts require an explicit known profile and carry authored geometry', () => {
  for (const [profile, size, radius, branch] of [['m2-map-19', 19, 3, 2], ['m2-map-23', 23, 4, 4], ['m2-map-27', 27, 5, 6]]) {
    const layout = loadLayout(ROOT, { profile });
    assert.deepEqual([layout.width, layout.depth, layout.layoutKind, layout.moatRadius, layout.moatBranchCells],
      [size, size, 'M2Moat', radius, branch]);
  }
  assert.throws(() => loadLayout(ROOT, { profile: '../m2-map-19' }), /profile/i);
  assert.throws(() => loadLayout(ROOT, { profile: 'missing' }), /profile/i);
});

test('gameplay and DS sources do not import author-time map generation', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!name.endsWith('.cs') && !name.endsWith('.csproj')) continue;
      const source = readFileSync(path, 'utf8');
      if (/capture-basemap|bomber\.layout\.json|Lumio\.Bomber\.MapAuthor/.test(source)) hits.push(path);
    }
  };
  walk(join(ROOT, 'Gameplay'));
  assert.deepEqual(hits, []);
  const launcher = readFileSync(new URL('launcher.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(launcher, /from '\.\/capture-basemap\.mjs'/);
  const config = readFileSync(new URL('../Server/Config/Startup/server.json', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /capture-basemap|bomber\.layout\.json|MapAuthor/);
  const project = readFileSync(new URL('Lumio.Bomber.MapAuthor/Lumio.Bomber.MapAuthor.csproj', import.meta.url), 'utf8');
  assert.match(project, /PackageReference Include="Lumio.Engine.SDK"/);
  assert.doesNotMatch(project, /ProjectReference|Engine.*[\\/]tests|fixture/i);
});

test('missing release SDK/native remains BLOCKED_ENV without an alternate snapshot encoder', () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'bomber-capture-missing-'));
  const api = detectVoxelCaptureApi({ repoRoot: isolatedRoot });
  assert.equal(api.capture, false);
  assert.equal(api.restore, false);
  assert.ok(api.missingInputs.length > 0);
  assert.throws(() => runCapture({ repoRoot: isolatedRoot }), (error) => error.code === 'BLOCKED_ENV');
});
