import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import * as model from './schema-identity-model.mjs';

const oldSchema='bomber-v3', currentSchema='bomber-v6-terrain-growth-candidate';
const evidence=[{repo:'LumioGame',revision:'sha256:'+'1'.repeat(64),path:'source.txt'}];
const identity=schema=>({kind:'config-symbol',scope:'101-bomber/config-symbols',value:'hatPileExpireMs',owner:'Lumio.Bomber.Configuration',shape:{schema,symbol:'hatPileExpireMs',evidenceKind:'specification-symbol'},evidence});
const ledger=(schema,active)=>({formatVersion:1,schema,status:'audit-draft',engineRevision:'2'.repeat(40),runtimeRevision:'3'.repeat(40),active,retired:[],transitions:[],freezeEligible:false,pending:['tag','P','T','F','B135','successor-binding','release-decision'].map(domain=>({domain,reason:'Unapproved',evidence,...(domain==='tag'?{representation:'projection-field-string',gameVocabularyStatus:'unbound'}:{})}))});
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture() {
  const original=identity(oldSchema), variant=structuredClone(original);
  variant.evidence[0].revision='sha256:'+'4'.repeat(64);
  const prior=ledger(oldSchema,[variant]), bytes=Buffer.from(JSON.stringify(prior));
  const sourceSnapshot={path:'Gameplay/Compatibility/schema-identities.root-before-integration.json',sha256:hash(bytes)};
  const next=ledger(currentSchema,[identity(currentSchema)]);
  next.transitions=[{from:oldSchema,to:currentSchema,breaking:true,reason:'Preserve both actual local histories',releaseDecision:null}];
  next.retired=[original,variant].map((value,i)=>({identity:value,retiredIn:currentSchema,reason:'Preserve exact original identity',replacement:model.identityKey(next.active[0]),...(i?{sourceSnapshot}:{})}));
  return {prior,next,sourceSnapshot,bytes,snapshots:new Map([[sourceSnapshot.path,bytes]])};
}
test('explicit source snapshot preserves a distinct exact historical branch',()=>{
  const {prior,next,snapshots}=fixture();
  assert.deepEqual(model.validateLedger(next),[]);
  assert.deepEqual(model.compareHistory(prior,next),[]);
  assert.deepEqual(model.validateHistorySnapshots(next,snapshots),[]);
});
test('unqualified differing historical branch remains rejected',()=>{
  const {next}=fixture();delete next.retired[1].sourceSnapshot;
  assert.ok(model.validateLedger(next).some(d=>d.code==='retirement_source_changed'));
});
test('a duplicated qualified retirement is rejected',()=>{
  const {next}=fixture();next.retired.push(structuredClone(next.retired[1]));
  assert.ok(model.validateLedger(next).some(d=>d.code==='duplicate_retirement'));
});
test('removing either exact historical branch fails its own baseline comparison',()=>{
  const {prior,next}=fixture();next.retired.pop();
  assert.ok(model.compareHistory(prior,next).some(d=>d.code==='missing_prior_shape_retirement'));
});
test('changed snapshot bytes fail the declared content hash',()=>{
  const {next,sourceSnapshot}=fixture();
  assert.ok(model.validateHistorySnapshots(next,new Map([[sourceSnapshot.path,Buffer.from('{}')]])).some(d=>d.code==='history_snapshot_hash_mismatch'));
});
test('missing original history snapshot remains a failure',()=>{
  const {next}=fixture();
  assert.ok(model.validateHistorySnapshots(next,new Map()).some(d=>d.code==='missing_history_snapshot'));
});
test('removing one qualified row cannot hide loss from a complete captured baseline',()=>{
  const {next,snapshots}=fixture();next.retired.pop();
  assert.ok(model.validateHistorySnapshots(next,snapshots).some(d=>d.code==='missing_prior_shape_retirement'));
});
test('removing every candidate snapshot reference still fails the independently required baseline',()=>{
  const {next,snapshots,sourceSnapshot}=fixture();next.retired=[];
  assert.ok(model.validateHistorySnapshots(next,snapshots,[sourceSnapshot]).some(d=>d.code==='missing_prior_shape_retirement'));
  assert.ok(model.validateHistorySnapshots(next,new Map(),[sourceSnapshot]).some(d=>d.code==='missing_history_snapshot'));
});
test('a snapshot cannot authenticate a made-up historical identity',()=>{
  const {next,snapshots}=fixture();next.retired[1].identity.evidence[0].revision='sha256:'+'5'.repeat(64);
  assert.ok(model.validateHistorySnapshots(next,snapshots).some(d=>d.code==='history_snapshot_identity_mismatch'));
});
test('snapshot references reject parent traversal',()=>{
  const {next}=fixture();next.retired[1].sourceSnapshot.path='../schema.json';
  assert.ok(model.validateLedger(next).some(d=>d.code==='invalid_retirement'));
});
test('legacy five Effect ids are valid exact tombstones and remain permanently reserved',()=>{
  const {next}=fixture();
  for(const [value,name] of [[121001,'BombDamageEffect'],[121006,'HealthPackEffect'],[121008,'PowerUpgradeEffect'],[121009,'CapacityUpgradeEffect'],[121010,'SpeedUpgradeEffect']]) {
    const owner='Lumio.Bomber.Gameplay.'+name;
    next.retired.push({identity:{kind:'effect-type',scope:'101-bomber/gas/effect',value,owner,shape:{schema:oldSchema,clrType:owner,parameterType:owner+'.Parameters',id:value,instant:true},evidence},retiredIn:currentSchema,reason:'Retired legacy SDK declaration; authoritative replacement is separately allocated',replacement:null});
  }
  assert.deepEqual(model.validateLedger(next),[]);
  next.active.push({...structuredClone(next.retired.at(-1).identity),shape:{...next.retired.at(-1).identity.shape,schema:currentSchema}});
  assert.ok(model.validateLedger(next).some(d=>d.code==='invalid_shape'||d.code==='retired_identity_reused'));
});
