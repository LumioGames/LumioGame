import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as trace from './movement-trace.mjs';

function profiler(options) {
  assert.equal(typeof trace.createRuntimeBridgePerf, 'function', 'Game bridge performance capability is unavailable');
  return trace.createRuntimeBridgePerf(options);
}

test('bridge cost retains the original return and receiver and separates Tick from outside work', () => {
  let clock = 10;
  const profile = profiler({ now: () => clock });
  const receiver = {}, reply = new Uint8Array(7), request = new Uint8Array(3);
  const invoke = profile.wrap(function () { assert.equal(this, receiver); clock += 25; return reply; });
  assert.equal(invoke.call(receiver, 'world_boot', request), reply);
  profile.beginTick();
  assert.equal(invoke.call(receiver, 'physics_sweep', request), reply);
  assert.equal(invoke.call(receiver, 'physics_sweep', request), reply);
  profile.endTick();
  invoke.call(receiver, 'owner_read', request);
  const data = profile.drain('9007199254740993');
  assert.equal(data.hookPumpId, '9007199254740993');
  assert.equal(data.scope, 'bomberEngineJSImportOnly');
  assert.deepEqual(data.withinTick, [{ operation: 'physics_sweep', calls: 2, returnedFalse: 0, elapsedMs: 50,
    elapsedUnknown: 0, requestBytes: 6, replyBytes: 14, requestBytesUnknown: 0, replyBytesUnknown: 0 }]);
  assert.deepEqual(data.outside.map(v => [v.operation, v.calls, v.elapsedMs]), [['world_boot', 1, 25], ['owner_read', 1, 25]]);
  assert.equal(data.outsideHookPumpId, null);
  assert.equal(profile.drain(null).withinTick.length, 0);
});

test('bridge errors count returned false and preserve the exact original exception without reading contents', () => {
  let clock = 0;
  const profile = profiler({ now: () => clock });
  const error = new Error('secret packet contents');
  const invoke = profile.wrap(() => { clock = 41; throw error; });
  profile.beginTick();
  assert.throws(() => invoke('physics_query', new Uint8Array(64)), e => e === error);
  profile.endTick();
  const data = profile.drain('7');
  assert.equal(data.withinTick[0].returnedFalse, 1);
  assert.equal(data.withinTick[0].elapsedMs, 41);
  assert.equal(data.withinTick[0].requestBytes, 64);
  assert.equal(data.withinTick[0].replyBytesUnknown, 1);
  assert.equal(JSON.stringify(data).includes('secret'), false);
});

test('bridge operation retention is bounded with explicit drops and unknown byte lengths', () => {
  const profile = profiler({ now: () => 0, operationCapacity: 2 });
  const invoke = profile.wrap(() => undefined);
  invoke('a', null); invoke('b', null); invoke('c', null); invoke('x'.repeat(129), null);
  const data = profile.drain(null);
  assert.equal(data.outside.length, 2);
  assert.equal(data.operationCapacity, 2);
  assert.equal(data.droppedCalls, 2);
  assert.equal(data.truncated, true);
  assert.equal(data.outside[0].requestBytesUnknown, 1);
  assert.equal(data.outside[0].replyBytesUnknown, 1);
});

test('an undrained Tick window is dropped explicitly while outside calls remain unbound', () => {
  const profile = profiler({ now: () => 0 });
  const invoke = profile.wrap(() => new Uint8Array(0));
  invoke('boot', new Uint8Array(0));
  profile.beginTick(); invoke('old_tick', new Uint8Array(0)); profile.endTick();
  profile.beginTick(); invoke('new_tick', new Uint8Array(0)); profile.endTick();
  const data = profile.drain('8');
  assert.deepEqual(data.withinTick.map(v => v.operation), ['new_tick']);
  assert.deepEqual(data.outside.map(v => v.operation), ['boot']);
  assert.equal(data.droppedTickWindows, 1);
  assert.equal(data.droppedCalls, 1);
  assert.equal(data.truncated, true);
});

test('diagnostic clock failure stays explicit and never changes an engine result', () => {
  const profile = profiler({ now: () => { throw new Error('secret clock detail'); } });
  const reply = new Uint8Array(5), invoke = profile.wrap(() => reply);
  assert.equal(invoke('read', new Uint8Array(3)), reply);
  const data = profile.drain(null);
  assert.equal(data.outside[0].elapsedUnknown, 1);
  assert.equal(data.errors, 1);
  assert.equal(data.lastError, 'clockUnavailable');
  assert.equal(JSON.stringify(data).includes('secret'), false);
});

test('the main bridge binding returns the raw invoke when diagnostics are disabled', () => {
  const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function tracedEngineInvoke(');
  assert.notEqual(start, -1, 'Game bridge diagnostic binding capability is unavailable');
  const end = source.indexOf('\n}', start) + 2;
  const context = vm.createContext({ runtimeBridgePerf: null });
  vm.runInContext(source.slice(start, end), context);
  const original = () => 1;
  assert.equal(context.tracedEngineInvoke(original), original);
  let wrapped = 0;
  context.runtimeBridgePerf = { wrap(value) { wrapped++; assert.equal(value, original); return () => 2; } };
  assert.equal(context.tracedEngineInvoke(original)(), 2);
  assert.equal(wrapped, 1);
});
