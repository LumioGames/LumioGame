// Dev-only movement trace (`?trace=movement` on a loopback or development page).
// Keys, published inputs, Session pumps and render frames share one clock so a
// per-frame displacement can be lined up with the admission that caused it.
// Export with `__lumioMovementTrace.export()` and analyze with tools/movement-trace-analyze.mjs.

export const MOVEMENT_TRACE_VERSION = 1;

export function createMovementTrace({ now = () => performance.now(), capacity = 300000, runtimePerfCapacity = 256, doc = globalThis.document,
  userAgent = globalThis.navigator?.userAgent ?? '' } = {}) {
  const events = [];
  const startedAt = new Date().toISOString();
  let truncated = false;
  let droppedEvents = 0;
  let runtimePerfRecords = 0, droppedRuntimePerfRecords = 0;
  function push(event) {
    if (events.length >= capacity) { truncated = true; droppedEvents++; return false; }
    events.push(event);
    return true;
  }
  const visibility = () => doc?.visibilityState ?? 'unknown';
  const focus = () => {
    try { return typeof doc?.hasFocus === 'function' ? Boolean(doc.hasFocus()) : null; }
    catch { return null; }
  };
  const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const text = value => (value === undefined || value === null ? null : String(value));
  const publication = pose => (pose ? {
    sessionGeneration: text(pose.sessionGeneration), entity: text(pose.entity), connectionGeneration: text(pose.connectionGeneration),
    seq: text(pose.publicationSequence), step: text(pose.localStepOrdinal), tick: text(pose.executionTick),
    inputSeq: text(pose.inputSequence), cause: text(pose.cause),
    tx: number(pose.target?.position?.x), tz: number(pose.target?.position?.z),
  } : null);
  return {
    key(type, code, repeat = false) { push({ k: 'key', t: now(), type, code, repeat, vis: visibility(), focused: focus() }); },
    input(kind, accepted, args = []) { push({ k: 'input', t: now(), kind, accepted, args }); },
    runtimePerf(data) {
      if (runtimePerfRecords >= runtimePerfCapacity) { truncated = true; droppedEvents++; droppedRuntimePerfRecords++; return; }
      if (push({ k: 'runtime-perf', t: now(), data })) runtimePerfRecords++;
      else droppedRuntimePerfRecords++;
    },
    // Inputs published before tickAt are admitted by this pump's Session Tick; pose is the owner
    // publication read right after that Tick. observedAt is the trace call after the pump's tail work.
    pump({ startedAt, tickAt, tickMs, totalMs, state, pose = null }) {
      push({ k: 'pump', t: startedAt, tickAt, observedAt: now(), tickMs, totalMs, state, vis: visibility(), focused: focus(), pose: publication(pose) });
    },
    frame({ now: frameNow, dt, renderTick, localPose, local }) {
      // RAF's supplied timestamp can predate a blocking Tick; pose and focus are observed in this callback.
      const observedAt = now();
      const target = localPose?.target?.position;
      const model = localPose?.model?.position;
      push({
        k: 'frame', t: observedAt, rafAt: frameNow, dt, vis: visibility(), focused: focus(), rt: number(renderTick),
        sessionGeneration: text(localPose?.sessionGeneration), entity: text(localPose?.entity), connectionGeneration: text(localPose?.connectionGeneration),
        seq: text(localPose?.publicationSequence), step: text(localPose?.localStepOrdinal),
        tick: text(localPose?.executionTick), inputSeq: text(localPose?.inputSequence), cause: text(localPose?.cause),
        tx: number(target?.x), tz: number(target?.z), mx: number(model?.x), mz: number(model?.z),
        dx: number(local?.x), dz: number(local?.z), yaw: number(local?.yaw), speed: number(local?.speed),
        cx: number(local?.cameraX), cz: number(local?.cameraZ),
      });
    },
    longTask(entry) { push({ k: 'longtask', t: entry.startTime, duration: entry.duration }); },
    note(message) { push({ k: 'note', t: now(), message: String(message) }); },
    export() {
      return { version: MOVEMENT_TRACE_VERSION, startedAt, exportedAt: new Date().toISOString(), userAgent,
        truncated, droppedEvents, droppedRuntimePerfRecords, capacity, runtimePerfCapacity, events: events.slice() };
    },
    clear() { events.length = 0; truncated = false; droppedEvents = 0; runtimePerfRecords = 0; droppedRuntimePerfRecords = 0; },
    get size() { return events.length; },
  };
}

export function observeLongTasks(trace, Observer = globalThis.PerformanceObserver) {
  if (typeof Observer !== 'function' || !Observer.supportedEntryTypes?.includes?.('longtask')) {
    trace.note('longtask=unsupported');
    return () => {};
  }
  const observer = new Observer(list => { for (const entry of list.getEntries()) trace.longTask(entry); });
  observer.observe({ type: 'longtask', buffered: false });
  trace.note('longtask=supported');
  return () => observer.disconnect();
}

export function createRuntimeBridgePerf({ now = () => performance.now(), operationCapacity = 32 } = {}) {
  if (!Number.isInteger(operationCapacity) || operationCapacity <= 0) throw new RangeError('runtime_bridge_operation_capacity');
  const operations = new Map();
  let withinTick = false, pendingTick = false, droppedCalls = 0, droppedTickWindows = 0, errors = 0, lastError = null;
  const bytes = value => ArrayBuffer.isView(value) || value instanceof ArrayBuffer ? value.byteLength : null;
  const clockError = () => { errors++; lastError = 'clockUnavailable'; };
  function record(operation, request, reply, returned, elapsed, inside) {
    if (typeof operation !== 'string' || operation.length > 128) { droppedCalls++; return; }
    let row = operations.get(operation);
    if (!row) {
      if (operations.size === operationCapacity) { droppedCalls++; return; }
      row = { inside: null, outside: null }; operations.set(operation, row);
    }
    const bucket = inside ? 'inside' : 'outside';
    const aggregate = row[bucket] ??= { operation, calls: 0, returnedFalse: 0, elapsedMs: 0, elapsedUnknown: 0,
      requestBytes: 0, replyBytes: 0, requestBytesUnknown: 0, replyBytesUnknown: 0 };
    aggregate.calls++;
    if (!returned) aggregate.returnedFalse++;
    if (elapsed === null) aggregate.elapsedUnknown++; else aggregate.elapsedMs += elapsed;
    const requestBytes = bytes(request), replyBytes = bytes(reply);
    if (requestBytes === null) aggregate.requestBytesUnknown++; else aggregate.requestBytes += requestBytes;
    if (replyBytes === null) aggregate.replyBytesUnknown++; else aggregate.replyBytes += replyBytes;
  }
  return {
    wrap(invoke) {
      return function (operation, packet) {
        const inside = withinTick;
        let start = null, reply, returned = false;
        try { start = now(); if (!Number.isFinite(start)) { start = null; clockError(); } } catch { clockError(); }
        try { reply = invoke.call(this, operation, packet); returned = true; return reply; }
        finally {
          let elapsed = null;
          if (start !== null) {
            try { const duration = now() - start; if (Number.isFinite(duration) && duration >= 0) elapsed = duration; else clockError(); }
            catch { clockError(); }
          }
          try { record(operation, packet, reply, returned, elapsed, inside); }
          catch { errors++; lastError = 'aggregationUnavailable'; droppedCalls++; }
        }
      };
    },
    beginTick() {
      if (pendingTick) {
        droppedTickWindows++;
        for (const [operation, row] of operations) {
          droppedCalls += row.inside?.calls ?? 0; row.inside = null;
          if (!row.outside) operations.delete(operation);
        }
      }
      pendingTick = true; withinTick = true;
    },
    endTick() { withinTick = false; },
    drain(hookPumpId) {
      const inside = [], outside = [];
      for (const row of operations.values()) { if (row.inside) inside.push({ ...row.inside }); if (row.outside) outside.push({ ...row.outside }); }
      operations.clear(); pendingTick = false; withinTick = false;
      return { scope: 'bomberEngineJSImportOnly', synchronousReturnOnly: true,
        hookPumpId: typeof hookPumpId === 'string' ? hookPumpId : null, outsideHookPumpId: null,
        withinTick: inside, outside, operationCapacity, droppedCalls, droppedTickWindows, errors, lastError,
        truncated: droppedCalls !== 0 || droppedTickWindows !== 0 };
    },
  };
}
