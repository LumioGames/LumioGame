const STAGES = new Set(['binary-returned','Native-initialized','dotnet-created','runMain-completed',
  'real-exports-bound','required-import-completed','Presentation-created','controls-created','trace-created','real-session-admitted']);
const HEX = /^[a-f0-9]{64}$/;
const RUN = /^[a-zA-Z0-9_-]{1,100}$/;

export function createLoadedResourceWitness({ expected, expectedText, manifestDigest, pageRunId, arm, mode,
  base = globalThis.location?.href, fetch: fetchResource = globalThis.fetch, crypto = globalThis.crypto,
  importModule = url => import(url), integrityFor = url => {
    const map=globalThis.__lumioResourceBootstrap?.integrity;
    const resolved=new URL(url);
    if(resolved.search)return map?.[url];
    return map?.[url] ?? map?.['./'+resolved.pathname.slice(new URL(base).pathname.length)];
  } }) {
  if (!['static-qualification','dedicated-preview'].includes(mode) || !RUN.test(pageRunId ?? '') ||
      !HEX.test(manifestDigest ?? '') || expected?.schema !== 'lumio.browser-resources.v1' || expected.arm !== arm)
    throw new Error('resource_manifest_invalid');
  if (globalThis.navigator?.serviceWorker?.controller || globalThis.__lumioDevelopment)
    throw new Error('resource_witness_serviceworker_or_devhotreload');
  function freeze(value) {
    if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  }
  freeze(expected);
  const origin = new URL(base).origin;
  const resources = new Map();
  const states = new Map();
  const failures = [];
  const stages = [];
  const bootSeen = new Set();
  const urlOf = value => new URL(expected.imports?.[String(value)] ?? value, base).href;
  for (const resource of expected.resources ?? []) {
    const url = urlOf(resource.url);
    if (new URL(url).origin !== origin || new URL(url).hash || !HEX.test(resource.sha256 ?? '') ||
        !Number.isSafeInteger(resource.bytes) || resource.bytes < 0 || typeof resource.required !== 'boolean' || resources.has(url))
      throw new Error('resource_manifest_entry_invalid');
    resources.set(url, Object.freeze({ ...resource, resolvedUrl:url }));
    states.set(url, { status:'UNLOADED' });
  }
  if (!resources.size) throw new Error('resource_manifest_empty');
  const requiredCount=[...resources.values()].filter(resource=>resource.required).length;
  let verifiedCount=0,unloadedCount=resources.size,requiredConsumed=0,manifestVerified=false;
  const consumed=new Set(['VERIFIED','IMPORTED','APPLIED']);
  function mark(url,value){
    const before=states.get(url);
    verifiedCount+=Number(value.status==='VERIFIED')-Number(before.status==='VERIFIED');
    unloadedCount+=Number(value.status==='UNLOADED')-Number(before.status==='UNLOADED');
    if(resources.get(url).required)requiredConsumed+=Number(consumed.has(value.status))-Number(consumed.has(before.status));
    states.set(url,value);
  }
  for (const edge of expected.jsEdges ?? []) {
    if (!resources.has(urlOf(edge.from)) || !resources.has(urlOf(edge.to))) throw new Error('resource_manifest_graph_hole');
  }
  const bootRequired = new Set((expected.bootResources ?? []).map(urlOf));
  if (!bootRequired.size || [...bootRequired].some(url => !resources.has(url))) throw new Error('resource_manifest_missing_WebCIL');
  async function hash(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function fail(code, url) {
    failures.push({code,url});
    if (url && states.has(url)) mark(url,{status:'FAILED',code});
    throw new Error(`${code}${url ? ':'+url : ''}`);
  }
  const ready = (async () => {
    if (typeof expectedText !== 'string' || JSON.stringify(JSON.parse(expectedText)) !== JSON.stringify(expected) ||
        await hash(new TextEncoder().encode(expectedText)) !== manifestDigest) fail('resource_manifest_digest');
    manifestVerified=true;
  })();
  // Keep an eager manifest failure visible while the caller prepares its normal loader.
  ready.catch(() => {});
  function entry(value) {
    const url = urlOf(value);
    const resource = resources.get(url);
    if (!resource) fail('resource_unknown_required_uri',url);
    return resource;
  }
  async function checkedResponse(response, resource) {
    await ready;
    const url = resource.resolvedUrl;
    if (!response?.ok || response.redirected || ['opaque','opaqueredirect'].includes(response.type) ||
        (response.url && response.url !== url)) fail('resource_response_rejected',url);
    const bytes = await response.clone().arrayBuffer();
    const sha256 = await hash(bytes);
    if (bytes.byteLength !== resource.bytes || sha256 !== resource.sha256) fail('resource_digest_mismatch',url);
    mark(url,{status:'VERIFIED',sha256,bytes:bytes.byteLength,mechanism:'same-normal-response'});
    return {response,bytes};
  }
  function noteStage(stage, detail = {}) {
    if (!STAGES.has(stage) || (stage === 'real-session-admitted' && mode === 'static-qualification'))
      fail('resource_stage_invalid_static_or_unknown');
    if(stage==='dotnet-created') {
      if(expected.bootModule)noteImport(expected.bootModule);
      for(const url of expected.bootModules??[]) noteImport(url);
    }
    if (!stages.some(row=>row.stage===stage&&row.url===detail.url)) stages.push({stage,...detail});
  }
  function loadBootResource(type, name, defaultUri, integrity, behavior) {
    const resource = entry(defaultUri);
    if (type === 'dotnetjs') {
      mark(resource.resolvedUrl,{status:'PROTECTED_IMPORT_REQUESTED',mechanism:'browser-import-map-integrity'});
      return resource.resolvedUrl;
    }
    return (async () => {
      const {response} = await checkedResponse(await fetchResource(resource.resolvedUrl),resource);
      bootSeen.add(resource.resolvedUrl);
      noteStage('binary-returned',{url:resource.resolvedUrl,type,name,behavior});
      return response;
    })();
  }
  async function assertBootCoverage() {
    await ready;
    if ([...bootRequired].some(url => !bootSeen.has(url))) fail('resource_missing_boot_coverage');
  }
  let nativeStarted = false;
  async function initializeNative(nativeBase = base) {
    await ready;
    if (nativeStarted) fail('resource_native_already_initialized_or_reused');
    nativeStarted = true;
    const glueResource = entry(new URL('lumio_engine_wasm.js',nativeBase));
    const glueUrl = new URL(glueResource.resolvedUrl); glueUrl.searchParams.set('lumioPageRun',pageRunId);
    const glueSri='sha256-'+btoa(String.fromCharCode(...glueResource.sha256.match(/../g).map(x=>parseInt(x,16))));
    if (integrityFor(glueUrl.href) !== glueSri) fail('resource_fresh_query_integrity_missing',glueResource.resolvedUrl);
    const bridgeResource = entry(new URL('engine-wasm.mjs',nativeBase));
    const sideResource = entry(new URL('engine-wasm-build-info.json',nativeBase));
    const binaryResource = entry(new URL('lumio_engine_wasm_bg.wasm',nativeBase));
    const side = await checkedResponse(await fetchResource(sideResource.resolvedUrl),sideResource);
    const sidecar = JSON.parse(await side.response.text());
    const binary = await checkedResponse(await fetchResource(binaryResource.resolvedUrl),binaryResource);
    if (sidecar.binarySha256 !== binaryResource.sha256) fail('resource_native_sidecar_binary',binaryResource.resolvedUrl);
    const glue = await importModule(glueUrl.href);
    const {createEngineBridge} = await importModule(bridgeResource.resolvedUrl);
    if (typeof glue.default !== 'function' || typeof createEngineBridge !== 'function') fail('resource_native_exports');
    const wasmExports = await glue.default({module_or_path:binary.bytes});
    mark(glueResource.resolvedUrl,{status:'IMPORTED',exactQueryUrl:glueUrl.href,sha256:glueResource.sha256,mechanism:'browser-query-import-map-integrity'});
    mark(bridgeResource.resolvedUrl,{status:'IMPORTED',sha256:bridgeResource.sha256,mechanism:'browser-import-map-integrity'});
    noteStage('Native-initialized',{pageRunId,queryUrl:glueUrl.href,sha256:binaryResource.sha256,bytes:binary.bytes.byteLength,buffer:'same-verified-ArrayBuffer'});
    return createEngineBridge(wasmExports);
  }
  async function verifyDataResponse(response, resourceKey) { return (await checkedResponse(response,entry(resourceKey))).response; }
  function noteImport(value, visited = new Set()) {
    const resource = entry(value);
    if (visited.has(resource.resolvedUrl)) return;
    visited.add(resource.resolvedUrl);
    if (resource.category !== 'js') fail('resource_not_JS',resource.resolvedUrl);
    mark(resource.resolvedUrl,{status:'IMPORTED',sha256:resource.sha256,mechanism:'browser-import-map-integrity'});
    // Only statically linked descendants are reached by a successful parent import.
    for (const edge of expected.jsEdges ?? []) if (!edge.dynamic && urlOf(edge.from) === resource.resolvedUrl) noteImport(edge.to,visited);
  }
  function status() {
    return {arm,pageRunId,sdkVersion:expected.version,sourceHead:expected.sourceHead,expected:resources.size,required:requiredCount,
      verified:verifiedCount,unloaded:unloadedCount,complete:manifestVerified&&failures.length===0&&requiredConsumed===requiredCount};
  }
  function snapshot() {
    const rows=[...resources.values()].map(resource=>({...resource,...states.get(resource.resolvedUrl)}));
    const required=rows.filter(row=>row.required);
    return {version:1,mode,arm,pageRunId,manifestDigest,sdkVersion:expected.version,
      resources:rows,stages:stages.slice(),failures:failures.slice(),coverage:{expected:rows.length,required:required.length,
        verified:verifiedCount,unloaded:unloadedCount,complete:status().complete},
      trustBase:'reviewed document/bootstrap/application and browser SRI/Response implementation'};
  }
  function validateExport(value) {
    if(value?.arm!==arm||value.pageRunId!==pageRunId||value.manifestDigest!==manifestDigest||value.mode!==mode||
      !Array.isArray(value.resources)||value.resources.length!==resources.size||value.coverage?.expected!==resources.size)
      throw new Error('resource_export_identity_or_truncation');
    const seen=new Set();
    for(const row of value.resources){
      const resource=resources.get(row.resolvedUrl);
      if(!resource||seen.has(row.resolvedUrl)||row.sha256!==resource.sha256||row.bytes!==resource.bytes||row.required!==resource.required)
        throw new Error('resource_export_membership_mismatch');
      seen.add(row.resolvedUrl);
    }
    return value;
  }
  function noteStyles(document = globalThis.document) {
    for(const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const resource=entry(link.href);
      const expectedSri='sha256-'+btoa(String.fromCharCode(...resource.sha256.match(/../g).map(x=>parseInt(x,16))));
      if(resource.category!=='style'||link.integrity!==expectedSri||!link.sheet)fail('resource_style_not_enforced',resource.resolvedUrl);
      mark(resource.resolvedUrl,{status:'APPLIED',sha256:resource.sha256,mechanism:'browser-stylesheet-SRI'});
    }
  }
  function bindExport(button, {document = globalThis.document, URL = globalThis.URL} = {}) {
    const click = () => {
      const url=URL.createObjectURL(new Blob([JSON.stringify(validateExport(snapshot()))],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`lumio-resource-witness-${arm}-${pageRunId}.json`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),0);
    };
    button.addEventListener('click',click); return ()=>button.removeEventListener('click',click);
  }
  return {ready,loadBootResource,initializeNative,verifyDataResponse,noteStage,noteImport,noteStyles,assertBootCoverage,status,snapshot,validateExport,bindExport};
}
