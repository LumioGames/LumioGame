export const NATIVE_OPERATIONS = Object.freeze([
  'clock_now', 'voxel_prediction_working_read_cell',
  'voxel_prediction_begin_update', 'voxel_prediction_complete_update',
  'hfsm_evaluate', 'other',
]);

const scopes = Object.freeze(['managedTick', 'boot', 'unscope']);
const knownOperations = new Set(NATIVE_OPERATIONS.slice(0, -1));
const emptyRow = () => ({ count: 0, sumMs: 0, maxMs: 0, failed: 0 });
function emptyScope() {
  return { ...emptyRow(), diagnosticFailure: 0,
    operations: Object.fromEntries(NATIVE_OPERATIONS.map(operation => [operation, emptyRow()])) };
}

// Game-side observer. Timing includes the unchanged synchronous JS bridge,
// Rust call and bridge cleanup; C# serialization and .NET marshaling are outside it.
// No packet/result is inspected, retained, decoded or added to the snapshot.
export function createNativeInvokeObserver(original, { now = () => performance.now() } = {}) {
  if (typeof original !== 'function') throw new TypeError('Native invoke must be a function.');
  let scope = 'unscope';
  const observations = Object.fromEntries(scopes.map(value => [value, emptyScope()]));
  const requireScope = value => {
    if (!scopes.includes(value)) throw new RangeError('Unknown Native observer scope.');
    return value;
  };
  const diagnosticFailure = observation => {
    if (observation.diagnosticFailure < Number.MAX_SAFE_INTEGER) observation.diagnosticFailure++;
  };
  const increment = (observation, metric, key) => {
    if (metric[key] < Number.MAX_SAFE_INTEGER) metric[key]++;
    else diagnosticFailure(observation);
  };
  function readClock(observation) {
    try {
      const value = now();
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid observer clock.');
      return value;
    } catch { diagnosticFailure(observation); return null; }
  }
  function addDuration(observation, metric, duration) {
    const sum = metric.sumMs + duration;
    if (Number.isFinite(sum)) { metric.sumMs = sum; metric.maxMs = Math.max(metric.maxMs, duration); }
    else diagnosticFailure(observation);
  }
  return {
    invoke(operation, packet) {
      const observation = observations[scope];
      const row = observation.operations[knownOperations.has(operation) ? operation : 'other'];
      increment(observation, observation, 'count');
      increment(observation, row, 'count');
      const started = readClock(observation);
      let returned = false;
      try {
        const result = original.call(this, operation, packet);
        returned = true;
        return result;
      } finally {
        // Observation failures remain visible without replacing the original return/error.
        try {
          if (!returned) {
            increment(observation, observation, 'failed');
            increment(observation, row, 'failed');
          }
          if (started !== null) {
            const ended = readClock(observation);
            if (ended !== null) {
              if (ended < started) diagnosticFailure(observation);
              else {
                const duration = ended - started;
                addDuration(observation, observation, duration);
                addDuration(observation, row, duration);
              }
            }
          }
        } catch { diagnosticFailure(observation); }
      }
    },
    beginScope(value) { scope = requireScope(value); },
    reset(value = scope) { observations[requireScope(value)] = emptyScope(); },
    snapshot(value = scope) {
      const observation = observations[requireScope(value)];
      return { version: 1, scope: value, timing: 'JS_NATIVE_BRIDGE_INCLUSIVE',
        diagnosticFailure: observation.diagnosticFailure, count: observation.count,
        sumMs: observation.sumMs, maxMs: observation.maxMs, failed: observation.failed,
        operations: NATIVE_OPERATIONS.map(operation => ({ operation, ...observation.operations[operation] })) };
    },
  };
}
