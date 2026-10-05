// Preserve an independently captured local branch without rewriting either history.
// This updates audit data only; SDK observation and release gates remain separate.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {identityKey,validateLedger,compareHistory,validateHistorySnapshots} from './schema-identity-model.mjs';
const [priorPath,candidatePath,targetPath]=process.argv.slice(2);
assert.ok(priorPath&&candidatePath&&targetPath,'Expected exact prior ledger, candidate ledger, target ledger paths');
const hash=b=>createHash('sha256').update(b).digest('hex');
const priorBytes=fs.readFileSync(priorPath),candidateBytes=fs.readFileSync(candidatePath);
const prior=JSON.parse(priorBytes),candidate=JSON.parse(candidateBytes),next=structuredClone(candidate);
assert.deepEqual(validateLedger(candidate),[]);
const snapshotName='schema-identities.root-before-integration.json';
const snapshotPath=path.join(path.dirname(targetPath),snapshotName);
if(fs.existsSync(snapshotPath))assert.deepEqual(fs.readFileSync(snapshotPath),priorBytes);
else fs.writeFileSync(snapshotPath,priorBytes,{flag:'wx'});
const sourceSnapshot={path:'Gameplay/Compatibility/'+snapshotName,sha256:hash(priorBytes)};
const missing=compareHistory(prior,candidate);
assert.ok(missing.every(d=>d.code==='missing_prior_shape_retirement'),'Non-shape history conflict requires separate resolution');
const keys=new Set(missing.map(d=>d.identity));
for(const identity of prior.active.filter(i=>keys.has(identityKey(i)))) {
  const successor=next.active.find(i=>i.kind===identity.kind&&i.value===identity.value&&i.owner===identity.owner);
  next.retired.push({identity,retiredIn:next.schema,reason:'Preserve exact separately captured Root branch shape and source evidence before the frozen gameplay integration.',replacement:successor?identityKey(successor):null,sourceSnapshot});
}
if(keys.size&&!next.transitions.some(t=>t.from===prior.schema&&t.to===next.schema))
  next.transitions.push({from:prior.schema,to:next.schema,breaking:true,reason:'Retire the exact independently captured Root branch, including its legacy Effect ids and uint serialization variant; no active identity is reassigned.',releaseDecision:null});
assert.deepEqual(validateLedger(next),[]);
assert.deepEqual(compareHistory(prior,next),[]);
assert.deepEqual(compareHistory(candidate,next),[]);
assert.deepEqual(validateHistorySnapshots(next,new Map([[sourceSnapshot.path,priorBytes]])),[]);
for(const retirement of prior.retired)assert.ok(next.retired.some(r=>JSON.stringify(r)===JSON.stringify(retirement)),'Prior tombstone not retained exactly');
const after=Buffer.from(JSON.stringify(next,null,2)+'\n');
const current=fs.readFileSync(targetPath);
assert.ok(current.equals(priorBytes)||current.equals(after),'Target changed since independently captured Root baseline');
fs.writeFileSync(targetPath,after);
process.stdout.write(JSON.stringify({priorSha256:hash(priorBytes),candidateSha256:hash(candidateBytes),afterSha256:hash(after),priorActive:prior.active.length,priorTombstones:prior.retired.length,active:next.active.length,retired:next.retired.length,addedExactVariants:keys.size,transitions:next.transitions.length,historyDiagnostics:[],snapshotDiagnostics:[],freezeEligible:false},null,2)+'\n');
