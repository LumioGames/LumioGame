import {loadTestLedger} from './schema-identity-test-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLedger} from './schema-identity-model.mjs';
const ledger = loadTestLedger(new URL('../Gameplay/Compatibility/schema-identities.json', import.meta.url));
function successor() {
  const next = structuredClone(ledger);
  next.active = next.active.filter(i => i.kind !== 'effect-type' || i.value !== 10105);
  const effect = structuredClone(next.active.find(i => i.kind === 'effect-type' && i.value === 10104));
  effect.value = effect.shape.id = 10105;
  effect.owner = effect.shape.clrType = 'Lumio.Bomber.Gameplay.BomberSuccessorRestoreEffect';
  effect.shape.parametersType = effect.owner + '.Parameters';
  effect.shape.fact = null;
  next.active.push(effect);
  return next;
}
test('successor restore can use generated Applied reducer witness without indexed fact association', () => {
  assert.deepEqual(validateLedger(successor()), []);
});
test('existing damage fact cannot be erased as a successor exception', () => {
  const next = structuredClone(ledger);
  next.active.find(i => i.kind === 'effect-type' && i.value === 10101).shape.fact = null;
  assert.notDeepEqual(validateLedger(next), []);
});
test('unrelated Effect cannot borrow successor fact-free exception', () => {
  const next = successor();
  next.active = next.active.filter(i => i.kind !== 'effect-type' || i.value !== 10106);
  const effect = next.active.at(-1);
  effect.value = effect.shape.id = 10106;
  assert.notDeepEqual(validateLedger(next), []);
});

test('current-life inventory settlement may omit an indexed business fact', () => {
  const next = successor();
  next.active = next.active.filter(i => i.kind !== 'effect-type' || i.value !== 10106);
  const effect = structuredClone(next.active.find(i => i.kind === 'effect-type' && i.value === 10105));
  effect.value = effect.shape.id = 10106;
  effect.owner = effect.shape.clrType = 'Lumio.Bomber.Gameplay.BomberInventoryEffect';
  effect.shape.parametersType = effect.owner + '.Parameters';
  effect.shape.instantWrites = [4];
  next.active.push(effect);
  assert.deepEqual(validateLedger(next), []);
});
