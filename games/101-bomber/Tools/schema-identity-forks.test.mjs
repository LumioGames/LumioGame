import assert from 'node:assert/strict';
import test from 'node:test';
import {identityKey,validateLedger,compareHistory} from './schema-identity-model.mjs';

const base='bomber-v4-container-candidate';
const terrain='bomber-v5-terrain-candidate';
const growth='bomber-v5-growth-candidate';
const combined='bomber-v6-terrain-growth-candidate';
const evidence=[{repo:'LumioGame',revision:'sha256:'+'1'.repeat(64),path:'source.txt'}];
const identity=schema=>({kind:'config-symbol',scope:'101-bomber/config-symbols',value:'hatPileExpireMs',
  owner:'Lumio.Bomber.Configuration',shape:{schema,symbol:'hatPileExpireMs',evidenceKind:'specification-symbol'},evidence});
const edge=(from,to)=>({from,to,breaking:true,reason:'Candidate migration',releaseDecision:null});
const retirement=(from,to)=>({identity:identity(from),retiredIn:to,reason:'Preserve exact source',replacement:identityKey(identity(to))});
function ledger(schema,retired=[],transitions=[]){return {
  formatVersion:1,schema,status:'audit-draft',engineRevision:'2'.repeat(40),runtimeRevision:'3'.repeat(40),
  active:[identity(schema)],retired,transitions,freezeEligible:false,
  pending:['tag','P','T','F','B135','successor-binding','release-decision'].map(domain=>({domain,reason:'Unapproved',evidence,
    ...(domain==='tag'?{representation:'projection-field-string',gameVocabularyStatus:'unbound'}:{})}))};}
function fixture(){return ledger(combined,
  [retirement('bomber-v3',base),retirement(base,terrain),retirement(base,growth),retirement(terrain,combined),retirement(growth,combined)],
  [edge('bomber-v3',base),edge(base,terrain),edge(base,growth),edge(terrain,combined),edge(growth,combined)]);}
const codes=value=>validateLedger(value).map(d=>d.code);

test('fork union retains both exact predecessor histories and validates every path',()=>{
  const next=fixture();assert.deepEqual(validateLedger(next),[]);
  for(const side of [terrain,growth]){
    const prior=ledger(side,[retirement('bomber-v3',base),retirement(base,side)],[edge('bomber-v3',base),edge(base,side)]);
    assert.deepEqual(validateLedger(prior),[]);assert.deepEqual(compareHistory(prior,next),[]);
  }
});
for(const member of ['shape','evidence'])test(`fork rejects differing source ${member}`,()=>{
  const next=structuredClone(fixture());
  if(member==='shape')next.retired[2].identity.shape.evidenceKind='changed';
  else next.retired[2].identity.evidence=[{...evidence[0],revision:'sha256:'+'4'.repeat(64)}];
  assert.ok(codes(next).includes(member==='shape'?'invalid_shape':'retirement_source_changed'));
});
test('missing replacement on second fork is rejected',()=>{
  const next=fixture();next.retired=next.retired.filter(r=>r.identity.shape.schema!==growth);
  assert.ok(codes(next).includes('missing_replacement'));
});
test('duplicate retirement edge is rejected even when identical',()=>{
  const next=fixture();next.retired.push(structuredClone(next.retired[1]));
  assert.ok(codes(next).includes('duplicate_retirement'));
});
test('replacement branch cannot transfer owner',()=>{
  const next=structuredClone(fixture());next.retired[4].identity.owner='Other.Configuration';
  assert.ok(codes(next).includes('identity_owner_changed'));
});
test('permanently reserved identity cannot become active',()=>{
  const next=fixture();next.retired[2].replacement=null;
  assert.ok(codes(next).includes('retired_identity_reused'));
});
test('cycle on a fork is rejected',()=>{
  const next=fixture();next.transitions.push(edge(growth,base));next.retired.push(retirement(growth,base));
  assert.ok(codes(next).includes('transition_cycle'));assert.ok(codes(next).includes('replacement_cycle'));
});
test('compareHistory refuses missing or changed predecessor edge',()=>{
  const prior=ledger(growth,[retirement(base,growth)],[edge(base,growth)]);
  const missing=fixture();missing.retired=missing.retired.filter(r=>r.retiredIn!==growth);
  assert.ok(compareHistory(prior,missing).some(d=>d.code==='missing_retirement'));
  const changed=fixture();changed.retired.find(r=>r.retiredIn===growth).reason='rewritten';
  assert.ok(compareHistory(prior,changed).some(d=>d.code==='retirement_changed'));
});
