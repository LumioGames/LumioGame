const READY_PREFIX = 'DS_READY ';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function parseDsReadyLine(line) {
  if (typeof line !== 'string' || !line.startsWith(READY_PREFIX)) return null;
  let value;
  try { value = JSON.parse(line.slice(READY_PREFIX.length)); }
  catch (error) { throw new Error(`DS_READY contains invalid JSON: ${error.message}`); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DS_READY payload must be a JSON object.');
  }
  if (!Number.isInteger(value.pid) || value.pid < 1) throw new Error('DS_READY must include a positive integer pid.');
  if (typeof value.endpoint !== 'string') throw new Error('DS_READY must include an endpoint URL.');
  let endpoint;
  try { endpoint = new URL(value.endpoint); }
  catch (error) { throw new Error(`DS_READY endpoint is invalid: ${error.message}`); }
  if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('DS_READY endpoint must use ws:// or wss://.');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('DS_READY endpoint must not contain credentials or routing hints.');
  }
  const port = Number(endpoint.port || (endpoint.protocol === 'wss:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('DS_READY endpoint must include a valid port.');
  return { ...value, endpoint: endpoint.href, port };
}

export function findDsReady(stdout) {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const value = parseDsReadyLine(line);
    if (value) return value;
  }
  return null;
}

export function resolveDsEndpoint(ready, configuredEndpoint = undefined) {
  if (!ready || typeof ready !== 'object') throw new TypeError('DS_READY result is required.');
  let endpoint;
  try { endpoint = new URL(configuredEndpoint ?? ready.endpoint); }
  catch (error) { throw new Error(`DS endpoint is invalid: ${error.message}`); }
  if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('DS endpoint must use ws:// or wss://.');
  if (!LOOPBACK_HOSTS.has(endpoint.hostname)) throw new Error('Launcher only accepts a loopback DS endpoint.');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('DS endpoint must not contain credentials or routing hints.');
  }
  const port = Number(endpoint.port || (endpoint.protocol === 'wss:' ? 443 : 80));
  if (port !== ready.port) throw new Error(`DS endpoint port ${port} does not match DS_READY port ${ready.port}.`);
  return endpoint.href;
}

export function buildServerArgs(configPath) {
  return ['--config', configPath];
}

/**
 * `voxelConfig` is the one optional path here, and deliberately so. Bot.Host reads it as
 * ADR-101 explicit host configuration: absent means the entity-only bot, which owns no voxel
 * world and is a stated shape rather than a degraded one. A bot that joins a
 * `world_profile=runtime+voxel` room WITHOUT it faults on the first SectionFrame it receives —
 * `ClientSession.HandleSectionFrame` calls `FailSession` when `ResolveVoxelSink()` is null,
 * which is ADR-112 修订 2 ⑨'s fail-closed refusal of a silent downgrade, not a defect. So the
 * caller decides; this function only refuses to invent a budget of its own.
 */
export function buildBotArgs({
  botDll, endpoint, admissionTicket, roomId, engineNative, kernelConfig, configDir, logDir,
  accountFrom, accountTo, gameplay, voxelConfig, scenarioDll, scenarioName, ticks,
}) {
  if (kernelConfig == null || String(kernelConfig).trim() === '') throw new TypeError('kernel config path is required (--kernel-config).');
  if (gameplay == null || String(gameplay).trim() === '') {
    throw new TypeError('gameplay assembly path is required (--gameplay).');
  }
  if (configDir == null || String(configDir).trim() === '') throw new TypeError('typed config export directory is required (--config-dir).');
  if ((scenarioDll == null) !== (scenarioName == null)) {
    throw new TypeError('--scenario and --scenario-name must be passed together.');
  }
  const args = [
    botDll,
    '--server', endpoint,
    '--admission-ticket', admissionTicket,
    '--engine-native', engineNative,
    '--kernel-config', kernelConfig,
    '--log-dir', logDir,
    '--account-from', accountFrom,
    '--account-to', accountTo ?? accountFrom,
    '--gameplay', gameplay,
    '--config-dir', configDir,
  ];
  if (roomId != null) {
    if (typeof roomId !== 'string' || roomId.trim() === '') throw new TypeError('admitted room ID must be nonempty (--room-id).');
    args.push('--room-id', roomId);
  }
  if (voxelConfig != null && String(voxelConfig).trim() !== '') {
    args.push('--voxel-config', String(voxelConfig).trim());
  }
  if (scenarioDll != null) {
    args.push('--scenario', String(scenarioDll), '--scenario-name', String(scenarioName));
    if (ticks != null && Number.isInteger(ticks) && ticks > 0) args.push('--ticks', String(ticks));
  }
  return args;
}

export function redactArgs(args, secret) {
  return args.map((value) => (secret && value === secret ? '<redacted>' : value));
}
