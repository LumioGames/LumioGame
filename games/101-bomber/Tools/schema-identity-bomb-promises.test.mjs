import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readLedgerStorage,MAX_INPUT_BYTES,MAX_INDEX_BYTES} from './schema-identity-storage.mjs';
import {compareHistory,validateLedger} from './schema-identity-model.mjs';

const priorBytes=readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-bomb-promises.json',import.meta.url));
const priorDisk=JSON.parse(priorBytes);
const read=path=>readFileSync(new URL('../'+path,import.meta.url));

test('immutable v13 identities retain exactly the thirteen durable bomb and barrel additions',()=>{
  const bytes=read('Gameplay/Compatibility/schema-identities.before-m2-producers.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'0a15a9e69cff29c83915493472c7583977a585f3e850548ad49adfee48ca7e36');
  const ledger=readLedgerStorage(bytes,read),observed={schema:ledger.schema,identities:ledger.active};
  assert.equal(observed.schema,'bomber-v13-durable-bomb-promises-candidate');
  assert.equal(observed.identities.length,680);assert.equal(priorDisk.active.length,667);
  const key=identity=>JSON.stringify([identity.kind,identity.owner,identity.value]);
  const priorKeys=new Set(priorDisk.active.map(key));
  const additions=observed.identities.filter(identity=>!priorKeys.has(key(identity)));
  assert.equal(additions.length,13);
  for(const [component,names,first] of [
    ['BomberBombState',['futureChildren','splitSubmittedMask','splitResolvedMask','childDirection','promiseToken'],24],
    ['BomberWorldRuntime',['barrelBombPromises'],11],
    ['BomberBarrelState',['resourceGeneration','initialResourceMatch','initialResourceCell'],0],
  ])for(const [offset,name] of names.entries()){
    const field=additions.find(identity=>identity.value===component+'.'+name);assert.ok(field,name);
    assert.equal(field.kind,'scalar');assert.equal(field.shape.ordinal,first+offset);
    assert.equal(field.shape.scope,'None');assert.equal(field.shape.authority,'Server');
    for(const side of ['server','client'])assert.deepEqual(field.shape.serialization[side],{capturePersist:true,captureSync:false,restorePersist:true});
  }
  assert.equal(additions.filter(identity=>identity.kind==='component'&&identity.owner.endsWith('.BomberBarrelState')).length,1);
  assert.ok(additions.find(identity=>identity.kind==='entity-wire'&&identity.value==='bomberBarrel'));
  assert.ok(additions.find(identity=>identity.kind==='entity-alias'&&identity.value==='BomberBarrelEntity'));
  assert.equal(additions.filter(identity=>identity.kind==='component-slot'&&identity.owner.endsWith('.BomberBarrelEntity')).length,1);
});

test('v13 preserves the complete v12 and Pascal retirement history within the unchanged input and index bounds',()=>{
  const disk=read('Gameplay/Compatibility/schema-identities.before-m2-producers.json'),nextDisk=JSON.parse(disk);
  assert.equal(MAX_INPUT_BYTES,8388608);assert.equal(MAX_INDEX_BYTES,8388608);
  assert.equal(nextDisk.retired.count,7743);assert.equal(nextDisk.retired.pages.length,33);
  assert.deepEqual(nextDisk.retired.pages.slice(0,30),priorDisk.retired.pages);
  const prior=readLedgerStorage(priorBytes,read),next=readLedgerStorage(disk,read);
  assert.deepEqual(validateLedger(next),[]);assert.deepEqual(compareHistory(prior,next),[]);
});
