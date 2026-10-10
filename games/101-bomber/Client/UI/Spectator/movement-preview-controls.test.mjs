import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerIntentControls } from './player-intent-controls.mjs';
import { createPlayerInput } from './player-controls.mjs';
const module = await import('./movement-preview-controls.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
});
class Surface extends EventTarget {
  constructor() { super(); this.dataset = {}; this.disabled = false; this.textContent = ''; }
  click() { this.dispatchEvent(new Event('click')); }
  pointerClick(target) {
    const down = new Event('pointerdown', { cancelable: true });
    this.dispatchEvent(down);
    if (!down.defaultPrevented) {
      target.document.activeElement = this;
      target.document.dispatchEvent(new Event('focusin'));
    }
    this.click();
  }
}
function fixture({ physical = false, physicalMode = 'step' } = {}) {
  assert.equal(typeof module.createMovementPreviewControls, 'function', 'visible controls implementation exists');
  const target = new Surface(); target.document = new Surface();
  const buttons = [1,4,3,2,0].map(direction => { const b = new Surface(); b.dataset.movementDirection = String(direction); return b; });
  const record = new Surface(), exp = new Surface(), identity = new Surface(), status = new Surface();
  for (const button of [...buttons, record, exp, identity]) button.closest = () => button;
  const panel = { querySelectorAll: selector => selector === '[data-movement-direction]' ? buttons : selector === 'button' ? [...buttons,record,exp,identity] : [],
    querySelector: selector => ({ '[data-movement-record]':record, '[data-movement-export]':exp, '[data-movement-status]':status })[selector], contains:()=>true };
  let ready = true, token = 'a', clearCount = 0;
  const calls = [], moves = [], records = [];
  const trace = { size: 1, export:()=>({events:['prior']}), clear() { records.push('clear'); this.size = 0; } };
  const input = physical ? physicalMode === 'step' ? createPlayerIntentControls({ target, panel, ready:()=>ready,
    setMoveIntent:(...args)=>moves.push(args), setBombIntent(){}, latchSkillIntent(){}, clearIntent(){clearCount++;} })
    : createPlayerInput({target,panel,ready:()=>ready,driver:physicalMode,sendMove:(...args)=>moves.push(args),
      schedule:()=>1,cancel(){},placeBomb(){},useSkill(){}})
    : { setTouchDirection:(...args)=>calls.push(args), clear(){clearCount++;} };
  const ui = module.createMovementPreviewControls({ panel, target, input,
    state:()=>({ready,resetToken:token,inputMode:'step',composition:'2+6',version:'test',identity:'arm/run',finitePose:true}),
    trace:()=>trace, exportTrace:()=>records.push('export') });
  return {target,buttons,record,exp,identity,status,ui,input,calls,moves,records,trace,setReady:v=>ready=v,setToken:v=>token=v,clears:()=>clearCount};
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

test('pointer activation preserves physical W through focused bubbling repeat A Stop and exports',()=>{
  for (const physicalMode of ['step','interval','pump']) {
    const f=fixture({physical:true,physicalMode});
    const key = repeat => {
      const event=new Event('keydown',{cancelable:true});event.code='KeyW';event.repeat=repeat;
      Object.defineProperty(event,'target',{value:f.target.document.activeElement ?? f.target});
      f.target.dispatchEvent(event);if(!repeat)f.input.pump?.();
    };
    key(false);
    f.buttons[1].pointerClick(f.target);f.input.pump?.();key(true);
    f.buttons[4].pointerClick(f.target);f.input.pump?.();key(true);
    assert.deepEqual(f.moves.map(move=>move[0]),[1,4,1],physicalMode+' keeps W while touch A overrides then Stop restores it');
    for(const button of [f.record,f.exp,f.identity]){button.pointerClick(f.target);key(true);}
    assert.deepEqual(f.moves.map(move=>move[0]),[1,4,1],physicalMode+' pointer export does not clear held W');
    // Intentional keyboard focus still reaches the existing UI-focus blocker.
    f.target.document.activeElement=f.buttons[1];key(true);
    const count=f.moves.length;f.target.dispatchEvent(new Event('blur'));f.input.setTouchDirection(4,0);f.input.pump?.();
    assert.equal(f.moves.length,count,physicalMode+' actual blur remains blocked');
    f.ui.destroy();f.input.destroy();
  }
});
