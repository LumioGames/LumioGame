// Run only against a dedicated local integration game with a real Platform session supplied by I.
// Credentials stay in the environment; no headers/credentials are written to evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const args = process.argv.slice(2);
const config = JSON.parse(await fs.readFile(args[0]));
const origin = new URL(config.platformOrigin);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.origin !== config.platformOrigin) throw Error('Dedicated loopback integration target required');
const credential = process.env.GAME_SAMPLE_SESSION, csrf = process.env.GAME_SAMPLE_CSRF;
if (!credential || !csrf) throw Error('GAME_SAMPLE_SESSION and GAME_SAMPLE_CSRF are required; missing environment is a failure, never a skip');
const wire = JSON.parse(await fs.readFile(config.wirePath));
const calls = [];
async function request(operation, body) {
  const spec = wire.operations[operation];
  const pathname = spec.binding.slice(5).replace('{gameId}', config.gameId).replace('{environment}', config.environment);
  const response = await fetch(new URL(pathname, origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Origin: config.platformOrigin,
    Authorization: `Bearer ${credential}`, 'X-CSRF-Token': csrf, 'X-Lumio-Container-Id': config.containerId, 'X-Lumio-Document-Id': config.documentId }, body: JSON.stringify(body) });
  const raw = await response.text(); if (Buffer.byteLength(raw) > spec.responseBytes) throw Error('Oversized response');
  const result = JSON.parse(raw); calls.push({ operation, status: response.status, resultStatus: result.status ?? null, code: result.code ?? null });
  return result;
}
const initialized = await request('initialize', {});
assert.equal(initialized.environment, config.environment); assert.equal(initialized.gameId, config.gameId);
const before = await request('state_get', {});
for (const field of ['nextState', 'score', 'quantity', 'complete', 'serverTimeMs', 'random']) {
  const result = await request('action_perform', { operationId: randomUUID(), operationEpoch: initialized.epoch.operationEpoch, expectedRevision: before.revision, action: 'begin', arguments: {}, [field]: 999 });
  assert.equal(result.code, 'gs_invalid_request', `${field} must not enter authority execution`);
}
assert.deepEqual(await request('state_get', {}), before, 'Rejected final client values must not change the state');
const original = { operationId: randomUUID(), operationEpoch: initialized.epoch.operationEpoch, expectedRevision: before.revision, action: 'begin', arguments: {} };
await request('action_perform', original);
const conflict = await request('action_perform', { ...original, action: 'claim_supplies' });
assert.equal(conflict.code, 'gs_operation_payload_conflict');
const reference = { operationId: randomUUID(), operationEpoch: initialized.epoch.operationEpoch };
const current = await request('state_get', {});
await Promise.all([request('action_perform', { ...reference, expectedRevision: current.revision, action: 'begin', arguments: {} }), request('operation_close', reference)]);
const terminal = new Set(['closed', 'committed', 'rejected', 'expired']);
let first;
for (let attempt = 0; attempt < 30; attempt++) {
  first = await request('operation_get', reference);
  assert.notEqual(first.status, 'not_found');
  if (terminal.has(first.status)) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(terminal.has(first.status), 'Race has not settled; this is not a passing terminal-result test');
assert.deepEqual(await request('operation_get', reference), first, 'A terminal result cannot reverse after a close/accept race');
await fs.writeFile(args[1], JSON.stringify({ target: config.platformOrigin, scope: 'Real local HTTP; inspect I DB audit for full all-or-nothing/ledger assertions', passed: 8, calls }, null, 2));
console.log('8 local HTTP attack groups passed; DB transaction audit is a separate I assertion.');
