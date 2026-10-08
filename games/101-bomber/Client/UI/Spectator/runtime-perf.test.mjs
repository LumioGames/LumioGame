import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMovementTrace } from './movement-trace.mjs';

const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
function flags(search, hostname = '127.0.0.1', development = false) {
  const context = vm.createContext({ URLSearchParams, location: { search, hostname }, __lumioDevelopment: development });
  vm.runInContext(source.slice(source.indexOf('const LOOPBACK_HOSTS'), source.indexOf('// Local test mode')), context);
  return JSON.parse(JSON.stringify(context.readMovementFlags()));
}

test('runtime performance diagnostics require the explicit movement trace opt-in on loopback or the development bridge', () => {
  for (const hostname of ['127.0.0.1', 'localhost', '[::1]', '::1'])
    assert.equal(flags('?trace=movement&perf=runtime', hostname).runtimePerf, true, hostname);
  assert.equal(flags('?trace=movement&perf=runtime', 'game.example', true).runtimePerf, true);
  for (const [search, hostname, development] of [
    ['?trace=movement&perf=runtime', 'game.example', false],
    ['?perf=runtime', '127.0.0.1', false],
    ['?trace=movement', '127.0.0.1', false],
    ['?trace=movement&perf=other', '127.0.0.1', false],
  ]) assert.equal(flags(search, hostname, development).runtimePerf, false);
});

const rawDiagnostics = {
  diagnosticEnabled: true, profilingOverhead: true, matrixSample: false,
  providerSeen: true, enabled: true, errorCount: '0', droppedPhaseRecords: '0', truncated: false,
  pump: { hookPumpId: '9007199254740993', before: { sessionGeneration: '18446744073709551615', runtimeAuthorityCalls: '7' },
    after: { sessionGeneration: '18446744073709551615', runtimeAuthorityCalls: '9' } },
  phases: [{ hookPumpId: '9007199254740993', phase: 3, startTicks: '9007199254740995', elapsedTicks: '500',
    frequency: '10000000', returned: false }],
};

function pumpContext({ enabled = false, drainError = null, tickError = null } = {}) {
  const calls = [], failures = [];
  let clock = 10;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible', hasFocus: () => true } });
  const api = {
    tick() { calls.push('tick'); clock += 3600; if (tickError) throw tickError; },
    sessionState() { return '{"state":"active","sentInputs":0}'; },
    tickRateHz() { return 20; },
  };
  Object.defineProperty(api, 'drainRuntimePerf', { get() {
    assert.equal(enabled, true, 'disabled pumps must not look up or drain diagnostics');
    return () => { calls.push('drain'); if (drainError) throw drainError; return JSON.stringify(rawDiagnostics); };
  } });
  const context = vm.createContext({
    csharp: api, performance: { now: () => clock }, calls, failures,
    terminal: false, connectionAttempt: 1, inputDriver: 'interval', playerInput: null,
    movementTrace: trace, runtimePerfEnabled: enabled, runtimeBridgePerf: null, currentSessionGeneration: null,
    spectator: { positions: [], voxel: {} }, player: {}, active: false,
    displayedWorldHandle: null, voxelGrid: { sections: () => [] }, nextPumpAt: 10, pumpTimer: null,
    refreshVoxelWorld() {}, paint() {}, setStatus() {},
    setTimeout() { return 1; }, noteApplyFault(error) { failures.push(error); },
    failLaunch(error) { failures.push(error); },
  });
  vm.runInContext(source.slice(source.indexOf('function pumpSession('), source.indexOf('async function obtainLaunch(')), context);
  return { context, calls, failures, trace };
}

test('enabled diagnostics drain once after the existing Tick and preserve raw counters, phase clocks and real pump cost', () => {
  const { context, calls, failures, trace } = pumpContext({ enabled: true });
  context.pumpSession(1);
  assert.deepEqual(calls, ['tick', 'drain']);
  assert.deepEqual(failures, []);
  const events = trace.export().events;
  assert.equal(events.find(e => e.k === 'pump').tickMs, 3600);
  const diagnostic = events.find(e => e.k === 'runtime-perf');
  assert.ok(diagnostic, 'a separate diagnostic observation is retained in raw trace');
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic.data)), rawDiagnostics);
  assert.equal(diagnostic.t, 3610);
});

test('disabled diagnostics retain the original Tick path without looking up managed diagnostics', () => {
  const { context, calls, failures, trace } = pumpContext();
  context.pumpSession(1);
  assert.deepEqual(calls, ['tick']);
  assert.deepEqual(failures, []);
  assert.equal(trace.export().events.some(e => e.k === 'runtime-perf'), false);
});

test('a diagnostic drain error remains an unavailable raw observation without replacing the normal Tick outcome', () => {
  const error = new Error('runtime_perf_drain_failed');
  const { context, calls, failures, trace } = pumpContext({ enabled: true, drainError: error });
  context.pumpSession(1);
  assert.deepEqual(calls, ['tick', 'drain']);
  assert.deepEqual(failures, []);
  const diagnostic = trace.export().events.find(e => e.k === 'runtime-perf');
  assert.equal(diagnostic.data.available, false);
  assert.equal(diagnostic.data.error, error.message);
  assert.equal(diagnostic.data.matrixSample, false);
});

test('the original Tick exception remains visible while diagnostic records drain once without a second Tick', () => {
  const error = new Error('original_tick_failure');
  const { context, calls, failures } = pumpContext({ enabled: true, tickError: error });
  context.pumpSession(1);
  assert.deepEqual(calls, ['tick', 'drain']);
  assert.ok(failures.includes(error));
});

test('diagnostic enablement requires its managed exports while the disabled binding never reads them', () => {
  const api = Object.fromEntries(['ConfigureConfig', 'Boot', 'Close', 'Tick', 'TickRateHz', 'SessionState', 'WorldHandleBytes',
    'ReadBox', 'DumpPositions', 'MapDimensions'].map(name => [name, () => {}]));
  const make = enabled => {
    const context = vm.createContext({ runtimePerfEnabled: enabled, PLAYER_MODE: false, csharp: {}, developmentSession: null, api });
    vm.runInContext(source.slice(source.indexOf('function bindExports('), source.indexOf('let managedLoaded')), context);
    return context;
  };
  assert.throws(() => make(true).bindExports(api), /RuntimePerf.*missing/);
  Object.defineProperty(api, 'ConfigureRuntimePerf', { get() { throw new Error('disabled diagnostics export lookup'); } });
  Object.defineProperty(api, 'DrainRuntimePerf', { get() { throw new Error('disabled diagnostics export lookup'); } });
  assert.doesNotThrow(() => make(false).bindExports(api));
});

test('diagnostic trace retention is bounded, reports dropped records, and clears all retained diagnostic data', () => {
  const trace = createMovementTrace({ now: () => 1, capacity: 2, doc: null });
  assert.equal(typeof trace.runtimePerf, 'function');
  for (let i = 0; i < 4; i++) trace.runtimePerf(rawDiagnostics);
  const exported = trace.export();
  assert.equal(exported.events.length, 2);
  assert.equal(exported.droppedEvents, 2);
  assert.equal(exported.truncated, true);
  assert.deepEqual(exported.events[0].data, rawDiagnostics);
  trace.clear();
  assert.equal(trace.export().events.length, 0);
  assert.equal(trace.export().droppedEvents, 0);
  assert.equal(trace.export().truncated, false);
});

test('a separate diagnostic retention limit preserves capacity for ordinary raw movement events', () => {
  const trace = createMovementTrace({ now: () => 1, capacity: 20, runtimePerfCapacity: 2, doc: null });
  for (let i = 0; i < 4; i++) trace.runtimePerf(rawDiagnostics);
  trace.key('keyup', 'KeyW');
  const exported = trace.export();
  assert.deepEqual(exported.events.map(event => event.k), ['runtime-perf', 'runtime-perf', 'key']);
  assert.equal(exported.runtimePerfCapacity, 2);
  assert.equal(exported.droppedRuntimePerfRecords, 2);
  assert.equal(exported.droppedEvents, 2);
  trace.clear();
  trace.runtimePerf(rawDiagnostics);
  assert.equal(trace.export().events.length, 1);
  assert.equal(trace.export().droppedRuntimePerfRecords, 0);
});
