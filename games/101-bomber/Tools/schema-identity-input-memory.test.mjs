import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readObservation,SCHEMA} from './schema-identity-read.mjs';

test('all eight input memories append privately with exact persist and no sync on both sides',async()=>{
  const observed=await readObservation(fileURLToPath(new URL('../',import.meta.url)));
  assert.equal(observed.schema,SCHEMA);
  const names=['inputMemoryMatchId','pendingTurnDirection','pendingTurnUntilTick','lastMoveDirection',
    'lastMoveTick','lastAssistTick','assistToleranceMilli','pendingPlaceUntilTick'];
  for(const [i,name] of names.entries()){
    const field=observed.identities.find(x=>x.value==='BomberPlayerState.'+name);
    assert.ok(field,name);assert.equal(field.kind,'scalar');assert.equal(field.shape.ordinal,15+i);
    assert.equal(field.shape.scope,'None');assert.equal(field.shape.authority,'Server');
    for(const side of ['server','client'])assert.deepEqual(field.shape.serialization[side],
      {capturePersist:true,captureSync:false,restorePersist:true});
  }
  // Compare the exact v10 -> v11 transition against its immutable v11 capture;
  // the current projection additionally has the reviewed v12 button/attribute changes.
  const prior=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-input-memory.json',import.meta.url)));
  const v11=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-button-input.json',import.meta.url)));
  const key=x=>JSON.stringify([x.kind,x.owner,x.value]);
  assert.equal(prior.active.length,653);assert.equal(v11.active.length,661);assert.ok(observed.identities.length>=680);
  for(const before of prior.active){
    const after=v11.active.find(x=>key(x)===key(before));assert.ok(after,key(before));
    const a=structuredClone(before.shape),b=structuredClone(after.shape);delete a.schema;delete b.schema;
    if(a.origin?.kind==='external')for(const name of ['engineRevision','runtimeRevision','package'])a.origin[name]=b.origin[name];
    assert.deepEqual(b,a,key(before));
  }
});
