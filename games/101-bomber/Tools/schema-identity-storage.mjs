// Internal audit-file storage only. No identity allocation or retirement rewriting.
import {createHash} from 'node:crypto';
import {openSync,closeSync,fstatSync,readSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';

export const MAX_INPUT_BYTES = 8*1024*1024;
export const MAX_INDEX_BYTES = 8*1024*1024;
const MAX_PAGES = 4096;
const sequences = new WeakSet();
const object = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys = (value,wanted) => object(value)&&Object.keys(value).length===wanted.length&&wanted.every(key=>Object.hasOwn(value,key));
const uint = value => Number.isSafeInteger(value)&&value>=0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value,(_,item)=>object(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export const canonicalHash = value => hash(canonical(value));
export const storageError = (code,message) => Object.assign(new Error(message),{code,exitCode:2});
const fail = (code,message) => {throw storageError(code,message);};
const safePagePath = path => typeof path==='string'&&/^Gameplay\/Compatibility\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/.test(path)&&!path.includes('..');
const parse = (bytes,code) => {
  if(!Buffer.isBuffer(bytes))fail(code,'Required audit input is absent');
  if(bytes.length>MAX_INPUT_BYTES)fail('candidate_too_large','Audit input exceeds 8 MiB');
  try{return JSON.parse(bytes);}catch{fail(code,'Audit input is not JSON');}
};

// A page is held only while its rows are yielded. Every pass re-authenticates its bytes.
class RetirementPages {
  #pages; #read;
  constructor(pages,count,read) {
    this.#pages=pages.map(page=>Object.freeze({...page}));
    this.#read=read;
    this.length=count;
    sequences.add(this);
    Object.freeze(this);
  }
  *[Symbol.iterator]() {
    for(const page of this.#pages) {
      const bytes=this.#read(page.path);
      if(!Buffer.isBuffer(bytes))fail('missing_retirement_page',page.path);
      if(bytes.length>MAX_INPUT_BYTES||bytes.length!==page.bytes||hash(bytes)!==page.sha256)
        fail('retirement_page_hash_mismatch',page.path);
      const decoded=parse(bytes,'invalid_retirement_page');
      if(!keys(decoded,['formatVersion','start','rows'])||decoded.formatVersion!==1||decoded.start!==page.start||!Array.isArray(decoded.rows)||decoded.rows.length!==page.count)
        fail('invalid_retirement_page',page.path);
      yield* decoded.rows;
    }
  }
}
export const isRetirementSequence = value => Array.isArray(value)||sequences.has(value);

export function* encodeLedgerPages(ledger,prefix='schema-retirements.v9') {
  if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(prefix)||prefix.includes('..'))fail('invalid_retirement_page_reference','Invalid page prefix');
  const pages=[];
  let rows=[],rowBytes=0,start=0;
  const flush=()=>{
    const bytes=Buffer.from(`{"formatVersion":1,"start":${start},"rows":[${rows.join(',')}]}\n`);
    if(bytes.length>MAX_INPUT_BYTES)fail('candidate_too_large','Encoded retirement page exceeds 8 MiB');
    const path=`Gameplay/Compatibility/${prefix}.${String(pages.length).padStart(4,'0')}.json`;
    if(pages.length>=MAX_PAGES)fail('too_many_inputs','Bounded retirement page inventory exhausted');
    pages.push({path,sha256:hash(bytes),bytes:bytes.length,start,count:rows.length});
    start+=rows.length;rows=[];rowBytes=0;
    return {path,bytes};
  };
  for(const row of ledger.retired) {
    const text=JSON.stringify(row),size=Buffer.byteLength(text);
    if(size+128>MAX_INPUT_BYTES)fail('candidate_too_large','A retirement cannot fit one bounded page');
    if(rows.length&&(rowBytes+size>1024*1024||rows.length===256))yield flush();
    rows.push(text);rowBytes+=size+1;
  }
  if(rows.length)yield flush();
  const manifest={...ledger,formatVersion:2,retired:{storage:'pages-v1',count:start,pages}};
  const bytes=Buffer.from(JSON.stringify(manifest)+'\n');
  if(bytes.length>MAX_INPUT_BYTES)fail('candidate_too_large','Encoded manifest exceeds 8 MiB');
  yield {path:'Gameplay/Compatibility/schema-identities.json',bytes};
}

export function readLedgerStorage(bytes,readPage) {
  const ledger=parse(bytes,'invalid_candidate_json');
  if(ledger?.formatVersion!==2)return ledger;
  if(!keys(ledger,['formatVersion','schema','status','engineRevision','runtimeRevision','active','retired','pending','transitions','freezeEligible']))
    fail('invalid_ledger_storage','Unexpected manifest properties');
  const storage=ledger.retired;
  if(!keys(storage,['storage','count','pages'])||storage.storage!=='pages-v1'||!uint(storage.count)||!Array.isArray(storage.pages)||storage.pages.length>MAX_PAGES)
    fail('invalid_ledger_storage','Malformed retirement manifest');
  let start=0;
  const paths=new Set();
  for(const page of storage.pages) {
    if(!keys(page,['path','sha256','bytes','start','count'])||!safePagePath(page.path)||!(/^[a-f0-9]{64}$/).test(page.sha256)||!uint(page.bytes)||page.bytes<1||page.bytes>MAX_INPUT_BYTES||!uint(page.start)||!uint(page.count)||page.count<1)
      fail('invalid_retirement_page_reference','Malformed or external retirement page');
    if(paths.has(page.path))fail('duplicate_retirement_page',page.path);
    if(page.start!==start)fail('retirement_page_order','Retirement pages must preserve exact contiguous order');
    paths.add(page.path);
    start+=page.count;
    if(!Number.isSafeInteger(start))fail('invalid_ledger_storage','Retirement count overflow');
  }
  if(start!==storage.count)fail('retirement_page_count','Retirement count disagrees with manifest');
  const retired=new RetirementPages(storage.pages,storage.count,readPage);
  // Force authentication at admission; subsequent passes repeat it to reject mutation.
  for(const unused of retired)void unused;
  return {...ledger,formatVersion:1,retired};
}

// Both the physical path and all bytes are verified. A growing file cannot allocate beyond
// the existing input limit: read the stat-sized buffer and then probe one excess byte.
export function createBoundedFileReader(root) {
  const base=realpathSync(root),inputs=new Map();
  const read = path => {
    if(typeof path!=='string'||isAbsolute(path)||path.split(/[\\/]/).includes('..'))fail('external_audit_input',String(path));
    let actual;
    try{actual=realpathSync(resolve(base,path));}catch(error){if(error.code==='ENOENT')return undefined;throw error;}
    const within=relative(base,actual);
    if(isAbsolute(within)||within==='..'||within.startsWith('..\\')||within.startsWith('../'))fail('external_audit_input',path);
    const fd=openSync(actual,'r');
    let bytes;
    try {
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.size>MAX_INPUT_BYTES)fail('candidate_too_large',path);
      bytes=Buffer.allocUnsafe(stat.size);
      let offset=0;
      while(offset<bytes.length) {
        const count=readSync(fd,bytes,offset,bytes.length-offset,offset);
        if(count===0)fail('input_changed',path);
        offset+=count;
      }
      if(readSync(fd,Buffer.allocUnsafe(1),0,1,offset)!==0)fail('input_changed',path);
    }finally{closeSync(fd);}
    const sha256=hash(bytes),prior=inputs.get(path);
    if(prior&&prior.sha256!==sha256)fail('input_changed',path);
    if(!prior) {
      if(inputs.size>=MAX_PAGES+1024)fail('too_many_inputs','Bounded physical input inventory exhausted');
      inputs.set(path,{path,sha256});
    }
    return bytes;
  };
  return {read,files:()=>[...inputs.values()],assertUnchanged:()=>{for(const path of inputs.keys())if(!read(path))fail('input_changed',path);}};
}

// Compact comparison summaries are charged before insertion. Intern repeated schema/owner/key
// strings, bound the index independently of page count, and retain no shape/evidence objects.
export class RetirementIndexBudget {
  #strings=new Map(); #bytes=0;
  get bytes(){return this.#bytes;}
  reserve(strings,fixedBytes=512) {
    let growth=fixedBytes;
    const missing=new Set();
    for(const value of strings)if(typeof value==='string'&&!this.#strings.has(value)&&!missing.has(value)) {
      missing.add(value);growth+=80+2*value.length;
    }
    if(this.#bytes+growth>MAX_INDEX_BYTES)fail('retirement_index_capacity','Retirement comparison index exceeds its fixed 8 MiB budget');
    this.#bytes+=growth;
    for(const value of missing)this.#strings.set(value,value);
    return strings.map(value=>typeof value==='string'?this.#strings.get(value):value);
  }
}
