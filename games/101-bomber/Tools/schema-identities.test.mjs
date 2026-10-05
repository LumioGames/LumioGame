import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,unlink} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve,dirname,relative,sep} from 'node:path';
import {readObservation,readObservationInputs,observeSnapshot,tokenize,assertInputsUnchanged} from './schema-identity-read.mjs';
import {identityKey,validateLedger,compareHistory,compareObserved,audit} from './schema-identity-model.mjs';
import {BOOTSTRAP_REF,LEDGER_PATH,readBootstrap,readBaseline,hash} from './schema-identity-history.mjs';
import {LOCAL_HISTORY_SNAPSHOTS} from './schema-identity-local-history.mjs';
import {loadTestLedger,materializeTestLedger,writeTestLedger} from './schema-identity-test-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const ledger=loadTestLedger(join(root,'Gameplay/Compatibility/schema-identities.json'));
const observed=await readObservation(root);
const files=await readObservationInputs(root);
const counts=kind=>observed.identities.filter(i=>i.kind===kind).length;
const mutate=(path,from,to)=>{const changed=new Map(files);const text=files.get(path).toString();assert.ok(text.includes(from),`Fixture mutation must apply: ${path}`);changed.set(path,Buffer.from(text.replace(from,to)));return changed;};
const badRead=changed=>assert.throws(()=>observeSnapshot(changed),e=>e.code==='unsupported_source_shape'&&!!e.path&&!!e.member);
test('current declaration/generated inventory exactly matches reviewed draft without claiming freeze',()=>{
  assert.deepEqual(observed.identities,ledger.active);
  assert.deepEqual(validateLedger(ledger),[]);
  assert.equal(ledger.freezeEligible,false);
  assert.equal(counts('effect-type'),11);
  assert.equal(counts('ability'),7);
  assert.equal(counts('event'),60);
  assert.equal(counts('event-type'),75);
  assert.deepEqual(['Typed','Derived','Excluded'].map(k=>ledger.active.filter(i=>i.kind==='event'&&i.shape.catalogKind===k).length),[44,14,2]);
});
test('server-only state and Identity partial projection remain explicit',()=>{
  const field=key=>ledger.active.find(i=>i.value===key);
  assert.equal(field('IdentityComponent.accountId').shape.clientOrdinal,null);
  assert.equal(field('IdentityComponent.name').shape.ordinal,1);
  assert.equal(field('IdentityComponent.name').shape.clientOrdinal,0);
  const hidden=field('BomberBombState.hitParticipants');
  assert.equal(hidden.shape.scope,'None');assert.equal(hidden.kind,'container');assert.equal(hidden.shape.ordinal,31);assert.equal(hidden.shape.maxCapacity,16);
  assert.equal(hidden.shape.serialization.server.capturePersist,true);
  assert.equal(hidden.shape.serialization.server.captureSync,false);
});
test('uint codec repair is observed while wider B135 gate remains explicit',()=>{
  const field=ledger.active.find(i=>i.value==='BomberSkillState.characterId');
  assert.equal(field.shape.wireType,'u32');
  for(const side of ['server','client']) assert.deepEqual(field.shape.serialization[side],{capturePersist:true,captureSync:true,restorePersist:true});
  assert.ok(ledger.pending.some(p=>p.domain==='B135'));
});
test('presentation journal appends room entries and bomb placement state without moving prior identities',()=>{
  const journal=ledger.active.find(i=>i.kind==='container'&&i.value==='BomberPresentationJournal.entries');
  assert.equal(journal.shape.elementType,'System.String');
  assert.equal(journal.shape.scope,'Room');
  assert.equal(journal.shape.authority,'Server');
  assert.equal(journal.shape.persistence,'persistent');
  assert.equal(journal.shape.ordinal,0);assert.equal(journal.shape.maxCapacity,128);
  const slots=ledger.active.filter(i=>i.kind==='component-slot'&&i.owner.endsWith('.WorldEntity'));
  assert.equal(slots.at(-1).shape.component,'Lumio.Bomber.Gameplay.Contracts.Components.BomberPresentationJournal');
  assert.equal(slots.at(-1).value,7);
  const fields=ledger.active.filter(i=>i.kind==='scalar'&&i.owner.endsWith('.BomberBombState'));
  const placement=fields.find(i=>i.value==='BomberBombState.placementRecorded');
  assert.equal(placement.shape.ordinal,22);
  assert.equal(placement.shape.scope,'None');
  assert.deepEqual(placement.shape.serialization.server,{capturePersist:true,captureSync:false,restorePersist:true});
  assert.equal(fields.find(i=>i.value==='BomberBombState.placedAtTick').shape.ordinal,21);
  assert.equal(fields.find(i=>i.value==='BomberBombState.power').shape.ordinal,4);
  assert.equal(fields.find(i=>i.value==='BomberBombState.capacityReturned').shape.ordinal,20);
  assert.equal(ledger.active.some(i=>i.kind==='event-type'&&i.value.endsWith('.BomberPresentationOccurrence')),false);
});
test('lexing ignores comments but preserves string content and rejects unsupported syntax',()=>{
  assert.deepEqual(tokenize('// Sync<uint> fake\n /* hi */ public string Name = "/* not comment */";'),['public','string','Name','=','"/* not comment */"',';']);
  assert.throws(()=>tokenize('public class X {'),/unbalanced/);
  assert.throws(()=>tokenize('#if SERVER\npublic class X {}'),/unsupported_source_shape/);
});

test('placement reservations persist privately without moving existing world ordinals',()=>{
  const field=name=>ledger.active.find(i=>i.value===`BomberWorldRuntime.${name}`);
  assert.equal(field('nextVoxelTransactionSequence').shape.ordinal,3);
  for(const [name,ordinal] of [['bombPlacementTick',4],['bombPlacementMatchId',5]]) {
    const entry=field(name);
    assert.equal(entry.kind,'scalar');
    assert.equal(entry.shape.ordinal,ordinal);
    assert.equal(entry.shape.scope,'None');
    assert.equal(entry.shape.authority,'Server');
    assert.deepEqual(entry.shape.serialization.server,{capturePersist:true,captureSync:false,restorePersist:true});
  }
  for(const [name,type] of [['bombPlacementCells','System.Int32'],['bombPlacementParticipants','Lumio.GameRuntime.Ecs.NetEntityId']]) {
    const entry=field(name);
    assert.equal(entry.kind,'container');
    assert.equal(entry.shape.elementType,type);
    assert.equal(entry.shape.scope,'None');
    assert.equal(entry.shape.authority,'Server');
    assert.equal(entry.shape.persistence,'persistent');
    assert.deepEqual(entry.shape.serialization.server,{capturePersist:true,captureSync:false,restorePersist:true});
  }
});
test('unrecognized Sync syntax cannot silently disappear',()=>{
  badRead(mutate('Gameplay/Components/Bomber/BomberPlayerState.cs','Sync<int>','Sync<long>'));
  badRead(mutate('Gameplay/Components/Bomber/BomberPlayerState.cs','public Sync<int>','public readonly Sync<int>'));
  badRead(mutate('Gameplay/Components/Bomber/BomberPlayerState.cs','[EcsComponent]','[EcsComponentAttribute]'));
});
test('pickup reclaim exclusion appends private persisted exact-life identity',()=>{
  const field=name=>ledger.active.find(i=>i.value===`BomberPickupItem.${name}`);
  assert.equal(field('claimedBy').shape.ordinal,11);
  for(const [name,ordinal,type] of [['excludedLife',12,'net-entity-id'],['excludedLifeGeneration',13,'u64']]) {
    const entry=field(name);
    assert.equal(entry.kind,'scalar');
    assert.equal(entry.shape.ordinal,ordinal);
    assert.equal(entry.shape.wireType,type);
    assert.equal(entry.shape.scope,'None');
    assert.equal(entry.shape.authority,'Server');
    for(const side of ['server','client'])
      assert.deepEqual(entry.shape.serialization[side],{capturePersist:true,captureSync:false,restorePersist:true});
  }
});
test('stale field keys, ordinals, types, metadata and serialization fail',()=>{
  const path='Gameplay/generated/server/BomberPlayerState.g.cs';
  badRead(mutate(path,'"BomberPlayerState.lifePhase"','"BomberPlayerState.unknown"'));
  badRead(mutate(path,'this, 0,','this, 1,'));
  badRead(mutate(path,'OnLifePhaseChanging(int old','OnLifePhaseChanging(long old'));
  badRead(mutate(path,'writer.WriteInt32("BomberPlayerState.lifePhase", LifePhase.Value);',''));
  badRead(mutate(path,'writer.WriteInt32("BomberPlayerState.lifePhase", LifePhase.Value);','writer.WriteUInt64("BomberPlayerState.lifePhase", LifePhase.Value);'));
  badRead(mutate('Gameplay/generated/client/Lumio.Bomber.Gameplay.Registry.g.cs','"BomberPlayerState.lifePhase", "i32"','"BomberPlayerState.lifePhase", "u64"'));
});
test('entity order and both registry paths must agree',()=>{
  badRead(mutate('Gameplay/EntityTypes/PlayerEntity.cs','[Has(typeof(IdentityComponent))]','[Has(typeof(BomberPlayerState))]'));
  badRead(mutate('Gameplay/generated/client/PlayerEntity.Template.g.cs','new IdentityComponent()','new LogicTransform()'));
  badRead(mutate('Gameplay/generated/server/Lumio.Bomber.Gameplay.Registry.g.cs','"BomberBombEntity", StringComparison.Ordinal','"AnotherAlias", StringComparison.Ordinal'));
});
test('ability annotation, constant and exact generated dispatch are independently reconciled',()=>{
  badRead(mutate('Gameplay/Abilities/MoveAbility.cs','public const uint TypeId = 1u;','public const uint TypeId = 7u;'));
  badRead(mutate('Gameplay/generated/client/GeneratedAbilityRegistry.g.cs','return 1u;','return 7u;'));
  badRead(mutate('Gameplay/generated/client/GeneratedAbilityRegistry.g.cs','return 0u;','return abilityType.Name switch { _ => 0u };'));
  badRead(mutate('Gameplay/generated/server/GeneratedAbilityRegistry.g.cs','GasTypeRegistry registry','object registry'));
  badRead(mutate('Gameplay/generated/server/GeneratedAbilityRegistry.g.cs','registry.RegisterAbility<','other.RegisterAbility<'));
});
test('side-only ability methods require an unannotated partial of a declared ability',()=>{
  const path='Gameplay/Abilities/PickupAbility.Server.cs';
  badRead(mutate(path,'partial class PickupAbility','partial class UnknownAbility'));
  badRead(mutate(path,'partial class PickupAbility','class PickupAbility'));
  badRead(mutate(path,'public sealed partial class PickupAbility','[AbilityType(3u, Prediction = PredictionKind.AuthorityOnly)]\npublic sealed partial class PickupAbility'));
  const extra=new Map(files);
  extra.set('Gameplay/Abilities/UnknownAbility.Server.cs',files.get(path));
  badRead(extra);
});
test('generated partial ability glue cannot hide fields, operations or missing sides',()=>{
  for(const side of ['server','client']) {
    const path=`Gameplay/generated/${side}/PickupAbility.g.cs`;
    badRead(mutate(path,'return null;','return "hidden-field";'));
    badRead(mutate(path,'return false;','return true;'));
    const missing=new Map(files);missing.delete(path);badRead(missing);
  }
});
test('event schemas retain nullability, ordered fields, nested records and enum mappings',()=>{
  const source=ledger.active.find(i=>i.kind==='event-type'&&i.value.endsWith('.BomberSource'));
  assert.deepEqual(source.shape.fields.map(f=>[f.name,f.nullable]),[['Actor',true],['Entity',true],['Bomb',true],['SkillId',true],['SkillLevel',true],['ChainId',true]]);
  const direction=ledger.active.find(i=>i.kind==='event-type'&&i.value.endsWith('.BomberDirection'));
  assert.deepEqual(direction.shape.values,[{name:'None',value:0},{name:'Up',value:1},{name:'Right',value:2},{name:'Down',value:3},{name:'Left',value:4}]);
  badRead(mutate('Gameplay/Events/BomberEvents.cs','ulong Seed, string ConfigHash','Guid Seed, string ConfigHash'));
  const extra=new Map(files);extra.set('Gameplay/Events/Extra.cs',Buffer.from('namespace Lumio.Bomber.Gameplay.Contracts.Events; public readonly record struct Forgotten(int Value);'));badRead(extra);
});
test('new generated files and unexpected effect/tag declarations fail coverage',()=>{
  const extra=new Map(files);extra.set('Gameplay/generated/server/Forgotten.g.cs',Buffer.from('namespace X; public class Forgotten {}'));badRead(extra);
  badRead(mutate('Gameplay/Abilities/MoveAbility.cs','[AbilityType(1u','[EffectType(1u'));
  const tag=new Map(files);tag.set('Gameplay/TagComponent.cs',Buffer.from('namespace X; public class TagComponent {}'));badRead(tag);
  const missing=new Map(files);missing.delete('Gameplay/generated/client/BomberResults.g.cs');badRead(missing);
  badRead(mutate('Gameplay/Abilities/MoveAbility.cs','[AbilityType(1u','[TagId(17u)]\n[AbilityType(1u'));
});
test('a table row number cannot allocate a GAS EffectType in the candidate ledger',()=>{
  const candidate=structuredClone(ledger);
  const effect={kind:'effect-type',scope:'101-bomber/effect-type',value:17,owner:'TestOnly.TableRow',shape:{schema:ledger.schema,id:17},evidence:[{repo:'LumioGame',revision:'sha256:'+'a'.repeat(64),path:'games/101-bomber/Gameplay/Tables/test-only-effects.csv'}]};
  candidate.active.push(effect);
  assert.ok(validateLedger(candidate).some(d=>d.code==='invalid_shape'&&d.identity===identityKey(effect)));
  assert.ok(audit({baseline:ledger,candidate,observed}).diagnostics.some(d=>d.code==='invalid_shape'&&d.identity===identityKey(effect)));
  assert.equal(observed.files.some(f=>f.path.startsWith('Gameplay/Tables/')),false);
});
test('Effect allocation records complete typed parameter and fact shape',()=>{
  assert.deepEqual(ledger.active.filter(i=>i.kind==='effect-type').map(i=>i.value),[10101,10102,10103,10104,10105,10106,10107,10108,10109,10110,10111]);
  const damage=ledger.active.find(i=>i.kind==='effect-type'&&i.value===10101);
  assert.deepEqual(damage.shape.fields.map(f=>[f.id,f.name,f.clrType]),[
    [1,'Points','System.Int64'],[2,'Fx','System.String'],[3,'BombId','Lumio.GameRuntime.Ecs.NetEntityId'],
    [4,'Row','System.Int32'],[5,'MatchId','System.UInt64'],[6,'Participant','Lumio.GameRuntime.Ecs.NetEntityId'],
    [7,'Life','Lumio.GameRuntime.Ecs.NetEntityId'],[8,'Generation','System.UInt64'],
    [9,'SourceParticipant','Lumio.GameRuntime.Ecs.NetEntityId'],[10,'SourceLife','Lumio.GameRuntime.Ecs.NetEntityId'],
    [11,'SourceGeneration','System.UInt64'],[12,'Family','System.Int32'],[13,'ChainId','System.UInt64'],
    [14,'X','System.Int32'],[15,'Z','System.Int32'],[16,'Cause','System.Int32']]);
  assert.deepEqual(damage.shape.fact,{name:'bomber.damage',sourceFieldId:3,targetFieldId:4});
  assert.equal(ledger.pending.some(p=>p.domain==='effect-type'),false);
});
test('Effect source, both registries, codecs, reducer plans and glue reject drift',()=>{
  badRead(mutate('Gameplay/Effects/BomberDamageEffect.cs','[EffectField(16)] public int Cause;','[EffectField(17)] public int Cause;'));
  badRead(mutate('Gameplay/Effects/BomberHealEffect.cs','[EffectFact("bomber.health", 3, 4)]','[EffectFact("bomber.other", 3, 4)]'));
  badRead(mutate('Gameplay/generated/server/GeneratedEffectRegistry.g.cs','return 10101u;','return 10103u;'));
  badRead(mutate('Gameplay/generated/server/GeneratedEffectCodecs.g.cs','public uint TypeId => 10101u;','public uint TypeId => 10103u;'));
  badRead(mutate('Gameplay/generated/server/GeneratedEffectReducers.g.cs','RegisterAll(GasWorldContext context)','RegisterAll(object context)'));
  badRead(mutate('Gameplay/BomberSettlementReducer.Server.cs','MaxWrites = 3600','MaxWrites = 3601'));
  badRead(mutate('Gameplay/generated/client/GeneratedEffectRegistry.g.cs','return 0u;','return 10101u;'));
  badRead(mutate('Gameplay/generated/server/BomberDamageEffect.g.cs','return false;','return true;'));
  const missing=new Map(files);missing.delete('Gameplay/generated/server/GeneratedEffectCodecs.g.cs');badRead(missing);
  const extra=new Map(files);extra.set('Gameplay/Effects/UnreviewedEffect.cs',Buffer.from('namespace X; [EffectType(17u)] public class UnreviewedEffect {}'));badRead(extra);
  const changed=structuredClone(ledger);changed.active.find(i=>i.kind==='effect-type').shape.fields[0].clrType='System.UInt32';
  assert.ok(validateLedger(changed).some(d=>d.code==='invalid_shape'));
});
test('typed fact rows reject changed selectors, payload mapping and ownership',()=>{
  badRead(mutate('Gameplay/Components/Bomber/BomberDamageFacts.cs','[EffectRowColumn("captured", Selector = 9, PayloadFieldId = 16)]','[EffectRowColumn("captured", Selector = 9, PayloadFieldId = 15)]'));
  badRead(mutate('Gameplay/Components/Bomber/BomberHealthFacts.cs','[EffectRowColumn("captured", Selector = 3)]','[EffectRowColumn("captured", Selector = 2)]'));
  badRead(mutate('Gameplay/Components/Bomber/BomberDamageFacts.cs','typeof(BomberBombEntity)','typeof(PlayerEntity)'));
});
test('hash gate rejects changed bytes, additions and removals',()=>{
  const first=new Map([['a',Buffer.from('original')]]);
  assert.doesNotThrow(()=>assertInputsUnchanged(first,new Map(first)));
  for(const next of [new Map([['a',Buffer.from('changed')]]),new Map(),new Map([...first,['b',Buffer.from('extra')]])]) assert.throws(()=>assertInputsUnchanged(first,next),e=>e.code==='input_changed');
});
test('model rejects unknown properties, wrong value types, scope evasion and missing evidence',()=>{
  for(const mutation of [l=>l.active[0].shape.unknown=1,l=>l.active[0].value=1,l=>l.active[0].scope+='-renamed',l=>l.active[0].evidence=[],l=>l.formatVersion=2,l=>l.freezeEligible=true,l=>l.active.push(l.active[0]),l=>l.pending=l.pending.filter(p=>p.domain!=='tag')]) {
    const changed=structuredClone(ledger);mutation(changed);assert.notEqual(validateLedger(changed).length,0);
  }
});
test('malformed ledger JSON returns diagnostics without throwing',()=>{
  for(const value of [null,[],{},0,'wrong']) assert.ok(validateLedger(value).length);
  for(const mutation of [l=>l.active=[null],l=>l.pending=[null],l=>l.transitions=[null],l=>l.retired=[null],l=>l.active.find(i=>i.kind==='scalar').shape.key=5,l=>l.retired[0].identity.evidence=null]) {
    const changed=structuredClone(ledger);mutation(changed);assert.ok(validateLedger(changed).length);
  }
});
test('retirement preserves exact historical slots and serialization discrepancies',()=>{
  const explosion=ledger.retired.find(r=>r.identity.kind==='component-slot'&&r.identity.owner.endsWith('.BomberExplosionCellEntity'));
  assert.equal(explosion.identity.value,0);assert.equal(explosion.identity.shape.slotEvidence,'creation-array');
  const oldCell=ledger.retired.find(r=>r.identity.value==='BomberExplosionCell.cellX');
  assert.equal(oldCell.identity.shape.ordinal,2);assert.equal(oldCell.identity.shape.serialization.server.capturePersist,false);
  assert.equal(oldCell.identity.shape.wireType,'i32');
  assert.ok(ledger.retired.some(r=>r.identity.value==='BomberHatPile.cellZ'&&r.identity.shape.ordinal===3));
  const changed=structuredClone(ledger);changed.retired.find(r=>r.replacement).replacement='unknown';
  assert.ok(validateLedger(changed).some(d=>d.code==='missing_replacement'));
});
test('canonical JSON identity keys preserve value type and separators',()=>{
  assert.notEqual(identityKey({kind:'ability',scope:'a/b',value:1}),identityKey({kind:'ability',scope:'a/b',value:'1'}));
  assert.notEqual(identityKey({kind:'a',scope:'b/c',value:'d'}),identityKey({kind:'a/b',scope:'c',value:'d'}));
});
test('B160: Identity partial rejects every extra Sync-family field',()=>{
  const path='Gameplay/Components/Identity/IdentityComponent.Server.cs';
  for(const type of ['SyncList<int>','SyncDict<int, int>','SyncSet<int>','SyncFuture<int>']) {
    badRead(mutate(path,'public Sync<string> AccountId = new(Scope.None);',`public Sync<string> AccountId = new(Scope.None); public ${type} Hidden = new(Scope.None, Authority.Server);`));
  }
});
test('B159: complete WireName rejects an early hijacked executable branch on either side',()=>{
  for(const side of ['server','client']) badRead(mutate(`Gameplay/generated/${side}/Lumio.Bomber.Gameplay.Registry.g.cs`,'public override string WireName(Type entityType)\r\n    {','public override string WireName(Type entityType)\r\n    {\r\n        if (entityType == typeof(BomberBombEntity)) return "hijacked";'));
});
test('B159: complete Effect registry rejects extra dispatch or registration',()=>{
  for(const side of ['server','client']) {
    const path=`Gameplay/generated/${side}/GeneratedEffectRegistry.g.cs`;
    badRead(mutate(path,'return 0u;','if (effectType.Name == "NewEffect") return 17u; return 0u;'));
    badRead(mutate(path,'public static uint TypeIdOf(Type effectType)','public static void Allocate() { Register(17u); }\r\n    public static uint TypeIdOf(Type effectType)'));
    badRead(mutate(path,'GasTypeRegistry registry','object registry'));
  }
});
test('World-local registration rejects altered control flow on both sides',()=>{
  for(const side of ['server','client']) {
    const path=`Gameplay/generated/${side}/Lumio.Bomber.Gameplay.Registry.g.cs`;
    badRead(mutate(path,'GeneratedAbilityRegistry.RegisterAll(context.Types);','GeneratedAbilityRegistry.RegisterAll(other.Types);'));
    badRead(mutate(path,'GeneratedEffectRegistry.RegisterAll(context.Types);','GeneratedEffectRegistry.RegisterAll(context.Types); GeneratedEffectRegistry.RegisterAll(context.Types);'));
    badRead(mutate(path,'new GasWorldContext(world)','new GasWorldContext(other)'));
    badRead(mutate(path,'public static void RegisterGasTypes(GasWorldContext context)','private static void RegisterGasTypes(GasWorldContext context)'));
    badRead(mutate(path,'static GeneratedRegistry()\r\n    {\r\n    }','static GeneratedRegistry()\r\n    {\r\n        HiddenRegister();\r\n    }'));
  }
});
const reviewedV004 = {
  version:'0.0.4-main.54930d9',
  engine:'54930d947a4432e83a45fa5215e38dc08aee12f5',
  runtime:'d287bcd009a740de45fb279f26aa145ea1d200d5',
};
function manifestInputs(manifest) {
  const changed=new Map(files);
  const original=files.get('Engine/manifest.json');
  changed.set('Engine/manifest.json',JSON.stringify(manifest)===JSON.stringify(JSON.parse(original))?original:Buffer.from(JSON.stringify(manifest)));
  return changed;
}
function v004Manifest() {
  const manifest=JSON.parse(files.get('Engine/manifest.json'));
  manifest.version=reviewedV004.version;
  manifest.sources.LumioGameEngine=reviewedV004.engine;
  manifest.sources.LumioGameRuntime=reviewedV004.runtime;
  return manifest;
}
test('current reviewed SDK provenance preserves the complete generated identity inventory',()=>{
  const inputs=new Map(files);
  const manifest=JSON.parse(inputs.get('Engine/manifest.json'));
  const candidate=observeSnapshot(inputs);
  const expected=structuredClone(observed.identities);
  const external=expected.filter(i=>i.kind==='component'&&i.shape.origin.kind==='external');
  assert.equal(external.length,6);
  for(const identity of external) {
    Object.assign(identity.shape.origin,{engineRevision:manifest.sources.LumioGameEngine,runtimeRevision:manifest.sources.LumioGameRuntime,package:manifest.version});
    identity.evidence=[{repo:'LumioGame',revision:`sha256:${hash(inputs.get('Engine/manifest.json'))}`,path:'games/101-bomber/Engine/manifest.json'}];
  }
  assert.equal(candidate.length,observed.identities.length);
  assert.deepEqual(candidate,expected);
  badRead(manifestInputs(v004Manifest()));
});
test('unreviewed and mixed manifest provenance cannot enter observation',()=>{
  for(const base of [JSON.parse(files.get('Engine/manifest.json')),v004Manifest()]) {
    for(const change of [
      manifest=>{manifest.sources.LumioGameEngine='0'.repeat(40);},
      manifest=>{manifest.sources.LumioGameRuntime='0'.repeat(40);},
      manifest=>{manifest.version='0.0.4-unreviewed';},
      manifest=>{manifest.version=reviewedV004.version;manifest.sources.LumioGameEngine='3c5ac27af94e8b48a47c5fc48fe5d5e661413346';},
      manifest=>{manifest.version=reviewedV004.version;manifest.sources.LumioGameRuntime='86e2d4f0e403b5d39c32035d711dcef0e0035fe5';},
      manifest=>{manifest.version='0.0.2-main.3c5ac27';manifest.sources.LumioGameEngine=reviewedV004.engine;manifest.sources.LumioGameRuntime=reviewedV004.runtime;},
    ]) {
      const manifest=structuredClone(base);
      change(manifest);
      assert.notDeepEqual(manifest,base);
      badRead(manifestInputs(manifest));
    }
  }
});
test('only external origin package provenance can refresh within one schema',()=>{
  const prior=structuredClone(ledger),candidate=structuredClone(ledger);
  const external=candidate.active.find(i=>i.kind==='component'&&i.shape.origin.kind==='external');
  external.shape.origin.package='0.0.1-main.reviewed';
  assert.deepEqual(compareHistory(prior,candidate),[]);
  assert.ok(compareObserved(candidate,observed).some(d=>d.code==='observed_shape_mismatch'));
  for(const change of [
    i=>i.shape.origin.assembly='Other.Assembly',
    i=>i.shape.clrType='Other.Component',
    i=>i.owner='Other.Component',
  ]) {
    const changed=structuredClone(ledger);change(changed.active.find(i=>i.kind==='component'&&i.shape.origin.kind==='external'));
    assert.ok(compareHistory(ledger,changed).some(d=>['identity_shape_changed','missing_prior_shape_retirement'].includes(d.code)));
  }
  const game=structuredClone(ledger);game.active.find(i=>i.kind==='component'&&i.shape.origin.kind==='game').shape.origin.assembly='Other.Game';
  assert.ok(compareHistory(ledger,game).some(d=>d.code==='identity_shape_changed'));
});
test('B161: a redirected replacement cannot release a reserved continuity wire',()=>{
  const changed=structuredClone(ledger);
  const bomb=changed.active.find(i=>i.kind==='entity-wire'&&i.value==='bomberBomb');
  for(const r of changed.retired.filter(r=>r.identity.kind==='entity-wire'&&r.identity.value==='bomberHatPile')) r.replacement=identityKey(bomb);
  const reused=structuredClone(bomb);reused.value='bomberHatPile';reused.owner='Lumio.Bomber.Gameplay.EntityTypes.UnrelatedEntity';reused.shape.clrType=reused.owner;reused.shape.wire=reused.value;reused.shape.aliases=['UnrelatedEntity'];changed.active.push(reused);
  assert.ok(validateLedger(changed).some(d=>d.code==='identity_owner_changed'));
});
test('B161: replacements must retain kind',()=>{
  const wrongKind=structuredClone(ledger);
  const retirement=wrongKind.retired.find(r=>r.identity.kind==='scalar'&&r.retiredIn===wrongKind.schema&&r.replacement);
  assert.ok(retirement,'Cross-kind negative must reference the candidate destination schema');
  retirement.replacement=identityKey(wrongKind.active.find(i=>i.kind==='ability'));
  assert.ok(validateLedger(wrongKind).some(d=>d.code==='incompatible_replacement'));
});
test('B161: retirement must name its recorded transition even without a replacement',()=>{
  for(const replacement of [null,'keep']) {
    const changed=structuredClone(ledger);const retired=changed.retired.find(r=>replacement===null?r.replacement===null:!!r.replacement);
    retired.retiredIn='unrelated-schema';
    assert.ok(validateLedger(changed).some(d=>d.code==='invalid_retirement_schema'));
  }
});
test('B162: prototype property names are unsupported JSON kinds, never executable validators',()=>{
  for(const kind of ['__proto__','constructor','toString','hasOwnProperty',null,17,[],{toString:null,valueOf:null}]) {
    const changed=structuredClone(ledger);changed.active[0].kind=kind;
    assert.ok(validateLedger(changed).some(d=>d.code==='invalid_identity'));
  }
});

test('history requires an exact prior-shape retirement even when source and ledger agree on removal',()=>{
  const candidate=structuredClone(ledger),removed=candidate.active.find(i=>i.kind==='ability');
  candidate.active=candidate.active.filter(i=>i!==removed);
  const observation={...observed,identities:candidate.active};
  assert.deepEqual(compareObserved(candidate,observation),[]);
  assert.ok(audit({baseline:ledger,candidate,observed:observation}).diagnostics.some(d=>d.identity===identityKey(removed)&&d.code==='missing_prior_shape_retirement'));
  candidate.retired.push({identity:removed,retiredIn:candidate.schema,reason:'Explicit removal',replacement:null});
  candidate.transitions.push({from:candidate.schema,to:candidate.schema,breaking:true,reason:'Reserve a removed identity without reassigning it',releaseDecision:null});
  assert.ok(audit({baseline:ledger,candidate,observed:observation}).diagnostics.some(d=>d.code==='invalid_transition'));
  assert.deepEqual(compareHistory(ledger,candidate),[]);
  candidate.retired.at(-1).identity.evidence[0].revision='sha256:'+'a'.repeat(64);
  assert.ok(compareHistory(ledger,candidate).some(d=>d.code==='missing_prior_shape_retirement'));
});
test('history preserves every prior tombstone including reason, evidence and replacement',()=>{
  for(const change of [c=>c.retired.shift(),c=>c.retired[0].reason+=' edited',c=>c.retired[0].identity.evidence.pop(),c=>c.retired[0].replacement=null]) {
    const candidate=structuredClone(ledger);change(candidate);
    assert.ok(compareHistory(ledger,candidate).some(d=>['missing_retirement','retirement_changed'].includes(d.code)));
  }
});
test('same-schema shape changes and ordinal reassignment are never waived by transitions',()=>{
  const prior=structuredClone(ledger),candidate=structuredClone(ledger);
  const old=prior.active.find(i=>i.kind==='scalar'&&i.shape.clrType==='System.Int32'),changed=candidate.active.find(i=>identityKey(i)===identityKey(old));
  changed.shape.clrType='System.UInt64';changed.shape.wireType='u64';
  candidate.retired.push({identity:old,retiredIn:candidate.schema,reason:'Attempt to waive',replacement:identityKey(changed)});
  candidate.transitions.push({from:prior.schema,to:candidate.schema,breaking:true,reason:'Attempt to waive',releaseDecision:null});
  assert.ok(compareHistory(prior,candidate).some(d=>d.code==='identity_shape_changed'));
  changed.shape.key+='Renamed';changed.value=changed.shape.key;changed.shape.member+='Renamed';
  assert.ok(compareHistory(prior,candidate).some(d=>d.code==='ordinal_reassigned'));
});
test('reserved historical continuity cannot be revived through a migrated owner or redirected replacement',()=>{
  const candidate=structuredClone(ledger);
  const old=candidate.retired.find(r=>r.identity.value==='BomberHatPile.count');
  const reused=structuredClone(old.identity);reused.owner=reused.owner.replace('Lumio.Game.ServerGameplay.Bomber.Contracts.','Lumio.Bomber.Gameplay.Contracts.');reused.scope='101-bomber/fields/'+reused.owner;reused.shape.schema=candidate.schema;
  candidate.active.push(reused);
  assert.ok(compareHistory(ledger,candidate).some(d=>d.code==='reserved_identity_reused'));
});
test('current observation checks additions, removals, shapes and input evidence',()=>{
  for(const [change,code] of [
    [o=>o.identities.shift(),'ledger_only_identity'],
    [o=>{const i=structuredClone(o.identities.find(i=>i.kind==='ability'));i.value=99;i.shape.id=99;o.identities.push(i);},'unrecorded_identity'],
    [o=>o.identities[0].owner+='Changed','observed_shape_mismatch'],
    [o=>o.identities[0].evidence[0].revision='sha256:'+'f'.repeat(64),'observed_evidence_mismatch'],
  ]) {const o=structuredClone(observed);change(o);assert.ok(compareObserved(ledger,o).some(d=>d.code===code));}
});
test('B167: candidate revision headers must agree with independently observed external origins',()=>{
  const actualOrigins=observed.identities.filter(i=>i.kind==='component'&&i.shape.origin.kind==='external').map(i=>i.shape.origin);
  assert.ok(actualOrigins.length>0);
  assert.ok(actualOrigins.every(o=>o.engineRevision===ledger.engineRevision&&o.runtimeRevision===ledger.runtimeRevision));
  for(const [field,revision] of [['engineRevision','0'.repeat(40)],['runtimeRevision','1'.repeat(40)]]) {
    const candidate=structuredClone(ledger);candidate[field]=revision;
    const result=audit({baseline:ledger,candidate,observed});
    assert.ok(result.diagnostics.some(d=>d.code==='observed_provenance_mismatch'&&d.identity===field),JSON.stringify(result.diagnostics));
    assert.equal(result.supportedInventoryConsistent,false);
  }
  const missing=structuredClone(observed);
  missing.identities=missing.identities.filter(i=>i.kind!=='component'||i.shape.origin.kind!=='external');
  assert.ok(audit({baseline:ledger,candidate:ledger,observed:missing}).diagnostics.some(d=>d.code==='missing_observed_provenance'));
});
test('ability collision and declaration/catalog disagreement cannot allocate a second TypeId 1',()=>{
  const candidate=structuredClone(ledger);
  const move=candidate.active.find(i=>i.kind==='ability'&&i.value===1);
  const other=structuredClone(candidate.active.find(i=>i.kind==='ability'&&i.value===5));
  other.value=1;other.shape.id=1;candidate.active.push(other);
  assert.ok(validateLedger(candidate).some(d=>d.code==='duplicate_identity'&&d.identity===identityKey(move)));
  badRead(mutate('Gameplay/Abilities/SelectCharacterAbility.cs','[AbilityType(5u','[AbilityType(1u'));
  badRead(mutate('Gameplay/generated/server/GeneratedAbilityRegistry.g.cs','return 5u;','return 1u;'));
});
test('client generated ordinal/type and entity string overload drift fail at the actual parser',()=>{
  const field='Gameplay/generated/client/BomberPlayerState.g.cs';
  badRead(mutate(field,'this, 0,','this, 1,'));
  badRead(mutate(field,'OnLifePhaseChanging(int old','OnLifePhaseChanging(long old'));
  const registry='Gameplay/generated/server/Lumio.Bomber.Gameplay.Registry.g.cs';
  const original=files.get(registry).toString();
  const match=original.match(/if \(string\.Equals\(componentName, "IdentityComponent", StringComparison\.Ordinal\)\) return \d+;/);
  assert.ok(match);
  badRead(mutate(registry,match[0],match[0].replace('IdentityComponent','BomberPlayerState')));
});
test('container shape and nested event schema changes stay visible through matching candidate declarations',()=>{
  const drift=changed=>compareObserved(ledger,{schema:ledger.schema,identities:observeSnapshot(changed)}).some(d=>d.code==='observed_shape_mismatch');
  const retyped=mutate('Gameplay/Components/Bomber/BomberResults.cs','SyncList<NetEntityId> Participants','SyncList<ulong> Participants');
  badRead(retyped);
  for(const side of ['server','client']) {
    const path='Gameplay/generated/'+side+'/BomberResults.g.cs';
    retyped.set(path,Buffer.from(files.get(path).toString().replace(/^.*OnParticipants.*$/gm,line=>line.replaceAll('NetEntityId','ulong'))));
  }
  assert.ok(drift(retyped));
  const container=ledger.active.find(i=>i.kind==='container'&&i.value==='BomberResults.participants');
  const inventedOrdinal=structuredClone(ledger);
  inventedOrdinal.active.find(i=>identityKey(i)===identityKey(container)).shape.ordinal=-1;
  assert.ok(validateLedger(inventedOrdinal).some(d=>d.code==='invalid_shape'&&d.identity===identityKey(container)));
  inventedOrdinal.active.find(i=>identityKey(i)===identityKey(container)).shape.ordinal=17;
  assert.ok(compareObserved(inventedOrdinal,observed).some(d=>d.code==='observed_shape_mismatch'&&d.identity===identityKey(container)));
  assert.ok(compareHistory(ledger,inventedOrdinal).some(d=>d.code==='identity_shape_changed'&&d.identity===identityKey(container)));
  const changed=structuredClone(ledger);const entry=changed.active.find(i=>identityKey(i)===identityKey(container));
  entry.shape.clrType='SyncList<ulong>';entry.shape.elementType='System.UInt64';
  assert.ok(compareHistory(ledger,changed).some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(container)));
  const values='Gameplay/Events/BomberEventValues.cs';
  assert.ok(drift(mutate(values,'NetEntityId Life, ulong LifeGeneration','ulong Life, ulong LifeGeneration')));
  assert.ok(drift(mutate(values,'BomberActor? Actor, NetEntityId? Entity','BomberActor Actor, NetEntityId? Entity')));
  assert.ok(drift(mutate(values,'BomberItemOrigin { Brick, Chest, Death, OtherGameRule }','BomberItemOrigin { Brick, Chest = 7, Death, OtherGameRule }')));
  const eventType=ledger.active.find(i=>i.kind==='event-type'&&i.value.endsWith('.BomberActor'));
  const next=structuredClone(ledger);next.active.find(i=>identityKey(i)===identityKey(eventType)).shape.fields[1].clrType='System.UInt64';
  assert.ok(compareHistory(ledger,next).some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(eventType)));
});
test('three HatPile layouts preserve each recorded ordinal and a transition cannot erase an old shape',()=>{
  const retired=ledger.retired.filter(r=>r.identity.value==='BomberHatPile.expireAtTick');
  assert.deepEqual(new Set(retired.map(r=>r.identity.shape.ordinal)),new Set([1,3,4]));
  const prior=structuredClone(ledger),next=structuredClone(ledger);
  prior.schema='bomber-v2';next.schema='bomber-v3';
  const old=prior.active.find(i=>i.kind==='event-type');
  old.shape.schema='bomber-v2';
  next.active=next.active.filter(i=>identityKey(i)!==identityKey(old));
  next.transitions.push({from:'bomber-v2',to:'bomber-v3',breaking:true,reason:'Test-only transition',releaseDecision:null});
  assert.ok(compareHistory(prior,next).some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(old)));
});
test('test-only prior slot number may recur in a distinct schema only with a breaking transition',()=>{
  const oldSchema='2'.repeat(40);
  const old=structuredClone(ledger.active.find(i=>i.kind==='component-slot'&&i.value===0&&i.owner.endsWith('.PlayerEntity')));
  old.shape.schema=oldSchema;old.scope=`101-bomber/slots/${oldSchema}/${old.owner}`;
  old.evidence=[{repo:'LumioGame',revision:oldSchema,path:'test-only/previous-slot.cs'}];
  const prior={...structuredClone(ledger),schema:oldSchema,active:[old],retired:[],transitions:[]};
  assert.deepEqual(validateLedger(prior),[]);
  const current=structuredClone(old);current.shape.schema='bomber-v3';current.scope=`101-bomber/slots/bomber-v3/${current.owner}`;
  current.shape.component='TestOnly.ReassignedComponent';current.evidence=[{repo:'LumioGame',revision:'sha256:'+'b'.repeat(64),path:'test-only/new-slot.cs'}];
  const retirement={identity:old,retiredIn:'bomber-v3',reason:'Test-only breaking slot migration',replacement:identityKey(current)};
  const transition={from:oldSchema,to:'bomber-v3',breaking:true,reason:'Test-only breaking migration',releaseDecision:null};
  const next={...structuredClone(ledger),schema:'bomber-v3',active:[current],retired:[retirement],transitions:[transition]};
  assert.deepEqual(validateLedger(next),[]);
  assert.deepEqual(compareHistory(prior,next),[]);
  const without=structuredClone(next);without.transitions=[];
  assert.ok(validateLedger(without).some(d=>d.code==='invalid_retirement_schema'));
  assert.ok(compareHistory(prior,without).some(d=>d.code==='missing_transition'));
  const samePrior=structuredClone(prior);samePrior.schema='bomber-v3';samePrior.active[0].shape.schema='bomber-v3';samePrior.active[0].scope=current.scope;
  samePrior.active[0].evidence=[{repo:'LumioGame',revision:'sha256:'+'c'.repeat(64),path:'test-only/same-schema-slot.cs'}];
  const sameNext=structuredClone(next);sameNext.retired=[{...retirement,identity:samePrior.active[0]}];
  sameNext.transitions=[{...transition,from:'bomber-v3'}];
  assert.deepEqual(validateLedger(samePrior),[]);assert.ok(validateLedger(sameNext).some(d=>d.code==='invalid_transition'));
  assert.ok(compareHistory(samePrior,sameNext).some(d=>d.code==='identity_shape_changed'));
});
test('a supported test-only prior schema retype still requires its exact old-shape retirement',()=>{
  const oldSchema='3'.repeat(40);
  const old=structuredClone(ledger.active.find(i=>i.kind==='scalar'&&i.value==='BomberPlayerState.lifePhase'));
  old.shape.schema=oldSchema;old.evidence=[{repo:'LumioGame',revision:oldSchema,path:'test-only/previous-field.cs'}];
  const prior={...structuredClone(ledger),schema:oldSchema,active:[old],retired:[],transitions:[]};
  const changed=structuredClone(old);changed.shape.schema='bomber-v3';changed.shape.clrType='System.Int64';changed.shape.wireType='i64';
  changed.evidence=[{repo:'LumioGame',revision:'sha256:'+'d'.repeat(64),path:'test-only/new-field.cs'}];
  const transition={from:oldSchema,to:'bomber-v3',breaking:true,reason:'Test-only retype',releaseDecision:null};
  const next={...structuredClone(ledger),schema:'bomber-v3',active:[changed],retired:[],transitions:[transition]};
  assert.deepEqual(validateLedger(prior),[]);assert.deepEqual(validateLedger(next),[]);
  assert.ok(compareHistory(prior,next).some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(old)));
  next.retired.push({identity:old,retiredIn:'bomber-v3',reason:'Test-only prior shape retirement',replacement:identityKey(changed)});
  assert.deepEqual(validateLedger(next),[]);assert.deepEqual(compareHistory(prior,next),[]);
});
test('coordinated component and entity removal still requires every owned prior shape retirement',()=>{
  for(const [kind,name] of [['component','BomberResults'],['entity-wire','PlayerEntity']]) {
    const candidate=structuredClone(ledger);
    const removed=candidate.active.filter(i=>kind==='component'
      ? i.owner.endsWith(`.${name}`)&&['component','scalar','container'].includes(i.kind)
      : i.owner.endsWith('.PlayerEntity')&&['entity-wire','entity-alias','component-slot'].includes(i.kind));
    assert.ok(removed.length>1,`${name} includes recursively owned identities`);
    const keys=new Set(removed.map(identityKey));candidate.active=candidate.active.filter(i=>!keys.has(identityKey(i)));
    const matching={...observed,identities:candidate.active};
    const result=audit({baseline:ledger,candidate,observed:matching});
    assert.equal(compareHistory(ledger,candidate).filter(d=>d.code==='missing_prior_shape_retirement'&&keys.has(d.identity)).length,removed.length);
    assert.ok(result.diagnostics.some(d=>['missing_prior_shape_retirement','missing_replacement'].includes(d.code)));
    assert.equal(result.supportedInventoryConsistent,false);
  }
});
test('source ordinal reorder and matching candidate still fail the independent same-schema history',()=>{
  const candidate=structuredClone(ledger);
  const fields=candidate.active.filter(i=>i.kind==='scalar'&&i.owner.endsWith('.BomberPlayerState'));
  const life=fields.find(i=>i.shape.member==='LifePhase'),participant=fields.find(i=>i.shape.member==='Participant');
  assert.equal(life.shape.ordinal,0);assert.equal(participant.shape.ordinal,1);
  [life.shape.ordinal,participant.shape.ordinal]=[participant.shape.ordinal,life.shape.ordinal];
  [life.shape.clientOrdinal,participant.shape.clientOrdinal]=[participant.shape.clientOrdinal,life.shape.clientOrdinal];
  const matching={...observed,identities:candidate.active};
  const result=audit({baseline:ledger,candidate,observed:matching});
  assert.ok(result.diagnostics.some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(life)));
  assert.ok(result.diagnostics.some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(participant)));
});
test('actual reader reconciles swapped Player declarations and both generated sides before history rejects layout drift',()=>{
  const swapPair=(value,first,second)=>{
    const start=value.indexOf(first),newline=value.slice(start+first.length).match(/^\r?\n/)?.[0];
    assert.ok(newline,`Test-only generated first line must exist: ${first}`);
    const pair=first+newline+second;
    assert.ok(value.includes(pair),`Test-only generated pair must exist: ${first}`);
    return value.replace(pair,second+newline+first);
  };
  const sourcePath='Gameplay/Components/Bomber/BomberPlayerState.cs';
  const source=files.get(sourcePath).toString();
  const first='    [Persist] public Sync<int> LifePhase = new(Scope.Aoi, Authority.Server);';
  const second='    [Persist] public Sync<NetEntityId> Participant = new(Scope.Aoi, Authority.Server);';
  const changed=new Map(files);changed.set(sourcePath,Buffer.from(swapPair(source,first,second)));
  for(const side of ['server','client']) {
    const path=`Gameplay/generated/${side}/BomberPlayerState.g.cs`;
    let text=files.get(path).toString();
    const boundLife='        LifePhase = LifePhase.Bound(host, this, 0, "BomberPlayerState.lifePhase");';
    const boundParticipant='        Participant = Participant.Bound(host, this, 1, "BomberPlayerState.participant");';
    text=swapPair(text,boundLife,boundParticipant);
    text=text.replace(boundParticipant,'        Participant = Participant.Bound(host, this, 0, "BomberPlayerState.participant");')
      .replace(boundLife,'        LifePhase = LifePhase.Bound(host, this, 1, "BomberPlayerState.lifePhase");');
    for(const suffix of ['Changing','Changed']) {
      const life=`        if (ordinal == 0) OnLifePhase${suffix}((int)oldValue!, (int)newValue!, reason);`;
      const participant=`        if (ordinal == 1) OnParticipant${suffix}((NetEntityId)oldValue!, (NetEntityId)newValue!, reason);`;
      text=swapPair(text,life,participant).replace(participant,participant.replace('== 1','== 0')).replace(life,life.replace('== 0','== 1'));
    }
    const newline=text.includes('\r\n')?'\r\n':'\n';
    const lifeRestore=[
      '        if (reader.TryReadInt32("BomberPlayerState.lifePhase", out int lifePhaseRestore))',
      '            LifePhase.SetSilent(lifePhaseRestore);',
    ].join(newline);
    const participantRestore=[
      '        if (reader.TryReadNetEntityId("BomberPlayerState.participant", out NetEntityId participantRestore))',
      '            Participant.SetSilent(participantRestore);',
    ].join(newline);
    text=swapPair(text,lifeRestore,participantRestore);
    changed.set(path,Buffer.from(text));
  }
  for(const side of ['server','client']) {
    const oneSide=new Map(changed);oneSide.set(`Gameplay/generated/${side}/BomberPlayerState.g.cs`,files.get(`Gameplay/generated/${side}/BomberPlayerState.g.cs`));
    badRead(oneSide);
  }
  const parsed=observeSnapshot(changed);
  const candidate=structuredClone(ledger);candidate.active=parsed;
  const actual={schema:ledger.schema,identities:parsed,files:[]};
  assert.deepEqual(validateLedger(candidate),[]);
  assert.deepEqual(compareObserved(candidate,actual),[]);
  const life=parsed.find(i=>i.kind==='scalar'&&i.value==='BomberPlayerState.lifePhase');
  const participant=parsed.find(i=>i.kind==='scalar'&&i.value==='BomberPlayerState.participant');
  assert.equal(life.shape.ordinal,1);
  assert.equal(participant.shape.ordinal,0);
  const result=audit({baseline:ledger,candidate,observed:actual});
  for(const identity of [life,participant]) assert.ok(result.diagnostics.some(d=>d.code==='missing_prior_shape_retirement'&&d.identity===identityKey(identity)));
  assert.equal(result.supportedInventoryConsistent,false);
});
test('audit validates both ledgers, returns deterministic identity/code order and never claims freeze',()=>{
  const candidate=structuredClone(ledger);candidate.active.splice(0,3);candidate.retired.splice(0,3);
  const result=audit({baseline:ledger,candidate,observed});
  const reversed=structuredClone(candidate);reversed.active.reverse();reversed.retired.reverse();
  assert.deepEqual(result.diagnostics,audit({baseline:ledger,candidate:reversed,observed}).diagnostics);
  for(let i=1;i<result.diagnostics.length;i++) {
    const a=result.diagnostics[i-1],b=result.diagnostics[i];
    assert.ok(a.identity<b.identity||a.identity===b.identity&&a.code<=b.code);
  }
  assert.equal(result.freezeEligible,false);
  assert.ok(audit({baseline:{},candidate:ledger,observed}).diagnostics.some(d=>d.code==='invalid_ledger'&&d.message.startsWith('baseline:')));
  assert.ok(audit({baseline:ledger,candidate:{},observed}).diagnostics.some(d=>d.code==='invalid_ledger'&&d.message.startsWith('candidate:')));
});

const repository=resolve(root,'../..');
const historyRepository='C:/Work/LumioGames/LumioGame';
const taskTemp=join(root,'.run/schema-migration-tests');
test('schema test scratch stays outside Gameplay source tree',()=>{
  const path=relative(join(root,'Gameplay'),taskTemp);
  assert.ok(path==='..'||path.startsWith(`..${sep}`));
});
const cli=fileURLToPath(new URL('./verify-schema-identities.mjs',import.meta.url));
const fixtureHistories=new Map();
function invoke(repo,args,environment={}) {
  const history=fixtureHistories.get(repo)??(repo===repository?historyRepository:null);
  const child=spawnSync(process.execPath,[cli,'--repo-root',repo,...(history?['--history-root',history]:[]),...args],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,env:{...process.env,BOMBER_SCHEMA_ENGINE_ROOT:repo===repository?(process.env.BOMBER_SCHEMA_ENGINE_ROOT??''):'',...environment}});
  assert.equal(child.error,undefined);assert.equal(child.stderr,'');
  const report=JSON.parse(child.stdout);
  assert.equal(report.freezeEligible,false);
  return {status:child.status,report,stdout:child.stdout};
}
async function put(path,bytes) {
  if(path.replaceAll('\\','/').endsWith('/Gameplay/Compatibility/schema-identities.json')) {
    let parsed;
    try{parsed=JSON.parse(bytes);}catch(error){if(!(error instanceof SyntaxError))throw error;}
    if(parsed){writeTestLedger(path,parsed);return;}
  }
  await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
}
async function fixture() {
  // Supply an existing immutable two-commit history. Never create commits or an index in tests.
  const history=process.env.BOMBER_SCHEMA_TEST_HISTORY_ROOT;
  if(!history) throw new Error('BOMBER_SCHEMA_TEST_HISTORY_ROOT must name a read-only reviewed fixture history');
  const run=args=>execFileSync('git',['--no-replace-objects',...args],{cwd:history,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  const baseline=run(['rev-parse','HEAD^']);
  assert.equal(run(['cat-file','-t',baseline]),'commit');
  const baselineLedger=materializeTestLedger(readBaseline(history,baseline).ledger);
  assert.equal(hash(Buffer.from(JSON.stringify(baselineLedger))),hash(Buffer.from(JSON.stringify(ledger))),
    'Immutable CLI fixture history must match the complete current ledger');
  assert.deepEqual(baselineLedger,ledger);
  await mkdir(taskTemp,{recursive:true});const repo=await mkdtemp(join(taskTemp,'repo-'));
  for(const [path,bytes] of files) await put(join(repo,'games/101-bomber',path),bytes);
  for(const {path} of LOCAL_HISTORY_SNAPSHOTS) await put(join(repo,'games/101-bomber',path),await readFile(join(root,path)));
  const disk=await readFile(join(root,'Gameplay/Compatibility/schema-identities.json'));
  const stored=JSON.parse(disk);
  if(stored.formatVersion===2)for(const page of stored.retired.pages)
    await put(join(repo,'games/101-bomber',page.path),await readFile(join(root,page.path)));
  await mkdir(dirname(join(repo,LEDGER_PATH)),{recursive:true});await writeFile(join(repo,LEDGER_PATH),disk);
  fixtureHistories.set(repo,history);
  return {repo,baseline,run};
}
test('actual CLI bootstrap reconstructs all fixed history independently and records every immutable blob',async()=>{
  const result=invoke(repository,['--bootstrap-ref',BOOTSTRAP_REF]);
  assert.equal(result.status,0,JSON.stringify(result.report.diagnostics));
  assert.equal(result.report.mode,'bootstrap-audit');assert.equal(result.report.baseline.revision,BOOTSTRAP_REF);
  assert.equal(result.report.supportedInventoryConsistent,true);assert.deepEqual(result.report.diagnostics,[]);
  const gitHistory=result.report.inputHashes.historical.filter(f=>f.blob);
  assert.equal(gitHistory.length,127);assert.equal(result.report.inputHashes.current.length,observed.files.length);
  const expectedHistory=LOCAL_HISTORY_SNAPSHOTS.map(s=>({path:'games/101-bomber/'+s.path,sha256:s.sha256}));
  for(const source of LOCAL_HISTORY_SNAPSHOTS){
    const snapshot=JSON.parse(await readFile(join(root,source.path)));
    if(snapshot.formatVersion===2)for(const page of snapshot.retired.pages)
      expectedHistory.push({path:'games/101-bomber/'+page.path,sha256:page.sha256});
  }
  const byPath=(a,b)=>a.path.localeCompare(b.path);
  // Multiple immutable snapshots may reference the same authenticated page.
  // The physical reader records that file once; all references must agree.
  const expectedByPath=new Map();
  for(const file of expectedHistory){
    const prior=expectedByPath.get(file.path);
    if(prior)assert.equal(prior.sha256,file.sha256,file.path);
    expectedByPath.set(file.path,file);
  }
  assert.deepEqual(result.report.inputHashes.historical.filter(f=>!f.blob).sort(byPath),[...expectedByPath.values()].sort(byPath));
  for(const path of ['Gameplay/Abilities/MoveAbility.Server.cs','Gameplay/Abilities/MoveAbility.Client.cs',
    'Gameplay/generated/server/MoveAbility.g.cs','Gameplay/generated/client/MoveAbility.g.cs'])
    assert.ok(result.report.inputHashes.current.some(file=>file.path===path),`Movement source must be audited: ${path}`);
  for(const path of ['Gameplay/Abilities/PlaceBombAbility.Server.cs','Gameplay/Abilities/PlaceBombAbility.Client.cs',
    'Gameplay/generated/server/PlaceBombAbility.g.cs','Gameplay/generated/client/PlaceBombAbility.g.cs'])
    assert.ok(result.report.inputHashes.current.some(file=>file.path===path),`Placement source must be audited: ${path}`);
  for(const path of ['Gameplay/Abilities/PickupAbility.Server.cs','Gameplay/Abilities/PickupAbility.Client.cs',
    'Gameplay/generated/server/PickupAbility.g.cs','Gameplay/generated/client/PickupAbility.g.cs'])
    assert.ok(result.report.inputHashes.current.some(file=>file.path===path),`Pickup source must be audited: ${path}`);
  assert.ok(gitHistory.every(f=>/^[a-f0-9]{40}$/.test(f.blob)&&/^[a-f0-9]{64}$/.test(f.sha256)));
  assert.deepEqual(result.report.pendingDomains,['B135','F','P','T','release-decision','successor-binding','tag']);
  await mkdir(taskTemp,{recursive:true});await writeFile(join(taskTemp,'real-bootstrap-report.json'),result.stdout);
});
test('bootstrap history cannot self-approve a removed or rewritten historical shape',()=>{
  const historical=readBootstrap(historyRepository,BOOTSTRAP_REF);
  assert.equal(historical.ledger.snapshots.reduce((n,s)=>n+s.active.length,0),343);
  assert.equal(audit({baseline:historical.ledger,candidate:ledger,observed}).supportedInventoryConsistent,true);
  for(const revision of historical.ledger.snapshots.map(s=>s.schema)) {
    const candidate=structuredClone(ledger);candidate.retired=candidate.retired.filter(r=>r.identity.shape.schema!==revision);
    assert.ok(audit({baseline:historical.ledger,candidate,observed}).diagnostics.some(d=>d.code==='missing_prior_shape_retirement'));
  }
  const candidate=structuredClone(ledger);candidate.retired.find(r=>r.identity.value==='BomberExplosionCell.cellX').identity.shape.ordinal=10;
  assert.ok(audit({baseline:historical.ledger,candidate,observed}).diagnostics.some(d=>d.code==='missing_prior_shape_retirement'));
});
test('CLI requires explicit mutually exclusive full commit references and has no write option',()=>{
  for(const args of [[],['--baseline-ref','HEAD'],['--baseline-ref','fab6f08'],['--baseline-ref','f'.repeat(40)],['--baseline-ref',BOOTSTRAP_REF,'--bootstrap-ref',BOOTSTRAP_REF],['--update','true'],['--accept','true'],['--bootstrap-ref',BOOTSTRAP_REF,'--bootstrap-ref',BOOTSTRAP_REF]]) {
    const result=invoke(repository,args);assert.equal(result.status,2);assert.equal(result.report.supportedInventoryConsistent,false);assert.ok(result.report.diagnostics.length);
  }
  const missing=invoke(repository,['--baseline-ref',BOOTSTRAP_REF]);assert.equal(missing.status,2);assert.equal(missing.report.diagnostics[0].code,'missing_baseline_ledger');
});
test('CLI reads an independent Git ledger and rejects candidate tombstone edits/removal',async()=>{
  const {repo,baseline,run}=await fixture();const args=['--baseline-ref',baseline];
  const unchanged=invoke(repo,args);assert.equal(unchanged.status,0);assert.equal(unchanged.report.supportedInventoryConsistent,true);
  assert.equal(unchanged.report.baseline.blob,run(['rev-parse',`${baseline}:${LEDGER_PATH}`]));
  assert.equal(unchanged.report.baseline.sha256,hash(await readFile(join(repo,LEDGER_PATH))));
  assert.equal(invoke(repo,['--baseline-ref',run(['rev-parse','HEAD'])]).report.diagnostics[0].code,'baseline_is_head');
  assert.equal(invoke(repo,['--baseline-ref',run(['rev-parse',`${baseline}:${LEDGER_PATH}`])]).status,2);
  for(const change of [c=>c.retired.shift(),c=>c.retired[0].reason+=' rewritten',c=>c.retired[0].identity.evidence[0].path+='changed']) {
    const candidate=structuredClone(ledger);change(candidate);await put(join(repo,LEDGER_PATH),JSON.stringify(candidate));
    const result=invoke(repo,args);assert.equal(result.status,1);assert.ok(result.report.diagnostics.some(d=>['missing_retirement','retirement_changed'].includes(d.code)));
  }
  await put(join(repo,LEDGER_PATH),JSON.stringify(ledger));
  // cat-file handles loose and packed objects identically. A child-only empty object view tests
  // missing historical input without deleting any object or touching the fixture's Git state.
  const blob=run(['rev-parse',`${baseline}:${LEDGER_PATH}`]);
  assert.equal(run(['cat-file','-t',blob]),'blob');
  const emptyObjects=join(repo,'unavailable-object-view');await mkdir(emptyObjects);
  const missing=invoke(repo,args,{GIT_OBJECT_DIRECTORY:emptyObjects,GIT_ALTERNATE_OBJECT_DIRECTORIES:''});
  assert.equal(missing.status,2);assert.equal(missing.report.diagnostics[0].code,'historical_input_unavailable');
  assert.equal(run(['cat-file','-t',blob]),'blob');
});
test('CLI bootstrap fails when the baseline commit exists but older immutable history is absent',async()=>{
  const repo=process.env.BOMBER_SCHEMA_TEST_INCOMPLETE_HISTORY_ROOT;
  if(!repo) throw new Error('BOMBER_SCHEMA_TEST_INCOMPLETE_HISTORY_ROOT must name immutable incomplete bootstrap history');
  assert.equal(execFileSync('git',['--no-replace-objects','cat-file','-t',BOOTSTRAP_REF],{cwd:repo,encoding:'utf8',windowsHide:true}).trim(),'commit');
  const result=invoke(repo,['--bootstrap-ref',BOOTSTRAP_REF]);
  assert.equal(result.status,2);assert.equal(result.report.diagnostics[0].code,'historical_input_unavailable');
  assert.ok(result.report.diagnostics[0].message.includes('5348635658fdb438f0ee939e8afe527acbc11f80'));
});
test('CLI rejects declaration/generated drift and coordinated source/generated/ledger deletion',async()=>{
  const {repo,baseline}=await fixture(),game=join(repo,'games/101-bomber'),args=['--baseline-ref',baseline];
  const ability='Gameplay/Abilities/SelectCharacterAbility.cs';
  await put(join(game,ability),files.get(ability).toString().replace('[AbilityType(5u','[AbilityType(6u'));
  let result=invoke(repo,args);assert.equal(result.status,1);assert.equal(result.report.diagnostics[0].code,'unsupported_source_shape');
  await unlink(join(game,ability));
  for(const side of ['server','client']) {
    const path=`Gameplay/generated/${side}/GeneratedAbilityRegistry.g.cs`;
    await put(join(game,path),files.get(path).toString().split(/\r?\n/).filter(line=>!line.includes('SelectCharacterAbility')).join('\n'));
  }
  const current=await readObservation(game,{engineRoot:null});
  const candidate=structuredClone(ledger);candidate.active=current.identities;await put(join(repo,LEDGER_PATH),JSON.stringify(candidate));
  result=invoke(repo,args);assert.equal(result.status,1);
  assert.ok(result.report.diagnostics.some(d=>d.identity==='["ability","101-bomber/gas/ability",5]'&&d.code==='missing_prior_shape_retirement'));
  assert.equal(result.report.diagnostics.some(d=>d.code.startsWith('observed_')),false);
  await unlink(join(game,'Gameplay/generated/client/BomberResults.g.cs'));
  result=invoke(repo,args);assert.equal(result.status,2);assert.equal(result.report.diagnostics[0].code,'missing_current_source');
});
