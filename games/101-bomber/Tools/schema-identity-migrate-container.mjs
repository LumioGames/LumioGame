// Bounded local migration; original v3 bytes are never modified.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readObservation,SCHEMA} from './schema-identity-read.mjs';
import {identityKey,validateLedger,compareHistory,audit} from './schema-identity-model.mjs';
import {hash,readBootstrap,BOOTSTRAP_REF} from './schema-identity-history.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const compatibility=join(root,'Gameplay/Compatibility');
const beforeBytes=await readFile(join(compatibility,'schema-identities.before-container-candidate.json'));
assert.equal(hash(beforeBytes),'5d0b9990adab9cf84e9a1719991d8c0eaebfcc9709b73543ab30ac5d7f9f4092');
const before=JSON.parse(beforeBytes);
assert.equal(before.schema,'bomber-v3');
assert.equal(before.active.length,463);
assert.equal(before.retired.length,343);
const observed=await readObservation(root);
const manifest=JSON.parse(await readFile(join(root,'Engine/manifest.json')));
assert.equal(Object.keys(manifest.files).length,131);
for(const [path,expected] of Object.entries(manifest.files))
  assert.equal(hash(await readFile(join(root,'Engine',path))),expected,path);
const candidate={...structuredClone(before),schema:SCHEMA,
  engineRevision:manifest.sources.LumioGameEngine,runtimeRevision:manifest.sources.LumioGameRuntime,
  active:observed.identities};
candidate.transitions.push({from:before.schema,to:SCHEMA,breaking:true,
  reason:'Local ADR-137 candidate: explicit container capacity, scalar-first container ordinals and callbacks, repaired uint UInt64 capture/checked restore; public release remains unapproved.',releaseDecision:null});
for(const identity of before.active) {
  const matches=candidate.active.filter(i=>i.kind===identity.kind&&i.owner===identity.owner&&i.value===identity.value);
  assert.equal(matches.length,1,identityKey(identity));
  candidate.retired.push({identity,retiredIn:SCHEMA,
    reason:'Preserve exact original v3 shape and source evidence before the local container candidate migration.',
    replacement:identityKey(matches[0])});
}
assert.equal(candidate.active.length,463);
assert.equal(candidate.retired.length,806);
assert.deepEqual(candidate.retired.slice(0,343),before.retired);
assert.deepEqual(candidate.pending,before.pending);
assert.deepEqual(validateLedger(candidate),[]);
assert.deepEqual(compareHistory(before,candidate),[]);
const historical=readBootstrap('C:/Work/LumioGames/LumioGame',BOOTSTRAP_REF);
assert.deepEqual(audit({baseline:historical.ledger,candidate,observed}).diagnostics,[]);
const target=join(compatibility,'schema-identities.json');
const current=await readFile(target);
assert.ok(current.equals(beforeBytes)||JSON.stringify(JSON.parse(current))===JSON.stringify(candidate),'Refuse to overwrite an unrelated ledger');
assert.deepEqual((await readObservation(root)).files,observed.files,'Inputs changed during migration');
await writeFile(target,JSON.stringify(candidate,null,2)+'\n');
console.log(JSON.stringify({schema:SCHEMA,active:463,originalTombstones:343,newV3Retirements:463,retired:806,
  beforeSha256:hash(beforeBytes),afterSha256:hash(await readFile(target)),historyDiagnostics:[],freezeEligible:false},null,2));
