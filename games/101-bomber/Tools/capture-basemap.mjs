#!/usr/bin/env node

/**
 * Bomber-only author-time generation. The released Engine.SDK owns writes, Capture and Restore.
 * DS boot consumes the committed capture; random bricks/crates/water belong to runtime gameplay.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked, engineDir, hostRid, releaseLayout } from './engine-release.mjs';
import { catalogCoversLayout, loadLayout, loadOfficialCatalog } from './official-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export { loadLayout };
export const LAYOUT_RELATIVE = 'Server/Assets/Maps/bomber.layout.json';
export const AUTHOR_PROJECT = 'Tools/Lumio.Bomber.MapAuthor/Lumio.Bomber.MapAuthor.csproj';
export const MAP_RELATIVE = 'Server/Assets/Maps/bomber.voxel';

export function detectVoxelCaptureApi({ repoRoot = ROOT } = {}) {
  const manifestPath = join(engineDir(repoRoot), 'manifest.json');
  const project = join(repoRoot, AUTHOR_PROJECT);
  const missingInputs = [manifestPath, project].filter((path) => !existsSync(path));
  if (missingInputs.length === 0) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const rid = hostRid();
    if (!manifest.platforms.includes(rid)) throw blocked(`Engine release has no platform ${rid}`);
    const release = releaseLayout(engineDir(repoRoot), rid);
    missingInputs.push(...[
      join(release.sdkFeed, `Lumio.Engine.SDK.${manifest.version}.nupkg`),
      release.engineNative, join(release.nativeDir, 'build-info.json'),
    ].filter((path) => !existsSync(path)));
  }
  return {
    writeCell: missingInputs.length === 0, capture: missingInputs.length === 0,
    restore: missingInputs.length === 0, project, missingInputs,
    engineCaptureCli: existsSync(join(engineDir(repoRoot), 'tools/capture-voxel.mjs')),
    reason: 'Game-owned author tool consumes the release SDK; Native owns snapshot encoding.',
  };
}

function snapshotPath(repoRoot, profile) {
  return join(repoRoot, 'Server', 'Assets', 'Maps', profile == null ? 'bomber.voxel' : `${profile}.voxel`);
}

function invoke(mode, { repoRoot = ROOT, profile, out = snapshotPath(repoRoot, profile), env = process.env, spawn = spawnSync } = {}) {
  loadLayout(repoRoot, { profile });
  const api = detectVoxelCaptureApi({ repoRoot });
  if (api.missingInputs.length) throw blocked(`Bomber map authoring requires: ${api.missingInputs.join(', ')}`);
  const result = spawn('dotnet', [
    'run', '--project', api.project, '--', mode, resolve(repoRoot), resolve(out),
    ...(profile == null ? [] : ['--profile', profile]),
  ], { cwd: repoRoot, env, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw blocked('dotnet SDK is required to run the Bomber map author');
  if (result.status !== 0) {
    throw new Error(`Bomber map ${mode} failed (exit ${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  const evidence = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  if (evidence.status !== 'PASS') throw new Error(`Map author returned no successful ${mode} evidence`);
  const actualHash = createHash('sha256').update(readFileSync(out)).digest('hex');
  if (evidence.snapshotSha256 !== actualHash) throw new Error('Map author hash differs from the output file');
  return { status: 'PASS', path: resolve(out), sha256: actualHash, evidence, api };
}

export function verifyBaseMap(options = {}) {
  return invoke('verify', options);
}

export function runCapture(options = {}) {
  const repoRoot = options.repoRoot ?? ROOT;
  const profile = options.profile;
  const api = detectVoxelCaptureApi({ repoRoot });
  if (api.missingInputs.length) throw blocked(`Bomber map authoring requires: ${api.missingInputs.join(', ')}`);
  const layout = loadLayout(repoRoot, { profile });
  if (!catalogCoversLayout(loadOfficialCatalog(repoRoot), layout)) {
    throw new Error('BLOCK_CATALOG_MISMATCH: generated blocks.block_type must match the appended lumio.bomber.* catalog identities; reserved 1..255 are not game blocks.');
  }
  // Capture includes the world's process-local generation. Fresh author processes give each
  // capture the same initial lifecycle, while each process restores into a second fresh world.
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'bomber-author-'));
  try {
    const first = invoke('capture', { ...options, out: join(temporaryRoot, 'first.voxel') });
    const second = invoke('capture', { ...options, out: join(temporaryRoot, 'second.voxel') });
    const bytes = readFileSync(first.path);
    if (!bytes.equals(readFileSync(second.path))) throw new Error('BASEMAP_NONDETERMINISTIC: independent author processes produced different bytes');
    const verification = verifyBaseMap({ ...options, out: first.path });
    const out = resolve(options.out ?? snapshotPath(repoRoot, profile));
    writeFileSync(out, bytes);
    return { ...first, path: out, evidence: { ...first.evidence, independentCaptures: 2 },
      verification: verification.evidence.verification };
  } finally {
    // mkdtemp owns this exact directory; no discovered path or symlink target is removed.
    if (dirname(resolve(temporaryRoot)) !== resolve(tmpdir())) throw new Error('Temporary author directory escaped the temp root');
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    if (args.includes('--out')) {
      const value = args[args.indexOf('--out') + 1];
      if (!value || value.startsWith('--')) throw new Error('--out requires a snapshot path');
      options.out = resolve(value);
    }
    if (args.includes('--profile')) {
      const value = args[args.indexOf('--profile') + 1];
      if (!value || value.startsWith('--')) throw new Error('--profile requires an authoring profile name');
      options.profile = value;
    }
    const result = args.includes('--verify-only') ? verifyBaseMap(options) : runCapture(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = error?.code === 'BLOCKED_ENV' ? 2 : 1;
  }
}
