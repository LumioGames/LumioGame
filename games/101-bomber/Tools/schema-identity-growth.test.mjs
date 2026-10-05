import {loadTestLedger} from './schema-identity-test-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readObservation,readObservationInputs,observeSnapshot} from './schema-identity-read.mjs';
import {validateLedger,compareHistory,compareObserved,identityKey} from './schema-identity-model.mjs';
const root=new URL('../',import.meta.url);
const beforeBytes=await readFile(new URL('Gameplay/Compatibility/schema-identities.before-growth-candidate.json',root));
const before=JSON.parse(beforeBytes);
const next=loadTestLedger(new URL('Gameplay/Compatibility/schema-identities.json',root));
const growthBytes=await readFile(new URL('Gameplay/Compatibility/schema-identities.before-terrain-growth-growth.json',root));
const growth=JSON.parse(growthBytes);
const terrainBytes=await readFile(new URL('Gameplay/Compatibility/schema-identities.before-terrain-growth-terrain.json',root));
const terrain=JSON.parse(terrainBytes);
const historicalUnion=JSON.parse(await readFile(new URL('Gameplay/Compatibility/schema-identities.before-root-history.json',root)));
const observed=await readObservation(fileURLToPath(root));
test('growth preserves all original 4224 identity shapes, ordinals and tombstones without release approval',()=>{
  assert.equal(createHash('sha256').update(beforeBytes).digest('hex'),'56d05c2677ceb087302d266ab0cd5a63049b68eb593059c69d83d87ef372ebbb');
  assert.equal(before.active.length,550);assert.equal(before.retired.length,806);
  assert.equal(growth.active.length,561);assert.equal(growth.retired.length,1356);
  assert.deepEqual(growth.retired.slice(0,806),before.retired);
  assert.deepEqual(growth.retired.slice(806).map(r=>r.identity),before.active);
  assert.deepEqual(next.pending,before.pending);
  assert.equal(next.freezeEligible,false);
  assert.deepEqual(validateLedger(next),[]);
  assert.deepEqual(compareHistory(before,next),[]);
  assert.deepEqual(compareHistory(growth,next),[]);
  assert.deepEqual(compareHistory(terrain,next),[]);
  assert.deepEqual(compareObserved(next,observed),[]);
  for(const old of before.active.filter(i=>i.kind==='scalar'||i.kind==='container')) {
    const now=growth.active.find(i=>identityKey(i)===identityKey(old));
    assert.equal(now.shape.ordinal,old.shape.ordinal,old.value);
  }
});

test('terrain-growth union preserves every exact branch edge and both complete predecessor inventories',()=>{
  assert.deepEqual(compareHistory(historicalUnion,next),[]);
  // These exact assertions describe the captured v6 union, whose full inventory
  // remains a required predecessor of the current finite lifecycle candidate.
  const union=historicalUnion;
  assert.equal(createHash('sha256').update(growthBytes).digest('hex'),'3ca71dcbecd294417198f5e825ec1cb502ccd35203a077bda4624189820ea5b8');
  assert.equal(createHash('sha256').update(terrainBytes).digest('hex'),'936a34dc8913b968c25ae81634281f63d7fd586c38521a93d82edcce167193dd');
  assert.equal(union.schema,'bomber-v6-terrain-growth-candidate');
  assert.equal(union.active.length,611);assert.equal(union.retired.length,3034);assert.equal(union.transitions.length,10);
  const debts=union.active.find(i=>i.kind==='container'&&i.value==='BomberRespawnCarry.deferredDeathDebts');
  assert.ok(debts);
  assert.equal(debts.shape.maxCapacity,698);
  const edgeKey=r=>JSON.stringify([identityKey(r.identity),r.identity.shape.schema,r.retiredIn]);
  const actual=new Map(union.retired.map(r=>[edgeKey(r),r]));
  const historical=new Map([...before.retired,...terrain.retired,...growth.retired].map(r=>[edgeKey(r),r]));
  for(const [key,row] of historical)assert.deepEqual(actual.get(key),row);
  for(const branch of [terrain,growth]) {
    const edges=union.retired.filter(r=>r.identity.shape.schema===branch.schema&&r.retiredIn===union.schema);
    assert.equal(edges.length,branch.active.length);
    for(const identity of branch.active)assert.deepEqual(edges.find(r=>identityKey(r.identity)===identityKey(identity)).identity,identity);
    const corrupted=structuredClone(union);
    corrupted.retired=corrupted.retired.filter(r=>r.identity.shape.schema!==branch.schema);
    assert.ok(compareHistory(branch,corrupted).length>0);
    assert.ok(validateLedger(corrupted).length>0);
  }
  assert.equal(union.retired.length,historical.size+terrain.active.length+growth.active.length);
  assert.deepEqual(compareHistory(union,next),[]);
});
test('growth fields expose only live holdings and use appended private health columns',()=>{
  const field=key=>next.active.find(i=>i.value===key).shape;
  for(const name of ['maximumHealth','goldenHeartCount'])assert.equal(field('BomberPlayerState.'+name).scope,'Aoi');
  assert.equal(field('BomberRespawnCarry.pendingGoldenHearts').scope,'None');
  assert.equal(field('BomberHealthFacts.item').ordinal,16);
  assert.equal(field('BomberHealthFacts.upgradeAfter').ordinal,24);
  assert.equal(field('BomberHealthFacts.item').scope,'None');
  for(const id of [10102,10103])assert.deepEqual(next.active.find(i=>i.kind==='effect-type'&&i.value===id).shape.fields.slice(8,17).map(f=>f.id),[9,10,11,12,13,14,15,16,17]);
});
test('round reset adds only unused Effect 10104 and retains every composed identity shape and historical obligation',async()=>{
  const bytes=await readFile(new URL('Gameplay/Compatibility/schema-identities.before-round-lifecycle.json',root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'ad044dc1a153ca4032bbe469e49ebc3d07e0328dfd6ca4be089d2ea86af1277b');
  const prior=JSON.parse(bytes);
  const roundNext=JSON.parse(await readFile(new URL('Gameplay/Compatibility/schema-identities.before-successor-consumer.json',root)));
  assert.deepEqual(compareHistory(roundNext,next),[]);
  assert.equal(prior.active.length,578);
  assert.deepEqual(compareHistory(prior,roundNext),[]);
  assert.deepEqual(prior.retired,roundNext.retired);
  assert.deepEqual(prior.transitions,roundNext.transitions);
  assert.deepEqual(prior.pending,roundNext.pending);
  assert.ok([...prior.active,...prior.retired.map(r=>r.identity)].every(i=>i.kind!=='effect-type'||i.value!==10104));
  for(const old of prior.active) {
    const current=roundNext.active.find(i=>identityKey(i)===identityKey(old));
    assert.equal(current.owner,old.owner);
    assert.deepEqual(current.shape,old.shape);
  }
  const additions=roundNext.active.filter(i=>!prior.active.some(old=>identityKey(old)===identityKey(i)));
  assert.equal(additions.length,1);
  assert.equal(additions[0].kind,'effect-type');
  assert.equal(additions[0].value,10104);
  assert.deepEqual(additions[0].shape.instantWrites,[1,2,3,4,5]);
  assert.deepEqual(additions[0].shape.fields.slice(17).map(f=>[f.id,f.name,f.clrType]),
    [[18,'PowerSeed','System.Int64'],[19,'CapacitySeed','System.Int64'],[20,'SpeedTierSeed','System.Int64']]);
});
test('gold count, health payload selector and generated projection mutation fail the canonical audit',async()=>{
  const files=await readObservationInputs(fileURLToPath(root));
  for(const [path,from,to] of [
    ['Gameplay/Components/Bomber/BomberHealthFacts.cs','PayloadFieldId = 13','PayloadFieldId = 14'],
    ['Gameplay/generated/server/BomberPlayerState.g.cs','writer.WriteInt32("BomberPlayerState.goldenHeartCount", GoldenHeartCount.Value);',''],
    ['Gameplay/generated/client/BomberPlayerState.g.cs','writer.WriteInt32("BomberPlayerState.maximumHealth", MaximumHealth.Value);',''],
  ]) {
    const text=files.get(path).toString();assert.ok(text.includes(from));
    const mutation=new Map(files);mutation.set(path,Buffer.from(text.replace(from,to)));
    assert.throws(()=>observeSnapshot(mutation),e=>e.code==='unsupported_source_shape');
  }
  const corrupted=structuredClone(next);corrupted.retired.at(-1).reason+=' changed';
  assert.ok(compareHistory(next,corrupted).some(d=>d.code==='retirement_changed'));
});
