import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../Gameplay/', import.meta.url));
function sources(dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['generated', 'obj', 'bin'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.cs') ? [path] : [];
  });
}

test('gameplay has one player declaration and no mining or parallel simulation world', () => {
  const all = sources().map(path => ({ path, text: readFileSync(path, 'utf8') }));
  assert.equal(all.filter(({ text }) => /abstract class (?:Bomber)?PlayerEntity\b/.test(text)).length, 1);
  for (const { path, text } of all) {
    assert.doesNotMatch(text, /\b(?:BomberSimulation|BomberGrid|MineAbility|BomberMiningComponent|HatPile|OwnerNetEntityIdRaw|HatKingNetEntityIdRaw)\b/, path);
  }
  const player = all.find(({ text }) => /abstract class (?:Bomber)?PlayerEntity\b/.test(text)).text;
  for (const attribute of ['HealthPoints', 'BombPower', 'BombCapacity', 'AvailableBombs', 'SpeedTier', 'MovementSpeedMilli']) {
    assert.ok(player.includes(`DeclareAttribute("${attribute}"`), attribute);
  }
});

test('bomb input cannot supply authority-owned power or bomb kind', () => {
  const source = readFileSync(join(root, 'Abilities', 'PlaceBombAbility.cs'), 'utf8');
  assert.doesNotMatch(source, /public int (?:Power|Kind)\b/);
  assert.match(source, /struct Input : IAbilityInput/);
});
