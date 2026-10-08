import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as launcher from './launcher.mjs';
import { buildBotArgs } from './ds-ready.mjs';

test('browser play accepts the Game scenario assembly without turning into a tour', () => {
  const options = launcher.parseLaunchArgs(['--player', '--scenario-dll', 'Bomber.dll'], {});
  assert.equal(options.player, true);
  assert.equal(options.bots, 7);
  assert.equal(options.scenarioDll, 'Bomber.dll');
  for (const flag of ['--spectator', '--admission-only'])
    assert.throws(() => launcher.parseLaunchArgs(['--player', flag], {}), /cannot combine/);
});

test('every browser-room Bot uses continuing Game play, including the first account', () => {
  for (let index = 0; index < 7; index++) {
    const selection = launcher.botScenarioSelection({ player: true, index, scenarioDll: 'Bomber.dll', ticks: 12 });
    const args = buildBotArgs({ botDll: 'host.dll', endpoint: 'ws://127.0.0.1:1234',
      admissionTicket: 'test', roomId: 'room', engineNative: 'native.dll', kernelConfig: 'kernel.json',
      configDir: 'config', logDir: 'logs', accountFrom: `Play${index}`, gameplay: 'game.dll', ...selection });
    assert.equal(args[args.indexOf('--scenario-name') + 1], 'Lumio.Bomber.Bots.BomberPlayScenario');
    assert.equal(args.includes('--ticks'), false, 'player peers must survive tour-frame limits and next matches');
  }
  assert.equal(launcher.botScenarioSelection({ index: 0, scenarioDll: 'Bomber.dll', ticks: 12 }).scenarioName,
    'Lumio.Bomber.Bots.BomberMatchScenario');
  assert.equal(launcher.botScenarioSelection({ index: 1, scenarioDll: 'Bomber.dll', ticks: 12 }).scenarioName,
    'Lumio.Bomber.Bots.BomberMatchPeerScenario');
});

test('browser play requires an actual Game Bot assembly and resolves explicit paths from the game root', () => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-player-bots-'));
  assert.throws(() => launcher.resolvePlayerBotScenario({ root }), /BOMBER_PLAYER_BOTS_MISSING/);
  mkdirSync(join(root, 'artifacts'));
  writeFileSync(join(root, 'artifacts/Bomber.dll'), 'test assembly path only');
  assert.equal(launcher.resolvePlayerBotScenario({ root, scenarioDll: 'artifacts/Bomber.dll' }),
    join(root, 'artifacts/Bomber.dll'));
  assert.throws(() => launcher.resolvePlayerBotScenario({ root, scenarioDll: 'artifacts' }), /BOMBER_PLAYER_BOTS_MISSING/);
});

test('missing Game Bots stop player launch before accounts, Platform, or processes are created', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bomber-player-bots-preflight-'));
  let effects = 0;
  const unexpected = () => { effects++; throw new Error('preflight must precede external work'); };
  const evidenceDir = join(root, '.run/evidence');
  await assert.rejects(launcher.runLauncher({ root, evidenceDir, player: true, bots: 7, env: {},
    loginAndLaunch: unexpected, startReleasePlatform: unexpected,
    processTools: { command: unexpected, startLogged: unexpected, forceCleanup: unexpected }, log() {} }),
  /BOMBER_PLAYER_BOTS_MISSING/);
  const report = JSON.parse(readFileSync(join(evidenceDir, 'verification.json'), 'utf8'));
  assert.equal(report.status, 'BLOCKED_ENV');
  assert.match(report.error, /BOMBER_PLAYER_BOTS_MISSING/);
  assert.equal(effects, 0);
});

test('product Bot roster comes from explicit process membership rather than Platform slot guesses', () => {
  const rows = Array.from({ length: 7 }, (_, index) => launcher.botScenarioEnvironment({
    player: true, index, count: 7, configDir: 'client tables',
  }));
  assert.deepEqual(rows.map(row => row.LUMIO_BOMBER_BOT_INDEX), ['0', '1', '2', '3', '4', '5', '6']);
  assert.ok(rows.every(row => row.LUMIO_BOMBER_BOT_COUNT === '7' && row.LumioBotConfigDirectory === 'client tables'));
  assert.deepEqual(launcher.botScenarioEnvironment({ configDir: 'tour tables' }), { LumioBotConfigDirectory: 'tour tables' });
  for (const index of [-1, 7, NaN])
    assert.throws(() => launcher.botScenarioEnvironment({ player: true, index, count: 7 }), /Bot index/);
});
