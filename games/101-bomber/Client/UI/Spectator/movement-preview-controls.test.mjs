import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerIntentControls } from './player-intent-controls.mjs';
const module = await import('./movement-preview-controls.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
});
class Surface extends EventTarget {
  constructor() { super(); this.dataset = {}; this.disabled = false; this.textContent = ''; }
  click() { this.dispatchEvent(new Event('click')); }
}
function fixture({ physical = false } = {}) {
  assert.equal(typeof module.createMovementPreviewControls, 'function', 'visible controls implementation exists');
  const target = new Surface(); target.document = new Surface();
  const buttons = [1,4,3,2,0].map(direction => { const b = new Surface(); b.dataset.movementDirection = String(direction); return b; });
  const record = new Surface(), exp = new Surface(), status = new Surface();
  const panel = { querySelectorAll: selector => selector === '[data-movement-direction]' ? buttons : [],
    querySelector: selector => ({ '[data-movement-record]':record, '[data-movement-export]':exp, '[data-movement-status]':status })[selector], contains:()=>true };
  let ready = true, token = 'a', clearCount = 0;
  const calls = [], moves = [], records = [];
  const trace = { size: 1, export:()=>({events:['prior']}), clear() { records.push('clear'); this.size = 0; } };
  const input = physical ? createPlayerIntentControls({ target, panel, ready:()=>ready,
    setMoveIntent:(...args)=>moves.push(args), setBombIntent(){}, latchSkillIntent(){}, clearIntent(){} })
    : { setTouchDirection:(...args)=>calls.push(args), clear(){clearCount++;} };
  const ui = module.createMovementPreviewControls({ panel, target, input,
    state:()=>({ready,resetToken:token,inputMode:'step',composition:'2+6',version:'test',identity:'arm/run',finitePose:true}),
    trace:()=>trace, exportTrace:()=>records.push('export') });
  return {target,buttons,record,exp,status,ui,input,calls,moves,records,trace,setReady:v=>ready=v,setToken:v=>token=v,clears:()=>clearCount};
}
test('A D Stop and duplicate click publish one touch setter per edge',()=>{
  const f=fixture(); f.buttons[1].click(); f.buttons[1].click(); f.buttons[3].click(); f.buttons[4].click();
  assert.deepEqual(f.calls,[[4,0],[2,0],[0,0]]); assert.equal(f.ui.snapshot().latched,0);
});
test('Stop restores a held physical key without clear',()=>{
  const f=fixture({physical:true}); const key=new Event('keydown'); key.code='KeyW'; key.repeat=false; f.target.dispatchEvent(key);
  f.buttons[1].click(); f.buttons[4].click(); assert.deepEqual(f.moves.map(x=>x[0]),[1,4,1]);
});
test('not ready and changed opaque token invalidate visible latch',()=>{
  const f=fixture(); f.buttons[0].click(); f.setReady(false); f.ui.refresh();
  assert.equal(f.ui.snapshot().latched,0); assert.equal(f.clears(),1); f.buttons[3].click(); assert.equal(f.calls.length,1);
  f.setReady(true); f.ui.refresh(); f.buttons[1].click(); f.setToken('b'); f.ui.refresh(); assert.equal(f.ui.snapshot().latched,0);
});
for(const event of ['blur','visibilitychange','focusin']) test(`${event} invalidates visible latch`,()=>{
  const f=fixture(); f.buttons[0].click(); f.setReady(false);
  if(event==='visibilitychange')f.target.document.hidden=true;
  (event==='blur'?f.target:f.target.document).dispatchEvent(new Event(event)); assert.equal(f.ui.snapshot().latched,0);
});
test('existing clear close rebind and dispose use invalidate without another move',()=>{
  const f=fixture(); f.buttons[0].click(); f.ui.invalidate(); assert.equal(f.ui.snapshot().latched,0);
  f.ui.destroy(); f.buttons[3].click(); assert.equal(f.calls.length,1);
});
test('Start recording preserves previous actual trace before recorder-only clear',()=>{
  const f=fixture(); f.record.click(); assert.deepEqual(f.records,['export','clear']); f.exp.click(); assert.deepEqual(f.records,['export','clear','export']);
  assert.match(f.status.textContent,/step/); assert.match(f.status.textContent,/release physical keys/i);
});
