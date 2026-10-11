import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerIntentControls } from './player-intent-controls.mjs';

// Minimal DOM event surfaces keep listener exceptions observable to the test caller.
class Surface {
  listeners = new Map();
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(type, fields = {}) {
    const event = { type, target: this, defaultPrevented: false, repeat: false,
      preventDefault() { this.defaultPrevented = true; }, ...fields };
    for (const callback of this.listeners.get(type) ?? []) callback(event);
    return event;
  }
  setPointerCapture() {}
}

function fixture(overrides = {}) {
  const target = new Surface();
  target.document = new Surface();
  target.document.hidden = false;
  target.document.activeElement = null;
  const right = new Surface(); right.dataset = { direction: '2' };
  const down = new Surface(); down.dataset = { direction: '3' };
  const bomb = new Surface();
  const skill = new Surface();
  const children = [right, down, bomb, skill];
  const panel = { contains: element => children.includes(element),
    querySelectorAll: () => [right, down],
    querySelector: selector => ({ '[data-bomb]': bomb, '[data-skill]': skill })[selector] };
  const moves = [], phases = [], events = [];
  let enabled = true, skills = 0, clears = 0;
  const controls = createPlayerIntentControls({ target, panel, ready: () => enabled,
    setMoveIntent: (...args) => { moves.push(args); events.push(['move', ...args]); },
    setBombIntent: phase => { phases.push(phase); events.push(['bomb', phase]); },
    latchSkillIntent: () => { skills++; events.push(['skill']); },
    clearIntent: () => { clears++; events.push(['clear']); }, ...overrides });
  return { target, right, down, bomb, skill, controls, moves, phases, events,
    key: (type, code, fields = {}) => target.emit(type, { code, ...fields }),
    enable: value => { enabled = value; }, get skills() { return skills; }, get clears() { return clears; } };
}

test('Right held then Down tap publishes latest held intent without a shadow tap', () => {
  const f = fixture();
  f.key('keydown', 'ArrowRight'); f.key('keydown', 'ArrowDown'); f.key('keyup', 'ArrowDown');
  assert.deepEqual(f.moves, [[2, 0, true], [3, 2, true], [2, 0, false]]);
  f.key('keyup', 'ArrowRight');
  assert.deepEqual(f.moves.at(-1), [0, 0, false]);
  assert.deepEqual(Object.keys(f.controls).sort(), ['clear', 'destroy', 'setBombPressed', 'setTouchDirection']);
  f.controls.destroy();
});

test('a released quick tap publishes zero and leaves tap retention to the managed owner', () => {
  const f = fixture();
  f.key('keydown', 'KeyW'); f.key('keyup', 'KeyW');
  assert.deepEqual(f.moves, [[1, 0, true], [0, 0, false]]);
  f.controls.destroy();
});

test('repeats and duplicate physical keydowns cannot manufacture new presses', () => {
  const f = fixture();
  f.key('keydown', 'KeyD', { repeat: true });
  assert.deepEqual(f.moves, []);
  f.key('keydown', 'KeyD'); f.key('keydown', 'KeyD'); f.key('keydown', 'KeyD', { repeat: true });
  assert.deepEqual(f.moves, [[2, 0, true]]);
  f.key('keyup', 'KeyD'); f.key('keyup', 'KeyD');
  assert.deepEqual(f.moves, [[2, 0, true], [0, 0, false]]);
  f.controls.destroy();
});

test('newest physical press wins before same-direction deduplication', () => {
  const f = fixture();
  f.key('keydown', 'ArrowRight'); f.key('keydown', 'ArrowDown'); f.key('keydown', 'KeyD');
  assert.deepEqual(f.moves.at(-1), [2, 3, true]);
  f.key('keyup', 'KeyD');
  assert.deepEqual(f.moves.at(-1), [3, 2, false]);
  f.controls.destroy();
});

test('opposite held direction is skipped when finding perpendicular secondary', () => {
  const f = fixture();
  f.key('keydown', 'KeyW'); f.key('keydown', 'KeyA'); f.key('keydown', 'KeyD');
  assert.deepEqual(f.moves.at(-1), [2, 1, true]);
  f.key('keyup', 'KeyD');
  assert.deepEqual(f.moves.at(-1), [4, 1, false]);
  f.controls.destroy();
});

test('reverse opposite-key order still uses the older perpendicular direction', () => {
  const f = fixture();
  f.key('keydown', 'KeyW'); f.key('keydown', 'KeyD'); f.key('keydown', 'KeyA');
  assert.deepEqual(f.moves.at(-1), [4, 1, true]);
  f.controls.destroy();
});

test('newest alias keeps physical order while opposite keys are excluded from secondary', () => {
  const f = fixture();
  f.key('keydown', 'ArrowUp'); f.key('keydown', 'ArrowLeft');
  f.key('keydown', 'KeyD'); f.key('keydown', 'ArrowRight');
  assert.deepEqual(f.moves.at(-1), [2, 1, true]);
  f.key('keyup', 'ArrowRight');
  assert.deepEqual(f.moves.at(-1), [2, 1, false]);
  f.controls.destroy();
});

test('touch wins and returning zero restores the latest current keyboard direction', () => {
  const f = fixture();
  f.key('keydown', 'KeyD'); f.controls.setTouchDirection(1, 4);
  f.key('keydown', 'KeyS'); f.key('keyup', 'KeyD');
  assert.deepEqual(f.moves.at(-1), [1, 4, false]);
  f.controls.setTouchDirection(0);
  assert.deepEqual(f.moves.at(-1), [3, 0, true]);
  f.controls.destroy();
});

test('identical touch updates and same effective fallback create no false press', () => {
  const f = fixture();
  f.controls.setTouchDirection(0); f.controls.setTouchDirection(1, 4); f.controls.setTouchDirection(1, 4);
  assert.deepEqual(f.moves, [[1, 4, true]]);
  f.controls.setTouchDirection(1, 2);
  assert.deepEqual(f.moves.at(-1), [1, 2, true]);
  f.controls.setTouchDirection(0);
  assert.deepEqual(f.moves.at(-1), [0, 0, true]);
  f.key('keydown', 'KeyD'); f.controls.setTouchDirection(2); f.controls.setTouchDirection(0);
  assert.deepEqual(f.moves.at(-1), [2, 0, true]);
  assert.equal(f.moves.length, 4);
  f.controls.destroy();
});

test('direction pointers release and cancel only their own physical sources', () => {
  const f = fixture();
  f.key('keydown', 'KeyW');
  f.right.emit('pointerdown', { pointerId: 7 }); f.down.emit('pointerdown', { pointerId: 8 });
  f.down.emit('pointercancel', { pointerId: 8 });
  assert.deepEqual(f.moves.at(-1), [2, 1, false]);
  const count = f.moves.length;
  f.down.emit('lostpointercapture', { pointerId: 8 }); f.down.emit('pointerup', { pointerId: 8 });
  assert.equal(f.moves.length, count);
  f.right.emit('pointerup', { pointerId: 7 });
  assert.deepEqual(f.moves.at(-1), [1, 0, false]);
  f.controls.destroy();
});

test('keyboard, touch surfaces, and pointer bomb sources share exactly one gesture', () => {
  const f = fixture();
  f.key('keydown', 'Space'); f.key('keydown', 'Space', { repeat: true });
  f.controls.setBombPressed(true, false, 'hud'); f.controls.setBombPressed(true, false, 'touch');
  f.bomb.emit('pointerdown', { pointerId: 9 });
  f.bomb.emit('click', { detail: 0 });
  f.key('keyup', 'Space'); f.controls.setBombPressed(false, false, 'hud');
  f.controls.setBombPressed(false, false, 'touch');
  assert.deepEqual(f.phases, ['begin']);
  f.bomb.emit('pointerup', { pointerId: 9 }); f.bomb.emit('lostpointercapture', { pointerId: 9 });
  assert.deepEqual(f.phases, ['begin', 'end']);
  f.controls.destroy();
});

test('canceling one bomb source preserves other sources and final cancel never emits end', () => {
  const f = fixture();
  f.key('keydown', 'Space'); f.bomb.emit('pointerdown', { pointerId: 4 });
  f.bomb.emit('pointercancel', { pointerId: 4 }); f.bomb.emit('lostpointercapture', { pointerId: 4 });
  assert.deepEqual(f.phases, ['begin']);
  f.key('keyup', 'Space');
  f.controls.setBombPressed(true); f.controls.setBombPressed(false, true);
  f.bomb.emit('pointerdown', { pointerId: 5 }); f.bomb.emit('lostpointercapture', { pointerId: 5 });
  f.bomb.emit('pointerup', { pointerId: 5 });
  assert.deepEqual(f.phases, ['begin', 'end', 'begin', 'cancel', 'begin', 'cancel']);
  f.controls.destroy();
});

test('assistive click preserves both bomb edges synchronously and ignores pointer-generated click', () => {
  const f = fixture();
  f.bomb.emit('click', { detail: 1 });
  assert.deepEqual(f.phases, []);
  f.bomb.emit('click', { detail: 0 });
  assert.deepEqual(f.phases, ['begin', 'end']);
  f.controls.destroy();
});

test('Shift presses and allowed skill clicks publish only skill edges', () => {
  const f = fixture();
  assert.equal(f.key('keydown', 'ShiftLeft').defaultPrevented, true);
  f.key('keydown', 'ShiftLeft', { repeat: true }); f.key('keydown', 'ShiftRight');
  f.skill.emit('click');
  assert.equal(f.skills, 3);
  assert.deepEqual(f.phases, []);
  f.enable(false); f.key('keydown', 'ShiftLeft'); f.skill.emit('click');
  assert.equal(f.skills, 3);
  f.controls.destroy();
});

test('blur cancels before clearing once, rejects input, and focus permits fresh presses', () => {
  const f = fixture();
  f.key('keydown', 'KeyD'); f.key('keydown', 'Space'); f.target.emit('blur');
  assert.deepEqual(f.events.slice(-2), [['bomb', 'cancel'], ['clear']]);
  assert.equal(f.clears, 1);
  const count = f.moves.length;
  f.key('keydown', 'KeyW'); f.controls.setTouchDirection(3); f.skill.emit('click');
  assert.equal(f.moves.length, count); assert.equal(f.skills, 0);
  f.target.emit('focus'); f.key('keydown', 'KeyW');
  assert.deepEqual(f.moves.at(-1), [1, 0, true]);
  f.key('keyup', 'Space'); assert.deepEqual(f.phases, ['begin', 'cancel']);
  f.controls.destroy();
});

test('hidden document clears states and requires fresh input when visible', () => {
  const f = fixture();
  f.controls.setTouchDirection(2); f.controls.setBombPressed(true);
  f.target.document.hidden = true; f.target.document.emit('visibilitychange');
  assert.deepEqual(f.events.slice(-2), [['bomb', 'cancel'], ['clear']]);
  const count = f.moves.length;
  f.key('keydown', 'KeyW'); f.bomb.emit('click', { detail: 0 });
  assert.equal(f.moves.length, count); assert.deepEqual(f.phases, ['begin', 'cancel']);
  f.target.document.hidden = false; f.target.document.emit('visibilitychange'); f.target.emit('focus');
  f.key('keydown', 'KeyS'); assert.deepEqual(f.moves.at(-1), [3, 0, true]);
  f.controls.destroy();
});

test('UI focus and blocked keydown clear once per event and never publish a new press', () => {
  const f = fixture();
  const ui = { closest: () => ({}) };
  f.key('keydown', 'KeyD'); f.key('keydown', 'Space');
  f.target.document.activeElement = ui; f.target.document.emit('focusin');
  assert.deepEqual(f.events.slice(-2), [['bomb', 'cancel'], ['clear']]);
  assert.equal(f.clears, 1);
  f.key('keydown', 'KeyS'); assert.equal(f.clears, 2); assert.equal(f.moves.length, 1);
  f.target.document.activeElement = null;
  f.key('keydown', 'KeyW', { target: ui }); assert.equal(f.clears, 3);
  f.key('keydown', 'ShiftLeft', { defaultPrevented: true }); assert.equal(f.clears, 4);
  f.key('keyup', 'KeyD'); assert.equal(f.moves.length, 1);
  f.key('keydown', 'KeyS'); assert.deepEqual(f.moves.at(-1), [3, 0, true]);
  f.controls.destroy();
});

test('focus inside the controls panel permits pointer controls and skill clicks', () => {
  const f = fixture();
  f.right.closest = () => ({}); f.target.document.activeElement = f.right;
  f.target.document.emit('focusin'); assert.equal(f.clears, 0);
  f.right.emit('pointerdown', { pointerId: 1 }); f.skill.emit('click');
  assert.deepEqual(f.moves, [[2, 0, true]]); assert.equal(f.skills, 1);
  f.controls.destroy();
});

test('readiness loss on an input event cancels held states, while keyup still removes sources', () => {
  const f = fixture();
  f.key('keydown', 'KeyD'); f.key('keydown', 'Space'); f.enable(false);
  assert.deepEqual(f.phases, ['begin']);
  f.key('keyup', 'KeyD');
  assert.deepEqual(f.events.slice(-2), [['bomb', 'cancel'], ['clear']]);
  f.enable(true); f.key('keydown', 'KeyW');
  assert.deepEqual(f.moves.at(-1), [1, 0, true]);
  f.controls.destroy();
});

test('explicit clear removes sources and cancels before clearing the managed owner', () => {
  const f = fixture();
  f.key('keydown', 'KeyD'); f.controls.setTouchDirection(1); f.controls.setBombPressed(true);
  f.controls.clear();
  assert.deepEqual(f.events.slice(-2), [['bomb', 'cancel'], ['clear']]);
  f.key('keyup', 'KeyD'); f.controls.setBombPressed(false);
  assert.deepEqual(f.phases, ['begin', 'cancel']);
  f.key('keydown', 'KeyS'); assert.deepEqual(f.moves.at(-1), [3, 0, true]);
  f.controls.destroy();
});

test('destroy is idempotent, detaches every listener, and prevents all later callbacks', () => {
  const f = fixture();
  f.key('keydown', 'KeyD'); f.key('keydown', 'Space'); f.controls.destroy();
  const count = f.events.length;
  f.controls.destroy(); f.controls.clear(); f.controls.setTouchDirection(1); f.controls.setBombPressed(true);
  f.key('keydown', 'KeyS'); f.key('keyup', 'Space'); f.target.emit('blur'); f.target.emit('focus');
  f.target.document.emit('visibilitychange'); f.right.emit('pointerdown', { pointerId: 2 });
  f.bomb.emit('click', { detail: 0 }); f.skill.emit('click');
  assert.equal(f.events.length, count); assert.equal(f.clears, 1);
  for (const surface of [f.target, f.target.document, f.right, f.down, f.bomb, f.skill])
    for (const listeners of surface.listeners.values()) assert.equal(listeners.size, 0);
});

test('intent callback exceptions propagate synchronously', () => {
  const failure = new Error('managed callback failed');
  for (const [name, invoke] of [
    ['setMoveIntent', f => f.controls.setTouchDirection(1)],
    ['setBombIntent', f => f.controls.setBombPressed(true)],
    ['latchSkillIntent', f => f.skill.emit('click')],
    ['clearIntent', f => f.controls.clear()],
  ]) {
    const f = fixture({ [name]: () => { throw failure; } });
    assert.throws(() => invoke(f), error => error === failure);
  }
});

test('adapter contains no scheduler, simulation, direct ability, or sampling path', () => {
  const source = readFileSync(new URL('./player-intent-controls.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:setInterval|clearInterval|setTimeout|requestAnimationFrame|schedule|pump|Tick|World|sendMove|placeBomb|GAS|await|Date|performance)\b/);
  const f = fixture();
  assert.deepEqual(f.events, []);
  f.controls.destroy();
});

function assertDetached(f) {
  for (const surface of [f.target, f.target.document, f.right, f.down, f.bomb, f.skill])
    for (const listeners of surface.listeners.values()) assert.equal(listeners.size, 0);
}

for (const action of ['clear', 'destroy']) {
  for (const clearFails of [false, true]) {
    test(`cleanup ${action} attempts managed clear after cancel failure${clearFails ? ' and retains both errors' : ''}`, () => {
      const cancelError = new Error('cancel failed'), clearError = new Error('clear failed');
      const calls = [];
      const f = fixture({ setBombIntent: phase => {
        calls.push(phase);
        if (phase === 'cancel') throw cancelError;
      }, clearIntent: () => {
        calls.push('clear');
        if (clearFails) throw clearError;
      } });
      f.key('keydown', 'KeyD'); f.controls.setBombPressed(true);
      let failure;
      try { f.controls[action](); } catch (error) { failure = error; }
      assert.deepEqual(calls, ['begin', 'cancel', 'clear']);
      if (clearFails) {
        assert.ok(failure instanceof AggregateError);
        assert.equal(failure.errors.length, 2);
        assert.equal(failure.errors[0], cancelError); assert.equal(failure.errors[1], clearError);
      } else assert.equal(failure, cancelError);
      const count = calls.length;
      f.key('keyup', 'KeyD'); f.controls.setBombPressed(false);
      assert.equal(f.moves.length, 1); assert.equal(calls.length, count);
      if (action === 'destroy') {
        f.controls.destroy(); f.controls.clear(); f.controls.setTouchDirection(1);
        f.controls.setBombPressed(true); f.skill.emit('click');
        assert.equal(calls.length, count); assert.equal(f.moves.length, 1); assert.equal(f.skills, 0);
        assertDetached(f);
      }
    });
  }
  test(`cleanup ${action} preserves a standalone managed clear error`, () => {
    const failure = new Error('standalone clear failed');
    let clears = 0;
    const f = fixture({ clearIntent: () => { clears++; throw failure; } });
    assert.throws(() => f.controls[action](), error => error === failure);
    assert.equal(clears, 1);
    if (action === 'destroy') { f.controls.destroy(); assert.equal(clears, 1); assertDetached(f); }
  });
}

for (const [name, invoke] of [
  ['touch', f => f.controls.setTouchDirection(2)],
  ['bomb', f => f.controls.setBombPressed(true)],
  ['Shift', f => f.key('keydown', 'ShiftLeft')],
  ['skill click', f => f.skill.emit('click')],
  ['direction release', f => f.key('keyup', 'KeyD')],
  ['bomb release', f => f.controls.setBombPressed(false)],
  ['assistive click', f => f.bomb.emit('click', { detail: 0 })],
]) {
  test(`lifecycle ready destroy blocks ${name} continuation after destroy returns`, () => {
    let f, armed = false;
    const calls = [];
    f = fixture({ ready: () => {
      if (armed) { f.controls.destroy(); calls.push('destroy-return'); }
      return true;
    }, setMoveIntent: () => calls.push('move'), setBombIntent: phase => calls.push(phase),
    latchSkillIntent: () => calls.push('skill'), clearIntent: () => calls.push('clear') });
    if (name === 'direction release') f.key('keydown', 'KeyD');
    if (name === 'bomb release') f.controls.setBombPressed(true);
    calls.length = 0; armed = true; invoke(f);
    assert.deepEqual(calls, name === 'bomb release' ? ['cancel', 'clear', 'destroy-return'] : ['clear', 'destroy-return']);
    assertDetached(f);
  });
}

test('lifecycle cancel destroy takes pending managed clear before returning exactly once', () => {
  let f;
  const calls = [];
  f = fixture({ setBombIntent: phase => {
    calls.push(phase);
    if (phase === 'cancel') { f.controls.destroy(); calls.push('destroy-return'); }
  }, clearIntent: () => calls.push('clear') });
  f.controls.setBombPressed(true); f.controls.clear();
  assert.deepEqual(calls, ['begin', 'cancel', 'clear', 'destroy-return']);
  f.controls.destroy(); f.controls.clear();
  assert.deepEqual(calls, ['begin', 'cancel', 'clear', 'destroy-return']);
  assertDetached(f);
});

test('lifecycle clear callback destroy terminates without a duplicate clear', () => {
  let f, clears = 0;
  const calls = [];
  f = fixture({ clearIntent: () => {
    clears++; calls.push('clear');
    assert.equal(clears, 1, 'managed clear must not recursively invoke itself');
    f.controls.destroy(); calls.push('destroy-return');
  } });
  f.controls.clear();
  assert.deepEqual(calls, ['clear', 'destroy-return']); assert.equal(clears, 1); assertDetached(f);
});

test('lifecycle recursive clear and input during cancellation cannot add a new gesture', () => {
  let f, recurse = true, cancels = 0;
  const calls = [];
  f = fixture({ setBombIntent: phase => {
    calls.push(phase);
    if (phase === 'cancel') {
      cancels++; assert.equal(cancels, 1, 'cancellation must not recursively open another gesture');
      f.controls.setBombPressed(true); f.controls.setTouchDirection(1); f.skill.emit('click');
      f.controls.clear();
    }
  }, clearIntent: () => {
    calls.push('clear');
    if (recurse) { recurse = false; f.controls.clear(); }
  } });
  f.controls.setBombPressed(true); f.controls.clear();
  assert.deepEqual(calls, ['begin', 'cancel', 'clear']);
  assert.deepEqual(f.moves, []); assert.equal(f.skills, 0);
  f.controls.setBombPressed(false); assert.deepEqual(calls, ['begin', 'cancel', 'clear']);
  f.controls.setBombPressed(true); assert.deepEqual(calls, ['begin', 'cancel', 'clear', 'begin']);
});

test('lifecycle assistive begin destroy prevents the following release callback', () => {
  let f;
  const calls = [];
  f = fixture({ setBombIntent: phase => {
    calls.push(phase);
    if (phase === 'begin') { f.controls.destroy(); calls.push('destroy-return'); }
  }, clearIntent: () => calls.push('clear') });
  f.bomb.emit('click', { detail: 0 });
  assert.deepEqual(calls, ['begin', 'cancel', 'clear', 'destroy-return']); assertDetached(f);
});

for (const [action, mode, cancelError, clearError] of [
  ['clear', 'finally', new Error('cancel failed'), new Error('nested clear failed')],
  ['destroy', 'finally', new Error('cancel failed'), new Error('clear failed')],
  ['clear', 'propagate', null, new Error('nested clear failed')],
  ['destroy', 'propagate', null, new Error('clear failed')],
  ['clear', 'catch', new Error('cancel failed after catch'), new Error('nested clear failed')],
  ['clear', 'finally', undefined, new Error('nested clear failed')],
  ['clear', 'finally', new Error('cancel failed'), undefined],
  ['clear', 'propagate', null, undefined],
]) {
  test(`nested cleanup ${action} retains ${mode} errors (cancel ${String(cancelError)}, clear ${String(clearError)})`, () => {
    let f;
    const calls = [];
    f = fixture({ setBombIntent: phase => {
      calls.push(phase);
      if (phase !== 'cancel') return;
      if (mode === 'finally') {
        try { f.controls.destroy(); } finally { throw cancelError; }
      }
      if (mode === 'catch') {
        try { f.controls.destroy(); } catch (error) { assert.equal(error, clearError); }
        throw cancelError;
      }
      f.controls.destroy();
    }, clearIntent: () => { calls.push('clear'); throw clearError; } });
    f.key('keydown', 'KeyD'); f.controls.setBombPressed(true);
    let threw = false, failure;
    try { f.controls[action](); } catch (error) { threw = true; failure = error; }
    assert.equal(threw, true);
    assert.deepEqual(calls, ['begin', 'cancel', 'clear']);
    if (mode === 'propagate') assert.equal(failure, clearError);
    else {
      assert.ok(failure instanceof AggregateError);
      assert.equal(failure.errors.length, 2);
      assert.equal(failure.errors[0], cancelError); assert.equal(failure.errors[1], clearError);
    }
    assertDetached(f);
    f.controls.destroy(); f.controls.clear(); f.controls.setTouchDirection(1);
    f.controls.setBombPressed(true); f.key('keydown', 'KeyS'); f.skill.emit('click');
    assert.deepEqual(calls, ['begin', 'cancel', 'clear']);
    assert.equal(f.moves.length, 1); assert.equal(f.skills, 0);
  });
}
