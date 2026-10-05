import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {readObservation,SCHEMA} from './schema-identity-read.mjs';

test('official button abilities and private hold memory preserve full authority and persistence',async()=>{
  const observed=await readObservation(fileURLToPath(new URL('../',import.meta.url)));
  assert.equal(observed.schema,SCHEMA);
  const abilities=observed.identities.filter(x=>x.kind==='ability');
  assert.equal(abilities.length,7);
  for(const [i,name] of ['BombButtonAbility','BombButtonReleaseAbility'].entries()){
    const ability=abilities.find(x=>x.owner.endsWith('.'+name));
    assert.ok(ability,name);assert.equal(ability.value,6+i);
    assert.equal(ability.shape.prediction,'AuthorityOnly');
  }
  for(const [i,name] of ['bombButtonMode','bombButtonStartedTick','bombButtonLastInputTick','bombButtonLifeGeneration'].entries()){
    const field=observed.identities.find(x=>x.value==='BomberPlayerState.'+name);
    assert.ok(field,name);assert.equal(field.shape.ordinal,23+i);
    assert.equal(field.shape.scope,'None');assert.equal(field.shape.authority,'Server');
    for(const side of ['server','client'])assert.deepEqual(field.shape.serialization[side],
      {capturePersist:true,captureSync:false,restorePersist:true});
  }
});
test('official attribute declaration keys are canonical lowerFirst with unchanged base/current semantics',async()=>{
  const observed=await readObservation(fileURLToPath(new URL('../',import.meta.url)));
  const player=observed.identities.find(x=>x.kind==='entity-wire'&&x.value==='player');
  assert.equal(player.shape.attributes.length,6);
  for(const attribute of player.shape.attributes){
    const lower=attribute.name[0].toLowerCase()+attribute.name.slice(1);
    assert.deepEqual(attribute.bindings,[
      {key:`AttributeComponent.${lower}Base`,wireType:'i64',persistence:'persistent',visibility:'room-public'},
      {key:`AttributeComponent.${lower}Current`,wireType:'i64',persistence:'ephemeral',visibility:'aoi-scoped'}]);
  }
});
test('v12 preserves every v11 shape apart from the six declared additions and canonical attribute bindings',async()=>{
  const captured=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-bomb-promises.json',import.meta.url)));
  const observed={identities:captured.active};
  assert.equal(captured.schema,'bomber-v12-button-canonical-attributes-candidate');
  const prior=JSON.parse(readFileSync(new URL('../Gameplay/Compatibility/schema-identities.before-button-input.json',import.meta.url)));
  assert.equal(prior.active.length,661);assert.equal(observed.identities.length,667);
  const key=x=>JSON.stringify([x.kind,x.owner,x.value]);
  for(const before of prior.active){
    const after=observed.identities.find(x=>key(x)===key(before));assert.ok(after,key(before));
    const a=structuredClone(before.shape),b=structuredClone(after.shape);delete a.schema;delete b.schema;
    if(a.origin?.kind==='external')for(const name of ['engineRevision','runtimeRevision','package'])a.origin[name]=b.origin[name];
    if(['entity-wire','entity-alias'].includes(before.kind))for(const attribute of a.attributes)
      for(const binding of attribute.bindings)binding.key=binding.key.replace(/^(AttributeComponent\.)(.)/,(_,prefix,first)=>prefix+first.toLowerCase());
    assert.deepEqual(b,a,key(before));
  }
});
