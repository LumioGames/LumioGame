#!/usr/bin/env node

/**
 * Sync the Bomber typed Readers from LumioConfig `export --csharp-out`.
 *
 * Do not hand-edit Client/Config/Generated/** or Server/Config/Generated/**. Re-run:
 *
 *   node Tools/sync-config-readers.mjs
 *   node Tools/sync-config-readers.mjs --check
 *
 * `--check` re-exports and asserts the committed files are byte-identical
 * (git diff empty on those paths). Missing LumioConfig is a loud error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pascal = name => name.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('');
const schemas = () => readdirSync(join(ROOT, 'Gameplay/Tables/schemas')).filter(name => name.endsWith('.json')).sort()
  .map(name => JSON.parse(readFileSync(join(ROOT, 'Gameplay/Tables/schemas', name), 'utf8')));
export const READER_FILES = Object.freeze(['server', 'client'].flatMap(side => schemas()
  .filter(schema => schema.columns.some(column => column.visibility.includes(side === 'server' ? 'S' : 'C')))
  .map(schema => [side, `${pascal(schema.table)}Table.cs`])));

/** ADR-115: each end owns its typed Readers under `<End>/Config/Generated`. */
export const READER_ROOTS = Object.freeze({
  client: ['Client', 'Config', 'Generated'],
  server: ['Server', 'Config', 'Generated'],
});

/** ADR-115: each end owns its exported tables under `<End>/Config/Tables`. */
export const TABLE_ROOTS = Object.freeze({
  client: ['Client', 'Config', 'Tables'],
  server: ['Server', 'Config', 'Tables'],
});

export function readerDest(repoRoot, side, name) {
  return join(repoRoot, ...READER_ROOTS[side], name);
}

export function tableRoot(repoRoot, side) {
  return join(repoRoot, ...TABLE_ROOTS[side]);
}

export function resolveConfigRoot({ env = process.env, repoRoot = ROOT } = {}) {
  const candidates = [
    env.LUMIO_CONFIG_ROOT,
    env.LUMIO_ENGINE_CANDIDATE_ROOT,
    repoRoot ? resolve(repoRoot, 'Engine') : undefined,
    repoRoot ? resolve(repoRoot, 'Engine', 'config') : undefined,
    repoRoot ? resolve(repoRoot, '..', '..', '..', 'LumioConfig') : undefined,
    repoRoot ? resolve(repoRoot, '..', 'LumioConfig') : undefined,
  ].filter((value) => typeof value === 'string' && value.trim() !== '');
  for (const raw of candidates) {
    const root = resolve(raw);
    if (existsSync(join(root, 'tools', 'lumio_config.py')) || existsSync(join(root, 'tools', 'authoring.mjs'))) return root;
  }
  return null;
}

function pythonBin(env = process.env) {
  if (env.LUMIO_PYTHON) return env.LUMIO_PYTHON;
  if (env.PYTHON) return env.PYTHON;
  if (process.platform === 'win32') return 'py -3';
  for (const candidate of ['python3.13', 'python3.12', 'python3.11', 'python3']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'], {
      encoding: 'utf8',
    });
    if (probe.status === 0) return candidate;
  }
  return 'python3';
}

/**
 * One compile, two end directories (`split-export/1`). `--out` is retired here:
 * `C` lands in the client tree and `S`+`V` in the server tree, which is what
 * ADR-115 requires the game workspace to carry.
 */
export function exportCsharpReaders({ configRoot, sourceRoot = join(ROOT, 'Gameplay', 'Tables'), python = pythonBin(), env = process.env } = {}) {
  if (!configRoot) {
    throw new Error(
      'BLOCKED_ENV: Engine release does not bundle the LumioConfig compiler. Set LUMIO_CONFIG_ROOT to an existing LumioConfig checkout (Python 3.11+), then re-run node Tools/sync-config-readers.mjs.',
    );
  }
  const cli = join(configRoot, 'tools', 'lumio_config.py');
  const scratch = mkdtempSync(join(tmpdir(), 'lumio-bomber-csharp-'));
  const clientOut = join(scratch, 'client-export');
  const serverOut = join(scratch, 'server-export');
  const csharpOut = join(scratch, 'csharp');
  for (const directory of [clientOut, serverOut, csharpOut]) mkdirSync(directory, { recursive: true });
  const pythonCommand = python === 'py -3' ? ['py', '-3'] : [python];
  const exportArgs = ['export', '--root', sourceRoot, '--client-out', clientOut, '--server-out', serverOut, '--csharp-out', csharpOut];
  const packaged = existsSync(join(configRoot, 'tools', 'authoring.mjs'));
  const command = packaged ? [process.execPath, join(configRoot, 'tools', 'config-compiler.mjs')]
    : [...pythonCommand, cli];
  const result = spawnSync(command[0], [...command.slice(1), ...exportArgs], {
    cwd: configRoot,
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(
      `LumioConfig export --client-out/--server-out failed (exit ${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }
  return { scratch, clientOut, serverOut, csharpOut, stdout: result.stdout };
}

export function copyReaders(csharpOut, repoRoot) {
  const copied = [];
  for (const [side, name] of READER_FILES) {
    const source = join(csharpOut, side, name);
    const dest = readerDest(repoRoot, side, name);
    if (!existsSync(source)) {
      throw new Error(`LumioConfig export did not write ${side}/${name}`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(source));
    copied.push({ side, name, dest });
  }
  for (const side of ['server', 'client']) {
    const owned = READER_FILES.filter(([end]) => end === side).map(([, name]) => name);
    for (const name of readdirSync(join(repoRoot, ...READER_ROOTS[side]))) {
      if (name.endsWith('.cs') && !owned.includes(name)) unlinkSync(readerDest(repoRoot, side, name));
    }
  }
  return copied;
}

export function diffReaders(csharpOut, repoRoot) {
  const diffs = [];
  for (const [side, name] of READER_FILES) {
    const source = join(csharpOut, side, name);
    const dest = readerDest(repoRoot, side, name);
    if (!existsSync(source)) {
      diffs.push({ side, name, reason: 'missing-export' });
      continue;
    }
    if (!existsSync(dest)) {
      diffs.push({ side, name, reason: 'missing-committed' });
      continue;
    }
    const exported = readFileSync(source);
    const committed = readFileSync(dest);
    if (!exported.equals(committed)) {
      diffs.push({ side, name, reason: 'bytes-differ' });
    }
  }
  for (const side of ['server', 'client']) {
    const directory = join(repoRoot, ...READER_ROOTS[side]);
    if (!existsSync(directory)) continue;
    const owned = READER_FILES.filter(([end]) => end === side).map(([, name]) => name);
    for (const name of readdirSync(directory)) if (name.endsWith('.cs') && !owned.includes(name)) diffs.push({ side, name, reason: 'stale-reader' });
  }
  return diffs;
}

/** The M9 adapter constructs compiler Readers from already-validated snapshot cells.
 * This is an adapter, never a replacement Reader/parser. Generate it from the same
 * schemas so adding a column cannot silently leave its business binding behind. */
export function typedAdapterSource() {
  const entries = schemas();
  const parse = { u32: 'UInt', ref: 'UInt', i32: 'Int', i64: 'Long', bool: 'Bool', string: 'Text' };
  const getters = entries.map(schema => `    public ${pascal(schema.table)}Table ${pascal(schema.table)} { get; }`).join('\n');
  const constructors = entries.map(schema => `        ${pascal(schema.table)} = new ${pascal(schema.table)}Table(Read(tables, "${schema.table}", cells => new ${pascal(schema.table)}Row(${schema.columns.map(c => `${parse[c.type]}(cells, "${c.name}")`).join(', ')})));`).join('\n');
  const lookup = entries.map(schema => `        if (typeof(TTable) == typeof(${pascal(schema.table)}Table)) { table = (TTable)(object)${pascal(schema.table)}; return true; }`).join('\n');
  const fromSnapshot = entries.map(schema => `        ${pascal(schema.table)} = Require<${pascal(schema.table)}Table>(snapshot);`).join('\n');
  for (const schema of entries) for (const c of schema.columns) {
    if (!parse[c.type] || !c.visibility.includes('C') || !c.visibility.includes('S')) throw new Error(`Adapter schema unsupported: ${schema.table}.${c.name}; extend the adapter explicitly.`);
  }
  return `// <auto-generated> M9 adapter from schemas; node Tools/sync-config-readers.mjs. </auto-generated>
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.GameRuntime.Config;

namespace Lumio.Bomber.Gameplay.Config;

public sealed class BomberTypedTables : ITypedTableSet
{
    public static IReadOnlyList<string> TableNames { get; } = Array.AsReadOnly(new[] { ${entries.map(schema => `"${schema.table}"`).join(', ')} });
${getters}

    private BomberTypedTables(IReadOnlyList<ConfigSnapshotTable> tables)
    {
${constructors}
    }

    public BomberTypedTables(IConfigSnapshotView snapshot)
    {
${fromSnapshot}
    }

    private static TTable Require<TTable>(IConfigSnapshotView snapshot) => snapshot.TryGetTable<TTable>(out var table)
        ? table : throw new InvalidOperationException("Typed Reader missing: " + typeof(TTable).Name);

    public static ITypedTableSet Create(ConfigTarget target, IReadOnlyList<ConfigSnapshotTable> tables)
    {
        if (target != BomberConfigProjection.Target) throw new ArgumentException("Config projection does not match this assembly.", nameof(target));
        return new BomberTypedTables(tables);
    }

    public bool TryGetTable<TTable>(out TTable table)
    {
${lookup}
        table = default!;
        return false;
    }

    private static IReadOnlyList<TRow> Read<TRow>(IReadOnlyList<ConfigSnapshotTable> tables, string name, Func<IReadOnlyDictionary<string, string>, TRow> create)
    {
        var table = tables.SingleOrDefault(item => item.TableId == name)
            ?? throw new InvalidOperationException("Required config table is missing: " + name);
        var result = new List<TRow>();
        foreach (var row in table.Rows)
        {
            var cells = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var cell in row.Cells) cells.Add(cell.Column, cell.CanonicalText);
            result.Add(create(cells));
        }
        return result;
    }

    private static string Text(IReadOnlyDictionary<string, string> cells, string key) => cells.TryGetValue(key, out var value)
        ? value : throw new InvalidOperationException("Required config cell is missing: " + key);
    private static uint UInt(IReadOnlyDictionary<string, string> cells, string key) => uint.Parse(Text(cells, key), NumberStyles.Integer, CultureInfo.InvariantCulture);
    private static int Int(IReadOnlyDictionary<string, string> cells, string key) => int.Parse(Text(cells, key), NumberStyles.Integer, CultureInfo.InvariantCulture);
    private static long Long(IReadOnlyDictionary<string, string> cells, string key) => long.Parse(Text(cells, key), NumberStyles.Integer, CultureInfo.InvariantCulture);
    private static bool Bool(IReadOnlyDictionary<string, string> cells, string key) => bool.Parse(Text(cells, key));
}
`;
}

export function syncConfigReaders({
  repoRoot = ROOT,
  env = process.env,
  checkOnly = false,
} = {}) {
  const configRoot = resolveConfigRoot({ env, repoRoot });
  const exported = exportCsharpReaders({ configRoot, env });
  try {
    const adapter = join(repoRoot, 'Gameplay/Config/BomberTypedTables.cs');
    const adapterSource = typedAdapterSource();
    if (checkOnly) {
      if (!existsSync(adapter) || readFileSync(adapter, 'utf8') !== adapterSource) throw new Error('M9 typed adapter differs from source schemas. Run node Tools/sync-config-readers.mjs.');
    } else writeFileSync(adapter, adapterSource);
    if (checkOnly) {
      const diffs = diffReaders(exported.csharpOut, repoRoot);
      if (diffs.length > 0) {
        const list = diffs.map((item) => `${item.side}/${item.name} (${item.reason})`).join(', ');
        throw new Error(`typed Readers drifted from LumioConfig export --csharp-out: ${list}`);
      }
      return { status: 'OK', checkOnly: true, files: READER_FILES.length, configRoot };
    }
    copyReaders(exported.csharpOut, repoRoot);
    const diffs = diffReaders(exported.csharpOut, repoRoot);
    if (diffs.length > 0) {
      throw new Error('copy left a non-empty diff against the export');
    }
    return { status: 'OK', checkOnly: false, files: READER_FILES.length, configRoot };
  } finally {
    rmSync(exported.scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const checkOnly = process.argv.includes('--check');
    const result = syncConfigReaders({ checkOnly });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
