// Game composition tests. Transport parsing/retry/authorization are exercised by
// the released Client suites and real browser acceptance, never reimplemented here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPlayerIntentControls } from './player-intent-controls.mjs';
import { createMovementTrace } from './movement-trace.mjs';
import { analyzeMovementTrace } from '../../../Tools/movement-trace-analyze.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(process.env.LUMIO_ENGINE_CANDIDATE_ROOT || path.join(ROOT, 'Engine'), 'web');
const voxel = await import(pathToFileURL(path.join(WEB, 'voxel-grid.mjs')));
const replica = await import(pathToFileURL(path.join(WEB, 'replica-voxel-grid.mjs')));
const MAIN_SOURCE = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
test('private movement diagnostic layout requires the exact scene and trace on a permitted player page', async () => {
  const flags = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function readMovementFlags()'), MAIN_SOURCE.indexOf('async function initializeResourceWitness()'));
  const initialize = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('async function initializePage()'), MAIN_SOURCE.indexOf('    inputDriver = flags.inputDriver;')) + '\n  }\n}';
  for (const [search, hostname, playerMode, expected] of [
    ['?scene=movement-sync-preview&trace=movement', '127.0.0.1', true, true],
    ['?scene=movement-sync-preview', '127.0.0.1', true, false],
    ['?scene=ordinary&trace=movement', '127.0.0.1', true, false],
    ['?scene=movement-sync-preview&trace=movement', 'game.example', true, false],
    ['', '127.0.0.1', true, false],
    ['?scene=movement-sync-preview&trace=movement', '127.0.0.1', false, false],
  ]) {
    const classes = new Set(), node = {};
    const context = vm.createContext({ PLAYER_MODE: playerMode, URLSearchParams,
      location: { search, hostname }, LOOPBACK_HOSTS: ['127.0.0.1', 'localhost', '[::1]'],
      window: { __lumioPlayerConfig: {} }, canvas: {}, initializeResourceWitness: async () => {},
      document: { body: { classList: { add: name => classes.add(name) } },
        getElementById: () => node, querySelector: () => node } });
    vm.runInContext(flags + initialize, context);
    await context.initializePage();
    assert.equal(classes.has('movement-private-preview'), expected, `${hostname}${search} player=${playerMode}`);
  }
});
test('private diagnostic auto capture requires its explicit URL opt-in', async () => {
  const flags = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function readMovementFlags()'), MAIN_SOURCE.indexOf('async function initializeResourceWitness()'));
  const initialize = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('async function initializePage()'), MAIN_SOURCE.indexOf('    inputDriver = flags.inputDriver;')) + '\n  }\n}';
  for (const [search, expected] of [
    ['?scene=movement-sync-preview&trace=movement&capture=diagnostic', true],
    ['?scene=movement-sync-preview&trace=movement', false],
    ['?scene=movement-sync-preview&capture=diagnostic', false],
    ['?scene=ordinary&trace=movement&capture=diagnostic', false],
    ['?scene=movement-sync-preview&trace=movement&capture=diagnostic&capture=diagnostic', false],
  ]) {
    const classes = new Set(), node = {};
    const context = vm.createContext({ PLAYER_MODE: true, URLSearchParams,
      location: { search, hostname: '127.0.0.1' }, LOOPBACK_HOSTS: ['127.0.0.1'],
      window: { __lumioPlayerConfig: {} }, canvas: {}, initializeResourceWitness: async () => {},
      document: { body: { classList: { add: name => classes.add(name) } }, getElementById: () => node, querySelector: () => node } });
    vm.runInContext(flags + initialize, context); await context.initializePage();
    assert.equal(classes.has('movement-diagnostic-capture'), expected, search);
  }
});
test('private diagnostic readiness respects the existing DOM UI focus gate', () => {
  const start = MAIN_SOURCE.indexOf('privateDiagnosticCapture = createPrivateDiagnosticCapture(');
  const setup = MAIN_SOURCE.slice(start, MAIN_SOURCE.indexOf("        window.addEventListener('pagehide', () => privateDiagnosticCapture.destroy()", start));
  const focused = { closest: () => true };
  const sandbox = { panel: {}, window: { __lumioPlayerConfig: { evidenceEndpoint: '/api/player/evidence?player=A' } },
    diagnosticAuto: true, active: true, terminal: false, initialSelectionPending: false, player: { replica: { inputOpen: true } },
    gameView: { inputBlocked: () => false }, inputDriver: 'interval', stepInputReady: true,
    document: { activeElement: focused, getElementById: () => ({ contains: () => false }) },
    createPrivateDiagnosticCapture: options => { sandbox.options = options; return {}; } };
  vm.runInNewContext(setup, sandbox); assert.equal(sandbox.options.ready(), false);
  sandbox.document.getElementById = () => ({ contains: () => true }); assert.equal(sandbox.options.ready(), true);
  sandbox.inputDriver = 'step'; sandbox.stepInputReady = false; assert.equal(sandbox.options.ready(), false);
});
const CREDENTIAL = 'test-admission-credential-do-not-leak';
test('closed input keeps private record and export buttons available in the real applyDump integration', () => {
  const direction = {disabled:false}, record = {disabled:false}, exp = {disabled:false}, identity = {disabled:false};
  const sandbox = { PLAYER_MODE:true, active:false, GAME_VIEW:false, player:{replica:null},
    spectator:{positions:[]}, parseDump:()=>[],paint(){},commitInitialSelection(){},
    csharp:{playerState:()=>'{"inputOpen":false}'},
    document:{getElementById:()=>null,querySelectorAll:selector=>selector.includes(':not')?[direction]:[direction,record,exp,identity]} };
  const context = vm.createContext(sandbox);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function applyDump(raw)'),MAIN_SOURCE.indexOf('function updateGamePresentation()')),context);
  assert.equal(sandbox.applyDump('[]'),true); assert.equal(direction.disabled,true);
  assert.equal(record.disabled,false); assert.equal(exp.disabled,false); assert.equal(identity.disabled,false);
});
const LAUNCH = { wsUrl: 'wss://edge.example/play/session-abc', subprotocol: 'lumio.successor-binding-receipts-parts.v1', admissionCredential: CREDENTIAL, roomId: 'room-from-platform' };
const settle = async predicate => { for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'asynchronous composition settled'); };
const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
async function runPage(options = {}) {
  const rendered = [], logged = [], fetchCalls = [], admissions = [], handles = [], sockets = [], timers = new Map();
  const clock = options.clock ?? { value: 0 };
  const runtime = { state: 'synchronizing', handle: new Uint8Array(32).fill(1), dump: '[]', ticks: 0, closes: 0, reads: 0, ...options.runtime };
  let timerId = 0;
  const ctx = { fillStyle: '', strokeStyle: '', clearRect() { rendered.push('clear'); }, beginPath() {},
    arc(x,y,r) { rendered.push(`arc:${x},${y},${r}`); }, fill() { rendered.push(`fill:${this.fillStyle}`); }, stroke() { rendered.push(`stroke:${this.strokeStyle}`); },
    strokeRect() {}, fillRect() { rendered.push(`rect:${this.fillStyle}`); } };
  const status = { textContent: '' }, legend = { innerHTML: '' }, enter = { hidden: false, addEventListener() {} };
  const exports = {
    ConfigureConfig(value) { runtime.configurations ??= []; runtime.configurations.push(value); if (options.configError) throw new Error(options.configError); },
    ConfigureInputMode(mode, trace) { runtime.inputModes ??= []; runtime.inputModes.push({ mode, trace }); },
    async Boot(...args) { admissions.push(args); await options.bootWait; if (options.bootError) throw new Error(options.bootError); },
    async Close() { runtime.closes++; await options.closeWait; },
    Tick() { runtime.ticks++; if (runtime.tickError) throw new Error(runtime.tickError); },
    TickRateHz() { return 30; }, SessionState() { return JSON.stringify({ state: runtime.state, notServingCloses: runtime.notServingCloses ?? 0, lastError: runtime.error ?? '', sentInputs: 0 }); },
    ConnectionState() { return runtime.state; }, LastApplyError() { return runtime.error ?? ''; },
    WorldHandleBytes() { return runtime.handle; },
    ReadBox(minX,minY,minZ,maxX,maxY,maxZ) { runtime.reads++; return JSON.stringify({ cells: Array.from({ length:(maxX-minX+1)*(maxY-minY+1)*(maxZ-minZ+1) },()=>({hasBlockId:runtime.known ?? false,blockId:0,presence:runtime.known ? 'Ready':'Unavailable'})), sections: runtime.sections ?? [] }); },
    DumpPositions() { return runtime.dump; }, MapDimensions() { return JSON.stringify(options.dimensions ?? { width:19,depth:19 }); },
    WorldInstanceId() { return '0000000000000001'; }, PresentationState() { return '{}'; }, SelectionConfig() { return '{}'; },
    ...options.exports,
  };
  const sandbox = { ...voxel, ...replica, console: Object.fromEntries(['log','error','warn','info'].map(k=>[k,(...args)=>logged.push(args.map(String).join(' '))])),
    location: { search:options.search ?? '', pathname:options.pathname ?? '/games/bomber/', hostname:options.hostname ?? '127.0.0.1', protocol:options.protocol ?? 'http:', href:'http://127.0.0.1/games/bomber/' },
    document: { body:{classList:{add(){},remove(){}}}, getElementById(id) { return options.game?.nodes.get(id) ?? ({ status,legend,enter,blocks:options.blocks ? {} : null,field:{width:640,height:480,getContext:()=>ctx} })[id] ?? null; } },
    URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Date,Math,JSON,Number,String,AbortController,
    performance: { now: () => clock.value },
    setTimeout(callback, delay) { const id=++timerId; timers.set(id,{callback,delay}); return id; }, clearTimeout(id) { timers.delete(id); },
    WebSocket: class { constructor() { sockets.push(this); throw new Error('Game must not construct WebSocket'); } },
    async fetch(url,init) {
      if (String(url).endsWith('/api/game/config')) return options.configResponse
        ?? { ok:true, text:async()=> options.configWait ? await options.configWait : '{"files":{}}' };
      if (String(url).endsWith('official-catalog.json')) return options.catalog ?? { ok:true,text:async()=>fs.readFileSync(path.join(ROOT,'Server/Assets/Maps/official-catalog.json'),'utf8') };
      fetchCalls.push({ url:String(url),init });
      if (String(url).endsWith('/me')) return { ok:true,headers:{ get:()=> 'test-csrf' } };
      return { ok:true,json:async()=>options.launchWait ? await options.launchWait : options.launch ?? LAUNCH };
    },
    __lumioExports: exports,
    __lumioEngine:{ createVoxelPresentation(handle) { handles.push(Array.from(handle)); return {}; } },
    importBlocks: async()=>({createBlocksView:async args=>{options.blocks?.push({kind:'create',args});await options.blocksWait;args.signal?.throwIfAborted();return {destroy(){options.blocks?.push({kind:'destroy'});}};}}),
  };
  if (options.injectLaunch !== false) sandbox.__lumioLaunch=options.launch ?? LAUNCH;
  const context=vm.createContext(sandbox); vm.runInContext('window=globalThis;',context);
  if (options.game) { Object.assign(sandbox, options.game.bindings); sandbox.importGameView = () => options.game.import(context); }
  const source=MAIN_SOURCE.replace(/^import [\s\S]*? from ["'][^"']+["'];\s*/gm,'').replace('import("./blocks-view.mjs")','globalThis.importBlocks()');
  const pageSource = options.game ? source.replace("import('./game-view.mjs')", 'globalThis.importGameView()') : source;
  vm.runInContext(pageSource,context);
  await drain();
  return { runtime,admissions,sockets,rendered,logged,fetchCalls,handles,timers,win:sandbox,spectator:sandbox.__lumioSpectator,legend,enter,
    evalInPage:code=>vm.runInContext(code,context),
    async tick(lateBy = 0) { const next=timers.entries().next().value; if(next) { timers.delete(next[0]);clock.value += next[1].delay + lateBy;next[1].callback(); } await drain(); } };
}

test('pump work fits inside the selected period', async () => {
  const clock = { value: 0 };
  const p = await runPage({ clock, exports: { Tick() { clock.value += 20; } } });
  const scheduled = [...p.timers.values()][0];
  assert.ok(Math.abs(scheduled.delay - (1000 / 30 - 20)) < 0.001);
});

test('successive pump callbacks retain the selected cadence despite varying work', async () => {
  const clock = { value: 0 }, starts = [], costs = [20, 4, 25, 15, 8];
  const p = await runPage({ clock, exports: { Tick() {
    starts.push(clock.value);
    clock.value += costs[starts.length - 1];
  } } });
  for (let i = 1; i < costs.length; i++) await p.tick();
  assert.equal(starts.length, costs.length);
  for (let i = 0; i < starts.length; i++) assert.ok(Math.abs(starts[i] - i * (1000 / 30)) < 0.001);
});

test('a pump callback 155 ms late yields immediately without catch-up simulation', async () => {
  const clock = { value: 0 }, starts = [];
  const period = 1000 / 30;
  const p = await runPage({ clock, exports: { Tick() { starts.push(clock.value); clock.value += 20; } } });
  await p.tick(155);
  assert.equal(starts.length, 2, 'one callback must never perform catch-up simulation');
  assert.equal(p.timers.size, 1);
  assert.equal([...p.timers.values()][0].delay, 0);
  await p.tick();
  assert.equal(starts.length, 3, 'the yielded callback still performs only one Tick');
  assert.equal(p.timers.size, 1);
  assert.ok(Math.abs([...p.timers.values()][0].delay - (period - 20)) < 0.001);
});

test('work longer than the selected period yields once and then recovers its cadence', async () => {
  const clock = { value: 0 }, starts = [], period = 1000 / 30;
  const p = await runPage({ clock, exports: { Tick() {
    starts.push(clock.value);
    clock.value += starts.length === 1 ? 20 : starts.length === 2 ? 90 : 4;
  } } });
  await p.tick();
  assert.equal(starts.length, 2);
  assert.equal(p.timers.size, 1);
  assert.equal([...p.timers.values()][0].delay, 0);
  await p.tick();
  assert.equal(starts.length, 3, 'no synchronous catch-up loop');
  assert.equal(p.timers.size, 1);
  assert.ok(Math.abs([...p.timers.values()][0].delay - (period - 4)) < 0.001);
  await p.tick();
  assert.equal(starts.length, 4);
  assert.ok(Math.abs(starts[3] - starts[2] - period) < 0.001);
});

for (const workMs of [50, 51]) test(`a whole pump taking ${workMs} ms yields without another idle period`, async () => {
  const clock = { value: 0 }, starts = [];
  const p = await runPage({ clock, exports: {
    TickRateHz() { return 20; },
    Tick() { starts.push(clock.value); clock.value += 35; },
    DumpPositions() { clock.value += workMs - 35; return '[]'; },
  } });
  assert.equal(clock.value, workMs);
  assert.equal(starts.length, 1);
  assert.equal(p.timers.size, 1);
  assert.equal([...p.timers.values()][0].delay, 0);
});

test('a callback from a closed attempt cannot Tick or schedule another callback', async () => {
  const p = await runPage();
  const pending = [...p.timers.values()][0];
  await p.evalInPage("finish('closed')");
  pending.callback(); await drain();
  assert.equal(p.runtime.ticks, 1);
  assert.equal(p.timers.size, 0);
});

test('a new attempt resets its deadline and the superseded callback stays retired', async () => {
  const clock = { value: 0 }, starts = [];
  const p = await runPage({ clock, exports: { Tick() { starts.push(clock.value); clock.value += 20; } } });
  const superseded = [...p.timers.values()][0];
  clock.value = 1000;
  await p.evalInPage('start()');
  superseded.callback(); await drain();
  assert.deepEqual(starts, [0, 1000]);
  assert.equal(p.timers.size, 1);
  const scheduled = [...p.timers.values()][0];
  assert.ok(Math.abs(scheduled.delay - (1000 / 30 - 20)) < 0.001);
});

test('formal browser delegates full authenticated launch and catalog to one ClientSession', async()=>{
  const p=await runPage(); assert.equal(p.admissions.length,1); assert.deepEqual(JSON.parse(p.admissions[0][0]),LAUNCH);
  assert.equal(p.admissions[0][2],true); assert.ok(p.admissions[0][1].length>100); assert.equal(p.sockets.length,0); assert.equal(p.runtime.ticks,1);
});

test('selected configuration completes before admission and is retained across reconnect attempts', async () => {
  let ready;
  const p = await runPage({ configWait: new Promise(resolve => ready = resolve) });
  assert.equal(p.admissions.length, 0);
  assert.equal(p.runtime.configurations?.length ?? 0, 0);
  ready('{"files":{"selected":"original-bytes"}}');
  await settle(() => p.admissions.length === 1);
  assert.deepEqual(p.runtime.configurations, ['{"files":{"selected":"original-bytes"}}']);
  await p.evalInPage('start()');
  assert.equal(p.admissions.length, 2);
  assert.equal(p.runtime.configurations.length, 1);
});

test('a rejected selected configuration never falls back to the embedded export or launches', async () => {
  const p = await runPage({ configError: 'config_table_package_fingerprint_mismatch' });
  assert.equal(p.admissions.length, 0);
  assert.equal(p.spectator.status, 'failed');
  assert.match(p.spectator.lastError, /config_table_package_fingerprint_mismatch/);
});

test('closing during selected configuration loading prevents late configure and admission', async () => {
  let ready;
  const p = await runPage({ configWait: new Promise(resolve => ready = resolve) });
  await p.evalInPage("finish('closed')");
  ready('{"files":{}}'); await drain();
  assert.equal(p.runtime.configurations?.length ?? 0, 0);
  assert.equal(p.admissions.length, 0);
});

test('block view starts after the first actual map and owns only one asynchronous creation',async()=>{
  const blocks=[];let resolve;const blocksWait=new Promise(r=>resolve=r);
  const p=await runPage({search:'?view=blocks',blocks,blocksWait});
  assert.equal(blocks.length,1);assert.equal(blocks[0].args.mapBounds.maxX,19);
  await p.tick();await p.tick();assert.equal(blocks.length,1);
  resolve();await drain();await p.evalInPage("finish('closed')");assert.equal(blocks.filter(x=>x.kind==='destroy').length,1);
});

test('closing while assets load cancels that view and does not report expected cancellation as an error',async()=>{
  const blocks=[];let resolve;const blocksWait=new Promise(r=>resolve=r);
  const p=await runPage({search:'?view=blocks',blocks,blocksWait});
  await p.evalInPage("finish('closed')");
  assert.equal(blocks[0].args.signal.aborted,true);
  resolve();await drain();
  assert.equal(blocks.filter(x=>x.kind==='destroy').length,0);
  assert.equal(p.logged.some(line=>line.includes('block view failed')),false);
});

test('renderer lifetime queries the current full Session handle rather than its display cache',async()=>{
  const blocks=[];const p=await runPage({search:'?view=blocks',blocks});
  assert.equal(blocks[0].args.isWorldAlive(),true);
  p.runtime.handle[31]=2;
  assert.equal(blocks[0].args.isWorldAlive(),false);
  await p.tick();
  assert.equal(blocks.filter(x=>x.kind==='create')[1].args.isWorldAlive(),true);
});
test('pre-admission waits for a real replica world without querying fabricated map dimensions',async()=>{
  const p=await runPage({runtime:{handle:[],state:'negotiating'},exports:{MapDimensions(){throw new Error('world_not_admitted');}}});
  assert.equal(p.spectator.status,'negotiating');assert.equal(p.runtime.closes,0);assert.equal(p.handles.length,0);
});
for(const hostname of ['localhost','127.0.0.1','[::1]','play.example']) test(`loopback admission permission follows page origin ${hostname}`,async()=>{
  const p=await runPage({hostname,search:'?allowLoopback=1'}); assert.equal(p.admissions[0][2],hostname!=='play.example');assert.equal(p.sockets.length,0);
});
test('exact selected profile and room survive the product boundary',async()=>{
  for(const subprotocol of ['lumio.successor-binding.v1','lumio.successor-binding-receipts.v1','lumio.successor-binding-parts.v1','lumio.successor-binding-receipts-parts.v1']){
    const p=await runPage({launch:{...LAUNCH,subprotocol}});assert.equal(JSON.parse(p.admissions[0][0]).subprotocol,subprotocol);assert.equal(JSON.parse(p.admissions[0][0]).roomId,LAUNCH.roomId);
  }
});
test('credential stays outside evidence, console, URL and DOM',async()=>{
  const p=await runPage();for(const value of [p.spectator,p.rendered,p.logged,p.win.location,p.legend])assert.equal(JSON.stringify(value).includes(CREDENTIAL),false);
});
test('same full world handle is reused and a changed registry identity rebuilds the view',async()=>{
  const p=await runPage(); await p.tick();assert.equal(p.handles.length,1);p.runtime.handle[31]=2;await p.tick();assert.equal(p.handles.length,2);assert.equal(p.handles[1][31],2);
});
test('actual read-only adapter retains unknown cells as loading, with one native box read per paint',async()=>{
  const p=await runPage();assert.equal(p.runtime.reads,1);assert.equal(p.spectator.voxel.cells.loading,361);assert.equal(p.spectator.voxel.cells.air,0);
  p.runtime.known=true;await p.tick();assert.equal(p.runtime.reads,2);assert.equal(p.spectator.voxel.cells.air,361);
});
test('formal presentation retains replica positions without reading its hidden classic canvas',async()=>{
  const dump=JSON.stringify([{id:'self',x:1.5,z:1.5,self:true,type:'player'}]);
  const p=await runPage({search:'?view=game',runtime:{dump,known:true}});
  assert.equal(p.spectator.selfId,'self');assert.equal(p.spectator.positions.length,1);
  assert.equal(p.runtime.reads,0,'only the visible formal GameView may request terrain');
  assert.deepEqual(p.rendered,[],'the CSS-hidden classic canvas must not be repainted');
  await p.tick();assert.equal(p.runtime.reads,0);
});
test('full-width section revisions remain strings in the display adapter',async()=>{
  const p=await runPage({runtime:{sections:[{x:0,y:0,z:0,presence:'Ready',revision:'18446744073709551615'}]}});
  assert.equal(p.evalInPage("voxelGrid.sectionRevision('0:0:0')"),'18446744073709551615');
});
test('released world invalidates display observations and paints loading',async()=>{
  const p=await runPage({runtime:{known:true}});p.runtime.handle=[];await p.tick();assert.equal(p.spectator.voxel.status,'closed');assert.equal(p.spectator.voxel.cells.air,0);assert.equal(p.spectator.voxel.cells.loading,361);
});
test('close retires display before requesting Session close',async()=>{
  const p=await runPage();await p.evalInPage("finish('closed')");assert.equal(p.runtime.closes,1);assert.equal(p.spectator.voxel.status,'closed');assert.equal(p.timers.size,0);assert.equal(p.evalInPage('voxelGrid.wasm'),null);
});
test('new start waits for previous Session cleanup',async()=>{
  let release;const closeWait=new Promise(resolve=>release=resolve);const p=await runPage({closeWait});const start=p.evalInPage('start()');await drain();assert.equal(p.admissions.length,1);release();await start;assert.equal(p.admissions.length,2);
});

test('cancel during previous cleanup cannot resurrect the canceled start',async()=>{
  let release;const closeWait=new Promise(resolve=>release=resolve);const p=await runPage({closeWait});
  const starting=p.evalInPage('start()');await drain();
  const cancelled=p.evalInPage("finish('closed')");release();await Promise.all([starting,cancelled]);
  assert.equal(p.admissions.length,1);assert.equal(p.spectator.status,'closed');
});

test('restart waits for in-flight boot then closes it before another boot',async()=>{
  let release;const bootWait=new Promise(resolve=>release=resolve);const p=await runPage({bootWait});
  assert.equal(p.admissions.length,1);
  const restarting=p.evalInPage('start()');await drain();
  assert.equal(p.runtime.closes,0,'boot and close cannot own the same static managed session concurrently');
  assert.equal(p.admissions.length,1);
  release();await restarting;await drain();
  assert.equal(p.runtime.closes,1);assert.equal(p.admissions.length,2);
  assert.equal(p.evalInPage('runtimeClosed'),false);
});

test('failed cleanup retains a retryable owner and reports failure before new admission',async()=>{
  let closes=0;const p=await runPage({exports:{async Close(){if(++closes===1)throw new Error('cleanup_pending');}}});
  await p.evalInPage('start()');await drain();
  assert.equal(p.admissions.length,1);assert.equal(p.spectator.status,'failed');
  assert.match(p.spectator.lastError,/cleanup_pending/);
  await p.evalInPage('start()');await drain();
  assert.equal(p.admissions.length,2);assert.ok(closes>=2);
});
for(const state of ['faulted','closed','superseded']) test(`Session ${state} closes display without creating another connection`,async()=>{
  const p=await runPage();p.runtime.state=state;p.runtime.error=state==='faulted'?'bad_envelope':'';await p.tick();assert.equal(p.runtime.closes,1);assert.equal(p.spectator.status,state==='faulted'?'failed':state);assert.equal(p.fetchCalls.length,0);assert.equal(p.sockets.length,0);
});
for(const state of ['connecting','negotiating','synchronizing','active','resyncing','reconnecting']) test(`Session state ${state} drives readiness without Game transport policy`,async()=>{
  const p=await runPage({runtime:{state}});assert.equal(p.spectator.status,state);assert.equal(p.evalInPage('active'),state==='active');assert.equal(p.admissions.length,1);
});
test('not_serving evidence comes from the Session retry owner',async()=>{
  const p=await runPage({runtime:{state:'reconnecting',notServingCloses:4}});assert.equal(p.spectator.notServingCloses,4);assert.equal(p.fetchCalls.length,0);assert.equal(p.admissions.length,1);
});
test('owner Tick error closes and preserves its diagnostic',async()=>{
  const p=await runPage();p.runtime.tickError='authority_apply_failed';await p.tick();assert.equal(p.spectator.status,'failed');assert.match(p.spectator.lastError,/authority_apply_failed/);assert.equal(p.runtime.closes,1);
});

test('full presentation exposes retry only after a terminal failure or close',async()=>{
  const p=await runPage({search:'?view=game',runtime:{handle:[],state:'negotiating'}});
  assert.equal(p.enter.hidden,true);
  p.runtime.state='faulted';p.runtime.error='admission_unavailable';await p.tick();
  assert.equal(p.enter.hidden,false);
  p.runtime.state='negotiating';await p.evalInPage('start()');
  assert.equal(p.enter.hidden,true);
  await p.evalInPage("finish('closed')");assert.equal(p.enter.hidden,false);
});
test('missing required Session exports fails before boot',async()=>{
  const p=await runPage({exports:{Tick:undefined}});assert.equal(p.admissions.length,0);assert.equal(p.spectator.status,'failed');assert.match(p.spectator.lastError,/Tick missing/);
});
test('Platform launch uses page-derived slug and CSRF',async()=>{
  const p=await runPage({injectLaunch:false,pathname:'/games/other-101/index.html'});assert.deepEqual(p.fetchCalls.map(f=>f.url),['/api/account/me','/api/games/other-101/launch']);assert.equal(p.fetchCalls[1].init.headers['X-CSRF-Token'],'test-csrf');assert.equal(p.admissions.length,1);
});
test('unresolved page game never guesses a Platform launch target',async()=>{
  const p=await runPage({injectLaunch:false,pathname:'/index.html'});assert.equal(p.fetchCalls.length,0);assert.equal(p.admissions.length,0);assert.match(p.spectator.lastError,/game_slug_unresolved/);
});
test('late canceled launch cannot boot another Session',async()=>{
  let release;const launchWait=new Promise(resolve=>release=resolve);const p=await runPage({injectLaunch:false,launchWait});await p.evalInPage("finish('closed')");release(LAUNCH);await drain();assert.equal(p.admissions.length,0);
});
test('cancel aborts the actual pending launch request as well as refusing its late result',async()=>{
  let release;const launchWait=new Promise(resolve=>release=resolve);const p=await runPage({injectLaunch:false,launchWait});
  const request=p.fetchCalls.find(call=>call.url.endsWith('/launch'));
  assert.ok(request.init.signal,'launch request must carry its attempt cancellation');
  assert.equal(request.init.signal.aborted,false);
  await p.evalInPage("finish('closed')");
  assert.equal(request.init.signal.aborted,true);
  release(LAUNCH);await drain();assert.equal(p.admissions.length,0);
});
test('missing catalog fails before creating a world or reporting air',async()=>{
  const p=await runPage({catalog:{ok:false,status:404}});assert.equal(p.admissions.length,0);assert.equal(p.spectator.status,'failed');assert.equal(p.spectator.voxel.cells.air,0);
});
test('typed dump identities and self evidence come only from the replica dump',async()=>{
  const p=await runPage({runtime:{dump:JSON.stringify([{id:'self',x:1,z:2,self:true,type:'player',characterName:'rabbit'},{id:'block',x:3,z:4,type:'terrain-solid'}])}});
  assert.equal(p.spectator.selfId,'self');assert.equal(p.spectator.positions[0].characterName,'rabbit');assert.equal(p.spectator.positions[1].type,'terrain-solid');assert.equal(p.spectator.worldId,'0000000000000001');
});
test('configured map camera keeps all one hundred player dots inside canvas',async()=>{
  const dump=Array.from({length:100},(_,i)=>({id:`id-${i}`,x:1+(i%10)*1.7,z:1+Math.floor(i/10)*1.7}));
  const p=await runPage({runtime:{dump:JSON.stringify(dump)}});assert.equal(p.spectator.botCount,100);
  const arcs=p.rendered.slice(p.rendered.lastIndexOf('clear')+1).filter(v=>v.startsWith('arc:'));assert.equal(arcs.length,100);
  for(const arc of arcs){const [x,y]=arc.slice(4).split(',').map(Number);assert.ok(x>=0&&x<=640&&y>=0&&y<=480);}
});
test('invalid map dimensions fail visibly instead of concealing a malformed config',async()=>{
  const p=await runPage({dimensions:{width:0,depth:19}});assert.equal(p.spectator.status,'failed');assert.match(p.spectator.lastError,/dimensions_invalid/);
});
test('a bad display dump stays visible as an error while Session retains authority ownership',async()=>{
  const p=await runPage({runtime:{dump:'{invalid'}});assert.equal(p.spectator.status,'error');assert.equal(p.runtime.closes,0);
  assert.equal(p.sockets.length,0);assert.equal(p.timers.size,1);assert.match(p.spectator.lastError,/dump failed/);
});
test('Game page contains neither authority parsing, transport retry nor a second voxel world',()=>{
  const code=MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/^\s*\/\/.*$/gm,' ');
  assert.doesNotMatch(code,/connectDs|new WebSocket|\.onFrame|\.onBytes|\.deliver\(|world_create|retryNotServing|\.localPosition|messageType/);
  assert.doesNotMatch(code,/params\.get\(["']allowLoopback/);assert.doesNotMatch(code,/\/api\/games\/[A-Za-z0-9]/);
});

test('managed trace drains only after the synchronous Tick with a pump observation bracket', async () => {
  const calls = [], clock = { value: 0 };
  const p = await runPage({ clock, exports: {
    Tick() { calls.push('tick'); clock.value += 20; },
    DrainInputTrace() { calls.push('drain'); return JSON.stringify([{ version: 1, enabled: true, events: [] }]); },
  } });
  p.evalInPage(`globalThis.__traceBatches=[]; movementTrace={
    managed(batch, bracket){__traceBatches.push({batch,bracket})}, pump(){}, note(){}
  }`);
  await p.tick();
  assert.deepEqual(calls.slice(-2), ['tick', 'drain']);
  const receipt = JSON.parse(p.evalInPage('JSON.stringify(__traceBatches)'));
  assert.equal(receipt.length, 1);
  assert.equal(receipt[0].batch.enabled, true);
  assert.equal(receipt[0].bracket.endedAt - receipt[0].bracket.startedAt, 20);
});

test('managed final trace drains after Close before the client reference is lost', async () => {
  const order = [];
  const p = await runPage({ exports: {
    async Close() { order.push('close'); },
    DrainInputTrace() { order.push('drain'); return JSON.stringify([{ version: 1, enabled: true,
      events: [{ k: 'accepted', sequence: '7' }] }]); },
  } });
  p.evalInPage(`globalThis.__finalTrace=[]; movementTrace={
    managed(batch, bracket){__finalTrace.push({batch,bracket})}, pump(){}, note(){}
  }`);
  await p.evalInPage("finish('closed')");
  assert.deepEqual(order, ['close', 'drain']);
  const receipt = JSON.parse(p.evalInPage('JSON.stringify(__finalTrace)'));
  assert.equal(receipt[0].batch.events[0].sequence, '7');
  assert.equal(receipt[0].bracket, null);
});

test('one failed managed drain makes a joined recording incomplete even after a later valid batch', async () => {
  const clock = { value: 0 };
  const first = { hostLifetime: 'host-a', clockFrequency: '1000', complete: true, pending: 0,
    eventLoss: '0', pendingLoss: '0', unmatched: '0', diagnosticFailures: '0', events: [
      { k: 'sample', sampleId: '1', primary: 2, stamp: '1' },
      { k: 'request', sampleId: '1', ability: 'MoveAbility', sender: 'self', wireGeneration: '9', sequence: '7', stamp: '2' },
      { k: 'accepted', sampleId: '1', sender: 'self', wireGeneration: '9', sequence: '7', stamp: '3', encodedLength: 3, encodedSha256: 'abc' },
    ] };
  let drains = 0;
  const p = await runPage({ clock, exports: { DrainInputTrace() {
    drains++;
    if (drains === 2) throw new Error('actual drain failure');
    return JSON.stringify([drains === 1 ? first : { ...first, events: [] }]);
  } } });
  const trace = createMovementTrace({ now: () => clock.value, doc: { visibilityState: 'visible' } });
  p.win.__actualTrace = trace;
  p.evalInPage('movementTrace = __actualTrace');
  await p.tick(); await p.tick(); await p.tick();
  assert.equal(drains, 3);
  const exported = trace.export();
  assert.equal(exported.events.filter(e => e.k === 'managedTrace').length, 2);
  assert.ok(exported.diagnosticFailures > 0, 'the failed drain must survive later valid batches');
  const summary = analyzeMovementTrace(exported);
  assert.equal(summary.correlation.incompleteManaged, false, 'the gap is a JS drain failure, not a managed batch loss');
  assert.equal(summary.correlation.diagnosticFailures, 1);
  assert.equal(summary.correlation.status, 'UNPROVEN');
});

test('actual step setter path exposes a sustained hold, backward frame and post-release overshoot without legacy inputs', () => {
  const clock = { value: 0 }, calls = [], listeners = new Map();
  const target = { addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) ?? []), callback]); },
    removeEventListener() {}, document: { hidden: false, activeElement: null, addEventListener() {}, removeEventListener() {} },
    emit(type, code) { const event = { code, repeat: false, defaultPrevented: false, target: { closest: () => null }, preventDefault() {} };
      for (const callback of listeners.get(type) ?? []) callback(event); } };
  const panel = { contains: () => false, querySelectorAll: () => [], querySelector: () => null };
  const trace = createMovementTrace({ now: () => clock.value, doc: { visibilityState: 'visible' } });
  trace.note('input=step');
  const context = vm.createContext({ csharp: { setMoveIntent(...args) { calls.push(args); } }, movementTrace: trace });
  const binding = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('      setMoveIntent: (primary, secondary, turn) =>'),
    MAIN_SOURCE.indexOf('\n      setBombIntent:', MAIN_SOURCE.indexOf('      setMoveIntent: (primary, secondary, turn) =>'))).trim().replace(/,\s*$/, '');
  const setMoveIntent = vm.runInContext(`({ ${binding} }).setMoveIntent`, context);
  const controls = createPlayerIntentControls({ setMoveIntent, setBombIntent: () => 'accepted',
    latchSkillIntent() {}, clearIntent() {}, ready: () => true, target, panel });
  const pose = z => ({ publicationSequence: String(Math.round(z * 10)), localStepOrdinal: '1', executionTick: '1',
    target: { position: { x: 0, z } } });
  const pump = (t, z) => trace.pump({ startedAt: t, tickAt: t + 1, tickMs: 1, totalMs: 2, state: 'active', pose: pose(z) });
  const frame = (t, shown, targetZ) => { clock.value = t; trace.frame({ now: t - 2, dt: 16,
    localPose: pose(targetZ), local: { x: 0, z: shown, yaw: 0, speed: 4 } }); };
  clock.value = 1; target.emit('keydown', 'KeyW');
  pump(10, 0); frame(20, 0, 0);
  pump(60, .2); frame(70, .25, .2); frame(80, .15, .2);
  pump(300, .4); frame(310, .45, .4); frame(350, .45, .4);
  clock.value = 400; target.emit('keyup', 'KeyW');
  frame(420, .6, .4); frame(440, .4, .4);
  assert.deepEqual(calls.map(row => Array.from(row)), [[1, 0, true], [0, 0, false]]);
  const summary = analyzeMovementTrace(trace.export());
  assert.equal(summary.counts.legacyPublishedMoves, 0);
  assert.equal(summary.counts.holdWindows, 1);
  assert.ok(summary.display.heldFrames > 0);
  assert.ok(summary.display.backwardFrames > 0);
  assert.ok(summary.display.stopOvershootM.n > 0);
  assert.ok(summary.display.stopOvershootM.max > .1);
  assert.equal(summary.stopTails[0].frames, 2, 'tail frames occur after the setter-observed release');
  assert.ok(summary.facing.heldFrames > 0);
  assert.equal(summary.movementExposureGate, 'PASS');
  controls.destroy();
});

test('step input observes opaque identity and clears retained sources before a fresh physical edge', () => {
  const listeners = new Map();
  const surface = { addEventListener(name, callback) { const rows = listeners.get(name) ?? []; rows.push(callback); listeners.set(name, rows); },
    removeEventListener() {}, emit(name, code, repeat = false) {
      const event = { code, repeat, target: surface, defaultPrevented: false, preventDefault() {} };
      for (const callback of listeners.get(name) ?? []) callback(event);
    } };
  surface.document = { hidden: false, activeElement: null, addEventListener() {}, removeEventListener() {}, hasFocus: () => true };
  const panel = { contains: () => false, querySelectorAll: () => [], querySelector: () => null };
  let token = 'lifetime-a:1', clears = 0;
  const moves = [], enabled = [];
  const sandbox = { document: { ...surface.document, getElementById: () => panel },
    createPlayerIntentControls, surface, panel,
    csharp: { inputIntentResetToken: () => token, setInputIntentEnabled: value => enabled.push(value),
      setMoveIntent: (...value) => moves.push(value), setBombIntent: () => 'accepted',
      latchSkillIntent() {}, clearPlayerIntent() { clears++; } } };
  const context = vm.createContext(sandbox);
  vm.runInContext(`const PLAYER_MODE=true,inputDriver='step',gameView=null;let playerInput;
    let stepInputToken=null,stepInputReady=false,stepInputObserving=false;
    let managedLoaded=true,runtimeClosed=false,active=true,terminal=false,initialSelectionPending=false;
    const player={replica:{inputOpen:true}};`, context);
  const source = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function refreshStepInput()'), MAIN_SOURCE.indexOf('function pumpSession(attempt)'));
  vm.runInContext(source, context);
  vm.runInContext(`playerInput=createPlayerIntentControls({target:surface,panel,ready:()=>refreshStepInput(),
    setMoveIntent:(...args)=>csharp.setMoveIntent(...args),setBombIntent:phase=>csharp.setBombIntent(phase),
    latchSkillIntent:()=>csharp.latchSkillIntent(),clearIntent:()=>csharp.clearPlayerIntent()});`, context);
  surface.emit('keydown', 'KeyA');
  token = 'lifetime-a:2';
  surface.emit('keydown', 'KeyD');
  assert.deepEqual(moves.map(row => Array.from(row)), [[4, 0, true], [2, 0, true]]);
  assert.equal(clears, 1);
  vm.runInContext('player.replica.inputOpen=false;refreshStepInput()', context);
  assert.equal(clears, 2);
  vm.runInContext('refreshStepInput()', context);
  assert.equal(clears, 2, 'stable disabled pumps must not repeat Clear');
  vm.runInContext('player.replica.inputOpen=true;refreshStepInput()', context);
  surface.emit('keydown', 'KeyA', true);
  assert.equal(moves.length, 2, 'repeat cannot resurrect a retired source');
  surface.emit('keydown', 'KeyA');
  assert.deepEqual(moves.at(-1), [4, 0, true]);
  assert.equal(enabled.at(-1), true);
});
test("player startup requires both new GAS exports and presentation callbacks send their commands", async () => {
  const section = (start, end) => MAIN_SOURCE.slice(MAIN_SOURCE.indexOf(start), MAIN_SOURCE.indexOf(end));
  const bind = section('function bindExports(api)', 'async function loadWasmExports');
  const route = section('function sendPlayerCommand(kind, publishRequest)', 'async function initializePage');
  const presentation = section('function updateGamePresentation()', 'const csharp = {')
    .replace("import('./game-view.mjs')", 'globalThis.importGameView()');
  const sent = [];
  let callbacks;
  const sandbox = {
    JSON, Date,
    resourceWitness:null, movementPreviewControls:null, previewFinitePose:'UNAVAILABLE',
    blocked: false, touch: [], bombEdges: [],
    api: {
      ConfigureConfig() {}, ConfigureInputMode() {}, Boot() {}, Close() {}, Tick() {}, TickRateHz() { return 30; }, SessionState() {}, WorldHandleBytes() {}, ReadBox() {}, WorldInstanceId() {}, LastApplyError() {}, ConnectionState() { return 'active'; }, OnBytes() {}, OnFrame() {},
      DumpPositions() { return '[]'; }, MapDimensions() { return '{}'; }, PlayerState() { return '{}'; },
      SendMove() { sent.push('move'); return true; }, PlaceBomb() { sent.push('bomb'); return true; },
      BombButton(phase) { sent.push(`bomb-edge:${phase}`); return true; },
      UseActiveSkill() { sent.push('skill'); return true; }, SelectCharacter(id) { sent.push(`character:${id}`); return true; },
      PresentationState() { return '{}'; }, SelectionConfig() { return '{}'; },
    },
    importGameView: async () => ({ createGameView: value => {
      callbacks = value;
      return { update() {}, inputBlocked: () => sandbox.blocked };
    } }),
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(`
    const PLAYER_MODE = true;
    let inputDriver = 'interval';
    const csharp = {};
    let developmentSession;
    let gameView, gameViewLoading, gameViewGeneration = 0; let selectedCharacter=null,initialSelectionPending=false;
    const voxelGrid = {};
    const player = { inputsSent: 0, movesSent: 0, bombsSent: 0, skillsSent: 0, selectionsSent: 0,
      replica: { phase: 'Warmup', inputOpen: true, inputEnabled: true, selfId: 'self' } };
    const playerInput = { clear() {}, setTouchDirection: (...args) => globalThis.touch.push(args),
      setBombPressed: (...args) => globalThis.bombEdges.push(args) };
    const spectator = { lastError: null };
    const currentSocket = { readyState: 1, send: value => globalThis.sent.push(value) };
    const active = true;
    function setStatus() {}
    function utf8ByteLength(value) { return value.length; }
  `, context);
  sandbox.sent = sent;
  vm.runInContext(bind + route + presentation, context);
  const incomplete = { ...sandbox.api };
  delete incomplete.BombButton;
  assert.throws(() => sandbox.bindExports(incomplete), /Player input export missing: BombButton/);
  incomplete.BombButton = sandbox.api.BombButton;
  delete incomplete.UseActiveSkill;
  assert.throws(() => sandbox.bindExports(incomplete), /Player input export missing/);
  delete incomplete.SelectCharacter;
  assert.throws(() => sandbox.bindExports(incomplete), /Player input export missing/);
  sandbox.bindExports(sandbox.api);
  sandbox.updateGamePresentation();
  await settle(() => Boolean(callbacks));
  assert.equal(callbacks.inputReady(), true);
  callbacks.onBombButton(true, false, 'hud');
  callbacks.onBombButton(false, true, 'touch');
  assert.deepEqual(sandbox.bombEdges.map(args => Array.from(args)), [[true, false, 'hud'], [false, true, 'touch']]);
  callbacks.onMove(1, 4);
  callbacks.onMove(2, 3);
  callbacks.onMove(0, 0);
  assert.deepEqual(sandbox.touch.map(args => Array.from(args)), [[1, 2], [3, 4], [0, 0]]);
  callbacks.onUseSkill();
  callbacks.onChangeCharacter('duck');
  callbacks.onPlaceBomb();
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb']);
  assert.equal(vm.runInContext('player.skillsSent', context), 1);
  assert.equal(vm.runInContext('player.selectionsSent', context), 1);
  assert.equal(vm.runInContext('player.bombsSent', context), 1);
  sandbox.blocked = true;
  assert.equal(callbacks.onUseSkill(), false);
  assert.equal(callbacks.onPlaceBomb(), false);
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb']);
  sandbox.blocked = false;
  vm.runInContext("player.replica = { phase: 'WaitingForWorldReady', inputOpen: false, inputEnabled: true, selfId: 'self' }", context);
  callbacks.onChangeCharacter('cat');
  assert.equal(callbacks.inputReady(), false);
  callbacks.onUseSkill();
  callbacks.onPlaceBomb();
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat']);
  vm.runInContext("player.replica = { phase: 'Results', inputOpen: false, inputEnabled: true, selfId: 'self' }", context);
  callbacks.onChangeCharacter('kangaroo');
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat', 'character:kangaroo']);
  for (const phase of ['Running', 'FinalCircle', 'Podium']) {
    vm.runInContext(`player.replica = { phase: '${phase}', inputOpen: true, inputEnabled: true, selfId: 'self' }`, context);
    assert.equal(callbacks.onChangeCharacter('closed'), false);
  }
  vm.runInContext("player.replica = { phase: 'WaitingForWorldReady', inputOpen: false, inputEnabled: true, selfId: null }", context);
  callbacks.onChangeCharacter('missing-self');
  vm.runInContext("player.replica = { phase: 'Results', inputOpen: false, inputEnabled: false, selfId: 'self' }", context);
  callbacks.onChangeCharacter('input-disabled');
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat', 'character:kangaroo']);
  assert.equal(vm.runInContext('player.selectionsSent', context), 3);
});



test('first character choice finishes before Platform launch or Session boot', async () => {
  const calls = []; let choose;
  const selection = new Promise(resolve => choose = resolve);
  const context = vm.createContext({ TextEncoder, AbortController, calls, selection, performance: { now: () => 0 },
    async finish() {}, setStatus() {}, paint() {}, readQuery() { return {}; },
    async loadWasmExports() { calls.push('wasm'); return true; },
    async loadSelectedConfig() { calls.push('config'); },
    async chooseFirstCharacter() { calls.push('choose'); return selection; },
    async obtainLaunch() { calls.push('launch'); return LAUNCH; },
    async loadCatalog() { return '{}'; }, pageAllowsLoopback() { return true; },
    csharp: { configureInputMode(mode, trace) { calls.push(`input:${mode}:${trace}`); }, async boot() { calls.push('boot'); } },
    pumpSession() { calls.push('pump'); }, async releaseReplica() {},
    failLaunch(error) { throw error; },
  });
  vm.runInContext(`const PLAYER_MODE=true; let selectedCharacter=null; let initialSelectionPending=false;
    let initialSelectionSent=false; let inputDriver='interval',movementTrace=null; let terminal=false,active=false,connectionAttempt=0,runtimeClosed=true,booting=Promise.resolve(),launchAbort=null,nextPumpAt=0;`, context);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('async function start()'), MAIN_SOURCE.indexOf('async function chooseFirstCharacter(')), context);
  const running = context.start(); await drain();
  assert.deepEqual(calls, ['wasm', 'input:interval:false', 'config', 'choose']);
  choose('duck'); await running;
  assert.deepEqual(calls, ['wasm', 'input:interval:false', 'config', 'choose', 'launch', 'boot', 'pump']);
  assert.equal(vm.runInContext('selectedCharacter', context), 'duck');
});

test('a closed pre-admission selection cannot launch after a late confirmation', async () => {
  const calls=[]; let choose;
  const context=vm.createContext({TextEncoder,AbortController,calls,performance:{now:()=>0},selection:new Promise(resolve=>choose=resolve),
    async finish(){},setStatus(){},paint(){},readQuery(){return{};},
    async loadWasmExports(){return true;},async loadSelectedConfig(){},async chooseFirstCharacter(){return context.selection;},
    async obtainLaunch(){calls.push('launch');return LAUNCH;},async loadCatalog(){return'{}';},pageAllowsLoopback(){return true;},
    csharp:{configureInputMode(){},async boot(){calls.push('boot');}},pumpSession(){},async releaseReplica(){},failLaunch(error){throw error;}});
  vm.runInContext(`const PLAYER_MODE=true; let selectedCharacter=null; let initialSelectionPending=false;
    let initialSelectionSent=false; let inputDriver='interval',movementTrace=null; let terminal=false,active=false,connectionAttempt=0,runtimeClosed=true,booting=Promise.resolve(),launchAbort=null,nextPumpAt=0;`,context);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('async function start()'),MAIN_SOURCE.indexOf('async function chooseFirstCharacter(')),context);
  const running=context.start();await drain();vm.runInContext('terminal=true;connectionAttempt++;',context);
  choose('cat');await running;assert.deepEqual(calls,[]);
});

function initialChoiceContext() {
  const sent=[];
  const context=vm.createContext({Date, sent, csharp:{selectCharacter(id){sent.push(id);return true;}}});
  vm.runInContext(`const PLAYER_MODE=true,active=true; let selectedCharacter='duck',initialSelectionPending=true,initialSelectionSent=false;
    const player={replica:{inputEnabled:false,selfId:null,phase:'Warmup'},selectionsSent:0};
    const gameView=null,playerInput=null,spectator={};function setStatus(){}`,context);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function commitInitialSelection()'),MAIN_SOURCE.indexOf('async function initializePage')),context);
  return context;
}

test('initial choice waits for real Self and input permission, sends once, and awaits replicated character',()=>{
  const context=initialChoiceContext();
  context.commitInitialSelection(); assert.deepEqual(context.sent,[]);
  vm.runInContext('player.replica.inputEnabled=true',context);
  context.commitInitialSelection(); assert.deepEqual(context.sent,[]);
  vm.runInContext("player.replica.selfId='self'",context);
  context.commitInitialSelection();context.commitInitialSelection();assert.deepEqual(context.sent,['duck']);
  assert.equal(vm.runInContext('initialSelectionPending',context),true);
  assert.equal(context.sendPlayerCommand('bomb',()=>{throw new Error('not confirmed');}),false);
  vm.runInContext("player.replica.characterName='duck'",context);
  context.commitInitialSelection();assert.equal(vm.runInContext('initialSelectionPending',context),false);
});

test('unconfirmed initial choice reports a closed authoritative window even after RPC acceptance',()=>{
  const context=initialChoiceContext();
  vm.runInContext("player.replica={inputEnabled:true,selfId:'self',phase:'Warmup'}",context);
  context.commitInitialSelection();
  vm.runInContext("player.replica.phase='Running'",context);
  assert.throws(()=>context.commitInitialSelection(),/initial_character_admission_window_closed/);
  assert.deepEqual(context.sent,['duck']);
});

test('reconnect respects the actual already-bound character without publishing another intent',()=>{
  const context=initialChoiceContext();
  vm.runInContext("player.replica={inputEnabled:true,selfId:'self',phase:'Running',characterName:'cat'}",context);
  context.commitInitialSelection();assert.deepEqual(context.sent,[]);
  assert.equal(vm.runInContext('selectedCharacter',context),'cat');
  assert.equal(vm.runInContext('initialSelectionPending',context),false);
});

function pendingSelectionPage(replica) {
  const frames=[], sent=[], controls=[{disabled:false}];
  const context=vm.createContext({Date,JSON, frames,sent,controls,replica,
    document:{getElementById(){return null;},querySelectorAll(){return controls;}},
    console:{error(){throw new Error('unexpected display fault');}}});
  vm.runInContext(`const PLAYER_MODE=true,GAME_VIEW=true,active=true;
    let selectedCharacter='duck',initialSelectionPending=true,initialSelectionSent=false;
    const player={replica:null,selectionsSent:0},spectator={positions:[]},voxelGrid={};
    const playerInput=null; let gameView={update(frame){frames.push(frame);},inputBlocked(){return false;}};
    let gameViewLoading=null,gameViewGeneration=0;
    const csharp={playerState(){return JSON.stringify(replica);},
      presentationState(){return JSON.stringify({selfId:replica.selfId,tick:'25698',players:[{id:'remote'}]});},
      selectCharacter(value){sent.push(value);return true;}};
    function parseDump(raw){return JSON.parse(raw);} function paint(positions){spectator.positions=positions;}
    function setStatus(){}`,context);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function applyDump(raw)'),MAIN_SOURCE.indexOf('const csharp =')),context);
  vm.runInContext(MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('function commitInitialSelection()'),MAIN_SOURCE.indexOf('async function initializePage')),context);
  return context;
}

for (const [phase,lifePhase] of [['Running','AwaitingRespawn'],['FinalCircle','Eliminated']]) {
  test(`reopened observing ${lifePhase} page draws the real replica while initial selection remains input-blocked`,()=>{
    const participant='0000000000000001000000000000000f';
    const context=pendingSelectionPage({connectionState:'active',inputEnabled:false,inputOpen:false,
      selfId:participant,participantId:participant,phase,lifePhase,characterName:null});
    assert.equal(context.applyDump(JSON.stringify([{id:'remote',x:1.5,z:5.5,type:'player'}])),true);
    assert.equal(context.frames.length,1,'bound observing replica must reach the renderer');
    assert.equal(context.frames[0].selfId,participant);
    assert.equal(vm.runInContext('initialSelectionPending',context),true);
    assert.deepEqual(context.sent,[],'an observation cannot publish a character intent');
    assert.equal(context.controls[0].disabled,true);
    assert.equal(context.sendPlayerCommand('bomb',()=>{throw new Error('must remain blocked');}),false);
  });
}

test('first Warmup page draws before character confirmation without opening gameplay input',()=>{
  const context=pendingSelectionPage({connectionState:'active',inputEnabled:true,inputOpen:true,
    selfId:'life',participantId:'participant',phase:'Warmup',lifePhase:'Protected',characterName:null});
  assert.equal(context.applyDump('[]'),true);
  assert.equal(context.frames.length,1);
  assert.deepEqual(context.sent,['duck']);
  assert.equal(vm.runInContext('initialSelectionPending',context),true);
  assert.equal(context.sendPlayerCommand('bomb',()=>{throw new Error('unconfirmed character');}),false);
});

// Exercise the real page + real GameView module together. Only the existing
// Presentation dependencies are substituted; no World or gameplay is simulated.
const GAME_VIEW_SOURCE = fs.readFileSync(new URL('./game-view.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '').replace('export function createGameView', 'function createGameView');
const WORLD_ONE = '0000000000000001', WORLD_TWO = '0000000000000002';
function rebindFrame(tick = '10') {
  return { tick, selfId: '00000000000000010000000000000003',
    match: { id: '00000000000000010000000000000001', matchId: '1', phase: 2 },
    config: { mapSize: 19, groundLayer: 0, obstacleLayer: 1, blocks: [] },
    players: [{ id: '00000000000000010000000000000003', participantId: '0000000000000001000000000000000f', lifeGeneration: 1 }],
    participants: [{ id: '0000000000000001000000000000000f', currentLife: '00000000000000010000000000000003', lastLife: '00000000000000010000000000000003', lifeGeneration: 1, matchId: '1' }],
    chests: [], events: [] };
}
function pageGameFixture() {
  const element = () => ({ hidden: true, classList: { add() {}, remove() {} },
    querySelector() { return { style: {} }; } });
  const fixture = { worldId: WORLD_ONE, frame: rebindFrame(), imports: 0, views: [],
    adapters: [], presentations: [], importWaits: [],
    nodes: new Map(['presentation','game-stage','game-labels','game-hud'].map(id => [id, element()])) };
  fixture.bindings = {
    projectReplicaConfig: () => ({ catalog: { characters: new Map([[118002, 'duck']]) },
      config: { tickRateHz: 20 }, rules: { characters: { duck: {} } } }),
    createReplicaAdapter: () => {
      const adapter = { localPlayerId: 1, project: frame => ({ Tick: Number(frame.tick), Players: frame.players ?? [] }), events: () => [] };
      fixture.adapters.push(adapter); return adapter;
    },
    ReplicaTerrain: class {
      read(grid) {
        const surfaces = [0, 1].map(y => grid.readSurface({ minX: 0, maxX: 18, minY: y, maxY: y, minZ: 0, maxZ: 18 }));
        return surfaces.some(surface => surface.states.some(state => state === 0)) ? null : { grid };
      }
    },
    createPresentation: options => {
      const owned = { options, pushes: [], disposeCount: 0 }; fixture.presentations.push(owned);
      return { push(frame) { owned.pushes.push(frame); }, setSelectionWindow() {}, inputBlocked: () => false,
        dispose() { owned.disposeCount++; } };
    },
  };
  fixture.import = async context => {
    fixture.imports++;
    await fixture.importWaits.shift();
    const create = vm.runInContext(`(() => { ${GAME_VIEW_SOURCE}; return createGameView; })()`, context);
    return { createGameView(callbacks) {
      const actual = create(callbacks), owned = { actual, updates: [], disposeCount: 0 }; fixture.views.push(owned);
      return { ...actual, update(frame, grid) { owned.updates.push({ frame, grid }); return actual.update(frame, grid); },
        dispose() { owned.disposeCount++; return actual.dispose(); } };
    } };
  };
  return fixture;
}
async function runGamePage(fixture = pageGameFixture()) {
  const page = await runPage({ search: '?view=game', game: fixture, runtime: { state: 'active', known: true },
    exports: { WorldInstanceId: () => fixture.worldId, PresentationState: () => JSON.stringify(fixture.frame) } });
  return { page, fixture };
}

test('same confirmed WorldInstanceId rebind replaces the grid without disposing the GameView', async () => {
  const { page, fixture } = await runGamePage();
  assert.equal(fixture.views.length, 1); assert.equal(fixture.presentations.length, 1);
  const first = fixture.views[0], oldGrid = first.updates.at(-1).grid;
  const cell = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  assert.equal(oldGrid.readSurface(cell).states[0], 1, 'the old grid must be usable before the rebind');
  page.runtime.handle[31] = 2; fixture.frame = rebindFrame('11');
  await page.tick();
  const replacement = fixture.views.at(-1).updates.at(-1).grid;
  assert.notEqual(replacement, oldGrid); assert.equal(oldGrid.wasm, null);
  const retiredSurface = oldGrid.readSurface(cell); assert.equal(retiredSurface.states[0], 0); assert.equal(retiredSurface.error, 'world_destroyed');
  assert.equal(replacement.readSurface(cell).states[0], 1);
  assert.equal(first.disposeCount, 0, 'the same-world Native handle must not retire the GameView');
  assert.equal(fixture.imports, 1); assert.equal(fixture.views.length, 1); assert.equal(fixture.adapters.length, 1);
  assert.equal(fixture.presentations.length, 1); assert.equal(page.win.__lumioPresentation.authorityTick, '11');
  await page.tick(); assert.equal(page.handles.length, 2, 'the unchanged replacement handle is reused');
});

test('a different current WorldInstanceId fully releases the GameView even when handle bytes match', async () => {
  const { page, fixture } = await runGamePage();
  const first = fixture.views[0], grid = first.updates.at(-1).grid;
  fixture.worldId = WORLD_TWO; fixture.frame = { ...rebindFrame('11'), match: { ...rebindFrame().match, id: '00000000000000020000000000000001' } };
  await page.tick();
  assert.equal(first.disposeCount, 1, 'a stable handle alone is not proof of the current WorldInstanceId');
  assert.equal(fixture.views.length, 2); assert.equal(page.spectator.worldId, WORLD_TWO);
  assert.equal(grid.wasm, null);
  const retiredSurface = grid.readSurface({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
  assert.equal(retiredSurface.states[0], 0); assert.equal(retiredSurface.error, 'world_destroyed');
});

for (const worldId of ['', '0000000000000000', 'W1', '00000000000000001'])
  test(`unconfirmed WorldInstanceId ${JSON.stringify(worldId)} cannot retain a GameView across a handle change`, async () => {
    const fixture = pageGameFixture(); fixture.worldId = worldId;
    const { page } = await runGamePage(fixture); const first = fixture.views[0];
    page.runtime.handle[31] = 2; await page.tick();
    assert.equal(first.disposeCount, 1); assert.equal(fixture.views.length, 2);
  });

test('same-world rebind without a fresh match/config hides all old presentation instead of exposing a stale first screen', async () => {
  const { page, fixture } = await runGamePage();
  assert.equal(page.win.__lumioPresentation.status, 'active');
  page.runtime.handle[31] = 2; fixture.frame = { tick: '11', players: [], participants: [] };
  await page.tick();
  assert.equal(fixture.nodes.get('presentation').hidden, true, 'the whole HUD/labels/stage root must be hidden');
  assert.notEqual(page.win.__lumioPresentation.status, 'active');
  assert.equal(page.win.__lumioPresentation.frame, null); assert.equal(page.win.__lumioPresentation.self, null);
  assert.equal(fixture.views.at(-1).actual.inputBlocked(), true);
  fixture.frame = rebindFrame('12'); await page.tick();
  assert.equal(fixture.nodes.get('presentation').hidden, false); assert.equal(page.win.__lumioPresentation.authorityTick, '12');
  assert.equal(fixture.views.length, 1);
});

test('same-world rebind with unavailable new terrain cannot retain old HUD/active evidence', async () => {
  const { page, fixture } = await runGamePage();
  page.runtime.handle[31] = 2; page.runtime.known = false; fixture.frame = rebindFrame('11');
  await page.tick();
  assert.equal(fixture.nodes.get('presentation').hidden, true);
  assert.equal(page.win.__lumioPresentation.status, 'loading-terrain'); assert.equal(page.win.__lumioPresentation.frame, null);
  assert.equal(fixture.views.at(-1).actual.inputBlocked(), true);
  page.runtime.known = true; fixture.frame = rebindFrame('12'); await page.tick();
  assert.equal(fixture.nodes.get('presentation').hidden, false); assert.equal(page.win.__lumioPresentation.authorityTick, '12');
  assert.equal(fixture.views.length, 1);
});

test('a stale asynchronous GameView import cannot revive a replaced handle or a finished page', async () => {
  const fixture = pageGameFixture(); let releaseOld; fixture.importWaits.push(new Promise(resolve => releaseOld = resolve));
  const { page } = await runGamePage(fixture);
  assert.equal(fixture.imports, 1); assert.equal(fixture.views.length, 0);
  page.runtime.handle[31] = 2; await page.tick();
  assert.equal(fixture.imports, 2); assert.equal(fixture.views.length, 1);
  const current = fixture.views[0]; releaseOld(); await drain();
  assert.equal(fixture.views.length, 1, 'the superseded import cannot create a view');
  const retiredCallback = [...page.timers.values()][0];
  await page.evalInPage("finish('closed')"); retiredCallback.callback(); await drain();
  assert.equal(current.disposeCount, 1); assert.equal(page.timers.size, 0);
  assert.equal(fixture.nodes.get('presentation').hidden, true); assert.equal(page.win.__lumioPresentation.status, 'closed');
});
