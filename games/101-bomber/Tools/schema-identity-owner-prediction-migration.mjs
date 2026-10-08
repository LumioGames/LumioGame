// Explicit audit migration only. No live world conversion or identity allocation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readObservation} from './schema-identity-read.mjs';
import {V16_SCHEMA,V16_PREDECESSOR} from './schema-identity-v16-evidence.mjs';
import {identityKey,validateLedger,compareHistory,compareObserved,validateHistorySnapshots} from './schema-identity-model.mjs';
import {readLedgerStorage,encodeLedgerPages,createBoundedFileReader,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';
export const OWNER_PREDICTION_PREDECESSOR=V16_PREDECESSOR;
export const SCHEMA=V16_SCHEMA;
const hash=b=>createHash('sha256').update(b).digest('hex');
const current='Gameplay/Compatibility/schema-identities.json';
const scopes=new Map([['BomberParticipantState.lifeGeneration','Room'],
  ...['inputMemoryMatchId','pendingTurnDirection','pendingTurnUntilTick','lastMoveDirection','lastMoveTick',
    'lastAssistTick','assistToleranceMilli'].map(n=>['BomberPlayerState.'+n,'Owner']),
  ['BomberBombState.sourceLife','Aoi'],['BomberBombState.sourceLifeGeneration','Aoi']]);
function expectedShape(identity,revisions) {
  const shape=structuredClone(identity.shape);shape.schema=SCHEMA;
  if(identity.kind==='component'&&shape.origin.kind==='external')
    Object.assign(shape.origin,{engineRevision:revisions.engine,runtimeRevision:revisions.runtime,package:revisions.package});
  if(identity.kind==='scalar'&&scopes.has(identity.value)){
    assert.equal(shape.scope,'None');assert.equal(shape.authority,'Server');assert.equal(shape.persistence,'persistent');
    shape.scope=scopes.get(identity.value);
    for(const side of ['server','client']){
      assert.deepEqual(shape.serialization[side],{capturePersist:true,captureSync:false,restorePersist:true});
      shape.serialization[side].captureSync=true;
    }
  }
  return shape;
}
export function prepareOwnerPredictionLedger(priorBytes,readPage,observed,revisions) {
  assert.equal(hash(priorBytes),V16_PREDECESSOR.sha256,'Exact v15 predecessor required');
  const disk=JSON.parse(priorBytes),prior=readLedgerStorage(priorBytes,readPage);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,9188);assert.equal(disk.retired.pages.length,39);
  assert.equal(prior.schema,'bomber-v15-traversal-favorite-regions-candidate');assert.equal(prior.active.length,787);
  assert.equal(observed.schema,SCHEMA);assert.equal(observed.identities?.length,787);
  assert.ok([revisions.engine,revisions.runtime].every(s=>/^[a-f0-9]{40}$/.test(s)));
  assert.match(revisions.package,/^\d+\.\d+\.\d+-main\.[a-f0-9]{7}$/);
  assert.deepEqual(validateLedger(prior),[]);
  const project=i=>({kind:i.kind,scope:i.scope,value:i.value,owner:i.owner,shape:i.shape});
  const expected=prior.active.map(i=>({...project(i),scope:i.kind==='component-slot'?i.scope.replace(prior.schema,SCHEMA):i.scope,
    shape:expectedShape(i,revisions)}));
  const sorted=values=>values.sort((a,b)=>{const left=identityKey(a),right=identityKey(b);return left<right?-1:left>right?1:0;});
  assert.deepEqual(sorted(observed.identities.map(project)),sorted(expected),
    'Only the exact ten projection scopes/serialization and reviewed package provenance may change');
  const successor=old=>observed.identities.find(i=>i.kind===old.kind&&i.owner===old.owner&&i.value===old.value);
  const additions=prior.active.map(identity=>({identity,retiredIn:SCHEMA,
    reason:'Preserve exact v15 declarations, ordinals, canonical/Pascal reservations and authenticated old bytes before owner movement and bomb source-life projection.',
    replacement:identityKey(successor(identity)),sourceSnapshot:V16_PREDECESSOR}));
  const next={...disk,schema:SCHEMA,engineRevision:revisions.engine,runtimeRevision:revisions.runtime,
    active:observed.identities,transitions:[...prior.transitions,{from:prior.schema,to:SCHEMA,breaking:true,
      reason:'Project seven persistent movement-memory fields to Owner, participant LifeGeneration to Room, and bomb SourceLife/SourceLifeGeneration to Aoi; retain types, ordinals, Server authority and persistent data. Requires distinct GameReleaseId and immutable old-release qualification; no automatic world conversion.',
      releaseDecision:null}]};
  const pages=new Map(),descriptors=[...disk.retired.pages];
  for(const encoded of encodeLedgerPages({...next,retired:additions},'schema-retirements.v16')){
    if(encoded.path===current)continue;
    const page=JSON.parse(encoded.bytes);page.start+=disk.retired.count;
    const bytes=Buffer.from(JSON.stringify(page)+'\n');assert.ok(bytes.length<=MAX_INPUT_BYTES);
    pages.set(encoded.path,bytes);descriptors.push({path:encoded.path,sha256:hash(bytes),bytes:bytes.length,start:page.start,count:page.rows.length});
  }
  next.retired={storage:'pages-v1',count:disk.retired.count+additions.length,pages:descriptors};
  const manifest=Buffer.from(JSON.stringify(next)+'\n');assert.ok(manifest.length<=MAX_INPUT_BYTES);
  const ledger=readLedgerStorage(manifest,p=>pages.get(p)??readPage(p));
  assert.deepEqual(validateLedger(ledger),[]);assert.deepEqual(compareHistory(prior,ledger),[]);
  assert.deepEqual(compareObserved(ledger,observed),[]);
  return {manifest,pages,ledger};
}
async function apply(){
  assert.deepEqual(process.argv.slice(2),['--apply'],'Use --apply only after nonauthor source/GEN/package review');
  const game=fileURLToPath(new URL('../',import.meta.url)),reader=createBoundedFileReader(game);
  const before=reader.read(current),prior=existsSync(join(game,V16_PREDECESSOR.path))?reader.read(V16_PREDECESSOR.path):before;
  const observed=await readObservation(game,{schema:SCHEMA});
  const source=JSON.parse(readFileSync(join(observed.packageRoot,'manifest.json')));
  const prepared=prepareOwnerPredictionLedger(prior,reader.read,observed,
    {engine:source.sources.LumioGameEngine,runtime:source.sources.LumioGameRuntime,package:source.version});
  assert.ok(before.equals(prior)||before.equals(prepared.manifest),'Target changed since exact predecessor capture');
  const history=new Set([...LOCAL_HISTORY_SNAPSHOTS,V16_PREDECESSOR].map(r=>r.path));
  for(const r of prepared.ledger.retired)if(r.sourceSnapshot)history.add(r.sourceSnapshot.path);
  const read=p=>p===V16_PREDECESSOR.path?prior:prepared.pages.get(p)??reader.read(p);
  const snapshots={get:read,*[Symbol.iterator](){for(const p of history)yield[p,read(p)];}};
  assert.deepEqual(validateHistorySnapshots(prepared.ledger,snapshots,[...LOCAL_HISTORY_SNAPSHOTS,V16_PREDECESSOR]),[]);
  reader.assertUnchanged();
  const immutable=(p,bytes)=>{const target=join(game,p);if(existsSync(target))assert.ok(readFileSync(target).equals(bytes),'Immutable artifact conflict: '+p);else writeFileSync(target,bytes,{flag:'wx'});};
  immutable(V16_PREDECESSOR.path,prior);for(const [p,bytes]of prepared.pages)immutable(p,bytes);
  assert.ok(readFileSync(join(game,current)).equals(before),'Concurrent ledger mutation');
  if(!before.equals(prepared.manifest)){
    const staged=current+'.owner-prediction-next';immutable(staged,prepared.manifest);renameSync(join(game,staged),join(game,current));
  }
  console.log(JSON.stringify({schema:SCHEMA,priorSha256:hash(prior),manifestSha256:hash(prepared.manifest),
    active:787,priorRetired:9188,retired:9975,retainedPages:39,addedPages:prepared.pages.size,freezeEligible:false},null,2));
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  assert.ok(fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').endsWith('/games/101-bomber/'),
    'Private migration proposal cannot apply; Root publishes reviewed Tools only');
  await apply();
}
