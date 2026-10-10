import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createNativeInvokeObserver } from './native-invoke-observer.mjs';
import { createMovementTrace } from './movement-trace.mjs';

const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const pumpSource = source.slice(source.indexOf('function pumpSession(attempt)'), source.indexOf('async function obtainLaunch('));
const helpersStart = source.indexOf('function noteNativeInvokeFailure(');
const helpers = helpersStart < 0 ? '' : source.slice(helpersStart, source.indexOf('function pumpSession(attempt)'));

function run({ failTick = false, snapshotFault = false, resetFault = false, scopeFault = false, recordFault = false, enabled = true } = {}) {
  let clock = 100, ticks = 0, schedules = 0;
  const error = new Error('original Tick error'), faults = [], failures = [], packet = new Uint8Array([1]), result = new Uint8Array([2]);
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' } });
  const original = (operation, actualPacket) => {
    assert.equal(actualPacket, packet); clock += operation === 'clock_now' ? 3 : 4; return result;
  };
  const observer = createNativeInvokeObserver(original, { now: () => clock });
  const reset = observer.reset, snapshot = observer.snapshot, beginScope = observer.beginScope;
  observer.reset = (...args) => { clock += 20; if (resetFault) throw new Error('reset fault'); return reset(...args); };
  observer.snapshot = (...args) => { clock += 100; if (snapshotFault) throw new Error('snapshot fault'); return snapshot(...args); };
  observer.beginScope = value => { if (scopeFault) throw new Error('scope fault'); return beginScope(value); };
  if (recordFault) trace.nativeInvokeTiming = () => { throw new Error('record fault'); };
  const invoke = enabled ? observer.invoke : original;
  const sandbox = { nativeInvokeObserver: enabled ? observer : null, movementPhaseTimingEnabled: false,
    terminal: false, connectionAttempt: 1, movementTrace: trace, inputDriver: 'interval', playerInput: null,
    performance: { now: () => clock }, player: { replica: {} }, spectator: { positions: [], voxel: {} },
    csharp: { tick() { ticks++; assert.equal(invoke('clock_now', packet), result);
      assert.equal(invoke('voxel_prediction_working_read_cell', packet), result); if (failTick) throw error; },
      sessionState() { invoke('clock_now', packet); return '{"state":"active"}'; },
      dumpPositions() { invoke('clock_now', packet); return '[]'; }, mapDimensions: () => '{}', tickRateHz: () => 20 },
    drainManagedTrace() {}, refreshVoxelWorld() {}, displayedWorldHandle: 'world', configureMap() {}, applyDump: () => true,
    paint() {}, voxelGrid: { sections: () => [] }, refreshStepInput() {}, setStatus() {},
    movementPreviewControls: null, resourceWitness: null, nextPumpAt: 100,
    setTimeout() { schedules++; return 1; }, noteApplyFault: caught => faults.push(caught), failLaunch: caught => failures.push(caught), console };
  vm.runInNewContext(helpers + pumpSource, sandbox); sandbox.pumpSession(1);
  return { exported: trace.export(), faults, failures, ticks, schedules, error, observer, snapshot };
}

test('actual pump brackets exactly one Tick and records after its original end clock', () => {
  const healthy = run(), event = healthy.exported.events.find(row => row.k === 'nativeInvokeTiming');
  assert.ok(event, 'actual pump is missing its Native invoke observation');
  assert.equal(healthy.ticks, 1); assert.equal(healthy.schedules, 1);
  assert.equal(event.startedAt, 120, 'reset cost is before the original Tick start clock');
  assert.equal(event.endedAt, 127, 'snapshot cost is after the original Tick end clock');
  assert.equal(healthy.exported.events.find(row => row.k === 'pump').tickMs, 7);
  assert.equal(event.returned, true); assert.equal(event.snapshot.count, 2);
  assert.equal(event.snapshot.sumMs, 7);
  assert.equal(healthy.snapshot('unscope').count, 2, 'post-Tick getter calls must not enter managedTick');
  const ordinary = run({ enabled: false });
  assert.equal(ordinary.ticks, 1); assert.equal(ordinary.schedules, 1);
  assert.equal(ordinary.exported.events.filter(row => row.k === 'nativeInvokeTiming').length, 0);
  assert.equal(ordinary.exported.events.find(row => row.k === 'pump').tickMs, 7);
});

test('failed Tick retains its original error and still records its bounded Native window', () => {
  const failed = run({ failTick: true });
  const event = failed.exported.events.find(row => row.k === 'nativeInvokeTiming');
  assert.ok(event, 'throwing Tick must retain an observation');
  assert.equal(event.returned, false); assert.equal(event.snapshot.count, 2); assert.equal(event.endedAt - event.startedAt, 7);
  assert.equal(failed.ticks, 1); assert.equal(failed.schedules, 0);
  assert.equal(failed.faults[0], failed.error); assert.equal(failed.failures[0], failed.error);
  assert.equal(failed.snapshot('unscope').count, 0);
});

test('observer lifecycle and recording faults remain visible without faulting normal Tick or replacing a thrown Tick', () => {
  for (const fault of ['snapshotFault', 'resetFault', 'scopeFault', 'recordFault']) {
    const healthy = run({ [fault]: true });
    assert.equal(healthy.ticks, 1); assert.equal(healthy.schedules, 1, fault);
    assert.equal(healthy.faults.length, 0, fault);
    assert.ok(healthy.exported.diagnosticFailures > 0, `${fault} must remain visible`);
    const failed = run({ [fault]: true, failTick: true });
    assert.equal(failed.ticks, 1); assert.equal(failed.faults[0], failed.error, fault); assert.equal(failed.failures[0], failed.error, fault);
    assert.ok(failed.exported.diagnosticFailures > 0, fault);
  }
});

test('real module-level binding is shared by private initializer, public registration and pump', async () => {
  assert.ok(source.includes('let nativeInvokeObserver = null;'), 'observer must be module-level');
  const start = source.indexOf('async function initializeNativeInvokeObservation()');
  assert.ok(start >= 0, 'real observer initializer is missing');
  const initializer = source.slice(start, source.indexOf('async function loadWasmExports()', start))
    .replace("import('./native-invoke-observer.mjs')", 'globalThis.importNativeObserver()');
  const flags = source.slice(source.indexOf('const LOOPBACK_HOSTS ='), source.indexOf('async function initializeResourceWitness()'));
  const registration = source.match(/setModuleImports\('bomber-engine',[\s\S]*?\);/)[0];
  for (const [player, permitted, query, expected] of [
    [true, true, '?scene=movement-sync-preview&trace=movement', true],
    [true, true, '?scene=movement-sync-preview', false],
    [true, true, '?scene=other&trace=movement', false],
    [true, false, '?scene=movement-sync-preview&trace=movement', false],
    [false, true, '?scene=movement-sync-preview&trace=movement', false],
  ]) {
    let imports = 0; const notes = [], registered = [], original = () => new Uint8Array(1);
    original.createVoxelPresentation = () => 'original presentation';
    const context = vm.createContext({ PLAYER_MODE: player, URLSearchParams,
      location: { search: query, hostname: permitted ? 'localhost' : 'example.com' }, original, resourceWitness: { noteImport: name => notes.push(name) },
      importNativeObserver: async () => { imports++; return { createNativeInvokeObserver }; },
      setModuleImports: (name, value) => registered.push({ name, value }) });
    vm.runInContext('let engineInvoke = original; let nativeInvokeObserver = null;' + flags + initializer, context);
    await context.initializeNativeInvokeObservation(); vm.runInContext(registration, context);
    assert.equal(imports, Number(expected)); assert.equal(registered[0].name, 'bomber-engine');
    assert.equal(registered[0].value.invoke === original, !expected);
    assert.equal(vm.runInContext('engineInvoke', context), original);
    assert.equal(vm.runInContext('engineInvoke.createVoxelPresentation()', context), 'original presentation');
    assert.equal(Boolean(vm.runInContext('nativeInvokeObserver', context)), expected);
    assert.deepEqual(notes, expected ? ['./native-invoke-observer.mjs'] : []);
  }
});

test('actual private initializer failure stays diagnostic and registers the unchanged native invoke', async () => {
  const start = source.indexOf('async function initializeNativeInvokeObservation()');
  assert.ok(start >= 0);
  const initializer = source.slice(start, source.indexOf('async function loadWasmExports()', start))
    .replace("import('./native-invoke-observer.mjs')", 'globalThis.importNativeObserver()');
  const flags = source.slice(source.indexOf('const LOOPBACK_HOSTS ='), source.indexOf('async function initializeResourceWitness()'));
  for (const stage of ['import', 'factory']) {
    const notes = [], diagnostics = [], registrations = [], original = () => 'original';
    const context = vm.createContext({ PLAYER_MODE: true, URLSearchParams,
      location: { search: '?scene=movement-sync-preview&trace=movement', hostname: 'localhost' }, original,
      resourceWitness: { noteImport: value => notes.push(value) },
      movementTrace: { diagnosticFailure: kind => diagnostics.push(kind) },
      importNativeObserver: async () => { if (stage === 'import') throw new Error('diagnostic import failed');
        return { createNativeInvokeObserver: () => { throw new Error('diagnostic factory failed'); } }; },
      setModuleImports: (name, value) => registrations.push(value) });
    vm.runInContext('let engineInvoke = original; let nativeInvokeObserver = null;' + flags + initializer +
      source.slice(source.indexOf('function noteNativeInvokeFailure('), source.indexOf('function prepareNativeInvokeTick(')), context);
    await context.initializeNativeInvokeObservation();
    vm.runInContext(source.match(/setModuleImports\('bomber-engine',[\s\S]*?\);/)[0], context);
    assert.equal(registrations[0].invoke, original); assert.deepEqual(diagnostics, ['native-invoke-initialize']);
    assert.deepEqual(notes, stage === 'import' ? [] : ['./native-invoke-observer.mjs']);
  }
});
