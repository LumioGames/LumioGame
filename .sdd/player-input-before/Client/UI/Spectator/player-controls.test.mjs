import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerInput } from './player-controls.mjs';

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
