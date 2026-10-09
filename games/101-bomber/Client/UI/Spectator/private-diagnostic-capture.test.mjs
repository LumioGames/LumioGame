import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateDiagnosticCapture } from './private-diagnostic-capture.mjs';

function fixture(auto = true, status = 201) {
  let time = 0, ready = false, next = 0; const timers = new Map(), saved = [], notes = [], nodes = [];
  const document = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true,
    createElement: () => Object.assign(new EventTarget(), { dataset: {}, setAttribute() {} }) });
  const target = Object.assign(new EventTarget(), { document, location: { href: 'http://127.0.0.1:19113/play/', hostname: '127.0.0.1' }, console: { error() {} } });
  const capture = createPrivateDiagnosticCapture({ panel: { append: (...elements) => nodes.push(...elements) },
    endpoint: '/api/player/evidence?player=A', auto, target,
    crypto: { subtle: { digest: async (_algorithm, bytes) => createHash('sha256').update(bytes).digest() } }, now: () => time,
    ready: () => ready, trace: () => '{"version":2,"events":[]}', witness: () => '{"version":1,"resources":[]}', note: message => notes.push(message),
    setTimer: callback => { timers.set(++next, callback); return next; }, clearTimer: id => timers.delete(id),
    fetch: async (address, options) => { saved.push({ address, raw: options.body }); return new Response(JSON.stringify({ version: 1, player: 'A',
      kind: new URL(address).searchParams.get('kind'), file: `A-${new URL(address).searchParams.get('kind')}-1234.json`,
      bytes: Buffer.byteLength(options.body), sha256: createHash('sha256').update(options.body).digest('hex') }), { status }); } });
  return { capture, target, document, nodes, saved, notes, ready: value => { ready = value; },
    async advance(value) { time = value; const [id, callback] = timers.entries().next().value ?? []; if (callback) { timers.delete(id); callback(); }
      for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); } };
}
test('private diagnostic capture observes once for 5s after readiness without issuing input', async () => {
  const f = fixture(); await f.advance(1000); assert.equal(f.saved.length, 0); assert.match(f.nodes[0].textContent, /waiting/);
  f.ready(true); await f.advance(2000); assert.equal(f.capture.snapshot().phase, 'capturing');
  await f.advance(6999); assert.equal(f.saved.length, 0); await f.advance(7000);
  assert.equal(f.capture.snapshot().phase, 'completed-observation'); assert.equal(f.saved.length, 2);
  assert.equal(f.saved[0].raw, '{"version":2,"events":[]}'); assert.equal(f.saved[1].raw, '{"version":1,"resources":[]}');
  assert.match(f.nodes[0].textContent, /SHA256/); await f.advance(9000); assert.equal(f.saved.length, 2);
  f.capture.destroy();
});
test('private diagnostic capture cancels and preserves raw on blur or hidden, while ordinary mode stays manual', async () => {
  for (const reason of ['blur', 'hidden', 'stop']) {
    const f = fixture(); f.ready(true); await f.advance(0);
    if (reason === 'blur') f.target.dispatchEvent(new Event('blur'));
    else if (reason === 'hidden') { f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange')); }
    else f.nodes[1].dispatchEvent(new Event('click'));
    await f.advance(100); assert.match(f.capture.snapshot().phase, /cancelled/); assert.equal(f.saved.length, 2); f.capture.destroy();
  }
  const ordinary = fixture(false); ordinary.ready(true); await ordinary.advance(10000); assert.equal(ordinary.saved.length, 0); ordinary.capture.destroy();
});
test('private diagnostic capture keeps save failures visible instead of claiming receipt success', async () => {
  const f = fixture(true, 500); f.ready(true); await f.advance(0); await f.advance(5000);
  assert.equal(f.saved.length, 2); assert.equal(f.capture.snapshot().receipts.length, 0);
  assert.match(f.nodes[0].textContent, /ERROR diagnostic_save_http_500/); f.capture.destroy();
});
