import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {tokenize,parseComponent,readObservation} from './schema-identity-read.mjs';
const source=readFileSync(new URL('../Gameplay/Components/Bomber/BomberFireFacts.cs',import.meta.url),'utf8');
const tokens=tokenize(source);
const d={name:'BomberFireFacts',path:'Gameplay/Components/Bomber/BomberFireFacts.cs',suffix:[':','Component'],body:tokens.slice(tokens.indexOf('{')+1,-1)};
const types={ulong:'System.UInt64',uint:'System.UInt32',int:'System.Int32',long:'System.Int64',bool:'System.Boolean',NetEntityId:'Lumio.GameRuntime.Ecs.NetEntityId'};
const resolve=type=>types[type];
test('M2 Participant fact row authenticates all twenty-six bounded pulse columns separately from Skill scalars',()=>{
 const fields=parseComponent(d,resolve);
 assert.equal(fields.filter(f=>f.kind==='container').length,26);
 assert.equal(fields.filter(f=>f.kind==='scalar').length,0);
 assert.ok(fields.filter(f=>f.kind==='container').every(f=>f.shape.maxCapacity===1));
 const skill=tokenize(readFileSync(new URL('../Gameplay/Components/Bomber/BomberSkillState.cs',import.meta.url),'utf8'));
 const scalars=parseComponent({name:'BomberSkillState',path:'Gameplay/Components/Bomber/BomberSkillState.cs',suffix:[':','Component'],body:skill.slice(skill.indexOf('{')+1,-1)},resolve);
 assert.equal(scalars.length,66);assert.ok(scalars.every(f=>f.kind==='scalar'));
});
test('M2 Participant fact row refuses a missing column annotation rather than silently admitting it as a list',()=>{
 const altered={...d,body:tokenize(source.replace('[EffectRowColumn("captured", Selector = 1)]','')).slice(tokens.indexOf('{')+1,-1)};
 assert.throws(()=>parseComponent(altered,resolve),error=>error.code==='unsupported_source_shape');
});
test('M2 reader accepts the explicitly signed negative Supply ordinal default',()=>{
 const fields=parseComponent({name:'BomberPickupItem',path:'fixture',suffix:[':','Component'],body:tokenize('[Persist] public Sync<int> SupplyOrdinal = new(Scope.None, Authority.Server) { Value = -1 };')},resolve);
 assert.equal(fields[0].shape.clrType,'System.Int32');
});

test('official v14 output has the closed 77 fields, 58 private bounds, one bridge and two effects',async()=>{
 const prior=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-m2-producers.json',import.meta.url)));
 const observed=await readObservation(fileURLToPath(new URL('../',import.meta.url)));
 assert.equal(observed.schema,'bomber-v14-m2-bounded-producers-candidate');
 assert.equal(observed.identities.length,765);
 const key=i=>JSON.stringify([i.kind,i.owner,i.value]);
 const before=new Map(prior.active.map(i=>[key(i),i]));
 assert.ok(prior.active.every(i=>observed.identities.some(next=>key(next)===key(i))));
 const added=observed.identities.filter(i=>!before.has(key(i)));
 assert.equal(added.length,85);
 const fields=added.filter(i=>['scalar','container'].includes(i.kind));
 assert.equal(fields.length,77);
 const synced=new Map([
  ['BomberWorldRuntime.supplyAnnouncedMatchId','Room'],['BomberWorldRuntime.supplyIssuedMatchId','Room'],
  ['BomberParticipantState.frenzyLife','Room'],['BomberParticipantState.frenzyUntilTick','Room'],['BomberBombState.frenzy','Aoi'],
 ]);
 for(const field of fields){
  assert.equal(field.shape.authority,'Server');assert.equal(field.shape.scope,synced.get(field.value)??'None');
  for(const side of ['server','client'])assert.deepEqual(field.shape.serialization[side],
   {capturePersist:true,captureSync:synced.has(field.value),restorePersist:true});
 }
 assert.equal(fields.filter(i=>i.kind==='container').length,27);
 for(const field of fields.filter(i=>i.kind==='container'))assert.equal(field.shape.maxCapacity,
  field.value==='BomberParticipantState.frenzyBombPromises'?6:1);
 const changed=observed.identities.filter(i=>before.has(key(i))&&i.kind==='container'&&
  before.get(key(i)).shape.maxCapacity!==i.shape.maxCapacity);
 assert.equal(changed.length,58);
 for(const field of changed)assert.equal(field.shape.maxCapacity,field.value.startsWith('BomberResults.')?32:16);
 assert.equal(added.filter(i=>i.kind==='component').length,2);
 assert.ok(added.some(i=>i.kind==='component-slot'&&i.owner.endsWith('.BomberParticipantEntity')&&i.shape.component.endsWith('.BomberFireFacts')&&i.value===6));
 assert.ok(added.some(i=>i.kind==='entity-wire'&&i.value==='bomberIceBridge'));
 assert.deepEqual(added.filter(i=>i.kind==='effect-type').map(i=>i.value),[10110,10111]);
});
