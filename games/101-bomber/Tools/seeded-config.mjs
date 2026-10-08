import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function validateMatchSeed(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error('Match seed must be an unsigned 32-bit integer.');
  return value;
}

const row = (directory, side) => {
  const rows = JSON.parse(readFileSync(join(directory, side, 'game.json'), 'utf8')).rows;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].name !== 'default')
    throw new Error('Seed selection requires exactly one default game row.');
  return rows[0];
};

function sameTables(expected, actual, side) {
  const files = directory => readdirSync(join(directory, side)).filter(name => name.endsWith('.json') && name !== 'manifest.json').sort();
  assert.deepEqual(files(actual), files(expected), 'Selected config must match the complete authored table set.');
  for (const file of files(expected)) {
    const read = directory => JSON.parse(readFileSync(join(directory, side, file), 'utf8')).rows;
    assert.deepEqual(read(actual), read(expected), `Selected ${side}/${file} differs from its authored source; refuse to discard overrides.`);
  }
}

function seedLayer(source, seed) {
  const directory = join(source, 'layers', 'environment');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'game.txt');
  if (!existsSync(file)) {
    writeFileSync(file, `table: game\nschema: schemas/game.json\n\n| name | initial_seed |\n| --- | --- |\n| default | ${seed} |\n`);
    return;
  }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const cells = line => line.trim().slice(1, -1).split('|').map(cell => cell.trim());
  const headerIndex = lines.findIndex(line => /^\s*\|/.test(line) && cells(line).includes('name'));
  if (headerIndex < 0) throw new Error('Seed environment layer has no supported table header.');
  const header = cells(lines[headerIndex]);
  const nameIndex = header.indexOf('name');
  let seedIndex = header.indexOf('initial_seed');
  const append = seedIndex < 0;
  if (append) { seedIndex = header.length; header.push('initial_seed'); }
  let count = 0;
  for (let index = headerIndex + 2; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const values = cells(lines[index]);
    if (values.length !== header.length - (append ? 1 : 0) || values[nameIndex] !== 'default')
      throw new Error('Seed environment layer has an unsupported row; refuse to rewrite it.');
    values[seedIndex] = String(seed); count++;
    lines[index] = `| ${values.join(' | ')} |`;
  }
  if (count !== 1) throw new Error('Seed environment layer requires one default row.');
  lines[headerIndex] = `| ${header.join(' | ')} |`;
  lines[headerIndex + 1] = `| ${header.map(() => '---').join(' | ')} |`;
  writeFileSync(file, lines.join('\n'));
}

/** Compile one immutable per-run seed through the selected official release's authoring tool.
 * Both selected ends are first compared with a clean source export; no exported JSON is patched.
 */
export async function prepareSeededConfig({ root, releaseRoot, serverDirectory, clientDirectory, seed, outputRoot, authoringRoot, profile } = {}) {
  validateMatchSeed(seed);
  const server = row(serverDirectory, 'server');
  const client = row(clientDirectory, 'client');
  validateMatchSeed(server.initial_seed);
  validateMatchSeed(client.initial_seed);
  if (server.initial_seed !== client.initial_seed) throw new Error('Server and client initial seeds differ.');
  if (server.initial_seed === seed) return { serverDirectory, clientDirectory, seed, compiled: false };
  root = resolve(root);
  if (!authoringRoot) {
    const defaultSelection = resolve(serverDirectory) === join(root, 'Server/Config/Tables') &&
      resolve(clientDirectory) === join(root, 'Client/Config/Tables');
    if (!defaultSelection) {
      const profiles = JSON.parse(readFileSync(join(root, 'Gameplay/Tables/profiles.json'), 'utf8')).profiles;
      profile = profiles.find(candidate => resolve(serverDirectory) === join(root, 'Server/Config/Profiles', candidate.name) &&
        resolve(clientDirectory) === join(root, 'Client/Config/Tables/profiles', candidate.name))?.name;
      if (!profile) throw new Error('A custom config selection needs its authored source before changing the seed.');
    }
    authoringRoot = join(root, 'Gameplay/Tables');
  }
  if (existsSync(outputRoot)) throw new Error('Seed export needs a fresh output directory.');
  const source = join(outputRoot, 'source');
  mkdirSync(source, { recursive: true });
  for (const entry of ['repository.yaml', 'schemas', 'tables', 'registry'])
    cpSync(join(authoringRoot, entry), join(source, entry), { recursive: true });
  if (existsSync(join(authoringRoot, 'layers'))) cpSync(join(authoringRoot, 'layers'), join(source, 'layers'), { recursive: true });
  if (profile) {
    if (!/^[a-z0-9-]+$/.test(profile)) throw new Error('Invalid authored config profile.');
    cpSync(join(authoringRoot, 'profiles', profile, 'layers'), join(source, 'layers'), { recursive: true });
  }
  const { runAuthoring } = await import(pathToFileURL(join(releaseRoot, 'tools/authoring.mjs')));
  const compile = label => {
    const directory = join(outputRoot, label);
    const clientOut = join(directory, 'client-export'), serverOut = join(directory, 'server-export');
    mkdirSync(directory, { recursive: true });
    const result = runAuthoring('config-compiler', ['export', '--root', source, '--client-out', clientOut, '--server-out', serverOut],
      { root: releaseRoot, stdio: 'pipe' });
    writeFileSync(join(directory, 'compiler.log'), Buffer.concat([Buffer.from(result.stdout ?? ''), Buffer.from(result.stderr ?? '')]));
    if (result.status !== 0) throw new Error(`Seed config export failed (${result.status}); see ${directory}/compiler.log`);
    return { clientDirectory: clientOut, serverDirectory: serverOut };
  };
  const baseline = compile('baseline');
  sameTables(baseline.serverDirectory, serverDirectory, 'server');
  sameTables(baseline.clientDirectory, clientDirectory, 'client');
  seedLayer(source, seed);
  const selected = compile('selected');
  assert.equal(row(selected.serverDirectory, 'server').initial_seed, seed);
  assert.equal(row(selected.clientDirectory, 'client').initial_seed, seed);
  const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const evidence = { ...selected, seed, compiled: true, releaseManifestSha256: sha(join(releaseRoot, 'manifest.json')),
    serverManifestSha256: sha(join(selected.serverDirectory, 'manifest.json')),
    clientManifestSha256: sha(join(selected.clientDirectory, 'manifest.json')) };
  writeFileSync(join(outputRoot, 'selection.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}
