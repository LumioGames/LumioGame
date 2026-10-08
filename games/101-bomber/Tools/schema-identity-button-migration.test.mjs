import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readLedgerStorage,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';

const game=fileURLToPath(new URL('../',import.meta.url));
const old='Gameplay/Compatibility/schema-identities.before-button-input.json';
const priorBytes=readFileSync(join(game,existsSync(join(game,old))?old:'Gameplay/Compatibility/schema-identities.json'));
const read=path=>readFileSync(join(game,path));
const previous=readLedgerStorage(priorBytes,read);
const schema='bomber-v12-button-canonical-attributes-candidate';
const observed={schema,identities:previous.active.map(identity=>({...identity,
  scope:identity.kind==='component-slot'?identity.scope.replace(previous.schema,schema):identity.scope,
  shape:{...identity.shape,schema}}))};

test('button migration retains every v11 page and appends all exact predecessor identities',async()=>{
  const {prepareButtonLedger}=await import('./schema-identity-button-migration.mjs');
  const prepared=prepareButtonLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision});
  const disk=JSON.parse(prepared.manifest);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,6415+661);
  assert.deepEqual(disk.retired.pages.slice(0,27),JSON.parse(priorBytes).retired.pages);
  for(const page of prepared.pages.values())assert.ok(page.length<=MAX_INPUT_BYTES);
  const next=readLedgerStorage(prepared.manifest,path=>prepared.pages.get(path)??read(path));
  const iterator=next.retired[Symbol.iterator]();
  for(const row of previous.retired)assert.deepEqual(iterator.next().value,row);
  for(const identity of previous.active)assert.deepEqual(iterator.next().value.identity,identity);
  assert.equal(iterator.next().done,true);
  assert.ok(prepareButtonLedger(priorBytes,read,observed,{engine:previous.engineRevision,runtime:previous.runtimeRevision}).manifest.equals(prepared.manifest));
});
test('button migration refuses a substituted predecessor before reading any page',async()=>{
  const {prepareButtonLedger}=await import('./schema-identity-button-migration.mjs');
  assert.throws(()=>prepareButtonLedger(Buffer.concat([priorBytes,Buffer.from(' ')]),()=>assert.fail('no page read'),observed,{}),/predecessor/);
});
test('button migration rejects modified historical pages without emitting a ledger',async()=>{
  const {prepareButtonLedger}=await import('./schema-identity-button-migration.mjs');
  const first=JSON.parse(priorBytes).retired.pages[0].path;
  assert.throws(()=>prepareButtonLedger(priorBytes,path=>path===first?Buffer.from('{}'):read(path),observed,{}),error=>error.code==='retirement_page_hash_mismatch');
});
