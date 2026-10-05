/**
 * Frozen operator template for lumio-ds. Committed `Server/Config/Startup/server.json` is the
 * runnable profile operators and tests actually start. Local overlays
 * (`.run/server.local.json`, `LUMIO_DS_CONFIG`) stay gitignored and must
 * copy this public vocab rather than `runtime-only` / `process-crash`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked } from './engine-tools.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEX64 = /^[0-9a-f]{64}$/;
const PLACEHOLDER_HEADER = 'LUMIO-VOXEL-SNAPSHOT-V1';
const PLACEHOLDER_BLOCKED = 'BLOCKED: this is not a restoreable VoxelEngine capture';
const SNAPSHOT_MAGIC = 'LUMIOSNP1';
const MISSING_CAPTURE_COMMAND =
  'sibling LumioGameEngine/eng/capture-voxel.mjs (author-time; Engine PR #182). Bomber does not invent a capture implementation.';

export const FROZEN_WORLD_PROFILE = 'runtime+voxel';
export const FROZEN_DURABILITY = 'snapshot_only';
// ADR-115: server.json now lives in Server/Config/Startup and its relative paths
// resolve against that directory, so the declared value and the repo-relative
// path this module reads are two different strings.
export const FROZEN_VOXEL_CATALOG = '../../Assets/Maps/official-catalog.json';
export const FROZEN_BASE_MAP_PATH = '../../Assets/Maps/bomber.voxel';
export const BASE_MAP_REPO_RELATIVE = 'Server/Assets/Maps/bomber.voxel';
export const SERVER_JSON_REPO_RELATIVE = 'Server/Config/Startup/server.json';
export const FROZEN_BASE_MAP_ID = 'bomber';
export const FROZEN_BASE_MAP_VERSION = '0.1.0';
export const FROZEN_ENTRY_TYPE = 'Lumio.Server.HostEntry.HostEntry, Lumio.Server.HostEntry';
export const FROZEN_ENTRY_METHOD = 'LumioHostEntry';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function inspectBaseMap(repoRoot = ROOT) {
  const relative = BASE_MAP_REPO_RELATIVE;
  const path = join(repoRoot, relative);
  if (!existsSync(path)) {
    return {
      path: relative,
      declared: FROZEN_BASE_MAP_PATH,
      placeholder: true,
      restorable: false,
      blocked: true,
      sha256: null,
      missingCommand: MISSING_CAPTURE_COMMAND,
    };
  }
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  const placeholder = text.includes(PLACEHOLDER_HEADER)
    || text.includes(PLACEHOLDER_BLOCKED)
    || text.includes('do-not-restore: true');
  const restorable = !placeholder && text.includes(SNAPSHOT_MAGIC);
  return {
    path: relative,
    declared: FROZEN_BASE_MAP_PATH,
    placeholder,
    restorable,
    blocked: placeholder,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    missingCommand: restorable ? null : MISSING_CAPTURE_COMMAND,
  };
}

export function loadCommittedServerJson(repoRoot = ROOT) {
  const path = join(repoRoot, SERVER_JSON_REPO_RELATIVE);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function assertFrozenServerProfile(config, repoRoot = ROOT) {
  if (!config || typeof config !== 'object') throw new Error('server.json must parse as an object.');
  if (config.world_profile !== FROZEN_WORLD_PROFILE) {
    throw new Error(`server.json world_profile must be ${FROZEN_WORLD_PROFILE}, not ${config.world_profile}`);
  }
  if (config.voxel_catalog !== FROZEN_VOXEL_CATALOG) {
    throw new Error(`server.json voxel_catalog must be ${FROZEN_VOXEL_CATALOG}, not ${config.voxel_catalog}`);
  }
  if (config.durability !== FROZEN_DURABILITY) {
    throw new Error(`server.json durability must be ${FROZEN_DURABILITY} (persistence-container-v1), not ${config.durability}`);
  }
  if (config.durability === 'process-crash' || config.durability === 'power-loss') {
    throw new Error('server.json must not use retired durability process-crash / power-loss.');
  }
  for (const key of ['base_map_id', 'base_map_version', 'base_map_path', 'base_map_content_sha256']) {
    if (typeof config[key] !== 'string' || config[key].trim() === '') {
      throw new Error(`server.json ${key} is required`);
    }
  }
  if (!HEX64.test(config.base_map_content_sha256)) {
    throw new Error('server.json base_map_content_sha256 must be 64 lowercase hex');
  }
  if (config.clr?.entry_type !== FROZEN_ENTRY_TYPE) {
    throw new Error('server.json clr.entry_type must stay Lumio.Server.HostEntry.HostEntry');
  }
  if (config.clr?.entry_method !== FROZEN_ENTRY_METHOD) {
    throw new Error('server.json clr.entry_method must stay LumioHostEntry');
  }
  const map = inspectBaseMap(repoRoot);
  if (config.base_map_id !== FROZEN_BASE_MAP_ID) {
    throw new Error(`server.json base_map_id must name ${FROZEN_BASE_MAP_ID}`);
  }
  if (config.base_map_version !== FROZEN_BASE_MAP_VERSION) {
    throw new Error(`server.json base_map_version must be ${FROZEN_BASE_MAP_VERSION}`);
  }
  if (config.base_map_path !== map.declared) {
    throw new Error(`server.json base_map_path must name ${map.declared}, not ${config.base_map_path}`);
  }
  if (!map.sha256 || config.base_map_content_sha256 !== map.sha256) {
    throw new Error(`server.json base_map_content_sha256 must match ${BASE_MAP_REPO_RELATIVE} bytes`);
  }
  if (map.placeholder || !map.restorable) {
    throw blocked(
      `${map.path} is a placeholder (not a VoxelEngine capture); refuse it as a base map. Missing command: ${map.missingCommand}.`,
    );
  }
  return { config, map };
}

export function refusePlaceholderAsBaseMap(repoRoot = ROOT) {
  const config = loadCommittedServerJson(repoRoot);
  try {
    return assertFrozenServerProfile(config, repoRoot);
  } catch (error) {
    if (error?.code === 'BLOCKED_ENV') throw error;
    throw error;
  }
}

export function describeLocalOverlay(repoRoot = ROOT) {
  const localPath = join(repoRoot, '.run', 'server.local.json');
  return {
    committed: SERVER_JSON_REPO_RELATIVE,
    overlay: '.run/server.local.json',
    overlayExists: existsSync(localPath),
    note: 'Local overlay is gitignored. Copy world_profile/durability/base_map_* from committed server.json; do not keep runtime-only or process-crash. Fill-me tokens live in server.bomber.json and fail as missing required values, not BLOCKED_ENV.',
  };
}
