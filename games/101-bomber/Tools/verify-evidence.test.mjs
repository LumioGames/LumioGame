import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { verifyEvidenceDir } from './verify-evidence.mjs';

// Synthetic validator inputs, never production proof or a simulation.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bomber-evidence-interface-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const world = { schema: 'bomber.world-evidence/1', tick: 1,
    cells: [{ x: 0, y: 0, z: 0, blockType: 256 }],
    entities: [{ entityId: '00000000000000010000000000000002', type: 'PlayerEntity', fields: { healthPoints: 3 } }] };
  const inputs = JSON.stringify({ tick: 0, input: { testOnly: true } }) + '\n';
  writeFileSync(join(root, 'expected.json'), JSON.stringify(world));
  for (const round of ['round-1', 'round-2']) {
    mkdirSync(join(root, round));
    writeFileSync(join(root, round, 'manifest.json'), JSON.stringify({ schema: 'bomber.replay-evidence/1',
      runId: round, source: 'authoritative-replay', seed: 101,
      releaseSha256: 'a'.repeat(64), configSha256: 'b'.repeat(64), baseMapSha256: 'c'.repeat(64),
      inputsSha256: createHash('sha256').update(inputs).digest('hex') }));
    writeFileSync(join(root, round, 'inputs.ndjson'), inputs);
    writeFileSync(join(root, round, 'ticks.ndjson'), [
      { kind: 'tick', tick: 0, stateHash: 'd'.repeat(64), events: [{ type: 'test-only', entityId: world.entities[0].entityId }] },
      { kind: 'tick', tick: 1, stateHash: 'e'.repeat(64), events: [] },
      { kind: 'complete', lastTick: 1, status: 'success' },
    ].map(JSON.stringify).join('\n') + '\n');
    writeFileSync(join(root, round, 'world.json'), JSON.stringify(world));
  }
  return root;
}
function edit(root, file, transform) {
  const path = join(root, 'round-2', file);
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}

test('valid interface data never claims gameplay acceptance', t => {
  const report = verifyEvidenceDir(fixture(t));
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.scope, 'bomber-evidence-interface');
  assert.equal(report.acceptanceStatus, 'NOT_EVALUATED');
});

test('malformed, missing, empty, failed, and truncated evidence fail closed', t => {
  for (const change of [
    root => edit(root, 'ticks.ndjson', () => ''),
    root => edit(root, 'ticks.ndjson', () => '{oops}\n'),
    root => edit(root, 'ticks.ndjson', text => text.trimEnd()),
    root => edit(root, 'ticks.ndjson', text => text.split('\n').slice(0, 2).join('\n') + '\n'),
    root => edit(root, 'ticks.ndjson', text => text + '{"kind":"error","message":"failed"}\n'),
    root => edit(root, 'ticks.ndjson', text => text.replace('"status":"success"', '"status":"failed","error":"replay faulted"')),
    root => edit(root, 'ticks.ndjson', text => text.replace('"entityId":"00000000000000010000000000000002"', '"entityId":"2"')),
    root => edit(root, 'ticks.ndjson', text => text.replace('"events":[]', '"events":[],"error":"failed"')),
    root => edit(root, 'ticks.ndjson', text => text.replace(/"events":\[\{[^\]]+\}\]/, '"events":[]')),
    root => edit(root, 'manifest.json', text => text.replace('"seed":101', '"seed":101,"status":"failed"')),
    root => edit(root, 'world.json', text => text.replace('"healthPoints":3', '"healthPoints":1e999')),
    root => edit(root, 'ticks.ndjson', text => text.replace('"tick":1', '"tick":2')),
    root => edit(root, 'ticks.ndjson', text => text.replace('"tick":0', '"tick":5').replace('"tick":1', '"tick":6').replace('"lastTick":1', '"lastTick":6')),
    root => edit(root, 'ticks.ndjson', text => text.replace('e'.repeat(64), 'f'.repeat(64))),
    root => edit(root, 'ticks.ndjson', text => text.replace('test-only', 'different-event')),
    root => edit(root, 'manifest.json', text => text.replace('"runId":"round-2"', '"runId":"round-1"')),
    root => edit(root, 'manifest.json', text => text.replace('"seed":101', '"seed":102')),
    root => edit(root, 'inputs.ndjson', text => text.replace('true', 'false')),
    root => edit(root, 'world.json', text => text.replace('"healthPoints":3', '"healthPoints":2')),
    root => rmSync(join(root, 'round-2'), { recursive: true, force: true }),
  ]) {
    const root = fixture(t); change(root);
    assert.equal(verifyEvidenceDir(root).ok, false, root);
  }
});

test('CLI missing arguments exits 2 and invalid evidence exits 1', t => {
  const script = fileURLToPath(new URL('./verify-evidence.mjs', import.meta.url));
  const none = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  const root = fixture(t); edit(root, 'ticks.ndjson', () => '');
  const invalid = spawnSync(process.execPath, [script, '--dir', root], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
});
