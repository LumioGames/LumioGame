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

export const BOMB_PROMISES_PREDECESSOR=Object.freeze({
  path:'Gameplay/Compatibility/schema-identities.before-bomb-promises.json',
  sha256:'97abc333647fed9ada2654d68146bdf93e54691308240edb674067c7c5b7db44',
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const current='Gameplay/Compatibility/schema-identities.json';
const SCHEMA='bomber-v13-durable-bomb-promises-candidate';

export function prepareBombPromisesLedger(priorBytes,readPage,observed,revisions) {
  assert.equal(hash(priorBytes),BOMB_PROMISES_PREDECESSOR.sha256,'Exact bomb promise predecessor required');
  const disk=JSON.parse(priorBytes),prior=readLedgerStorage(priorBytes,readPage);
  assert.equal(disk.formatVersion,2);assert.equal(disk.retired.count,7076);assert.equal(disk.retired.pages.length,30);
  assert.equal(prior.schema,'bomber-v12-button-canonical-attributes-candidate');assert.equal(prior.active.length,667);
  assert.equal(observed.schema,SCHEMA);assert.equal(SCHEMA,'bomber-v13-durable-bomb-promises-candidate');
  assert.deepEqual(validateLedger(prior),[]);
  const successor=old=>observed.identities.find(i=>i.kind===old.kind&&i.owner===old.owner&&i.value===old.value);
  const additions=prior.active.map(identity=>({identity,retiredIn:SCHEMA,
    reason:'Preserve the exact v12 identities, all canonical and retired Pascal bindings, before durable Split child and barrel bomb promises.',
    replacement:successor(identity)?identityKey(successor(identity)):null,sourceSnapshot:BOMB_PROMISES_PREDECESSOR}));
  const next={...disk,schema:SCHEMA,engineRevision:revisions.engine,runtimeRevision:revisions.runtime,
    active:observed.identities,transitions:[...prior.transitions,{from:prior.schema,to:SCHEMA,breaking:true,
      reason:'Append durable Split child obligations and exact barrel trigger identities; retain every previous identity, ordinal, shape and byte authenticated retirement page.',releaseDecision:null}]};
  const pages=new Map(),descriptors=[...disk.retired.pages];
  for(const encoded of encodeLedgerPages({...next,retired:additions},'schema-retirements.v13')) {
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
  assert.deepEqual(process.argv.slice(2),['--apply'],'Use --apply for the explicitly reviewed durable bomb promise migration');
  const game=fileURLToPath(new URL('../',import.meta.url)),reader=createBoundedFileReader(game);
  const before=reader.read(current);
  const prior=existsSync(join(game,BOMB_PROMISES_PREDECESSOR.path))?reader.read(BOMB_PROMISES_PREDECESSOR.path):before;
  const observed=await readObservation(game),packageBytes=readFileSync(join(observed.packageRoot,'manifest.json'));
  assert.equal(hash(packageBytes),CANDIDATE_PACKAGE.manifestSha256);
  const source=JSON.parse(packageBytes).sources;
  const prepared=prepareBombPromisesLedger(prior,reader.read,observed,{engine:source.LumioGameEngine,runtime:source.LumioGameRuntime});
  assert.ok(before.equals(prior)||before.equals(prepared.manifest),'Target changed since exact predecessor capture');
  const historyPaths=new Set(LOCAL_HISTORY_SNAPSHOTS.map(s=>s.path));
  for(const row of prepared.ledger.retired)if(row.sourceSnapshot)historyPaths.add(row.sourceSnapshot.path);
  const read=path=>path===BOMB_PROMISES_PREDECESSOR.path?prior:prepared.pages.get(path)??reader.read(path);
  const snapshots={get:read,*[Symbol.iterator](){for(const path of historyPaths)yield [path,read(path)];}};
  assert.deepEqual(validateHistorySnapshots(prepared.ledger,snapshots,[...LOCAL_HISTORY_SNAPSHOTS,BOMB_PROMISES_PREDECESSOR]),[]);
  reader.assertUnchanged();
  const immutable=(path,bytes)=>{
    const target=join(game,path);
    if(existsSync(target))assert.ok(readFileSync(target).equals(bytes),'Immutable artifact conflict: '+path);
    else writeFileSync(target,bytes,{flag:'wx'});
  };
  immutable(BOMB_PROMISES_PREDECESSOR.path,prior);
  for(const [path,bytes] of prepared.pages)immutable(path,bytes);
  assert.ok(readFileSync(join(game,current)).equals(before),'Concurrent ledger mutation');
  if(!before.equals(prepared.manifest)) {
    const staging=join(game,current+'.bomb-promises-next');
    immutable(current+'.bomb-promises-next',prepared.manifest);
    renameSync(staging,join(game,current));
  }
  console.log(JSON.stringify({schema:SCHEMA,priorSha256:hash(prior),manifestSha256:hash(prepared.manifest),
    active:prepared.ledger.active.length,priorRetired:7076,retired:prepared.ledger.retired.length,
    retainedPages:30,addedPages:prepared.pages.size,freezeEligible:false},null,2));
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))await apply();


