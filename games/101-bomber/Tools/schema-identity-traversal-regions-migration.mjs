// Explicit Game audit migration; no schema allocation and no regeneration.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readObservation,CANDIDATE_PACKAGE} from './schema-identity-read.mjs';
import {identityKey,validateLedger,compareHistory,compareObserved,validateHistorySnapshots} from './schema-identity-model.mjs';
import {readLedgerStorage,encodeLedgerPages,createBoundedFileReader,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';
export const TRAVERSAL_REGIONS_PREDECESSOR=Object.freeze({
  path:'Gameplay/Compatibility/schema-identities.before-traversal-favorite-regions.json',
  sha256:'d3bca141e0a1f777892ba6c6e7e155dfc5842ddaf09ca5eea1857184c41dcb7f',
});
export const SCHEMA='bomber-v15-traversal-favorite-regions-candidate';
const hash=b=>createHash('sha256').update(b).digest('hex');
const current='Gameplay/Compatibility/schema-identities.json';
export function prepareTraversalRegionsLedger(priorBytes,readPage,observed,revisions) {
  assert.equal(hash(priorBytes),TRAVERSAL_REGIONS_PREDECESSOR.sha256,'Exact v14 predecessor required');
  const disk=JSON.parse(priorBytes),prior=readLedgerStorage(priorBytes,readPage);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,8423);assert.equal(disk.retired.pages.length,36);
  assert.equal(prior.schema,'bomber-v14-m2-bounded-producers-candidate');assert.equal(prior.active.length,765);
  assert.equal(observed.schema,SCHEMA);assert.ok(Array.isArray(observed.identities));
  assert.deepEqual(validateLedger(prior),[]);
  const successor=old=>observed.identities.find(i=>i.kind===old.kind&&i.owner===old.owner&&i.value===old.value);
  const additions=prior.active.map(identity=>({identity,retiredIn:SCHEMA,
    reason:'Preserve exact v14 identities, ordinals, canonical/Pascal history and all authenticated original bytes before explosion traversal and Favorite fire regions.',
    replacement:successor(identity)?identityKey(successor(identity)):null,sourceSnapshot:TRAVERSAL_REGIONS_PREDECESSOR}));
  const next={...disk,schema:SCHEMA,engineRevision:revisions.engine,runtimeRevision:revisions.runtime,
    active:observed.identities,transitions:[...prior.transitions,{from:prior.schema,to:SCHEMA,breaking:true,
      reason:'Append frozen explosion geometry/fixed4 traversal progress, region fields/Aoi visibility/entity GAS slots, exact Game10112 finite effect and typed birth/expiry events; retain observed capacities. Requires a distinct GameReleaseId and immutable old release qualification; no automatic world conversion.',
      releaseDecision:null}]};
  const pages=new Map(),descriptors=[...disk.retired.pages];
  for(const encoded of encodeLedgerPages({...next,retired:additions},'schema-retirements.v15')) {
    if(encoded.path===current)continue;
    const page=JSON.parse(encoded.bytes);page.start+=disk.retired.count;
    const bytes=Buffer.from(JSON.stringify(page)+'\n');assert.ok(bytes.length<=MAX_INPUT_BYTES);
    pages.set(encoded.path,bytes);
    descriptors.push({path:encoded.path,sha256:hash(bytes),bytes:bytes.length,start:page.start,count:page.rows.length});
  }
  next.retired={storage:'pages-v1',count:disk.retired.count+additions.length,pages:descriptors};
  const manifest=Buffer.from(JSON.stringify(next)+'\n');assert.ok(manifest.length<=MAX_INPUT_BYTES);
  const ledger=readLedgerStorage(manifest,path=>pages.get(path)??readPage(path));
  assert.deepEqual(validateLedger(ledger),[]);assert.deepEqual(compareHistory(prior,ledger),[]);
  assert.deepEqual(compareObserved(ledger,observed),[]);
  return {manifest,pages,ledger};
}
async function apply() {
  assert.deepEqual(process.argv.slice(2),['--apply'],'Use --apply only after nonauthor review and official Root generation');
  const game=fileURLToPath(new URL('../',import.meta.url)),reader=createBoundedFileReader(game);
  const before=reader.read(current);
  const prior=existsSync(join(game,TRAVERSAL_REGIONS_PREDECESSOR.path))?reader.read(TRAVERSAL_REGIONS_PREDECESSOR.path):before;
  const observed=await readObservation(game),packageBytes=readFileSync(join(observed.packageRoot,'manifest.json'));
  assert.equal(hash(packageBytes),CANDIDATE_PACKAGE.manifestSha256);
  const source=JSON.parse(packageBytes).sources;
  const prepared=prepareTraversalRegionsLedger(prior,reader.read,observed,{engine:source.LumioGameEngine,runtime:source.LumioGameRuntime});
  assert.ok(before.equals(prior)||before.equals(prepared.manifest),'Target changed since exact predecessor capture');
  const historyPaths=new Set(LOCAL_HISTORY_SNAPSHOTS.map(s=>s.path));
  for(const row of prepared.ledger.retired)if(row.sourceSnapshot)historyPaths.add(row.sourceSnapshot.path);
  const read=path=>path===TRAVERSAL_REGIONS_PREDECESSOR.path?prior:prepared.pages.get(path)??reader.read(path);
  const snapshots={get:read,*[Symbol.iterator](){for(const path of historyPaths)yield [path,read(path)];}};
  assert.deepEqual(validateHistorySnapshots(prepared.ledger,snapshots,[...LOCAL_HISTORY_SNAPSHOTS,TRAVERSAL_REGIONS_PREDECESSOR]),[]);
  reader.assertUnchanged();
  const immutable=(path,bytes)=>{const target=join(game,path);
    if(existsSync(target))assert.ok(readFileSync(target).equals(bytes),'Immutable artifact conflict: '+path);
    else writeFileSync(target,bytes,{flag:'wx'});
  };
  immutable(TRAVERSAL_REGIONS_PREDECESSOR.path,prior);
  for(const [path,bytes] of prepared.pages)immutable(path,bytes);
  assert.ok(readFileSync(join(game,current)).equals(before),'Concurrent ledger mutation');
  if(!before.equals(prepared.manifest)) {
    const staging=current+'.traversal-regions-next';immutable(staging,prepared.manifest);renameSync(join(game,staging),join(game,current));
  }
  console.log(JSON.stringify({schema:SCHEMA,priorSha256:hash(prior),manifestSha256:hash(prepared.manifest),
    active:prepared.ledger.active.length,priorRetired:8423,retired:prepared.ledger.retired.length,
    retainedPages:36,addedPages:prepared.pages.size,freezeEligible:false},null,2));
}
// Private source is deliberately non-applicable at this path. Only published Tools has ../ Gameplay.
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)) {
  assert.equal(fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').endsWith('/games/101-bomber/'),true,
    'Private migration proposal cannot apply; Root publishes reviewed Tools only');
  await apply();
}
