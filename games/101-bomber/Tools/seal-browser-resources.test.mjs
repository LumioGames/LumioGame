import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,mkdir,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const module=await import('./seal-browser-resources.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
async function fixture(t) {
  assert.equal(typeof module.sealBrowserResources,'function','sealer implementation exists');
  const root=await mkdtemp(path.join(tmpdir(),'lumio-uv-seal-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'_framework'));
  for(const [name,text] of Object.entries({'index.html':'<head><script type="importmap">{"imports":{"./_framework/dotnet.js":"./_framework/dotnet.hash.js"}}</script></head><link rel="stylesheet" href="./spectator.css"><script type="module" src="./main.js"></script>',
    'main.js':"import './static.mjs';import('./dynamic.mjs');",'static.mjs':'export const x=1;', 'dynamic.mjs':'export const y=2;',
    'lumio_engine_wasm.js':'export default function(){}','engine-wasm.mjs':'export function createEngineBridge(){}',
    'lumio_engine_wasm_bg.wasm':'native bytes','engine-wasm-build-info.json':'{}','official-catalog.json':'{}',
    'spectator.css':'body{}','_framework/dotnet.hash.js':'export const dotnet={};',
    '_framework/a.wasm':'WebCIL bytes','_framework/dotnet.boot.js':'export const config = {"resources":{"assembly":[{"name":"a.wasm","hash":"sha256-test"}]}};'}))await writeFile(path.join(root,name),text);
  return root;
}
test('seal covers descendants and WebCIL with SDK fingerprint map preserved before entry',async t=>{
  const root=await fixture(t);const out=path.join(root,'browser-resource-manifest.json');
  const manifest=await module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3',version:'test'},out});
  assert.ok(manifest.resources.find(r=>r.url==='./static.mjs'));assert.ok(manifest.resources.find(r=>r.url==='./dynamic.mjs'));
  assert.ok(manifest.bootResources.includes('./_framework/a.wasm'));
  const html=await readFile(path.join(root,'index.html'),'utf8');assert.match(html,/integrity="sha256-/);assert.match(html,/dotnet\.hash\.js/);
  assert.ok(html.indexOf('lumioPageRun')<html.indexOf('src="./main.js"'));assert.ok(!manifest.resources.some(r=>r.url==='./index.html'));
  await assert.rejects(module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3'},out}),/exists|sealed/i);
});
for(const [name,source] of [['missing',"import './absent.mjs';"],['computed',"import(variable);"],['worker',"new Worker('./static.mjs');"]]) test(`sealer rejects ${name} unresolved graph`,async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'main.js'),source);
  await assert.rejects(module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3'},out:path.join(root,'browser-resource-manifest.json')}));
});
test('embedded actual SDK boot array binds initializer through an inspected loader hash',async t=>{
  const root=await fixture(t);await rm(path.join(root,'_framework/dotnet.boot.js'));
  const loader='const url="./initializer.js";import(url);const dotnet={withConfig(){}};dotnet.withConfig(/*! dotnetBootConfig */{"resources":{"assembly":[{"name":"a.wasm","hash":"sha256-test"}],"modulesAfterRuntimeReady":[{"name":"initializer.js","hash":"sha256-test"}]}});';
  await writeFile(path.join(root,'_framework/dotnet.hash.js'),loader);await writeFile(path.join(root,'_framework/initializer.js'),'export function onRuntimeReady(){}');
  const out=path.join(root,'browser-resource-manifest.json');
  await assert.rejects(module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3'},out}),/computed_import/);
  const manifest=await module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3',version:'test',dotnetLoaderContract:{version:'10.0.12',files:[{file:'_framework/dotnet.hash.js',sha256:createHash('sha256').update(loader).digest('hex')}]}},out});
  assert.ok(manifest.bootModules.includes('./_framework/initializer.js'));assert.ok(manifest.jsEdges.some(e=>e.to==='./_framework/initializer.js'));
});
test('required boot membership missing and path escape fail before any seal output',async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'_framework/dotnet.boot.js'),'export const config={"resources":{"assembly":[{"name":"missing.wasm"}]}};');
  await assert.rejects(module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3'},out:path.join(root,'browser-resource-manifest.json')}),/missing/);
});
test('module lexer distinguishes comment imports from import-like text inside a string',async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'main.js'),`const label="import('./absent.mjs')";import /* actual module */ './static.mjs';import('./dynamic.mjs');`);
  const manifest=await module.sealBrowserResources({publishRoot:root,expectedInput:{arm:'f3'},out:path.join(root,'browser-resource-manifest.json')});
  assert.ok(manifest.jsEdges.some(edge=>edge.to==='./static.mjs'));assert.ok(manifest.jsEdges.some(edge=>edge.to==='./dynamic.mjs'));
});
