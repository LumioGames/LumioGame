import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertWorld, worldsMatch } from './world-assert.mjs';

const world = () => ({ schema: 'bomber.world-evidence/1', tick: 4,
  cells: [{ x: 0, y: 0, z: 0, blockType: 256 }],
  entities: [{ entityId: '00000000000000010000000000000002', type: 'PlayerEntity', fields: { healthPoints: 3 } }],
});

test('valid evidence compares complete cells and entity fields', () => {
  assert.equal(worldsMatch(world(), world()), true);
  const wrong = world(); wrong.entities[0].fields.healthPoints = 2;
  assert.ok(assertWorld(wrong, world()).some(f => f.check === 'world:entities'));
  const cell = world(); cell.cells[0].blockType = 257;
  assert.ok(assertWorld(cell, world()).some(f => f.check === 'world:cells'));
});

test('empty or malformed worlds fail even when both sides match', () => {
  for (const mutate of [w => { w.cells = []; }, w => { w.entities = []; },
    w => { w.cells.push(w.cells[0]); }, w => { w.entities.push(w.entities[0]); },
    w => { w.cells[0].x = 1.5; }, w => { w.cells[0].blockType = -1; },
    w => { w.entities[0].entityId = '2'; }, w => { w.entities[0].entityId = '0'.repeat(32); },
    w => { w.entities[0].fields = {}; }, w => { w.schema = 'mining'; },
    w => { w.tick = -1; }]) {
    const value = world(); mutate(value);
    assert.ok(assertWorld(value, value).length > 0, JSON.stringify(value));
  }
  assert.ok(assertWorld(null, null).length > 0);
});

test('order and object property insertion do not affect equality, but tick does', () => {
  const a = world(); a.entities[0].fields = { speed: 1, healthPoints: 3 };
  const b = world(); b.entities[0].fields = { healthPoints: 3, speed: 1 };
  assert.equal(worldsMatch(a, b), true);
  b.tick += 1;
  assert.equal(worldsMatch(a, b), false);
});

test('nonfinite nested JSON numbers cannot collapse into null', () => {
  const a = world(); a.entities[0].fields.healthPoints = JSON.parse('1e999');
  const b = world(); b.entities[0].fields.healthPoints = null;
  assert.equal(worldsMatch(a, b), false);
  assert.equal(worldsMatch(a, a), false);
});
