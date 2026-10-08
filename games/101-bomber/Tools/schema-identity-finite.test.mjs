import {loadTestLedger} from './schema-identity-test-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {readLedgerStorage} from './schema-identity-storage.mjs';
import {validateLedger,compareHistory,validateHistorySnapshots} from './schema-identity-model.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';
const ledger = loadTestLedger(new URL('../Gameplay/Compatibility/schema-identities.json', import.meta.url));
function finite() {
  const next = structuredClone(ledger);
  next.active = next.active.filter(i => i.kind !== 'effect-type' || i.value !== 10107);
  const effect = structuredClone(next.active.find(i => i.kind === 'effect-type' && i.value === 10106));
  effect.value = effect.shape.id = 10107;
  effect.owner = effect.shape.clrType = 'Lumio.Bomber.Gameplay.BomberBubbleEffect';
  effect.shape.parametersType = effect.owner + '.Parameters';
  effect.shape.instantWrites = [];
  effect.shape.fields = [
    {id:1,name:'Duration',clrType:'System.UInt64',maxUtf8Bytes:null},
    {id:2,name:'Fx',clrType:'System.String',maxUtf8Bytes:32},
  ];
  Object.assign(effect.shape, {lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]});
  next.active.push(effect);
  return next;
}
function aura() {
  const next=structuredClone(ledger);
  next.active=next.active.filter(i=>i.kind!=='effect-type'||i.value!==10111);
  const effect=structuredClone(next.active.find(i=>i.kind==='effect-type'&&i.value===10107));
  effect.value=effect.shape.id=10111;
  effect.owner=effect.shape.clrType='Lumio.Bomber.Gameplay.BomberFireAuraEffect';
  effect.shape.parametersType=effect.owner+'.Parameters';
  effect.shape.fields.push({id:7,name:'Favorite',clrType:'System.Boolean',maxUtf8Bytes:null},
    {id:8,name:'ChainId',clrType:'System.UInt64',maxUtf8Bytes:null});
  next.active.push(effect);
  return next;
}
test('finite Aura admits only its approved duration and private Favorite boolean payload',()=>{
  assert.deepEqual(validateLedger(aura()),[]);
});
test('finite Aura rejects a copied policy, another CLR owner and an unrelated boolean field',()=>{
  for(const patch of [{policy:'unbounded'},{durationFieldId:8},{clrType:'Lumio.Bomber.Gameplay.OtherAuraEffect'}]) {
    const next=aura();Object.assign(next.active.at(-1).shape,patch);
    assert.notDeepEqual(validateLedger(next),[]);
  }
  for(const patch of [{id:8},{name:'Other'},{clrType:'System.UInt32'}]) {
    const next=aura();Object.assign(next.active.at(-1).shape.fields.find(f=>f.id===7),patch);
    assert.notDeepEqual(validateLedger(next),[]);
  }
});
test('existing finite status Effects do not admit the Aura Favorite boolean extension',()=>{
  const next=finite();next.active.at(-1).shape.fields.push({id:7,name:'Favorite',clrType:'System.Boolean',maxUtf8Bytes:null});
  assert.notDeepEqual(validateLedger(next),[]);
});
test('finite bubble pins its lifetime and duration binding without inventing instant attribute writes', () => {
  assert.deepEqual(validateLedger(finite()), []);
});
test('finite timing must name an unsigned payload field and the approved policy', () => {
  for (const patch of [{durationFieldId:2},{policy:'unbounded'},{lifetime:'infinite'},{periodFieldId:3}]) {
    const next=finite(); Object.assign(next.active.at(-1).shape,patch);
    assert.notDeepEqual(validateLedger(next),[]);
  }
});
test('instant effects cannot masquerade as finite by omitting their writes or copying timing metadata', () => {
  const next=structuredClone(ledger); const effect=next.active.find(i=>i.kind==='effect-type'&&i.value===10106);
  effect.shape.instantWrites=[];
  assert.notDeepEqual(validateLedger(next),[]);
  Object.assign(effect.shape,{lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]});
  assert.notDeepEqual(validateLedger(next),[]);
});

test('actual finite lifecycle migration preserves every captured predecessor and its exact retirement',async()=>{
  const snapshots=new Map(await Promise.all(LOCAL_HISTORY_SNAPSHOTS.map(async source=>[source.path,await readFile(new URL('../'+source.path,import.meta.url))])));
  const read=path=>snapshots.get(path)??readFileSync(new URL('../'+path,import.meta.url));
  const history={get:read,[Symbol.iterator]:()=>snapshots[Symbol.iterator]()};
  const finitePredecessor=JSON.parse(await readFile(new URL('../Gameplay/Compatibility/schema-identities.before-contact-freeze.json',import.meta.url)));
  assert.equal(finitePredecessor.schema,'bomber-v7-finite-lifecycle-candidate');
  assert.equal(finitePredecessor.active.length,620);
  const contact=loadTestLedger(new URL('../Gameplay/Compatibility/schema-identities.before-strong-chest.json',import.meta.url));
  assert.equal(contact.schema,'bomber-v8-contact-freeze-candidate');
  assert.equal(contact.active.length,634);
  const strong=loadTestLedger(new URL('../Gameplay/Compatibility/schema-identities.before-durable-results.json',import.meta.url));
  assert.equal(strong.schema,'bomber-v9-strong-chest-candidate');
  assert.equal(strong.active.length,638);
  assert.deepEqual(compareHistory(strong,ledger),[]);
  // The circle addition appends private persisted scalars without replacing
  // any finite Effect or pre-existing field shape.
  const circle=ledger.active.filter(i=>i.kind==='scalar'&&i.owner==='Lumio.Bomber.Gameplay.Contracts.Components.BomberFinalCircleState');
  for(const [suffix,ordinal,type] of [['clearedStageMask',13,'u32'],['resourceCountInitialized',14,'bool']]) {
    const field=circle.find(i=>i.value==='BomberFinalCircleState.'+suffix);
    assert.ok(field,suffix);
    assert.equal(field.shape.ordinal,ordinal);
    assert.equal(field.shape.scope,'None');
    assert.equal(field.shape.persistence,'persistent');
    for(const side of ['server','client']) assert.deepEqual(field.shape.serialization[side],
      {capturePersist:true,captureSync:false,restorePersist:true});
    assert.equal(field.shape.wireType,type);
  }
  assert.deepEqual(validateHistorySnapshots(ledger,history,LOCAL_HISTORY_SNAPSHOTS),[]);
  for(const bytes of snapshots.values())assert.deepEqual(compareHistory(readLedgerStorage(bytes,read),ledger),[]);
  const next=structuredClone(ledger);
  next.retired=next.retired.filter(r=>r.retiredIn!==ledger.schema);
  assert.ok(validateHistorySnapshots(next,history,LOCAL_HISTORY_SNAPSHOTS).some(d=>d.code==='missing_prior_shape_retirement'));
});

test('speed payloads append exact configured values while Bubble remains owner-timed and private-correlated',()=>{
  const effect=id=>ledger.active.find(i=>i.kind==='effect-type'&&i.value===id).shape;
  for(const id of [10102,10104,10105])assert.deepEqual(effect(id).instantWrites,[1,2,3,4,5,6]);
  for(const [id,field,name] of [[10102,18,'MovementSpeedAfter'],[10104,21,'MovementSpeedSeed'],[10105,13,'MovementSpeed']])
    assert.deepEqual(effect(id).fields.at(-1),{id:field,name,clrType:'System.Int64',maxUtf8Bytes:null});
  assert.equal(effect(10103).fields.length,17);
  assert.deepEqual(effect(10107).fields.map(f=>[f.id,f.name]),[[1,'Duration'],[2,'Fx'],[3,'Participant'],[4,'Life'],[5,'Generation'],[6,'MatchId']]);
  assert.equal(effect(10107).lifetime,'finite');
  const correlation=ledger.active.filter(i=>i.kind==='scalar'&&i.value.startsWith('BomberSkillState.bubble')&&i.value!=='BomberSkillState.bubbleUntilTick');
  assert.equal(correlation.length,8);
  assert.ok(correlation.every(i=>i.shape.scope==='None'));
});
