import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const game = path.join(repo, 'games/101-bomber');
const base = '6e0aa35525645df0cbeba16e1dafd38d81806413';
const normalized = value => value.replaceAll('\r\n', '\n');
const read = relative => normalized(fs.readFileSync(path.join(game, relative), 'utf8'));
const prior = relative => normalized(execFileSync('git', ['show', `${base}:games/101-bomber/${relative}`], { cwd: repo, encoding: 'utf8' }));
const roster = text => [...text.matchAll(/new (\w+)\(\)/g)].map(row => row[1]);
const old = ['ObserverComponent', 'IdentityComponent', 'LogicTransform', 'AbilityComponent', 'AttributeComponent',
  'EffectComponent', 'BomberPlayerState', 'BomberSkillState', 'BomberHealthFacts', 'BomberSuccessorLife'];

test('candidate uses complete same-name side declarations with only client Model appended', () => {
  assert.equal(fs.existsSync(path.join(game, 'Gameplay/EntityTypes/PlayerEntity.cs')), false);
  assert.equal(read('Gameplay/EntityTypes/PlayerEntity.Server.cs'), prior('Gameplay/EntityTypes/PlayerEntity.cs'));
  assert.equal(read('Gameplay/EntityTypes/PlayerEntity.Client.cs'), prior('Gameplay/EntityTypes/PlayerEntity.cs')
    .replace('public abstract class PlayerEntity', '[Has(typeof(ModelTransform))]\npublic abstract class PlayerEntity'));
});

test('actual generated server output is semantically identical and preserves its complete old roster and wire slots', () => {
  const dir = path.join(game, 'Gameplay/generated/server');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'games/101-bomber/Gameplay/generated/server'],
    { cwd: repo, encoding: 'utf8' }).trim().split('\n').map(value => value.replace('games/101-bomber/', ''));
  assert.equal(files.length > 50, true, 'a complete generated side is compared');
  for (const relative of files) assert.equal(read(relative), prior(relative), relative);
  assert.deepEqual(roster(read('Gameplay/generated/server/PlayerEntity.Template.g.cs')), old);
  assert.equal(fs.readdirSync(dir).filter(value => value.endsWith('.g.cs') || value.endsWith('.json')).length, files.length);
});

test('actual generated client keeps old indices and wire/persist declarations and appends only Model slot ten', () => {
  const template = read('Gameplay/generated/client/PlayerEntity.Template.g.cs');
  assert.deepEqual(roster(template), [...old, 'ModelTransform']);
  assert.match(template, /ComponentCount = 11;/);
  const registry = read('Gameplay/generated/client/Lumio.Bomber.Gameplay.Registry.g.cs');
  const modelLines = registry.split('\n').filter(line => line.includes('ModelTransform'));
  assert.equal(modelLines.length, 2);
  assert.match(modelLines[0], /componentType == typeof\(ModelTransform\)\) return 10;/);
  assert.match(modelLines[1], /componentName, "ModelTransform", StringComparison.Ordinal\)\) return 10;/);
  assert.equal(registry.split('\n').filter(line => !line.includes('ModelTransform')).join('\n'),
    prior('Gameplay/generated/client/Lumio.Bomber.Gameplay.Registry.g.cs'));
  for (const relative of ['Gameplay/generated/client/Lumio.Bomber.Gameplay.Sync.g.cs',
    'Gameplay/generated/client/attribute-declarations.json']) {
    assert.equal(read(relative), prior(relative), relative);
    assert.doesNotMatch(read(relative), /ModelTransform/);
  }
});
