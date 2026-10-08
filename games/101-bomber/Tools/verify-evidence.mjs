#!/usr/bin/env node
// Validates a Bomber evidence-file interface. Real replay production and the complete
// rule matrix are separate acceptance gates; valid synthetic inputs are never proof.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorld, canonical, isEntityId, isJsonValue, isObject, isTick } from './world-assert.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const identityFields = ['seed', 'releaseSha256', 'configSha256', 'baseMapSha256', 'inputsSha256'];
const onlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));

function readJson(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!isObject(value) || !isJsonValue(value)) throw new Error(`${path}: expected finite JSON object`);
  return value;
}
function readRecords(path) {
  const text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  if (!text.trim() || !text.endsWith('\n')) throw new Error(`${path}: empty or truncated NDJSON`);
  const records = text.trimEnd().split('\n').map((line, index) => {
    const value = JSON.parse(line);
    if (!isObject(value) || !isJsonValue(value)) throw new Error(`${path}:${index + 1}: expected finite JSON object`);
    return value;
  });
  return { text, records };
}

function verifyRound(directory, expected) {
  const manifest = readJson(join(directory, 'manifest.json'));
  if (manifest.schema !== 'bomber.replay-evidence/1' || manifest.source !== 'authoritative-replay'
    || !onlyKeys(manifest, ['schema', 'runId', 'source', ...identityFields])
    || typeof manifest.runId !== 'string' || !manifest.runId.trim() || !Number.isSafeInteger(manifest.seed)
    || identityFields.slice(1).some(field => !isHash(manifest[field]))) throw new Error('invalid replay manifest');
  const inputs = readRecords(join(directory, 'inputs.ndjson'));
  if (hash(inputs.text) !== manifest.inputsSha256) throw new Error('inputsSha256 does not match input file');
  let previousInput = -1;
  for (const record of inputs.records) {
    if (!onlyKeys(record, ['tick', 'input']) || !isTick(record.tick) || record.tick < previousInput || !isObject(record.input) || !Object.keys(record.input).length)
      throw new Error('invalid or unordered authoritative input envelope');
    previousInput = record.tick;
  }
  const { records } = readRecords(join(directory, 'ticks.ndjson'));
  const complete = records.at(-1);
  if (!onlyKeys(complete, ['kind', 'lastTick', 'status']) || complete.kind !== 'complete' || complete.status !== 'success' || !isTick(complete.lastTick)) throw new Error('missing successful final complete record');
  const ticks = records.slice(0, -1);
  if (ticks.length === 0) throw new Error('empty tick evidence');
  let eventCount = 0;
  for (const [index, tick] of ticks.entries()) {
    if (!onlyKeys(tick, ['kind', 'tick', 'stateHash', 'events']) || tick.kind !== 'tick' || !isTick(tick.tick) || !isHash(tick.stateHash) || !Array.isArray(tick.events)
      || tick.events.some(event => !isObject(event) || !onlyKeys(event, ['type', 'entityId', 'data'])
        || typeof event.type !== 'string' || !event.type.trim()
        || (Object.hasOwn(event, 'entityId') && !isEntityId(event.entityId))
        || (Object.hasOwn(event, 'data') && !isObject(event.data))))
      throw new Error(`invalid tick/error record at ${index}`);
    if (index && tick.tick !== ticks[index - 1].tick + 1) throw new Error(`tick gap or regression at ${index}`);
    eventCount += tick.events.length;
  }
  if (!eventCount) throw new Error('empty authoritative event evidence');
  if (complete.lastTick !== ticks.at(-1).tick) throw new Error('complete.lastTick does not close final tick');
  if (inputs.records.some(input => input.tick < ticks[0].tick || input.tick > complete.lastTick)) throw new Error('input outside recorded tick range');
  const world = readJson(join(directory, 'world.json'));
  const failures = assertWorld(world, expected);
  if (failures.length) throw new Error(failures.map(f => `${f.check}: ${f.message}`).join('; '));
  if (world.tick !== complete.lastTick) throw new Error('world does not describe final tick');
  return { manifest, ticks, inputs: inputs.text, tickCount: ticks.length, eventCount };
}

export function verifyEvidenceDir(directory) {
  const failures = [];
  const rounds = {};
  const fail = (check, error) => failures.push({ check, message: error.message });
  if (typeof directory !== 'string' || !directory.trim()) fail('directory', new Error('evidence directory is required'));
  else {
    const root = resolve(directory);
    let expected;
    try { expected = readJson(join(root, 'expected.json')); } catch (error) { fail('expected', error); }
    const paths = ['round-1', 'round-2'].map(name => join(root, name));
    try { if (realpathSync(paths[0]) === realpathSync(paths[1])) throw new Error('round directories must be independent'); }
    catch (error) { fail('rounds:independent', error); }
    for (const [index, name] of ['round-1', 'round-2'].entries()) {
      try { rounds[name] = verifyRound(paths[index], expected); } catch (error) { fail(name, error); }
    }
    const a = rounds['round-1']; const b = rounds['round-2'];
    if (a && b) {
      if (a.manifest.runId === b.manifest.runId) fail('run-id', new Error('each replay needs a distinct runId'));
      for (const field of identityFields) if (a.manifest[field] !== b.manifest[field]) fail(`manifest:${field}`, new Error(`${field} differs`));
      if (a.inputs !== b.inputs) fail('inputs', new Error('authoritative input streams differ'));
      if (canonical(a.ticks) !== canonical(b.ticks)) fail('ticks', new Error('per-tick stateHash or events differ'));
    }
  }
  return { ok: failures.length === 0, scope: 'bomber-evidence-interface', acceptanceStatus: 'NOT_EVALUATED', failures,
    rounds: Object.fromEntries(Object.entries(rounds).map(([name, round]) => [name, { runId: round.manifest.runId, tickCount: round.tickCount, eventCount: round.eventCount }])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--dir' || !process.argv[3]?.trim()) {
    process.stderr.write('usage: node verify-evidence.mjs --dir <evidence-directory>\n');
    process.exitCode = 2;
  } else {
    const report = verifyEvidenceDir(process.argv[3]);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  }
}
