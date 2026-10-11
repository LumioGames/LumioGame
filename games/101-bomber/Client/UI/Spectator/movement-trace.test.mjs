import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementTrace } from './movement-trace.mjs';
import { analyzeMovementTrace } from '../../../Tools/movement-trace-analyze.mjs';
import { createNativeInvokeObserver } from './native-invoke-observer.mjs';

test('prediction catch-up metadata survives recording clear', () => {
  const trace = createMovementTrace({ now: () => 0 });
  const config = { requestedSteps: '10', requestedDeltaMs: '500', maxStepsPerPump: 10, maxDeltaMs: 500, configured: true };
  trace.setPredictionCatchUp(config); trace.note('before'); trace.clear();
  assert.deepEqual(JSON.parse(JSON.stringify(trace.export())).predictionCatchUp, config);
  assert.equal(trace.export().events.length, 0);
});

test('trace keeps the post-Tick owner publication on the pump and the shown pose on the frame', () => {
  let clock = 0;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' }, userAgent: 'test' });
  const pose = { publicationSequence: '7', localStepOrdinal: '3', executionTick: '12', inputSequence: '5',
    cause: 'InputPublication', target: { position: { x: 1.5, y: 0, z: 2 } }, model: { position: { x: 1.4, y: 0, z: 2 } } };
  trace.pump({ startedAt: 10, tickAt: 10.5, tickMs: 4, totalMs: 6, state: 'active', pose });
  trace.pump({ startedAt: 60, tickAt: 60.5, tickMs: 4, totalMs: 6, state: 'active', pose: null });
  clock = 12;
  trace.input('move', true, [1, 0, true]);
  trace.frame({ now: 16, dt: 16, renderTick: 3.2, localPose: pose, local: { x: 1.45, z: 2, yaw: 0, speed: 4, cameraX: 1, cameraZ: -4 } });
  const { events, userAgent, truncated } = trace.export();
  assert.equal(userAgent, 'test');
  assert.equal(truncated, false);
  assert.deepEqual(events[0].pose, { seq: '7', step: '3', tick: '12', inputSeq: '5', cause: 'InputPublication', tx: 1.5, tz: 2 });
  assert.equal(events[1].pose, null);
  assert.deepEqual(events[2], { k: 'input', t: 12, kind: 'move', accepted: true, args: [1, 0, true] });
  assert.equal(events[3].tx, 1.5);
  assert.equal(events[3].mx, 1.4);
  assert.equal(events[3].dx, 1.45);
  assert.equal(events[3].vis, 'visible');
});

test('trace stops recording at capacity and reports truncation', () => {
  const trace = createMovementTrace({ now: () => 0, capacity: 2, doc: null });
  for (let i = 0; i < 3; i++) trace.note(String(i));
  const exported = trace.export();
  assert.equal(exported.events.length, 2);
  assert.equal(exported.truncated, true);
});

test('Native window retains only bounded metrics and reports recording failures', () => {
  let clock = 10;
  const trace = createMovementTrace({ now: () => clock, capacity: 1, doc: null });
  const observer = createNativeInvokeObserver(() => { clock += 3; }, { now: () => clock });
  observer.beginScope('managedTick'); observer.invoke('clock_now', new Uint8Array([9]));
  const snapshot = observer.snapshot('managedTick');
  Object.defineProperty(snapshot, 'packet', { get() { throw new Error('packet must not be inspected'); } });
  assert.equal(typeof trace.nativeInvokeTiming, 'function', 'actual trace is missing Native window recording');
  trace.nativeInvokeTiming({ startedAt: 10, endedAt: 13, returned: true, snapshot });
  const event = trace.export().events[0];
  assert.equal(event.k, 'nativeInvokeTiming'); assert.equal(event.snapshot.count, 1);
  assert.equal(event.snapshot.operations.length, 6); assert.equal('packet' in event.snapshot, false);
  assert.equal('result' in event.snapshot, false);
  snapshot.operations[0].count = 99;
  assert.equal(event.snapshot.operations[0].count, 1, 'snapshot rows are detached');
  trace.nativeInvokeTiming({ startedAt: 13, endedAt: 16, returned: false, snapshot: observer.snapshot('managedTick') });
  assert.equal(trace.export().events.length, 1); assert.equal(trace.export().truncated, true);
  const invalid = observer.snapshot('managedTick'); invalid.operations.push({ operation: 'arbitrary' });
  assert.doesNotThrow(() => trace.nativeInvokeTiming({ startedAt: 10, endedAt: 13, returned: true, snapshot: invalid }));
  assert.equal(trace.export().diagnosticFailures, 1, 'invalid window cannot disappear behind a full list');
});

test('diagnostic failure remains visible when the bounded event list is already full', () => {
  const trace = createMovementTrace({ now: () => 7, capacity: 1, doc: null });
  trace.note('first');
  trace.diagnosticFailure('managed-drain');
  const exported = trace.export();
  assert.equal(exported.events.length, 1);
  assert.equal(exported.truncated, true);
  assert.equal(exported.diagnosticFailures, 1);
  assert.equal(analyzeMovementTrace(exported).correlation.status, 'UNPROVEN');
  trace.clear();
  assert.equal(trace.export().diagnosticFailures, 0);
});

test('delayed frame records observation after Stop while retaining its nominal rAF timestamp', () => {
  let clock = 10;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' } });
  trace.input('move', true, [2, 0, true]);
  trace.pump({ startedAt: 12, tickAt: 13, tickMs: 1, totalMs: 2, state: 'active',
    pose: { publicationSequence: '1', executionTick: '1', target: { position: { x: 1, z: 0 } } } });
  clock = 14;
  trace.frame({ now: 13, dt: 16, localPose: { publicationSequence: '1', target: { position: { x: 1, z: 0 } } }, local: { x: 1, z: 0 } });
  clock = 20;
  trace.key('keyup', 'KeyD');
  clock = 30;
  trace.frame({ now: 15, dt: 16, localPose: { publicationSequence: '2', target: { position: { x: 1, z: 0 } } }, local: { x: 1.2, z: 0 } });
  const exported = trace.export();
  const frames = exported.events.filter(e => e.k === 'frame');
  assert.deepEqual(frames.map(f => [f.t, f.rafT]), [[14, 13], [30, 15]]);
  const summary = analyzeMovementTrace(exported);
  assert.equal(summary.timing.frameIntervalMs.max, 16);
  assert.equal(summary.timing.rafIntervalMs.max, 2);
  assert.equal(summary.counts.framesAfterStop, 1);
  assert.equal(summary.stopTails[0].lastPublicationSequence, '2');
  assert.equal(summary.stopTails[0].lastDisplayedX, 1.2);
  assert.equal(summary.stopTails[0].lastTargetX, 1);
  assert.equal(summary.captureProvenance, 'certified');
  assert.equal(exported.version, 2);
  assert.equal(exported.timeBasis, 'performance.now');
});
