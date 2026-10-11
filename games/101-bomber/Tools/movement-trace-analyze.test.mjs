import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMovementTrace } from './movement-trace-analyze.mjs';
import { createMovementTrace } from '../Client/UI/Spectator/movement-trace.mjs';
import { createNativeInvokeObserver } from '../Client/UI/Spectator/native-invoke-observer.mjs';

const STEP = 0.2;
const H = 50;

test('managed façade analysis uses raw same-domain stamps, keeps skipped spans null and cumulative loss visible', () => {
  const span = (start, end) => ({ startedStamp: String(start), endedStamp: String(end) });
  const base = 9007199254740993n;
  const batch = timing => ({ hostLifetime: 'facade-host', clockDomain: 'Stopwatch.GetTimestamp/unanchored-to-performance.now',
    clockFrequency: '1000', facadeTimingLoss: '0', facadeTimingDiagnosticFailures: '0', events: [], facadeTiming: timing });
  const events = [
    { k: 'managedTrace', t: 1, batch: batch({ version: 1, ordinal: '1', completed: true, sessionInvoked: true, failedPhase: null,
      preIdentity: span(base, base + 10n), sessionTick: span(base + 10n, base + 60n), postIdentityCleanup: span(base + 60n, base + 70n) }) },
    { k: 'managedTrace', t: 2, batch: batch({ version: 1, ordinal: '2', completed: false, sessionInvoked: true, failedPhase: 'sessionTick',
      preIdentity: span(200, 210), sessionTick: span(210, 220), postIdentityCleanup: null }) },
    { k: 'managedTrace', t: 3, batch: batch({ version: 1, ordinal: '3', completed: true, sessionInvoked: false, failedPhase: null,
      preIdentity: span(300, 315), sessionTick: null, postIdentityCleanup: span(315, 330) }) },
  ];
  const trace = { events, version: 2, timeBasis: 'performance.now', frameTimeBasis: 'observer-invocation', truncated: false };
  const metrics = analyzeMovementTrace(trace).timing.managedFacade;
  assert.ok(metrics, 'actual analyzer is missing managed façade timing');
  assert.equal(metrics.windows, 3); assert.equal(metrics.failedWindows, 1); assert.equal(metrics.skippedSessions, 1);
  assert.equal(metrics.sections.preIdentity.n, 3); assert.equal(metrics.sections.preIdentity.max, 15);
  assert.equal(metrics.sections.sessionTick.n, 2); assert.equal(metrics.sections.sessionTick.max, 50);
  assert.equal(metrics.sections.postIdentityCleanup.n, 2); assert.equal(metrics.sections.postIdentityCleanup.max, 15);
  assert.equal(metrics.status, 'OBSERVED'); assert.match(metrics.note, /not JS absolute time.*not pure managed CPU/);
  events[0].batch.facadeTimingLoss = '1'; events[1].batch.facadeTimingLoss = '1';
  assert.equal(analyzeMovementTrace(trace).timing.managedFacade.timingLoss, '1', 'cumulative host loss is not double counted');
  assert.equal(analyzeMovementTrace(trace).timing.managedFacade.status, 'UNPROVEN');
  events[0].batch.facadeTiming.preIdentity.startedStamp = null;
  assert.equal(analyzeMovementTrace(trace).timing.managedFacade.sections.preIdentity.n, 2, 'missing stamp cannot be fabricated as zero');
  assert.equal(analyzeMovementTrace({ ...trace, events: [] }).timing.managedFacade.status, 'NOT_OBSERVED');
});

// Held along X for `steps` pumps (stride sign per pump), then `trailing` pumps with nothing held.
// The interval driver publishes 5 ms before a pump; the pump driver publishes inside it, before the Tick.
// `display(t, target, admittedAt)` decides what the doll shows.
function synthetic({ steps = 20, trailing = 0, driver = 'interval', movesPerPump = () => 1, stride = () => STEP,
  pumpLate = () => 0, display, yaw = () => Math.PI / 2, hidden = () => false }) {
  const events = [{ k: 'note', t: 0, message: `input=${driver}` }];
  let target = 0, seq = 0, tick = 10, admittedAt = 0, inputTime = 0;
  const admissions = [];
  for (let i = 0; i < steps + trailing; i++) {
    const startedAt = i * H + pumpLate(i);
    const moves = i < steps ? movesPerPump(i) : 0;
    for (let m = 0; m < moves; m++) {
      inputTime = (driver === 'pump' ? startedAt + 0.1 : startedAt - 5) + m * 0.1;
      events.push({ k: 'input', t: inputTime, kind: 'move', accepted: true, args: [2, 0, m === 0 && i === 0] });
    }
    tick++;
    if (moves) { target += moves * stride(i); seq++; admittedAt = startedAt + 0.5; admissions.push({ t: admittedAt, target, seq, tick }); }
    events.push({ k: 'pump', t: startedAt, tickAt: startedAt + 0.5, tickMs: 3, totalMs: 6, state: 'active', vis: 'visible',
      pose: { seq: String(seq), step: String(tick), tick: String(tick), inputSeq: String(seq), cause: 'InputPublication', tx: target, tz: 0 } });
  }
  const end = (steps + trailing) * H + 300;
  for (let t = 1; t < end; t += 16.7) {
    const latest = admissions.filter(a => a.t <= t).at(-1);
    if (!latest) continue;
    const previous = admissions.filter(a => a.t < latest.t).at(-1);
    const x = display(t, latest, previous);
    events.push({ k: 'frame', t, dt: 16.7, vis: hidden(t) ? 'hidden' : 'visible', rt: 0, seq: String(latest.seq), step: String(latest.seq),
      tick: String(latest.tick), inputSeq: String(latest.seq), cause: 'InputPublication', tx: latest.target, tz: 0,
      mx: x, mz: 0, dx: x, dz: 0, yaw: yaw(t), speed: 4, cx: x, cz: -5 });
  }
  return { version: 1, truncated: false, events };
}

// Current Runtime rule shape: target + v·min(e, 2h−e) from the admission.
const extrapolate = (t, latest) => {
  const e = t - latest.t;
  return latest.target + (e < 2 * H ? (STEP / H) * Math.min(e, 2 * H - e) : 0);
};
// Candidate rule shape: move from the previous target to the latest over one step.
const interpolate = (t, latest, previous) => {
  const from = previous?.target ?? latest.target;
  return from + (latest.target - from) * Math.min(1, Math.max(0, (t - latest.t) / H));
};

test('steady cadence with interpolation shows no backward frames, overshoot or facing flips', () => {
  const summary = analyzeMovementTrace(synthetic({ display: interpolate }));
  assert.deepEqual(summary.admission.movesPerHeldPump, { 1: 20 });
  assert.equal(summary.admission.nonOneRatio, 0);
  assert.deepEqual(summary.execution.tickAdvancePerHeldPump, { 1: 19 });
  assert.equal(summary.execution.heldPumpsWithUnchangedTarget, 0);
  assert.equal(summary.display.backwardFrames, 0);
  assert.equal(summary.display.stopOvershootM.max, 0);
  assert.equal(summary.facing.over90deg, 0);
  assert.ok(summary.display.leadAlongMotionM.max <= 0, 'interpolation never leads the logic target');
  assert.equal(summary.notes[0], 'input=interval');
});

test('late admissions under extrapolation are counted as reversals and stop overshoot', () => {
  const summary = analyzeMovementTrace(synthetic({ display: extrapolate, pumpLate: i => (i % 3 === 2 ? 30 : 0) }));
  assert.ok(summary.display.backwardFrames > 0);
  assert.ok(summary.display.reversalEvents >= 3);
  assert.ok(summary.display.maxBackwardM > 0.01);
  assert.ok(summary.display.stopOvershootM.max > 0.1, 'a stop shows the full lead before withdrawing');
  assert.ok(summary.display.leadAlongMotionM.max > 0, 'extrapolation leads the logic target');
});

test('empty and double pumps appear in the admission histogram and as executed-step gaps', () => {
  const pattern = [1, 1, 0, 2, 1, 1, 0, 2, 1, 1];
  const summary = analyzeMovementTrace(synthetic({ steps: pattern.length, movesPerPump: i => pattern[i], display: interpolate }));
  assert.deepEqual(summary.admission.movesPerHeldPump, { 0: 2, 1: 6, 2: 2 });
  assert.equal(summary.admission.nonOneRatio, 0.4);
  assert.deepEqual(summary.execution.tickAdvancePerHeldPump, { 1: 9 });
  assert.equal(summary.execution.heldPumpsWithUnchangedTarget, 2);
});

test('pumps after the release are not counted as empty held pumps', () => {
  for (const driver of ['interval', 'pump']) {
    const summary = analyzeMovementTrace(synthetic({ driver, trailing: 6, display: interpolate }));
    assert.deepEqual(summary.admission.movesPerHeldPump, { 1: 20 }, driver);
    assert.equal(summary.execution.heldPumpsWithUnchangedTarget, 0, driver);
  }
});

test('a deliberate reversal swinging the doll is not counted as a facing error', () => {
  const turnAt = 10 * H;
  const summary = analyzeMovementTrace(synthetic({ stride: i => (i < 10 ? STEP : -STEP), display: interpolate,
    yaw: t => (t < turnAt + 150 ? Math.PI / 2 : -Math.PI / 2) }));
  assert.equal(summary.facing.over90deg, 0);
  assert.ok(summary.facing.heldFrames > 0);
});

test('facing deviation and hidden frames are reported separately', () => {
  const summary = analyzeMovementTrace(synthetic({ display: interpolate, yaw: t => (Math.floor(t / 100) % 4 === 0 ? -Math.PI / 2 : Math.PI / 2),
    hidden: t => t > 900 }));
  assert.ok(summary.facing.over90deg > 0);
  assert.ok(summary.counts.hiddenFrames > 0);
});

test('a trace without events is rejected', () => {
  assert.throws(() => analyzeMovementTrace({}), /movement_trace_events_missing/);
});

test('Native analysis aggregates fixed buckets, failed Ticks and unproven diagnostics without claiming pure Rust time', () => {
  let clock = 10;
  const originalError = new Error('Native failure');
  const observer = createNativeInvokeObserver(operation => { clock += operation === 'clock_now' ? 2 : 5;
    if (operation === 'hfsm_evaluate') throw originalError; }, { now: () => clock });
  const window = (operations, returned) => {
    observer.reset('managedTick'); observer.beginScope('managedTick'); const startedAt = clock;
    for (const operation of operations) try { observer.invoke(operation, null); } catch (error) { assert.equal(error, originalError); }
    return { k: 'nativeInvokeTiming', t: clock, startedAt, endedAt: clock, returned, snapshot: observer.snapshot('managedTick') };
  };
  const events = [window(['clock_now', 'unknown-one'], true), window(['clock_now', 'hfsm_evaluate'], false)];
  const trace = { version: 2, timeBasis: 'performance.now', frameTimeBasis: 'observer-invocation', truncated: false, events };
  const metrics = analyzeMovementTrace(trace).timing.nativeInvoke;
  assert.ok(metrics, 'actual analyzer is missing Native window totals');
  assert.equal(metrics.boundary, 'JS_NATIVE_BRIDGE_INCLUSIVE');
  assert.match(metrics.note, /C#.*marshaling.*not pure Rust/);
  assert.equal(metrics.windows, 2); assert.equal(metrics.failedTicks, 1);
  assert.equal(metrics.count, 4); assert.equal(metrics.sumMs, 14); assert.equal(metrics.maxMs, 5); assert.equal(metrics.failed, 1);
  assert.equal(metrics.tickMs.n, 2); assert.equal(metrics.tickMs.max, 7);
  assert.equal(metrics.operations.length, 6);
  assert.deepEqual(metrics.operations.find(row => row.operation === 'clock_now'), { operation: 'clock_now', count: 2, sumMs: 4, maxMs: 2, failed: 0 });
  assert.equal(metrics.operations.find(row => row.operation === 'other').count, 1);
  assert.equal(metrics.operations.find(row => row.operation === 'hfsm_evaluate').failed, 1);
  assert.equal(metrics.status, 'OBSERVED');
  events[0].snapshot.diagnosticFailure = 1;
  assert.equal(analyzeMovementTrace(trace).timing.nativeInvoke.status, 'UNPROVEN');
  events.push({ ...events[0], snapshot: { ...events[0].snapshot, operations: [] } });
  assert.equal(analyzeMovementTrace(trace).timing.nativeInvoke.invalidWindows, 1);
  assert.equal(analyzeMovementTrace({ ...trace, events: [] }).timing.nativeInvoke.status, 'NOT_OBSERVED');
});

test('v2 reports causal sample/request/accepted sequences and legal 0/2/5 pump counts', () => {
  const events = [];
  let t = 0;
  for (const count of [0, 2, 5]) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      const id = String(++t);
      rows.push({ k: 'sample', sampleId: id, primary: 2, stamp: String(t) });
      rows.push({ k: 'request', sampleId: id, ability: 'MoveAbility', sender: 'self', wireGeneration: '9',
        sequence: id, stamp: String(t + 1) });
      rows.push({ k: 'accepted', sampleId: id, sender: 'self', wireGeneration: '9', sequence: id,
        stamp: String(t + 2), encodedLength: 3, encodedSha256: 'abc' });
    }
    events.push({ k: 'managedTrace', t: t + 10, pumpBracket: { startedAt: t, endedAt: t + 10 },
      batch: { hostLifetime: 'host-a', clockFrequency: '1000', complete: true, pending: count === 2 ? 2 : 0,
        eventLoss: '0', pendingLoss: '0', unmatched: '0', diagnosticFailures: '0', events: rows } });
  }
  events.push({ k: 'frame', t: 50, rafT: 40, vis: 'visible', dx: 1, tx: 1 });
  const summary = analyzeMovementTrace({ version: 2, timeBasis: 'performance.now',
    frameTimeBasis: 'observer-invocation', truncated: false, events });
  assert.deepEqual(summary.counts.samples, 7);
  assert.deepEqual(summary.counts.requests, 7);
  assert.deepEqual(summary.counts.transportAccepted, 7);
  assert.deepEqual(summary.correlation.samplesPerPump, { 0: 1, 2: 1, 5: 1 });
  assert.deepEqual(summary.correlation.heldMoveRequestsPerSample, { 1: 7 });
  assert.equal(summary.correlation.status, 'PASS');
  assert.equal(summary.correlation.transportObserverAfterRequestMs.max, 1);
  assert.equal(summary.foregroundGate, 'PASS');
});

test('overflow, unmatched acceptance and legacy capture provenance cannot certify correlation', () => {
  const events = [{ k: 'managedTrace', t: 20, pumpBracket: { startedAt: 10, endedAt: 20 },
    batch: { hostLifetime: 'host-a', clockFrequency: '1000', complete: false, pending: 0,
      eventLoss: '1', pendingLoss: '0', unmatched: '1', diagnosticFailures: '0',
      events: [{ k: 'accepted', sampleId: null, sender: 'other', wireGeneration: '10', sequence: '1', stamp: '9' }] } },
    { k: 'frame', t: 25, vis: 'visible', dx: 1, tx: 1 }];
  const v2 = analyzeMovementTrace({ version: 2, timeBasis: 'performance.now',
    frameTimeBasis: 'observer-invocation', truncated: false, events });
  assert.equal(v2.correlation.status, 'UNPROVEN');
  assert.equal(v2.correlation.unmatchedAccepted, 1);
  const legacy = analyzeMovementTrace({ version: 1, truncated: false, events });
  assert.equal(legacy.captureProvenance, 'uncertified-legacy-v1');
  assert.equal(legacy.foregroundGate, 'UNPROVEN');
});

test('visible step frames without an observed held movement remain unproven', () => {
  const summary = analyzeMovementTrace({ version: 2, timeBasis: 'performance.now',
    frameTimeBasis: 'observer-invocation', truncated: false, events: [
      { k: 'note', t: 0, message: 'input=step' },
      { k: 'frame', t: 10, rafT: 8, vis: 'visible', dx: 0, dz: 0, tx: 0, tz: 0, yaw: 0 },
      { k: 'frame', t: 30, rafT: 24, vis: 'visible', dx: 0, dz: 0, tx: 0, tz: 0, yaw: 0 },
    ] });
  assert.equal(summary.foregroundGate, 'PASS');
  assert.equal(summary.movementExposureGate, 'UNPROVEN');
  assert.equal(summary.counts.holdWindows, 0);
  assert.equal(summary.display.heldFrames, 0);
  assert.equal(summary.display.stopOvershootM.n, 0);
});

test('a recorder export with a visible retained prefix cannot certify foreground or movement exposure after truncation', () => {
  let clock = 0;
  const trace = createMovementTrace({ now: () => clock, capacity: 3,
    doc: { visibilityState: 'visible' } });
  trace.moveIntent(2, 0, true);
  clock = 10;
  trace.frame({ now: 10, dt: 10, localPose: { target: { position: { x: 0, z: 0 } } },
    local: { x: 0, z: 0 } });
  clock = 20;
  trace.frame({ now: 20, dt: 10, localPose: { target: { position: { x: 1, z: 0 } } },
    local: { x: 1, z: 0 } });
  const complete = analyzeMovementTrace(trace.export());
  assert.equal(complete.foregroundGate, 'PASS');
  assert.equal(complete.movementExposureGate, 'PASS');

  clock = 30;
  trace.frame({ now: 30, dt: 10, localPose: { target: { position: { x: 2, z: 0 } } },
    local: { x: 2, z: 0 } });
  const exported = trace.export();
  assert.equal(exported.truncated, true);
  assert.equal(exported.events.length, 3);
  assert.equal(exported.events.filter(row => row.k === 'frame').length, 2);
  const incomplete = analyzeMovementTrace(exported);
  assert.equal(incomplete.counts.hiddenFrames, 0);
  assert.equal(incomplete.foregroundGate, 'UNPROVEN');
  assert.equal(incomplete.movementExposureGate, 'UNPROVEN');
});
