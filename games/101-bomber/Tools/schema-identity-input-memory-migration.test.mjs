import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readLedgerStorage,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';

const game=fileURLToPath(new URL('../',import.meta.url));
const old='Gameplay/Compatibility/schema-identities.before-input-memory.json';
const priorBytes=readFileSync(join(game,existsSync(join(game,old))?old:'Gameplay/Compatibility/schema-identities.json'));
const read=path=>readFileSync(join(game,path));
const previous=readLedgerStorage(priorBytes,read);
const schema='bomber-v11-input-memory-candidate';
const observed={schema,identities:previous.active.map(identity=>({...identity,
  scope:identity.kind==='component-slot'?identity.scope.replace(previous.schema,schema):identity.scope,
  shape:{...identity.shape,schema}}))};
test('input-memory migration appends exact predecessor identities and preserves all twenty-four old pages',async()=>{
  const {prepareInputMemoryLedger}=await import('./schema-identity-input-memory-migration.mjs');
  const prepared=prepareInputMemoryLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision});
  const disk=JSON.parse(prepared.manifest);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,5762+653);
  assert.deepEqual(disk.retired.pages.slice(0,24),JSON.parse(priorBytes).retired.pages);
  for(const page of prepared.pages.values())assert.ok(page.length<=MAX_INPUT_BYTES);
  const next=readLedgerStorage(prepared.manifest,path=>prepared.pages.get(path)??read(path));
  const iterator=next.retired[Symbol.iterator]();
  for(const row of previous.retired)assert.deepEqual(iterator.next().value,row);
  for(const identity of previous.active)assert.deepEqual(iterator.next().value.identity,identity);
  assert.equal(iterator.next().done,true);
  assert.equal(prepareInputMemoryLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision}).manifest.equals(prepared.manifest),true);
});
test('input-memory migration refuses substituted predecessor manifest before reading any page',async()=>{
  const {prepareInputMemoryLedger}=await import('./schema-identity-input-memory-migration.mjs');
  assert.throws(()=>prepareInputMemoryLedger(Buffer.concat([priorBytes,Buffer.from(' ')]),()=>assert.fail('must reject before page read'),observed,{}),/predecessor/);
});
test('input-memory migration rejects a changed historical page and never emits a candidate',async()=>{
  const {prepareInputMemoryLedger}=await import('./schema-identity-input-memory-migration.mjs');
  const first=JSON.parse(priorBytes).retired.pages[0].path;
  assert.throws(()=>prepareInputMemoryLedger(priorBytes,path=>path===first?Buffer.from('{}'):read(path),observed,{}),error=>error.code==='retirement_page_hash_mismatch');
});

