// Summarizes a browser movement trace exported by `__lumioMovementTrace.export()`
// (Client/UI/Spectator/movement-trace.mjs). Reports per-pump admission counts, executed
// steps read after each Tick, per-frame displacement against the logic motion direction,
// facing deviation, stop overshoot and frame/pump timing. Never averages a whole
// window into one FPS figure: spikes stay visible as counts and maxima.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NATIVE_OPERATIONS } from '../Client/UI/Spectator/native-invoke-observer.mjs';

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

// Step input is retained state. Repeated physical setters are not required to keep it
// held; only a zero-direction setter or a real clear closes the exposure window.
function stepHoldWindows(events) {
  const windows = [];
  let held = null;
  for (const event of events) {
    if (event.k === 'moveIntent') {
      const active = Number(event.primary) !== 0 || Number(event.secondary) !== 0;
      if (active && !held) held = { start: event.t, end: Infinity, inputs: 0, closed: false };
      if (active && held) held.inputs++;
      if (!active && held) { held.end = event.t; held.closed = true; windows.push(held); held = null; }
    } else if (event.k === 'intentReset' && held) {
      held.end = event.t; held.closed = true; windows.push(held); held = null;
    }
  }
  if (held) windows.push(held);
  return windows;
}

const TURN_SETTLE_MS = 250;

// The pump admitting an input is the first one whose Tick starts at or after it.
function admittingPump(pumps, t) {
  const index = pumps.findIndex(p => (p.tickAt ?? p.t) >= t);
  return index < 0 ? null : index;
}

function nativeInvokeTiming(events, trace) {
  const empty = () => ({ count: 0, sumMs: 0, maxMs: 0, failed: 0 });
  const totals = { ...empty(), windows: 0, failedTicks: 0, invalidWindows: 0, diagnosticFailure: 0 };
  const operations = NATIVE_OPERATIONS.map(operation => ({ operation, ...empty() })), tickMs = [];
  const validMetric = row => row && Number.isSafeInteger(row.count) && row.count >= 0 &&
    Number.isSafeInteger(row.failed) && row.failed >= 0 && row.failed <= row.count &&
    Number.isFinite(row.sumMs) && row.sumMs >= 0 && Number.isFinite(row.maxMs) && row.maxMs >= 0;
  const merge = (target, row) => {
    target.count += row.count; target.sumMs += row.sumMs; target.maxMs = Math.max(target.maxMs, row.maxMs); target.failed += row.failed;
  };
  for (const event of events.filter(event => event.k === 'nativeInvokeTiming')) {
    const snapshot = event.snapshot;
    if (!Number.isFinite(event.startedAt) || !Number.isFinite(event.endedAt) || event.endedAt < event.startedAt ||
        typeof event.returned !== 'boolean' || snapshot?.version !== 1 || snapshot.scope !== 'managedTick' ||
        snapshot.timing !== 'JS_NATIVE_BRIDGE_INCLUSIVE' || !validMetric(snapshot) ||
        !Number.isSafeInteger(snapshot.diagnosticFailure) || snapshot.diagnosticFailure < 0 ||
        !Array.isArray(snapshot.operations) || snapshot.operations.length !== NATIVE_OPERATIONS.length ||
        !snapshot.operations.every((row, index) => row.operation === NATIVE_OPERATIONS[index] && validMetric(row))) {
      totals.invalidWindows++; continue;
    }
    totals.windows++; if (!event.returned) totals.failedTicks++;
    totals.diagnosticFailure += snapshot.diagnosticFailure; merge(totals, snapshot);
    snapshot.operations.forEach((row, index) => merge(operations[index], row));
    tickMs.push(event.endedAt - event.startedAt);
  }
  const unproven = Boolean(trace.truncated) || (trace.diagnosticFailures ?? 0) > 0 ||
    totals.invalidWindows > 0 || totals.diagnosticFailure > 0;
  return { boundary: 'JS_NATIVE_BRIDGE_INCLUSIVE',
    note: 'Synchronous JS bridge and native call inclusive; C# serialization and marshaling excluded; not pure Rust time.',
    status: unproven ? 'UNPROVEN' : totals.windows ? 'OBSERVED' : 'NOT_OBSERVED',
    ...totals, operations, tickMs: stats(tickMs) };
}

function managedFacadeTiming(batches, trace) {
  const phases = ['preIdentity', 'sessionTick', 'postIdentityCleanup'];
  const values = Object.fromEntries(phases.map(phase => [phase, []]));
  const counters = new Map();
  let windows = 0, failedTicks = 0, skippedSessions = 0, invalidWindows = 0;
  const unsigned = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? BigInt(value) : null;
  const stamp = value => typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value) ? BigInt(value) : null;
  for (const batch of batches) {
    if ('facadeTimingLoss' in batch || 'facadeTimingDiagnosticFailures' in batch) {
      const loss = unsigned(batch.facadeTimingLoss), failures = unsigned(batch.facadeTimingDiagnosticFailures);
      if (loss === null || failures === null || typeof batch.hostLifetime !== 'string') invalidWindows++;
      else {
        const prior = counters.get(batch.hostLifetime) ?? { loss: 0n, failures: 0n };
        counters.set(batch.hostLifetime, { loss: loss > prior.loss ? loss : prior.loss,
          failures: failures > prior.failures ? failures : prior.failures });
      }
    }
    const timing = batch.facadeTiming;
    if (timing === null || timing === undefined) continue;
    const frequency = unsigned(batch.clockFrequency);
    if (timing.version !== 1 || unsigned(timing.ordinal) === null ||
        typeof timing.completed !== 'boolean' || typeof timing.sessionInvoked !== 'boolean' ||
        batch.clockDomain !== 'Stopwatch.GetTimestamp/unanchored-to-performance.now' ||
        frequency === null || frequency === 0n ||
        (timing.completed ? timing.failedPhase !== null : !phases.includes(timing.failedPhase))) {
      invalidWindows++; continue;
    }
    windows++;
    if (!timing.completed) failedTicks++;
    if (!timing.sessionInvoked) skippedSessions++;
    let invalid = false;
    for (const phase of phases) {
      const span = timing[phase];
      const required = phase === 'preIdentity' || (phase === 'sessionTick' && timing.sessionInvoked) ||
        (phase === 'postIdentityCleanup' && (timing.completed || timing.failedPhase === phase));
      if (span === null && !required) continue; // Unexecuted spans are absent, never a zero-duration sample.
      if (!required || !span) { invalid = true; continue; }
      const start = stamp(span.startedStamp), end = stamp(span.endedStamp);
      if (start === null || end === null || end < start) { invalid = true; continue; }
      const ms = Number(end - start) * 1000 / Number(frequency);
      if (!Number.isFinite(ms)) { invalid = true; continue; }
      values[phase].push(ms);
    }
    if (invalid) invalidWindows++;
  }
  const timingLoss = [...counters.values()].reduce((sum, row) => sum + row.loss, 0n);
  const diagnosticFailures = [...counters.values()].reduce((sum, row) => sum + row.failures, 0n);
  const unproven = Boolean(trace.truncated) || (trace.diagnosticFailures ?? 0) > 0 || invalidWindows > 0 ||
    timingLoss > 0n || diagnosticFailures > 0n;
  return { boundary: 'MANAGED_FACADE_STOPWATCH',
    note: 'Raw same-domain Stopwatch differences; not JS absolute time and not pure managed CPU time.',
    status: unproven ? 'UNPROVEN' : windows ? 'OBSERVED' : 'NOT_OBSERVED',
    windows, failedWindows: failedTicks, skippedSessions, invalidWindows,
    timingLoss: timingLoss.toString(), diagnosticFailures: diagnosticFailures.toString(),
    sections: Object.fromEntries(phases.map(phase => [phase, stats(values[phase])])) };
}

export function analyzeMovementTrace(trace) {
  if (!trace || !Array.isArray(trace.events)) throw new Error('movement_trace_events_missing');
  const certifiedCapture = trace.version >= 2 && trace.timeBasis === 'performance.now' &&
    trace.frameTimeBasis === 'observer-invocation';
  const events = [...trace.events].sort((a, b) => a.t - b.t);
  const pumps = events.filter(e => e.k === 'pump');
  const inputs = events.filter(e => e.k === 'input' && e.kind === 'move' && e.accepted);
  const stepDriver = events.some(e => e.k === 'moveIntent' || (e.k === 'note' && e.message === 'input=step'));
  const frames = events.filter(e => e.k === 'frame');
  const longTasks = events.filter(e => e.k === 'longtask');
  const managedReceipts = events.filter(e => e.k === 'managedTrace' && e.batch);
  const managedBatches = managedReceipts.map(e => e.batch);
  const pumpStepCounts = managedReceipts.filter(e => e.pumpBracket).map(e =>
    (e.batch.events ?? []).filter(row => row.k === 'sample').length);
  const managed = managedBatches.flatMap(batch => (batch.events ?? []).map(event => ({ ...event, hostLifetime: batch.hostLifetime, batch })));
  const samples = managed.filter(e => e.k === 'sample');
  const requests = managed.filter(e => e.k === 'request');
  const accepted = managed.filter(e => e.k === 'accepted');
  const sampleKey = e => `${e.hostLifetime}:${e.sampleId}`;
  const requestsBySample = new Map();
  for (const request of requests) {
    const key = sampleKey(request);
    requestsBySample.set(key, [...(requestsBySample.get(key) ?? []), request]);
  }
  const heldMoveCounts = samples.filter(s => Number(s.primary) !== 0).map(sample =>
    (requestsBySample.get(sampleKey(sample)) ?? []).filter(r => r.ability === 'MoveAbility').length);
  const transportObservationMs = [];
  const requestKey = e => `${e.hostLifetime}:${e.sender}:${e.wireGeneration}:${e.sequence}`;
  const requestLookup = new Map();
  for (const request of requests) {
    const key = requestKey(request);
    requestLookup.set(key, [...(requestLookup.get(key) ?? []), request]);
  }
  const matchingRequest = row => (requestLookup.get(requestKey(row)) ?? []).find(r => r.sampleId === row.sampleId);
  for (const row of accepted) {
    const prior = matchingRequest(row);
    const frequency = Number(row.batch.clockFrequency);
    if (prior && prior.sampleId === row.sampleId && typeof prior.stamp === 'string' &&
      typeof row.stamp === 'string' && Number.isFinite(frequency) && frequency > 0) {
      const delta = Number(BigInt(row.stamp) - BigInt(prior.stamp)) * 1000 / frequency;
      if (delta >= 0) transportObservationMs.push(delta);
    }
  }
  const incompleteManaged = managedBatches.some(batch => !batch.complete || Number(batch.eventLoss) > 0 ||
    Number(batch.pendingLoss) > 0 || Number(batch.unmatched) > 0 || Number(batch.diagnosticFailures) > 0);
  const traceDiagnosticFailures = Math.max(Number(trace.diagnosticFailures) || 0,
    events.filter(e => e.k === 'diagnosticFailure').length);
  const unmatchedAccepted = accepted.filter(e => !e.sampleId || !matchingRequest(e)).length;
  const latestByHost = new Map(managedBatches.map(batch => [batch.hostLifetime, batch]));
  const exactCorrelation = managedBatches.length > 0 && samples.length > 0 && !incompleteManaged &&
    traceDiagnosticFailures === 0 &&
    [...latestByHost.values()].every(batch => batch.pending === 0) && unmatchedAccepted === 0 &&
    heldMoveCounts.every(count => count === 1);
  const windows = stepDriver ? stepHoldWindows(events) : holdWindows(inputs);

  // Legacy windows follow repeated publications. Step windows follow the actual retained setter
  // state through release or clear, excluding a pump after release.
  for (const [i, w] of windows.entries()) {
    if (stepDriver) {
      const heldPumps = pumps.map((pump, index) => ({ index, t: pump.tickAt ?? pump.t }))
        .filter(pump => pump.t >= w.start && pump.t < w.end);
      w.firstPump = heldPumps[0]?.index ?? null;
      w.lastPump = heldPumps.at(-1)?.index ?? null;
      w.heldUntil = w.end;
    } else {
      w.firstPump = admittingPump(pumps, w.start);
      w.lastPump = admittingPump(pumps, w.end);
      w.heldUntil = w.lastPump === null ? w.end : (pumps[w.lastPump].tickAt ?? pumps[w.lastPump].t);
    }
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
      if (!stepDriver) admitted.push(inputs.filter(input => input.t > from && input.t <= to).length);
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
    if (stepDriver && !w.closed) continue;
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
  const rafIntervals = [];
  for (let i = 1; i < frames.length; i++)
    if (Number.isFinite(frames[i].rafT) && Number.isFinite(frames[i - 1].rafT))
      rafIntervals.push(frames[i].rafT - frames[i - 1].rafT);
  const pumpIntervals = [];
  for (let i = 1; i < pumps.length; i++) pumpIntervals.push(pumps[i].t - pumps[i - 1].t);
  const degrees = value => (value * 180) / Math.PI;
  const notes = events.filter(e => e.k === 'note').map(e => e.message);
  const stops = stepDriver ? windows.filter(w => w.closed).map(w => ({ t: w.end }))
    : events.filter(e => e.k === 'key' && e.type === 'keyup');
  const postStopFrameIndices = new Set();
  const firstFrameAfter = t => {
    let low = 0, high = frames.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (frames[middle].t <= t) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const stopTails = stops.map(stop => {
    let count = 0, last = null;
    for (let i = firstFrameAfter(stop.t); i < frames.length && frames[i].t <= stop.t + STOP_WINDOW_MS; i++) {
      postStopFrameIndices.add(i); count++; last = frames[i];
    }
    return { stoppedAt: stop.t, frames: count, lastPublicationSequence: last?.seq ?? null,
      lastDisplayedX: last?.dx ?? null, lastTargetX: last?.tx ?? null };
  });
  const framesAfterStop = postStopFrameIndices.size;
  const foreground = certifiedCapture && !trace.truncated && frames.length > 0 && frames.every(f => f.vis === 'visible') &&
    frames.every(f => Number.isFinite(f.t)) && frames.some(f => Number.isFinite(f.dx) && Number.isFinite(f.tx));

  return {
    version: trace.version ?? null, truncated: Boolean(trace.truncated), notes,
    captureProvenance: certifiedCapture ? 'certified' : 'uncertified-legacy-v1',
    foregroundGate: foreground ? 'PASS' : 'UNPROVEN',
    movementExposureGate: foreground && lead.length > 0 ? 'PASS' : 'UNPROVEN',
    legacyInputAcceptedMeans: 'local-publication-only',
    stopTails,
    counts: { events: events.length, pumps: pumps.length, acceptedMoves: inputs.length,
      legacyPublishedMoves: inputs.length, frames: frames.length,
      holdWindows: windows.length, hiddenFrames: frames.filter(f => f.vis !== 'visible').length,
      stepIntentMoves: events.filter(e => e.k === 'moveIntent').length,
      hiddenPumps: pumps.filter(p => p.vis !== 'visible').length, framesAfterStop,
      samples: samples.length, requests: requests.length, transportAccepted: accepted.length,
      outsideStepAccepted: managed.filter(e => e.k === 'outside-step-accepted').length },
    correlation: { status: trace.truncated || !certifiedCapture || !exactCorrelation ? 'UNPROVEN' : 'PASS',
      heldMoveRequestsPerSample: histogram(heldMoveCounts), samplesPerPump: histogram(pumpStepCounts),
      unmatchedAccepted, incompleteManaged, diagnosticFailures: traceDiagnosticFailures,
      requestSequences: requests.map(r => ({ hostLifetime: r.hostLifetime, sender: r.sender,
        generation: r.wireGeneration, sequence: r.sequence, sampleId: r.sampleId })),
      acceptedSequences: accepted.map(r => ({ hostLifetime: r.hostLifetime, sender: r.sender,
        generation: r.wireGeneration, sequence: r.sequence, sampleId: r.sampleId })),
      transportObserverAfterRequestMs: stats(transportObservationMs),
      latencyNote: 'C# Stopwatch request-to-observer only; JS pump bracket is observation bound, not exact latency' },
    admission: { source: stepDriver ? 'unavailable-for-step-intent' : 'legacy-local-publication',
      movesPerHeldPump: histogram(admitted),
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
    timing: { frameIntervalMs: stats(frameIntervals), rafIntervalMs: stats(rafIntervals),
      framesOver33ms: frameIntervals.filter(v => v > 33.4).length,
      framesOver50ms: frameIntervals.filter(v => v > 50).length, pumpIntervalMs: stats(pumpIntervals),
      tickMs: stats(pumps.map(p => p.tickMs)), pumpTotalMs: stats(pumps.map(p => p.totalMs)),
      nativeInvoke: nativeInvokeTiming(events, trace),
      managedFacade: managedFacadeTiming(managedBatches, trace),
      phases: Object.fromEntries([...new Set(events.filter(e => e.k === 'phaseTiming').map(e => e.scope))].map(scope => {
        const observations = events.filter(e => e.k === 'phaseTiming' && e.scope === scope);
        const spans = observations.flatMap(e => e.spans ?? []);
        return [scope, { observations: observations.length, incomplete: observations.filter(e => e.complete !== true).length,
          fullMs: stats(observations.map(e => e.fullMs)), tailMs: stats(observations.map(e => e.tailMs)),
          sections: Object.fromEntries([...new Set(spans.map(s => s.phase))].map(phase => [phase, stats(spans.filter(s => s.phase === phase).map(s => s.durationMs))])),
          failures: observations.filter(e => e.complete !== true).map(e => ({ t: e.t, failedPhase: e.failedPhase, exception: e.exception, context: e.context })) }];
      })),
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
