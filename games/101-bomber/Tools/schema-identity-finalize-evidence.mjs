// Read real inputs and retain a bounded migration handoff; never writes the active ledger.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {hash,readBootstrap,BOOTSTRAP_REF} from './schema-identity-history.mjs';
import {compareHistory,audit,validateLedger} from './schema-identity-model.mjs';

import {readObservation,CANDIDATE_PACKAGE} from './schema-identity-read.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const historyRoot='C:/Work/LumioGames/LumioGame';
const compatibility=join(root,'Gameplay/Compatibility');
const fingerprint=async path=>({path,sha256:hash(await readFile(path))});
const manifestBytes=await readFile(join(root,'Engine/manifest.json'));
const manifest=JSON.parse(manifestBytes);
assert.equal(hash(manifestBytes),CANDIDATE_PACKAGE.manifestSha256);
assert.equal(Object.keys(manifest.files).length,131);
assert.deepEqual(manifest.platforms,['win-x64']);
assert.equal(manifest.platformImage,'lumio-platform-local:0.0.4-main.54930d9-container02@sha256:58ea683681aa54547ec6b8c11b9e099c435dc30bb667c78b2f807ee5938b9250');
const observed=await readObservation(root);
const packageFiles=[];
for(const [path,expected] of Object.entries(manifest.files)) {
  const sha256=hash(await readFile(join(root,'Engine',path)));
  assert.equal(sha256,expected,path);
  packageFiles.push({path,sha256});
}
const zipPath=join(root,'Engine/sdk',`Lumio.Engine.SDK.${manifest.version}.nupkg`);
const generatorFiles=JSON.parse(execFileSync('powershell',['-NoProfile','-Command',`
Add-Type -AssemblyName System.IO.Compression.FileSystem
$schemaZip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replaceAll("'","''")}')
try {
  $schemaRows = @($schemaZip.Entries | Where-Object { $_.FullName -match 'Lumio.Tools.GenDeclarations' } | ForEach-Object {
    $schemaStream = $_.Open()
    $schemaHasher = [System.Security.Cryptography.SHA256]::Create()
    try { [PSCustomObject]@{ path = $_.FullName; sha256 = ([BitConverter]::ToString($schemaHasher.ComputeHash($schemaStream))).Replace('-', '').ToLowerInvariant() } }
    finally { $schemaStream.Dispose(); $schemaHasher.Dispose() }
  })
  ConvertTo-Json -InputObject $schemaRows
} finally { $schemaZip.Dispose() }
`],{encoding:'utf8',windowsHide:true}));
assert.equal(generatorFiles.length,3);
const nugetCache='C:/Work/LumioGames/probe/container-delta-game-packages-02';
for(const file of generatorFiles) {
  file.cachePath=join(nugetCache,'lumio.engine.sdk',manifest.version,file.path);
  file.cacheSha256=hash(await readFile(file.cachePath));
  assert.equal(file.cacheSha256,file.sha256);
}
assert.equal(hash(await readFile(zipPath)),CANDIDATE_PACKAGE.sdkSha256);
const inputs=[];
async function walk(dir,relative='Gameplay') {
  for(const e of await readdir(dir,{withFileTypes:true})) {
    if(['Tables','Config','Compatibility','bin','obj'].includes(e.name))continue;
    const path=`${relative}/${e.name}`;
    if(e.isDirectory())await walk(join(dir,e.name),path);
    else if(/\.(cs|json)$/.test(path))inputs.push({path,sha256:hash(await readFile(join(dir,e.name)))});
  }
}
await walk(join(root,'Gameplay'));
inputs.sort((a,b)=>a.path.localeCompare(b.path));
const beforeBytes=await readFile(join(compatibility,'schema-identities.before-container-candidate.json'));
const activeBytes=await readFile(join(compatibility,'schema-identities.json'));
assert.equal(hash(beforeBytes),'5d0b9990adab9cf84e9a1719991d8c0eaebfcc9709b73543ab30ac5d7f9f4092');
assert.equal(JSON.parse(beforeBytes).active.length,463);
assert.equal(JSON.parse(beforeBytes).retired.length,343);
const before=JSON.parse(beforeBytes),active=JSON.parse(activeBytes);
const beforeComparison=compareHistory(before,active);
assert.deepEqual(beforeComparison,[]);
assert.equal(active.active.length,463);assert.equal(active.retired.length,806);
assert.deepEqual(active.retired.slice(0,343),before.retired);
assert.deepEqual(active.retired.slice(343).map(r=>r.identity),before.active);
assert.deepEqual(active.pending,before.pending);
assert.deepEqual(validateLedger(active),[]);
assert.deepEqual(active.active,observed.identities);
const history=readBootstrap(historyRoot,BOOTSTRAP_REF);
const bootstrapAudit=audit({baseline:history.ledger,candidate:active,observed});
assert.deepEqual(bootstrapAudit.diagnostics,[]);
const commands=[];
for(const args of [
  ['--test','Tools/schema-identity-migration.test.mjs','Tools/schema-identity-generated.test.mjs','Tools/schema-identities.test.mjs'],
  ['Tools/verify-schema-identities.mjs','--repo-root',resolve(root,'../..'),'--history-root',historyRoot,'--bootstrap-ref',BOOTSTRAP_REF],
]) {
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  assert.equal(result.error,undefined);
  assert.equal(result.signal,null);
  const log=join(compatibility,args[0]==='--test'?'schema-identities.package02-tests.log':'schema-identities.package02-cli.json');
  await writeFile(log,result.stdout+result.stderr);
  assert.equal(result.status,0,result.stdout+result.stderr);
  commands.push({log,command:['node',...args],exitCode:result.status,stdout:result.stdout,stderr:result.stderr});
}
const snapshotPath=join(historyRoot,'games/101-bomber/.run/container-candidate-evidence-02/sources.json');
const sourceSnapshot=await fingerprint(snapshotPath);
assert.equal(sourceSnapshot.sha256,'b68de3a028b0e2e1daff63525640c7f6225a380503b81a01430defa12cfa7ee4');
const sources=JSON.parse(await readFile(snapshotPath));
const sourceRepositories={};
for(const [name,source] of Object.entries(sources.sources)) {
  assert.equal(manifest.sources[name],source.head);
  const diff=await fingerprint(join(historyRoot,'games/101-bomber/.run/container-candidate-evidence-02',name+'.diff'));
  assert.equal(diff.sha256,source.diffSha256);
  sourceRepositories[name]={root:source.root,head:source.head,treeSha256:source.treeSha256,diff,files:source.files.length};
}
const generatorSources=[];
for(const file of sources.sources.LumioGameRuntime.files.filter(f=>/^tools\/gen-declarations\/[^/]+\.(cs|csproj)$/.test(f.path))) {
  const actual=await fingerprint(join(sources.sources.LumioGameRuntime.root,file.path));
  assert.equal(actual.sha256,file.sha256,file.path);generatorSources.push(actual);
}
const postpackPath=join(historyRoot,'games/101-bomber/.run/container-candidate-evidence-02/source-postpack-comparison.json');
assert.deepEqual(JSON.parse(await readFile(postpackPath)),[]);
const logs=[];
for(const name of ['container-candidate-pack-02.log','container-game-server-build-02.log','container-game-client-build-02.log','container-platform-image-02.log'])
  logs.push(await fingerprint(join(historyRoot,'games/101-bomber/.run',name)));
assert.deepEqual((await readObservation(root)).files,observed.files,'Inputs changed during verification');
const originalInputHashes=JSON.parse(await readFile(join(compatibility,'schema-identities.before-container-input-hashes.json')));
const inputChangesFromBefore=[];
for(const file of originalInputHashes) {
  const current=await fingerprint(join(root,file.path));
  if(current.sha256!==file.sha256) inputChangesFromBefore.push({path:file.path,beforeSha256:file.sha256,afterSha256:current.sha256});
}
const generatorSource=await fingerprint('C:/Work/LumioGames/LumioGameRuntime-101-container-delta/tools/gen-declarations/CodeEmitter.cs');
const snapshotGenerator=sources.sources.LumioGameRuntime.files.find(f=>f.path==='tools/gen-declarations/CodeEmitter.cs');
assert.equal(generatorSource.sha256,snapshotGenerator.sha256);
const evidence={status:'finalized-named-container-candidate',schema:'bomber-v4-container-candidate',gameReleaseId:'bomber-0.0.4-main.54930d9',
  publicReleaseApproved:false,freezeEligible:false,packageRoot:await import('node:fs/promises').then(fs=>fs.realpath(join(root,'Engine'))),
  manifest:{sha256:hash(manifestBytes),version:manifest.version,platforms:manifest.platforms,platformImage:manifest.platformImage,sources:manifest.sources},packageFiles,generatorFiles,nugetCache,sourceRepositories,generatorSources,logs,postpackComparison:await fingerprint(postpackPath),
  sourceSnapshot,generatorSource,snapshotGenerator,
  packLog:await fingerprint(join(historyRoot,'games/101-bomber/.run/container-candidate-pack-02.log')),
  currentInputs:observed.files,inputChangesFromBefore,beforeLedgerSha256:hash(beforeBytes),activeLedgerSha256:hash(activeBytes),
  beforeComparison:{diagnostics:beforeComparison,bytesUnchanged:false,migrated:true,originalActiveCount:before.active.length,originalRetiredCount:before.retired.length,activeCount:active.active.length,retiredCount:active.retired.length,originalRetirementsUnchanged:true,originalRetirementsSha256:hash(JSON.stringify(before.retired)),preservedRetirementsSha256:hash(JSON.stringify(active.retired.slice(0,343))),allOriginalActiveShapesRetired:true,pendingUnchanged:true,transitions:active.transitions},
  historical:{identity:history.identity,files:history.files,diagnostics:bootstrapAudit.diagnostics},observations:{containers:active.active.filter(i=>i.kind==='container').map(i=>({owner:i.owner,...i.shape})),uint:active.active.filter(i=>i.kind==='scalar'&&i.shape.wireType==='u32').map(i=>({owner:i.owner,...i.shape})),callbackChecks:'Exact BindFields/Changing/Changed/ItemChanged dispatch and typed declarations checked for each generated component on both sides'},commands};
await writeFile(join(compatibility,'schema-identities.container-finalize-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({packageFiles:packageFiles.length,generatorFiles,inputs:inputs.length,beforeComparison:evidence.beforeComparison,tests:commands.map(c=>({command:c.command,exitCode:c.exitCode}))},null,2));
