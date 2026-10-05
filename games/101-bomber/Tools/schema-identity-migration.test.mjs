import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLedger,compareHistory,identityKey} from './schema-identity-model.mjs';
const prior=JSON.parse(await readFile(new URL('../Gameplay/Compatibility/schema-identities.before-container-candidate.json',import.meta.url)));
function candidate(){const n=structuredClone(prior);n.schema='bomber-v4-container-candidate';n.active=n.active.map(i=>{i=structuredClone(i);i.shape.schema=n.schema;if(i.kind==='component-slot')i.scope=i.scope.replace('bomber-v3',n.schema);if(i.kind==='container'){i.shape.maxCapacity=128;i.shape.ordinal=prior.active.filter(x=>x.owner===i.owner&&x.kind==='scalar').length+prior.active.filter(x=>x.owner===i.owner&&x.kind==='container').findIndex(x=>x.value===i.value);}return i;});n.transitions.push({from:prior.schema,to:n.schema,breaking:true,reason:'Candidate capacity migration',releaseDecision:null});n.retired.push(...prior.active.map((i,k)=>({identity:structuredClone(i),retiredIn:n.schema,reason:'Preserve prior audited shape',replacement:identityKey(n.active[k])})));return n;}
test('recorded multihop replacement chain preserves prior tombstones',()=>{const n=candidate();assert.deepEqual(validateLedger(n),[]);assert.deepEqual(compareHistory(prior,n),[]);assert.deepEqual(n.retired.slice(0,prior.retired.length),prior.retired);});
test('missing and forged transitions fail',()=>{for(const change of [n=>n.transitions.pop(),n=>n.transitions.at(-1).from='invented']){const n=candidate();change(n);assert.ok(validateLedger(n).length);}});
test('cycles fail',()=>{const n=candidate();n.transitions.push({from:n.schema,to:prior.schema,breaking:true,reason:'cycle',releaseDecision:null});assert.ok(validateLedger(n).some(d=>d.code==='transition_cycle'));});
test('replacement cannot transfer owner',()=>{const n=candidate();const i=n.active.find(i=>i.kind==='ability');i.owner=i.shape.clrType='Other.Ability';assert.ok(validateLedger(n).some(d=>d.code==='identity_owner_changed'));});
test('prior retirement remains immutable',()=>{const n=candidate();n.retired[0].reason+=' changed';assert.ok(compareHistory(prior,n).some(d=>d.code==='retirement_changed'));});

import {parseComponent,tokenize} from './schema-identity-read.mjs';
const declaration=body=>({suffix:[':', 'Component'],body:tokenize(body),path:'test-only/Capacity.cs',name:'Capacity'});
test('candidate parser requires positive explicit container capacity and preserves scalar ordinals',()=>{
  const parse=body=>parseComponent(declaration(body),x=>({int:'System.Int32',uint:'System.UInt32'})[x]);
  const fields=parse('[Persist] public SyncList<int> Values = new(Scope.Room, 128, Authority.Server); public Sync<uint> Count = new(Scope.Room, Authority.Server);');
  assert.equal(fields[0].shape.maxCapacity,128);assert.equal(fields[0].shape.ordinal,1);assert.equal(fields[1].shape.ordinal,0);assert.equal(fields[1].shape.wireType,'u32');
  for(const capacity of ['', '0, ', '2147483648, '])assert.throws(()=>parse('public SyncList<int> Values = new(Scope.Room, '+capacity+'Authority.Server);'),e=>e.code==='unsupported_source_shape');
  assert.throws(()=>parse('public Sync<int> Count = new(Scope.Room, 10, Authority.Server);'),e=>e.code==='unsupported_source_shape');
});

import {hash} from './schema-identity-history.mjs';
test('actual container migration retains immutable v3 shapes after later typed Effect additions',async()=>{
  const bytes=await readFile(new URL('../Gameplay/Compatibility/schema-identities.before-container-candidate.json',import.meta.url));
  assert.equal(hash(bytes),'5d0b9990adab9cf84e9a1719991d8c0eaebfcc9709b73543ab30ac5d7f9f4092');
  const n=JSON.parse(await readFile(new URL('../Gameplay/Compatibility/schema-identities.before-growth-candidate.json',import.meta.url)));
  assert.equal(prior.active.length,463);assert.equal(prior.retired.length,343);
  assert.equal(n.schema,'bomber-v4-container-candidate');assert.equal(n.active.length,550);assert.equal(n.retired.length,806);
  assert.deepEqual(n.retired.slice(0,343),prior.retired);
  assert.deepEqual(n.retired.slice(343).map(r=>r.identity),prior.active);
  // The immutable pre-growth v4 checkpoint includes the subsequent typed Effect integration.
  // It discharged only the absent-type inventory gate; all other historical gates remain exact.
  assert.deepEqual(n.pending,prior.pending.filter(p=>p.domain!=='effect-type'));
  assert.deepEqual(n.active.filter(i=>i.kind==='effect-type').map(i=>i.value).sort(),[10101,10102,10103]);
  assert.deepEqual(validateLedger(n),[]);assert.deepEqual(compareHistory(prior,n),[]);
  const missing=structuredClone(n);missing.retired=missing.retired.filter(r=>r.identity.shape.schema!=='bomber-v3');
  assert.ok(validateLedger(missing).some(d=>d.code==='missing_replacement'));
  assert.equal(compareHistory(prior,missing).filter(d=>d.code==='missing_prior_shape_retirement').length,463);
});
