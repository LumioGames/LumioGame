import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

test('render callback uses only the small owner export and retires with its view or connection attempt', async () => {
  let callbacks, reads = 0, dumps = 0;
  const dto = { sessionGeneration: '2', entity: 'self', connectionGeneration: '9', publicationSequence: '9007199254740993' };
  const context = vm.createContext({ JSON, api: {
    ConfigureConfig() {}, Boot() {}, Close() {}, Tick() { throw new Error('render must not Tick'); }, TickRateHz() {},
    SessionState() { throw new Error('render must not serialize session stats'); }, WorldHandleBytes() {}, ReadBox() {},
    DumpPositions() {}, MapDimensions() {}, WorldInstanceId() {}, ConnectionState() {}, LastApplyError() {},
    PresentationState() { dumps++; return '{}'; }, OwnerPresentation() { reads++; return JSON.stringify(dto); },
    SendMove() {}, PlaceBomb() {}, BombButton() {}, UseActiveSkill() {}, SelectCharacter() {}, PlayerState() {}, SelectionConfig() {},
  }, importGameView: async () => ({ createGameView(value) { callbacks = value; return { update() {} }; } }),
    setStatus() {}, console, sendPlayerCommand() {},
  });
  vm.runInContext(`const PLAYER_MODE=true; const csharp={}; let developmentSession;
    let gameView,gameViewLoading,gameViewGeneration=0,gameViewOwnerGeneration=0;
    let connectionAttempt=1,currentSessionGeneration='2',terminal=false,active=true;
    let selectedCharacter=null,initialSelectionPending=false,playerInput=null;
    const player={replica:{inputOpen:true}},voxelGrid={};`, context);
  vm.runInContext(slice('function bindExports(api)', 'async function loadWasmExports'), context);
  vm.runInContext(slice('function updateGamePresentation()', 'const csharp = {')
    .replace("import('./game-view.mjs')", 'globalThis.importGameView()'), context);
  context.bindExports(context.api); context.updateGamePresentation();
  for (let i = 0; i < 10 && !callbacks; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof callbacks.readOwnerPose, 'function');
  const baselineDumps = dumps;
  for (let i = 0; i < 5; i++) assert.equal(callbacks.readOwnerPose().connectionGeneration, '9');
  assert.equal(reads, 5); assert.equal(dumps, baselineDumps);
  dto.sessionGeneration = '1'; assert.equal(callbacks.readOwnerPose(), null);
  dto.sessionGeneration = '2';
  vm.runInContext('gameViewGeneration++;', context);
  assert.equal(callbacks.readOwnerPose(), null); assert.equal(reads, 6);
  vm.runInContext('gameViewOwnerGeneration=gameViewGeneration;', context);
  assert.equal(callbacks.readOwnerPose().sessionGeneration, '2', 'same view may resume after a current binding refresh');
  vm.runInContext('connectionAttempt++;', context);
  assert.equal(callbacks.readOwnerPose(), null); assert.equal(reads, 7);
  vm.runInContext('connectionAttempt--;gameView=null;', context);
  assert.equal(callbacks.readOwnerPose(), null); assert.equal(reads, 7);
  vm.runInContext('terminal=true;', context);
  assert.equal(callbacks.readOwnerPose(), null); assert.equal(reads, 7);
});
