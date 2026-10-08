const DIRECTIONS = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };

// driver 'interval': held pulses run on their own timer (the shipped default).
// driver 'pump': the Session pump calls pump() right before each Tick, so exactly one held
// pulse reaches every admission; presses only latch until that pulse publishes them.
export function createPlayerInput({ sendMove, placeBomb, bombButton, useSkill, ready, target = window, panel,
  schedule = setInterval, cancel = clearInterval, intervalMs = 50, driver = 'interval' }) {
  const pumped = driver === 'pump';
  let pumpPulse = () => {};
  if (pumped) {
    let pulse = null;
    schedule = callback => { pulse = callback; return 1; };
    cancel = () => { pulse = null; };
    pumpPulse = () => pulse?.();
  }
  const held = new Map();
  const bombSources = new Set();
  let timer;
  let focused = true;
  let touch = [0, 0];
  let disposed = false;
  // Pump driver only: a press waits for the next pump; a tap released before it still moves once.
  let turnPending = false;
  let tapDirection = 0;
  const UI_FOCUS = 'button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]';
  function blocked() {
    const active = target.document?.activeElement;
    return !focused || target.document?.hidden ||
      (active?.closest?.(UI_FOCUS) && !panel?.contains?.(active));
  }
  function move(turn = false) {
    if (disposed || !ready() || blocked()) { clear(); return; }
    const directions = touch[0] ? touch : [...new Set(held.values())].reverse();
    if (directions.length) sendMove(directions[0], directions[1] ?? 0, turn);
    else if (tapDirection) sendMove(tapDirection, 0, true);
  }
  function latch(direction) {
    turnPending = true;
    tapDirection = direction;
  }
  function press(key, direction) {
    if (disposed || !ready() || blocked() || held.has(key)) return;
    held.set(key, direction);
    if (pumped) latch(direction);
    else move(true);
    updateTimer();
  }
  function release(key) {
    held.delete(key);
    updateTimer();
  }
  function pulse() {
    const turn = turnPending;
    move(turn);
    turnPending = false;
    tapDirection = 0;
    if (bombSources.size) bombButton('held');
    if (pumped) updateTimer();
  }
  function updateTimer() {
    if ((held.size || touch[0] || bombSources.size || tapDirection) && timer === undefined)
      timer = schedule(pulse, intervalMs);
    if (!held.size && !touch[0] && !bombSources.size && !tapDirection && timer !== undefined) {
      cancel(timer); timer = undefined;
    }
  }
  function pressBomb(source) {
    if (disposed || !ready() || blocked() || bombSources.has(source)) return;
    if (!bombButton) { placeBomb(); return; }
    const first = bombSources.size === 0;
    bombSources.add(source);
    if (first) bombButton('begin');
    updateTimer();
  }
  function releaseBomb(source, cancelled = false) {
    if (!bombSources.delete(source)) return;
    if (!bombSources.size) bombButton(cancelled ? 'cancel' : 'end');
    updateTimer();
  }
  function setBombPressed(pressed, cancelled = false, surface = 'touch') {
    const source = `surface:${surface}`;
    if (pressed) pressBomb(source);
    else releaseBomb(source, cancelled);
  }
  function setTouchDirection(primary, secondary = 0) {
    if (disposed || !ready() || blocked()) { clear(); return; }
    touch = primary ? [primary, secondary] : [0, 0];
    if (!pumped) move(true);
    else if (primary) latch(primary);
    updateTimer();
  }
  function clear() {
    held.clear();
    touch = [0, 0];
    turnPending = false;
    tapDirection = 0;
    if (bombSources.size) {
      bombSources.clear();
      bombButton('cancel');
    }
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function keydown(event) {
    if (event.defaultPrevented || blocked() || event.target?.closest?.(UI_FOCUS)) { clear(); return; }
    if (DIRECTIONS[event.code]) { event.preventDefault(); press(event.code, DIRECTIONS[event.code]); }
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) pressBomb('keyboard'); }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      event.preventDefault();
      if (!event.repeat && ready()) useSkill?.();
    }
  }
  function keyup(event) { release(event.code); if (event.code === 'Space') releaseBomb('keyboard'); }
  const listeners = [];
  function listen(element, event, callback) {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  }
  listen(target, 'keydown', keydown);
  listen(target, 'keyup', keyup);
  listen(target, 'blur', () => { focused = false; clear(); });
  listen(target, 'focus', () => { focused = true; });
  if (target.document) {
    listen(target.document, 'visibilitychange', () => { if (target.document.hidden) clear(); });
    listen(target.document, 'focusin', () => { if (blocked()) clear(); });
  }
  for (const button of panel?.querySelectorAll('[data-direction]') ?? []) {
    listen(button, 'pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      press(`pointer:${event.pointerId}`, Number(button.dataset.direction));
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(button, name, event => release(`pointer:${event.pointerId}`));
  }
  const bomb = panel?.querySelector('[data-bomb]');
  if (bomb) {
    if (bombButton) {
      listen(bomb, 'pointerdown', event => {
        event.preventDefault();
        bomb.setPointerCapture?.(event.pointerId);
        pressBomb(`bomb-pointer:${event.pointerId}`);
      });
      listen(bomb, 'pointerup', event => releaseBomb(`bomb-pointer:${event.pointerId}`));
      for (const name of ['pointercancel', 'lostpointercapture'])
        listen(bomb, name, event => releaseBomb(`bomb-pointer:${event.pointerId}`, true));
      // Keyboard/assistive clicks have no pointer gesture; keep both edges even in one frame.
      listen(bomb, 'click', event => { if (event.detail === 0) { pressBomb('click'); releaseBomb('click'); } });
    } else listen(bomb, 'click', () => { if (ready() && !blocked()) placeBomb(); });
  }
  const skill = panel?.querySelector('[data-skill]');
  if (skill) listen(skill, 'click', () => { if (ready() && !blocked()) useSkill?.(); });
  return { clear, setTouchDirection, setBombPressed, pump() { if (!disposed) pumpPulse(); }, destroy() { disposed = true; clear(); for (const remove of listeners) remove(); } };
}
