import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { engineDir } from './engine-release.mjs';
import { prepareSeededConfig, validateMatchSeed } from './seeded-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('seed admission rejects invalid numeric input without truncation or coercion', () => {
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity, '1', null])
    assert.throws(() => validateMatchSeed(seed), /unsigned 32-bit/);
  for (const seed of [0, 1, 101, 0xffffffff]) assert.equal(validateMatchSeed(seed), seed);
});

test('official compiler preserves selected tuning and exports exact seeds to both ends', async () => {
  const releaseRoot = resolve(process.env.LUMIO_ENGINE_CANDIDATE_ROOT || engineDir(root));
  const { runAuthoring } = await import(pathToFileURL(join(releaseRoot, 'tools/authoring.mjs')));
  const proof = mkdtempSync(join(root, '.run', 'seeded-config-test-'));
  const source = join(proof, 'authored'); mkdirSync(source, { recursive: true });
  for (const entry of ['repository.yaml', 'schemas', 'tables', 'registry'])
    cpSync(join(root, 'Gameplay/Tables', entry), join(source, entry), { recursive: true });
  // The tool's fixture authors a seed column through the real compiler, never patches exports.
  const schemaPath = join(source, 'schemas/game.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  if (!schema.columns.some(column => column.name === 'initial_seed')) {
    schema.columns.push({ name: 'initial_seed', ordinal: schema.columns.length, type: 'u32', required: true,
      visibility: 'CS', sharedPrediction: false, minimum: 0, description: 'Initial authoritative match seed' });
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    const file = join(source, 'tables/game.txt');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines[3] = `${lines[3].trimEnd()} initial_seed |`;
    lines[4] = `${lines[4].trimEnd()} --- |`;
    lines[5] = `${lines[5].trimEnd()} 1 |`;
    writeFileSync(file, lines.join('\n'));
  }
  const environment = join(source, 'layers/environment'); mkdirSync(environment, { recursive: true });
  writeFileSync(join(environment, 'game.txt'), 'table: game\nschema: schemas/game.json\n\n| name | initial_seed | match_duration_ms |\n| --- | --- | --- |\n| default | 1 | 360000 |\n');
  const serverDirectory = join(proof, 'baseline/server'), clientDirectory = join(proof, 'baseline/client');
  const baseline = runAuthoring('config-compiler', ['export', '--root', source, '--client-out', clientDirectory, '--server-out', serverDirectory],
    { root: releaseRoot, stdio: 'pipe' });
  writeFileSync(join(proof, 'baseline.log'), Buffer.concat([Buffer.from(baseline.stdout ?? ''), Buffer.from(baseline.stderr ?? '')]));
  assert.equal(baseline.status, 0, 'actual packaged compiler must accept the authored fixture');
  const options = { root, releaseRoot, authoringRoot: source, serverDirectory, clientDirectory };
  const noChange = await prepareSeededConfig({ ...options, seed: 1, outputRoot: join(proof, 'unchanged') });
  assert.equal(noChange.compiled, false);
  for (const seed of [0, 101, 0xffffffff]) {
    const result = await prepareSeededConfig({ ...options, seed, outputRoot: join(proof, `seed-${seed}`) });
    assert.equal(result.compiled, true);
    for (const side of ['server', 'client']) {
      const table = JSON.parse(readFileSync(join(result[`${side}Directory`], side, 'game.json'), 'utf8')).rows[0];
      assert.equal(table.initial_seed, seed);
      assert.equal(table.match_duration_ms, 360000, 'preserve existing environment layer fields');
    }
    assert.match(result.releaseManifestSha256, /^[a-f0-9]{64}$/);
    assert.match(result.serverManifestSha256, /^[a-f0-9]{64}$/);
    assert.match(result.clientManifestSha256, /^[a-f0-9]{64}$/);
  }
  const changedSource = readFileSync(join(environment, 'game.txt'), 'utf8').replace('360000', '480000');
  writeFileSync(join(environment, 'game.txt'), changedSource);
  await assert.rejects(prepareSeededConfig({ ...options, seed: 2, outputRoot: join(proof, 'stale-selection') }), /differs from its authored source/);
  for (const side of ['server', 'client'])
    assert.equal(JSON.parse(readFileSync(join(options[`${side}Directory`], side, 'game.json'), 'utf8')).rows[0].initial_seed, 1,
      'the selected original export must remain unchanged');
  console.log(`seeded config evidence: ${proof}`);
});
