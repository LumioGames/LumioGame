// Explicit candidate migration. Reads official generated declarations; never edits projections.
// Byte pins and audit-draft status are local evidence, not release approval.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readObservation} from './schema-identity-read.mjs';
import {validateLedger,compareHistory,compareObserved,identityKey} from './schema-identity-model.mjs';
const game=fileURLToPath(new URL('../',import.meta.url));
const previous=new URL('../Gameplay/Compatibility/schema-identities.before-growth-candidate.json',import.meta.url);
const current=new URL('../Gameplay/Compatibility/schema-identities.json',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const originalHash='56d05c2677ceb087302d266ab0cd5a63049b68eb593059c69d83d87ef372ebbb';
let bytes;
try {bytes=await readFile(previous);} catch(e) {
  if(e.code!=='ENOENT')throw e;
  bytes=await readFile(current);
  if(sha(bytes)!==originalHash)throw Error('Refuse to preserve a substituted baseline');
  await writeFile(previous,bytes,{flag:'wx'});
}
if(sha(bytes)!==originalHash)throw Error('Original 4224 ledger bytes changed');
const prior=JSON.parse(bytes), observed=await readObservation(game);
const next=structuredClone(prior);
next.schema=observed.schema;
next.active=observed.identities;
const successor=old=>next.active.find(i=>i.kind===old.kind&&i.owner===old.owner&&i.value===old.value);
next.transitions.push({from:prior.schema,to:next.schema,breaking:true,
  reason:'Growth consumer appends health payload fields 9..17 and private captured columns; appends live gold and pending death gold; MaximumHealth becomes Aoi. Prior shapes and tombstones remain exact.',releaseDecision:null});
next.retired.push(...prior.active.map(identity=>({identity,retiredIn:next.schema,
  reason:'Preserve exact pre-growth identity, ordinal, Scope and serialization evidence.',
  replacement:successor(identity)?identityKey(successor(identity)):null})));
const diagnostics=[...validateLedger(next),...compareHistory(prior,next),...compareObserved(next,observed)];
if(diagnostics.length)throw Error(JSON.stringify(diagnostics));
await writeFile(current,JSON.stringify(next,null,2)+'\n');
const changes=prior.active.flatMap(old=>{
  const replacement=successor(old); if(!replacement)return [{key:identityKey(old),before:old.shape,after:null}];
  const shape=i=>{const s=structuredClone(i.shape);delete s.schema;return s;};
  return JSON.stringify(shape(old))===JSON.stringify(shape(replacement))?[]:[{key:identityKey(old),before:old.shape,after:replacement.shape}];
});
await writeFile(new URL('../Gameplay/Compatibility/schema-identities.growth-migration.json',import.meta.url),JSON.stringify({
  status:'audit-draft',freezeEligible:false,originalLedgerSha256:originalHash,originalSourceManifestSha256:'2f9df3553471255cce980ca42b7f090919403f84789368e79fbb1b758a2f9c1b',
  priorSchema:prior.schema,schema:next.schema,priorActive:prior.active.length,priorRetired:prior.retired.length,
  active:next.active.length,retired:next.retired.length,changes,
  added:next.active.filter(i=>!prior.active.some(p=>p.kind===i.kind&&p.owner===i.owner&&p.value===i.value)).map(i=>({key:identityKey(i),shape:i.shape})),
  note:'Existing server/client field ordinals remain stable, including MaximumHealth at 10 and all original health columns. New fields append. MaximumHealth changes Scope.None to Scope.Aoi and GoldenHeart appends enum value 5. No identity is reassigned. Root independent review and semantic integration required.'
},null,2)+'\n');
console.log(JSON.stringify({schema:next.schema,active:next.active.length,retired:next.retired.length,freezeEligible:false}));
