import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
const module = await import('./loaded-resource-witness.mjs').catch(error => { if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error; });
const base='http://127.0.0.1/game/';
const digest=data=>createHash('sha256').update(data).digest('hex');
function fixture(extra={}) {
  assert.equal(typeof module.createLoadedResourceWitness,'function','witness implementation exists');
  const data=Buffer.from('real binary'),side=Buffer.from(JSON.stringify({binarySha256:digest(data)}));
  const expected={schema:'lumio.browser-resources.v1',arm:'f3',version:'test',resources:[
    {url:'./_framework/a.wasm',sha256:digest(data),bytes:data.length,category:'dotnet',required:true},
    {url:'./lumio_engine_wasm_bg.wasm',sha256:digest(data),bytes:data.length,category:'native',required:true},
    {url:'./engine-wasm-build-info.json',sha256:digest(side),bytes:side.length,category:'data',required:true},
    {url:'./lumio_engine_wasm.js',sha256:digest('glue'),bytes:4,category:'js',required:true},
    {url:'./engine-wasm.mjs',sha256:digest('bridge'),bytes:6,category:'js',required:true},
    {url:'./optional.mjs',sha256:digest('opt'),bytes:3,category:'js',required:false}],bootResources:['./_framework/a.wasm'],jsEdges:[]};
  const calls=[],responses=[],imports=[];let handed;
  const text=JSON.stringify(expected);
  const witness=module.createLoadedResourceWitness({expected,expectedText:text,manifestDigest:digest(text),pageRunId:'test-run',arm:'f3',mode:'static-qualification',base,
    crypto:webcrypto,fetch:async url=>{calls.push(String(url));const r=new Response(String(url).includes('build-info')?side:data);responses.push(r);return r;},
    importModule:async url=>{imports.push(String(url));return String(url).includes('lumio_engine_wasm.js')?{default:async({module_or_path})=>{handed=module_or_path;return {actual:true};}}:{createEngineBridge:exports=>({exports})};},
    integrityFor:url=>url===base+'lumio_engine_wasm.js?lumioPageRun=test-run'?'sha256-'+createHash('sha256').update('glue').digest('base64'):undefined,
    ...extra});
  return {witness,expected,data,calls,responses,imports,getHanded:()=>handed};
}
test('synchronous boot dispatcher returns original unconsumed Response after one fetch',async()=>{
  const f=fixture(); const result=f.witness.loadBootResource('assembly','a','./_framework/a.wasm','', 'assembly');
  assert.ok(result instanceof Promise); const response=await result; assert.equal(response,f.responses[0]);assert.equal(response.bodyUsed,false);assert.equal(f.calls.length,1);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.data);
});
test('dotnetjs branch is synchronous string and required coverage closes separately',async()=>{
  const f=fixture(); const result=f.witness.loadBootResource('dotnetjs','dotnet','./engine-wasm.mjs','','js-module-dotnet');
  assert.equal(typeof result,'string'); await assert.rejects(f.witness.assertBootCoverage(),/missing.*coverage/i);
  await f.witness.loadBootResource('assembly','a','./_framework/a.wasm','','assembly'); await f.witness.assertBootCoverage();
});
for(const kind of ['wrong bytes','redirect','opaque','unknown']) test(`rejects ${kind} without binary handoff`,async()=>{
  const f=fixture({fetch:async()=>kind==='redirect'?{ok:true,redirected:true}:kind==='opaque'?{ok:true,type:'opaque'}:new Response('bad')});
  if(kind==='unknown')assert.throws(()=>f.witness.loadBootResource('assembly','a','./unknown.wasm','','assembly'));
  else await assert.rejects(f.witness.loadBootResource('assembly','a','./_framework/a.wasm','','assembly'));
  assert.equal(f.witness.snapshot().coverage.verified,0);
});
test('Native uses freshly protected exact query and hands hashed buffer to initializer once',async()=>{
  const f=fixture();const bridge=await f.witness.initializeNative(base);assert.deepEqual(bridge,{exports:{actual:true}});
  assert.ok(f.getHanded() instanceof ArrayBuffer);assert.equal(digest(Buffer.from(f.getHanded())),digest(f.data));
  assert.ok(f.imports.includes(base+'lumio_engine_wasm.js?lumioPageRun=test-run'));assert.equal(f.calls.length,2);
  await assert.rejects(f.witness.initializeNative(base),/already|reused/i);
});
test('verified data response remains normal decoder input',async()=>{
  const f=fixture(); const response=new Response(f.data);const returned=await f.witness.verifyDataResponse(response,'./_framework/a.wasm');
  assert.equal(returned,response);assert.equal(returned.bodyUsed,false);
});
test('manifest unknown digest wrong arm graph hole and missing WebCIL reject',()=>{
  for(const alter of [e=>e.resources[0].sha256='',e=>e.arm='baseline',e=>e.jsEdges=[{from:'./engine-wasm.mjs',to:'./missing.mjs'}],e=>e.bootResources=['./missing.wasm']]) {
    assert.throws(()=>fixture({expected:(()=>{const f={schema:'lumio.browser-resources.v1',arm:'f3',resources:[{url:'./a',sha256:'a'.repeat(64),bytes:1,required:true,category:'js'}],bootResources:[],jsEdges:[]};alter(f);return f;})()}));
  }
});
test('optional unconsumed branch remains UNLOADED and static cannot admit Session',()=>{
  const f=fixture();assert.equal(f.witness.snapshot().resources.find(r=>r.url==='./optional.mjs').status,'UNLOADED');
  assert.throws(()=>f.witness.noteStage('real-session-admitted'),/static/i);assert.throws(()=>f.witness.noteStage('invented'));
});
test('manifest digest failure is not replaced by fetched sidecar',async()=>{
  const f=fixture({manifestDigest:'a'.repeat(64)});await assert.rejects(f.witness.ready,/manifest/i);
});
test('canonical-only glue integrity does not cover the fresh query',async()=>{
  const f=fixture({integrityFor:()=>undefined});await assert.rejects(f.witness.initializeNative(base),/fresh_query_integrity/);assert.equal(f.imports.length,0);
});
test('default integrity map rejects canonical-only key for the exact Native query URL',async()=>{
  globalThis.__lumioResourceBootstrap={integrity:{'./lumio_engine_wasm.js':'sha256-'+createHash('sha256').update('glue').digest('base64')}};
  try{const f=fixture({integrityFor:undefined});await assert.rejects(f.witness.initializeNative(base),/fresh_query_integrity/);}
  finally{delete globalThis.__lumioResourceBootstrap;}
});
test('export validator rejects missing membership and cross-page or cross-arm receipts',()=>{
  const f=fixture(),receipt=f.witness.snapshot();assert.doesNotThrow(()=>f.witness.validateExport(receipt));
  for(const alter of [r=>r.arm='baseline',r=>r.pageRunId='another-page',r=>r.resources.pop(),r=>r.coverage.expected--]){
    const changed=structuredClone(receipt);alter(changed);assert.throws(()=>f.witness.validateExport(changed));
  }
});
test('visible export button downloads the actual complete JSON snapshot',async()=>{
  const f=fixture();const button=new EventTarget();let blob,download;
  f.witness.bindExport(button,{document:{createElement:()=>({click(){download=this.download;}})},URL:{createObjectURL:value=>{blob=value;return 'blob:actual';},revokeObjectURL(){}}});
  button.dispatchEvent(new Event('click'));const exported=JSON.parse(await blob.text());
  assert.equal(exported.pageRunId,'test-run');assert.equal(exported.resources.length,f.expected.resources.length);assert.match(download,/test-run/);
});
