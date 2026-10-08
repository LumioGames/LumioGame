import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { blocked } from './engine-tools.mjs';
/**
 * Operator-fillable DS config (R-00520 / S1).
 *
 * Committed `server.json` is a locally runnable template: allocation strings
 * and `admission_public_key_hex` are syntactic stand-ins so `lumio-ds
 * --check-config` is not refused for `replace-*` / `REPLACE_WITH_…`. They are
 * not Platform tickets. Real tickets still come from `loginAndLaunch`.
 *
 * Missing required values and leftover placeholder tokens fail loudly
 * (`MISSING_VALUE`), never as a placeholder `BLOCKED_ENV`.
 */

export const ALLOCATION_KEYS = Object.freeze([
  'serverAudience',
  'gameId',
  'gameReleaseId',
  'contractId',
  'roomId',
  'allocationId',
]);

export const PLACEHOLDER_PUBLIC_KEY = 'REPLACE_WITH_PLATFORM_32_BYTE_PUBLIC_KEY_HEX';
export const HEX64 = /^[0-9a-fA-F]{64}$/;

export class MissingValueError extends Error {
  constructor(message) {
    super(`missing required value: ${message}`);
    this.name = 'MissingValueError';
    this.code = 'MISSING_VALUE';
  }
}

function missing(message) {
  return new MissingValueError(message);
}

export function isPlaceholderToken(value) {
  const text = String(value ?? '').trim();
  if (text.length === 0) return false;
  if (text === PLACEHOLDER_PUBLIC_KEY) return true;
  if (text === '__unbound__') return true;
  return text.startsWith('replace-');
}

export function assertRunnableDsConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw missing('server.json must parse as an object');
  }
  const allocation = config.allocation;
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) {
    throw missing('allocation is required');
  }
  for (const key of ALLOCATION_KEYS) {
    const raw = allocation[key];
    if (raw == null || String(raw).trim() === '') {
      throw missing(`allocation.${key}`);
    }
    const text = String(raw).trim();
    if (isPlaceholderToken(text)) {
      throw missing(
        `allocation.${key} is the placeholder token ${JSON.stringify(text)}; fill a local stand-in or gitignored .run/server.local.json from Platform`,
      );
    }
  }
  const hex = config.admission_public_key_hex;
  if (hex == null || String(hex).trim() === '') {
    throw missing('admission_public_key_hex');
  }
  const key = String(hex).trim();
  if (key === PLACEHOLDER_PUBLIC_KEY || isPlaceholderToken(key) || !HEX64.test(key)) {
    throw missing(
      'admission_public_key_hex must be 64 hex characters (32 bytes); REPLACE_WITH_PLATFORM_32_BYTE_PUBLIC_KEY_HEX is not accepted',
    );
  }
  return config;
}


/** Copy the operator-selected generated KernelConfig for one run. */
export function writeKernelConfigForRun(configPath, outputPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const kernelConfig = config?.clr?.kernel_config;
  if (!kernelConfig || typeof kernelConfig !== 'object' || Array.isArray(kernelConfig) || Object.keys(kernelConfig).length === 0) {
    throw missing('clr.kernel_config must be an explicit KernelConfig object');
  }
  writeFileSync(outputPath, `${JSON.stringify(kernelConfig, null, 2)}\n`);
  return outputPath;
}

/** Fields lumio-ds resolves against its config file's own directory (LumioServer `ds` read_config). */
const TOP_PATH_FIELDS = Object.freeze(['store_path', 'config_dir', 'voxel_catalog', 'base_map_path']);
const CLR_PATH_FIELDS = Object.freeze([
  'engine_native', 'hostfxr', 'runtime_config', 'assembly', 'replication_assembly', 'ecs_assembly', 'registry_assembly',
]);

/**
 * Where each CLR file of a run comes from (ADR-123). The engine half is the Engine/ release for
 * this machine's <rid>; hostfxr is this machine's own .NET install; the registry assembly is
 * this repository's server-side gameplay build, named relative to the template. No variable
 * names any of them.
 */
export const DS_CLR_INPUTS = Object.freeze([
  { field: 'engine_native', source: 'engine', from: (layout) => layout.engineNative },
  { field: 'hostfxr', source: 'dotnet' },
  { field: 'assembly', source: 'engine', from: (layout) => layout.hostEntry },
  { field: 'runtime_config', source: 'engine', from: (layout) => layout.hostEntryRuntimeConfig },
  { field: 'replication_assembly', source: 'engine', from: (layout) => layout.replicationAssembly },
  { field: 'ecs_assembly', source: 'engine', from: (layout) => layout.ecsAssembly },
  { field: 'registry_assembly', source: 'game' },
]);

/** The engine-owned `clr.*` files of one run: the release layout plus this machine's hostfxr. */
export function engineClrInputs(layout, hostfxr) {
  const inputs = {};
  for (const input of DS_CLR_INPUTS) {
    if (input.source === 'engine') inputs[input.field] = input.from(layout);
  }
  if (hostfxr != null) inputs.hostfxr = hostfxr;
  return inputs;
}

function present(value) {
  return value != null && String(value).trim() !== '';
}

/**
 * One run's DS config, derived from the operator template (committed `server.json` or
 * `LUMIO_DS_CONFIG`) and written somewhere else, so every relative path is made absolute against the
 * template first. `engineClr` (engineClrInputs) fills the engine half of `clr`; the template names
 * only the game's own assembly. The run owns a fresh store and its own log directory (steps 05 and
 * 14 read both). `debug` is required: step 07 counts `host.operation_result` lines, which lumio-ds
 * logs at debug. The six allocation claims come from the Platform launch response when it carries
 * them — the committed block is a local stand-in, and a real ticket bound to other claims dies
 * pre-admission.
 */
export function deriveRunDsConfig(template, {
  templatePath, engineClr = {}, admissionKey, storePath, logDir, launch, checkpointSeconds,
} = {}) {
  const base = dirname(resolve(templatePath));
  const absolute = (value) => (present(value) && !isAbsolute(String(value)) ? resolve(base, String(value)) : value);
  const config = structuredClone(template);
  for (const field of TOP_PATH_FIELDS) {
    if (field in config) config[field] = absolute(config[field]);
  }
  config.clr = { ...config.clr };
  for (const field of CLR_PATH_FIELDS) {
    if (field in config.clr) config.clr[field] = absolute(config.clr[field]);
  }
  for (const [field, value] of Object.entries(engineClr)) {
    if (present(value)) config.clr[field] = resolve(String(value));
  }
  if (present(admissionKey)) {
    config.admission_public_key_hex = String(admissionKey).trim();
  }
  if (launch && ALLOCATION_KEYS.every((key) => present(launch[key]))) {
    config.allocation = Object.fromEntries(ALLOCATION_KEYS.map((key) => [key, String(launch[key])]));
  }
  config.store_path = storePath;
  config.logging = { ...config.logging, dir: logDir, min_level: 'debug' };
  if (checkpointSeconds != null) config.checkpoint_seconds = checkpointSeconds;
  return config;
}

const SOURCE_HINT = Object.freeze({
  engine: 'the Engine/ release for this platform is incomplete',
  dotnet: 'install the .NET SDK named in global.json',
  game: 'build this repository first: dotnet build LumioBomber.slnx',
});

/** Every CLR input is a file, or BLOCKED_ENV names the field, the path and where it should come from. */
export function assertDsClrInputs(config) {
  for (const input of DS_CLR_INPUTS) {
    const path = config?.clr?.[input.field];
    if (!present(path) || !existsSync(path)) {
      throw blocked(`DS config clr.${input.field} is not a file (${present(path) ? path : 'unset'}); ${SOURCE_HINT[input.source]}.`);
    }
  }
  return config;
}
