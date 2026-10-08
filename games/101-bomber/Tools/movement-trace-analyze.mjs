// Summarizes a browser movement trace exported by `__lumioMovementTrace.export()`
// (Client/UI/Spectator/movement-trace.mjs). Reports per-pump admission counts, executed
// steps read after each Tick, per-frame displacement against the logic motion direction,
// facing deviation, stop overshoot and frame/pump timing. Never averages a whole
// window into one FPS figure: spikes stay visible as counts and maxima.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOLD_GAP_MS = 150;
const BACKWARD_EPSILON_M = 1e-4;
const STOP_WINDOW_MS = 300;

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
}

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const round = value => (value === null || value === undefined ? null : Math.round(value * 1000) / 1000);
  return { n: sorted.length, p50: round(percentile(sorted, .5)), p95: round(percentile(sorted, .95)),
    p99: round(percentile(sorted, .99)), max: round(sorted.at(-1) ?? null) };
}

function histogram(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function angleDelta(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

// Consecutive accepted move inputs closer than HOLD_GAP_MS form one held window.
function holdWindows(inputs) {
  const windows = [];
  for (const input of inputs) {
    const last = windows.at(-1);
    if (last && input.t - last.end <= HOLD_GAP_MS) { last.end = input.t; last.inputs++; }
    else windows.push({ start: input.t, end: input.t, inputs: 1 });
  }
  return windows;
}

const TURN_SETTLE_MS = 250;

// The pump admitting an input is the first one whose Tick starts at or after it.
function admittingPump(pumps, t) {
  const index = pumps.findIndex(p => (p.tickAt ?? p.t) >= t);
  return index < 0 ? null : index;
}

export function analyzeMovementTrace(trace) {
  if (!trace || !Array.isArray(trace.events)) throw new Error('movement_trace_events_missing');
  const events = [...trace.events].sort((a, b) => a.t - b.t);
  const pumps = events.filter(e => e.k === 'pump');
  const inputs = events.filter(e => e.k === 'input' && e.kind === 'move' && e.accepted);
  const frames = events.filter(e => e.k === 'frame');
  const longTasks = events.filter(e => e.k === 'longtask');
  const windows = holdWindows(inputs);

  // A held window spans the pumps from the one admitting its first input to the one admitting its last,
  // so released pumps never count as empty. In the pump driver every held pump publishes one move by
  // construction; there the executed-step figures below are the meaningful ones.
  for (const [i, w] of windows.entries()) {
    w.firstPump = admittingPump(pumps, w.start);
    w.lastPump = admittingPump(pumps, w.end);
    w.heldUntil = w.lastPump === null ? w.end : (pumps[w.lastPump].tickAt ?? pumps[w.lastPump].t);
    w.next = windows[i + 1]?.start ?? Infinity;
  }
  const admitted = [];
  const tickAdvance = [];
  const targetStep = [];
  let unchangedTarget = 0;
  for (const w of windows) {
    if (w.firstPump === null) continue;
    for (let i = w.firstPump; i <= w.lastPump; i++) {
      const from = i === w.firstPump ? -Infinity : pumps[i - 1].tickAt ?? pumps[i - 1].t;
      const to = pumps[i].tickAt ?? pumps[i].t;
      admitted.push(inputs.filter(input => input.t > from && input.t <= to).length);
      const a = pumps[i - 1]?.pose, b = pumps[i].pose;
      if (i === w.firstPump || !a || !b || a.tick === null || b.tick === null) continue;
      tickAdvance.push(Number(BigInt(b.tick) - BigInt(a.tick)));
      if (a.tx !== null && b.tx !== null) {
        const step = Math.hypot(b.tx - a.tx, b.tz - a.tz);
        targetStep.push(step);
        if (step < 1e-6) unchangedTarget++;
      }
    }
  }
  const heldWindow = t => windows.find(w => t >= w.start && t <= w.heldUntil) ?? null;

  // Per-frame displacement of what the player sees against the latest logic step direction.
  const displayed = frames.filter(f => f.dx !== null && f.tx !== null);
  let direction = null;
  let lastTarget = null;
  let turnedAt = -Infinity;
  const backward = [];
  const lead = [];
  const facing = [];
  for (let i = 0; i < displayed.length; i++) {
    const f = displayed[i];
    if (lastTarget && (f.tx !== lastTarget.x || f.tz !== lastTarget.z)) {
      const vx = f.tx - lastTarget.x, vz = f.tz - lastTarget.z;
      const length = Math.hypot(vx, vz);
      if (length > 1e-6) {
        const next = { x: vx / length, z: vz / length };
        if (direction && next.x * direction.x + next.z * direction.z < 0.999) turnedAt = f.t;
        direction = next;
      }
    }
    lastTarget = { x: f.tx, z: f.tz };
    if (!direction || !heldWindow(f.t) || i === 0) continue;
    const previous = displayed[i - 1];
    const along = (f.dx - previous.dx) * direction.x + (f.dz - previous.dz) * direction.z;
    if (along < -BACKWARD_EPSILON_M) backward.push({ t: f.t, along, frame: i });
    lead.push((f.dx - f.tx) * direction.x + (f.dz - f.tz) * direction.z);
    // A deliberate turn needs a moment to swing the doll; only settled frames count as facing errors.
    if (f.yaw !== null && f.t - turnedAt > TURN_SETTLE_MS) facing.push(angleDelta(f.yaw, Math.atan2(direction.x, direction.z)));
  }
  let reversalEvents = 0;
  for (let i = 0; i < backward.length; i++) if (i === 0 || backward[i].frame !== backward[i - 1].frame + 1) reversalEvents++;

  // After each held window: display travel beyond the final logic target along the last step direction,
  // observed until the next hold starts.
  const overshoot = [];
  for (const w of windows) {
    const before = displayed.filter(f => f.t >= w.start && f.t <= w.heldUntil);
    const after = displayed.filter(f => f.t > w.heldUntil && f.t <= Math.min(w.heldUntil + STOP_WINDOW_MS, w.next));
    if (!before.length || !after.length) continue;
    const final = after.at(-1);
    let dir = null;
    for (let i = before.length - 1; i > 0 && !dir; i--) {
      const vx = before[i].tx - before[i - 1].tx, vz = before[i].tz - before[i - 1].tz;
      const length = Math.hypot(vx, vz);
      if (length > 1e-6) dir = { x: vx / length, z: vz / length };
    }
    if (!dir) continue;
    overshoot.push(Math.max(0, ...after.map(f => (f.dx - final.tx) * dir.x + (f.dz - final.tz) * dir.z)));
  }

  const frameIntervals = [];
  for (let i = 1; i < frames.length; i++) frameIntervals.push(frames[i].t - frames[i - 1].t);
  const pumpIntervals = [];
  for (let i = 1; i < pumps.length; i++) pumpIntervals.push(pumps[i].t - pumps[i - 1].t);
  const degrees = value => (value * 180) / Math.PI;
  const notes = events.filter(e => e.k === 'note').map(e => e.message);

  return {
    version: trace.version ?? null, truncated: Boolean(trace.truncated), notes,
    counts: { events: events.length, pumps: pumps.length, acceptedMoves: inputs.length, frames: frames.length,
      holdWindows: windows.length, hiddenFrames: frames.filter(f => f.vis !== 'visible').length,
      hiddenPumps: pumps.filter(p => p.vis !== 'visible').length },
    admission: { movesPerHeldPump: histogram(admitted),
      nonOneRatio: admitted.length ? admitted.filter(v => v !== 1).length / admitted.length : null },
    execution: { tickAdvancePerHeldPump: histogram(tickAdvance), targetStepPerHeldPumpM: stats(targetStep),
      heldPumpsWithUnchangedTarget: unchangedTarget },
    display: {
      heldFrames: lead.length,
      backwardFrames: backward.length,
      backwardRatio: lead.length ? backward.length / lead.length : null,
      reversalEvents,
      maxBackwardM: backward.length ? Math.max(...backward.map(b => -b.along)) : 0,
      totalBackwardM: backward.reduce((sum, b) => sum - b.along, 0),
      leadAlongMotionM: stats(lead),
      stopOvershootM: stats(overshoot),
    },
    facing: { heldFrames: facing.length, over30deg: facing.filter(a => degrees(a) > 30).length,
      over90deg: facing.filter(a => degrees(a) > 90).length, deviationDeg: stats(facing.map(degrees)) },
    timing: { frameIntervalMs: stats(frameIntervals), framesOver33ms: frameIntervals.filter(v => v > 33.4).length,
      framesOver50ms: frameIntervals.filter(v => v > 50).length, pumpIntervalMs: stats(pumpIntervals),
      tickMs: stats(pumps.map(p => p.tickMs)), pumpTotalMs: stats(pumps.map(p => p.totalMs)),
      longTasks: longTasks.length, longTaskMs: stats(longTasks.map(l => l.duration)) },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node Tools/movement-trace-analyze.mjs <exported-trace.json>');
    process.exit(2);
  }
  console.log(JSON.stringify(analyzeMovementTrace(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
}
