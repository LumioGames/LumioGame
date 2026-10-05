// Test-only materialization, with an explicit finite aggregate limit. Production uses page
// iterators and bounded comparison indexes; mutation fixtures need independent mutable rows.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLedgerStorage,createBoundedFileReader,encodeLedgerPages,MAX_INPUT_BYTES} from './schema-identity-storage.mjs';
const MAX_TEST_LEDGER_BYTES=16*1024*1024;
export function materializeTestLedger(ledger) {
  let bytes=0;
  const retired=[];
  for(const row of ledger.retired) {
    bytes+=Buffer.byteLength(JSON.stringify(row));
    if(bytes>MAX_TEST_LEDGER_BYTES)throw Error('Test fixture exceeds its finite materialization budget');
    retired.push(row);
  }
  return {...ledger,retired};
}
export function loadTestLedger(file) {
  const path=file instanceof URL?fileURLToPath(file):file;
  const game=resolve(dirname(path),'../..'),reader=createBoundedFileReader(game);
  return materializeTestLedger(readLedgerStorage(readFileSync(path),reader.read));
}
export function writeTestLedger(file,ledger) {
  const bytes=Buffer.from(JSON.stringify(ledger)+'\n');
  mkdirSync(dirname(file),{recursive:true});
  if(bytes.length<=MAX_INPUT_BYTES){writeFileSync(file,bytes);return;}
  const game=resolve(dirname(file),'../..');
  for(const entry of encodeLedgerPages(ledger,'schema-retirements.test')) {
    mkdirSync(dirname(join(game,entry.path)),{recursive:true});writeFileSync(join(game,entry.path),entry.bytes);
  }
}
