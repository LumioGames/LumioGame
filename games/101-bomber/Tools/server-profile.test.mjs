import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  FROZEN_DURABILITY,
  FROZEN_ENTRY_METHOD,
  FROZEN_ENTRY_TYPE,
  FROZEN_BASE_MAP_PATH,
  FROZEN_VOXEL_CATALOG,
  FROZEN_WORLD_PROFILE,
  SERVER_JSON_REPO_RELATIVE,
  assertFrozenServerProfile,
  describeLocalOverlay,
  inspectBaseMap,
  loadCommittedServerJson,
  refusePlaceholderAsBaseMap,
} from './server-profile.mjs';

test('committed server.json is runtime+voxel snapshot_only with required base_map_*', () => {
  const config = loadCommittedServerJson();
  assert.equal(config.world_profile, FROZEN_WORLD_PROFILE);
  assert.equal(config.voxel_catalog, FROZEN_VOXEL_CATALOG);
  assert.equal(config.durability, FROZEN_DURABILITY);
  assert.notEqual(config.durability, 'process-crash');
  assert.notEqual(config.durability, 'power-loss');
  assert.equal(config.clr.entry_type, FROZEN_ENTRY_TYPE);
  assert.equal(config.clr.entry_method, FROZEN_ENTRY_METHOD);
  assert.match(config.base_map_content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(config.transport.voxel_quota_bytes, 65536);
  const map = inspectBaseMap();
  assert.equal(config.base_map_content_sha256, map.sha256);
  // ADR-115: the declared value is relative to the startup config's directory;
  // map.path is where this repo keeps the bytes.
  assert.equal(config.base_map_path, map.declared);
  assert.equal(map.path, 'Server/Assets/Maps/bomber.voxel');
});

test('committed maps/bomber.voxel is a restoreable VoxelEngine capture', () => {
  const map = inspectBaseMap();
  assert.equal(map.placeholder, false);
  assert.equal(map.restorable, true);
  assert.equal(map.blocked, false);
  assert.equal(map.missingCommand, null);
  const accepted = refusePlaceholderAsBaseMap();
  assert.equal(accepted.map.restorable, true);
  assert.equal(accepted.config.base_map_content_sha256, map.sha256);
});

test('sha mismatch and retired durability are refused before treating bytes as a map', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'lumio-server-profile-'));
  mkdirSync(join(isolated, 'Server', 'Assets', 'Maps'), { recursive: true });
  const fakeBytes = Buffer.from('canonical-looking-but-invented-bytes');
  writeFileSync(join(isolated, 'Server', 'Assets', 'Maps', 'bomber.voxel'), fakeBytes);
  const config = {
    world_profile: 'runtime+voxel',
    voxel_catalog: FROZEN_VOXEL_CATALOG,
    durability: 'snapshot_only',
    base_map_id: 'bomber',
    base_map_version: '0.1.0',
    base_map_path: FROZEN_BASE_MAP_PATH,
    base_map_content_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    clr: {
      entry_type: FROZEN_ENTRY_TYPE,
      entry_method: FROZEN_ENTRY_METHOD,
    },
  };
  assert.throws(
    () => assertFrozenServerProfile(config, isolated),
    /base_map_content_sha256 must match/,
  );
  config.base_map_content_sha256 = createHash('sha256').update(fakeBytes).digest('hex');
  config.durability = 'process-crash';
  assert.throws(
    () => assertFrozenServerProfile(config, isolated),
    /snapshot_only/,
  );
  config.durability = 'snapshot_only';
  config.base_map_version = '0.1.0';
  assert.throws(
    () => assertFrozenServerProfile(config, isolated),
    (error) => error.code === 'BLOCKED_ENV',
  );
});

test('local overlay documentation names the gitignored .run file', () => {
  const overlay = describeLocalOverlay();
  assert.equal(overlay.committed, SERVER_JSON_REPO_RELATIVE);
  assert.equal(overlay.overlay, '.run/server.local.json');
  assert.match(overlay.note, /gitignored/);
  assert.match(overlay.note, /runtime-only/);
  assert.match(overlay.note, /server\.bomber\.json/);
  assert.match(overlay.note, /missing required values/);
});
