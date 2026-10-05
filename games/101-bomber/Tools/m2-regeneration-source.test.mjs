import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Source-authoring proof only. This does not compile a profile, admit an M2
// room, or substitute static table values for actual Native regeneration.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function row(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(line => line.startsWith('|'));
  const columns = lines[0].split('|').slice(1, -1).map(cell => cell.trim());
  const cells = lines[2].split('|').slice(1, -1).map(cell => cell.trim());
  assert.equal(cells.length, columns.length, 'source row must match its actual columns');
  return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
}
const base = row(resolve(root, 'Gameplay/Tables/tables/regeneration.txt'));
function effective(profile) {
  const overlay = resolve(root, `Gameplay/Tables/profiles/${profile}/layers/product/regeneration.txt`);
  return existsSync(overlay) ? { ...base, ...row(overlay) } : base;
}

test('official regeneration source exposes exact one-in-32 and one-in-6 denominators', () => {
  const schema = JSON.parse(readFileSync(resolve(root, 'Gameplay/Tables/schemas/regeneration.json'), 'utf8'));
  for (const [name, expected] of [['barrel_roll_denominator', 32], ['chest_roll_denominator', 6]]) {
    const column = schema.columns.find(column => column.name === name);
    assert.ok(column, `official author schema is missing ${name}`);
    assert.equal(column.type, 'u32');
    assert.equal(Number(base[name]), expected);
  }
});

for (const [size, orbits] of [[19, 2], [23, 3], [27, 4]]) {
  test(`M2 ${size} source starts at eight seconds and stops twenty seconds before final`, () => {
    const rule = effective(`m2-map-${size}`);
    assert.equal(Number(rule.first_trigger_ms), 8000);
    assert.equal(Number(rule.interval_ms), 8000);
    assert.equal(Number(rule.target_initial_permille), 600);
    assert.equal(Number(rule.stop_before_final_ms), 20000);
  });
  test(`M2 ${size} source allows exactly ${orbits} complete mirror orbits per wave`, () => {
    assert.equal(Number(effective(`m2-map-${size}`).max_mirror_orbits), orbits);
  });
}
