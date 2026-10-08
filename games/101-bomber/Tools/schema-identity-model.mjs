// Audit data only. This module neither allocates identities nor writes a baseline.
import {createHash} from 'node:crypto';
import {isRetirementSequence,canonicalHash,RetirementIndexBudget,readLedgerStorage} from './schema-identity-storage.mjs';
// Internal digest keys retain all 256 SHA bits in 32 Latin1 code units. The unchanged
// index budget still conservatively charges two bytes per code unit plus overhead.
// File/page/snapshot provenance stays the canonical external hexadecimal form.
const indexHash = value => Buffer.from(canonicalHash(value),'hex').toString('latin1');
export function identityKey(identity) { return JSON.stringify([identity.kind, identity.scope, identity.value]); }
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const string = x => typeof x === 'string' && x.length > 0;
const uint = x => Number.isSafeInteger(x) && x >= 0 && x <= 0xffffffff;
const bool = x => typeof x === 'boolean';
const keys = (x, required, optional = []) => object(x) && required.every(k=>Object.hasOwn(x,k)) && Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
const names = x => Array.isArray(x) && x.every(string) && new Set(x).size===x.length;
const field = f => keys(f,['name','clrType','nullable','valueShape']) && string(f.name)&&string(f.clrType)&&bool(f.nullable)&&(f.valueShape===null||string(f.valueShape));
const fields = x => Array.isArray(x)&&x.every(field)&&new Set(x.map(f=>f.name)).size===x.length;
const provenance = e => keys(e,['repo','revision','path']) && string(e.repo)&&/^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/.test(e.revision)&&string(e.path)&&!e.path.startsWith('/')&&!e.path.includes('..');
const serialization = x => keys(x,['server','client']) && ['server','client'].every(side=>x[side]===null||(keys(x[side],['capturePersist','captureSync','restorePersist'])&&Object.values(x[side]).every(bool)));
const origin = x => object(x) && (x.kind==='game' ? keys(x,['kind','assembly'])&&string(x.assembly) : x.kind==='external'&&keys(x,['kind','assembly','engineRevision','runtimeRevision','package'])&&string(x.assembly)&&/^[a-f0-9]{40}$/.test(x.engineRevision)&&/^[a-f0-9]{40}$/.test(x.runtimeRevision)&&string(x.package));
const admitted = s => ['bomber-v3','bomber-v4-container-candidate','bomber-v5-terrain-candidate','bomber-v5-growth-candidate','bomber-v6-terrain-growth-candidate','bomber-v7-finite-lifecycle-candidate','bomber-v8-contact-freeze-candidate','bomber-v9-strong-chest-candidate','bomber-v10-durable-results-candidate','bomber-v11-input-memory-candidate','bomber-v12-button-canonical-attributes-candidate','bomber-v13-durable-bomb-promises-candidate','bomber-v14-m2-bounded-producers-candidate','bomber-v15-traversal-favorite-regions-candidate','bomber-v16-owner-prediction-candidate'].includes(s);
const schema = s => admitted(s)||/^[a-f0-9]{40}$/.test(s);
const historySnapshot = s => keys(s,['path','sha256'])&&/^Gameplay\/Compatibility\/[A-Za-z0-9_.-]+\.json$/.test(s.path)&&/^[a-f0-9]{64}$/.test(s.sha256);
const legacyEffect = s => s.schema==='bomber-v3'&&keys(s,['schema','clrType','parameterType','id','instant'])&&s.instant===true&&
  s.clrType==='Lumio.Bomber.Gameplay.'+({121001:'BombDamageEffect',121006:'HealthPackEffect',121008:'PowerUpgradeEffect',121009:'CapacityUpgradeEffect',121010:'SpeedUpgradeEffect'})[s.id]&&s.parameterType===s.clrType+'.Parameters';
const regionFields = [[1,'Duration','System.UInt64',null],[2,'Fx','System.String',32],
  [3,'Participant','Lumio.GameRuntime.Ecs.NetEntityId',null],[4,'Life','Lumio.GameRuntime.Ecs.NetEntityId',null],
  [5,'Generation','System.UInt64',null],[6,'MatchId','System.UInt64',null],[7,'ChainId','System.UInt64',null],
  [8,'AuraWorld','System.UInt64',null],[9,'AuraInstance','System.UInt64',null],[10,'AuraGeneration','System.UInt32',null],
  [11,'Zone','Lumio.GameRuntime.Ecs.NetEntityId',null],[12,'Ordinal','System.Int32',null],
  [13,'X','System.Int32',null],[14,'Z','System.Int32',null],[15,'Mask','System.Int32',null],[16,'BirthTick','System.UInt64',null]];
const regionFinite = s => ['bomber-v15-traversal-favorite-regions-candidate','bomber-v16-owner-prediction-candidate'].includes(s.schema)&&s.id===10112&&
  s.clrType==='Lumio.Bomber.Gameplay.BomberFireZoneLifetimeEffect'&&s.lifetime==='finite'&&s.policy==='finite-ta'&&
  s.durationFieldId===1&&s.periodFieldId===null&&Array.isArray(s.contributions)&&s.contributions.length===0&&
  Array.isArray(s.fields)&&JSON.stringify(s.fields.map(f=>[f.id,f.name,f.clrType,f.maxUtf8Bytes]))===JSON.stringify(regionFields);
const finiteStatus = s => regionFinite(s)||[10107,10108,10109,10111].includes(s.id)&&
  s.clrType==='Lumio.Bomber.Gameplay.'+({10107:'BomberBubbleEffect',10108:'BomberFreezeEffect',10109:'BomberFreezeImmunityEffect',10111:'BomberFireAuraEffect'})[s.id]&&
  s.lifetime==='finite'&&s.policy==='finite-ta'&&s.durationFieldId===1&&s.periodFieldId===null&&
  Array.isArray(s.contributions)&&s.contributions.length===0&&Array.isArray(s.fields)&&
  s.fields.some(f=>f.id===s.durationFieldId&&f.clrType==='System.UInt64');
const shapes = {
  'entity-wire': s => entity(s),
  'entity-alias': s => entity(s),
  component: s => keys(s,['schema','clrType','origin'])&&string(s.clrType)&&origin(s.origin),
  'component-slot': s => keys(s,['schema','entity','component','ordinal','slotEvidence'])&&string(s.entity)&&string(s.component)&&uint(s.ordinal)&&['component-index','creation-array'].includes(s.slotEvidence),
  scalar: s => keys(s,['schema','member','key','clrType','wireType','persistence','scope','authority','ordinal','serialization'],['clientOrdinal'])&&commonField(s)&&uint(s.ordinal)&&(s.clientOrdinal===undefined||s.clientOrdinal===null||uint(s.clientOrdinal)),
  container: s => keys(s,['schema','member','key','clrType','wireType','persistence','scope','authority','containerKind','elementType','keyType','valueType','serialization'],['maxCapacity','ordinal'])&&(['bomber-v4-container-candidate','bomber-v5-terrain-candidate','bomber-v5-growth-candidate','bomber-v6-terrain-growth-candidate','bomber-v7-finite-lifecycle-candidate','bomber-v8-contact-freeze-candidate','bomber-v9-strong-chest-candidate','bomber-v10-durable-results-candidate','bomber-v11-input-memory-candidate','bomber-v12-button-canonical-attributes-candidate','bomber-v13-durable-bomb-promises-candidate','bomber-v14-m2-bounded-producers-candidate','bomber-v15-traversal-favorite-regions-candidate','bomber-v16-owner-prediction-candidate'].includes(s.schema)?uint(s.ordinal)&&Number.isSafeInteger(s.maxCapacity)&&s.maxCapacity>0&&s.maxCapacity<=2147483647:s.maxCapacity===undefined&&s.ordinal===undefined)&&commonField(s)&&['SyncList','SyncDict','SyncSet'].includes(s.containerKind)&&(s.containerKind==='SyncDict'?(s.elementType===null&&string(s.keyType)&&string(s.valueType)):(string(s.elementType)&&s.keyType===null&&s.valueType===null)),
  ability: s => keys(s,['schema','clrType','inputType','id','prediction'])&&string(s.clrType)&&string(s.inputType)&&uint(s.id)&&s.id>0&&['LogicPredict','AuthorityOnly'].includes(s.prediction),
  event: s => keys(s,['schema','canonicalName','clrType','fields','catalogKind','rule','dependencies'])&&string(s.canonicalName)&&(s.clrType===null||string(s.clrType))&&fields(s.fields)&&['Typed','Derived','Excluded'].includes(s.catalogKind)&&string(s.rule)&&names(s.dependencies)&&(s.catalogKind==='Excluded'?s.clrType===null&&s.fields.length===0:string(s.clrType)),
  'event-type': s => keys(s,['schema','clrType','typeKind','fields','values'])&&string(s.clrType)&&fields(s.fields)&&Array.isArray(s.values)&&s.values.every(v=>keys(v,['name','value'])&&string(v.name)&&Number.isSafeInteger(v.value))&&new Set(s.values.map(v=>v.name)).size===s.values.length&&(['record','enum'].includes(s.typeKind))&&(s.typeKind==='enum'?s.fields.length===0:s.values.length===0),
  'config-symbol': s => keys(s,['schema','symbol','evidenceKind'])&&string(s.symbol)&&s.evidenceKind==='specification-symbol',
  'effect-type': s => legacyEffect(s)||keys(s,['schema','clrType','parametersType','id','fxKeyFieldId','instantWrites','fact','fields'], finiteStatus(s)?['lifetime','policy','durationFieldId','periodFieldId','contributions']:[]) &&
    string(s.clrType)&&s.parametersType===`${s.clrType}.Parameters`&&uint(s.id)&&s.id>0&&uint(s.fxKeyFieldId)&&
    Array.isArray(s.instantWrites)&&(finiteStatus(s)?s.instantWrites.length===0:s.instantWrites.length>0)&&s.instantWrites.every(uint)&&new Set(s.instantWrites).size===s.instantWrites.length&&
    (((s.id===10105&&s.clrType==='Lumio.Bomber.Gameplay.BomberSuccessorRestoreEffect'||
       s.id===10106&&s.clrType==='Lumio.Bomber.Gameplay.BomberInventoryEffect'||finiteStatus(s))&&s.fact===null)||
      (keys(s.fact,['name','sourceFieldId','targetFieldId'])&&string(s.fact.name)&&uint(s.fact.sourceFieldId)&&uint(s.fact.targetFieldId)))&&
    Array.isArray(s.fields)&&s.fields.length>0&&s.fields.every(f=>keys(f,['id','name','clrType','maxUtf8Bytes'])&&uint(f.id)&&f.id>0&&string(f.name)&&
      (['System.Int32','System.Int64','System.UInt64','System.String','Lumio.GameRuntime.Ecs.NetEntityId'].includes(f.clrType)||
        (finiteStatus(s)&&[10108,10109].includes(s.id)&&f.id===11&&f.name==='DamageGeneration'&&f.clrType==='System.UInt32')||
        (regionFinite(s)&&f.id===10&&f.name==='AuraGeneration'&&f.clrType==='System.UInt32')||
        (finiteStatus(s)&&s.id===10111&&f.id===7&&f.name==='Favorite'&&f.clrType==='System.Boolean'))&&
      (f.clrType==='System.String'?uint(f.maxUtf8Bytes)&&f.maxUtf8Bytes>0:f.maxUtf8Bytes===null))&&
    new Set(s.fields.map(f=>f.id)).size===s.fields.length&&new Set(s.fields.map(f=>f.name)).size===s.fields.length&&
    s.fields.some(f=>f.id===s.fxKeyFieldId&&f.clrType==='System.String')&&
    (s.fact===null||(s.fields.some(f=>f.id===s.fact.sourceFieldId&&f.clrType==='Lumio.GameRuntime.Ecs.NetEntityId')&&
      s.fields.some(f=>f.id===s.fact.targetFieldId&&f.clrType==='System.Int32'))),
  tag: () => false,
};
function entity(s) {
  return keys(s,['schema','clrType','wire','aliases','mode','world','tickRateHz','attributes'],['blockEntity'])&&(s.blockEntity===undefined||bool(s.blockEntity))&&string(s.clrType)&&string(s.wire)&&names(s.aliases)&&['CS','Server','Local'].includes(s.mode)&&bool(s.world)&&(s.tickRateHz===null||uint(s.tickRateHz))&&Array.isArray(s.attributes)&&s.attributes.every(a=>keys(a,['name','isLethal','persist','bindings'])&&string(a.name)&&bool(a.isLethal)&&bool(a.persist)&&Array.isArray(a.bindings)&&a.bindings.length===2&&a.bindings.every(b=>keys(b,['key','wireType','persistence','visibility'])&&Object.values(b).every(string)));
}
function commonField(s) {
  if(!['member','key','clrType','wireType'].every(k=>string(s[k]))||!['persistent','ephemeral'].includes(s.persistence)||!['Room','Aoi','Owner','None'].includes(s.scope)||!['Server','Owner'].includes(s.authority)||!serialization(s.serialization)) return false;
  if(s.containerKind) {
    const type=s.containerKind==='SyncDict'?`${s.containerKind}<${s.keyType},${s.valueType}>`:`${s.containerKind}<${s.elementType}>`;
    return s.clrType===type&&s.wireType===({SyncList:'list',SyncDict:'dict',SyncSet:'set'})[s.containerKind];
  }
  return s.wireType===({'System.Int32':'i32','System.UInt32':'u32','System.Int64':'i64','System.UInt64':'u64','System.Boolean':'bool','System.String':'utf8-string','Lumio.GameRuntime.Ecs.NetEntityId':'net-entity-id'})[s.clrType];
}
export function expectedScope(i) {
  const root='101-bomber/';
  switch(i.kind) {
    case 'entity-wire':return root+'entity-wire';
    case 'entity-alias':return root+'entity-alias';
    case 'component':return root+'components';
    case 'component-slot':return `${root}slots/${i.shape.schema}/${i.owner}`;
    case 'scalar':case 'container':return `${root}fields/${i.owner}`;
    case 'ability':return root+'gas/ability';
    case 'effect-type':return root+'gas/effect';
    case 'event':return root+'events';
    case 'event-type':return root+'event-types';
    case 'config-symbol':return root+'config-symbols';
    default:return null;
  }
}
// Only the recorded namespace migration can preserve an owner across schemas.
// Arbitrary namespaces with the same short CLR name are not equivalent owners.
function migratedOwner(owner) {
  const renamed = {
    'Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes.BomberPlayerEntity':'Lumio.Bomber.Gameplay.EntityTypes.PlayerEntity',
    'Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes.BomberWorldEntity':'Lumio.Bomber.Gameplay.EntityTypes.WorldEntity',
  };
  return Object.hasOwn(renamed,owner)?renamed[owner]:owner.replace(/^Lumio\.Game\.ServerGameplay\.Bomber\.Contracts\./,'Lumio.Bomber.Gameplay.Contracts.');
}
function validateIdentity(i, diagnostics) {
  const fail=(code,identity,message)=>diagnostics.push({code,identity,message});
  const before=diagnostics.length;
  if(!keys(i,['kind','scope','value','owner','shape','evidence'])||!string(i.kind)||!Object.hasOwn(shapes,i.kind)||typeof shapes[i.kind]!=='function'||!string(i.scope)||!string(i.owner)||!object(i.shape)||!string(i.shape.schema)) {fail('invalid_identity','identity','Malformed identity');return false;}
  const key=identityKey(i);
  if(!shapes[i.kind](i.shape)) fail('invalid_shape',key,'Unsupported kind-specific shape');
  if(i.scope!==expectedScope(i)) fail('invalid_scope',key,'Scope must derive from the identity namespace and recorded schema');
  if(!Array.isArray(i.evidence)||!i.evidence.length||!i.evidence.every(provenance)) fail('invalid_evidence',key,'Exact revision or SHA-256 source evidence required');
  if(['component-slot','ability','effect-type'].includes(i.kind)?!uint(i.value):!string(i.value)) fail('invalid_value',key,'Incorrect identity value type');
  const s=i.shape;
  if(!schema(s.schema)) fail('invalid_schema',key,'Only the admitted schema or an exact historical revision is supported');
  if(!admitted(s.schema)&&(!Array.isArray(i.evidence)||!i.evidence.some(e=>e?.revision===s.schema))) fail('invalid_schema',key,'Historical schema revision requires original evidence');
  const expected=({'entity-wire':s.wire,'entity-alias':s.aliases?.[0],component:s.clrType,'component-slot':s.ordinal,scalar:s.key,container:s.key,ability:s.id,'effect-type':s.id,event:s.canonicalName,'event-type':s.clrType,'config-symbol':s.symbol})[i.kind];
  if(i.value!==expected) fail('invalid_value',key,'Value does not agree with shape');
  if(['component','ability','effect-type','event-type','entity-wire','entity-alias'].includes(i.kind)&&i.owner!==s.clrType) fail('invalid_owner',key,'CLR owner mismatch');
  if(i.kind==='component-slot'&&i.owner!==s.entity) fail('invalid_owner',key,'Slot entity owner mismatch');
  if(['scalar','container'].includes(i.kind)&&(typeof s.key!=='string'||!s.key.startsWith(i.owner.split('.').at(-1)+'.'))) fail('invalid_owner',key,'Field binding key differs from CLR owner');
  return diagnostics.length===before;
}
export function validateLedger(ledger) {
  const diagnostics=[];
  const fail=(code,identity,message)=>diagnostics.push({code,identity,message});
  if(!keys(ledger,['formatVersion','schema','status','engineRevision','runtimeRevision','active','retired','pending','transitions','freezeEligible'])) {fail('invalid_ledger','ledger','Unexpected or missing ledger properties');return diagnostics;}
  if(ledger.formatVersion!==1||ledger.status!=='audit-draft'||!string(ledger.schema)||ledger.freezeEligible!==false||![ledger.engineRevision,ledger.runtimeRevision].every(x=>/^[a-f0-9]{40}$/.test(x))) fail('invalid_ledger','ledger','Unsupported version, status, freeze claim or revision');
  if(!['active','pending','transitions'].every(k=>Array.isArray(ledger[k]))||!isRetirementSequence(ledger.retired)) {fail('invalid_ledger','ledger','Collections must be arrays or authenticated retirement pages');return diagnostics;}
  const validate=i=>validateIdentity(i,diagnostics);
  const active=new Map();
  for(const i of ledger.active) if(validate(i)) {
    const key=identityKey(i); if(active.has(key)) fail('duplicate_identity',key,'Active key repeated');active.set(key,i);
    if(i.shape.schema!==ledger.schema) fail('invalid_schema',key,'Active shape must belong to candidate schema');
  }
  for(const t of ledger.transitions) if(!keys(t,['from','to','breaking','reason','releaseDecision'])||!string(t.from)||!string(t.to)||t.breaking!==true||!string(t.reason)||(t.releaseDecision!==null&&!string(t.releaseDecision))) fail('invalid_transition','transition','Malformed breaking transition');
  const edges=new Map();
  for(const t of ledger.transitions) {
    if(!object(t)||!string(t.from)||!string(t.to)) continue;
    if(!schema(t.from)||!schema(t.to)||t.from===t.to) fail('invalid_transition','transition','Only admitted distinct schemas may transition');
    const outgoing=edges.get(t.from)??[];
    if(outgoing.includes(t.to)) fail('invalid_transition','transition','Duplicate transition');
    outgoing.push(t.to);edges.set(t.from,outgoing);
  }
  const reaches=(from,to,seen=new Set())=>{if(from===to)return true;if(seen.has(from))return false;seen.add(from);return (edges.get(from)??[]).some(n=>reaches(n,to,new Set(seen)));};
  for(const [from,tos] of edges) if(tos.some(to=>reaches(to,from))) fail('transition_cycle',from,'Schema transitions must be acyclic');
  const retired=new Map(),retirementBudget=new RetirementIndexBudget();
  for(const r of ledger.retired) {
    if(!keys(r,['identity','retiredIn','reason','replacement'],['sourceSnapshot'])||!string(r.retiredIn)||!string(r.reason)||(r.replacement!==null&&!string(r.replacement))||(r.sourceSnapshot!==undefined&&!historySnapshot(r.sourceSnapshot))) {fail('invalid_retirement','retired','Malformed retirement');continue;}
    if(!validate(r.identity)) continue;
    const key=identityKey(r.identity), summary=retirementSummary(r,retirementBudget), versioned=summary.version;
    const branches=retired.get(versioned)??[];
    const sameSource=previous=>equal(previous.sourceSnapshot??null,r.sourceSnapshot??null);
    if(branches.some(previous=>previous.retiredIn===r.retiredIn&&sameSource(previous))) fail('duplicate_retirement',key,'Historical retirement edge repeated');
    if(branches.some(previous=>sameSource(previous)&&previous.identityHash!==indexHash(r.identity))) fail('retirement_source_changed',key,'Forks from one source must preserve identical shape and evidence');
    branches.push(summary);retired.set(versioned,branches);
    if(!(edges.get(r.identity.shape.schema)??[]).includes(r.retiredIn)||!reaches(r.retiredIn,ledger.schema)) fail('invalid_retirement_schema',key,'Retirement requires its original transition and a recorded path to candidate');
    const reused=active.get(key);
    if(reused&&migratedOwner(r.identity.owner)!==reused.owner) fail('identity_owner_changed',key,'Historical reservation cannot transfer owner');
    if(r.replacement===null&&reused) fail('retired_identity_reused',key,'Permanent reservation cannot be active');
  }
  const validateReplacement=(current,seen=new Set())=>{
    if(current.replacement===null)return;
    const key=identityKey(current.identity),marker=retirementKey(current);
    if(seen.has(marker)){fail('replacement_cycle',key,'Replacement chain must be acyclic');return;}
    const visited=new Set(seen);visited.add(marker);
    const next=retired.get(indexHash([current.replacement,current.retiredIn]))??[];
    const targets=current.retiredIn===ledger.schema?[active.get(current.replacement)]:next.map(row=>row.identity);
    if(!targets.length||targets.some(target=>!target)){fail('missing_replacement',key,'Replacement must exist in the recorded destination schema');return;}
    for(const target of targets){
      if(target.kind!==current.identity.kind) fail('incompatible_replacement',key,'No cross-kind migration reviewed');
      if(migratedOwner(current.identity.owner)!==target.owner) fail('identity_owner_changed',key,'Replacement cannot transfer logical owner');
    }
    if(current.retiredIn!==ledger.schema)for(const branch of next)validateReplacement(branch,visited);
  };
  for(const branches of retired.values())for(const retirement of branches)validateReplacement(retirement);
  const pendingDomains=new Set();
  for(const p of ledger.pending) {
    if(!keys(p,['domain','reason','evidence'],['representation','gameVocabularyStatus'])||!string(p.domain)||!string(p.reason)||!Array.isArray(p.evidence)||!p.evidence.length||!p.evidence.every(provenance)) {fail('invalid_pending','pending','Pending evidence is required');continue;}
    if(pendingDomains.has(p.domain)) fail('invalid_pending',p.domain,'Duplicate pending domain');pendingDomains.add(p.domain);
    if(p.domain==='tag'&&(p.representation!=='projection-field-string'||p.gameVocabularyStatus!=='unbound')) fail('invalid_pending','tag','Tag representation must remain unbound projection-field-string');
  }
  for(const domain of ['tag','P','T','F','B135','successor-binding','release-decision']) if(!pendingDomains.has(domain)) fail('missing_pending',domain,'Unclosed freeze domain must remain explicit');
  if(pendingDomains.has('effect-type')&&active.size>0&&[...active.values()].some(i=>i.kind==='effect-type')) fail('invalid_pending','effect-type','Allocated Effect domain must not claim no allocation');
  const effectIds=new Set();
  for(const i of active.values()) if(i.kind==='effect-type') {
    if(effectIds.has(i.value)) fail('duplicate_effect_id',identityKey(i),'Effect TypeId repeated');
    effectIds.add(i.value);
  }
  // Validate nested references and ordinal uniqueness without treating containers as scalars.
  const ordinals=new Set();
  for(const i of active.values()) {
    if(i.kind==='scalar'||i.kind==='container'&&['bomber-v4-container-candidate','bomber-v5-terrain-candidate','bomber-v5-growth-candidate','bomber-v6-terrain-growth-candidate','bomber-v7-finite-lifecycle-candidate','bomber-v8-contact-freeze-candidate','bomber-v9-strong-chest-candidate','bomber-v10-durable-results-candidate','bomber-v11-input-memory-candidate','bomber-v12-button-canonical-attributes-candidate','bomber-v13-durable-bomb-promises-candidate','bomber-v14-m2-bounded-producers-candidate','bomber-v15-traversal-favorite-regions-candidate','bomber-v16-owner-prediction-candidate'].includes(i.shape.schema)) {const k=JSON.stringify([i.owner,i.shape.ordinal]);if(ordinals.has(k))fail('duplicate_ordinal',identityKey(i),'Scalar ordinal repeated');ordinals.add(k);}
    for(const f of i.shape.fields??[]) if(f.valueShape&&!active.has(JSON.stringify(['event-type','101-bomber/event-types',f.valueShape]))) fail('missing_value_shape',identityKey(i),`Missing nested shape ${f.valueShape}`);
  }
  return diagnostics;
}

const canonical = value => JSON.stringify(value, (_, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const equal = (a,b) => canonical(a)===canonical(b);
const ordered = diagnostics => diagnostics.sort((a,b)=>a.identity<b.identity?-1:a.identity>b.identity?1:a.code<b.code?-1:a.code>b.code?1:a.message<b.message?-1:a.message>b.message?1:0);
const versionKey = i => indexHash([identityKey(i),i.shape.schema]);
const retirementKey = r => indexHash([versionKey(r.identity),r.retiredIn,r.sourceSnapshot??null]);
function retirementSummary(r,budget) {
  const i=r.identity;
  // Validation follows replacement edges, but never compares complete row hashes.
  // Do not retain a second comparison-only digest pair for every historical edge.
  const [kind,scope,value,owner,schema,retiredIn,replacement,sourcePath,sourceSha,identityHash,version]=budget.reserve([
    i.kind,i.scope,i.value,i.owner,i.shape.schema,r.retiredIn,r.replacement,r.sourceSnapshot?.path,r.sourceSnapshot?.sha256,
    indexHash(i),versionKey(i)]);
  return {identity:{kind,scope,value,owner,shape:{schema,ordinal:i.shape.ordinal}},retiredIn,replacement,
    ...(r.sourceSnapshot?{sourceSnapshot:{path:sourcePath,sha256:sourceSha}}:{}),identityHash,version};
}
function* allIdentities(ledger) {
  yield* ledger.active;
  for(const r of ledger.retired)yield r.identity;
}
const semantic = i => ({kind:i.kind,scope:i.scope,value:i.value,owner:i.owner,shape:i.shape});
function sameSchemaShape(old, current) {
  if (equal(semantic(old),semantic(current))) return true;
  if (old.kind!=='component'||current.kind!=='component'||old.shape.origin?.kind!=='external'||current.shape.origin?.kind!=='external') return false;
  const stripProvenance = i => {
    const copy=structuredClone(semantic(i));
    for(const key of ['engineRevision','runtimeRevision','package']) delete copy.shape.origin[key];
    return copy;
  };
  return equal(stripProvenance(old),stripProvenance(current));
}

// Slots keep their original schema scopes. Other continuity keys deliberately
// preserve their public value; only the reviewed CLR namespace migration maps owners.
function continuityKey(i) {
  if(i.kind==='component-slot') return JSON.stringify([i.kind,migratedOwner(i.owner),i.value]);
  if(['scalar','container'].includes(i.kind)) return JSON.stringify(['field',migratedOwner(i.owner),i.value]);
  if(['component','event-type'].includes(i.kind)) return JSON.stringify([i.kind,migratedOwner(i.owner)]);
  return identityKey(i);
}

function transitionPath(transitions,from,to,seen=new Set()) {
  if(from===to)return true;if(seen.has(from))return false;seen.add(from);
  return transitions.some(t=>t.from===from&&t.breaking===true&&transitionPath(transitions,t.to,to,new Set(seen)));
}
export function compareHistory(prior, next) {
  const diagnostics=[];
  const fail=(code,i,message)=>diagnostics.push({code,identity:identityKey(i),message});
  const active=new Map(next.active.map(i=>[identityKey(i),i]));
  const continuity=new Map(next.active.map(i=>[continuityKey(i),i]));
  // Exact complete-row checks and prior-active shape checks need different indices.
  // Release the first index before streaming all authenticated pages again. Keep
  // the fixed 8 MiB limit and the original 512-byte per-row precharge in both passes.
  compareRetirementRows(prior,next,continuity,fail);
  const byVersion=new Map(),retirementBudget=new RetirementIndexBudget();
  const wanted=new Set(prior.active.map(versionKey));
  for(const r of next.retired) {
    const version=versionKey(r.identity);
    if(!wanted.has(version))continue;
    const [keptVersion,identityHash]=retirementBudget.reserve([version,indexHash(r.identity)]);
    const branches=byVersion.get(keptVersion)??[];
    branches.push(identityHash);byVersion.set(keptVersion,branches);
  }
  for(const old of prior.active) {
    const current=active.get(identityKey(old));
    if(current&&prior.schema===next.schema&&sameSchemaShape(old,current)) continue;
    if(current&&equal(semantic(old),semantic(current))) continue;
    const tombstones=byVersion.get(versionKey(old))??[];
    if(!tombstones.includes(indexHash(old))) fail('missing_prior_shape_retirement',old,`Removed or changed identity requires its exact prior shape and evidence from ${old.shape.schema}`);
    const reused=continuity.get(continuityKey(old));
    if(prior.schema===next.schema && reused) fail('identity_shape_changed',old,'An active identity cannot change owner, type, ordinal or layout within the same schema');
    if(reused && migratedOwner(old.owner)!==reused.owner) fail('identity_owner_changed',old,'Continuity identity cannot transfer to another logical owner');
    if(prior.schema!==next.schema && !transitionPath(next.transitions,old.shape.schema,next.schema)) fail('missing_transition',old,'Historical shape requires an explicit breaking transition');
  }
  for(const old of allIdentities(prior)) if(old.kind==='scalar'&&old.shape.schema===next.schema) {
    for(const current of next.active) if(current.kind==='scalar'&&current.owner===old.owner&&current.shape.ordinal===old.shape.ordinal&&identityKey(current)!==identityKey(old)) fail('ordinal_reassigned',old,'Scalar ordinal cannot be assigned to another identity in the same schema');
  }
  return ordered(diagnostics);
}

export function compareObserved(expected, observed) {
  const diagnostics=[];
  const fail=(code,identity,message)=>diagnostics.push({code,identity,message});
  if(!object(observed)||!string(observed.schema)||!Array.isArray(observed.identities)) return [{code:'invalid_observation',identity:'observation',message:'Expected a parsed declaration/generated observation'}];
  if(expected.schema!==observed.schema) fail('observed_schema_mismatch','schema','Ledger and observed schema differ');
  const actual=new Map();
  const origins=[];
  for(const i of observed.identities) {
    if(!object(i)||!string(i.kind)||!string(i.scope)||!object(i.shape)) {fail('invalid_observation','observation','Malformed observed identity');continue;}
    const key=identityKey(i);
    if(actual.has(key)) fail('duplicate_observed_identity',key,'Observed identity occurs more than once');
    actual.set(key,i);
    if(i.kind==='component'&&i.shape.origin?.kind==='external') origins.push(i.shape.origin);
  }
  if(!origins.length||origins.some(o=>!/^[a-f0-9]{40}$/.test(o.engineRevision)||!/^[a-f0-9]{40}$/.test(o.runtimeRevision))) {
    fail('missing_observed_provenance','observation','Observed external component origins require Engine and Runtime revisions');
  } else {
    for(const field of ['engineRevision','runtimeRevision']) {
      const revisions=new Set(origins.map(o=>o[field]));
      if(revisions.size!==1||!revisions.has(expected[field])) fail('observed_provenance_mismatch',field,`Ledger ${field} differs from independently observed external component origins`);
    }
  }
  for(const i of expected.active) {
    const key=identityKey(i), found=actual.get(key);
    if(!found) fail('ledger_only_identity',key,'Active ledger identity is absent from declarations/generated output');
    else {
      if(!equal(semantic(i),semantic(found))) fail('observed_shape_mismatch',key,'Ledger differs from reconciled declarations/generated shape');
      if(!equal(i.evidence,found.evidence)) fail('observed_evidence_mismatch',key,'Ledger input evidence differs from observed bytes');
      actual.delete(key);
    }
  }
  for(const [key] of actual) fail('unrecorded_identity',key,'Declared/generated identity is absent from the active ledger');
  return ordered(diagnostics);
}

// A qualifier permits distinct historical branches only when their complete
// original ledger bytes authenticate the exact identity being retained.
export function validateHistorySnapshots(ledger,snapshots,required=[]) {
  const diagnostics=[];
  const fail=(code,identity,message)=>diagnostics.push({code,identity,message});
  const sources=new Map(),budget=new RetirementIndexBudget();
  for(const source of required) {
    if(!historySnapshot(source)){fail('invalid_history_snapshot','history','Malformed required historical reference');continue;}
    budget.reserve([source.path,source.sha256],256);
    sources.set(source.path,{hashes:new Set([source.sha256]),identities:[]});
  }
  for(const retirement of ledger.retired??[]) {
    const source=retirement.sourceSnapshot;
    if(source===undefined)continue;
    const key=identityKey(retirement.identity);
    if(!historySnapshot(source)){fail('invalid_retirement',key,'Malformed historical snapshot reference');continue;}
    const [path,sha256,digest,identity]=budget.reserve([source.path,source.sha256,indexHash(retirement.identity),key],256);
    const expected=sources.get(path)??{hashes:new Set(),identities:[]};
    expected.hashes.add(sha256);expected.identities.push({digest,identity});sources.set(path,expected);
  }
  // Compare every independently supplied snapshot as a whole. Candidate rows
  // may not hide an obligation by dropping their sourceSnapshot reference.
  const seen=new Set();
  for(const [path,bytes] of snapshots) {
    seen.add(path);
    const expected=sources.get(path);
    if(bytes.length>8*1024*1024||expected&&[...expected.hashes].some(sha=>createHash('sha256').update(bytes).digest('hex')!==sha)) {
      fail('history_snapshot_hash_mismatch','history',path);continue;
    }
    let prior;
    try{prior=readLedgerStorage(bytes,page=>snapshots.get(page));}catch{fail('invalid_history_snapshot','history',path);continue;}
    if(!Array.isArray(prior.active)||!isRetirementSequence(prior.retired)){fail('invalid_history_snapshot','history',path);continue;}
    const missing=new Map((expected?.identities??[]).map(row=>[row.digest,row.identity]));
    for(const identity of allIdentities(prior))missing.delete(indexHash(identity));
    for(const identity of missing.values())fail('history_snapshot_identity_mismatch',identity,'Exact shape and evidence absent from original ledger');
    diagnostics.push(...compareHistory(prior,ledger));
  }
  for(const path of sources.keys())if(!seen.has(path))fail('missing_history_snapshot','history',path);
  return ordered(diagnostics);
}

function compareRetirementRows(prior,next,continuity,fail) {
  const retired=new Map(),budget=new RetirementIndexBudget();
  for(const r of next.retired) {
    const [key,rowHash]=budget.reserve([retirementKey(r),indexHash(r)]);
    retired.set(key,rowHash);
  }
  for(const r of prior.retired) {
    const kept=retired.get(retirementKey(r));
    if(!kept) fail('missing_retirement',r.identity,`Prior tombstone from ${r.identity.shape.schema} must remain unchanged`);
    else if(indexHash(r)!==kept) fail('retirement_changed',r.identity,`Prior tombstone from ${r.identity.shape.schema}: shape, evidence, reason and replacement are immutable`);
    const reused=continuity.get(continuityKey(r.identity));
    if(reused && (migratedOwner(r.identity.owner)!==reused.owner || (r.replacement===null && (r.identity.kind!=='component-slot'||r.identity.shape.schema===next.schema)))) fail('reserved_identity_reused',r.identity,'Historical continuity reservation cannot be reassigned');
  }
}

export function audit({baseline,candidate,observed}) {
  const diagnostics=[];
  const bootstrap=baseline?.mode==='bootstrap-audit';
  const priorLedgers=bootstrap&&Array.isArray(baseline.snapshots)?baseline.snapshots:[baseline];
  const candidateDiagnostics=validateLedger(candidate);
  diagnostics.push(...candidateDiagnostics.map(d=>({...d,message:`candidate: ${d.message}`})));
  for(const prior of priorLedgers) {
    const invalid=[];
    if(bootstrap) {
      if(!keys(prior,['schema','active','retired'])||!/^[a-f0-9]{40}$/.test(prior.schema)||!Array.isArray(prior.active)||!prior.active.length||!Array.isArray(prior.retired)||prior.retired.length) invalid.push({code:'invalid_baseline',identity:'baseline',message:'Expected nonempty exact-revision historical observation'});
      else {
        const seen=new Set();
        for(const i of prior.active) if(validateIdentity(i,invalid)) {
          const key=identityKey(i);
          if(i.shape.schema!==prior.schema||seen.has(key)) invalid.push({code:'invalid_baseline',identity:key,message:'Historical identity must be unique and belong to its original revision'});
          seen.add(key);
        }
      }
    } else invalid.push(...validateLedger(prior));
    diagnostics.push(...invalid.map(d=>({...d,message:`baseline: ${d.message}`})));
    // Missing chain targets do not make the identity records unsafe to compare.
    // Report independent history loss as well as the broken replacement chain.
    if(!invalid.length&&candidateDiagnostics.every(d=>d.code==='missing_replacement')) diagnostics.push(...compareHistory(prior,candidate));
  }
  if(!priorLedgers.length) diagnostics.push({code:'missing_baseline',identity:'baseline',message:'At least one independent historical ledger is required'});
  if(!candidateDiagnostics.length) diagnostics.push(...compareObserved(candidate,observed));
  return {supportedInventoryConsistent:diagnostics.length===0,freezeEligible:false,pendingDomains:Array.isArray(candidate?.pending)?candidate.pending.map(p=>p?.domain).filter(string).sort():[],diagnostics:ordered(diagnostics)};
}

