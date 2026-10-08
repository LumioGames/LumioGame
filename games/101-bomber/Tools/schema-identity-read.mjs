import { readdir, readFile } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {V15_REVIEW,requireV15Review,V15_AUTHOR_PATHS} from './schema-identity-v15-evidence.mjs';
import {V16_SCHEMA,V16_REVIEW,V16_AUTHOR_PATHS,selectV16Review,requireV16Review} from './schema-identity-v16-evidence.mjs';

export const SCHEMA = 'bomber-v15-traversal-favorite-regions-candidate';
// Byte admission pins the exact official full-package manifest and SDK artifact.
export const CANDIDATE_PACKAGE = Object.freeze({
  "manifestSha256": "652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04",
  "sdkPath": "Engine/sdk/Lumio.Engine.SDK.0.0.5-main.0e2fc74.nupkg",
  "sdkSha256": "93d8ec4731f39726294cc92ac5eb1e643aab9693d9a2f8c6f24bc24b16539ea1"
});
const growthFields = [[9,'Item','NetEntityId'],[10,'Kind','int'],[11,'MaximumBefore','int'],
  [12,'MaximumAfter','int'],[13,'GoldBefore','int'],[14,'GoldAfter','int'],[15,'HatsAfter','int'],
  [16,'UpgradeBefore','long'],[17,'UpgradeAfter','long']];
const effectSpecs = [
  { name: 'BomberDamageEffect', id: 10101, fact: 'bomber.damage', fields: [
    [1,'Points','long'],[2,'Fx','string',32],[3,'BombId','NetEntityId'],[4,'Row','int'],[5,'MatchId','ulong'],
    [6,'Participant','NetEntityId'],[7,'Life','NetEntityId'],[8,'Generation','ulong'],[9,'SourceParticipant','NetEntityId'],
    [10,'SourceLife','NetEntityId'],[11,'SourceGeneration','ulong'],[12,'Family','int'],[13,'ChainId','ulong'],
    [14,'X','int'],[15,'Z','int'],[16,'Cause','int']] },
  { name: 'BomberHealEffect', id: 10102, fact: 'bomber.health', fields: [
    [1,'Points','long'],[2,'Fx','string',32],[3,'Life','NetEntityId'],[4,'Row','int'],[5,'MatchId','ulong'],
    [6,'Participant','NetEntityId'],[7,'Generation','ulong'],[8,'Intent','ulong'], ...growthFields,
    [18,'MovementSpeedAfter','long']] },
  { name: 'BomberRestoreHealthEffect', id: 10103, fact: 'bomber.health', fields: [
    [1,'Points','long'],[2,'Fx','string',32],[3,'Life','NetEntityId'],[4,'Row','int'],[5,'MatchId','ulong'],
    [6,'Participant','NetEntityId'],[7,'Generation','ulong'],[8,'Intent','ulong'], ...growthFields] },
  { name: 'BomberNewMatchEffect', id: 10104, fact: 'bomber.health', fields: [
    [1,'Points','long'],[2,'Fx','string',32],[3,'Life','NetEntityId'],[4,'Row','int'],[5,'MatchId','ulong'],
    [6,'Participant','NetEntityId'],[7,'Generation','ulong'],[8,'Intent','ulong'], ...growthFields,
    [18,'PowerSeed','long'],[19,'CapacitySeed','long'],[20,'SpeedTierSeed','long'],[21,'MovementSpeedSeed','long']] },
  { name: 'BomberSuccessorRestoreEffect', id: 10105, fact: null, magnitude: 'Health', writes: [1,2,3,4,5,6], fields: [
    [1,'Health','long'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'OldLife','NetEntityId'],
    [5,'MatchId','ulong'],[6,'Generation','ulong'],[7,'Intent','ulong'],[8,'Revision','ulong'],
    [9,'Power','long'],[10,'Capacity','long'],[11,'Available','long'],[12,'Speed','long'],[13,'MovementSpeed','long']] },
  { name: 'BomberInventoryEffect', id: 10106, fact: null, magnitude: 'Available', writes: [4], fields: [
    [1,'Available','long'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'Life','NetEntityId'],
    [5,'Generation','ulong'],[6,'MatchId','ulong'],[7,'Capacity','long']] },
  { name: 'BomberBubbleEffect', id: 10107, fact: null, magnitude: '0', writes: [],
    finite:{lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]}, fields: [
    [1,'Duration','ulong'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'Life','NetEntityId'],
    [5,'Generation','ulong'],[6,'MatchId','ulong']] },
  ...['BomberFreezeEffect','BomberFreezeImmunityEffect'].map((name,index)=>({name,id:10108+index,fact:null,magnitude:'0',writes:[],
    finite:{lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]},fields:[
      [1,'Duration','ulong'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'Life','NetEntityId'],
      [5,'Generation','ulong'],[6,'MatchId','ulong'],[7,'DamageOwner','NetEntityId'],[8,'DamageRow','int'],
      [9,'DamageWorld','ulong'],[10,'DamageInstance','ulong'],[11,'DamageGeneration','uint']]})),
  { name:'BomberBurnDamageEffect',id:10110,fact:'bomber.fire',fields:[
    [1,'Points','long'],[2,'Fx','string',32],[3,'FactOwner','NetEntityId'],[4,'Row','int'],[5,'MatchId','ulong'],
    [6,'Participant','NetEntityId'],[7,'Life','NetEntityId'],[8,'Generation','ulong'],[9,'SourceParticipant','NetEntityId'],
    [10,'SourceLife','NetEntityId'],[11,'SourceGeneration','ulong'],[12,'Family','int'],[13,'ChainId','ulong'],
    [14,'X','int'],[15,'Z','int'],[16,'Cause','int'],[17,'SourceKind','int'],[18,'Pulse','ulong']] },
  { name:'BomberFireAuraEffect',id:10111,fact:null,magnitude:'0',writes:[],
    finite:{lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]},fields:[
      [1,'Duration','ulong'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'Life','NetEntityId'],
      [5,'Generation','ulong'],[6,'MatchId','ulong'],[7,'Favorite','bool'],[8,'ChainId','ulong']] },
  {name:'BomberFireZoneLifetimeEffect',id:10112,fact:null,magnitude:'0',writes:[],
    finite:{lifetime:'finite',policy:'finite-ta',durationFieldId:1,periodFieldId:null,contributions:[]},fields:[
      [1,'Duration','ulong'],[2,'Fx','string',32],[3,'Participant','NetEntityId'],[4,'Life','NetEntityId'],
      [5,'Generation','ulong'],[6,'MatchId','ulong'],[7,'ChainId','ulong'],[8,'AuraWorld','ulong'],
      [9,'AuraInstance','ulong'],[10,'AuraGeneration','uint'],[11,'Zone','NetEntityId'],[12,'Ordinal','int'],
      [13,'X','int'],[14,'Z','int'],[15,'Mask','int'],[16,'BirthTick','ulong']] },
];
const effectRows = {
  BomberDamageFacts: { annotation:'EffectRow ( "bomber.damage" , typeof ( BomberBombEntity ) , nameof ( Status ) , nameof ( Ready ) , MaxStatusWrites = 360 )',
    payload:['MatchId','Participant','Life','Generation','SourceParticipant','SourceLife','SourceGeneration','Family','ChainId','X','Z','Cause'] },
  BomberHealthFacts: { annotation:'EffectRow ( "bomber.health" , typeof ( PlayerEntity ) , nameof ( Status ) , nameof ( Ready ) , MaxStatusWrites = 360 )',
    payload:['MatchId','Participant','Generation','Intent'], tailPayload:growthFields.map(([,name])=>name) },
  BomberFireFacts: { annotation:'EffectRow ( "bomber.fire" , typeof ( BomberParticipantEntity ) , nameof ( FireStatus ) , nameof ( FireReady ) , MaxStatusWrites = 360 )',
    prefix:'Fire',payload:['MatchId','Participant','Life','Generation','SourceParticipant','SourceLife','SourceGeneration','Family','ChainId','X','Z','Cause','SourceKind','Pulse'] },
};
// Independent post-GEN review supplies the exact source/generated closure.
const primitive = { int: 'System.Int32', uint: 'System.UInt32', long: 'System.Int64', ulong: 'System.UInt64', bool: 'System.Boolean', string: 'System.String', float: 'System.Single', double: 'System.Double' };
const wireTypes = { int: 'i32', uint: 'u32', long: 'i64', ulong: 'u64', bool: 'bool', string: 'utf8-string', NetEntityId: 'net-entity-id' };
const external = ['ObserverComponent', 'LogicTransform', 'AbilityComponent', 'AttributeComponent', 'EffectComponent', 'WorldSaveComponent', 'NetEntityId'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function unsupported(path, member) { throw Object.assign(new Error(`unsupported_source_shape: ${path}: ${member}`), { code: 'unsupported_source_shape', path, member }); }
function insist(value, path, member) { if (!value) unsupported(path, member); }

// Lex first: comments cannot supply declarations and string contents remain indivisible.
// The accepted source dialect deliberately excludes raw/verbatim strings and directives
// other than nullable. A newly generated dialect must receive an explicit reader review.
export function tokenize(text, path = '<source>', balanced = true) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i);
    const ignored = /^(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|#nullable[^\r\n]*)/.exec(rest);
    if (ignored) { i += ignored[0].length; continue; }
    const token = /^(?:\$?"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])'|@?[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?(?:[uUlLfFdDmM]+)?|=>|::|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|[{}()[\]<>.,;:=?+*/!&|%~^\-])/.exec(rest);
    if (!token) unsupported(path, `lexical token at ${i}: ${rest.slice(0, 32)}`);
    tokens.push(token[0]); i += token[0].length;
  }
  if(!balanced) return tokens;
  const stack = [];
  for (const token of tokens) {
    if (['{', '(', '['].includes(token)) stack.push(token);
    if (['}', ')', ']'].includes(token)) insist(stack.pop() === ({ '}': '{', ')': '(', ']': '[' })[token], path, 'unbalanced delimiters');
  }
  insist(!stack.length, path, 'unbalanced delimiters');
  return tokens;
}
const compact = tokens => tokens.join(' ');
const str = token => JSON.parse(token);
function group(tokens, start, path) {
  const close = { '{': '}', '(': ')', '[': ']', '<': '>' }[tokens[start]];
  insist(close, path, `expected opening delimiter at ${start}`);
  let depth = 1;
  for (let i = start + 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[start]) depth++;
    if (tokens[i] === close && --depth === 0) return { body: tokens.slice(start + 1, i), end: i + 1 };
  }
  unsupported(path, 'unbalanced group');
}
function split(tokens, separator = ',') {
  const result = []; let start = 0; const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (['(', '[', '{', '<'].includes(t)) stack.push(t);
    else if ([')', ']', '}', '>'].includes(t)) stack.pop();
    else if (t === separator && !stack.length) { result.push(tokens.slice(start, i)); start = i + 1; }
  }
  if (start < tokens.length) result.push(tokens.slice(start));
  return result;
}
function header(tokens, path) {
  let i = 0; const usings = [];
  while (tokens[i] === 'using') {
    const end = tokens.indexOf(';', i); insist(end > i, path, 'using');
    const name = tokens.slice(i + 1, end).join(''); insist(/^[\w.]+$/.test(name), path, 'using alias/static');
    usings.push(name); i = end + 1;
  }
  insist(tokens[i] === 'namespace', path, 'file scoped namespace');
  const end = tokens.indexOf(';', i); insist(end > i, path, 'namespace');
  return { namespace: tokens.slice(i + 1, end).join(''), usings, body: tokens.slice(end + 1) };
}
function declarations(tokens, path) {
  const h = header(tokens, path); const result = []; let i = 0; const t = h.body;
  while (i < t.length) {
    const attrs = [];
    while (t[i] === '[') { const a = group(t, i, path); attrs.push(compact(a.body)); i = a.end; }
    const start = i;
    const modifiers = [];
    while (['public', 'internal', 'private', 'protected', 'sealed', 'abstract', 'static', 'partial', 'readonly'].includes(t[i])) modifiers.push(t[i++]);
    let kind = t[i++]; if (kind === 'record' && ['struct','class'].includes(t[i])) i++;
    insist(['class', 'struct', 'interface', 'enum', 'record'].includes(kind), path, `declaration ${compact(t.slice(start, i + 4))}`);
    const name = t[i++]; insist(/^\w+$/.test(name), path, 'declaration name');
    let parameters = null;
    if (t[i] === '(') { const g = group(t, i, path); parameters = g.body; i = g.end; }
    const suffix = [];
    while (i < t.length && !['{', ';'].includes(t[i])) suffix.push(t[i++]);
    let body = [];
    if (t[i] === '{') { const g = group(t, i, path); body = g.body; i = g.end; }
    else insist(t[i++] === ';', path, name);
    if (t[i] === ';') i++;
    result.push({ ...h, kind, name, attrs, modifiers, parameters, suffix, body, path, fullName: `${h.namespace}.${name}` });
  }
  return result;
}
function resolver(all) {
  const names = new Set(all.map(d => d.fullName));
  return (name, d) => {
    if (primitive[name]) return primitive[name];
    if (name.includes('.')) { insist(names.has(name), d.path, `unresolved ${name}`); return name; }
    const candidates = [...names].filter(n => n.endsWith(`.${name}`) && (n === `${d.namespace}.${name}` || d.usings.some(u => n === `${u}.${name}`) || d.namespace.startsWith(`${n.slice(0, -(name.length + 1))}.`)));
    if (external.includes(name) && d.usings.includes('Lumio.GameRuntime.Ecs')) candidates.push(`Lumio.GameRuntime.Ecs.${name}`);
    insist(candidates.length === 1, d.path, `unresolved/ambiguous ${name}`); return candidates[0];
  };
}
function methodWithArgs(tokens, name, path) {
  const hits = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i] === name && tokens[i + 1] === '(') {
    const args = group(tokens, i + 1, path);
    if (tokens[args.end] === '{') hits.push({ args: args.body, body: group(tokens, args.end, path).body });
  }
  insist(hits.length === 1, path, `${name} method coverage (${hits.length})`); return hits[0];
}
function method(tokens, name, path) { return methodWithArgs(tokens, name, path).body; }
function same(actual, expected, path, label) {
  if(JSON.stringify(actual)===JSON.stringify(expected)) return;
  if(Array.isArray(actual)&&Array.isArray(expected)) { const i=actual.findIndex((x,i)=>JSON.stringify(x)!==JSON.stringify(expected[i])); unsupported(path,`${label}: lengths ${actual.length}/${expected.length}, first difference ${i}: ${JSON.stringify(actual[i])} / ${JSON.stringify(expected[i])}`); }
  unsupported(path,`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const normalized = text => compact(tokenize(text, '<pattern>', false));
const lower = name => name[0].toLowerCase() + name.slice(1);

export function verifyGeneratedHooks(tokens, fields, side, path) {
  const shortType = type => Object.entries(primitive).find(([,v])=>v===type)?.[0] ?? type.split('.').at(-1);
  const hooks = [...fields.filter(f=>f.kind==='scalar'),...fields.filter(f=>f.kind==='container')].map(({kind,shape:s})=>{
    const type=kind==='scalar'?shortType(s.clrType):s.containerKind==='SyncDict'
      ? `IReadOnlyDictionary<${shortType(s.keyType)}, ${shortType(s.valueType)}>`
      : `IReadOnlyList<${shortType(s.elementType)}>`;
    insist(kind==='scalar'||['SyncList','SyncDict'].includes(s.containerKind),path,'reviewed container hook kind');
    return {s,type,item:kind==='container'?(s.containerKind==='SyncDict'
      ? `DictItemChange<${shortType(s.keyType)}, ${shortType(s.valueType)}>`
      : `ListItemChange<${shortType(s.elementType)}>`):null,ordinal:side==='client'?s.clientOrdinal??s.ordinal:s.ordinal};
  });
  for(const {s,type,item} of hooks) {
    for(const suffix of ['Changing','Changed']) insist(compact(tokens).includes(normalized(`partial void On${s.member}${suffix}(${type} old, ${type} @new, ChangeReason reason);`)),path,`${s.member} ${suffix} hook signature`);
    if(item) insist(compact(tokens).includes(normalized(`partial void On${s.member}ItemChanged(${item} change, ChangeReason reason);`)),path,`${s.member} item hook signature`);
  }
  for(const suffix of ['Changing','Changed']) {
    const expected=hooks.map(({s,type,item,ordinal})=>`if (ordinal == ${ordinal}) On${s.member}${suffix}((${type})oldValue!, (${type})newValue!, reason);`+
      (suffix==='Changed'&&item?`if (ordinal == ${ordinal}) foreach (var change in ContainerChanges.Diff((${type})oldValue!, (${type})newValue!)) On${s.member}ItemChanged(change, reason);`:'')).join('\n');
    same(compact(method(tokens,`InvokeField${suffix}`,path)),normalized(expected),path,`complete ${suffix} hook dispatch`);
  }
}

export function parseComponent(d, resolve) {
  insist(compact(d.suffix) === ': Component', d.path, `${d.name} base`);
  const fields = []; let ordinal = 0;
  const columns=[];
  for (const part of split(d.body, ';')) {
    let declaration=part;
    if(part[0]==='['&&part[1]==='EffectRowColumn') {
      const attr=group(part,0,d.path);
      columns.push(compact(attr.body));
      declaration=part.slice(attr.end);
    } else if(effectRows[d.name])
      unsupported(d.path,`${d.name}: missing EffectRowColumn`);
    const s = compact(declaration);
    const m = /^(\[ Persist \] )?public (Sync|SyncList|SyncDict|SyncSet) < ([\w ,]+) > (\w+) = new \( Scope \. (Room|Aoi|Owner|None) , (?:(\d+) , )?Authority \. (Server|Owner) \)(?: \{ Value = (?:""|(?:- )?\d+|true|false) \})?$/.exec(s);
    insist(m, d.path, `${d.name}: ${s}`);
    const [,persist,container,types,member,scope,capacity,authority] = m;
    if(s.includes('Value = - ')) insist(container==='Sync'&&['int','long'].includes(types),d.path,`${member} signed default`);
    const args = types.split(' , ').map(x => resolve(x, d));
    insist(args.length === (container === 'SyncDict' ? 2 : 1), d.path, member);
    const shape = { member, key: `${d.name}.${lower(member)}`, clrType: container === 'Sync' ? args[0] : `${container}<${args.join(',')}>`, wireType: container === 'Sync' ? wireTypes[types] : ({ SyncList: 'list', SyncDict: 'dict', SyncSet: 'set' })[container], persistence: persist ? 'persistent' : 'ephemeral', scope, authority };
    insist(shape.wireType, d.path, `${member} wire type`);
    insist(container === 'Sync' ? capacity === undefined : Number.isSafeInteger(Number(capacity)) && Number(capacity)>0 && Number(capacity)<=2147483647,d.path,`${member} explicit capacity`);
    if (container === 'Sync') shape.ordinal = ordinal++;
    else Object.assign(shape, { maxCapacity: Number(capacity), containerKind: container, elementType: container === 'SyncDict' ? null : args[0], keyType: container === 'SyncDict' ? args[0] : null, valueType: container === 'SyncDict' ? args[1] : null });
    fields.push({ kind: container === 'Sync' ? 'scalar' : 'container', shape });
  }
  for (const f of fields.filter(f => f.kind === 'container')) f.shape.ordinal = ordinal++;
  if(effectRows[d.name]) {
    const expected=[1,2,3,4,5,6,8].map(n=>`EffectRowColumn ( "captured" , Selector = ${n} )`);
    expected.push(...effectRows[d.name].payload.map((_,i)=>`EffectRowColumn ( "captured" , Selector = 9 , PayloadFieldId = ${i+5} )`));
    expected.push(...['output','output','output','ready','status'].map(kind=>`EffectRowColumn ( "${kind}" )`));
    expected.push(...(effectRows[d.name].tailPayload??[]).map((_,i)=>`EffectRowColumn ( "captured" , Selector = 9 , PayloadFieldId = ${i+9} )`));
    same(columns,expected,d.path,'complete Effect fact column annotations');
    const rowFields=fields;
    const prefix=effectRows[d.name].prefix??'';
    same(rowFields.map(f=>f.shape.member),['HandleWorld','HandleInstance','HandleGeneration','TypeId','Target','Source','Tick',
      ...effectRows[d.name].payload,'Before','After','Actual','Ready','Status',...(effectRows[d.name].tailPayload??[])].map(name=>prefix+name),d.path,'complete Effect fact column order');
  } else insist(columns.length===0,d.path,'unexpected EffectRowColumn');
  return fields;
}

async function walk(root, dir = '') {
  const paths = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (['Tables', 'Config', 'Compatibility', 'bin', 'obj'].includes(entry.name)) continue;
    const path = `${dir ? `${dir}/` : ''}${entry.name}`;
    if (entry.isDirectory()) paths.push(...await walk(root, path)); else if (/\.(cs|json)$/.test(path)) paths.push(path);
  }
  return paths.sort();
}
function selectionFor(schema=SCHEMA,reviewedV16=V16_REVIEW) {
  if(schema===SCHEMA)return {schema,author:V15_AUTHOR_PATHS,package:CANDIDATE_PACKAGE};
  if(schema===V16_SCHEMA)return {schema,author:V16_AUTHOR_PATHS,package:selectV16Review(reviewedV16).package};
  unsupported('schema','Unreviewed schema selection');
}
async function inputPaths(root,selection) {
  const gameplay = (await walk(join(root, 'Gameplay'))).map(p => `Gameplay/${p}`);
  // Capture every fixed reviewed author target, including skipped Config and external consumers.
  // De-duplicate files already found by Gameplay traversal so fingerprints stay deterministic.
  return [...new Set([...gameplay,...selection.author,'Engine/manifest.json',selection.package.sdkPath])].sort();
}
export async function readObservationInputs(root, { engineRoot = process.env.BOMBER_SCHEMA_ENGINE_ROOT,schema=SCHEMA,reviewedV16=V16_REVIEW } = {}) {
  if (engineRoot && !isAbsolute(engineRoot)) throw Object.assign(new Error('Schema package root must be an explicit absolute path'), { code: 'invalid_package_root' });
  const packageRoot = engineRoot ? resolve(engineRoot) : join(root, 'Engine');
  const result = new Map();
  for (const path of await inputPaths(root,selectionFor(schema,reviewedV16))) {
    const source = path.startsWith('Engine/') ? join(packageRoot, path.slice('Engine/'.length)) : join(root, path);
    result.set(path, await readFile(source));
  }
  return result;
}
const fingerprints = map => [...map].map(([path, bytes]) => ({ path, sha256: sha(bytes) }));
export function assertInputsUnchanged(first, last) {
  if (JSON.stringify(fingerprints(first)) !== JSON.stringify(fingerprints(last))) throw Object.assign(new Error('input_changed: declaration/generated/manifest input set changed during read'), { code: 'input_changed' });
}

export async function readObservation(gameRoot, { engineRoot = process.env.BOMBER_SCHEMA_ENGINE_ROOT, reviewedV15 = V15_REVIEW,schema=SCHEMA,reviewedV16=V16_REVIEW } = {}) {
  const selection = { engineRoot,schema,reviewedV16 };
  const first = await readObservationInputs(gameRoot, selection);
  // Parse only immutable in-memory bytes from this capture, then verify the full path/hash set.
  let observation, error;
  try { observation = observeSnapshot(first,{reviewedV15,schema,reviewedV16}); } catch (e) { error = e; }
  let last;
  try { last=await readObservationInputs(gameRoot, selection); } catch(cause) {throw Object.assign(new Error('input_changed: input set became unreadable during read',{cause}),{code:'input_changed'});}
  assertInputsUnchanged(first,last);
  if (error) throw error;
  return { schema, identities: observation, files: fingerprints(first), packageRoot: resolve(engineRoot || join(gameRoot, 'Engine')) };
}

export function observeSnapshot(files,{reviewedV15=V15_REVIEW,schema=SCHEMA,reviewedV16=V16_REVIEW}={}) {
  const selected=selectionFor(schema,reviewedV16);
  const SCHEMA=selected.schema,CANDIDATE_PACKAGE=selected.package;
  const {generated:reviewedGenerated}=schema===V16_SCHEMA?requireV16Review(files,reviewedV16):requireV15Review(files,reviewedV15);
  for (const [path, expected] of [['Engine/manifest.json', CANDIDATE_PACKAGE.manifestSha256], [CANDIDATE_PACKAGE.sdkPath, CANDIDATE_PACKAGE.sdkSha256]])
    insist(files.has(path) && sha(files.get(path)) === expected, path, 'unreviewed package07 bytes');
  const manifest = JSON.parse(files.get('Engine/manifest.json'));
  const reviewedPackages = [
    ['0e2fc74783f9f186d59909b38d4ee70887a21137', 'd8ae3da3793d5d95785606be319668a4318af85a', '0.0.5-main.0e2fc74', true],
    ['0e2fc74783f9f186d59909b38d4ee70887a21137', '23356eafc365c753b6e8d9987fd069815ff067ce', '0.0.4-main.0e2fc74', true],
    ['734622fd2767e42f4f3f91373f90ec792c0dcc06', '668993f4f26be13581768558f98f3bb317c25081', '0.0.4-main.734622f', true],
    ['6f625e83e29543a53ae621b92d5cdbbf27e73945', '668993f4f26be13581768558f98f3bb317c25081', '0.1.0-dev.cdabf562751de6e6cbc42bbc4497f0ea391f2e147c4d948598aabc3647c85ea2', true],
    ['ad8106809b549231813af56e345665215c0ba80b', '855dab29fb3180557316ba0340c7b5a83434c6ea', '0.1.0-dev.189b3f3b9970d9ab5717d79b234939eb62b16998ff060ad18b7472374afc6549', true],
    ['b2b9600cb120df1b35a09fde004b2060e4a5364a', 'edb5327ce2a2ae083fbc4de33355b2dad476baf4', '0.0.1-main.b2b9600', false],
    ['3c5ac27af94e8b48a47c5fc48fe5d5e661413346', '53406580e59beb448344ed386ab0fd7b67e4336f', '0.0.1-main.3c5ac27', true],
    ['3c5ac27af94e8b48a47c5fc48fe5d5e661413346', '86e2d4f0e403b5d39c32035d711dcef0e0035fe5', '0.0.2-main.3c5ac27', true],
    ['54930d947a4432e83a45fa5215e38dc08aee12f5', 'd287bcd009a740de45fb279f26aa145ea1d200d5', '0.0.4', true],
    ['54930d947a4432e83a45fa5215e38dc08aee12f5', 'd287bcd009a740de45fb279f26aa145ea1d200d5', '0.0.4-main.54930d9', true],
    ['c75e53f6169ecae6460e47142e71be8b6d68fb2a', '7d6e5f5d83f3bfdd1039a0b9da559afc0abeae41', '0.1.0-dev.5c837a3520fbdc163eb720765d43b3086d1b4697f8f69809ed0b51861660afe8', true],
    ['58f65709e053dfa396ec0daab3760d9b2f5c500c', '17432163e2ac35663380bfc363fd9fd2f66df95e', '0.1.0-dev.f434c3efb2f6ebbd5b5a1fbcc2d3ae5ecea455ddf157fed755089d6cd213664e', true],
    ['f53d6ad806e252f8d5bb210e1ddda9e34181c4a1', '76c607b40ce0b95b7b26b9ff3c7e886e8fe7e76a', '0.1.0-dev.d7869cb540b37563b0448ec5ec299a031831e20278008a624100740dfd2f3275', true],
    ['ef9fe1ded0f75828e83c691ff6e2ddb82a30df24', 'ed5fae193cd871d2399836c41b79dba181323d53', '0.1.0-dev.43a59fc2aa0ec388ff2917713ef8fee5af0550efc60324e6102e899e7b1a3821', true],
    ['ef9fe1ded0f75828e83c691ff6e2ddb82a30df24', '4c9e654f36e935a6ac8ddec42284556b388b7696', '0.1.0-dev.a5fa849479843f2f8f08105e45187ce3be1ec831fefdeab34ee4fafc87c126fe', true],
  ];
  const packageIndex = reviewedPackages.findIndex(([engine, runtime, version]) => manifest.sources?.LumioGameEngine === engine && manifest.sources?.LumioGameRuntime === runtime && manifest.version === version);
  insist(schema===V16_SCHEMA||packageIndex !== -1, 'Engine/manifest.json', 'unreviewed generator provenance');
  const worldLocalGas = schema===V16_SCHEMA||reviewedPackages[packageIndex][3];
  const parsed = new Map();
  // External consumers/tests and Config participate in exact byte review and input fences.
  // Preserve the original supported Gameplay schema dialect; do not parse unrelated C#/TS as declarations.
  for (const [path, bytes] of files) if (path.startsWith('Gameplay/')&&!path.startsWith('Gameplay/Config/')&&path.endsWith('.cs'))
    parsed.set(path,tokenize(bytes.toString('utf8'),path));
  const relevant = [...parsed].filter(([p]) => /^Gameplay\/(Components|EntityTypes|Abilities|Effects|Events)\//.test(p) || p === 'Gameplay/BomberTypes.cs');
  const all = relevant.flatMap(([p,t]) => declarations(t,p));
  const resolve = resolver(all); const identities = [];
  const evidence = paths => paths.map(path => {
    insist(files.has(path),path,'missing identity evidence input');
    return { repo: 'LumioGame', revision: `sha256:${sha(files.get(path))}`, path: `games/101-bomber/${path}` };
  });
  const add = (kind, scope, value, owner, shape, paths) => identities.push({ kind, scope: `101-bomber/${scope}`, value, owner, shape:{schema:SCHEMA,...shape}, evidence: evidence(paths) });
  const components = all.filter(d => d.attrs.includes('EcsComponent'));
  const entities = all.filter(d => d.attrs.some(a => a.startsWith('EntityType ')));
  const abilities = all.filter(d => d.attrs.some(a => a.startsWith('AbilityType ')));
  const effects = all.filter(d => d.attrs.some(a => a.startsWith('EffectType ')));
  for(const d of all) {
    if(d.path.startsWith('Gameplay/EntityTypes/')) insist(entities.includes(d),d.path,`unmatched entity declaration ${d.name}`);
    if(d.path.startsWith('Gameplay/Abilities/')&&!abilities.includes(d)) {
      const shared=abilities.find(a=>a.fullName===d.fullName);
      insist(shared&&shared.modifiers.includes('partial')&&d.modifiers.includes('partial')&&d.kind==='class'&&!d.attrs.length&&!d.suffix.length&&d.parameters===null&&
        (['Server','Client'].some(side=>d.path===shared.path.replace(/\.cs$/,`.${side}.cs`))||
          schema===V16_SCHEMA&&shared.fullName==='Lumio.Bomber.Gameplay.MoveAbility'&&
          d.path==='Gameplay/Abilities/MoveAbility.Movement.cs'),d.path,`unmatched ability declaration ${d.name}`);
    }
    if(d.path.startsWith('Gameplay/Effects/')&&!effects.includes(d)) {
      const shared=effects.find(a=>a.fullName===d.fullName);
      insist(shared&&d.path===shared.path.replace(/\.cs$/,'.Server.cs')&&d.modifiers.includes('sealed')&&d.modifiers.includes('partial')&&
        d.kind==='class'&&!d.attrs.length&&!d.suffix.length&&d.parameters===null,d.path,`unmatched Effect partial ${d.name}`);
    }
    if(d.path.startsWith('Gameplay/Components/')&&(d.suffix.includes('Component')||d.attrs.some(a=>a.startsWith('EcsComponent')))) insist(components.includes(d)||components.some(c=>c.fullName===d.fullName),d.path,`unmatched component declaration ${d.name}`);
    if(/(?:public|private|internal|protected) (?:readonly )?Sync(?:List|Dict|Set)? </.test(compact(d.body))) insist(components.some(c=>c.fullName===d.fullName),d.path,`Sync field outside component ${d.name}`);
  }
  // Unknown relevant annotations are errors even in otherwise unrelated declarations.
  for (const [p,t] of parsed) if (!p.includes('/generated/')) {
    if(t.includes('EffectType')) insist(effects.some(d=>d.path===p)||p.startsWith('Gameplay/Effects/'),p,'unexpected Effect declaration/reference');
    insist(!t.some(x => /^(TagType|TagId|TagComponent)$/.test(x)), p, 'unexpected Tag declaration/reference');
    if (t.includes('EcsComponent')) insist(components.some(d => d.path === p), p, 'unmatched component');
    if (t.includes('EntityType') && !t.includes('typeof')) insist(entities.some(d => d.path === p), p, 'unmatched entity');
  }
  const generatedExpected = new Set();
  same(effects.map(d=>d.name).sort(),effectSpecs.map(s=>s.name).sort(),'Gameplay/Effects','closed Effect declaration set');
  for(const spec of effectSpecs) {
    const d=effects.find(d=>d.name===spec.name);
    insist(d&&d.path===`Gameplay/Effects/${spec.name}.cs`&&d.kind==='class'&&d.modifiers.includes('sealed')&&d.modifiers.includes('partial')&&
      compact(d.suffix)===`: EffectType < ${spec.name} . Parameters >`,d?.path??'Gameplay/Effects',`${spec.name} declaration`);
    const writes=spec.writes??(spec.name==='BomberHealEffect'||spec.name==='BomberNewMatchEffect'?[1,2,3,4,5,6]:[1]);
    const declaration=spec.finite
      ? `EffectType ( ${spec.id}u , Instant = false , Policy = "finite-ta" , DurationFieldId = 1 , FxKeyFieldId = 2 )`
      : `EffectType ( ${spec.id}u , FxKeyFieldId = 2 , InstantWrites = new uint [ ] { ${writes.join(' , ')} } )`;
    same(d.attrs,[declaration,...(spec.fact===null?[]:[`EffectFact ( "${spec.fact}" , 3 , 4 )`])],d.path,'Effect annotations');
    const expectedBody=`public struct Parameters : IEffectParameters { ${spec.fields.map(([id,name,type,max])=>`[EffectField(${id}${max===undefined?'':`, MaxUtf8Bytes = ${max}`})] public ${type} ${name};`).join(' ')} public long Magnitude => ${spec.magnitude??'Points'}; public string FxKey => Fx; }`;
    same(compact(d.body),normalized(expectedBody),d.path,'complete Effect parameter body');
    const paths=[d.path,'Gameplay/generated/server/GeneratedEffectRegistry.g.cs','Gameplay/generated/client/GeneratedEffectRegistry.g.cs',
      'Gameplay/generated/server/GeneratedEffectCodecs.g.cs','Gameplay/generated/server/GeneratedEffectReducers.g.cs',
      `Gameplay/generated/server/${spec.name}.g.cs`,'Gameplay/generated/client/GeneratedEffectCodecs.g.cs',
      'Gameplay/generated/client/GeneratedEffectReducers.g.cs',`Gameplay/generated/client/${spec.name}.g.cs`,
      'Gameplay/generated/server/effect-operation-plans.json','Gameplay/generated/client/effect-operation-plans.json',
      'Engine/manifest.json',CANDIDATE_PACKAGE.sdkPath];
    if(spec.id===10112) paths.push('Gameplay/Effects/BomberFireZoneLifetimeEffect.Server.cs',
      'Gameplay/BomberFireZoneLifetimeReducer.Server.cs','Gameplay/BomberFavoriteFireZones.Server.cs',
      'Gameplay/Components/Bomber/BomberFireZoneState.Server.cs');
    add('effect-type','gas/effect',spec.id,d.fullName,{clrType:d.fullName,parametersType:`${d.fullName}.Parameters`,id:spec.id,
      fxKeyFieldId:2,instantWrites:writes,fact:spec.fact===null?null:{name:spec.fact,sourceFieldId:3,targetFieldId:4},
      fields:spec.fields.map(([id,name,type,max])=>({id,name,clrType:primitive[type]??`Lumio.GameRuntime.Ecs.${type}`,maxUtf8Bytes:max??null})),
      ...(spec.finite??{})},paths);
  }
  for(const [path, expected] of Object.entries(reviewedGenerated)) {
    generatedExpected.add(path);
    insist(files.has(path)&&sha(files.get(path))===expected,path,'complete reviewed Effect generated body');
  }
  const fieldsByComponent = new Map();
  for (const d of components) {
    same(d.attrs, ['EcsComponent',...(effectRows[d.name]?[effectRows[d.name].annotation]:[])], d.path, 'component annotations');
    const fields = parseComponent(d, resolve);
    const paths = [d.path];
    const partials = all.filter(x=>x.fullName===d.fullName && x!==d);
    for (const part of partials) if(/(?:public|private|internal|protected) (?:readonly )?Sync\w* </.test(compact(part.body))) {
      // Installed generator orders server source before shared source. This is the only
      // admitted side-only declaration; any new one requires a reviewed projection rule.
      insist(d.name==='IdentityComponent' && part.path.endsWith('IdentityComponent.Server.cs'),part.path,'unreviewed partial Sync declaration');
      const prefix=normalized('[Persist] public Sync<string> AccountId = new(Scope.None);');
      insist(compact(part.body).startsWith(prefix) && part.body.filter(x=>/^Sync\w*$/.test(x)).length===1,part.path,'Identity server field');
      same(compact(part.body).slice(prefix.length).trim(),normalized(`
        protected override void Awake() => _ = Config.BomberConfigBinding.For(World);
        protected override void Start() => BomberGameplay.BindPlayer(World, Entity);
        protected override void OnHydrate() {
          _ = Config.BomberConfigBinding.For(World);
          BomberGameplay.BindPlayer(World, Entity);
        }`),part.path,'Identity partial member coverage');
      fields.forEach(f=>{f.shape.clientOrdinal=f.shape.ordinal; f.shape.ordinal++;});
      fields.unshift({kind:'scalar',shape:{member:'AccountId',key:'IdentityComponent.accountId',clrType:'System.String',wireType:'utf8-string',persistence:'persistent',scope:'None',authority:'Server',ordinal:0,clientOrdinal:null}});
      paths.push(part.path);
    }
    fieldsByComponent.set(d.fullName, fields);
    for (const side of ['server', 'client']) {
      const p = `Gameplay/generated/${side}/${d.name}.g.cs`; generatedExpected.add(p); paths.push(p);
      const t = parsed.get(p); insist(t, p, 'missing component generation');
      const binding = method(t, 'BindFields', p);
      const projected=fields.filter(f=>side!=='client'||f.shape.clientOrdinal!==null);
      const hookFields=[...projected.filter(f=>f.kind==='scalar'),...projected.filter(f=>f.kind==='container')];
      const expected = hookFields.map(f => f.kind === 'scalar' ? `${f.shape.member} = ${f.shape.member}.Bound(host, this, ${side==='client' ? f.shape.clientOrdinal ?? f.shape.ordinal : f.shape.ordinal}, ${JSON.stringify(f.shape.key)});` : `${f.shape.member}.Bound(host, this, ${side==='client' ? f.shape.clientOrdinal ?? f.shape.ordinal : f.shape.ordinal}, ${JSON.stringify(f.shape.key)});`).join('\n');
      same(compact(binding), normalized(expected), p, 'Bound coverage/order');
      verifyGeneratedHooks(t,projected,side,p);
      for (const f of projected.filter(f => f.kind === 'scalar')) {
        const type = Object.entries(primitive).find(([,v]) => v === f.shape.clrType)?.[0] ?? f.shape.clrType.split('.').at(-1);
        insist(compact(t).includes(normalized(`On${f.shape.member}Changing(${type} old, ${type} @new, ChangeReason reason)`)), p, `${f.shape.member} generated CLR type`);
      }
      const methods = Object.fromEntries(['CapturePersist','CaptureSync','RestorePersist'].map(name=>[name,compact(method(t,name,p))]));
      const restoreTokens=method(t,'RestorePersist',p);
      let restoreOffset=0;
      for(const f of fields) if(!projected.includes(f)) f.shape.serialization={...(f.shape.serialization??{}),[side]:null};
      for(const f of hookFields) {
        f.shape.serialization ??= {};
        const s=f.shape; const q=JSON.stringify(s.key);
        const present={capturePersist:methods.CapturePersist.includes(q),captureSync:new RegExp(`\\. Write(?!PredictionField)\\w* \\( ${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`).test(methods.CaptureSync),restorePersist:methods.RestorePersist.includes(q)};
        // Candidate uint encoding follows the reviewed UInt64 codec with checked restore.
        const supported=true;
        same(present,{capturePersist:supported&&s.persistence==='persistent',captureSync:supported&&s.scope!=='None',restorePersist:supported&&s.persistence==='persistent'},p,`${s.key} serialization presence`);
        const codec=({i32:'Int32',u32:'UInt64',u64:'UInt64',i64:'Int64',bool:'Boolean','utf8-string':'String','net-entity-id':'NetEntityId',list:'Container',dict:'Container',set:'Container'})[s.wireType];
        if(present.capturePersist) insist(methods.CapturePersist.includes(normalized(`writer.Write${codec}(${q}, ${s.member}${f.kind==='scalar'?'.Value':''});`)),p,`${s.key} persistence codec/member`);
        if(present.captureSync) insist(methods.CaptureSync.includes(normalized(`.Write${codec}(${q}, ${s.member}${f.kind==='scalar'?'.Value':''});`)),p,`${s.key} replication codec/member`);
        if(present.restorePersist) {
          const variable=`${lower(s.member)}Restore`;
          const type=f.kind==='container'?'object':Object.entries(primitive).find(([,v])=>v===s.clrType)?.[0]??s.clrType.split('.').at(-1);
          const readType=s.wireType==='u32'?'ulong':type;
          const assignment=f.kind==='container'
            ? `((ISyncContainer)${s.member}).AssignFromRemote(${variable});`
            : `${s.member}.SetSilent(${s.wireType==='u32'?`checked((uint)${variable})`:variable});`;
          const branch=tokenize(`if (reader.TryRead${codec}(${q}, out ${readType} ${variable})) ${assignment}`,p);
          same(restoreTokens.slice(restoreOffset,restoreOffset+branch.length),branch,p,`${s.key} complete restore branch`);
          restoreOffset+=branch.length;
        }
        s.serialization[side]=present;
      }
      insist(restoreOffset===restoreTokens.length,p,'unmatched restore statements');
      const known=new Set(projected.map(f=>JSON.stringify(f.shape.key)));
      for(const body of Object.values(methods)) for(const token of tokenize(body,p)) if(token.startsWith(`"${d.name}.`)) insist(known.has(token),p,`unmatched generated key ${token}`);
    }
    add('component', 'components', d.fullName, d.fullName, { clrType: d.fullName, origin: { kind: 'game', assembly: 'Lumio.Bomber.Gameplay' } }, paths);
    for (const f of fields) add(f.kind, `fields/${d.fullName}`, f.shape.key, d.fullName, { ...f.shape, schema: SCHEMA }, paths);
  }
  const registries = ['server', 'client'].map(side => {
    const path = `Gameplay/generated/${side}/Lumio.Bomber.Gameplay.Registry.g.cs`; generatedExpected.add(path);
    const t = parsed.get(path); insist(t, path, 'missing registry');
    const text = compact(t);
    if (worldLocalGas) {
      insist(text.includes(normalized('static GeneratedRegistry() { }')),path,'empty static constructor');
      same((text.match(/static GeneratedRegistry \( \)/g)??[]).length,1,path,'static constructor count');
      insist(text.includes(normalized('public static void RegisterGasTypes(GasWorldContext context) {')),path,'GAS registration declaration');
      same(compact(methodWithArgs(t,'RegisterGasTypes',path).args),normalized('GasWorldContext context'),path,'GAS context parameter');
      same(compact(method(t,'RegisterGasTypes',path)),normalized(`
        if (context is null) throw new ArgumentNullException(nameof(context));
        GeneratedAbilityRegistry.RegisterAll(context.Types);
        GeneratedEffectRegistry.RegisterAll(context.Types);
        ${side==='server'?'GeneratedEffectReducers.RegisterAll(context);':''}`),path,'complete World-local GAS registration');
      insist(text.includes(normalized('public override void CreateWorldServices(World world) => RegisterGasTypes(new GasWorldContext(world));')),path,'World service creation');
      same((text.match(/CreateWorldServices \(/g)??[]).length,1,path,'World service creation count');
      same((text.match(/RegisterGasTypes \(/g)??[]).length,2,path,'GAS registration entry/call count');
      same((text.match(/GeneratedAbilityRegistry \. RegisterAll \(/g)??[]).length,1,path,'ability registration call count');
      same((text.match(/GeneratedEffectRegistry \. RegisterAll \(/g)??[]).length,1,path,'effect registration call count');
    }
    return { path, t, text };
  });
  for (const d of entities) {
    const has = d.attrs.filter(a => a.startsWith('Has ')).map(a => {
      const m = /^Has \( typeof \( (\w+) \) \)$/.exec(a); insist(m,d.path,'Has'); return resolve(m[1],d);
    });
    const mode = d.attrs.find(a => a.startsWith('EntityType ')); insist(/^EntityType \( Mode \. (CS|Server|Local)( , World = true , TickRateHz = \d+)? \)$/.test(mode),d.path,'EntityType');
    const attributes = d.attrs.filter(a => a.startsWith('DeclareAttribute ')).map(a => {
      const m = /^DeclareAttribute \( ("[^"]+") , (?:(IsLethal = true) , )?Persist = true \)$/.exec(a); insist(m,d.path,a); const name=str(m[1]); return { name, isLethal: !!m[2], persist: true,bindings:[{key:`AttributeComponent.${lower(name)}Base`,wireType:'i64',persistence:'persistent',visibility:'room-public'},{key:`AttributeComponent.${lower(name)}Current`,wireType:'i64',persistence:'ephemeral',visibility:'aoi-scoped'}] };
    });
    insist(d.attrs.length === has.length + attributes.length + 1 + (d.attrs.includes('BlockEntity') ? 1 : 0) && !d.body.length, d.path, 'entity annotation/body coverage');
    const wire = lower(d.name.replace(/Entity$/, '')); const paths = [d.path];
    for (const {path,t,text} of registries) {
      paths.push(path);
      const p = path.replace('Lumio.Bomber.Gameplay.Registry.g.cs', `${d.name}.Template.g.cs`); generatedExpected.add(p); paths.push(p);
      const template = compact(parsed.get(p) ?? []);
      insist(template.includes(normalized(`ComponentCount = ${has.length};`)),p,'template count');
      const creation = /new Component \[ \] \{ (.*?) \} ;/.exec(template); insist(creation,p,'template creation');
      same(creation[1], normalized(has.map(n => `new ${n.split('.').at(-1)}()`).join(',')),p,'template order');
      const start = normalized(`if (entityType == typeof(${d.name}))`);
      const blocks = [];
      for (let at = 0; (at = text.indexOf(start,at)) >= 0; at += start.length) {
        const tail = text.slice(at + start.length); if (tail.startsWith(' { if ( componentType') || tail.startsWith(' { if ( string . Equals ( componentName')) blocks.push(tail.slice(0,tail.indexOf(' }') + 2).trim());
      }
      same(blocks, [normalized(`{ ${has.map((c,i)=>`if(componentType == typeof(${c.split('.').at(-1)})) return ${i};`).join(' ')} return -1; }`), normalized(`{ ${has.map((c,i)=>`if(string.Equals(componentName, "${c.split('.').at(-1)}", StringComparison.Ordinal)) return ${i};`).join(' ')} return -1; }`)], path, `${d.name} ComponentIndex overloads`);
      insist(text.includes(normalized(`if(entityType == typeof(${d.name})) return "${wire}";`)),path,'WireName');
      insist(text.includes(normalized(`if(string.Equals(name, "${wire}", StringComparison.Ordinal) || string.Equals(name, "${d.name}", StringComparison.Ordinal)) {entityType = typeof(${d.name}); return true;}`)),path,`aliases ${d.name}`);
    }
    const shape = { blockEntity: d.attrs.includes('BlockEntity'), clrType: d.fullName, wire, aliases: [d.name], mode: mode.match(/Mode \. (\w+)/)[1], world:mode.includes('World'),tickRateHz:mode.includes('World')?Number(mode.match(/TickRateHz = (\d+)/)[1]):null, attributes };
    add('entity-wire','entity-wire',wire,d.fullName,shape,paths);
    add('entity-alias','entity-alias',d.name,d.fullName,shape,paths);
    has.forEach((component, ordinal) => add('component-slot',`slots/${SCHEMA}/${d.fullName}`,ordinal,d.fullName,{entity:d.fullName,component,ordinal,schema:SCHEMA,slotEvidence:'component-index'},paths));
  }
  for (const name of new Set(entities.flatMap(d => d.attrs.filter(a => a.startsWith('Has ')).map(a => a.match(/typeof \( (\w+) \)/)?.[1])).filter(n => external.includes(n)))) {
    const full = `Lumio.GameRuntime.Ecs.${name}`;
    add('component','components',full,full,{clrType:full,origin:{kind:'external',assembly:'Lumio.GameRuntime.Ecs',engineRevision:manifest.sources.LumioGameEngine,runtimeRevision:manifest.sources.LumioGameRuntime,package:manifest.version}},['Engine/manifest.json']);
  }
  // Registry metadata and JSON metadata must cover every local field, including Scope.None.
  for (const {path,t} of registries) {
    const blockEntities = entities.filter(d=>d.attrs.includes('BlockEntity')).map(d=>`typeof(${d.name})`).join(', ');
    insist(compact(t).includes(normalized(`public override IReadOnlyList<Type> BlockEntityTypes { get; } = new Type[] { ${blockEntities} };`)),path,'complete BlockEntityTypes');
    same(compact(method(t,'WireName',path)),normalized(`
      if(entityType is null) throw new ArgumentNullException(nameof(entityType));
      ${entities.map(d=>`if(entityType == typeof(${d.name})) return "${lower(d.name.replace(/Entity$/,''))}";`).join(' ')}
      throw new InvalidOperationException("Unknown entity type " + entityType.Name);`),path,'complete wire dispatch');
    same(compact(method(t,'TryResolveEntityType',path)),normalized(`entityType=null!; ${entities.map(d=>`if(string.Equals(name,"${lower(d.name.replace(/Entity$/,''))}",StringComparison.Ordinal)||string.Equals(name,"${d.name}",StringComparison.Ordinal)){entityType=typeof(${d.name});return true;}`).join(' ')} return false;`),path,'complete aliases');
    const world=entities.find(d=>d.attrs.some(a=>a.includes('World = true')));
    insist(world,path,'world declaration');
    const tick=Number(world.attrs.find(a=>a.includes('TickRateHz')).match(/TickRateHz = (\d+)/)[1]);
    insist(compact(t).includes(normalized(`WorldEntityType => typeof(${world.name});`))&&compact(t).includes(normalized(`DeclaredTickRateHz => ${tick}UL;`)),path,'world/tick metadata');
    const text = compact(t); const rows = [...text.matchAll(/new FieldAttributeDeclaration \( ("[^"]+") , ("[^"]+") , ("[^"]+") , ("[^"]+") , ("[^"]+") (?:, (\d+) )?\)/g)].map(m=>[...m.slice(1,6).map(str),m[6]===undefined?null:Number(m[6])]);
    const jsonPath = path.replace('Lumio.Bomber.Gameplay.Registry.g.cs','attribute-declarations.json'); generatedExpected.add(jsonPath);
    const json = JSON.parse(files.get(jsonPath));
    same(rows, json.map(r=>[r.attributeId,r.valueType,r.persistence,r.replication,r.visibility,r.maxCapacity??null]),path,'metadata JSON');
    // Both reviewed CodeEmitter versions map Scope.Owner to room-public
    // annotation metadata; retain the declared Owner scope rather than rewriting it.
    const expected = [...fieldsByComponent.values()].flat().filter(f=>!path.includes('/client/')||f.shape.clientOrdinal!==null).map(({shape:s})=>[s.key,s.wireType,s.persistence,s.scope === 'None' ? 'not-replicated':'replicated',({None:'server-only',Room:'room-public',Aoi:'aoi-scoped',Owner:'room-public'})[s.scope],s.maxCapacity??null]);
    const attrNames = [...new Set(entities.flatMap(d=>d.attrs.filter(a=>a.startsWith('DeclareAttribute ')).map(a=>str(a.match(/"[^"]+"/)[0]))))];
    for (const name of attrNames) expected.push([`AttributeComponent.${lower(name)}Base`,'i64','persistent','replicated','room-public',null],[`AttributeComponent.${lower(name)}Current`,'i64','ephemeral','replicated','aoi-scoped',null]);
    same(rows,expected.sort((a,b)=>a[0]<b[0]?-1:1),path,'complete field metadata');
  }
  for (const d of abilities) {
    const m = /^AbilityType \( (\d+)u , Prediction = PredictionKind \. (\w+) \)$/.exec(d.attrs[0]); insist(m && d.attrs.length === 1,d.path,'ability annotation');
    const id = Number(m[1]); const body = compact(d.body);
    insist(body.includes(normalized(`public const uint TypeId = ${id}u;`)),d.path,'TypeId constant');
    insist(compact(d.suffix) === `: AbilityType < ${d.name} . Input >`,d.path,'ability input base');
    const paths = [d.path];
    for (const side of ['server','client']) {
      const p=`Gameplay/generated/${side}/GeneratedAbilityRegistry.g.cs`; generatedExpected.add(p); paths.push(p);
      if(d.modifiers.includes('partial')) {
        const partialPath=`Gameplay/generated/${side}/${d.name}.g.cs`;
        generatedExpected.add(partialPath); paths.push(partialPath);
        // The released generator emits empty component glue for partial abilities.
        // Close the complete shape so it cannot hide fields or RPC registrations.
        same(compact(parsed.get(partialPath)??[]),normalized(`
          using System; using System.Collections.Generic; using Lumio.GameRuntime.Ecs; namespace ${d.namespace};
          public sealed partial class ${d.name} : IGeneratedComponent, IGeneratedSyncMetadata, IGeneratedOperationComponent {
            partial void OnClientWrite(in SyncWrite w, ref bool accept);
            void IGeneratedComponent.BindFields(ISyncHost host) { }
            void IGeneratedComponent.InvokePostAttribute() => PostAttribute();
            partial void PostAttribute();
            void IGeneratedComponent.InvokeFieldChanging(int ordinal, object? oldValue, object? newValue, ChangeReason reason) { }
            void IGeneratedComponent.InvokeFieldChanged(int ordinal, object? oldValue, object? newValue, ChangeReason reason) { }
            bool IGeneratedComponent.DispatchClientWrite(in SyncWrite write) { bool accept = true; OnClientWrite(in write, ref accept); return accept; }
            void IGeneratedComponent.DispatchServerRpc(string method, object?[] args)
              => ((IGeneratedOperationComponent)this).TryDispatchServerRpc(method, args, out _);
            bool IGeneratedOperationComponent.TryDispatchServerRpc(string method, object?[] args, out OperationExecutionOutcome outcome) {
              outcome = new(OperationOutcomeKind.OutcomeUnavailable, OperationCommitFact.Unknown, "operation_outcome_unavailable");
              outcome = new(OperationOutcomeKind.ProtocolReject, OperationCommitFact.NotApplied, "operation_unknown_method");
              return false;
            }
            void IGeneratedComponent.DispatchClientRpc(string method, object?[] args) { }
            void IGeneratedComponent.CapturePersist(IPersistWriter writer) { if (writer is IPredictionFieldWriter) return; }
            void IGeneratedComponent.CaptureSync(IPersistWriter writer) { if (writer is IPredictionFieldWriter prediction) { return; } }
            void IGeneratedComponent.RestorePersist(IPersistReader reader) { }
            object? IGeneratedComponent.ReadField(string fieldId) { return null; }
            void IGeneratedComponent.WriteField(string fieldId, object? value, bool silent) { }
            bool IGeneratedSyncMetadata.TryGetSyncField(string fieldId, out ISyncField field) { field = null!; return false; }
            void IGeneratedComponent.ResetToDefault() { }
          }`),partialPath,'complete empty partial ability glue');
      }
    }
    add('ability','gas/ability',id,d.fullName,{clrType:d.fullName,inputType:`${d.fullName}.Input`,id,prediction:m[2]},paths);
  }
  readEvents(all,resolve,add);
  for (const side of ['server','client']) {
    const p=`Gameplay/generated/${side}/GeneratedEffectRegistry.g.cs`; generatedExpected.add(p);
    insist(parsed.has(p),p,'required Effect registry');
    const syncPath=`Gameplay/generated/${side}/Lumio.Bomber.Gameplay.Sync.g.cs`;
    generatedExpected.add(syncPath);
    const fieldCount=[...fieldsByComponent.values()].flat().filter(f=>side==='server'||f.shape.clientOrdinal!==null).length;
    same(compact(parsed.get(syncPath)??[]),normalized(`namespace Lumio.Bomber.Gameplay; internal static class GeneratedSyncTable {internal static readonly string Side = "${side==='server'?'Server':'Client'}";internal static readonly int FieldCount = ${fieldCount};}`),syncPath,'generated sync coverage');
    const abilityPath=`Gameplay/generated/${side}/GeneratedAbilityRegistry.g.cs`;
    const abilityTokens=parsed.get(abilityPath);
    const declared=abilities.map(d=>({d,id:Number(d.attrs[0].match(/\( (\d+)u/)[1])}));
    if(worldLocalGas) {
      // The entire generated class is closed, including method signatures and registration order.
      same(compact(abilityTokens),normalized(`using System; using Lumio.GameRuntime.Gas; namespace Lumio.Bomber.Gameplay;
        public static class GeneratedAbilityRegistry {
          public static uint TypeIdOf(Type abilityType) {
            ${declared.map(({d,id})=>`if(abilityType == typeof(global::${d.fullName})) return ${id}u;`).join(' ')} return 0u;
          }
          public static void RegisterAll(GasTypeRegistry registry) {
            if (registry is null) throw new ArgumentNullException(nameof(registry));
            ${declared.map(({d,id})=>`registry.RegisterAbility<global::${d.fullName}, global::${d.fullName}.Input>(${id}u);`).join(' ')}
          }
        }`),abilityPath,'complete World-local ability registry');
    } else {
      same(compact(method(abilityTokens,'TypeIdOf',abilityPath)),normalized(`${declared.map(({d,id})=>`if(abilityType==typeof(global::${d.fullName})) return ${id}u;`).join(' ')} return abilityType.Name switch {${declared.map(({d,id})=>`nameof(${d.name}) => ${id},`).join(' ')} _=>0u};`),abilityPath,'complete ability dispatch');
      same(compact(method(abilityTokens,'RegisterAll',abilityPath)),normalized(declared.map(({d,id})=>`global::Lumio.GameRuntime.Ecs.AbilityTypeCatalog.Register<global::${d.fullName},global::${d.fullName}.Input>(${id}u);`).join(' ')),abilityPath,'complete ability registration');
    }
  }
  for (const p of files.keys()) if (p.startsWith('Gameplay/generated/')) insist(generatedExpected.has(p),p,'unmatched generated file');
  return identities;
}

function readEvents(all, resolve, add) {
  for(const d of all.filter(d=>d.path.startsWith('Gameplay/Events/'))) {
    insist(['record','enum'].includes(d.kind)||['IBomberEvent','BomberEventCatalog'].includes(d.name),d.path,`unmatched event declaration ${d.name}`);
    if(d.name==='IBomberEvent') same(compact(d.body),normalized('BomberEventStamp Stamp {get;} BomberContext Context {get;}'),d.path,'event interface');
    if(d.kind==='record') insist(d.parameters!==null&&!d.body.length,d.path,`record body ${d.name}`);
  }
  const records = all.filter(d=>d.kind === 'record' && d.path.startsWith('Gameplay/Events/') && d.name !== 'BomberEventDescriptor');
  const enums = all.filter(d=>d.kind === 'enum');
  const types = new Map([...records,...enums].map(d=>[d.fullName,d]));
  const fields = d => split(d.parameters ?? []).map(p=> {
    const m=/^(\w+)( \?)? (\w+)$/.exec(compact(p)); insist(m,d.path,`${d.name} parameter ${compact(p)}`);
    const clrType=resolve(m[1],d); return {name:m[3],clrType,nullable:!!m[2],valueShape:types.has(clrType)?clrType:null};
  });
  const used=new Set();
  function visit(name) {
    if (used.has(name)) return; used.add(name); const d=types.get(name); insist(d,'Events',`unresolved nested type ${name}`);
    let shape;
    if(d.kind==='enum') {
      let next=0;
      const values=split(d.body).map(p=> { const m=/^(\w+)(?: = (-?\d+))?$/.exec(compact(p)); insist(m,d.path,`${d.name} enum value`); const value=m[2]?Number(m[2]):next; next=value+1; return {name:m[1],value}; });
      shape={clrType:name,typeKind:'enum',fields:[],values};
    } else { const f=fields(d); shape={clrType:name,typeKind:'record',fields:f,values:[]}; f.filter(x=>x.valueShape).forEach(x=>visit(x.valueShape)); }
    add('event-type','event-types',name,name,shape,[d.path]);
  }
  const catalog=all.find(d=>d.name==='BomberEventCatalog'); insist(catalog,'Events','catalog');
  const text=compact(catalog.body);
  const prefix=normalized('public static IReadOnlyList<BomberEventDescriptor> All { get; } = Array.AsReadOnly(new BomberEventDescriptor[] {');
  const suffix=normalized('});'); insist(text.startsWith(prefix)&&text.endsWith(suffix),catalog.path,'catalog body');
  const rows=text.slice(prefix.length,text.length-suffix.length).trim();
  const rowTokens=tokenize(rows,catalog.path); const mapped=[];
  for(const row of split(rowTokens)) {
    const m=/^new \( ("[^"]+") , (?:typeof \( (\w+) \)|(null)) , BomberCatalogKind \. (Typed|Derived|Excluded) , ("[^"]+") , ("[^"]+") \)$/.exec(compact(row)); insist(m,catalog.path,`catalog row ${compact(row)}`);
    const [,name,type,,kind,rule,deps]=m; const clrType=type?resolve(type,catalog):null; const d=types.get(clrType);
    insist(kind==='Excluded'?clrType===null:!!d,catalog.path,'catalog payload');
    if(d) visit(clrType);
    const canonicalName=str(name); mapped.push({kind,clrType});
    add('event','events',canonicalName,clrType??`${catalog.fullName}.${canonicalName}`,{canonicalName,clrType,fields:d?fields(d):[],catalogKind:kind,rule:str(rule),dependencies:str(deps).split('/').filter(x=>x!=='none')},d?[catalog.path,d.path]:[catalog.path]);
  }
  for(const d of records) { insist(used.has(d.fullName),d.path,`unreferenced event/value ${d.name}`); if(compact(d.suffix)===': IBomberEvent') same(mapped.filter(r=>r.kind==='Typed'&&r.clrType===d.fullName).length,1,d.path,'canonical mapping'); else insist(!d.suffix.length,d.path,'record base'); }
}
