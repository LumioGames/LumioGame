import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerInput } from './player-controls.mjs';

test('HUD and touch buttons retain separate held sources until both are released', () => {
  let pulse;
  const phases = [];
  const controls = createPlayerInput({ target: new EventTarget(), ready: () => true, sendMove() {}, placeBomb() {},
    bombButton: phase => phases.push(phase), schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  controls.setBombPressed(true, false, 'hud');
  controls.setBombPressed(true, false, 'touch');
  controls.setBombPressed(false, false, 'hud');
  assert.deepEqual(phases, ['begin']);
  pulse();
  assert.deepEqual(phases, ['begin', 'held']);
  controls.setBombPressed(false, false, 'touch');
  assert.deepEqual(phases, ['begin', 'held', 'end']);
  assert.equal(pulse, null);
  controls.destroy();
});

test('bomb button reports edges and held pulses without deciding duration in the browser', () => {
  const target = new EventTarget();
  let pulse;
  const phases = [];
  let legacyBombs = 0;
  const controls = createPlayerInput({ target, ready: () => true, sendMove() {},
    placeBomb: () => legacyBombs++, bombButton: phase => phases.push(phase),
    schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const key = (type, code, repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat }); target.dispatchEvent(event);
  };
  key('keydown', 'Space'); key('keydown', 'Space', true);
  assert.deepEqual(phases, ['begin']);
  for (let i = 0; i < 8; i++) pulse();
  assert.deepEqual(phases, ['begin', ...Array(8).fill('held')]);
  key('keyup', 'Space');
  assert.equal(phases.at(-1), 'end');
  assert.equal(pulse, null);
  assert.equal(legacyBombs, 0);
  controls.destroy();
  assert.equal(phases.at(-1), 'end');
});

test('a quick tap preserves begin and end while focus loss cancels without placing', () => {
  const target = new EventTarget();
  const phases = [];
  let pulse;
  const controls = createPlayerInput({ target, ready: () => true, sendMove() {}, placeBomb() { assert.fail('legacy placement'); },
    bombButton: phase => phases.push(phase),
    schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const key = type => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code: 'Space', repeat: false }); target.dispatchEvent(event);
  };
  key('keydown'); key('keyup');
  assert.deepEqual(phases, ['begin', 'end']);
  key('keydown'); target.dispatchEvent(new Event('blur'));
  assert.deepEqual(phases, ['begin', 'end', 'begin', 'cancel']);
  assert.equal(pulse, null);
  key('keyup'); controls.destroy();
  assert.equal(phases.length, 4);
});

test('touch and keyboard bomb sources share one gesture and cadence with movement', () => {
  const target = new EventTarget();
  const phases = [];
  const moves = [];
  let pulse;
  let schedules = 0;
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, bombButton: phase => phases.push(phase),
    schedule: callback => { schedules++; pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const key = (type, code) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false }); target.dispatchEvent(event);
  };
  key('keydown', 'KeyD'); key('keydown', 'Space'); controls.setBombPressed(true);
  pulse();
  assert.equal(schedules, 1);
  assert.deepEqual(phases, ['begin', 'held']);
  assert.equal(moves.length, 2);
  key('keyup', 'Space');
  assert.equal(phases.at(-1), 'held');
  controls.setBombPressed(false);
  assert.equal(phases.at(-1), 'end');
  assert.equal(typeof pulse, 'function');
  key('keyup', 'KeyD');
  assert.equal(pulse, null);
  controls.destroy();
});

test('pointer cancellation reports cancel and never synthesizes a short-tap end', () => {
  const target = new EventTarget();
  const button = new EventTarget();
  button.setPointerCapture = () => {};
  const panel = { querySelector: selector => selector === '[data-bomb]' ? button : null, querySelectorAll: () => [] };
  const phases = [];
  const controls = createPlayerInput({ target, panel, ready: () => true, sendMove() {}, placeBomb() {},
    bombButton: phase => phases.push(phase), schedule: () => 1, cancel() {} });
  const event = type => { const e = new Event(type, { cancelable: true }); Object.assign(e, { pointerId: 9 }); button.dispatchEvent(e); };
  event('pointerdown'); event('pointercancel'); event('lostpointercapture'); event('pointerup');
  assert.deepEqual(phases, ['begin', 'cancel']);
  controls.setBombPressed(true); controls.setBombPressed(false, true);
  assert.deepEqual(phases, ['begin', 'cancel', 'begin', 'cancel']);
  controls.destroy();
});

test('loss of input readiness cancels a held bomb on the next pulse', () => {
  const target = new EventTarget();
  let ready = true;
  let pulse;
  const phases = [];
  const controls = createPlayerInput({ target, ready: () => ready, sendMove() {}, placeBomb() {},
    bombButton: phase => phases.push(phase), schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  controls.setBombPressed(true); ready = false; pulse();
  assert.deepEqual(phases, ['begin', 'cancel']);
  assert.equal(pulse, null);
  controls.setBombPressed(false); controls.destroy();
  assert.equal(phases.length, 2);
});

test('touch and keyboard share one cadence, touch wins, and release resumes held keys', () => {
  const target = new EventTarget();
  let pulse;
  let enabled = true;
  let schedules = 0;
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => enabled,
    sendMove: (...args) => moves.push(args), placeBomb() {},
    schedule: callback => { schedules++; pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const key = (type, code) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false }); target.dispatchEvent(event);
  };
  key('keydown', 'KeyD');
  controls.setTouchDirection(1, 4);
  pulse();
  assert.deepEqual(moves, [[2, 0, true], [1, 4, true], [1, 4, false]]);
  assert.equal(schedules, 1);
  controls.setTouchDirection(0, 0);
  assert.deepEqual(moves.at(-1), [2, 0, true]);
  key('keyup', 'KeyD');
  assert.equal(pulse, null);
  controls.setTouchDirection(3, 2);
  enabled = false;
  pulse();
  assert.equal(pulse, null);
  const count = moves.length;
  enabled = true;
  target.dispatchEvent(new Event('blur'));
  controls.setTouchDirection(1, 0);
  assert.equal(moves.length, count);
  controls.destroy();
  target.dispatchEvent(new Event('focus'));
  controls.setTouchDirection(1, 0);
  assert.equal(moves.length, count);
});

test('movement is gated, repeats only while held, and clears on key release or focus loss', () => {
  const target = new EventTarget();
  let enabled = false;
  let pulse;
  let canceled = 0;
  const moves = [];
  let bombs = 0;
  const controls = createPlayerInput({ target, ready: () => enabled,
    sendMove: (...args) => moves.push(args), placeBomb: () => bombs++,
    schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; canceled++; } });
  function key(type, code, repeat = false) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    target.dispatchEvent(event);
  }
  key('keydown', 'KeyD'); key('keydown', 'Space');
  assert.equal(moves.length, 0); assert.equal(bombs, 0);
  enabled = true;
  key('keydown', 'KeyD'); key('keydown', 'KeyD', true);
  assert.deepEqual(moves, [[2, 0, true]]);
  pulse();
  assert.deepEqual(moves[1], [2, 0, false]);
  key('keyup', 'KeyD');
  assert.equal(pulse, null);
  key('keydown', 'Space'); key('keydown', 'Space', true);
  assert.equal(bombs, 1);
  key('keydown', 'KeyW');
  target.dispatchEvent(new Event('blur'));
  assert.equal(pulse, null);
  assert.equal(canceled, 2);
  controls.destroy();
  key('keydown', 'Space');
  assert.equal(bombs, 1);
});

test('Shift and pointer skill send once without placing a bomb, then stop on close and disposal', () => {
  const target = new EventTarget();
  const skill = new EventTarget();
  const panel = { querySelector: selector => selector === '[data-skill]' ? skill : null,
    querySelectorAll: () => [] };
  let enabled = true;
  let skills = 0;
  let bombs = 0;
  const controls = createPlayerInput({ target, panel, ready: () => enabled,
    sendMove() {}, placeBomb: () => bombs++, useSkill: () => skills++ });
  const key = (code, repeat = false) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code, repeat });
    target.dispatchEvent(event);
    return event;
  };
  assert.equal(key('ShiftLeft').defaultPrevented, true);
  key('ShiftLeft', true);
  skill.dispatchEvent(new Event('click'));
  assert.equal(skills, 2);
  assert.equal(bombs, 0);
  enabled = false;
  key('ShiftRight');
  skill.dispatchEvent(new Event('click'));
  assert.equal(skills, 2);
  controls.destroy();
  enabled = true;
  key('ShiftLeft');
  skill.dispatchEvent(new Event('click'));
  assert.equal(skills, 2);
});

test('focused UI, hidden page, and blur release held movement and reject skill keys', () => {
  const target = new EventTarget();
  target.document = new EventTarget();
  target.document.hidden = false;
  target.document.activeElement = null;
  let pulse;
  const moves = [];
  let skills = 0;
  const controls = createPlayerInput({ target, ready: () => true,
    sendMove: (...args) => moves.push(args), placeBomb() {}, useSkill: () => skills++,
    schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const key = code => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code, repeat: false });
    target.dispatchEvent(event);
  };
  key('KeyD');
  assert.equal(moves.length, 1);
  target.document.activeElement = { closest: () => ({ role: 'dialog' }) };
  target.document.dispatchEvent(new Event('focusin'));
  assert.equal(pulse, null);
  key('ShiftLeft');
  assert.equal(skills, 0);
  target.document.activeElement = null;
  key('KeyW');
  target.document.hidden = true;
  target.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pulse, null);
  key('ShiftLeft');
  assert.equal(skills, 0);
  target.document.hidden = false;
  target.dispatchEvent(new Event('focus'));
  key('ShiftLeft');
  assert.equal(skills, 1);
  target.dispatchEvent(new Event('blur'));
  assert.equal(pulse, null);
  key('ShiftLeft');
  assert.equal(skills, 1);
  controls.destroy();
});

test('a focused pointer direction button keeps movement repeating until release', () => {
  const target = new EventTarget();
  target.document = new EventTarget();
  target.document.hidden = false;
  const direction = new EventTarget();
  direction.dataset = { direction: '2' };
  direction.setPointerCapture = () => {};
  target.document.activeElement = direction;
  const panel = { contains: element => element === direction,
    querySelectorAll: () => [direction], querySelector: () => null };
  const moves = [];
  let pulse;
  const controls = createPlayerInput({ target, panel, ready: () => true,
    sendMove: (...args) => moves.push(args), placeBomb() {},
    schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  const down = new Event('pointerdown', { cancelable: true });
  Object.assign(down, { pointerId: 9 });
  direction.dispatchEvent(down);
  assert.deepEqual(moves, [[2, 0, true]]);
  pulse();
  assert.deepEqual(moves[1], [2, 0, false]);
  const up = new Event('pointerup');
  Object.assign(up, { pointerId: 9 });
  direction.dispatchEvent(up);
  assert.equal(pulse, null);
  controls.destroy();
});

test('pump driver publishes exactly one held move per pump and latches the press turn', () => {
  const target = new EventTarget();
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, driver: 'pump', schedule() { assert.fail('pump driver must not start a timer'); } });
  const key = (type, code) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false }); target.dispatchEvent(event);
  };
  key('keydown', 'KeyW');
  assert.deepEqual(moves, []);
  controls.pump();
  controls.pump();
  controls.pump();
  assert.deepEqual(moves, [[1, 0, true], [1, 0, false], [1, 0, false]]);
  key('keydown', 'KeyD');
  controls.pump();
  assert.deepEqual(moves.at(-1), [2, 1, true]);
  key('keyup', 'KeyD'); key('keyup', 'KeyW');
  controls.pump();
  assert.equal(moves.length, 4);
  controls.destroy();
});

test('pump driver keeps a tap released between pumps as one move', () => {
  const target = new EventTarget();
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, driver: 'pump' });
  const key = (type, code) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false }); target.dispatchEvent(event);
  };
  key('keydown', 'KeyA'); key('keyup', 'KeyA');
  controls.pump();
  controls.pump();
  assert.deepEqual(moves, [[4, 0, true]]);
  controls.setTouchDirection(3);
  controls.setTouchDirection(0);
  controls.pump();
  assert.deepEqual(moves.at(-1), [3, 0, true]);
  key('keydown', 'KeyS'); target.dispatchEvent(new Event('blur'));
  controls.pump();
  assert.equal(moves.length, 2);
  controls.destroy();
});

test('pump driver shares the pump cadence with held bomb pulses', () => {
  const target = new EventTarget();
  const phases = [];
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, bombButton: phase => phases.push(phase), driver: 'pump' });
  controls.setBombPressed(true);
  controls.pump();
  controls.pump();
  controls.setBombPressed(false);
  controls.pump();
  assert.deepEqual(phases, ['begin', 'held', 'held', 'end']);
  assert.deepEqual(moves, []);
  controls.destroy();
});

test('interval driver ignores pump calls', () => {
  const moves = [];
  let pulse;
  const controls = createPlayerInput({ target: new EventTarget(), ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, schedule: callback => { pulse = callback; return 1; }, cancel: () => { pulse = null; } });
  controls.setTouchDirection(1);
  controls.pump();
  assert.deepEqual(moves, [[1, 0, true]]);
  pulse();
  assert.deepEqual(moves, [[1, 0, true], [1, 0, false]]);
  controls.destroy();
});

test('pump driver keeps a tap on another direction while one is held, like the interval press', () => {
  const target = new EventTarget();
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, driver: 'pump' });
  const key = (type, code) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false }); target.dispatchEvent(event);
  };
  key('keydown', 'KeyW');
  controls.pump();
  key('keydown', 'KeyD'); key('keyup', 'KeyD');
  controls.pump();
  controls.pump();
  assert.deepEqual(moves, [[1, 0, true], [2, 1, true], [1, 0, false]]);
  controls.destroy();
});

test('pump driver publishes the held key as a turn after the touch direction is released', () => {
  const target = new EventTarget();
  const moves = [];
  const controls = createPlayerInput({ target, ready: () => true, sendMove: (...args) => moves.push(args),
    placeBomb() {}, driver: 'pump' });
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { code: 'KeyW', repeat: false }); target.dispatchEvent(event);
  controls.setTouchDirection(3);
  controls.pump();
  controls.setTouchDirection(0);
  controls.pump();
  controls.pump();
  assert.deepEqual(moves, [[3, 0, true], [1, 0, true], [1, 0, false]]);
  controls.destroy();
});
