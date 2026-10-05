// Explicit audit migration. Existing authenticated retirement pages are never rewritten.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readObservation,CANDIDATE_PACKAGE} from './schema-identity-read.mjs';
import {identityKey,validateLedger,compareHistory,compareObserved,validateHistorySnapshots} from './schema-identity-model.mjs';
import {readLedgerStorage,encodeLedgerPages,createBoundedFileReader,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';

export const M2_PRODUCERS_PREDECESSOR=Object.freeze({
  path:'Gameplay/Compatibility/schema-identities.before-m2-producers.json',
  sha256:'0a15a9e69cff29c83915493472c7583977a585f3e850548ad49adfee48ca7e36',
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const current='Gameplay/Compatibility/schema-identities.json';
const SCHEMA='bomber-v14-m2-bounded-producers-candidate';

export function prepareM2ProducersLedger(priorBytes,readPage,observed,revisions) {
  assert.equal(hash(priorBytes),M2_PRODUCERS_PREDECESSOR.sha256,'Exact M2 producer predecessor required');
  const disk=JSON.parse(priorBytes),prior=readLedgerStorage(priorBytes,readPage);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,7743);assert.equal(disk.retired.pages.length,33);
  assert.equal(prior.schema,'bomber-v13-durable-bomb-promises-candidate');assert.equal(prior.active.length,680);
  assert.equal(observed.schema,SCHEMA);assert.equal(SCHEMA,'bomber-v14-m2-bounded-producers-candidate');
  assert.deepEqual(validateLedger(prior),[]);
  const successor=old=>observed.identities.find(i=>i.kind===old.kind&&i.owner===old.owner&&i.value===old.value);
  const additions=prior.active.map(identity=>({identity,retiredIn:SCHEMA,
    reason:'Preserve the exact v13 identities and all canonical/Pascal history before bounded M2 fire, frenzy, supply, regeneration and bridge producers.',
    replacement:successor(identity)?identityKey(successor(identity)):null,sourceSnapshot:M2_PRODUCERS_PREDECESSOR}));
  const next={...disk,schema:SCHEMA,engineRevision:revisions.engine,runtimeRevision:revisions.runtime,
    active:observed.identities,transitions:[...prior.transitions,{from:prior.schema,to:SCHEMA,breaking:true,
      reason:'Append bounded M2 producers and authorized private 16-player/32-result containers; retain every previous identity, ordinal, shape and byte authenticated retirement page.',releaseDecision:null}]};
  const pages=new Map(),descriptors=[...disk.retired.pages];
  for(const encoded of encodeLedgerPages({...next,retired:additions},'schema-retirements.v14')) {
    if(encoded.path===current)continue;
    const page=JSON.parse(encoded.bytes);page.start+=disk.retired.count;
    const bytes=Buffer.from(JSON.stringify(page)+'\n');
    assert.ok(bytes.length<=MAX_INPUT_BYTES);
    pages.set(encoded.path,bytes);
    descriptors.push({path:encoded.path,sha256:hash(bytes),bytes:bytes.length,start:page.start,count:page.rows.length});
  }
  next.retired={storage:'pages-v1',count:disk.retired.count+additions.length,pages:descriptors};
  const manifest=Buffer.from(JSON.stringify(next)+'\n');
  assert.ok(manifest.length<=MAX_INPUT_BYTES);
  const ledger=readLedgerStorage(manifest,path=>pages.get(path)??readPage(path));
  assert.deepEqual(validateLedger(ledger),[]);
  assert.deepEqual(compareHistory(prior,ledger),[]);
  assert.deepEqual(compareObserved(ledger,observed),[]);
  return {manifest,pages,ledger};
}

async function apply() {
  assert.deepEqual(process.argv.slice(2),['--apply'],'Use --apply for the explicitly reviewed M2 producer migration');
  const game=fileURLToPath(new URL('../',import.meta.url)),reader=createBoundedFileReader(game);
  const before=reader.read(current);
  const prior=existsSync(join(game,M2_PRODUCERS_PREDECESSOR.path))?reader.read(M2_PRODUCERS_PREDECESSOR.path):before;
  const observed=await readObservation(game),packageBytes=readFileSync(join(observed.packageRoot,'manifest.json'));
  assert.equal(hash(packageBytes),CANDIDATE_PACKAGE.manifestSha256);
  const source=JSON.parse(packageBytes).sources;
  const prepared=prepareM2ProducersLedger(prior,reader.read,observed,{engine:source.LumioGameEngine,runtime:source.LumioGameRuntime});
  assert.ok(before.equals(prior)||before.equals(prepared.manifest),'Target changed since exact predecessor capture');
  const historyPaths=new Set(LOCAL_HISTORY_SNAPSHOTS.map(s=>s.path));
  for(const row of prepared.ledger.retired)if(row.sourceSnapshot)historyPaths.add(row.sourceSnapshot.path);
  const read=path=>path===M2_PRODUCERS_PREDECESSOR.path?prior:prepared.pages.get(path)??reader.read(path);
  const snapshots={get:read,*[Symbol.iterator](){for(const path of historyPaths)yield [path,read(path)];}};
  assert.deepEqual(validateHistorySnapshots(prepared.ledger,snapshots,[...LOCAL_HISTORY_SNAPSHOTS,M2_PRODUCERS_PREDECESSOR]),[]);
  reader.assertUnchanged();
  const immutable=(path,bytes)=>{
    const target=join(game,path);
    if(existsSync(target))assert.ok(readFileSync(target).equals(bytes),'Immutable artifact conflict: '+path);
    else writeFileSync(target,bytes,{flag:'wx'});
  };
  immutable(M2_PRODUCERS_PREDECESSOR.path,prior);
  for(const [path,bytes] of prepared.pages)immutable(path,bytes);
  assert.ok(readFileSync(join(game,current)).equals(before),'Concurrent ledger mutation');
  if(!before.equals(prepared.manifest)) {
    const staging=join(game,current+'.m2-producers-next');
    immutable(current+'.m2-producers-next',prepared.manifest);
    renameSync(staging,join(game,current));
  }
  console.log(JSON.stringify({schema:SCHEMA,priorSha256:hash(prior),manifestSha256:hash(prepared.manifest),
    active:prepared.ledger.active.length,priorRetired:7743,retired:prepared.ledger.retired.length,
    retainedPages:33,addedPages:prepared.pages.size,freezeEligible:false},null,2));
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))await apply();


