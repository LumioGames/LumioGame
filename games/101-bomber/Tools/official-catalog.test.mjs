import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_DECLARED,
  CATALOG_RELATIVE,
  CATALOG_VERSION,
  FIRST_OFFICIAL_BLOCK_TYPE,
  buildOfficialCatalog,
  catalogCoversLayout,
  loadLayout,
  loadOfficialCatalog,
  serializeOfficialCatalog,
  stateFields,
  validateOfficialCatalog,
} from './official-catalog.mjs';
import { loadCommittedServerJson } from './server-profile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROW_FIELDS = ['blockType', 'name', 'materialClass', 'behaviorTemplate', 'assetRef', 'stateLayout', 'lightEmission'];

// C0 block list (ADR-124 r1 C0), written out here independently of the generator on purpose:
// the generator must reproduce it row by row, in this order, from 1001.
const C0_NEW_ROWS = [
  [1001, 'lumio.dirt', 'Solid', 'FullCube', {}, '000'],
  [1002, 'lumio.grass_block', 'Solid', 'FullCube', {}, '000'],
  [1003, 'lumio.oak_planks', 'Solid', 'FullCube', {}, '000'],
  [1004, 'lumio.oak_log', 'Solid', 'FullCube', {}, '000'],
  [1005, 'lumio.oak_leaves', 'Cutout', 'FullCube', {}, '000'],
  [1006, 'lumio.glass', 'Cutout', 'FullCube', {}, '000'],
  [1007, 'lumio.blue_stained_glass', 'Translucent', 'FullCube', {}, '000'],
  [1008, 'lumio.ice', 'Translucent', 'FullCube', {}, '000'],
  [1009, 'lumio.glowstone', 'Solid', 'FullCube', {}, null],
  [1010, 'lumio.water', 'Liquid', 'Liquid', { spreadDistance: 7 }, '000'],
  [1011, 'lumio.lava', 'Liquid', 'Liquid', { spreadDistance: 7 }, 'f60'],
  [1012, 'lumio.oak_stairs', 'Solid', 'Model', { directions: 'D0D1D2D3U0U1U2U3', subShapeNum: 5, yawSplitNum: 1 }, '000'],
  [1013, 'lumio.oak_slab', 'Solid', 'Model', { subShapeNum: 3 }, '000'],
  [1014, 'lumio.oak_door', 'Solid', 'Door', { directions: 'D0D1D2D3' }, '000'],
  [1015, 'lumio.oak_fence', 'Solid', 'Connected', {}, '000'],
  [1016, 'lumio.glass_pane', 'Cutout', 'Connected', {}, '000'],
  [1017, 'lumio.iron_bars', 'Cutout', 'Connected', {}, '000'],
  [1018, 'lumio.torch', 'Cutout', 'Model', { directions: 'C1F0B0L0R0', subShapeNum: 1 }, 'ec8'],
  [1019, 'lumio.poppy', 'Cutout', 'Model', { subShapeNum: 1 }, '000'],
  [1020, 'lumio.short_grass', 'Cutout', 'Model', { subShapeNum: 1 }, '000'],
  [1021, 'lumio.oak_sapling', 'Cutout', 'Model', { subShapeNum: 1 }, '000'],
];

function committedText() {
  return readFileSync(resolve(ROOT, CATALOG_RELATIVE), 'utf8');
}

function built() {
  return buildOfficialCatalog(loadLayout(ROOT));
}

test('committed official catalog is the generator output, byte for byte, and generation is deterministic', () => {
  const first = serializeOfficialCatalog(built());
  const second = serializeOfficialCatalog(built());
  assert.equal(first, second);
  assert.equal(first, committedText());
});

test('catalog is a v2 envelope: version, retiredNames, rows, shapeTable', () => {
  const catalog = loadOfficialCatalog(ROOT);
  assert.equal(CATALOG_VERSION, 2);
  assert.deepEqual(Object.keys(catalog), ['version', 'retiredNames', 'rows', 'shapeTable']);
  assert.equal(catalog.version, 2);
  assert.deepEqual(catalog.retiredNames, []);
  assert.equal(typeof catalog.shapeTable, 'object');
  assert.equal(validateOfficialCatalog(catalog), 'valid');
});

test('rows are dense from 256, names unique, seven fields in contract order', () => {
  const { rows } = loadOfficialCatalog(ROOT);
  assert.equal(rows[0].blockType, FIRST_OFFICIAL_BLOCK_TYPE);
  assert.equal(rows.at(-1).blockType, 1032);
  assert.equal(rows.length, 1032 - FIRST_OFFICIAL_BLOCK_TYPE + 1);
  rows.forEach((row, index) => {
    assert.equal(row.blockType, FIRST_OFFICIAL_BLOCK_TYPE + index);
    assert.deepEqual(Object.keys(row), ROW_FIELDS);
    for (const field of ROW_FIELDS) {
      assert.notEqual(row[field], null, `${row.name}.${field}`);
      assert.notEqual(row[field], '', `${row.name}.${field}`);
    }
    assert.match(row.lightEmission, /^[0-9a-f]{3}$/);
    assert.match(row.assetRef, /^asset:\/\/blocks\/[a-z0-9_][a-z0-9_.-]*$/);
    assert.equal(typeof row.stateLayout, 'object');
    assert.equal(Array.isArray(row.stateLayout), false);
  });
  assert.equal(new Set(rows.map((row) => row.name)).size, rows.length);
});

test('the existing 745 rows keep their numbers and names and only gain columns', () => {
  const { rows } = loadOfficialCatalog(ROOT);
  const legacy = rows.filter((row) => row.blockType <= 1000);
  assert.equal(legacy.length, 745);
  const named = { 256: 'lumio.stone', 258: 'lumio.hard_wall', 1000: 'lumio.ore' };
  for (const row of legacy) {
    assert.equal(row.name, named[row.blockType] ?? `lumio.block_${row.blockType}`);
    assert.equal(row.assetRef, `asset://blocks/${named[row.blockType] ?? 'lumio.stone'}`);
    assert.equal(row.materialClass, 'Solid');
    assert.equal(row.behaviorTemplate, 'FullCube');
    assert.deepEqual(row.stateLayout, {});
    assert.equal(row.lightEmission, '000');
  }
});

test('new rows match the C0 block list row by row, minted from 1001 in list order', () => {
  const { rows } = loadOfficialCatalog(ROOT);
  const minted = rows.filter((row) => row.blockType > 1000 && row.blockType <= 1021);
  assert.equal(minted.length, C0_NEW_ROWS.length);
  minted.forEach((row, index) => {
    const [blockType, name, materialClass, behaviorTemplate, stateLayout, lightEmission] = C0_NEW_ROWS[index];
    assert.equal(row.blockType, blockType);
    assert.equal(row.name, name);
    assert.equal(row.assetRef, `asset://blocks/${name}`);
    assert.equal(row.materialClass, materialClass);
    assert.equal(row.behaviorTemplate, behaviorTemplate);
    assert.deepEqual(row.stateLayout, stateLayout);
    if (lightEmission === null) {
      // Glowstone: colour is C8's call, but it must emit.
      assert.notEqual(row.lightEmission, '000');
    } else {
      assert.equal(row.lightEmission, lightEmission);
    }
  });
});

test('every row fits in eight state bits and derives the contract layouts', () => {
  const { rows } = loadOfficialCatalog(ROOT);
  const byName = new Map(rows.map((row) => [row.name, row]));
  for (const row of rows) {
    const fields = stateFields(row);
    const total = fields.reduce((sum, field) => sum + field.width, 0);
    assert.ok(total <= 8, `${row.name} uses ${total} bits`);
  }
  const layout = (name) => stateFields(byName.get(name)).map(({ name: n, offset, width }) => [n, offset, width]);
  assert.deepEqual(layout('lumio.oak_stairs'), [['Direction', 0, 3], ['SubShapeId', 3, 3], ['YawSplitIndex', 6, 0]]);
  assert.deepEqual(layout('lumio.oak_slab'), [['SubShapeId', 0, 2], ['YawSplitIndex', 2, 0]]);
  assert.deepEqual(layout('lumio.torch'), [['Direction', 0, 3], ['SubShapeId', 3, 0], ['YawSplitIndex', 3, 0]]);
  assert.deepEqual(layout('lumio.oak_door'), [['Direction', 0, 2], ['Open', 2, 1], ['RightHinge', 3, 1], ['Up', 4, 1]]);
  assert.deepEqual(layout('lumio.water'), [['HeightLevel', 0, 4]]);
  assert.deepEqual(layout('lumio.oak_fence'), []);
  assert.deepEqual(layout('lumio.stone'), []);
});

test('shape table covers exactly the Model / Door / Connected rows with the right sub-shape counts', () => {
  const { rows, shapeTable } = loadOfficialCatalog(ROOT);
  const shaped = rows.filter((row) => ['Model', 'Door', 'Connected'].includes(row.behaviorTemplate));
  assert.deepEqual(Object.keys(shapeTable), shaped.map((row) => row.name));
  for (const row of shaped) {
    const entry = shapeTable[row.name];
    const expected = row.behaviorTemplate === 'Model' ? row.stateLayout.subShapeNum
      : row.behaviorTemplate === 'Door' ? 2 : 5;
    assert.equal(entry.length, expected, row.name);
    for (const sub of entry) {
      assert.deepEqual(Object.keys(sub), ['boxes', 'crosses']);
      for (const six of [...sub.boxes, ...sub.crosses]) {
        assert.equal(six.length, 6);
        assert.ok(six.every((n) => Number.isInteger(n) && n >= 0 && n <= 16), `${row.name}: ${six}`);
        assert.ok(six[0] < six[3] && six[1] < six[4] && six[2] < six[5], `${row.name}: ${six}`);
      }
    }
    if (row.behaviorTemplate === 'Connected') {
      assert.ok(entry[0].boxes.length > 0, `${row.name} centre post must not be empty`);
    }
  }
});

test('slab, stairs, plants, torch and door have the shapes the ADR describes', () => {
  const { shapeTable } = loadOfficialCatalog(ROOT);
  assert.deepEqual(shapeTable['lumio.oak_slab'][0].boxes, [[0, 0, 0, 16, 8, 16]]);
  assert.deepEqual(shapeTable['lumio.oak_slab'][1].boxes, [[0, 8, 0, 16, 16, 16]]);
  assert.deepEqual(shapeTable['lumio.oak_slab'][2].boxes, [[0, 0, 0, 16, 16, 16]]);
  assert.equal(shapeTable['lumio.oak_stairs'].length, 5);
  // Torch: crossed planes only (main session ruling 2026-09-25) - no box, so it never blocks.
  for (const name of ['lumio.poppy', 'lumio.short_grass', 'lumio.oak_sapling', 'lumio.torch']) {
    for (const sub of shapeTable[name]) {
      assert.deepEqual(sub.boxes, [], name);
      assert.ok(sub.crosses.length > 0, name);
    }
  }
  // Door: 0 = closed (a whole panel), 1 = open (one strip on the hinge side, x = 0 in the authoring pose).
  const [closed, open] = shapeTable['lumio.oak_door'];
  assert.equal(closed.boxes.length, 1);
  const [cx0, cy0, cz0, cx1, cy1, cz1] = closed.boxes[0];
  assert.deepEqual([cx0, cx1, cy0, cy1], [0, 16, 0, 16]);
  assert.ok(cz1 - cz0 <= 3);
  assert.equal(open.boxes.length, 1);
  const [ox0, oy0, , ox1, oy1] = open.boxes[0];
  assert.equal(ox0, 0);
  assert.ok(ox1 <= 3, 'open door panel is a strip on the hinge side');
  assert.deepEqual([oy0, oy1], [0, 16]);
  assert.deepEqual(open.crosses, []);
});

test('the catalog validator rejects what the loader rejects (so the passes above are not vacuous)', () => {
  const clone = () => structuredClone(loadOfficialCatalog(ROOT));
  let broken = clone();
  broken.version = 1;
  assert.equal(validateOfficialCatalog(broken), 'block_catalog_version_mismatch');
  broken = clone();
  delete broken.rows[5].lightEmission;
  assert.equal(validateOfficialCatalog(broken), 'block_catalog_row_incomplete');
  broken = clone();
  broken.rows[5].lightEmission = 'ggg';
  assert.equal(validateOfficialCatalog(broken), 'block_light_emission_invalid');
  broken = clone();
  broken.rows[5].stateLayout = [];
  assert.equal(validateOfficialCatalog(broken), 'block_state_layout_invalid');
  broken = clone();
  broken.rows.splice(10, 1);
  assert.equal(validateOfficialCatalog(broken), 'block_catalog_not_dense');
  broken = clone();
  delete broken.shapeTable['lumio.oak_slab'];
  assert.equal(validateOfficialCatalog(broken), 'shape_table_entry_missing');
  broken = clone();
  broken.shapeTable['lumio.oak_door'].push({ boxes: [[0, 0, 0, 16, 16, 3]], crosses: [] });
  assert.equal(validateOfficialCatalog(broken), 'shape_table_sub_shape_count_mismatch');
  broken = clone();
  broken.shapeTable['lumio.oak_fence'][0].boxes = [];
  assert.equal(validateOfficialCatalog(broken), 'shape_table_connected_center_empty');
  broken = clone();
  broken.shapeTable['lumio.oak_slab'][0].boxes = [[0, 0, 0, 16, 8.5, 16]];
  assert.equal(validateOfficialCatalog(broken), 'shape_table_geometry_invalid');
  broken = clone();
  broken.shapeTable['lumio.stone'] = [{ boxes: [[0, 0, 0, 16, 16, 16]], crosses: [] }];
  assert.equal(validateOfficialCatalog(broken), 'shape_table_entry_unknown_block');
  broken = clone();
  broken.rows.find((row) => row.name === 'lumio.torch').stateLayout.yawSplitNum = 8;
  assert.equal(validateOfficialCatalog(broken), 'block_state_layout_invalid');
});

test('committed server.json names the official catalog relative to its own directory', () => {
  const config = loadCommittedServerJson();
  assert.equal(config.voxel_catalog, CATALOG_DECLARED);
});

test('Bomber identities append after C0 without reusing legacy or reserved IDs', () => {
  const rows = loadOfficialCatalog(ROOT).rows.filter((row) => row.blockType > 1021);
  assert.deepEqual(rows.map((row) => [row.blockType, row.name]), [
    [1022, 'lumio.bomber.floor'], [1023, 'lumio.bomber.iron'],
    [1024, 'lumio.bomber.hard_pillar'], [1025, 'lumio.bomber.soft_brick'],
    [1026, 'lumio.bomber.crate'], [1027, 'lumio.bomber.water'],
    [1028, 'lumio.bomber.chest'], [1029, 'lumio.bomber.wood'],
    [1030, 'lumio.bomber.firecracker'], [1031, 'lumio.bomber.ice'],
    [1032, 'lumio.bomber.barrel'],
  ]);
  for (const row of rows) {
    assert.equal(row.assetRef, `asset://blocks/${row.name}`);
    const path = resolve(ROOT, 'Client/Assets/Blocks', `${row.name}.json`);
    const asset = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(asset.format, 'lumio.block-asset.v1');
    for (const texture of Object.values(asset.faces)) readFileSync(resolve(ROOT, 'Client/Assets/Blocks', texture));
  }
});

test('generated Bomber table IDs and static layout resolve to their exact catalog identities', () => {
  const layout = loadLayout(ROOT);
  assert.equal(layout.floorType, 1022);
  assert.equal(layout.wallType, 1023);
  assert.equal(layout.pillarType, 1024);
  assert.equal(catalogCoversLayout(loadOfficialCatalog(ROOT), layout), true);
  const sparse = {
    version: 2,
    retiredNames: [],
    rows: [
      { blockType: 256, name: 'lumio.stone' },
      { blockType: 258, name: 'lumio.hard_wall' },
      { blockType: 1000, name: 'lumio.ore' },
    ],
    shapeTable: {},
  };
  assert.equal(catalogCoversLayout(sparse, layout), false);
  const v1 = { ...buildOfficialCatalog(layout), version: 1 };
  assert.equal(catalogCoversLayout(v1, layout), false);
  assert.equal(catalogCoversLayout(loadOfficialCatalog(ROOT), { ...layout, floorType: 1 }), false);
});
