import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMovementTrace } from './movement-trace-analyze.mjs';

const STEP = 0.2;
const H = 50;

// Held +X for `steps` pumps; `display(t, target, admittedAt)` decides what the doll shows.
function synthetic({ steps = 20, movesPerPump = () => 1, pumpLate = () => 0, display, yaw = () => Math.PI / 2, hidden = () => false }) {
  const events = [{ k: 'note', t: 0, message: 'input=interval' }];
  let target = 0, seq = 0, tick = 10, admittedAt = 0, inputTime = 0;
  const admissions = [];
  for (let i = 0; i < steps; i++) {
    const startedAt = i * H + pumpLate(i);
    const moves = movesPerPump(i);
    for (let m = 0; m < moves; m++) {
      inputTime = startedAt - 5 + m * 0.1;
      events.push({ k: 'input', t: inputTime, kind: 'move', accepted: true, args: [2, 0, m === 0 && i === 0] });
    }
    events.push({ k: 'pump', t: startedAt, tickAt: startedAt + 0.5, tickMs: 3, totalMs: 6, state: 'active', vis: 'visible' });
    tick++;
    if (moves) { target += moves * STEP; seq++; admittedAt = startedAt + 0.5; admissions.push({ t: admittedAt, target, seq, tick }); }
  }
  const end = steps * H + 300;
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
  assert.deepEqual(summary.publications.executionTickAdvance, { 1: 19 });
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

test('empty and double pumps appear in the admission histogram and as tick jumps', () => {
  const pattern = [1, 1, 0, 2, 1, 1, 0, 2, 1, 1];
  const summary = analyzeMovementTrace(synthetic({ steps: pattern.length, movesPerPump: i => pattern[i], display: interpolate }));
  assert.deepEqual(summary.admission.movesPerHeldPump, { 0: 2, 1: 6, 2: 2 });
  assert.equal(summary.admission.nonOneRatio, 0.4);
  assert.equal(summary.publications.executionTickAdvance[2], 2);
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
