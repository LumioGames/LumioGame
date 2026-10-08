// Dev-only movement trace (`?trace=movement` on a loopback or development page).
// Keys, published inputs, Session pumps and render frames share one clock so a
// per-frame displacement can be lined up with the admission that caused it.
// Export with `__lumioMovementTrace.export()` and analyze with tools/movement-trace-analyze.mjs.

export const MOVEMENT_TRACE_VERSION = 1;

export function createMovementTrace({ now = () => performance.now(), capacity = 300000, doc = globalThis.document,
  userAgent = globalThis.navigator?.userAgent ?? '' } = {}) {
  const events = [];
  const startedAt = new Date().toISOString();
  let truncated = false;
  function push(event) {
    if (events.length >= capacity) { truncated = true; return; }
    events.push(event);
  }
  const visibility = () => doc?.visibilityState ?? 'unknown';
  const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const text = value => (value === undefined || value === null ? null : String(value));
  return {
    key(type, code, repeat = false) { push({ k: 'key', t: now(), type, code, repeat, vis: visibility() }); },
    input(kind, accepted, args = []) { push({ k: 'input', t: now(), kind, accepted, args }); },
    // Inputs published before tickAt are admitted by this pump's Session Tick.
    pump({ startedAt, tickAt, tickMs, totalMs, state }) {
      push({ k: 'pump', t: startedAt, tickAt, tickMs, totalMs, state, vis: visibility() });
    },
    frame({ now: frameNow, dt, renderTick, localPose, local }) {
      const target = localPose?.target?.position;
      const model = localPose?.model?.position;
      push({
        k: 'frame', t: frameNow, dt, vis: visibility(), rt: number(renderTick),
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
        truncated, capacity, events: events.slice() };
    },
    clear() { events.length = 0; truncated = false; },
    get size() { return events.length; },
  };
}

export function observeLongTasks(trace, Observer = globalThis.PerformanceObserver) {
  if (typeof Observer !== 'function' || !Observer.supportedEntryTypes?.includes?.('longtask')) return () => {};
  const observer = new Observer(list => { for (const entry of list.getEntries()) trace.longTask(entry); });
  observer.observe({ type: 'longtask', buffered: false });
  return () => observer.disconnect();
}
