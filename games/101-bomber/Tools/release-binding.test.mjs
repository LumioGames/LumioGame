import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BINDING_FIELDS } from './account-client.mjs';
import { releaseLayout } from './engine-release.mjs';
import { collectLaunchTickets, parseLaunchArgs, runLauncher } from './launcher.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.BINDING_TEST_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), 'bomber-release-binding-'));
mkdirSync(evidence, { recursive: true });
const expected = 'bomber-0.0.6-bomber.schema16'; // An operator expectation, not an issued ticket claim.
const previous = 'bomber-0.0.4-main.ecece8a';

function session(index, fields = {}) {
  return {
    login: { loginName: `Bind${index}`, accountId: String(index) },
    launch: {
      admissionCredential: `private-test-credential-${index}`,
      serverAudience: 'game-fleet-local', gameId: 'bomber', gameReleaseId: expected,
      contractId: 'lumio.gameplay-envelope.v1', roomId: 'room-bomber-1', allocationId: 'alloc-bomber-1',
      ...fields,
    },
  };
}

const mismatch = error => error?.code === 'GAME_RELEASE_BINDING_MISMATCH';

test('CLI accepts an explicit operator release expectation without adding launch hints', () => {
  const options = parseLaunchArgs(['--expected-game-release-id', expected, '--origin', 'http://127.0.0.1:18085'], {});
  assert.equal(options.expectedGameReleaseId, expected);
  assert.equal(options.startPlatform, false);
});

test('environment expectation is explicit and CLI takes precedence', () => {
  assert.equal(parseLaunchArgs([], { LUMIO_EXPECTED_GAME_RELEASE_ID: expected }).expectedGameReleaseId, expected);
  assert.equal(parseLaunchArgs(['--expected-game-release-id', expected], {
    LUMIO_EXPECTED_GAME_RELEASE_ID: previous,
  }).expectedGameReleaseId, expected);
});

test('an empty explicit expectation is a usage failure', () => {
  assert.throws(() => parseLaunchArgs(['--expected-game-release-id', ' '], {}), /non-empty/);
});

test('matching independent responses return the original unique tickets without changing claims', () => {
  const sessions = [session(1), session(2)];
  const before = structuredClone(sessions);
  for (const item of sessions) { Object.freeze(item.launch); Object.freeze(item.login); Object.freeze(item); }
  Object.freeze(sessions);
  assert.deepEqual(collectLaunchTickets(sessions, { expectedGameReleaseId: expected }),
    before.map(item => item.launch.admissionCredential));
  assert.deepEqual(sessions, before);
});

test('an old Platform release is rejected even when its room claims agree', () => {
  const sessions = [session(1, { gameReleaseId: previous }), session(2, { gameReleaseId: previous })];
  assert.throws(() => collectLaunchTickets(sessions, { expectedGameReleaseId: expected }), mismatch);
});

test('the expected release never permits a mixed six-claim room', async context => {
  for (const field of BINDING_FIELDS) {
    await context.test(field, () => {
      const sessions = [session(1), session(2, { [field]: `${session(2).launch[field]}-other` })];
      assert.throws(() => collectLaunchTickets(sessions, { expectedGameReleaseId: expected }), mismatch);
    });
  }
});

test('every expected batch claim must actually be present', async context => {
  for (const field of BINDING_FIELDS) {
    await context.test(field, () => {
      const sessions = [session(1, { [field]: undefined }), session(2, { [field]: undefined })];
      assert.throws(() => collectLaunchTickets(sessions, { expectedGameReleaseId: expected }), mismatch);
    });
  }
});

test('the ticket reuse refusal is retained', () => {
  const sessions = [session(1), session(2)];
  sessions[1].launch.admissionCredential = sessions[0].launch.admissionCredential;
  assert.throws(() => collectLaunchTickets(sessions, { expectedGameReleaseId: expected }), /reuse is forbidden/);
});

test('calls without an expectation preserve the legacy diagnostic ticket contract', () => {
  const sessions = [session(1, { gameReleaseId: previous }), session(2, { gameReleaseId: previous })];
  assert.deepEqual(collectLaunchTickets(sessions), sessions.map(item => item.launch.admissionCredential));
});

function optionsFor(label) {
  const dir = join(evidence, label);
  const engineDir = join(dir, 'absent-engine-fixture');
  let processCalls = 0;
  const unexpectedProcess = () => { processCalls++; throw new Error('an engine process must not start'); };
  return {
    options: {
      root, env: {}, bots: 1, seed: 1, staggerMs: 0,
      expectedGameReleaseId: expected, evidenceDir: dir, log() {}, platform: 'linux',
      origin: 'http://127.0.0.1:18085', startPlatform: false,
      engine: { dir: engineDir, rid: 'win-x64', manifest: { version: 'fixture-only' },
        layout: releaseLayout(engineDir, 'win-x64') },
      processTools: { command: unexpectedProcess, startLogged: unexpectedProcess, forceCleanup: unexpectedProcess },
    },
    processCalls: () => processCalls,
    report: () => JSON.parse(readFileSync(join(dir, 'verification.json'), 'utf8')),
  };
}

test('injected stale sessions fail before DS configuration or process creation', async () => {
  const fixture = optionsFor('injected-stale');
  await assert.rejects(runLauncher({ ...fixture.options,
    sessions: [session(1, { gameReleaseId: previous })],
  }), mismatch);
  assert.equal(fixture.processCalls(), 0);
  assert.equal(fixture.report().status, 'FAIL');
  assert.ok(fixture.report().steps.every(step => step.id === '01'));
  assert.equal(fixture.report().gameReleaseBinding.status, 'PENDING');
});

test('new login responses hit the same stale-release guard before DS creation', async () => {
  const fixture = optionsFor('new-login-stale');
  let logins = 0;
  await assert.rejects(runLauncher({ ...fixture.options,
    loginAndLaunch: async request => {
      logins++;
      assert.equal(request.slug, undefined);
      assert.equal(request.expectedGameReleaseId, undefined, 'the expectation is never sent as a launch hint');
      return session(1, { gameReleaseId: previous });
    },
  }), mismatch);
  assert.equal(logins, 1);
  assert.equal(fixture.processCalls(), 0);
  assert.equal(fixture.report().status, 'FAIL');
});

test('matched response evidence is distinct from cryptographic or package verification', async () => {
  const fixture = optionsFor('matched-response');
  const report = await runLauncher({ ...fixture.options, sessions: [session(1)] });
  assert.equal(report.status, 'BLOCKED_ENV', 'the deliberately absent DS is not a running game');
  assert.deepEqual(report.gameReleaseBinding, {
    status: 'MATCHED_LAUNCH_RESPONSE', expectedGameReleaseId: expected, actualGameReleaseId: expected,
  });
  assert.equal(fixture.processCalls(), 0);
});

test('legacy diagnostic evidence explicitly leaves release identity unverified', async () => {
  const fixture = optionsFor('legacy-response');
  delete fixture.options.expectedGameReleaseId;
  const report = await runLauncher({ ...fixture.options, sessions: [session(1, { gameReleaseId: previous })] });
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.deepEqual(report.gameReleaseBinding, {
    status: 'UNVERIFIED', expectedGameReleaseId: null, actualGameReleaseId: previous,
  });
});
