import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeInvokeObserver, NATIVE_OPERATIONS } from './native-invoke-observer.mjs';

const row = (snapshot, operation) => snapshot.operations.find(item => item.operation === operation);

test('two operations retain distinct inclusive call counts and durations', () => {
  const times = [10, 12.5, 20, 24.5, 30, 31];
  const observer = createNativeInvokeObserver(() => new Uint8Array(1), { now: () => times.shift() });
  observer.beginScope('managedTick');
  observer.invoke('clock_now', new Uint8Array(2));
  observer.invoke('voxel_prediction_working_read_cell', new Uint8Array(3));
  observer.invoke('clock_now', new Uint8Array(2));
  const snapshot = observer.snapshot();
  assert.deepEqual(row(snapshot, 'clock_now'), { operation: 'clock_now', count: 2, sumMs: 3.5, maxMs: 2.5, failed: 0 });
  assert.deepEqual(row(snapshot, 'voxel_prediction_working_read_cell'), {
    operation: 'voxel_prediction_working_read_cell', count: 1, sumMs: 4.5, maxMs: 4.5, failed: 0 });
  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.sumMs, 8);
  assert.equal(snapshot.maxMs, 4.5);
});

test('unknown operation names aggregate into one bounded other row without inspecting packets', () => {
  const packet = new Proxy({}, { get() { throw new Error('packet inspected'); } });
  let now = 0;
  const observer = createNativeInvokeObserver((operation, actualPacket) => {
    assert.equal(actualPacket, packet); return packet;
  }, { now: () => now++ });
  observer.beginScope('managedTick');
  for (let i = 0; i < 50; i++) assert.equal(observer.invoke('unknown-' + i, packet), packet);
  const snapshot = observer.snapshot();
  assert.equal(snapshot.operations.length, NATIVE_OPERATIONS.length);
  assert.deepEqual(snapshot.operations.map(item => item.operation), NATIVE_OPERATIONS);
  assert.equal(row(snapshot, 'other').count, 50);
  assert.equal(snapshot.count, 50);
  assert.equal(JSON.stringify(snapshot).includes('unknown-'), false);
});

test('the synchronous receiver, arguments, return object and native error retain identity', () => {
  const packet = new Uint8Array([1, 2]);
  const result = new Uint8Array([3, 4]);
  const receiver = {};
  const error = new Error('native rejected');
  let calls = 0, now = 0;
  const observer = createNativeInvokeObserver(function(operation, actualPacket) {
    assert.equal(this, receiver); assert.equal(actualPacket, packet);
    assert.equal(operation, 'clock_now');
    if (++calls === 2) throw error;
    return result;
  }, { now: () => now++ });
  observer.beginScope('managedTick');
  assert.equal(observer.invoke.call(receiver, 'clock_now', packet), result);
  assert.throws(() => observer.invoke.call(receiver, 'clock_now', packet), actual => actual === error);
  assert.equal(calls, 2);
  assert.equal(row(observer.snapshot(), 'clock_now').failed, 1);
});

test('observer clock failure is counted visibly and cannot replace native results or errors', () => {
  const result = {};
  const error = { native: true };
  const observer = createNativeInvokeObserver(operation => {
    if (operation === 'clock_now') return result;
    throw error;
  }, { now: () => { throw new Error('observer clock failed'); } });
  observer.beginScope('managedTick');
  assert.equal(observer.invoke('clock_now', new Uint8Array()), result);
  assert.throws(() => observer.invoke('hfsm_evaluate', new Uint8Array()), actual => actual === error);
  const snapshot = observer.snapshot();
  assert.equal(snapshot.count, 2);
  assert.equal(snapshot.failed, 1);
  assert.equal(snapshot.diagnosticFailure, 2);
  assert.equal(snapshot.sumMs, 0);
});

test('boot and unscope calls remain outside managedTick and snapshot/reset are detached', () => {
  let now = 0;
  const observer = createNativeInvokeObserver(() => null, { now: () => now++ });
  observer.invoke('clock_now', null);
  observer.beginScope('boot'); observer.invoke('clock_now', null);
  observer.beginScope('managedTick'); observer.invoke('clock_now', null);
  observer.beginScope('unscope'); observer.invoke('clock_now', null);
  assert.equal(observer.snapshot('managedTick').count, 1);
  assert.equal(observer.snapshot('boot').count, 1);
  assert.equal(observer.snapshot('unscope').count, 2);
  const saved = observer.snapshot('managedTick');
  saved.operations[0].count = 1000;
  assert.equal(observer.snapshot('managedTick').count, 1);
  observer.reset('managedTick');
  assert.equal(observer.snapshot('managedTick').count, 0);
  assert.equal(observer.snapshot('boot').count, 1);
  assert.equal(observer.snapshot('unscope').count, 2);
  assert.throws(() => observer.beginScope('any-other-scope'), /scope/);
});
