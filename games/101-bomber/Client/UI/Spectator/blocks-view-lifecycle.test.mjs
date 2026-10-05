import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./blocks-view.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');

function fixture(createScene) {
  const listeners = [];
  const target = () => ({ addEventListener(event, handler, options) { listeners.push({ event, handler, options }); } });
  const window = { ...target(), devicePixelRatio: 1 };
  const canvas = { ...target(), clientWidth: 800, clientHeight: 600 };
  let destroyed = 0;
  const scene = { renderer: { submitMesh() { return {}; } }, camera: { position: [0, 0, 0], forward: () => [0, 0, -1] }, destroy() { destroyed++; } };
  const context = vm.createContext({ window, performance, AbortController, TextDecoder, QUAD_BYTES: 16, console, requestAnimationFrame() {},
    createBlockScene: createScene ?? (async () => scene) });
  vm.runInContext(source, context);
  const args = { grid: { wasm: { exports: {}, world: new Uint8Array(32) }, sectionRevision() {} }, canvas,
    mapBounds: { minX: 0, maxX: 19, minZ: 0, maxZ: 19 }, assetRoot: '/', signal: new AbortController().signal, isWorldAlive: () => true };
  return { context, window, listeners, args, destroyed: () => destroyed, create: () => context.createBlocksView(args) };
}

test('failed scene creation leaves no window or canvas listeners behind', async () => {
  const error = new Error('actual-create-failure');
  const f = fixture(async args => { assert.equal(args.signal, f.args.signal); assert.equal(args.isWorldAlive, f.args.isWorldAlive); throw error; });
  await assert.rejects(f.create(), value => value === error);
  assert.equal(f.listeners.length, 0);
  assert.equal(f.window.__lumioBlocks, undefined);
});

test('destroying a view retires all of its listeners and evidence exactly once', async () => {
  const f = fixture();
  const view = await f.create();
  assert.equal(f.window.__lumioBlocks, view);
  assert.deepEqual(f.listeners.map(x => x.event), ['resize', 'pointerdown', 'pointerup', 'pointermove', 'contextmenu', 'wheel', 'keydown']);
  assert.ok(f.listeners.every(x => x.options.signal.aborted === false));
  view.destroy(); view.destroy();
  assert.ok(f.listeners.every(x => x.options.signal.aborted));
  assert.equal(f.window.__lumioBlocks, undefined);
  assert.equal(f.destroyed(), 1);
});
