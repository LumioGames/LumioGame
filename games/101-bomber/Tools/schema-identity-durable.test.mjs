import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {readObservation,SCHEMA} from './schema-identity-read.mjs';

const game=fileURLToPath(new URL('../',import.meta.url));
test('official generated durable results append thirteen identities without shifting existing ordinals',async()=>{
  const observed=await readObservation(game);
  assert.equal(observed.schema,SCHEMA);
  const field=key=>{const found=observed.identities.find(i=>i.value===key);assert.ok(found,key);return found;};
  assert.equal(field('BomberStatistics.evolutions').shape.ordinal,8);
  for(const [name,ordinal] of [['deaths',9],['peakHealthPoints',10],['bossKills',11],['clutchEscapes',12],['goldenHeartPickups',13],['characterId',14]]){
    const shape=field('BomberStatistics.'+name).shape;
    assert.equal(shape.ordinal,ordinal);assert.equal(shape.scope,'Room');assert.equal(shape.authority,'Server');
    for(const side of ['server','client'])assert.deepEqual(shape.serialization[side],{capturePersist:true,captureSync:true,restorePersist:true});
  }
  const history=field('BomberStatistics.specialBombHistory');
  assert.equal(history.kind,'container');assert.equal(history.shape.elementType,'System.UInt32');
  assert.equal(history.shape.maxCapacity,6);assert.equal(history.shape.ordinal,15);
  for(const name of ['deaths','peakHealthPoints','bossKills','clutchEscapes','goldenHeartPickups','specialBombHistories']){
    const shape=field('BomberResults.'+name).shape;
    assert.equal(shape.scope,'Room');assert.equal(shape.authority,'Server');assert.equal(shape.maxCapacity,32);
  }
  assert.ok(observed.identities.some(i=>i.kind==='event'&&i.value==='crate_opened'));
});
test('all 638 predecessor identity shapes stay intact while thirteen fields and two chest identities append',async()=>{
  const prior=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-durable-results.json',import.meta.url)));
  const observed={identities:JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-input-memory.json',import.meta.url))).active};
  const key=i=>JSON.stringify([i.kind,i.owner,i.value]);
  const oldKeys=new Set(prior.active.map(key));
  assert.equal(prior.active.length,638);
  const added=observed.identities.filter(i=>!oldKeys.has(key(i)));
  assert.equal(added.filter(i=>['scalar','container'].includes(i.kind)).length,13);
  assert.deepEqual(added.filter(i=>!['scalar','container'].includes(i.kind)).map(i=>[i.kind,i.value]),[
    ['event-type','Lumio.Bomber.Gameplay.Contracts.Events.ResourceCrateOpened'],['event','crate_opened'],
  ]);
  for(const before of prior.active){
    const after=observed.identities.find(i=>key(i)===key(before));assert.ok(after,key(before));
    const oldShape=structuredClone(before.shape),newShape=structuredClone(after.shape);
    delete oldShape.schema;delete newShape.schema;
    // Only independently byte-pinned external package provenance may refresh.
    if(oldShape.origin?.kind==='external')for(const name of ['engineRevision','runtimeRevision','package'])
      oldShape.origin[name]=newShape.origin[name];
    assert.deepEqual(newShape,oldShape,key(before));
  }
});
