import {loadTestLedger} from './schema-identity-test-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLedger} from './schema-identity-model.mjs';
const ledger = loadTestLedger(new URL('../Gameplay/Compatibility/schema-identities.json', import.meta.url));
function candidate(id = 10108) {
  const next = structuredClone(ledger);
  next.active = next.active.filter(i => i.kind !== 'effect-type' || i.value !== id);
  const effect = structuredClone(next.active.find(i => i.kind === 'effect-type' && i.value === 10107));
  effect.value = effect.shape.id = id;
  effect.owner = effect.shape.clrType = 'Lumio.Bomber.Gameplay.' + (id === 10108 ? 'BomberFreezeEffect' : 'BomberFreezeImmunityEffect');
  effect.shape.parametersType = effect.owner + '.Parameters';
  effect.shape.fields.push(...[
    [7, 'DamageOwner', 'Lumio.GameRuntime.Ecs.NetEntityId'], [8, 'DamageRow', 'System.Int32'],
    [9, 'DamageWorld', 'System.UInt64'], [10, 'DamageInstance', 'System.UInt64'], [11, 'DamageGeneration', 'System.UInt32'],
  ].map(([id, name, clrType]) => ({id, name, clrType, maxUtf8Bytes: null})));
  next.active.push(effect);
  return next;
}
test('freeze and immunity retain exact finite timing and unsigned full damage correlation', () => {
  for (const id of [10108, 10109]) assert.deepEqual(validateLedger(candidate(id)), []);
});
test('freeze metadata cannot authorize a different owner, policy or signed duration', () => {
  for (const id of [10108, 10109]) for (const change of [
    shape => { shape.clrType = 'Other.Freeze'; shape.parametersType = shape.clrType + '.Parameters'; },
    shape => { shape.policy = 'unbounded'; }, shape => { shape.durationFieldId = 11; },
    shape => { shape.fields[0].clrType = 'System.Int64'; },
  ]) {
    const next = candidate(id); change(next.active.at(-1).shape);
    assert.notDeepEqual(validateLedger(next), []);
  }
});
