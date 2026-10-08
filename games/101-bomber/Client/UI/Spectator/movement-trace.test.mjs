import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementTrace, observeLongTasks } from './movement-trace.mjs';

test('trace keeps the post-Tick owner publication on the pump and the shown pose on the frame', () => {
  let clock = 0;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' }, userAgent: 'test' });
  const pose = { publicationSequence: '7', localStepOrdinal: '3', executionTick: '12', inputSequence: '5',
    cause: 'InputPublication', target: { position: { x: 1.5, y: 0, z: 2 } }, model: { position: { x: 1.4, y: 0, z: 2 } } };
  clock = 16;
  trace.pump({ startedAt: 10, tickAt: 10.5, tickMs: 4, totalMs: 6, state: 'active', pose });
  clock = 66;
  trace.pump({ startedAt: 60, tickAt: 60.5, tickMs: 4, totalMs: 6, state: 'active', pose: null });
  clock = 72;
  trace.input('move', true, [1, 0, true]);
  clock = 76;
  trace.frame({ now: 76, dt: 16, renderTick: 3.2, localPose: pose, local: { x: 1.45, z: 2, yaw: 0, speed: 4, cameraX: 1, cameraZ: -4 } });
  const { events, userAgent, truncated } = trace.export();
  assert.equal(userAgent, 'test');
  assert.equal(truncated, false);
  assert.deepEqual(events[0].pose, { sessionGeneration: null, entity: null, connectionGeneration: null,
    seq: '7', step: '3', tick: '12', inputSeq: '5', cause: 'InputPublication', tx: 1.5, tz: 2 });
  assert.equal(events[1].pose, null);
  assert.deepEqual(events[2], { k: 'input', t: 72, kind: 'move', accepted: true, args: [1, 0, true] });
  assert.equal(events[3].tx, 1.5);
  assert.equal(events[3].mx, 1.4);
  assert.equal(events[3].dx, 1.45);
  assert.equal(events[3].vis, 'visible');
});

test('trace stops recording at capacity and reports truncation', () => {
  const trace = createMovementTrace({ now: () => 0, capacity: 2, doc: null });
  for (let i = 0; i < 3; i++) trace.note(String(i));
  const exported = trace.export();
  assert.equal(exported.events.length, 2);
  assert.equal(exported.truncated, true);
});

test('a delayed frame records its actual callback time and keeps the original RAF timestamp', () => {
  let clock = 277560;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' } });
  const pose = { publicationSequence: '934', target: { position: { x: 9.5, z: 16.2 } } };
  trace.frame({ now: 277550, localPose: pose, local: { x: 9.5, z: 16.2 } });
  clock = 281238.8;
  trace.pump({ startedAt: 277582.4, tickAt: 277582.4, tickMs: 3632.1, totalMs: 3656.4, state: 'active', pose });
  clock = 281240;
  trace.frame({ now: 277567.9, localPose: pose, local: { x: 9.5, z: 16.2 } });
  clock = 283169.8;
  trace.key('keyup', 'KeyW');
  clock = 283170;
  trace.frame({ now: 281253.6, localPose: pose, local: { x: 9.5, z: 16.2 } });
  const { events } = trace.export();
  assert.deepEqual(events.map(e => e.k), ['frame', 'pump', 'frame', 'key', 'frame']);
  assert.equal(events[1].t, 277582.4);
  assert.equal(events[1].tickAt, 277582.4);
  assert.equal(events[1].tickMs, 3632.1);
  assert.equal(events[1].totalMs, 3656.4);
  assert.equal(events[1].observedAt, 281238.8);
  assert.deepEqual(events.filter(e => e.k === 'frame').map(e => [e.t, e.rafAt]),
    [[277560, 277550], [281240, 277567.9], [283170, 281253.6]]);
  assert.ok(events[4].t > events[3].t, 'the final callback happened after keyup');
});

test('trace preserves DTO identity strings and captures current document focus on keys, pumps and frames', () => {
  let focused = true;
  let clock = 0;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible', hasFocus: () => focused } });
  const identity = { sessionGeneration: '9007199254740993', entity: 'ffffffffffffffff0000000000000002', connectionGeneration: '18446744073709551615' };
  const pose = { ...identity, target: { position: { x: 1, z: 2 } } };
  trace.key('keydown', 'KeyW');
  clock = 2;
  trace.pump({ startedAt: 0, tickAt: 1, tickMs: 1, totalMs: 2, state: 'active', pose });
  focused = false;
  clock = 3;
  trace.frame({ now: 2, localPose: pose, local: { x: 1, z: 2 } });
  const { events } = trace.export();
  assert.equal(events[0].focused, true);
  assert.equal(events[1].focused, true);
  assert.equal(events[2].focused, false);
  for (const [key, value] of Object.entries(identity)) {
    assert.equal(events[1].pose[key], value);
    assert.equal(events[2][key], value);
  }
});

test('unavailable focus is null and non-finite displayed coordinates are null in the raw trace', () => {
  const trace = createMovementTrace({ doc: null });
  trace.frame({ now: 0, localPose: null, local: { x: Infinity, z: NaN, yaw: Infinity } });
  const frame = trace.export().events[0];
  assert.equal(frame.focused, null);
  assert.equal(frame.dx, null);
  assert.equal(frame.dz, null);
  assert.equal(frame.yaw, null);
});

test('long-task observation distinguishes unsupported API from a supported trace with a recorded task', () => {
  const unavailable = createMovementTrace({ now: () => 0, doc: null });
  observeLongTasks(unavailable, null)();
  assert.equal(unavailable.export().events[0]?.message, 'longtask=unsupported');
  class Observer {
    static supportedEntryTypes = ['longtask'];
    constructor(callback) { this.callback = callback; }
    observe() { this.callback({ getEntries: () => [{ startTime: 10, duration: 60 }] }); }
    disconnect() {}
  }
  const supported = createMovementTrace({ now: () => 0, doc: null });
  observeLongTasks(supported, Observer)();
  assert.ok(supported.export().events.some(e => e.k === 'note' && e.message === 'longtask=supported'));
  assert.ok(supported.export().events.some(e => e.k === 'longtask' && e.t === 10 && e.duration === 60));
});
