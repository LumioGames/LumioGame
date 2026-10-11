// Dev-only movement trace (`?trace=movement` on a loopback or development page).
// Keys, published inputs, Session pumps and render frames share one clock so a
// per-frame displacement can be lined up with the admission that caused it.
// Export with `__lumioMovementTrace.export()` and analyze with tools/movement-trace-analyze.mjs.
import { NATIVE_OPERATIONS } from './native-invoke-observer.mjs';

export const MOVEMENT_TRACE_VERSION = 2;

export function createMovementTrace({ now = () => performance.now(), capacity = 300000, doc = globalThis.document,
  userAgent = globalThis.navigator?.userAgent ?? '' } = {}) {
  const events = [];
  const startedAt = new Date().toISOString();
  let truncated = false;
  let diagnosticFailures = 0;
  let predictionCatchUp = null;
  function push(event) {
    if (events.length >= capacity) { truncated = true; return; }
    events.push(event);
  }
  const visibility = () => doc?.visibilityState ?? 'unknown';
  const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const text = value => (value === undefined || value === null ? null : String(value));
  const publication = pose => (pose ? {
    seq: text(pose.publicationSequence), step: text(pose.localStepOrdinal), tick: text(pose.executionTick),
    inputSeq: text(pose.inputSequence), cause: text(pose.cause),
    tx: number(pose.target?.position?.x), tz: number(pose.target?.position?.z),
  } : null);
  function phaseTiming({ scope, startedAt, endedAt, spans, complete, failedPhase, error, context = null, tailStartedAt = null, rafT = null }) {
    try {
      push({ k: 'phaseTiming', t: now(), scope, startedAt: number(startedAt), endedAt: number(endedAt),
        fullMs: number(endedAt - startedAt), tailMs: tailStartedAt === null ? null : number(endedAt - tailStartedAt),
        spans: spans.map(span => ({ phase: span.phase, startedAt: number(span.startedAt), endedAt: number(span.endedAt), durationMs: number(span.durationMs) })),
        complete: complete === true, failedPhase: text(failedPhase), rafT: number(rafT), context,
        exception: error ? { name: text(error.name), message: text(error.message) } : null, vis: visibility() });
    } catch {
      if (diagnosticFailures < Number.MAX_SAFE_INTEGER) diagnosticFailures++;
    }
  }
  return {
    setPredictionCatchUp(value) {
      predictionCatchUp = { requestedSteps: value.requestedSteps ?? null, requestedDeltaMs: value.requestedDeltaMs ?? null,
        maxStepsPerPump: value.maxStepsPerPump, maxDeltaMs: value.maxDeltaMs, configured: value.configured === true };
    },
    phaseTiming,
    nativeInvokeTiming({ startedAt, endedAt, returned, snapshot }) {
      try {
        const metric = row => {
          if (!Number.isSafeInteger(row.count) || row.count < 0 || !Number.isSafeInteger(row.failed) ||
              row.failed < 0 || row.failed > row.count || !Number.isFinite(row.sumMs) || row.sumMs < 0 ||
              !Number.isFinite(row.maxMs) || row.maxMs < 0) throw new Error('invalid_native_metric');
          return { count: row.count, sumMs: row.sumMs, maxMs: row.maxMs, failed: row.failed };
        };
        if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt ||
            typeof returned !== 'boolean' || snapshot.version !== 1 || snapshot.scope !== 'managedTick' ||
            snapshot.timing !== 'JS_NATIVE_BRIDGE_INCLUSIVE' || !Number.isSafeInteger(snapshot.diagnosticFailure) ||
            snapshot.diagnosticFailure < 0 || !Array.isArray(snapshot.operations) ||
            snapshot.operations.length !== NATIVE_OPERATIONS.length) throw new Error('invalid_native_window');
        const operations = NATIVE_OPERATIONS.map((operation, index) => {
          const row = snapshot.operations[index];
          if (row.operation !== operation) throw new Error('invalid_native_operation');
          return { operation, ...metric(row) };
        });
        const bounded = { version: 1, scope: 'managedTick', timing: 'JS_NATIVE_BRIDGE_INCLUSIVE',
          diagnosticFailure: snapshot.diagnosticFailure, ...metric(snapshot), operations };
        if (bounded.diagnosticFailure > 0 && diagnosticFailures < Number.MAX_SAFE_INTEGER) diagnosticFailures++;
        push({ k: 'nativeInvokeTiming', t: now(), startedAt, endedAt, returned, snapshot: bounded });
      } catch {
        if (diagnosticFailures < Number.MAX_SAFE_INTEGER) diagnosticFailures++;
      }
    },
    // Only private trace callers create a bracket; no caller reads managed/native state here.
    beginPhaseTiming(scope, startedAt = now()) {
      const spans = [];
      let phase = null, phaseStartedAt = startedAt;
      return {
        mark(next, at = now()) {
          if (phase !== null) spans.push({ phase, startedAt: phaseStartedAt, endedAt: at, durationMs: at - phaseStartedAt });
          phase = next; phaseStartedAt = at;
        },
        finish({ complete = true, error, context = null, tailStartedAt = null, rafT = null } = {}) {
          const endedAt = now(), failedPhase = complete ? null : phase;
          if (phase !== null) spans.push({ phase, startedAt: phaseStartedAt, endedAt, durationMs: endedAt - phaseStartedAt });
          phaseTiming({ scope, startedAt, endedAt, spans, complete, failedPhase, error, context, tailStartedAt, rafT });
        },
      };
    },
    key(type, code, repeat = false) { push({ k: 'key', t: now(), type, code, repeat, vis: visibility() }); },
    input(kind, accepted, args = []) { push({ k: 'input', t: now(), kind, accepted, args }); },
    // Observed after the actual step-intent setter returns. This is a held physical intent,
    // not a managed request, transport acceptance or server execution.
    moveIntent(primary, secondary, turn) {
      push({ k: 'moveIntent', t: now(), primary, secondary, turn, source: 'setter-return-observed' });
    },
    intentReset() { push({ k: 'intentReset', t: now(), source: 'clear-return-observed' }); },
    diagnosticFailure(kind) {
      if (diagnosticFailures < Number.MAX_SAFE_INTEGER) diagnosticFailures++;
      push({ k: 'diagnosticFailure', t: now(), kind });
    },
    // Inputs published before tickAt are admitted by this pump's Session Tick; pose is the owner
    // publication read right after that Tick.
    pump({ startedAt, tickAt, tickMs, totalMs, state, pose = null }) {
      push({ k: 'pump', t: startedAt, tickAt, tickMs, totalMs, state, vis: visibility(), pose: publication(pose) });
    },
    frame({ now: frameNow, dt, renderTick, localPose, local }) {
      const target = localPose?.target?.position;
      const model = localPose?.model?.position;
      push({
        k: 'frame', t: now(), rafT: number(frameNow), dt, vis: visibility(), rt: number(renderTick),
        seq: text(localPose?.publicationSequence), step: text(localPose?.localStepOrdinal),
        tick: text(localPose?.executionTick), inputSeq: text(localPose?.inputSequence), cause: text(localPose?.cause),
        tx: number(target?.x), tz: number(target?.z), mx: number(model?.x), mz: number(model?.z),
        dx: number(local?.x), dz: number(local?.z), yaw: number(local?.yaw), speed: number(local?.speed),
        cx: number(local?.cameraX), cz: number(local?.cameraZ),
      });
    },
    longTask(entry) { push({ k: 'longtask', t: entry.startTime, duration: entry.duration }); },
    // Drain is an observation after the synchronous managed Tick, never a managed occurrence timestamp.
    managed(batch, pumpBracket) {
      if (!batch || typeof batch !== 'object') return;
      push({ k: 'managedTrace', t: now(), pumpBracket, batch });
    },
    note(message) { push({ k: 'note', t: now(), message: String(message) }); },
    export() {
      return { version: MOVEMENT_TRACE_VERSION, timeBasis: 'performance.now', frameTimeBasis: 'observer-invocation',
        managedTimeBasis: 'raw-Stopwatch-unanchored', startedAt, exportedAt: new Date().toISOString(), userAgent,
        truncated, diagnosticFailures, capacity, predictionCatchUp, events: events.slice() };
    },
    clear() { events.length = 0; truncated = false; diagnosticFailures = 0; },
    get size() { return events.length; },
  };
}

export function observeLongTasks(trace, Observer = globalThis.PerformanceObserver) {
  if (typeof Observer !== 'function' || !Observer.supportedEntryTypes?.includes?.('longtask')) return () => {};
  const observer = new Observer(list => { for (const entry of list.getEntries()) trace.longTask(entry); });
  observer.observe({ type: 'longtask', buffered: false });
  return () => observer.disconnect();
}
