// Optional raw evidence sink for the explicitly opted-in loopback exercise.
export function createPrivateDiagnosticCapture({ panel, endpoint, auto = false, ready, trace, witness, note,
  target = window, fetch = globalThis.fetch, crypto = globalThis.crypto,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const document = target.document, base = target.location.href, url = new URL(endpoint, base);
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(target.location.hostname) || url.origin !== new URL(base).origin ||
      url.pathname !== '/api/player/evidence') throw new Error('diagnostic_endpoint_not_private');
  const output = document.createElement('p'), stop = document.createElement('button');
  output.dataset.diagnosticReceipt = ''; output.setAttribute('role', 'status');
  stop.type = 'button'; stop.textContent = 'Stop diagnostic capture'; stop.hidden = !auto;
  stop.addEventListener('pointerdown', event => event.preventDefault());
  panel.append(output, stop);
  const receipts = [], errors = []; let phase = auto ? 'waiting-ready' : 'manual export', timer, started, disposed = false;
  const armedAt = now();
  const visible = () => !document.hidden && document.hasFocus?.() !== false;
  function render(detail = '') { output.textContent = `Diagnostic evidence: ${phase}${detail ? ' | ' + detail : ''} | ` +
    receipts.map(row => `${row.kind}: ${row.bytes} bytes SHA256 ${row.sha256}`).join(' | ') +
    (errors.length ? ` | ERROR ${errors.join('; ')}` : ''); }
  async function save(kind, raw) {
    try {
      const address = new URL(url); address.searchParams.set('kind', kind); address.searchParams.set('scene', 'movement-sync-preview'); address.searchParams.set('trace', 'movement');
      const bytes = new TextEncoder().encode(raw);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      const response = await fetch(address.href, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lumio-Player': '1' },
        credentials: 'same-origin', body: raw, signal: AbortSignal.timeout(5000) });
      if (response.status !== 201) throw new Error(`diagnostic_save_http_${response.status}`);
      const receipt = await response.json();
      if (receipt.version !== 1 || receipt.player !== url.searchParams.get('player') || receipt.kind !== kind || receipt.bytes !== bytes.length || receipt.sha256 !== digest ||
          !/^[AB]-(movement-trace|resource-witness)-[a-f0-9-]+\.json$/.test(receipt.file ?? '')) throw new Error('diagnostic_receipt_mismatch');
      receipts.push(receipt); render(); return receipt;
    } catch (error) { errors.push(String(error?.message ?? error)); render(); throw error; }
  }
  async function finish(reason) {
    if (!['waiting-ready', 'capturing'].includes(phase)) return;
    clearTimer(timer); phase = reason; stop.hidden = true;
    note(`diagnostic capture ${reason}; elapsedMs=${started === undefined ? 0 : now() - started}`); render();
    for (const [kind, collect] of [['movement-trace', trace], ['resource-witness', witness]]) {
      try { await save(kind, collect()); }
      catch (error) {
        const message = String(error?.message ?? error);
        if (!errors.includes(message)) errors.push(message);
        render(); target.console?.error?.('[lumio-diagnostic-capture]', message);
      }
    }
  }
  function tick() {
    if (disposed || !['waiting-ready', 'capturing'].includes(phase)) return;
    if (phase === 'waiting-ready') {
      if (visible() && ready()) { started = now(); phase = 'capturing'; note('diagnostic capture started; requestedWindowMs=5000'); }
      else if (now() - armedAt >= 120000) { void finish('cancelled-ready-timeout'); return; }
    }
    if (phase === 'capturing') {
      if (!visible()) { void finish(document.hidden ? 'cancelled-hidden' : 'cancelled-focus-loss'); return; }
      if (!ready()) { void finish('cancelled-not-ready'); return; }
      if (now() - started >= 5000) { void finish('completed-observation'); return; }
      render(`remaining ${Math.ceil((5000 - (now() - started)) / 1000)}s`);
    } else render('armed; waiting for normal input-ready; window 5s');
    timer = setTimer(tick, 250);
  }
  const blur = () => { if (phase === 'capturing') void finish('cancelled-focus-loss'); };
  const visibility = () => { if (phase === 'capturing' && document.hidden) void finish('cancelled-hidden'); };
  stop.addEventListener('click', () => { void finish('cancelled-stop'); });
  target.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  render(auto ? 'armed; waiting for normal input-ready; window 5s' : 'normal Export also saves original JSON here');
  if (auto) timer = setTimer(tick, 0);
  return { save, snapshot: () => ({ phase, receipts: receipts.slice(), errors: errors.slice() }), destroy() {
    if (auto) void finish('cancelled-pagehide'); disposed = true; clearTimer(timer);
    target.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
  } };
}
