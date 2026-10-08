import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementTrace } from './movement-trace.mjs';

test('trace keeps the post-Tick owner publication on the pump and the shown pose on the frame', () => {
  let clock = 0;
  const trace = createMovementTrace({ now: () => clock, doc: { visibilityState: 'visible' }, userAgent: 'test' });
  const pose = { publicationSequence: '7', localStepOrdinal: '3', executionTick: '12', inputSequence: '5',
    cause: 'InputPublication', target: { position: { x: 1.5, y: 0, z: 2 } }, model: { position: { x: 1.4, y: 0, z: 2 } } };
  trace.pump({ startedAt: 10, tickAt: 10.5, tickMs: 4, totalMs: 6, state: 'active', pose });
  trace.pump({ startedAt: 60, tickAt: 60.5, tickMs: 4, totalMs: 6, state: 'active', pose: null });
  clock = 12;
  trace.input('move', true, [1, 0, true]);
  trace.frame({ now: 16, dt: 16, renderTick: 3.2, localPose: pose, local: { x: 1.45, z: 2, yaw: 0, speed: 4, cameraX: 1, cameraZ: -4 } });
  const { events, userAgent, truncated } = trace.export();
  assert.equal(userAgent, 'test');
  assert.equal(truncated, false);
  assert.deepEqual(events[0].pose, { seq: '7', step: '3', tick: '12', inputSeq: '5', cause: 'InputPublication', tx: 1.5, tz: 2 });
  assert.equal(events[1].pose, null);
  assert.deepEqual(events[2], { k: 'input', t: 12, kind: 'move', accepted: true, args: [1, 0, true] });
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
