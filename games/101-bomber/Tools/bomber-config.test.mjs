import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'Gameplay/Tables');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const rows = (table, profile) => json(join(root, 'Server/Config', profile ? `Profiles/${profile}` : 'Tables', 'server', `${table}.json`)).rows;
const one = (table, profile) => { const values = rows(table, profile); assert.equal(values.length, 1, table); return values[0]; };
const expectedAttributes = { HealthPoints: 6, BombPower: 2, BombCapacity: 1, AvailableBombs: 1, SpeedTier: 0, MovementSpeedMilli: 3500 };

test('object budget source and both projections preserve the first-round provision', () => {
  const schema = json(join(source, 'schemas/object_budgets.json'));
  assert.equal(schema.table, 'object_budgets');
  assert.ok(schema.columns.every(column => column.required && column.visibility === 'CS'));
  const expected = {
    max_bomb_entities: 2784,
    max_pickup_entities: 1607,
    max_firezone_entities: 336,
    max_bomb_placements_per_participant_tick: 6,
    max_wall_casts_per_participant_tick: 1,
    reservation_retirement_slack_ticks: 2,
    max_distinct_match_participants: 8,
    initial_mint_generations: 1,
    max_chest_issuances_per_stage: 1,
  };
  for (const side of ['Server/Config/Tables/server', 'Client/Config/Tables/client']) {
    const row = json(join(root, side, 'object_budgets.json')).rows[0];
    assert.equal(row.id, 126001);
    for (const [field, value] of Object.entries(expected)) assert.equal(row[field], value, `${side}/${field}`);
    assert.match(row.source_ref, /ADR-0046/);
  }
});

test('Bomber has exactly six config seeds and no copied mining or stamina tables', () => {
  assert.deepEqual(Object.fromEntries(rows('attributes').map(row => [row.name, row.initial])), expectedAttributes);
  for (const dir of ['Gameplay/Tables/schemas', 'Server/Config/Tables/server', 'Client/Config/Tables/client']) {
    assert.ok(!readdirSync(join(root, dir)).some(name => /mining/i.test(name)), dir);
  }
  assert.equal(one('game').tick_rate_hz, 20);
  assert.equal(one('game').match_duration_ms, 420000);
});

test('reinforcement speed tiers preserve all eight upgrades at the cap', () => {
  const levels = rows('speed_tiers');
  assert.deepEqual(levels.map(row => row.tier), [0,1,2,3,4,5,6,7,8]);
  assert.deepEqual(levels.map(row => row.speed_milli), [3500,3850,4200,4550,4900,5250,5600,5950,6000]);
  assert.equal(rows('attributes').find(row => row.name === 'SpeedTier').maximum, 8);
});

test('five characters and original skill identities preserve legacy levels, combos and candy weights', () => {
  assert.deepEqual(rows('characters').map(row => row.name), ['rabbit','duck','cat','bear','kangaroo']);
  assert.deepEqual(rows('skills').slice(0, 13).map(row => [row.id, row.name]),
    ['regen','bubble','blink','fireAura','kick','freezeBomb','pierceBomb','fireDash','bounceBubble','glacierBomb','toxinBomb','shockBomb','flyKick'].map((name, index) => [index + 1, name]));
  const skills = rows('skills');
  for (const skill of skills) {
    const levels = rows('skill_levels').filter(row => Number(row.skill_id) === skill.id);
    assert.deepEqual(levels.map(row => row.level), skill.is_combo || skill.name === 'flyKick' || skill.id >= 40003 ? [1] : [1,2,3], skill.name);
  }
  for (const row of rows('skill_combos')) {
    for (const key of ['left_skill_id','right_skill_id','result_skill_id']) assert.ok(skills.some(skill => skill.id === Number(row[key])));
  }
  for (const name of ['freezeBomb','pierceBomb','toxinBomb','shockBomb']) assert.equal(skills.find(row => row.name === name).candy_weight, 2);
  for (const name of ['regen','fireDash','bounceBubble','glacierBomb']) assert.equal(skills.find(row => row.name === name).candy_weight, 0);
});

test('dormant bomb identities and values stay disabled in every exported profile', () => {
  const registry = json(join(source, 'registry/row-ids.json'));
  const tombstones = json(join(source, 'registry/tombstones.json'));
  const expected = [
    ['fireBomb', 40003, 'Fire', 119003, 2, 'FireResidue', 116032, 1500, 0],
    ['remoteBomb', 40004, 'Remote', 119008, 7, 'Remote', 116033, 8000, 0],
    ['splitBomb', 40005, 'Split', 119005, 4, 'Split', 116034, 500, 1],
  ];
  for (const [skill, skillId, kind, kindId, code, effect, levelId] of expected) {
    assert.equal(registry.skills[skill], skillId);
    assert.equal(registry.bomb_kinds[kind], kindId);
    assert.equal(registry.skill_levels[`${skill}_lv1`], levelId);
  }
  for (const id of [40000, 40001, 40002]) assert.ok(tombstones.skills.includes(id));
  assert.equal(registry.skills.shockBomb, 12);
  assert.equal(registry.bomb_kinds.Shock, 119007);
  for (const profile of [undefined, ...json(join(source, 'profiles.json')).profiles.map(row => row.name)]) {
    for (const side of ['server', 'client']) {
      const dir = side === 'server'
        ? join(root, 'Server/Config', profile ? `Profiles/${profile}` : 'Tables', side)
        : join(root, 'Client/Config/Tables', profile ? `profiles/${profile}` : '', side);
      const get = table => json(join(dir, `${table}.json`)).rows;
      for (const [skill, skillId, kind, kindId, code, effect, levelId, duration, range] of expected) {
        const k = get('bomb_kinds').find(row => row.name === kind);
        const s = get('skills').find(row => row.name === skill);
        const l = get('skill_levels').find(row => row.name === `${skill}_lv1`);
        assert.deepEqual([k.id, k.kind_code, k.enabled, k.effect_key], [kindId, code, false, effect]);
        assert.deepEqual([s.id, s.slot, s.is_combo, s.candy_weight, s.bomb_kind_code,
          s.removes_protection, s.trigger, s.effect_key],
        [skillId, 'Bomb', false, 0, code, true, 'PlaceBomb', effect]);
        assert.deepEqual([l.id, Number(l.skill_id), l.level, l.duration_ms, l.range_cells,
          l.range_mode, l.pierce_mode], [levelId, skillId, 1, duration, range, 'Fixed', 'Fixed']);
        assert.ok([k, s, l].every(row => row.source_status.includes('dormant') && row.source_ref.includes('ADR-0047')));
      }
    }
  }
});

test('bound flyKick has one level and fixed favorite cooldown on both ends in every profile', () => {
  const schema = json(join(source, 'schemas/skill_levels.json'));
  assert.equal(schema.columns.at(-1).name, 'favorite_cooldown_ms');
  assert.equal(schema.columns.at(-1).ordinal, 17);
  const registry = json(join(source, 'registry/row-ids.json'));
  assert.equal(registry.characters.kangaroo, 118005);
  assert.equal(registry.skills.flyKick, 13);
  assert.equal(registry.skill_levels.flyKick_lv1, 116031);
  for (const profile of [undefined, ...json(join(source, 'profiles.json')).profiles.map(row => row.name)]) {
    for (const side of ['server', 'client']) {
      const directory = side === 'server'
        ? join(root, 'Server/Config', profile ? `Profiles/${profile}` : 'Tables', side)
        : join(root, 'Client/Config/Tables', profile ? `profiles/${profile}` : '', side);
      const get = table => json(join(directory, `${table}.json`)).rows;
      const character = get('characters').find(row => row.name === 'kangaroo');
      assert.deepEqual([character.id, Number(character.bound_skill_id), character.bound_level, character.bound_max_level, character.bound_slot], [118005, 13, 1, 1, 'Active']);
      assert.ok(get('characters').every(row => row.base_attributes_profile === 'default'));
      const skill = get('skills').find(row => row.name === 'flyKick');
      assert.deepEqual([skill.id, skill.slot, skill.trigger, skill.effect_key, skill.is_combo, skill.candy_weight, skill.bomb_kind_code], [13, 'Active', 'Activate', 'Kick', false, 0, 0]);
      const levels = get('skill_levels').filter(row => Number(row.skill_id) === skill.id);
      assert.equal(levels.length, 1);
      const level = levels[0];
      assert.deepEqual([level.id, level.level, level.cooldown_ms, level.favorite_cooldown_ms, level.range_cells, level.range_mode], [116031, 1, 4000, 3000, 2, 'UntilObstacle']);
      for (const field of ['duration_ms', 'interval_ms', 'heal_points', 'freeze_ms', 'pierce_layers', 'wall_ms', 'kick_range_cells']) assert.equal(level[field], 0, field);
      assert.ok(get('skill_levels').filter(row => row.id !== level.id).every(row => row.favorite_cooldown_ms === 0));
      assert.ok(get('skill_combos').every(row => ['left_skill_id','right_skill_id','result_skill_id'].every(key => Number(row[key]) !== 13)));
      assert.equal(get('bomb')[0].kick_speed_milli, 8000);
    }
  }
});

test('authored skill values reach both ends and product skill projections', () => {
  const expectedLevels = {
    regen: [{ interval_ms: 20000, heal_points: 1 }, { interval_ms: 16000, heal_points: 1 }, { interval_ms: 12000, heal_points: 1 }],
    bubble: [{ duration_ms: 3500, cooldown_ms: 14000 }, { duration_ms: 4000, cooldown_ms: 12000 }, { duration_ms: 4500, cooldown_ms: 10000 }],
    blink: [{ range_cells: 3, cooldown_ms: 10000 }, { range_cells: 3, cooldown_ms: 8000 }, { range_cells: 4, cooldown_ms: 6000 }],
    fireAura: [{ duration_ms: 5500, cooldown_ms: 16000 }, { duration_ms: 6000, cooldown_ms: 14000 }, { duration_ms: 6500, cooldown_ms: 12000 }],
    freezeBomb: [{ freeze_ms: 2000 }, { freeze_ms: 2000 }, { freeze_ms: 2500 }],
    toxinBomb: [{ duration_ms: 4000 }, { duration_ms: 4000 }, { duration_ms: 5000 }],
    glacierBomb: [{ freeze_ms: 2000 }],
  };
  for (const side of ['Server/Config', 'Client/Config']) {
    for (const profile of [undefined, 'skills-on', 'skills-off']) {
      const directory = profile
        ? (side.startsWith('Server') ? `Profiles/${profile}/server` : `Tables/profiles/${profile}/client`)
        : (side.startsWith('Server') ? 'Tables/server' : 'Tables/client');
      const exportedRows = table => json(join(root, side, directory, `${table}.json`)).rows;
      const skills = exportedRows('skills');
      const levels = exportedRows('skill_levels');
      for (const [name, expected] of Object.entries(expectedLevels)) {
        const id = skills.find(row => row.name === name)?.id;
        assert.ok(id, `${side}/${profile ?? 'default'}/${name}`);
        const actual = levels.filter(row => Number(row.skill_id) === id).sort((a, b) => a.level - b.level);
        assert.equal(actual.length, expected.length, `${side}/${profile ?? 'default'}/${name}`);
        expected.forEach((fields, index) => {
          for (const [field, value] of Object.entries(fields)) {
            assert.equal(actual[index][field], value, `${side}/${profile ?? 'default'}/${name}/${index + 1}/${field}`);
          }
        });
      }
      const rules = exportedRows('skill_rules')[0];
      assert.equal(rules.freeze_cap_ms, 2500, `${side}/${profile ?? 'default'}/freeze_cap_ms`);
      assert.equal(rules.toxin_interval_ms, 2000, `${side}/${profile ?? 'default'}/toxin_interval_ms`);
      assert.equal(rules.toxin_points, 1, `${side}/${profile ?? 'default'}/toxin_points`);
    }
  }
});

test('skill A/B profiles retain their independent overrides on both ends', () => {
  const overrides = [
    ['bubble-duration-2000', 'skill_levels', 'bubble_lv1', 'duration_ms', 2000],
    ['bubble-cooldown-15000', 'skill_levels', 'bubble_lv1', 'cooldown_ms', 15000],
    ['bubble-cooldown-22000', 'skill_levels', 'bubble_lv1', 'cooldown_ms', 22000],
    ['regen-5000', 'skill_levels', 'regen_lv1', 'interval_ms', 5000],
    ['toxin-points-2', 'skill_rules', 'default', 'toxin_points', 2],
  ];
  for (const [profile, table, name, field, value] of overrides) {
    for (const side of ['Server/Config/Profiles', 'Client/Config/Tables/profiles']) {
      const projection = side.startsWith('Server') ? 'server' : 'client';
      const row = json(join(root, side, profile, projection, `${table}.json`)).rows.find(item => item.name === name);
      assert.equal(row[field], value, `${side}/${profile}/${table}.${name}.${field}`);
    }
  }
});

test('all A/B profiles keep coherent circle schedules and change one declared independent parameter', () => {
  const manifest = json(join(source, 'profiles.json'));
  assert.equal(manifest.profiles.filter(row => row.group === 'core').length, 16);
  assert.equal(manifest.profiles.filter(row => row.group === 'design').length, 24);
  assert.deepEqual(manifest.profiles.filter(row => row.group === 'product').map(row => row.name).sort(), ['skills-off','skills-on']);
  for (const profile of [undefined, ...manifest.profiles.filter(row => row.group !== 'authoring').map(row => row.name)]) {
    const stages = rows('circle_stages', profile);
    const circle = one('final_circle', profile);
    assert.equal(stages.length, 6, profile);
    assert.equal(stages[0].at_ms, circle.preview_ms, profile);
    assert.deepEqual(stages.map(row => row.side_cells), [13,9,7,5,3,1]);
    assert.ok(stages.every((row, index) => row.at_ms > (stages[index - 1]?.at_ms ?? 0) && row.at_ms < circle.duration_ms), profile);
  }
  for (const profile of manifest.profiles) {
    if (profile.group === 'authoring') continue;
    assert.equal(profile.parameters.length, 1, profile.name);
    const changed = [];
    for (const file of readdirSync(join(source, 'schemas')).filter(file => file.endsWith('.json'))) {
      const table = file.slice(0,-5);
      const base = rows(table);
      const variant = rows(table, profile.name);
      assert.equal(variant.length, base.length, profile.name);
      for (const row of base) {
        const other = variant.find(value => value.id === row.id);
        assert.ok(other, `${profile.name}/${table}/${row.id}`);
        for (const key of Object.keys(row)) if (row[key] !== other[key]) changed.push(`${table}.${row.name}.${key}`);
      }
    }
    const allowed = [...profile.parameters, ...profile.derived].filter(key => {
      // The skills-on product profile explicitly selects the shipped default.
      const [table, name, column] = key.split('.');
      return rows(table).find(row => row.name === name)[column] !== rows(table, profile.name).find(row => row.name === name)[column];
    });
    if (profile.group !== 'product') assert.ok(changed.length > 0, profile.name);
    const [parameterTable, parameterRow, parameterColumn] = profile.parameters[0].split('.');
    assert.equal(rows(parameterTable, profile.name).find(row => row.name === parameterRow)[parameterColumn], profile.value);
    assert.deepEqual(changed.sort(), allowed.sort(), profile.name);
  }
});

test('M2 authoring profiles declare every changed cell and project the three map sizes', () => {
  const manifest = json(join(source, 'profiles.json'));
  const cases = [['m2-map-19', 19, 8, 3, 2], ['m2-map-23', 23, 12, 4, 4], ['m2-map-27', 27, 16, 5, 6]];
  assert.deepEqual(manifest.profiles.filter(row => row.group === 'authoring').map(row => row.name), cases.map(row => row[0]));
  for (const [name, size, players, radius, branch] of cases) {
    const profile = manifest.profiles.find(row => row.name === name);
    assert.equal(profile.runtimeEligible, false);
    assert.deepEqual(profile.parameters, ['map.default.width']);
    const changed = [];
    for (const file of readdirSync(join(source, 'schemas')).filter(file => file.endsWith('.json'))) {
      const table = file.slice(0, -5);
      for (const row of rows(table)) {
        const other = rows(table, name).find(value => value.id === row.id);
        assert.ok(other, `${name}/${table}/${row.id}`);
        for (const key of Object.keys(row)) if (row[key] !== other[key]) changed.push(`${table}.${row.name}.${key}`);
      }
    }
    assert.deepEqual(changed.sort(), [...profile.parameters, ...profile.derived].filter(key => {
      const [table, rowName, column] = key.split('.');
      return rows(table).find(row => row.name === rowName)[column] !== one(table, name)[column];
    }).sort(), name);
    for (const side of ['Server/Config/Profiles', 'Client/Config/Tables/profiles']) {
      const projection = side.startsWith('Server') ? 'server' : 'client';
      const get = table => json(join(root, side, name, projection, `${table}.json`)).rows[0];
      assert.deepEqual([get('game').map_size, get('game').player_count], [size, players]);
      assert.deepEqual([get('map').width, get('map').depth, get('map').layout_kind,
        get('map').moat_radius_cells, get('map').moat_branch_cells], [size, size, 'M2Moat', radius, branch]);
      for (const table of ['map', 'game']) {
        assert.equal(get(table).source_status, 'inferred; author-only; unverified');
        assert.equal(get(table).source_ref, 'ADR-0048');
      }
    }
  }
});

test('M2 room profiles pin the four-minute clock and stay refused', () => {
  const cases = [
    ['m2-room-19', 19, 8, 3, 2, 2],
    ['m2-room-23', 23, 12, 4, 4, 3],
    ['m2-room-27', 27, 16, 5, 6, 4],
  ];
  for (const [name, size, players, radius, branch, orbits] of cases) {
    const profile = json(join(source, 'profiles.json')).profiles.find(row => row.name === name);
    assert.equal(profile.group, 'room');
    assert.equal(profile.runtimeEligible, false);
    const game = one('game', name);
    const map = one('map', name);
    const regeneration = one('regeneration', name);
    assert.equal(game.match_duration_ms, 240000);
    assert.equal(game.player_count, players);
    assert.equal(game.map_size, size);
    assert.equal(map.layout_kind, 'M2Moat');
    assert.equal(map.moat_radius_cells, radius);
    assert.equal(map.moat_branch_cells, branch);
    assert.equal(regeneration.interval_ms, 8000);
    assert.equal(regeneration.first_trigger_ms, 8000);
    assert.equal(regeneration.stop_before_final_ms, 20000);
    assert.equal(regeneration.max_mirror_orbits, orbits);
    for (const stage of rows('circle_stages', name).slice(0, 5)) assert.equal(stage.spawn_chest, false);
  }
});

test('skill flags only change the flag, preserve base attributes and have full client projections', () => {
  assert.equal(one('game', 'skills-off').skills_enabled, false);
  assert.equal(one('game', 'skills-on').skills_enabled, true);
  assert.deepEqual(rows('attributes', 'skills-off'), rows('attributes', 'skills-on'));
  for (const name of ['skills-off','skills-on']) assert.ok(existsSync(join(root, 'Client/Config/Tables/profiles', name, 'client/game.json')));
});
