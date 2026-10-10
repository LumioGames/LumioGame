import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMovementTrace } from './movement-trace.mjs';
import { analyzeMovementTrace } from '../../../Tools/movement-trace-analyze.mjs';
const MAIN_SOURCE = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
test('actual pump phase timing includes its full tail and preserves the throwing boundary', () => {
  const source = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function pumpSession(attempt)'), MAIN_SOURCE.indexOf('async function obtainLaunch('));
  function run({ fail = false, enabled = true } = {}) {
    let clock = 100, clockReads = 0;
    const error = new Error('initial-selection-window-closed'), faults = [], failures = [], calls = [], timers = [];
    const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' } });
    const sandbox = { terminal: false, connectionAttempt: 1, movementPhaseTimingEnabled: enabled,
      movementTrace: enabled ? trace : null, inputDriver: 'interval', playerInput: null,
      player: { replica: { phase: 'Warmup', authorityTick: 61, characterName: null } }, spectator: { positions: [], voxel: {} },
      initialSelectionSent: false, performance: { now: () => { clockReads++; return clock } },
      csharp: { tick() { calls.push('tick'); clock += 3 }, sessionState: () => '{"state":"active"}',
        mapDimensions: () => '{}', dumpPositions: () => '[]', tickRateHz: () => 20 },
      drainManagedTrace() {}, refreshVoxelWorld() {}, configureMap() {}, displayedWorldHandle: 'owned',
      applyDump() { calls.push('applyDump'); clock += 5; if (fail) throw error; return true },
      paint() {}, voxelGrid: { sections: () => [] }, refreshStepInput() {}, setStatus() {},
      movementPreviewControls: { refresh() { calls.push('refresh'); clock += 10 } }, resourceWitness: null,
      nextPumpAt: 100, setTimeout(callback, delay) { calls.push('schedule'); timers.push({ callback, delay }); return 1 },
      noteApplyFault: caught => faults.push(caught), failLaunch: caught => failures.push(caught), console };
    sandbox.prepareNativeInvokeTick = () => null;
    sandbox.finishNativeInvokeTick = () => {};
    vm.runInNewContext(source, sandbox); sandbox.pumpSession(1);
    return { events: trace.export().events, summary: analyzeMovementTrace(trace.export()), calls, timers, faults, failures, error, clockReads };
  }
  const healthy = run(), phase = healthy.events.find(event => event.k === 'phaseTiming' && event.scope === 'pump');
  assert.ok(phase, 'the actual pump must emit its completed phase observation');
  assert.equal(healthy.events.find(event => event.k === 'pump').totalMs, 8, 'legacy total retains its old boundary');
  assert.equal(phase.fullMs, 18); assert.equal(phase.tailMs, 10); assert.equal(phase.complete, true);
  assert.equal(healthy.summary.timing.phases.pump.fullMs.max, 18);
  assert.equal(healthy.summary.timing.phases.pump.sections.managedTick.max, 3);
  assert.equal(healthy.summary.timing.phases.pump.sections.previewRefresh.max, 10);
  assert.deepEqual(healthy.calls, ['tick', 'applyDump', 'refresh', 'schedule']);
  assert.equal(healthy.timers.length, 1); assert.equal(healthy.timers[0].delay, 32);
  const failed = run({ fail: true }), failedPhase = failed.events.find(event => event.k === 'phaseTiming');
  assert.equal(failed.events.filter(event => event.k === 'pump').length, 0);
  assert.equal(failedPhase.complete, false); assert.equal(failedPhase.failedPhase, 'applyDump'); assert.equal(failedPhase.fullMs, 8);
  assert.equal(failedPhase.context.phase, 'Warmup'); assert.equal(failedPhase.context.authorityTick, 61);
  assert.equal(failedPhase.context.initialSelectionSent, false);
  assert.equal(failedPhase.exception.message, failed.error.message);
  assert.equal(failed.summary.timing.phases.pump.incomplete, 1);
  assert.equal(failed.faults[0], failed.error); assert.equal(failed.failures[0], failed.error);
  assert.equal(failed.timers.length, 0);
  const ordinary = run({ enabled: false }); assert.equal(ordinary.clockReads, 4);
  assert.deepEqual(ordinary.calls, healthy.calls); assert.equal(ordinary.events.length, 0);
});
