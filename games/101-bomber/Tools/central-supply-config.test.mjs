import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'Gameplay/Tables');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const parameters = Object.freeze([
  ['central_supply_enabled', 'bool', false],
  ['central_supply_announce_ms', 'u32', 50000],
  ['central_supply_open_ms', 'u32', 60000],
  ['central_supply_strengthening_count', 'i32', 5],
  ['central_supply_health_count', 'i32', 2],
  ['central_supply_frenzy_count', 'i32', 1],
  ['central_supply_special_count', 'i32', 2],
  ['central_supply_golden_heart_count', 'i32', 1],
  ['frenzy_enabled', 'bool', true],
  ['frenzy_duration_ms', 'u32', 6000],
  ['frenzy_fuse_ms', 'u32', 1200],
  ['frenzy_concurrent_limit', 'i32', 6],
  ['frenzy_min_placement_ticks', 'u32', 5],
]);

test('supply and frenzy parameters append to the existing game source with stable ordinals and authored defaults', () => {
  const schema = json(join(source, 'schemas/game.json'));
  assert.deepEqual(schema.columns.slice(0, 14).map(row => row.name), [
    'id', 'name', 'tick_rate_hz', 'player_count', 'map_size', 'warmup_ms',
    'match_duration_ms', 'podium_ms', 'results_ms', 'skills_enabled',
    'default_bot_profile', 'source_status', 'source_ref', 'initial_seed',
  ]);
  assert.deepEqual(schema.columns.slice(14).map(row => [row.name, row.type, row.ordinal]),
    parameters.map(([name, type], index) => [name, type, 14 + index]));
  for (const column of schema.columns.slice(14)) {
    assert.equal(column.required, true, column.name);
    assert.equal(column.visibility, 'CS', column.name);
    assert.equal(column.sharedPrediction, false, column.name);
  }
  const lines = readFileSync(join(source, 'tables/game.txt'), 'utf8')
    .split(/\r?\n/).filter(line => line.startsWith('|'));
  const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
  const row = Object.fromEntries(cells(lines[0]).map((name, index) => [name, cells(lines[2])[index]]));
  for (const [name, , value] of parameters) assert.equal(row[name], String(value), name);
});

test('official projections retain the new bounded parameters and fresh Frenzy pickup identity on both ends', () => {
  const registry = json(join(source, 'registry/row-ids.json'));
  assert.ok(Number.isSafeInteger(registry.pickup_kinds.Frenzy) && registry.pickup_kinds.Frenzy > 0);
  assert.equal(registry.pickup_kinds.Kick, 107007);
  const profiles = [undefined, ...json(join(source, 'profiles.json')).profiles.map(profile => profile.name)];
  for (const profile of profiles) {
    for (const side of ['server', 'client']) {
      const directory = side === 'server'
        ? join(root, 'Server/Config', profile ? `Profiles/${profile}` : 'Tables', side)
        : join(root, 'Client/Config/Tables', profile ? `profiles/${profile}` : '', side);
      const game = json(join(directory, 'game.json')).rows[0];
      for (const [name, , value] of parameters) {
        assert.equal(typeof game[name], typeof value, `${profile ?? 'default'}/${side}/${name}`);
        if (profile === undefined) assert.equal(game[name], value, `${side}/${name}`);
      }
      assert.ok(game.frenzy_concurrent_limit >= 1 && game.frenzy_concurrent_limit <= 6);
      assert.ok(game.frenzy_min_placement_ticks >= 5);
      assert.ok(game.central_supply_announce_ms < game.central_supply_open_ms);
      const pickups = json(join(directory, 'pickup_kinds.json')).rows;
      const frenzy = pickups.filter(row => row.name === 'Frenzy');
      assert.equal(frenzy.length, 1);
      assert.deepEqual([frenzy[0].id, frenzy[0].kind_code, frenzy[0].soft_weight, frenzy[0].ledger_mode],
        [registry.pickup_kinds.Frenzy, 7, 0, 'Frenzy']);
      assert.equal(pickups.find(row => row.name === 'Kick').kind_code, 6);
    }
  }
});
