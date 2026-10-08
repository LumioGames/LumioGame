import { spawn } from 'node:child_process';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./defender-diagnostic.ps1', import.meta.url));
const TIMEOUT_MS = 8000;
const MAX_OUTPUT_BYTES = 32768;
const HISTORY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 20;
const STATUS_FIELDS = {
  realTimeProtectionEnabled: 'boolean', antivirusEnabled: 'boolean', isTamperProtected: 'boolean',
  antivirusSignatureVersion: 'string', engineVersion: 'string', productVersion: 'string',
  antivirusSignatureLastUpdatedUtc: 'string',
};

function unavailable(reason, base) {
  return { ...base, status: 'unavailable', statusQuery: { availability: 'unavailable', reason },
    eventQuery: { availability: 'unavailable', reason }, events: [] };
}

function exactResource(value, target) {
  if (typeof value !== 'string') return false;
  const path = value.trim().replace(/^file:_?/i, '');
  return win32.normalize(path).toLowerCase() === win32.normalize(target).toLowerCase();
}

function safeQuery(value, fields) {
  if (!value || !['available', 'unavailable'].includes(value.availability)) return null;
  const result = { availability: value.availability };
  if (value.availability === 'unavailable') {
    result.reason = ['access-denied', 'query-failed', 'query-limit'].includes(value.reason) ? value.reason : 'query-failed';
  } else {
    for (const field of fields) {
      if (typeof value[field] === 'string' || typeof value[field] === 'boolean') result[field] = value[field];
    }
  }
  return result;
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', SCRIPT, ...args],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = (error, exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(Object.assign(new Error('collector timed out'), { code: 'ETIMEDOUT' }));
    }, TIMEOUT_MS);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(Object.assign(new Error('collector output exceeded limit'), { code: 'EOUTPUT' }));
      } else chunks.push(chunk);
    });
    child.on('error', error => finish(error));
    child.on('close', code => finish(null, code));
  });
}

export async function collectDefenderDiagnostic({ targetPath, startedAt, platform = process.platform,
  now = new Date(), execute = runPowerShell } = {}) {
  const start = new Date(startedAt);
  const end = new Date(now);
  const base = { targetPath: typeof targetPath === 'string' ? targetPath : null,
    window: Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? { fromUtc: new Date(start.getTime() - HISTORY_MS).toISOString(),
        runStartedUtc: start.toISOString(), throughUtc: end.toISOString() } : null };
  if (platform !== 'win32') return { ...base, status: 'not-applicable', statusQuery: null, eventQuery: null, events: [] };
  if (!win32.isAbsolute(targetPath ?? '') || !base.window || end < start)
    return unavailable('invalid-target-or-window', base);
  let output;
  try {
    output = await execute([targetPath, base.window.fromUtc, base.window.throughUtc]);
  } catch (error) {
    return unavailable(error?.code === 'ETIMEDOUT' ? 'timeout' : 'collector-failed', base);
  }
  if (output?.exitCode !== 0 || typeof output.stdout !== 'string'
    || Buffer.byteLength(output.stdout, 'utf8') > MAX_OUTPUT_BYTES)
    return unavailable('collector-failed', base);
  let parsed;
  try { parsed = JSON.parse(output.stdout); } catch { return unavailable('malformed-output', base); }
  const statusQuery = safeQuery(parsed?.statusQuery, Object.keys(STATUS_FIELDS));
  const eventQuery = safeQuery(parsed?.eventQuery, []);
  if (!statusQuery || !eventQuery || !Array.isArray(parsed.events) || parsed.events.length > MAX_EVENTS)
    return unavailable('malformed-output', base);
  if (statusQuery.availability === 'available' && Object.entries(STATUS_FIELDS).some(([field, type]) =>
    typeof statusQuery[field] !== type || (type === 'string' && !statusQuery[field].trim())))
    return unavailable('malformed-output', base);
  const events = [];
  for (const item of parsed.events.slice(0, 200)) {
    if (!item || !Array.isArray(item.resources) || item.resources.some(resource => typeof resource !== 'string')
      || ![1116, 1117].includes(item.eventId) || !Number.isSafeInteger(item.recordId)
      || typeof item.timeCreatedUtc !== 'string' || !Number.isFinite(Date.parse(item.timeCreatedUtc)))
      return unavailable('malformed-output', base);
    const resources = item.resources.filter(resource => exactResource(resource, targetPath));
    const at = new Date(item.timeCreatedUtc);
    if (!resources.length || !Number.isInteger(item.eventId) || !Number.isInteger(item.recordId)
      || !Number.isFinite(at.getTime()) || at < new Date(base.window.fromUtc) || at > end) continue;
    const event = { eventId: item.eventId, recordId: item.recordId,
      timeCreatedUtc: at.toISOString(), relation: at >= start ? 'during-run' : 'historical',
      resources: [targetPath] };
    for (const field of ['detectionId', 'threatId', 'threatName', 'actionId', 'actionName', 'resultCode', 'errorCode', 'postCleanStatus']) {
      if (typeof item[field] === 'string') event[field] = item[field].slice(0, 160);
    }
    events.push(event);
    if (events.length === MAX_EVENTS) break;
  }
  return { ...base, status: statusQuery.availability === 'unavailable' || eventQuery.availability === 'unavailable'
    ? 'unavailable' : events.length ? 'correlated-events' : 'no-related-events',
  statusQuery, eventQuery, events };
}
