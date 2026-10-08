import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMovementTrace } from './movement-trace-analyze.mjs';

const STEP = 0.2;
const H = 50;

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

function recorded({ keys = [], inputs = [], pumps = [], frames = [] }) {
  return { version: 1, events: [
    ...keys.map(([t, type, code = 'KeyW', repeat = false]) => ({ k: 'key', t, type, code, repeat, vis: 'visible' })),
    ...inputs.map(t => ({ k: 'input', t, kind: 'move', accepted: true, args: [1, 0, false] })),
    ...pumps.map(t => ({ k: 'pump', t, tickAt: t, vis: 'visible',
      pose: { tick: String(t), tx: frames.filter(frame => frame[0] <= t).at(-1)?.[1] ?? 0, tz: 0, cause: 'InputPublication' } })),
    ...frames.map(([t, target, display]) => ({ k: 'frame', t, vis: 'visible', tx: target, tz: 0, dx: display, dz: 0, yaw: Math.PI / 2 })),
  ] };
}

test('each later hold counts only requests admitted since the preceding pump', () => {
  const summary = analyzeMovementTrace(recorded({ inputs: [5, 55, 505, 555], pumps: [10, 60, 510, 560] }));
  assert.equal(summary.counts.holdWindows, 2);
  assert.deepEqual(summary.admission.movesPerHeldPump, { 1: 4 });
});

test('direction key edges preserve continuous empty pumps until the actual release', () => {
  const summary = analyzeMovementTrace(recorded({ keys: [[0, 'keydown'], [200, 'keydown', 'KeyW', true], [400, 'keyup']],
    inputs: [5, 55, 355], pumps: [10, 60, 110, 160, 210, 260, 310, 360, 410] }));
  assert.equal(summary.counts.holdWindows, 1);
  assert.deepEqual(summary.admission.movesPerHeldPump, { 0: 5, 1: 3 });
});

test('a request gap without keyup does not create a stop overshoot sample', () => {
  const summary = analyzeMovementTrace(recorded({ keys: [[0, 'keydown']], inputs: [5, 55, 355],
    pumps: [10, 60, 110, 160, 210, 260, 310, 360],
    frames: [[10, .1, .1], [60, .2, .2], [70, .2, .3], [100, .2, .2], [350, .2, .2], [360, .3, .3], [410, .3, .3], [710, .3, .3]] }));
  assert.equal(summary.display.stopOvershootM.n, 0);
  assert.equal(summary.display.stopOvershootM.max, null);
});

test('a physical tap without a pump does not contribute requests to the following hold', () => {
  const summary = analyzeMovementTrace(recorded({ keys: [[0, 'keydown'], [2, 'keyup'], [5, 'keydown', 'ArrowRight'], [80, 'keyup', 'ArrowRight']],
    inputs: [1, 6], pumps: [10, 60, 110] }));
  assert.deepEqual(summary.admission.movesPerHeldPump, { 0: 1, 1: 1 });
  assert.equal(summary.counts.holdWindows, 2);
  assert.equal(summary.admission.requestsOutsideHeldMetrics, 1);
});

test('a release after an accepted request gap measures only the actual stop tail', () => {
  const summary = analyzeMovementTrace(recorded({ keys: [[0, 'keydown'], [400, 'keyup']], inputs: [5, 55, 355],
    pumps: [10, 60, 110, 160, 210, 260, 310, 360],
    frames: [[10, .1, .1], [60, .2, .2], [70, .2, .3], [100, .2, .2], [350, .2, .2], [360, .3, .3], [410, .3, .3], [710, .3, .3]] }));
  assert.equal(summary.display.stopOvershootM.n, 1);
  assert.equal(summary.display.stopOvershootM.max, 0);
});

const identity = { sessionGeneration: '9007199254740993', entity: '00000000000000070000000000000002', connectionGeneration: '18446744073709551615' };
function observed(t, x, extra = {}) {
  return { ...identity, t, vis: 'visible', focused: true, cause: 'InputPublication', tick: String(t), tx: x, tz: 0, dx: x, dz: 0,
    yaw: Math.PI / 2, ...extra };
}

test('identity, null pose, visibility, focus and publication boundaries break frame and pump comparisons', () => {
  const boundaries = [
    { k: 'frame', ...observed(100, 50, { entity: '00000000000000070000000000000003' }) },
    { k: 'frame', ...observed(100, 50, { sessionGeneration: null }) },
    { k: 'frame', ...observed(100, 50, { vis: 'hidden' }) },
    { k: 'frame', ...observed(100, 50, { focused: false }) },
    { k: 'frame', ...observed(100, 50, { tx: null, dx: null }) },
    { k: 'frame', ...observed(100, 50, { cause: 'AuthorityCorrection' }) },
    { k: 'frame', ...observed(100, 50, { cause: 'UnknownPublication' }) },
    { k: 'pump', t: 100, tickAt: 100, vis: 'visible', focused: true, pose: null },
  ];
  for (const boundary of boundaries) {
    const trace = recorded({ keys: [[0, 'keydown']], inputs: [5, 55, 155, 205], pumps: [] });
    trace.events.push(
      { k: 'pump', ...observed(10, 0), tickAt: 10, pose: observed(10, 0) },
      { k: 'frame', ...observed(20, 0) },
      { k: 'pump', ...observed(60, .2), tickAt: 60, pose: observed(60, .2) },
      { k: 'frame', ...observed(70, .2, { dx: .3 }) },
      boundary,
      { k: 'pump', ...observed(160, -.1), tickAt: 160, pose: observed(160, -.1) },
      { k: 'frame', ...observed(170, -.1, { yaw: -Math.PI / 2 }) },
      { k: 'pump', ...observed(210, .1), tickAt: 210, pose: observed(210, .1) },
      { k: 'frame', ...observed(220, .1) },
    );
    const summary = analyzeMovementTrace(trace);
    assert.equal(summary.display.backwardFrames, 0, JSON.stringify(boundary));
    assert.equal(summary.facing.over90deg, 0, JSON.stringify(boundary));
    assert.equal(summary.execution.targetStepPerHeldPumpM.n, boundary.vis === 'hidden' || boundary.focused === false ? 1 : 2, JSON.stringify(boundary));
    assert.equal(summary.execution.targetStepPerHeldPumpM.max, .2, JSON.stringify(boundary));
  }
});

test('legal turn display inertia is excluded from straight backward displacement samples', () => {
  const trace = synthetic({ stride: i => (i < 10 ? STEP : -STEP), display: interpolate });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.backwardFrames, 0);
  assert.ok(summary.display.turnExcludedFrames > 0);
});

test('non-finite display coordinates have no valid movement or facing denominator', () => {
  const trace = recorded({ keys: [[0, 'keydown']], inputs: [5, 55], pumps: [10, 60], frames: [] });
  trace.events.push({ k: 'frame', ...observed(10, 0, { dz: undefined }) },
    { k: 'frame', ...observed(60, .2, { dx: Infinity }) }, { k: 'frame', ...observed(70, .2, { dx: NaN }) });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.heldFrames, 0);
  assert.equal(summary.display.leadAlongMotionM.n, 0);
  assert.equal(summary.display.maxBackwardM, null);
  assert.equal(summary.display.totalBackwardM, null);
  assert.equal(summary.facing.deviationDeg.n, 0);
  assert.equal(summary.facing.deviationDeg.max, null);
});

test('analysis preserves every raw event and reports legacy hold inference explicitly', () => {
  const trace = synthetic({ display: interpolate });
  const original = JSON.stringify(trace);
  const summary = analyzeMovementTrace(trace);
  assert.equal(JSON.stringify(trace), original);
  assert.equal(summary.holds.source, 'accepted-request-gap-inference');
  assert.ok(summary.holds.limitations.length > 0);
  assert.match(summary.admission.source, /not GAS/);
});

test('post-Tick pump observations break continuity at tickAt rather than the earlier pump start', () => {
  const trace = recorded({ keys: [[0, 'keydown']], inputs: [1] });
  trace.events.push({ k: 'pump', t: 2, tickAt: 10, vis: 'visible', pose: observed(10, 50, { entity: 'other-life' }) },
    { k: 'frame', ...observed(5, 0) }, { k: 'frame', ...observed(15, .2) });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.heldFrames, 0);
  assert.equal(summary.facing.heldFrames, 0);
});

test('a request published before release retains its later admitting pump without counting released empty pumps', () => {
  const trace = recorded({ keys: [[0, 'keydown'], [90, 'keyup']], inputs: [5, 55, 85], pumps: [10, 60, 110, 160, 210] });
  const summary = analyzeMovementTrace(trace);
  assert.deepEqual(summary.admission.movesPerHeldPump, { 1: 3 });
  assert.equal(summary.admission.heldPumps, 3);
  assert.equal(summary.admission.requestsOutsideHeldMetrics, 0);
});

test('legacy inferred holds sharing a delayed pump count that pump once', () => {
  const summary = analyzeMovementTrace(recorded({ inputs: [5, 205], pumps: [300] }));
  assert.equal(summary.counts.holdWindows, 2);
  assert.deepEqual(summary.admission.movesPerHeldPump, { 2: 1 });
});

test('a stop with less than 300 ms of observed tail is unavailable', () => {
  const trace = recorded({ keys: [[0, 'keydown'], [100, 'keyup']], inputs: [5, 55],
    frames: [[10, 0, 0], [60, .2, .2], [110, .2, .2]] });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.stopOvershootM.n, 0);
  assert.equal(summary.display.stopOvershootM.max, null);
  assert.equal(summary.display.partialStopWindows, 1);
});

test('current identified observations with missing cause cannot establish motion continuity', () => {
  const trace = recorded({ keys: [[0, 'keydown']] });
  trace.events.push({ k: 'frame', ...observed(10, 0, { cause: null }) }, { k: 'frame', ...observed(60, .2, { cause: null }) });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.heldFrames, 0);
  assert.equal(summary.facing.heldFrames, 0);
  assert.equal(summary.diagnostics.excludedObservations.publicationCause, 2);
  assert.match(summary.display.scope, /AuthorityCorrection.*excluded/);
});

test('missing long-task API evidence is unavailable while supported zero observations is zero', () => {
  const trace = { events: [{ k: 'note', t: 0, message: 'longtask=unsupported' }] };
  const unavailable = analyzeMovementTrace(trace);
  assert.equal(unavailable.timing.longTasksAvailable, false);
  assert.equal(unavailable.timing.longTasks, null);
  const supported = analyzeMovementTrace({ events: [{ k: 'note', t: 0, message: 'longtask=supported' }] });
  assert.equal(supported.timing.longTasksAvailable, true);
  assert.equal(supported.timing.longTasks, 0);
  assert.equal(analyzeMovementTrace({ events: [] }).timing.longTasksAvailable, null);
});

test('stop measurement keeps the release-to-final-publication display travel and rejects an unstable endpoint', () => {
  const trace = recorded({ keys: [[0, 'keydown'], [90, 'keyup']], inputs: [5, 55, 85], pumps: [10, 60, 110],
    frames: [[10, 0, 0], [60, .2, .2], [100, .2, .6], [120, .4, .4], [410, .4, .4]] });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.stopOvershootM.n, 1);
  assert.equal(summary.display.stopOvershootM.max, .2);
  const last = trace.events.find(e => e.k === 'frame' && e.t === 410);
  last.tx = .5;
  last.dx = .5;
  const unstable = analyzeMovementTrace(trace);
  assert.equal(unstable.display.stopOvershootM.n, 0);
  assert.equal(unstable.display.unstableStopWindows, 1);
});

test('a new physical hold cannot inherit a direction or facing denominator before its own target movement', () => {
  const trace = recorded({ keys: [[0, 'keydown'], [100, 'keyup'], [200, 'keydown', 'ArrowLeft']], inputs: [5, 55, 205],
    frames: [[10, 0, 0], [60, .2, .2], [110, .2, .2], [210, .2, .2], [260, .2, .2]] });
  trace.events.find(e => e.k === 'frame' && e.t === 260).yaw = -Math.PI / 2;
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.heldFrames, 1);
  assert.equal(summary.facing.heldFrames, 1);
  assert.equal(summary.facing.over90deg, 0);
});

test('an endpoint exactly 300 ms after release must agree with a distinct preceding target sample', () => {
  const trace = recorded({ keys: [[0, 'keydown'], [100, 'keyup']], inputs: [5, 55],
    frames: [[10, 0, 0], [60, .2, .2], [110, .2, .2], [400, .4, .4]] });
  const summary = analyzeMovementTrace(trace);
  assert.equal(summary.display.stopOvershootM.n, 0);
  assert.equal(summary.display.unstableStopWindows, 1);
});
