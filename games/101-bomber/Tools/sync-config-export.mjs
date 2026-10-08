#!/usr/bin/env node

/**
 * Sync the committed per-end table exports from LumioConfig.
 *
 *   node Tools/sync-config-export.mjs
 *   node Tools/sync-config-export.mjs --check
 *
 * ADR-115 / `split-export/1`: one compile writes `C` to Client/Config/Tables and
 * `S`+`V` to Server/Config/Tables. The single-root `config/` export is retired
 * in this workspace. Determinism is proved by exporting twice into fresh
 * directories and comparing bytes before anything is written into the tree.
 *
 * Each named profile points a DS/client at its matching exported end. It uses the same source
 * (`Gameplay/Tables`) plus the LumioConfig overlay layers under
 * `Gameplay/Tables/profiles/<name>/layers/`, which may only override cells of
 * existing rows. Its ends are committed at `Server/Config/Profiles/<name>/` and
 * `Client/Config/Tables/profiles/<name>/`;
 * its C# Readers must equal the default ones (an overlay never changes a schema).
 */

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportCsharpReaders, resolveConfigRoot, tableRoot } from './sync-config-readers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const sourceRoot = join(root, 'Gameplay', 'Tables');
const profilesRoot = join(sourceRoot, 'profiles');
const exports = [];
const scratchRoots = [];

/** Server profiles: `Gameplay/Tables/profiles/<name>/` -> `Server/Config/Profiles/<name>/`. */
const SERVER_PROFILES = Object.freeze(JSON.parse(readFileSync(join(sourceRoot, 'profiles.json'), 'utf8')).profiles.map(profile => profile.name));

function profileTableRoot(repoRoot, name) {
  return join(repoRoot, 'Server', 'Config', 'Profiles', name);
}

function files(directory, prefix = '', excludedTop = []) {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).filter(entry => prefix !== '' || !excludedTop.includes(entry.name)).flatMap(entry => {
    const relative = join(prefix, entry.name);
    return entry.isDirectory() ? files(directory, relative) : [relative];
  }).sort();
}

function exportTwice(configRoot, source, label) {
  const runs = [];
  // The compiler hashes every file under each end root, so both runs require fresh trees.
  for (let run = 0; run < 2; run++) {
    const exported = exportCsharpReaders({ configRoot, sourceRoot: source });
    exports.push(exported);
    runs.push(exported);
  }
  for (const kind of ['clientOut', 'serverOut', 'csharpOut']) {
    const names = files(runs[0][kind]);
    assert.ok(names.length > 0, `${label} ${kind}: export wrote no files`);
    assert.deepEqual(names, files(runs[1][kind]), `${label} ${kind}: file sets differ`);
    for (const name of names) {
      assert.deepEqual(readFileSync(join(runs[0][kind], name)), readFileSync(join(runs[1][kind], name)),
        `${label} ${kind}/${name}: clean exports differ`);
    }
    console.log(`${label} ${kind}: two clean exports are byte-identical (${names.length} files)`);
  }
  return runs[0];
}

function syncEnd(exported, destinationRoot, label, preservedTop = []) {
  const names = files(exported);
  for (const name of names) {
    const bytes = readFileSync(join(exported, name));
    const destination = join(destinationRoot, name);
    if (!checkOnly) {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    assert.ok(existsSync(destination), `${label}/${name}: committed export is missing`);
    assert.deepEqual(readFileSync(destination), bytes, `${label}/${name}: committed export differs`);
  }
  // A table whose columns stop being visible on this end must not linger as a
  // stale committed file; the compiler only removes paths it still owns.
  const committed = files(destinationRoot, '', preservedTop);
  const stale = committed.filter(name => !names.includes(name));
  if (stale.length > 0) {
    if (checkOnly) assert.fail(`${label}: committed export carries files the compiler no longer writes: ${stale.join(', ')}`);
    for (const name of stale) unlinkSync(join(destinationRoot, name));
    console.log(`${label}: removed ${stale.length} stale export file(s): ${stale.join(', ')}`);
  }
  console.log(`${checkOnly ? 'verified' : 'synced'} ${label}: ${names.length} file(s) under ${destinationRoot.slice(root.length + 1)}`);
}

/** The profile's compile root: the shared source plus only that profile's overlay layers. */
function profileSource(name) {
  const overlay = join(profilesRoot, name, 'layers');
  assert.ok(existsSync(overlay), `profile ${name}: ${overlay.slice(root.length + 1)} is missing`);
  for (const layer of readdirSync(overlay)) assert.ok(['engine', 'platform', 'server', 'product', 'environment'].includes(layer),
    `profile ${name}: unknown LumioConfig layer ${layer}; the compiler would ignore it`);
  assert.ok(!existsSync(join(sourceRoot, 'layers')),
    'Gameplay/Tables/layers would apply to every profile; put overlays under Gameplay/Tables/profiles/<name>/layers');
  const scratch = mkdtempSync(join(tmpdir(), `lumio-bomber-profile-${name}-`));
  scratchRoots.push(scratch);
  for (const entry of ['repository.yaml', 'schemas', 'tables', 'registry']) {
    cpSync(join(sourceRoot, entry), join(scratch, entry), { recursive: true });
  }
  cpSync(overlay, join(scratch, 'layers'), { recursive: true });
  return scratch;
}

try {
  const configRoot = resolveConfigRoot({ repoRoot: root });
  const base = exportTwice(configRoot, sourceRoot, 'default');

  // The client end must never carry a server-only projection.
  for (const name of files(base.clientOut)) {
    assert.ok(!name.startsWith('server') && !name.startsWith('voxel') && name !== 'origins.json',
      `client export must not contain ${name}`);
  }

  for (const side of ['client', 'server']) syncEnd(base[`${side}Out`], tableRoot(root, side), side, side === 'client' ? ['profiles'] : []);

  const declared = existsSync(profilesRoot) ? readdirSync(profilesRoot).filter(name => !name.startsWith('.')).sort() : [];
  assert.deepEqual(declared, [...SERVER_PROFILES].sort(), 'Gameplay/Tables/profiles must list exactly the server profiles this tool syncs');
  for (const name of SERVER_PROFILES) {
    const profile = exportTwice(configRoot, profileSource(name), `profile ${name}`);
    for (const reader of files(base.csharpOut)) {
      assert.deepEqual(readFileSync(join(profile.csharpOut, reader)), readFileSync(join(base.csharpOut, reader)),
        `profile ${name}: overlay changed the generated Reader ${reader}`);
    }
    syncEnd(profile.serverOut, profileTableRoot(root, name), `profile ${name} server`);
    syncEnd(profile.clientOut, join(tableRoot(root, 'client'), 'profiles', name), `profile ${name} client`);
  }
  for (const directory of [join(root, 'Server/Config/Profiles'), join(tableRoot(root, 'client'), 'profiles')]) {
    for (const name of readdirSync(directory)) {
      if (SERVER_PROFILES.includes(name)) continue;
      if (checkOnly) assert.fail(`Stale profile export: ${directory}/${name}`);
      const stale = resolve(directory, name);
      assert.equal(dirname(stale), resolve(directory));
      rmSync(stale, { recursive: true, force: true });
    }
  }
  console.log(`OK: per-end manifests included; compiler=${configRoot}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const exported of exports) rmSync(exported.scratch, { recursive: true, force: true });
  for (const scratch of scratchRoots) rmSync(scratch, { recursive: true, force: true });
}
