// Standalone verifier for the sealed schema16@complete27 composition qualification.
// Usage: node Tools/schema-identity-v16c27-verify.mjs --package-root <complete-release-dir> [--repo-root <game-root>]
// Environment: BOMBER_SCHEMA_V16C27_ROOT as --package-root fallback.
// Exit 0 = every sealed byte matches; exit 2 = mismatch with a coded reason.
// This verifier does not modify the historical v15/final122 gates; it only checks
// the NEW immutable record in schema-identity-v16c27-evidence.mjs.
import {readFileSync} from 'node:fs';
import {isAbsolute,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectV16C27Review,v16c27Hash,V16C27_REVIEW} from './schema-identity-v16c27-evidence.mjs';

const fail=(code,message)=>{console.error(JSON.stringify({code,message},null,1));process.exit(2);};
const args=process.argv.slice(2);
const opt=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
const repoRoot=resolve(opt('--repo-root')??fileURLToPath(new URL('../',import.meta.url)));
const packageRoot=opt('--package-root')??process.env.BOMBER_SCHEMA_V16C27_ROOT;
if(!packageRoot||!isAbsolute(resolve(packageRoot))) fail('invalid_package_root','--package-root <absolute complete-release dir> or BOMBER_SCHEMA_V16C27_ROOT is required');

const review=selectV16C27Review();
const read=p=>{try{return readFileSync(p);}catch{return null;}};
const report={repoRoot,packageRoot:resolve(packageRoot),checked:{author:0,generated:0,package:0},mismatches:[]};
for(const [path,expected] of Object.entries(review.author)) {
  const bytes=read(join(repoRoot,path));
  if(!bytes||v16c27Hash(bytes)!==expected) report.mismatches.push({kind:'author',path});
  report.checked.author++;
}
for(const [path,expected] of Object.entries(review.generated)) {
  const bytes=read(join(repoRoot,path));
  if(!bytes||v16c27Hash(bytes)!==expected) report.mismatches.push({kind:'generated',path});
  report.checked.generated++;
}
const p=review.package;
for(const [path,expected] of [['manifest.json',p.manifestSha256],[p.sdkPath,p.sdkSha256]]) {
  const bytes=read(join(packageRoot,path));
  if(!bytes||v16c27Hash(bytes)!==expected) report.mismatches.push({kind:'package',path});
  report.checked.package++;
}
const manifest=Object.fromEntries(report.mismatches.some(m=>m.path==='manifest.json')?[]:Object.entries(JSON.parse(readFileSync(join(packageRoot,'manifest.json'),'utf8'))));
if(manifest.version!==undefined&&manifest.version!==p.version) report.mismatches.push({kind:'package',path:'manifest.version'});
if(manifest.sources&&JSON.stringify(manifest.sources)!==JSON.stringify(p.sources)) report.mismatches.push({kind:'package',path:'manifest.sources'});
report.schema=review.schema;
report.verdict=report.mismatches.length?'MISMATCH':'SEALED_BYTES_MATCH';
console.log(JSON.stringify(report,null,1));
process.exit(report.mismatches.length?2:0);
