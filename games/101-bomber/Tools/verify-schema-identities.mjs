import {access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readObservation} from './schema-identity-read.mjs';
import {audit,validateHistorySnapshots} from './schema-identity-model.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';
import {LEDGER_PATH,hash,inputError,readBaseline,readBootstrap} from './schema-identity-history.mjs';
import {readLedgerStorage,createBoundedFileReader} from './schema-identity-storage.mjs';
import {V16_SCHEMA,V16_PREDECESSOR} from './schema-identity-v16-evidence.mjs';

const report={mode:null,supportedInventoryConsistent:false,freezeEligible:false,baseline:null,inputHashes:{candidate:null,current:[],historical:[]},pendingDomains:[],diagnostics:[]};
function options(args) {
  const opts={};
  for(let i=0;i<args.length;i+=2) {
    const option=args[i];
    if(!['--repo-root','--history-root','--baseline-ref','--bootstrap-ref'].includes(option)||Object.hasOwn(opts,option)||!args[i+1]||args[i+1].startsWith('--')) throw inputError('invalid_cli','Expected --repo-root <path> and exactly one of --baseline-ref <full-SHA> or --bootstrap-ref <full-SHA>');
    opts[option]=args[i+1];
  }
  if(Number(Object.hasOwn(opts,'--baseline-ref'))+Number(Object.hasOwn(opts,'--bootstrap-ref'))!==1) throw inputError('invalid_cli','Exactly one independent baseline switch is required');
  return opts;
}

async function main() {
  const opts=options(process.argv.slice(2));
  const root=resolve(opts['--repo-root']??fileURLToPath(new URL('../../../',import.meta.url)));
  const bootstrap=Object.hasOwn(opts,'--bootstrap-ref');
  report.mode=bootstrap?'bootstrap-audit':'ledger-audit';
  const historyRoot=resolve(opts['--history-root']??root);
  const historical=bootstrap?readBootstrap(historyRoot,opts['--bootstrap-ref']):readBaseline(historyRoot,opts['--baseline-ref']);
  report.baseline=historical.identity;
  report.inputHashes.historical=historical.files;
  const game=join(root,'games/101-bomber'),candidateReader=createBoundedFileReader(game);
  const before=candidateReader.read('Gameplay/Compatibility/schema-identities.json');
  const candidate=readLedgerStorage(before,candidateReader.read);
  report.inputHashes.candidate={path:LEDGER_PATH,sha256:hash(before)};
  const snapshotPaths=new Set(),snapshotReader=createBoundedFileReader(game);
  const add=source=>{if(source&&/^Gameplay\/Compatibility\/[A-Za-z0-9_.-]+\.json$/.test(source.path))snapshotPaths.add(source.path);};
  const localHistory=candidate.schema===V16_SCHEMA?[...LOCAL_HISTORY_SNAPSHOTS,V16_PREDECESSOR]:LOCAL_HISTORY_SNAPSHOTS;
  for(const source of localHistory)add(source);
  for(const retirement of candidate.retired??[])add(retirement.sourceSnapshot);
  const snapshots={get:snapshotReader.read,*[Symbol.iterator](){for(const path of snapshotPaths){const bytes=snapshotReader.read(path);if(bytes)yield[path,bytes];}}};
  const historyDiagnostics=validateHistorySnapshots(candidate,snapshots,localHistory);
  report.inputHashes.historical.push(...snapshotReader.files().map(file=>({...file,path:'games/101-bomber/'+file.path})));
  if(candidateReader.files().length>1)report.inputHashes.candidatePages=candidateReader.files().slice(1).map(file=>({...file,path:'games/101-bomber/'+file.path}));
  if(historyDiagnostics.length){report.diagnostics=historyDiagnostics;return 1;}
  let observed;
  try {observed=await readObservation(join(root,'games/101-bomber'),candidate.schema==='bomber-v16-owner-prediction-candidate'?{schema:candidate.schema}:{});}
  catch(error) {
    if(error.code==='unsupported_source_shape'&&error.path?.startsWith('Gameplay/')) {
      try {await access(join(root,'games/101-bomber',error.path));}
      catch {throw inputError('missing_current_source',`Required declaration/generated input is absent: ${error.path}`);}
    }
    if(error.code==='unsupported_source_shape'||error.code==='input_changed') error.exitCode=1;
    throw error;
  }
  if(observed.files.length>1024) throw inputError('too_many_inputs','Current input set exceeds the bounded audit limit');
  report.inputHashes.current=observed.files;
  report.packageRoot=observed.packageRoot;
  candidateReader.assertUnchanged();
  snapshotReader.assertUnchanged();
  Object.assign(report,audit({baseline:historical.ledger,candidate,observed}));
  return report.supportedInventoryConsistent?0:1;
}

let exitCode;
try {exitCode=await main();}
catch(error) {
  exitCode=error.exitCode??2;
  report.diagnostics=[{code:error.code??'audit_input_error',identity:error.path??'input',message:error.message}];
}
const limit=200;
report.diagnosticCount=report.diagnostics.length;
report.diagnostics=report.diagnostics.slice(0,limit).map(d=>({...d,message:d.message.slice(0,600)}));
report.diagnosticsTruncated=report.diagnosticCount>limit;
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exitCode=exitCode;
