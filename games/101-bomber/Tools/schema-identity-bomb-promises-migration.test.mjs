import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readLedgerStorage,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';

const game=fileURLToPath(new URL('../',import.meta.url));
const old='Gameplay/Compatibility/schema-identities.before-bomb-promises.json';
const priorBytes=readFileSync(join(game,existsSync(join(game,old))?old:'Gameplay/Compatibility/schema-identities.json'));
const read=path=>readFileSync(join(game,path));
const previous=readLedgerStorage(priorBytes,read);
const schema='bomber-v13-durable-bomb-promises-candidate';
const observed={schema,identities:previous.active.map(identity=>({...identity,
  scope:identity.kind==='component-slot'?identity.scope.replace(previous.schema,schema):identity.scope,
  shape:{...identity.shape,schema}}))};

test('bomb promise migration retains every v12 page and exact active shape including Pascal tombstones',async()=>{
  const {prepareBombPromisesLedger}=await import('./schema-identity-bomb-promises-migration.mjs');
  const prepared=prepareBombPromisesLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision});
  const disk=JSON.parse(prepared.manifest);
  assert.equal(disk.retired.count,7076+667);
  assert.deepEqual(disk.retired.pages.slice(0,30),JSON.parse(priorBytes).retired.pages);
  for(const page of prepared.pages.values())assert.ok(page.length<=MAX_INPUT_BYTES);
  const next=readLedgerStorage(prepared.manifest,path=>prepared.pages.get(path)??read(path));
  const iterator=next.retired[Symbol.iterator]();
  for(const row of previous.retired)assert.deepEqual(iterator.next().value,row);
  for(const identity of previous.active)assert.deepEqual(iterator.next().value.identity,identity);
  assert.equal(iterator.next().done,true);
  assert.ok(prepareBombPromisesLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision}).manifest.equals(prepared.manifest));
});
test('bomb promise migration rejects a changed exact predecessor without reading history pages',async()=>{
  const {prepareBombPromisesLedger}=await import('./schema-identity-bomb-promises-migration.mjs');
  assert.throws(()=>prepareBombPromisesLedger(Buffer.concat([priorBytes,Buffer.from(' ')]),()=>assert.fail('no page read'),observed,{}),/predecessor/);
});
test('bomb promise migration refuses modified historical page bytes',async()=>{
  const {prepareBombPromisesLedger}=await import('./schema-identity-bomb-promises-migration.mjs');
  const first=JSON.parse(priorBytes).retired.pages[0].path;
  assert.throws(()=>prepareBombPromisesLedger(priorBytes,path=>path===first?Buffer.from('{}'):read(path),observed,{}),error=>error.code==='retirement_page_hash_mismatch');
});
