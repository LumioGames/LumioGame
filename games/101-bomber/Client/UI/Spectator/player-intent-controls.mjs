const DIRECTIONS = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
const UI_FOCUS = 'button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]';

export function createPlayerIntentControls({ setMoveIntent, setBombIntent, latchSkillIntent, clearIntent,
  ready, target = window, panel }) {
  const held = new Map();
  const bombSources = new Set();
  const listeners = [];
  let touch = [0, 0];
  let focused = true;
  let disposed = false;

  function blocked() {
    const active = target.document?.activeElement;
    return !focused || target.document?.hidden ||
      (active?.closest?.(UI_FOCUS) && !panel?.contains?.(active));
  }
  function reset() {
    held.clear();
    touch = [0, 0];
    const cancelBomb = bombSources.size > 0;
    bombSources.clear();
    if (cancelBomb) setBombIntent('cancel');
    clearIntent();
  }
  function clear() { if (!disposed) reset(); }
  function allowed() {
    if (disposed) return false;
    if (!ready() || blocked()) { clear(); return false; }
    return true;
  }
  function directions() {
    if (touch[0]) return touch;
    const latest = [...new Set([...held.values()].reverse())];
    return [latest[0] ?? 0, latest[1] ?? 0];
  }
  function publishMove(turn) {
    const [primary, secondary] = directions();
    setMoveIntent(primary, secondary, turn);
  }
  function press(source, direction) {
    if (!allowed() || !direction || held.has(source)) return;
    held.set(source, direction);
    publishMove(true);
  }
  function release(source) {
    if (!allowed() || !held.delete(source)) return;
    publishMove(false);
  }
  function pressBomb(source) {
    if (!allowed() || bombSources.has(source)) return;
    const first = bombSources.size === 0;
    bombSources.add(source);
    if (first) setBombIntent('begin');
  }
  function releaseBomb(source, cancelled = false) {
    if (!allowed() || !bombSources.delete(source)) return;
    if (!bombSources.size) setBombIntent(cancelled ? 'cancel' : 'end');
  }
  function setBombPressed(pressed, cancelled = false, surface = 'touch') {
    const source = `surface:${surface}`;
    if (pressed) pressBomb(source);
    else releaseBomb(source, cancelled);
  }
  function setTouchDirection(primary, secondary = 0) {
    if (!allowed()) return;
    const before = directions();
    touch = primary ? [primary, secondary] : [0, 0];
    const after = directions();
    if (after[0] !== before[0] || after[1] !== before[1]) publishMove(true);
  }
  function keydown(event) {
    if (disposed) return;
    if (event.defaultPrevented || blocked() || event.target?.closest?.(UI_FOCUS)) { clear(); return; }
    if (!allowed()) return;
    if (DIRECTIONS[event.code]) {
      event.preventDefault();
      if (!event.repeat) press(event.code, DIRECTIONS[event.code]);
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) pressBomb('keyboard');
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      event.preventDefault();
      if (!event.repeat) latchSkillIntent();
    }
  }
  function keyup(event) {
    if (!allowed()) return;
    if (DIRECTIONS[event.code]) release(event.code);
    if (event.code === 'Space') releaseBomb('keyboard');
  }
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
      if (!allowed()) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      press(`pointer:${event.pointerId}`, Number(button.dataset.direction));
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(button, name, event => release(`pointer:${event.pointerId}`));
  }
  const bomb = panel?.querySelector('[data-bomb]');
  if (bomb) {
    listen(bomb, 'pointerdown', event => {
      if (!allowed()) return;
      event.preventDefault();
      bomb.setPointerCapture?.(event.pointerId);
      pressBomb(`bomb-pointer:${event.pointerId}`);
    });
    listen(bomb, 'pointerup', event => releaseBomb(`bomb-pointer:${event.pointerId}`));
    for (const name of ['pointercancel', 'lostpointercapture'])
      listen(bomb, name, event => releaseBomb(`bomb-pointer:${event.pointerId}`, true));
    // Assistive clicks have no physical pointer gesture; both edges reach the owner immediately.
    listen(bomb, 'click', event => {
      if (event.detail === 0 && allowed()) { pressBomb('click'); releaseBomb('click'); }
    });
  }
  const skill = panel?.querySelector('[data-skill]');
  if (skill) listen(skill, 'click', () => { if (allowed()) latchSkillIntent(); });
  return { clear, setTouchDirection, setBombPressed, destroy() {
    if (disposed) return;
    disposed = true;
    for (const remove of listeners) remove();
    reset();
  } };
}
