import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readLedgerStorage,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';
const game=fileURLToPath(new URL('../',import.meta.url));
const path='Gameplay/Compatibility/schema-identities.before-m2-producers.json';
const bytes=readFileSync(join(game,path));
const read=path=>readFileSync(join(game,path));
const previous=readLedgerStorage(bytes,read);
const schema='bomber-v14-m2-bounded-producers-candidate';
const observed={schema,identities:previous.active.map(identity=>({...identity,
 scope:identity.kind==='component-slot'?identity.scope.replace(previous.schema,schema):identity.scope,
 shape:{...identity.shape,schema}}))};

test('M2 producer migration retains all thirty-three v13 pages and every exact previous active identity',async()=>{
 const {prepareM2ProducersLedger}=await import('./schema-identity-m2-producers-migration.mjs');
 const prepared=prepareM2ProducersLedger(bytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision});
 const disk=JSON.parse(prepared.manifest);
 assert.equal(disk.retired.count,7743+680);
 assert.deepEqual(disk.retired.pages.slice(0,33),JSON.parse(bytes).retired.pages);
 for(const page of prepared.pages.values())assert.ok(page.length<=MAX_INPUT_BYTES);
 const next=readLedgerStorage(prepared.manifest,path=>prepared.pages.get(path)??read(path));
 const iterator=next.retired[Symbol.iterator]();
 for(const row of previous.retired)assert.deepEqual(iterator.next().value,row);
 for(const identity of previous.active)assert.deepEqual(iterator.next().value.identity,identity);
 assert.equal(iterator.next().done,true);
 assert.ok(prepareM2ProducersLedger(bytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision}).manifest.equals(prepared.manifest));
});
test('M2 producer migration rejects a changed exact predecessor before opening history pages',async()=>{
 const {prepareM2ProducersLedger}=await import('./schema-identity-m2-producers-migration.mjs');
 assert.throws(()=>prepareM2ProducersLedger(Buffer.concat([bytes,Buffer.from(' ')]),()=>assert.fail('no page read'),observed,{}),/predecessor/);
});
test('M2 producer migration refuses modified historical page bytes',async()=>{
 const {prepareM2ProducersLedger}=await import('./schema-identity-m2-producers-migration.mjs');
 const first=JSON.parse(bytes).retired.pages[0].path;
 assert.throws(()=>prepareM2ProducersLedger(bytes,path=>path===first?Buffer.from('{}'):read(path),observed,{}),error=>error.code==='retirement_page_hash_mismatch');
});
