import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readLedgerStorage,MAX_INPUT_BYTES,MAX_INDEX_BYTES,RetirementIndexBudget,createBoundedFileReader} from './schema-identity-storage.mjs';
import {validateLedger,compareHistory} from './schema-identity-model.mjs';
import {readBaseline} from './schema-identity-history.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalBytes = readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-strong-chest.json',import.meta.url));
const original = JSON.parse(originalBytes);
function paged(ledger) {
  const files = new Map();
  const pages = [];
  for(let start=0;start<ledger.retired.length;start+=256) {
    const rows = ledger.retired.slice(start,start+256);
    const path = `Gameplay/Compatibility/schema-retirements.test.${String(pages.length).padStart(4,'0')}.json`;
    const bytes = Buffer.from(JSON.stringify({formatVersion:1,start,rows})+'\n');
    files.set(path,bytes);
    pages.push({path,sha256:hash(bytes),bytes:bytes.length,start,count:rows.length});
  }
  const manifest = {...ledger,formatVersion:2,retired:{storage:'pages-v1',count:ledger.retired.length,pages}};
  return {manifest,files,read:()=>readLedgerStorage(Buffer.from(JSON.stringify(manifest)),path=>files.get(path))};
}
test('v1 ledger stays readable without changing any retirement',()=>{
  const loaded = readLedgerStorage(originalBytes,()=>assert.fail('v1 needs no page'));
  assert.deepEqual(loaded,original);
});
const revision=(root,ref)=>execFileSync('git',['--no-replace-objects','rev-parse',ref],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
test('paged Git baseline reads every page from its own commit despite later page corruption',()=>{
  const root=process.env.BOMBER_SCHEMA_TEST_HISTORY_ROOT;
  assert.ok(root,'BOMBER_SCHEMA_TEST_HISTORY_ROOT must name immutable paged history');
  const baseline=revision(root,'HEAD^'),loaded=readBaseline(root,baseline);
  assert.ok(loaded.files.length>1);
  assert.ok(loaded.files.every(file=>file.revision===baseline));
  assert.deepEqual(validateLedger(loaded.ledger),[]);
  assert.equal(loaded.ledger.retired.length,5762+653+661+667+680);
  assert.equal(loaded.files.length,37);
  const predecessor=readLedgerStorage(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-input-memory.json',import.meta.url)),path=>readFileSync(new URL('../'+path,import.meta.url)));
  assert.equal(predecessor.retired.length,5762);
  assert.deepEqual(compareHistory(predecessor,loaded.ledger),[]);
  assert.throws(()=>readBaseline(root,revision(root,'HEAD')),error=>error.code==='baseline_is_head');
});
test('paged Git baseline cannot borrow a repaired page from a later commit',()=>{
  const root=process.env.BOMBER_SCHEMA_TEST_MIXED_HISTORY_ROOT;
  assert.ok(root,'BOMBER_SCHEMA_TEST_MIXED_HISTORY_ROOT must name immutable mixed-commit history');
  assert.throws(()=>readBaseline(root,revision(root,'HEAD^')),error=>error.code==='retirement_page_hash_mismatch');
});
test('over-8-MiB exact history is accepted only as separately bounded pages',()=>{
  const ledger = structuredClone(original);
  ledger.retired.push(...original.active.map(identity=>({identity,retiredIn:'bomber-v9-strong-chest-candidate',reason:'Preserve exact pre-strong-chest identity and evidence.',replacement:null})));
  const bytes = Buffer.from(JSON.stringify(ledger));
  assert.ok(bytes.length>MAX_INPUT_BYTES);
  assert.throws(()=>readLedgerStorage(bytes,()=>null),e=>e.code==='candidate_too_large');
  const fixture = paged(ledger),loaded=fixture.read();
  assert.ok([...fixture.files.values()].every(bytes=>bytes.length<=MAX_INPUT_BYTES));
  assert.equal(loaded.formatVersion,1);
  const actual = loaded.retired[Symbol.iterator]();
  for(const expected of ledger.retired) assert.deepEqual(actual.next().value,expected);
  assert.equal(actual.next().done,true);
});
test('streamed v2 validates the same complete history as v1',()=>{
  const loaded=paged(original).read();
  assert.deepEqual(validateLedger(loaded),[]);
  assert.deepEqual(compareHistory(original,loaded),[]);
  assert.deepEqual(compareHistory(loaded,original),[]);
});
test('duplicate retirement in another page is still rejected',()=>{
  const ledger=structuredClone(original);
  ledger.retired.push(structuredClone(ledger.retired[0]));
  assert.ok(validateLedger(paged(ledger).read()).some(d=>d.code==='duplicate_retirement'));
});
test('streaming does not weaken immutable prior retirement checks',()=>{
  const ledger=structuredClone(original);
  ledger.retired.at(-1).reason+=' changed';
  assert.ok(compareHistory(paged(original).read(),paged(ledger).read()).some(d=>d.code==='retirement_changed'));
});
for(const [name,change,code] of [
  ['tampered bytes',fixture=>fixture.files.set(fixture.manifest.retired.pages[0].path,Buffer.from('{}')),'retirement_page_hash_mismatch'],
  ['missing page',fixture=>fixture.files.delete(fixture.manifest.retired.pages[0].path),'missing_retirement_page'],
  ['reordered pages',fixture=>fixture.manifest.retired.pages.reverse(),'retirement_page_order'],
  ['duplicate path',fixture=>fixture.manifest.retired.pages[1].path=fixture.manifest.retired.pages[0].path,'duplicate_retirement_page'],
  ['external path',fixture=>fixture.manifest.retired.pages[0].path='../outside.json','invalid_retirement_page_reference'],
  ['absolute path',fixture=>fixture.manifest.retired.pages[0].path='C:/outside.json','invalid_retirement_page_reference'],
  ['wrong total',fixture=>fixture.manifest.retired.count++,'retirement_page_count'],
  ['overlarge page',fixture=>fixture.manifest.retired.pages[0].bytes=MAX_INPUT_BYTES+1,'invalid_retirement_page_reference'],
  ['unknown field',fixture=>fixture.manifest.retired.pages[0].other=true,'invalid_retirement_page_reference'],
])test(`paged reader rejects ${name}`,()=>{
  const fixture=paged(original);change(fixture);
  assert.throws(fixture.read,error=>error.code===code);
});
test('an authenticated page cannot change between streaming passes',()=>{
  const fixture=paged(original),loaded=fixture.read(),first=fixture.manifest.retired.pages[0];
  fixture.files.set(first.path,Buffer.from('{}'));
  assert.throws(()=>{for(const row of loaded.retired)void row;},error=>error.code==='retirement_page_hash_mismatch');
});
test('comparison index refuses growth before exceeding its independent bound',()=>{
  const budget=new RetirementIndexBudget();
  let count=0,last=0;
  assert.throws(()=>{for(;;){last=budget.bytes;budget.reserve([String(count++)+'x'.repeat(16384)]);}},error=>error.code==='retirement_index_capacity');
  assert.equal(budget.bytes,last);
  assert.ok(budget.bytes<=MAX_INDEX_BYTES);
  assert.ok(count>1);
});
test('production physical reader rejects changed bytes and links outside the root',()=>{
  const base=new URL('../.artifacts/resume-20261002/storage-tests/',import.meta.url);
  mkdirSync(base,{recursive:true});
  const root=mkdtempSync(new URL('root-',base)),outside=mkdtempSync(new URL('outside-',base));
  writeFileSync(join(root,'input.json'),'{}');writeFileSync(join(outside,'input.json'),'{}');
  const reader=createBoundedFileReader(root);
  assert.equal(reader.read('input.json').toString(),'{}');
  writeFileSync(join(root,'input.json'),'[]');
  assert.throws(reader.assertUnchanged,error=>error.code==='input_changed');
  symlinkSync(outside,join(root,'external'),'junction');
  assert.throws(()=>reader.read('external/input.json'),error=>error.code==='external_audit_input');
});
