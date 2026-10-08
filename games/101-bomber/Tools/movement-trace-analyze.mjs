// Summarizes a browser movement trace exported by `__lumioMovementTrace.export()`
// (Client/UI/Spectator/movement-trace.mjs). Reports per-pump request counts, latest owner
// publications read after each Tick, per-frame displacement against the target motion direction,
// facing deviation, stop overshoot and frame/pump timing. Never averages a whole
// window into one FPS figure: spikes stay visible as counts and maxima.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOLD_GAP_MS = 150;
const BACKWARD_EPSILON_M = 1e-4;
const STOP_WINDOW_MS = 300;
const DIRECTION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']);
const IDENTITY_FIELDS = ['sessionGeneration', 'entity', 'connectionGeneration'];
const MOTION_CAUSES = new Set(['InputPublication', 'ClockAdvance']);

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

function keyHoldWindows(events) {
  const windows = [];
  const held = new Set();
  let current = null;
  for (const event of events) {
    if ((event.vis !== undefined && event.vis !== 'visible') || event.focused === false) {
      if (current) { current.end = event.k === 'pump' ? event.tickAt ?? event.t : event.t; current = null; }
      held.clear();
      continue;
    }
    if (event.k !== 'key' || !DIRECTION_KEYS.has(event.code)) continue;
    if (event.type === 'keydown' && !event.repeat && !held.has(event.code)) {
      if (!held.size) { current = { start: event.t, end: Infinity, released: false }; windows.push(current); }
      held.add(event.code);
    } else if (event.type === 'keyup') {
      held.delete(event.code);
      if (!held.size && current) { current.end = event.t; current.released = true; current = null; }
    }
  }
  return windows;
}

// Legacy exports omitted identity; current exports with missing identity cannot establish continuity.
function observationSegments(events) {
  const identified = events.some(e => IDENTITY_FIELDS.some(key => Object.hasOwn(e.k === 'pump' ? e.pose ?? {} : e, key)));
  const segments = new Map();
  const excluded = {};
  const causes = {};
  let segment = 0, previousIdentity = null;
  for (const event of events) {
    let reason = null;
    const pose = event.k === 'pump' ? event.pose : event;
    if (event.vis !== undefined && event.vis !== 'visible') reason = 'visibility';
    else if (event.focused === false) reason = 'focus';
    else if (event.k !== 'pump' && event.k !== 'frame') continue;
    else if (!pose || ![pose.tx, pose.tz].every(Number.isFinite) ||
      (event.k === 'frame' && ![event.dx, event.dz].every(Number.isFinite))) reason = 'missingOrNonFinitePose';
    else if (identified && !IDENTITY_FIELDS.every(key => typeof pose[key] === 'string' && pose[key].length > 0)) reason = 'missingIdentity';
    else if ((identified || pose.cause !== undefined && pose.cause !== null) && !MOTION_CAUSES.has(pose.cause)) reason = 'publicationCause';
    if (event.k === 'pump' || event.k === 'frame') causes[pose?.cause ?? 'unknown'] = (causes[pose?.cause ?? 'unknown'] ?? 0) + 1;
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      segment++; previousIdentity = null;
      continue;
    }
    if (event.k !== 'pump' && event.k !== 'frame') continue;
    const identity = identified ? IDENTITY_FIELDS.map(key => pose[key]).join('/') : 'legacy';
    if (previousIdentity !== null && identity !== previousIdentity) {
      segment++;
      excluded.identityChange = (excluded.identityChange ?? 0) + 1;
    }
    previousIdentity = identity;
    segments.set(event, segment);
  }
  return { segments, identified, excluded, causes };
}

function executionDelta(a, b) {
  if (![a?.tick, b?.tick].every(value => typeof value === 'string' && /^\d+$/.test(value))) return null;
  const delta = BigInt(b.tick) - BigInt(a.tick);
  return delta >= 0n && delta <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(delta) : null;
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
  const observations = [...events].sort((a, b) => (a.k === 'pump' ? a.tickAt ?? a.t : a.t) - (b.k === 'pump' ? b.tickAt ?? b.t : b.t));
  const { segments, identified, excluded, causes } = observationSegments(observations);
  const keyed = events.some(e => e.k === 'key' && DIRECTION_KEYS.has(e.code));
  const windows = keyed ? keyHoldWindows(observations) : holdWindows(inputs);

  // Physical windows include every pump before release; legacy windows can only infer their endpoints
  // from requests. A released tap with no pump in its physical window remains outside held metrics.
  for (const [i, w] of windows.entries()) {
    if (keyed) {
      const indices = pumps.flatMap((p, index) => {
        const t = p.tickAt ?? p.t;
        return t >= w.start && t < w.end ? [index] : [];
      });
      w.firstPump = indices[0] ?? null;
      w.lastPump = indices.at(-1) ?? null;
      w.heldUntil = w.end;
    } else {
      w.firstPump = admittingPump(pumps, w.start);
      w.lastPump = admittingPump(pumps, w.end);
      w.heldUntil = w.lastPump === null ? w.end : (pumps[w.lastPump].tickAt ?? pumps[w.lastPump].t);
    }
    w.next = windows[i + 1]?.start ?? Infinity;
  }
  const pumpInputs = pumps.map(() => []);
  let admittingIndex = 0;
  for (const input of inputs) {
    while (admittingIndex < pumps.length && (pumps[admittingIndex].tickAt ?? pumps[admittingIndex].t) < input.t) admittingIndex++;
    if (admittingIndex < pumps.length) pumpInputs[admittingIndex].push(input);
  }
  for (const w of windows) {
    if (!keyed || !w.released || w.firstPump === null) continue;
    const tail = w.lastPump + 1;
    if (tail < pumps.length && (pumps[tail].tickAt ?? pumps[tail].t) < w.next &&
      pumpInputs[tail].some(input => input.t >= w.start && input.t < w.end)) w.lastPump = tail;
  }
  const admitted = [];
  const admittedPumps = new Set();
  const tickAdvance = [];
  const targetStep = [];
  let unchangedTarget = 0;
  for (const w of windows) {
    if (w.firstPump === null) continue;
    for (let i = w.firstPump; i <= w.lastPump; i++) {
      if (admittedPumps.has(i)) continue;
      admittedPumps.add(i);
      admitted.push(pumpInputs[i].filter(input => !keyed || (input.t >= w.start && input.t < w.end)).length);
      const a = pumps[i - 1]?.pose, b = pumps[i].pose;
      if (i === w.firstPump || !segments.has(pumps[i]) || !segments.has(pumps[i - 1]) ||
        segments.get(pumps[i]) !== segments.get(pumps[i - 1])) continue;
      const delta = executionDelta(a, b);
      if (delta !== null) tickAdvance.push(delta);
      if ([a?.tx, a?.tz, b?.tx, b?.tz].every(Number.isFinite)) {
        const step = Math.hypot(b.tx - a.tx, b.tz - a.tz);
        targetStep.push(step);
        if (step < 1e-6) unchangedTarget++;
      }
    }
  }
  const heldWindow = t => windows.find(w => t >= w.start && (keyed ? t < w.heldUntil : t <= w.heldUntil)) ?? null;

  // Per-frame displacement of what the player sees against the latest logic step direction.
  const displayed = frames.filter(f => segments.has(f));
  let direction = null;
  let lastTarget = null;
  let turnedAt = -Infinity;
  const backward = [];
  const lead = [];
  const facing = [];
  let turnExcludedFrames = 0;
  let lastHold = null;
  for (let i = 0; i < displayed.length; i++) {
    const f = displayed[i];
    const previous = displayed[i - 1];
    const hold = heldWindow(f.t);
    if (!previous || segments.get(previous) !== segments.get(f) || hold !== lastHold) {
      direction = null; lastTarget = null; turnedAt = -Infinity;
    }
    lastHold = hold;
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
    if (!direction || !hold || i === 0) continue;
    if (f.t - turnedAt <= TURN_SETTLE_MS) { turnExcludedFrames++; continue; }
    const along = (f.dx - previous.dx) * direction.x + (f.dz - previous.dz) * direction.z;
    if (along < -BACKWARD_EPSILON_M) backward.push({ t: f.t, along, frame: i });
    lead.push((f.dx - f.tx) * direction.x + (f.dz - f.tz) * direction.z);
    // A deliberate turn needs a moment to swing the doll; only settled frames count as facing errors.
    if (Number.isFinite(f.yaw)) facing.push(angleDelta(f.yaw, Math.atan2(direction.x, direction.z)));
  }
  let reversalEvents = 0;
  for (let i = 0; i < backward.length; i++) if (i === 0 || backward[i].frame !== backward[i - 1].frame + 1) reversalEvents++;

  // After each held window: display travel beyond the final logic target along the last step direction,
  // observed until the next hold starts.
  const overshoot = [];
  let partialStopWindows = 0, unstableStopWindows = 0;
  for (const w of windows) {
    if (keyed && !w.released) continue;
    const before = displayed.filter(f => f.t >= w.start && (keyed ? f.t < w.heldUntil : f.t <= w.heldUntil));
    const finalHeld = before.at(-1);
    const after = displayed.filter(f => f.t > w.heldUntil && f.t <= w.heldUntil + STOP_WINDOW_MS && f.t < w.next &&
      segments.get(f) === segments.get(finalHeld));
    if (!before.length || !after.length) continue;
    const final = displayed.find(f => f.t >= w.heldUntil + STOP_WINDOW_MS && f.t < w.next &&
      segments.get(f) === segments.get(finalHeld));
    if (!final) { partialStopWindows++; continue; }
    const previousFinal = after.filter(f => f.t < final.t).at(-1);
    if (!previousFinal) { partialStopWindows++; continue; }
    if (Math.hypot(final.tx - previousFinal.tx, final.tz - previousFinal.tz) > 1e-6) { unstableStopWindows++; continue; }
    let dir = null;
    for (let i = before.length - 1; i > 0 && !dir; i--) {
      if (segments.get(before[i]) !== segments.get(finalHeld) || segments.get(before[i - 1]) !== segments.get(finalHeld)) break;
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
  const longTaskCapability = notes.filter(n => /^longtask=/.test(n)).at(-1);
  const longTasksAvailable = longTaskCapability === 'longtask=supported' || longTasks.length > 0 ? true :
    longTaskCapability === 'longtask=unsupported' ? false : null;

  return {
    version: trace.version ?? null, truncated: Boolean(trace.truncated), notes,
    counts: { events: events.length, pumps: pumps.length, acceptedMoves: inputs.length, frames: frames.length,
      holdWindows: windows.length, hiddenFrames: frames.filter(f => f.vis !== 'visible').length,
      hiddenPumps: pumps.filter(p => p.vis !== 'visible').length },
    admission: { movesPerHeldPump: histogram(admitted), heldPumps: admitted.length,
      requestsOutsideHeldMetrics: inputs.length - admitted.reduce((sum, count) => sum + count, 0),
      source: 'accepted JavaScript move requests; not GAS execution success',
      nonOneRatio: admitted.length ? admitted.filter(v => v !== 1).length / admitted.length : null },
    holds: { source: keyed ? 'direction-key-edges' : 'accepted-request-gap-inference',
      limitations: keyed ? ['Physical key capture does not expose controls readiness, UI clears or touch state.',
        'A tap with no physical pump is outside held metrics; a final pre-release request may retain its later positive admitting pump.'] :
        ['Trace has no direction key edges; 150 ms accepted-request gaps infer holds and stops, not physical releases.'] },
    diagnostics: { identitySource: identified ? 'DTO identity strings' : 'legacy identity unavailable', excludedObservations: excluded,
      unknownFocusObservations: [...frames, ...pumps].filter(e => typeof e.focused !== 'boolean').length,
      publicationCauses: causes, limitations: ['DTO does not expose teleport identity; a teleport inside a normal publication cannot be identified automatically.',
        'Initial, AuthorityCorrection and unknown causes break straight-motion comparisons; their raw events and counts remain in the trace.',
        'Target-step direction and final post-Tick publication are proxies, not actual GAS execution or a simulation receipt.'] },
    execution: { tickAdvancePerHeldPump: histogram(tickAdvance), tickAdvanceSamples: tickAdvance.length, targetStepPerHeldPumpM: stats(targetStep),
      scope: 'Consecutive final post-Tick publications in one observation segment; not GAS execution success.',
      heldPumpsWithUnchangedTarget: unchangedTarget },
    display: {
      scope: 'Normal InputPublication/ClockAdvance observations only; AuthorityCorrection and Initial are excluded, so this is not all active movement. Legacy missing cause is inferred.',
      heldFrames: lead.length,
      backwardFrames: backward.length,
      backwardRatio: lead.length ? backward.length / lead.length : null,
      reversalEvents,
      turnExcludedFrames,
      stopWindowMs: STOP_WINDOW_MS, partialStopWindows, unstableStopWindows,
      maxBackwardM: lead.length ? (backward.length ? Math.max(...backward.map(b => -b.along)) : 0) : null,
      totalBackwardM: lead.length ? backward.reduce((sum, b) => sum - b.along, 0) : null,
      leadAlongMotionM: stats(lead),
      stopOvershootM: stats(overshoot),
    },
    facing: { heldFrames: facing.length, over30deg: facing.filter(a => degrees(a) > 30).length,
      scope: 'Same normal observation and hold scope as display; target-direction changes exclude 250 ms of settling.',
      over90deg: facing.filter(a => degrees(a) > 90).length, deviationDeg: stats(facing.map(degrees)) },
    timing: { frameIntervalMs: stats(frameIntervals), framesOver33ms: frameIntervals.filter(v => v > 33.4).length,
      framesOver50ms: frameIntervals.filter(v => v > 50).length, pumpIntervalMs: stats(pumpIntervals),
      tickMs: stats(pumps.map(p => p.tickMs)), pumpTotalMs: stats(pumps.map(p => p.totalMs)),
      longTasksAvailable, longTasks: longTasksAvailable === true ? longTasks.length : null, longTaskMs: stats(longTasks.map(l => l.duration)) },
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
