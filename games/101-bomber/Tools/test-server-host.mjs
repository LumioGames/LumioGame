#!/usr/bin/env node

/**
 * Run the two engine-level admit/spawn cases that moved here from LumioServer
 * (ADR-115 §3 / R-00692), each in its own process.
 *
 * `Lumio.Server.HostEntry` is a process-scoped singleton managed context: two
 * registries in one process poison each other, which is why LumioServer ran
 * these through `Tools/test-host-entry.mjs`'s `isolatedCases` manifest. The
 * manifest moves with the cases.
 *
 *   node Tools/test-server-host.mjs <results-directory> [extra dotnet build args]
 *
 * Required inputs (all named, none optional — a missing one fails by name):
 *   LUMIO_BOMBER_GAMEPLAY_DLL    this run's Gameplay build (server side)
 *   LUMIO_CONFIG_DIR             Server/Config/Tables (the server end's export)
 *   LUMIO_TEST_VOXEL_FIXTURE_DIR catalog-world.json + catalog-world.capture
 * HostEntry and the Runtime three-path are the Engine/ release's (ADR-123); the cases read
 * them from Engine/server/<rid>/ themselves (Server/Tests/EngineRelease.cs).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const PROJECT = 'Tools/Lumio.Bomber.Server.HostTests/Lumio.Bomber.Server.HostTests.csproj';

/** One process per case; the count is the gate, so a dropped case is a failure. */
export const isolatedCases = [
  'AdmitOnBomberRegistryRuntimeOnly',
  'AdmitOnBomberRegistryWithVoxel',
];

export const REQUIRED_ENV = [
  'LUMIO_BOMBER_GAMEPLAY_DLL',
  'LUMIO_CONFIG_DIR',
  'LUMIO_TEST_VOXEL_FIXTURE_DIR',
];

export const fullyQualified = name => `Lumio.Bomber.Server.HostTests.BomberAdmitSpawnTests.${name}`;

export function missingEnv(env = process.env) {
  return REQUIRED_ENV.filter(name => !env[name] || String(env[name]).trim() === '');
}

export function runSuite({ resultsRoot, dotnetArgs = [], execute = spawnSync, env = process.env } = {}) {
  const missing = missingEnv(env);
  if (missing.length > 0) {
    // Not `BLOCKED_ENV`. ADR-113 决策 2 classifies a missing artifact as a
    // failure, and `BLOCKED_ENV` is this workspace's token for "the environment
    // cannot run this", which callers are entitled to tolerate. These cases
    // carry engine guarantees, so "did not arrive" has to read as a failure to
    // whoever wraps this script next.
    throw new Error(
      `MISSING_INPUT: these cases carry engine guarantees and may not be skipped, but ${missing.join(', ')} did not arrive. `
      + 'Run Tools/prepare-server-host-inputs.mjs, which produces and names every one of them.',
    );
  }
  mkdirSync(resultsRoot, { recursive: true });
  const results = mkdtempSync(join(resolve(resultsRoot), 'run-'));
  const run = (args, log) => {
    const result = execute('dotnet', args, { cwd: ROOT, env: { ...env, DOTNET_CLI_UI_LANGUAGE: 'en' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? '');
    writeFileSync(join(results, log), output);
    process.stdout.write(output);
    return { ok: result.status === 0, output };
  };
  if (!run(['build', PROJECT, '-c', 'Release', ...dotnetArgs], 'build.log').ok) {
    throw new Error(`Build failed; see ${results}`);
  }
  const summary = [];
  for (const name of isolatedCases) {
    const { ok, output } = run(
      ['test', PROJECT, '-c', 'Release', '--no-build', '--no-restore',
        '--', '--filter-method', fullyQualified(name), '--minimum-expected-tests', '1'],
      `${name}.log`);
    const parsed = parseSummary(output);
    summary.push({ name, success: ok && parsed.status === 'Passed!', ...parsed.counts });
  }
  writeFileSync(join(results, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ results, summary }, null, 2));
  // One line the CI job greps for. ADR-113 决策 1 measures a job by its skip
  // count, and a run that filtered both cases away would otherwise leave
  // nothing in the log to contradict a green exit.
  console.log(`HOST_SUITE cases=${summary.length} ${['total', 'passed', 'failed', 'skipped']
    .map(key => `${key}=${summary.reduce((sum, row) => sum + row[key], 0)}`).join(' ')}`);
  return summary.every(row => row.success && row.total === 1 && row.passed === 1 && row.failed === 0 && row.skipped === 0);
}

/**
 * Microsoft.Testing.Platform prints one summary block per run.
 *
 * The escapes have to come off first. On a CI runner the platform colours the
 * block, so the lines arrive as `ESC[m  total: 1` and `^\s*total:` matches
 * nothing — every count reads NaN. R-00702's first CI run failed exactly
 * there: both cases had passed and the line still said `total=NaN passed=NaN`.
 * It failed closed, which is right, but the counts were unreadable, and
 * nothing local reproduces it because the platform only colours on CI.
 */
const invalidCounts = () => ({ total: Number.NaN, passed: Number.NaN, failed: Number.NaN, skipped: Number.NaN });

function parseSummary(output) {
  const plain = String(output).replaceAll(/\u001B\[[0-9;]*[A-Za-z]/gu, '');
  const lines = plain.replaceAll('\r\n', '\n').split('\n');
  const counter = /^\s*(total|failed|succeeded|skipped)\s*:/u;
  const header = /^\s*Test run summary:/u;
  let status;
  let counts;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (header.test(line)) {
      const match = line.match(/^\s*Test run summary:\s*(Passed!|Failed!)\s*$/u);
      if (!match || status !== undefined) return { status: undefined, counts: invalidCounts() };
      status = match[1];
      const values = new Map();
      while (index + 1 < lines.length && counter.test(lines[index + 1])) {
        const entry = lines[++index].match(/^\s*(total|failed|succeeded|skipped):\s*(\d+)\s*$/u);
        if (!entry || values.has(entry[1])) return { status: undefined, counts: invalidCounts() };
        const value = Number(entry[2]);
        if (!Number.isSafeInteger(value)) return { status: undefined, counts: invalidCounts() };
        values.set(entry[1], value);
      }
      if (values.size !== 4) return { status: undefined, counts: invalidCounts() };
      counts = {
        total: values.get('total'), passed: values.get('succeeded'),
        failed: values.get('failed'), skipped: values.get('skipped'),
      };
      if (counts.total !== counts.passed + counts.failed + counts.skipped) {
        return { status: undefined, counts: invalidCounts() };
      }
    } else if (counter.test(line)) {
      return { status: undefined, counts: invalidCounts() };
    }
  }
  return { status, counts: counts ?? invalidCounts() };
}

export function parseCounts(output) {
  return parseSummary(output).counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [resultsRoot, ...dotnetArgs] = process.argv.slice(2);
  if (!resultsRoot) throw new Error('Usage: node Tools/test-server-host.mjs <results-directory> [dotnet build arguments]');
  process.exitCode = runSuite({ resultsRoot, dotnetArgs }) ? 0 : 1;
}
