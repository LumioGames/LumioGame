import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { REQUIRED_ENV, isolatedCases, missingEnv, parseCounts, runSuite } from './test-server-host.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'lumio-hostsuite-'));

const full = Object.fromEntries(REQUIRED_ENV.map(name => [name, `/fake/${name}`]));

/**
 * Microsoft.Testing.Platform's summary block, as the suite prints it. `colour`
 * is what a CI runner actually receives; the platform only colours when it
 * detects CI, which is why R-00702's first CI run read every count as NaN
 * while every local run parsed cleanly.
 */
const ESC = String.fromCharCode(27);
const summary = ({ total = 1, succeeded = 1, failed = 0, skipped = 0, colour = false } = {}) => {
  const paint = (code, text) => (colour ? `${ESC}[${code}m${text}` : text);
  return [
    paint(failed ? 31 : 32, `Test run summary: ${failed ? 'Failed!' : 'Passed!'}`),
    paint(0, `  total: ${total}`),
    `  failed: ${failed}`,
    paint(32, `  succeeded: ${succeeded}`),
    paint(0, `  skipped: ${skipped}`),
    '',
  ].join('\n');
};

function fakeDotnet({ status = 0, counts = {} } = {}) {
  const calls = [];
  return {
    calls,
    execute(command, args) {
      calls.push(args[0]);
      return { status, stdout: args[0] === 'test' ? summary(counts) : 'Build succeeded.', stderr: '' };
    },
  };
}

test('every required input is named, and a missing one is a failure rather than a skip', () => {
  assert.deepEqual(missingEnv({}), REQUIRED_ENV);
  assert.deepEqual(missingEnv({ ...full, LUMIO_CONFIG_DIR: '   ' }), ['LUMIO_CONFIG_DIR']);
  assert.deepEqual(missingEnv(full), []);
  assert.throws(() => runSuite({ resultsRoot: scratch(), env: {} }), error => {
    assert.match(error.message, /^MISSING_INPUT:/u);
    // BLOCKED_ENV is this workspace's "the environment cannot run this" token,
    // which callers may tolerate. ADR-113 决策 2 forbids that classification here.
    assert.doesNotMatch(error.message, /BLOCKED_ENV/u);
    for (const name of REQUIRED_ENV) assert.match(error.message, new RegExp(name, 'u'));
    return true;
  });
});

test('each case gets its own process, because HostEntry is a process-scoped singleton', () => {
  const dotnet = fakeDotnet();
  const results = scratch();
  assert.equal(runSuite({ resultsRoot: results, env: full, execute: dotnet.execute }), true);
  assert.deepEqual(dotnet.calls, ['build', ...isolatedCases.map(() => 'test')]);
});

test('runner fixes MTP output language and requires exact total count', () => {
  const env = { ...full, DOTNET_CLI_UI_LANGUAGE: 'zh-CN' };
  const execute = (_command, args, options) => {
    assert.equal(options.env.DOTNET_CLI_UI_LANGUAGE, 'en');
    return { status: 0, stdout: args[0] === 'test' ? summary({ total: 2 }) : 'Build succeeded.' };
  };
  assert.equal(runSuite({ resultsRoot: scratch(), env, execute }), false);
  assert.equal(env.DOTNET_CLI_UI_LANGUAGE, 'zh-CN');
});

test('a run that skipped its case does not pass', () => {
  const dotnet = fakeDotnet({ counts: { total: 1, succeeded: 0, skipped: 1 } });
  assert.equal(runSuite({ resultsRoot: scratch(), env: full, execute: dotnet.execute }), false);
});

test('a run that executed nothing does not pass', () => {
  const dotnet = fakeDotnet({ counts: { total: 0, succeeded: 0 } });
  assert.equal(runSuite({ resultsRoot: scratch(), env: full, execute: dotnet.execute }), false);
});

test('a failing build stops the suite instead of reporting zero cases', () => {
  assert.throws(() => runSuite({ resultsRoot: scratch(), env: full,
    execute: () => ({ status: 1, stdout: 'error CS0001', stderr: '' }) }), /Build failed/u);
});

test('the per-case summary is written where the job can retain it', () => {
  const dotnet = fakeDotnet();
  const results = scratch();
  runSuite({ resultsRoot: results, env: full, execute: dotnet.execute });
  const run = readdirSync(results).find(name => name.startsWith('run-'));
  assert.ok(run, 'the suite must leave a run directory behind');
  assert.deepEqual(JSON.parse(readFileSync(join(results, run, 'summary.json'), 'utf8')).map(row => row.name), isolatedCases);
});

test('the grepped HOST_SUITE line reports the counts the job asserts on', () => {
  const printed = [];
  const original = console.log;
  console.log = line => printed.push(String(line));
  try {
    runSuite({ resultsRoot: scratch(), env: full, execute: fakeDotnet().execute });
  } finally {
    console.log = original;
  }
  assert.ok(printed.some(line => line === 'HOST_SUITE cases=2 total=2 passed=2 failed=0 skipped=0'),
    `no HOST_SUITE line in ${JSON.stringify(printed)}`);
});

test('the printed counts are read from the platform summary block', () => {
  assert.deepEqual(parseCounts(summary({ total: 2, succeeded: 1, failed: 1, skipped: 0 })),
    { total: 2, passed: 1, failed: 1, skipped: 0 });
});

test('the counts are still readable when the platform colours the block on CI', () => {
  const coloured = summary({ total: 2, succeeded: 1, failed: 1, skipped: 0, colour: true });
  assert.ok(coloured.includes(ESC), 'this fixture must actually carry escapes');
  assert.deepEqual(parseCounts(coloured), { total: 2, passed: 1, failed: 1, skipped: 0 });
});

test('a coloured all-green run passes the gate, as it does on CI', () => {
  const dotnet = fakeDotnet({ counts: { colour: true } });
  assert.equal(runSuite({ resultsRoot: scratch(), env: full, execute: dotnet.execute }), true);
});

test('malformed or conflicting evidence fails closed', () => {
  const cases = [
    `${summary()}${summary({ total: 1 })}`,
    summary({ total: '1broken' }),
    summary({ total: 'one' }),
    summary().replace('  skipped: 0\n', ''),
    summary().replace('  skipped: 0\n', '  skipped: 0\n  skipped: 0\n'),
    `${summary()}\n  total: 1\n`,
    summary({ total: 2, succeeded: 1, failed: 0, skipped: 0 }),
    summary({ total: 1, succeeded: 1, failed: 0, skipped: 0 }).replace('Passed!', 'Failed!'),
  ];
  for (const output of cases) {
    const execute = (_command, args) => ({ status: 0, stdout: args[0] === 'test' ? output : 'Build succeeded.', stderr: '' });
    assert.equal(runSuite({ resultsRoot: scratch(), env: full, execute }), false);
  }
});

test('counter text outside the summary is ignored only when it is diagnostic text', () => {
  const output = `Build succeeded.\r\ndiagnostic total: 9\r\n${summary().replaceAll('\n', '\r\n')}Results saved.\r\n`;
  assert.deepEqual(parseCounts(output), { total: 1, passed: 1, failed: 0, skipped: 0 });
});

test('unsafe counts and suffix garbage are rejected', () => {
  assert.ok(Number.isNaN(parseCounts(summary({ total: '9007199254740992' })).total));
  assert.ok(Number.isNaN(parseCounts(summary({ total: '1broken' })).total));
});
