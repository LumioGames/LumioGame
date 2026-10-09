export function createMovementPreviewControls({ panel, input, state, trace, exportTrace, target = window }) {
  const buttons = [...panel.querySelectorAll('[data-movement-direction]')];
  const status = panel.querySelector('[data-movement-status]');
  const listeners = [];
  let latched = 0;
  let resetToken;
  let disposed = false;
  function listen(element, name, callback) {
    if (!element) return;
    element.addEventListener(name, callback);
    listeners.push(() => element.removeEventListener(name, callback));
  }
  function invalidate() { latched = 0; }
  function refresh() {
    if (disposed) return false;
    const current = state();
    const reset = resetToken !== undefined && current.resetToken !== resetToken;
    resetToken = current.resetToken;
    if (latched && (!current.ready || reset)) { invalidate(); input.clear(); }
    for (const button of buttons) {
      button.disabled = !current.ready;
      button.setAttribute?.('aria-pressed', String(Number(button.dataset.movementDirection) === latched));
    }
    if (status) status.textContent = `${current.composition} | ${current.inputMode} | ${current.version} | ${current.identity} | ` +
      `touch latch=${latched}; release physical keys to stop all movement | trace events=${trace()?.size ?? 0} | ` +
      `complete=${current.complete ?? 'UNAVAILABLE'} | finite pose=${current.finitePose ?? 'UNAVAILABLE'} | ` +
      `last trace export complete=${current.traceComplete ?? 'UNAVAILABLE'} | sent inputs=${current.inputsSent ?? 'UNAVAILABLE'} | ` +
      `remote confirmed replica; precise remote/facing metrics and OS foreground UNAVAILABLE`;
    return Boolean(current.ready);
  }
  for (const button of buttons) listen(button, 'click', () => {
    if (!refresh()) return;
    const direction = Number(button.dataset.movementDirection);
    if (!Number.isInteger(direction) || direction < 0 || direction > 4 || direction === latched) return;
    input.setTouchDirection(direction, 0);
    latched = direction;
    refresh();
  });
  listen(panel.querySelector('[data-movement-record]'), 'click', () => {
    const recorder = trace();
    if (!recorder) return;
    if (recorder.size) exportTrace();
    recorder.clear();
    refresh();
  });
  listen(panel.querySelector('[data-movement-export]'), 'click', () => { if (trace()) exportTrace(); });
  listen(target, 'blur', () => { invalidate(); refresh(); });
  listen(target.document, 'visibilitychange', () => { if (target.document.hidden) invalidate(); refresh(); });
  listen(target.document, 'focusin', refresh);
  refresh();
  return { refresh, invalidate, snapshot: () => ({ latched }), destroy() {
    if(latched)input.setTouchDirection(0,0);
    disposed = true; invalidate(); for (const remove of listeners) remove();
  } };
}
