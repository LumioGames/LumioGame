import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseComponent,tokenize,unsupported} from './schema-identity-read.mjs';
import {readLedgerStorage} from './schema-identity-storage.mjs';

export const LEDGER_PATH='games/101-bomber/Gameplay/Compatibility/schema-identities.json';
export const BOOTSTRAP_REF='fab6f08ebe717614c04383a71d1e25ea6c071711';
// These are the evidenced declaration/layout revisions, not inferred version labels.
const revisions=[
  ['5348635658fdb438f0ee939e8afe527acbc11f80',25],
  ['10782b63824125fc77fe25facb0455444fdac53d',22],
  ['b643e72b420227f0f8ba6a8d738fbde0dfc8a93b',22],
  ['4cd66dfaddc75addcca3f8bf82d4658daead1da1',26],
  [BOOTSTRAP_REF,31],
];
const modulePath='modules/server-gameplay/src/Lumio.Game.ServerGameplay/';
const contracts=modulePath+'Bomber/Contracts/';
const primitives={int:'System.Int32',ulong:'System.UInt64'};
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inputError(code,message) {return Object.assign(new Error(message),{code,exitCode:2});}
export function git(root,args) {
  try {return execFileSync('git',['--no-replace-objects',...args],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});}
  catch {throw inputError('historical_input_unavailable',`Git input unavailable: ${args.join(' ')}`);}
}
export function requireRevision(root,revision) {
  if(!/^[a-f0-9]{40}$/.test(revision??'')) throw inputError('invalid_revision','An exact lowercase full commit SHA is required');
  if(git(root,['cat-file','-t',revision]).toString().trim()!=='commit') throw inputError('invalid_revision',`${revision} is not a commit`);
}
export function tree(root,revision,paths) {
  return git(root,['ls-tree','-r','-z',revision,'--',...paths]).toString('utf8').split('\0').filter(Boolean).map(row=>{
    const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
    if(!match) throw inputError('unsupported_historical_entry',`Unsupported tree entry at ${revision}: ${row}`);
    return {revision,path:match[3],blob:match[2]};
  });
}
export function readBlob(root,entry) {
  const bytes=git(root,['show',`${entry.revision}:${entry.path}`]);
  const objectHash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(objectHash!==entry.blob) throw inputError('historical_blob_mismatch',`${entry.revision}:${entry.path}`);
  return bytes;
}
export function readBaseline(root,revision) {
  requireRevision(root,revision);
  const entries=tree(root,revision,[LEDGER_PATH]);
  if(entries.length!==1) throw inputError('missing_baseline_ledger','Revision has no ledger; first introduction requires the explicit --bootstrap-ref');
  const head=git(root,['rev-parse','HEAD']).toString().trim();
  if(head===revision) throw inputError('baseline_is_head','Baseline must be the reviewed pre-change revision, strictly before HEAD');
  git(root,['merge-base','--is-ancestor',revision,head]);
  const bytes=readBlob(root,entries[0]);
  const files=new Map([[entries[0].path,{...entries[0],sha256:hash(bytes)}]]);
  let ledger;
  try {
    ledger=readLedgerStorage(bytes,page=>{
      // Resolve every page from this exact commit and authenticate its blob; never use the
      // working directory or the newest revision of a page with the same name.
      const path='games/101-bomber/'+page,selected=tree(root,revision,[path]);
      if(selected.length!==1)throw inputError('missing_retirement_page',`${revision}:${path}`);
      const content=readBlob(root,selected[0]);
      files.set(path,{...selected[0],sha256:hash(content)});
      return content;
    });
  } catch(error) {
    if(error.code==='invalid_candidate_json')throw inputError('invalid_baseline_json','Historical ledger is not JSON');
    throw error;
  }
  return {ledger,identity:{mode:'ledger-audit',revision,...entries[0],sha256:hash(bytes)},files:[...files.values()]};
}

const normalized=text=>tokenize(text,'<historical pattern>',false).join(' ');
function check(condition,path,detail) {if(!condition) unsupported(path,detail);}
function same(actual,expected,path,detail) {
  if(JSON.stringify(actual)===JSON.stringify(expected)) return;
  const a=JSON.stringify(actual)??'undefined',b=JSON.stringify(expected);
  const at=[...a].findIndex((c,i)=>c!==b[i]);
  unsupported(path,`${detail} at ${at}: ${a.slice(Math.max(0,at),at+120)} / ${b.slice(Math.max(0,at),at+120)}`);
}
function bodyAt(tokens,start,path) {
  const open=tokens[start],close={'{':'}','(':')'}[open];
  check(close,path,'expected method delimiter');
  let depth=1;
  for(let i=start+1;i<tokens.length;i++) {
    if(tokens[i]===open) depth++;
    if(tokens[i]===close&&--depth===0) return {body:tokens.slice(start+1,i),end:i+1};
  }
  unsupported(path,'unclosed method');
}
function methods(tokens,name,path) {
  const result=[];
  for(let i=0;i<tokens.length;i++) if(tokens[i]===name&&tokens[i+1]==='(') {
    const args=bodyAt(tokens,i+1,path);
    if(tokens[args.end]==='{') result.push(bodyAt(tokens,args.end,path).body.join(' '));
  }
  return result;
}
function method(tokens,name,path) {
  const result=methods(tokens,name,path);check(result.length===1,path,`${name} coverage`);return result[0];
}
function header(tokens,path) {
  let text=tokens.join(' ');
  text=text.replace(/^(?:using [\w .]+ ; )*/,'');
  const match=/^namespace ([\w .]+) ; (.*)$/.exec(text);
  check(match,path,'historical file-scoped namespace');
  return {namespace:match[1].replaceAll(' ',''),body:match[2]};
}
const lower=name=>name[0].toLowerCase()+name.slice(1);

function extractSnapshot(revision,files) {
  const parsed=new Map([...files].filter(([p])=>p.endsWith('.cs')).map(([p,b])=>[p,tokenize(b.toString('utf8'),p)]));
  const active=[];
  const add=(kind,scope,value,owner,shape,paths)=>active.push({kind,scope:'101-bomber/'+scope,value,owner,shape:{schema:revision,...shape},evidence:[...new Set(paths.filter(Boolean))].map(path=>({repo:'LumioGame',revision,path}))});
  const generated=revision===BOOTSTRAP_REF?modulePath+'generated/server/':contracts+'generated/server/';
  const registryPath=generated+'Lumio.Game.ServerGameplay.Registry.g.cs',registry=parsed.get(registryPath);
  check(registry,registryPath,'missing historical registry');
  const registryText=registry.join(' ');
  const rows=[...registryText.matchAll(/new FieldAttributeDeclaration \( ("[^"]+") , ("[^"]+") , ("[^"]+") , ("[^"]+") , ("[^"]+") \)/g)].map(m=>m.slice(1).map(JSON.parse));
  const jsonPath=generated+'attribute-declarations.json';
  check(files.has(jsonPath),jsonPath,'missing historical metadata');
  same(rows,JSON.parse(files.get(jsonPath)).map(r=>[r.attributeId,r.valueType,r.persistence,r.replication,r.visibility]),jsonPath,'metadata/registry disagreement');
  const fieldKeys=[];
  for(const [path,tokens] of parsed) if(path.startsWith(contracts+'Components/')) {
    const h=header(tokens,path);
    const match=/^\[ EcsComponent \] public sealed partial class (\w+) : Component \{ (.*) \}$/.exec(h.body);
    check(match,path,'complete historical component');
    const name=match[1],owner=h.namespace+'.'+name;
    const fields=parseComponent({name,path,suffix:[':','Component'],body:tokenize(match[2],path)},type=>{check(primitives[type],path,'historical CLR type');return primitives[type];});
    const gp=generated+name+'.g.cs',gt=parsed.get(gp);check(gt,gp,'missing historical component generation');
    same(method(gt,'BindFields',gp),normalized(fields.map(({shape:s})=>`${s.member}=${s.member}.Bound(host,this,${s.ordinal},${JSON.stringify(s.key)});`).join(' ')),gp,'complete historical binding order');
    const serializers=Object.fromEntries(['CapturePersist','CaptureSync','RestorePersist'].map(n=>[n,method(gt,n,gp)]));
    add('component','components',owner,owner,{clrType:owner,origin:{kind:'game',assembly:'Lumio.Game.ServerGameplay'}},[path,gp]);
    for(const f of fields) {
      check(f.kind==='scalar',path,'unexpected historical container');
      const s=f.shape,q=JSON.stringify(s.key);fieldKeys.push(s.key);
      same(rows.filter(r=>r[0]===s.key),[[s.key,s.wireType,s.persistence,'replicated','room-public']],registryPath,'historical field metadata');
      s.serialization={server:{capturePersist:serializers.CapturePersist.includes(q),captureSync:serializers.CaptureSync.includes(q),restorePersist:serializers.RestorePersist.includes(q)},client:null};
      add('scalar',`fields/${owner}`,s.key,owner,s,[path,gp,registryPath]);
    }
  }
  same(rows.filter(r=>r[0].startsWith('Bomber')).map(r=>r[0]).sort(),fieldKeys.sort(),registryPath,'complete historical field coverage');
  const entityDeclarations=[];
  for(const [path,tokens] of parsed) if(path.startsWith(contracts+'EntityTypes/')) {
    const h=header(tokens,path);
    const match=/^\[ EntityType \( Mode \. CS( , World = true)? \) \] ((?:\[ Has \( typeof \( \w+ \) \) \] )+)public abstract class (\w+) \{ \}$/.exec(h.body);
    check(match,path,'complete historical entity');
    const name=match[3],owner=h.namespace+'.'+name;
    entityDeclarations.push({path,name,owner,world:!!match[1],components:[...match[2].matchAll(/typeof \( (\w+) \)/g)].map(m=>m[1])});
  }
  // Shared PlayerEntity is registry context only, never a Bomber allocation.
  const entities=[...entityDeclarations];
  if(revision===BOOTSTRAP_REF) entities.push({name:'PlayerEntity',components:['ObserverComponent','IdentityComponent','ChatComponent']});
  const throwUnknown='throw new InvalidOperationException("Unknown entity type " + entityType.Name);';
  const aliases=method(registry,'TryResolveEntityType',registryPath);
  const hasTemplates=revision===revisions[3][0]||revision===BOOTSTRAP_REF;
  const hasAliases=revision!==revisions[3][0];
  const aliasOrder=revision===BOOTSTRAP_REF?'wire-first':'alias-first';
  same(aliases,normalized('entityType=null!; '+entities.map(e=>{
    const wire=lower(e.name.replace(/Entity$/,'')),names=!hasAliases?[wire]:aliasOrder==='wire-first'?[wire,e.name]:[e.name,wire];
    return `if(${names.map(n=>`string.Equals(name,"${n}",StringComparison.Ordinal)`).join('||')}){entityType=typeof(${e.name});return true;}`;
  }).join(' ')+' return false;'),registryPath,'complete historical alias dispatch');
  const wireBody=hasTemplates?'if(entityType is null) throw new ArgumentNullException(nameof(entityType)); '+entities.map(e=>`if(entityType==typeof(${e.name})) return "${lower(e.name.replace(/Entity$/,''))}";`).join(' ')+throwUnknown:'if(entityType.Name.EndsWith("Entity",StringComparison.Ordinal)&&entityType.Name.Length>6){string stem=entityType.Name.Substring(0,entityType.Name.Length-6);return char.ToLowerInvariant(stem[0])+stem.Substring(1);} return entityType.Name;';
  same(method(registry,'WireName',registryPath),normalized(wireBody),registryPath,'complete historical wire dispatch');
  if(hasTemplates) {
    same(method(registry,'CreateComponents',registryPath),normalized(entities.map(e=>`if(entityType==typeof(${e.name})){return ${e.name}Template.CreateComponents();}`).join(' ')+throwUnknown),registryPath,'complete historical creation dispatch');
    const indexes=methods(registry,'ComponentIndex',registryPath);
    same(indexes,[false,true].map(byName=>normalized(entities.map(e=>`if(entityType==typeof(${e.name})){${e.components.map((c,i)=>byName?`if(string.Equals(componentName,"${c}",StringComparison.Ordinal)) return ${i};`:`if(componentType==typeof(${c})) return ${i};`).join(' ')}return -1;}`).join(' ')+' return -1;')),registryPath,'both historical slot overloads');
  } else same(method(registry,'AddComponents',registryPath),normalized(entities.map(e=>`if(entityType==typeof(${e.name})){${e.components.map(c=>`list.Add(new ${c}());`).join(' ')}return;}`).join(' ')+throwUnknown),registryPath,'complete historical creation array');
  for(const e of entityDeclarations) {
    let templatePath=null;
    if(hasTemplates) {
      templatePath=generated+e.name+'.Template.g.cs';const tt=parsed.get(templatePath);check(tt,templatePath,'missing historical template');
      const text=tt.join(' '),array=/new Component \[ \] \{ (.*?) \} ;/.exec(text);
      check(array,templatePath,'historical template array');
      same(array[1],normalized(e.components.map(c=>`new ${c}()`).join(',')+ (array[1].endsWith(',')?',':'')),templatePath,'historical template slots');
      check(text.includes(normalized(`ComponentCount=${e.components.length};`)),templatePath,'historical template count');
    }
    const paths=[e.path,registryPath,templatePath],wire=lower(e.name.replace(/Entity$/,''));
    const shape={clrType:e.owner,wire,aliases:hasAliases?[e.name]:[],mode:'CS',world:e.world,tickRateHz:null,attributes:[]};
    add('entity-wire','entity-wire',wire,e.owner,shape,paths);
    if(hasAliases) add('entity-alias','entity-alias',e.name,e.owner,shape,paths);
    for(const [ordinal,c] of e.components.entries()) {
      const component=c.startsWith('Bomber')?'Lumio.Game.ServerGameplay.Bomber.Contracts.Components.'+c:'Lumio.GameRuntime.Ecs.'+c;
      add('component-slot',`slots/${revision}/${e.owner}`,ordinal,e.owner,{entity:e.owner,component,ordinal,slotEvidence:hasTemplates?'component-index':'creation-array'},paths);
    }
  }
  const eventPath=contracts+'Events/BomberEvents.cs',et=parsed.get(eventPath);check(et,eventPath,'missing historical events');
  const eh=header(et,eventPath),records=[];
  const remaining=eh.body.replace(/public readonly record struct (\w+) \( ([\w ?,]+) \) ;/g,(_,name,parameters)=>{records.push({name,parameters});return '';}).trim();
  check(!remaining&&records.length,eventPath,'complete historical record coverage');
  for(const r of records) {
    const owner=eh.namespace+'.'+r.name;
    const fields=r.parameters.split(' , ').map(parameter=>{
      const m=/^(\w+)( \?)? (\w+)$/.exec(parameter);check(m,eventPath,'historical event parameter');
      const nested=records.some(x=>x.name===m[1]);check(primitives[m[1]]||nested,eventPath,'unresolved historical event type');
      const clrType=primitives[m[1]]??eh.namespace+'.'+m[1];return {name:m[3],clrType,nullable:!!m[2],valueShape:nested?clrType:null};
    });
    add('event-type','event-types',owner,owner,{clrType:owner,typeKind:'record',fields,values:[]},[eventPath]);
  }
  for(const [path,tokens] of parsed) if(!path.includes('/generated/')) check(!tokens.some(t=>['AbilityType','EffectType','TagType','TagId','TagComponent'].includes(t)),path,'unreviewed historical allocation');
  if(revision===BOOTSTRAP_REF) for(const kind of ['Ability','Effect']) {
    const path=generated+`Generated${kind}Registry.g.cs`;
    same(parsed.get(path)?.join(' '),normalized(`using System; namespace Lumio.Game.ServerGameplay; public static class Generated${kind}Registry {public static uint TypeIdOf(Type ${kind.toLowerCase()}Type){return ${kind.toLowerCase()}Type.Name switch {_=>0u};}${kind==='Ability'?'public static void RegisterAll(){}':''}}`),path,'complete historical empty registry');
  }
  return {schema:revision,active,retired:[]};
}

export function readBootstrap(root,revision) {
  requireRevision(root,revision);
  if(revision!==BOOTSTRAP_REF) throw inputError('unsupported_bootstrap_revision','Only the reviewed fab6 bootstrap and its fixed earlier history are supported');
  if(tree(root,revision,[LEDGER_PATH]).length) throw inputError('bootstrap_has_ledger','Use --baseline-ref for a revision that contains a ledger');
  const snapshots=[],inputs=[];
  for(const [sha,count] of revisions) {
    requireRevision(root,sha);
    const entries=tree(root,sha,[contracts,modulePath+'generated/server/']).filter(e=>/\.(cs|json)$/.test(e.path));
    if(entries.length!==count) throw inputError('missing_historical_source',`Expected ${count} historical inputs at ${sha}, found ${entries.length}`);
    const files=new Map();
    for(const entry of entries) {const bytes=readBlob(root,entry);files.set(entry.path,bytes);inputs.push({...entry,sha256:hash(bytes)});}
    snapshots.push(extractSnapshot(sha,files));
  }
  const configPath='docs/specs/bomber/stage0-kernel-contract.md',entries=tree(root,revision,[configPath]);
  if(entries.length!==1) throw inputError('missing_historical_source','Missing original config specification');
  const bytes=readBlob(root,entries[0]),config=bytes.toString('utf8');inputs.push({...entries[0],sha256:hash(bytes)});
  for(const symbol of ['hatPileExpireMs','hatPileMinStacks','hatPileMaxStacks']) {
    check(config.includes(symbol),configPath,'missing original config symbol');
    snapshots.at(-1).active.push({kind:'config-symbol',scope:'101-bomber/config-symbols',value:symbol,owner:'Lumio.Bomber.Configuration',shape:{schema:revision,symbol,evidenceKind:'specification-symbol'},evidence:[{repo:'LumioGame',revision,path:configPath}]});
  }
  return {ledger:{mode:'bootstrap-audit',snapshots},identity:{mode:'bootstrap-audit',revision,tree:git(root,['rev-parse',`${revision}^{tree}`]).toString().trim(),revisions:revisions.map(([sha])=>sha)},files:inputs};
}
