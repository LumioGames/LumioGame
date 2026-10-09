import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = hex => 'sha256-'+Buffer.from(hex,'hex').toString('base64');
const moduleExtension = /\.(?:mjs|js)$/;
async function files(root, directory = '') {
  const result=[];
  for (const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})) {
    if(entry.isSymbolicLink()) throw new Error('resource_symlink_rejected');
    const relative=path.posix.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(root,relative)); else result.push(relative);
  }
  return result.sort();
}
function jsonObject(source,start) {
  let depth=0,quoted=false,escaped=false;
  for(let end=start;end<source.length;end++){
    const ch=source[end];
    if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"'){quoted=true;continue;}
    if(ch==='{')depth++;if(ch==='}'&&--depth===0)return JSON.parse(source.slice(start,end+1));
  }
  throw new Error('resource_boot_config_truncated');
}
function bootConfig(source) {
  const jsonStart='/*json-start*/',jsonEnd='/*json-end*/';
  if(source.includes(jsonStart)){
    const start=source.indexOf(jsonStart),end=source.indexOf(jsonEnd,start+jsonStart.length);
    if(start!==source.lastIndexOf(jsonStart)||end<0||end!==source.lastIndexOf(jsonEnd))throw new Error('resource_boot_config_marker_ambiguous_or_truncated');
    const config=JSON.parse(source.slice(start+jsonStart.length,end));
    if(!config.resources&&!config.assets)throw new Error('resource_boot_config_missing_resources');
    return config;
  }
  const embedded=source.indexOf('/*! dotnetBootConfig */');
  const external=/^\s*export\s+const\s+config\s*=/.exec(source);
  const start=source.indexOf('{',embedded>=0?embedded:external?external[0].length:0);
  if(embedded<0&&!external)throw new Error('resource_boot_config_not_data');
  const config=jsonObject(source,start);
  if(!config.resources&&!config.assets)throw new Error('resource_boot_config_missing_resources');
  return config;
}

export async function sealBrowserResources({ publishRoot, expectedInput, out }) {
  const require=createRequire(await fs.realpath(new URL('../Client/Presentation/node_modules/vitest/package.json',import.meta.url)));
  const {init,parse}=require('es-module-lexer');await init;
  const root=path.resolve(publishRoot),output=path.resolve(out);
  if (path.dirname(output)!==root || !['f1','f3','baseline','original98'].includes(expectedInput?.arm))
    throw new Error('resource_seal_input_invalid');
  try { await fs.access(output);throw new Error('resource_seal_output_exists'); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const indexPath=path.join(root,'index.html');let html=await fs.readFile(indexPath,'utf8');
  if(html.includes('lumio-resource-bootstrap'))throw new Error('resource_root_already_sealed');
  const importMatch=html.match(/<script\s+type="importmap"[^>]*>([\s\S]*?)<\/script>/);
  if(!importMatch)throw new Error('resource_importmap_missing');
  const sdkMap=JSON.parse(importMatch[1]||'{}');
  const names=(await files(root)).filter(name=>!['index.html',path.basename(output)].includes(name)&&!/(?:\.gz|\.br|\.pdb|\.map)$/.test(name));
  const inventory=new Map();
  for(const name of names){const bytes=await fs.readFile(path.join(root,name));inventory.set(name,{url:'./'+name,bytes:bytes.length,sha256:sha(bytes),
    category:moduleExtension.test(name)?'js':name.startsWith('_framework/')&&name.endsWith('.wasm')?'dotnet':name==='lumio_engine_wasm_bg.wasm'?'native':name.endsWith('.css')?'style':'data',required:false});}
  if(!inventory.has('main.js')||!inventory.has('lumio_engine_wasm.js'))throw new Error('resource_entry_or_glue_missing');
  let bootName=names.find(name=>/^_framework\/dotnet\.boot(?:\.[\w-]+)?\.js$/.test(name));
  const entryName=(sdkMap.imports?.['./_framework/dotnet.js']??'').replace(/^\.\//,'');
  let config;
  if(entryName&&inventory.has(entryName)){
    const source=await fs.readFile(path.join(root,entryName),'utf8');
    if(source.includes('/*! dotnetBootConfig */')||source.includes('/*json-start*/')){
      try{config=bootConfig(source);bootName=entryName;}catch(error){if(!bootName)throw error;}
    }
  }
  if(!config&&bootName)config=bootConfig(await fs.readFile(path.join(root,bootName),'utf8'));
  if(!config)throw new Error('resource_actual_boot_config_missing');
  const bootResources=[];
  const bootModules=[];
  function collectBoot(value) {
    if(!value||typeof value!=='object')return;
    if(typeof value.name==='string'){
      const name=value.name,resource=inventory.get('_framework/'+name);
      if(!resource){if(value.isOptional===true)return;throw new Error('resource_required_boot_asset_missing:'+name);}
      if(/\.(?:wasm|dll|dat|blat)$/.test(name)&&value.isOptional!==true){resource.required=true;bootResources.push(resource.url);}
      if(moduleExtension.test(name)){resource.required=value.isOptional!==true;bootModules.push(resource.url);}
      return;
    }
    for(const [name,entry]of Object.entries(value)){
      if(typeof entry==='string' && /\.(?:wasm|dll)$/.test(name)){
        const resource=inventory.get('_framework/'+name);if(!resource)throw new Error('resource_required_WebCIL_missing:'+name);
        resource.required=true;bootResources.push(resource.url);
      }else if(entry&&typeof entry==='object')collectBoot(entry);
    }
  }
  collectBoot(config.resources);collectBoot(config.assets);
  const bootAlternativeGroups=[];
  if(config.globalizationMode==='sharded'){
    const icu=config.resources?.icu,paths=['icudt_CJK.dat','icudt_EFIGS.dat','icudt_no_CJK.dat'];
    if(!Array.isArray(icu)||icu.length!==3||new Set(icu.map(row=>row.virtualPath)).size!==3||
      new Set(icu.map(row=>row.name)).size!==3||icu.some(row=>!paths.includes(row.virtualPath)||
        typeof row.name!=='string'||!/^[\w.-]+\.dat$/.test(row.name)||row.isOptional===true||!inventory.has('_framework/'+row.name)))
      throw new Error('resource_icu_alternative_group_invalid');
    const members=icu.map(row=>({url:inventory.get('_framework/'+row.name).url,virtualPath:row.virtualPath}));
    for(const member of members){inventory.get(member.url.slice(2)).required=false;
      for(let i=bootResources.length-1;i>=0;i--)if(bootResources[i]===member.url)bootResources.splice(i,1);}
    bootAlternativeGroups.push({id:'dotnet-icu-sharded-locale',kind:'dotnet-icu-sharded-locale',minimumVerified:1,members});
  }
  if(!bootResources.length)throw new Error('resource_actual_boot_binaries_empty');
  const edges=[],excludedBranches=[{from:'./main.js',url:'./dev-hot-reload.mjs',reason:'witness rejects __lumioDevelopment before boot'}];
  const resolveImport=(from,specifier)=>{
    const parent=new URL(from,'https://seal.invalid/');
    const absolute=new URL(specifier,parent).href;
    const mapped=sdkMap.imports?.[specifier]??sdkMap.imports?.[absolute.replace('https://seal.invalid/','./')];
    const resolved=new URL(mapped??specifier,parent);
    if(resolved.origin!=='https://seal.invalid'||resolved.search||resolved.hash)throw new Error('resource_unresolved_external_import:'+specifier);
    const name=decodeURIComponent(resolved.pathname.slice(1));
    if(!inventory.has(name))throw new Error('resource_import_missing:'+name);
    return './'+name;
  };
  for(const [name,resource]of inventory){
    if(resource.category!=='js')continue;
    const source=await fs.readFile(path.join(root,name),'utf8');
    const contract=expectedInput.dotnetLoaderContract?.version==='10.0.12'&&
      expectedInput.dotnetLoaderContract.files?.find(file=>file.file===name&&file.sha256===resource.sha256);
    const dotnetContract=Boolean(contract&&/^_framework\/dotnet(?:\.[\w-]+)*\.js$/.test(name));
    if(/\bnew\s+(?:SharedWorker|Worker)\s*\(/.test(source)&&!dotnetContract)throw new Error('resource_worker_graph_unsupported:'+name);
    if(dotnetContract&&(config.resources?.jsModuleWorker?.length||config.pthreadPoolSize))throw new Error('resource_threaded_loader_unsupported');
    const [imports]=parse(source,name);
    for(const match of imports){
      if(match.d===-2||match.n===undefined)continue;
      const specifier=match.n;
      if(name==='main.js'&&specifier==='./dev-hot-reload.mjs'&&/if\s*\(globalThis\.__lumioDevelopment\)/.test(source))continue;
      const unreachable=contract?.browserUnreachableImports?.find(branch=>branch.specifier===specifier&&branch.statementStart===match.ss&&branch.statementEnd===match.se);
      if(dotnetContract&&/^_framework\/dotnet\.native\./.test(name)&&specifier==='module'&&unreachable&&
        source.slice(match.ss,match.se)==="import('module')"&&unreachable.nodeGuardStart===source.indexOf('if (ENVIRONMENT_IS_NODE) {')&&
        source.slice(unreachable.nodeGuardStart,match.ss).trimEnd().endsWith('const { createRequire } = await')&&
        sha(Buffer.from(source.slice(unreachable.nodeGuardStart,match.se)))===unreachable.guardSliceSha256){
        excludedBranches.push({from:resource.url,url:specifier,reason:'exact inspected native Node-only createRequire branch; browser unreachable',loaderSha256:resource.sha256,...unreachable});continue;
      }
      if(dotnetContract&&['process','module'].includes(specifier)&&unreachable&&unreachable.statement===source.slice(match.ss,match.se)&&
        Number.isSafeInteger(unreachable.guardStart)&&Number.isSafeInteger(unreachable.guardEnd)&&unreachable.guardStart>=0&&unreachable.guardStart<=match.ss&&unreachable.guardEnd>=match.se&&unreachable.guardEnd<=source.length){
        const guard=source.slice(unreachable.guardStart,unreachable.guardEnd),definition=unreachable.environmentDefinition;
        const nodeDefinition=definition&&['Se','tt'].includes(definition.token)&&Number.isSafeInteger(definition.start)&&Number.isSafeInteger(definition.end)&&definition.start>=0&&definition.end>definition.start&&definition.end<=source.length?
          source.slice(definition.start,definition.end):null;
        const nodeGuard=unreachable.kind==='node-environment'&&nodeDefinition&&sha(Buffer.from(nodeDefinition))===definition.sha256&&
          nodeDefinition.replace(/^const /,'')===`${definition.token}="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node`&&
          (guard.includes(`if(${definition.token})`)||guard.includes(`${definition.token}?`));
        const builder=inventory.get('main.js'),builderSource=await fs.readFile(path.join(root,'main.js'),'utf8');
        const configGuard=unreachable.kind==='selected-async-flush-disabled'&&specifier==='process'&&!config.asyncFlushOnExit&&
          guard.includes('if(Pe.config&&Pe.config.asyncFlushOnExit&&0===t)')&&builder.sha256===unreachable.builderSha256&&
          !/withAsyncFlushOnExit|asyncFlushOnExit|runMainAndExit/.test(builderSource);
        if(sha(Buffer.from(guard))===unreachable.guardSliceSha256&&(nodeGuard||configGuard)){
          excludedBranches.push({from:resource.url,url:specifier,reason:nodeGuard?'exact inspected standard Node predicate; false in browser':'config-dependent: actual boot asyncFlushOnExit disabled and current hashed builder does not enable or call exit',loaderSha256:resource.sha256,...unreachable});continue;
        }
      }
      edges.push({from:resource.url,to:resolveImport(resource.url,specifier),dynamic:match.d>=0});
    }
    const computed=imports.filter(match=>match.d>=0&&match.n===undefined);
    if(computed.length){
      if(name==='loaded-resource-witness.mjs'&&computed.length===1&&/importModule\s*=\s*url\s*=>\s*import\(url\)/.test(source)){
        for(const target of ['lumio_engine_wasm.js','engine-wasm.mjs']){if(!inventory.has(target))throw new Error('resource_native_query_graph_missing');edges.push({from:resource.url,to:'./'+target,dynamic:true,contract:'witness-public-native-exports'});}
      }else if(name==='engine-wasm.mjs'&&computed.length===1&&/import\(new URL\('lumio_engine_wasm.js', base\)\)/.test(source)){
        edges.push({from:resource.url,to:'./lumio_engine_wasm.js',dynamic:true,contract:'official-loader-unused-in-witness'});
      }else if(dotnetContract){
        for(const target of bootModules)edges.push({from:resource.url,to:target,dynamic:true,contract:'inspected-dotnet-10.0.12-boot-resource-array'});
      }else throw new Error('resource_computed_import_unresolved:'+name);
    }
  }
  inventory.get('main.js').required=true;
  inventory.get(bootName).required=true;
  for(const name of ['lumio_engine_wasm.js','lumio_engine_wasm_bg.wasm','engine-wasm.mjs','engine-wasm-build-info.json','official-catalog.json']){
    const resource=inventory.get(name);if(!resource)throw new Error('resource_required_missing:'+name);resource.required=true;
  }
  for(const resource of inventory.values())if(resource.category==='style')resource.required=true;
  for(const data of expectedInput.dataResources??[]){
    const name=data.file;const local=inventory.get(name);if(!local||data.url!=='/api/game/config')throw new Error('resource_data_expectation_invalid');
    inventory.set(data.url,{...local,url:data.url,required:true,category:'data'});
  }
  const manifest={schema:'lumio.browser-resources.v1',arm:expectedInput.arm,version:expectedInput.version,sourceHead:expectedInput.sourceHead,imports:sdkMap.imports??{},
    bootModule:'./'+bootName,resources:[...inventory.values()],bootResources:[...new Set(bootResources)],bootModules:[...new Set(bootModules)],bootAlternativeGroups,jsEdges:edges,
    excludedBranches};
  const manifestText=JSON.stringify(manifest,null,2)+'\n';const digest=sha(Buffer.from(manifestText));
  const integrity=Object.fromEntries(manifest.resources.filter(r=>r.category==='js').map(r=>[r.url,sri(r.sha256)]));
  const bootstrap=`<script id="lumio-resource-bootstrap">\n(()=>{const preview=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('scene')==='movement-sync-preview';\n`+
    `const expectedText=${JSON.stringify(manifestText).replace(/</g,'\\u003c')};const expected=JSON.parse(expectedText);const pageRunId=crypto.randomUUID();const map=${JSON.stringify({...sdkMap,integrity}).replace(/</g,'\\u003c')};\n`+
    `const base=new URL('.',location.href);const glue=new URL('lumio_engine_wasm.js',base);glue.searchParams.set('lumioPageRun',pageRunId);map.integrity[glue.href]=map.integrity['./lumio_engine_wasm.js'];\n`+
    `const element=document.createElement('script');element.type='importmap';element.textContent=JSON.stringify(map);document.head.append(element);\n`+
    `if(preview)globalThis.__lumioResourceBootstrap={expectedText,expected,manifestDigest:${JSON.stringify(digest)},pageRunId,arm:expected.arm,mode:'dedicated-preview',integrity:map.integrity};})();\n</script>`;
  // Private seal outputs are never normal production publications.
  const preload=html.match(/<link\s+[^>]*id="webassembly"[^>]*>/)?.[0]??'';
  html=html.replace(preload,'').replace(importMatch[0],bootstrap+preload);
  html=html.replace(/<script\s+type="module"\s+src="\.\/main.js"[^>]*><\/script>/,
    `<script type="module" src="./main.js" integrity="${sri(inventory.get('main.js').sha256)}" crossorigin="anonymous"></script>`);
  html=html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g,(tag,url)=>{
    const name=url.replace(/^\.\//,'');const resource=inventory.get(name);if(!resource)throw new Error('resource_style_missing');
    return tag.replace(/>$/,` integrity="${sri(resource.sha256)}" crossorigin="anonymous">`);
  });
  await fs.writeFile(output,manifestText,{flag:'wx'});await fs.writeFile(indexPath,html);
  return manifest;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2);
  if(command!=='seal')throw new Error('Only seal is supported by this source-stage tool');
  const options={};for(let i=0;i<args.length;i+=2){if(!['--publish-root','--expected-input','--out'].includes(args[i])||!args[i+1])throw new Error('Invalid seal arguments');options[args[i]]=args[i+1];}
  const expectedInput=JSON.parse(await fs.readFile(options['--expected-input'],'utf8'));
  await sealBrowserResources({publishRoot:options['--publish-root'],expectedInput,out:options['--out']});
}
