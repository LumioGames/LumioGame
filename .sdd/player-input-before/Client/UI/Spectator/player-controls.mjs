const DIRECTIONS = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };

export function createPlayerInput({ sendMove, placeBomb, useSkill, ready, target = window, panel,
  schedule = setInterval, cancel = clearInterval, intervalMs = 50 }) {
  const held = new Map();
  let timer;
  let focused = true;
  const UI_FOCUS = 'button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]';
  function blocked() {
    const active = target.document?.activeElement;
    return !focused || target.document?.hidden ||
      (active?.closest?.(UI_FOCUS) && !panel?.contains?.(active));
  }
  function move(turn = false) {
    if (!ready() || blocked()) { clear(); return; }
    const directions = [...new Set(held.values())].reverse();
    if (directions.length) sendMove(directions[0], directions[1] ?? 0, turn);
  }
  function press(key, direction) {
    if (!ready() || blocked() || held.has(key)) return;
    held.set(key, direction);
    move(true);
    if (timer === undefined) timer = schedule(() => move(), intervalMs);
  }
  function release(key) {
    held.delete(key);
    if (!held.size && timer !== undefined) { cancel(timer); timer = undefined; }
  }
  function clear() {
    held.clear();
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function keydown(event) {
    if (event.defaultPrevented || blocked() || event.target?.closest?.(UI_FOCUS)) { clear(); return; }
    if (DIRECTIONS[event.code]) { event.preventDefault(); press(event.code, DIRECTIONS[event.code]); }
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat && ready()) placeBomb(); }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      event.preventDefault();
      if (!event.repeat && ready()) useSkill?.();
    }
  }
  function keyup(event) { release(event.code); }
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
  if (bomb) listen(bomb, 'click', () => { if (ready() && !blocked()) placeBomb(); });
  const skill = panel?.querySelector('[data-skill]');
  if (skill) listen(skill, 'click', () => { if (ready() && !blocked()) useSkill?.(); });
  return { clear, destroy() { clear(); for (const remove of listeners) remove(); } };
}
