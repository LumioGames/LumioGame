// Root-only post-GEN tests. Copy to Tools after review; author never executed observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readObservation,readObservationInputs,observeSnapshot,CANDIDATE_PACKAGE} from './schema-identity-read.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const observed=await readObservation(root),files=await readObservationInputs(root);
test('official v15 output observes exact fixed4 persisted traversal and projected region fields',()=>{
  assert.equal(observed.schema,'bomber-v15-traversal-favorite-regions-candidate');
  for(const suffix of ['traversalOriginX','traversalOriginZ','traversalPower','traversalArms']){
    const identity=observed.identities.find(i=>i.value==='BomberBombState.'+suffix);
    assert.ok(identity);assert.equal(identity.shape.scope,'None');assert.equal(identity.shape.persistence,'persistent');
    if(suffix==='traversalArms')assert.equal(identity.shape.maxCapacity,4);
    for(const side of ['server','client'])assert.deepEqual(identity.shape.serialization[side],
      {capturePersist:true,captureSync:false,restorePersist:true});
  }
  for(const suffix of ['sourceLife','sourceLifeGeneration','sourceMatchId','sourceChainId','coverageMask','regionCoverage']){
    const identity=observed.identities.find(i=>i.value==='BomberFireZoneState.'+suffix);
    assert.ok(identity);assert.equal(identity.shape.scope,'Aoi');
    for(const side of ['server','client'])assert.deepEqual(identity.shape.serialization[side],
      {capturePersist:true,captureSync:true,restorePersist:true});
  }
});
test('official v15 output has exact10112 and distinct10124 authored mapping closure',()=>{
  const effect=observed.identities.find(i=>i.kind==='effect-type'&&i.value===10112);
  assert.equal(effect.owner,'Lumio.Bomber.Gameplay.BomberFireZoneLifetimeEffect');
  assert.equal(effect.shape.lifetime,'finite');assert.equal(effect.shape.durationFieldId,1);
  assert.equal(effect.shape.fields.length,16);
  assert.deepEqual(effect.shape.fields.filter(f=>f.clrType==='System.UInt32').map(f=>[f.id,f.name]),[[10,'AuraGeneration']]);
  assert.deepEqual(effect.shape.instantWrites,[]);assert.deepEqual(effect.shape.contributions,[]);
  const source=files.get('Gameplay/BomberFireZoneLifetimeReducer.Server.cs').toString();
  assert.match(source,/\[EffectReducerField\(typeof\(BomberFireZoneState\), "UntilTick", 10124, 1\)\]/);
  assert.match(source,/\[EffectReducerField\(typeof\(BomberFireZoneState\), "LifetimeOutcome", 10124, 2\)\]/);
});
test('official v15 output admits typed birth/expiry and exact appended GAS entity slots',()=>{
  for(const name of ['fire_region_born','fire_region_expired']){
    const event=observed.identities.find(i=>i.kind==='event'&&i.value===name);
    assert.equal(event.shape.catalogKind,'Typed');
    assert.deepEqual(event.shape.fields.map(f=>f.name),
      ['Stamp','Context','Region','Source','SkillId','SkillLevel','ChainId','Center','Mask','FromTick','UntilTick']);
  }
  const slots=observed.identities.filter(i=>i.kind==='component-slot'&&i.owner.endsWith('.BomberFireZoneEntity'))
    .sort((a,b)=>a.value-b.value);
  assert.deepEqual(slots.map(i=>[i.value,i.shape.component.split('.').at(-1)]),
    [[0,'ObserverComponent'],[1,'LogicTransform'],[2,'BomberFireZoneState'],[3,'BomberHfsmState'],[4,'AttributeComponent'],[5,'EffectComponent']]);
});
test('official v15 byte review rejects changed finite codec/reducer/author and substituted SDK',()=>{
  for(const path of [
    'Gameplay/generated/server/BomberFireZoneLifetimeEffect.g.cs',
    'Gameplay/generated/client/BomberFireZoneLifetimeEffect.g.cs',
    'Gameplay/generated/server/GeneratedEffectReducers.g.cs',
    'Gameplay/Effects/BomberFireZoneLifetimeEffect.Server.cs',
    'Gameplay/BomberFavoriteFireZones.Server.cs',CANDIDATE_PACKAGE.sdkPath]){
    assert.ok(files.has(path));
    const changed=new Map(files);changed.set(path,Buffer.concat([files.get(path),Buffer.from(' ')]));
    assert.throws(()=>observeSnapshot(changed),e=>['v15_review_bytes','unsupported_source_shape'].includes(e.code));
  }
});
