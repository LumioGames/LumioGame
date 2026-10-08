import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBotArgs, buildServerArgs, parseDsReadyLine, redactArgs, resolveDsEndpoint } from './ds-ready.mjs';

test('server invocation is the production lumio-ds config entrypoint', () => {
  assert.deepEqual(buildServerArgs('server.json'), ['--config', 'server.json']);
});

test('Bot.Host invocation carries server, ticket, native SDK, log directory and gameplay', () => {
  const args = buildBotArgs({
    botDll: 'Lumio.Client.Bot.Host.dll',
    endpoint: 'ws://127.0.0.1:9110/',
    admissionTicket: 'ticket_123',
    roomId: 'room-from-launch',
    engineNative: 'lumio.dll',
    kernelConfig: 'run/kernel-config.json',
    logDir: 'logs/bot',
    accountFrom: 'Bot1',
    accountTo: 'Bot1',
    gameplay: 'Lumio.Bomber.Gameplay.dll',
    configDir: 'exports/bomber',
  });
  assert.deepEqual(args.slice(1, 9), ['--server', 'ws://127.0.0.1:9110/', '--admission-ticket', 'ticket_123', '--engine-native', 'lumio.dll', '--kernel-config', 'run/kernel-config.json']);
  assert.ok(args.includes('--log-dir'));
  const gameplayAt = args.indexOf('--gameplay');
  assert.ok(gameplayAt >= 0);
  assert.equal(args[gameplayAt + 1], 'Lumio.Bomber.Gameplay.dll');
  assert.ok(!args.includes('test-harness'));
  assert.equal(args[args.indexOf('--config-dir') + 1], 'exports/bomber');
  assert.equal(args[args.indexOf('--room-id') + 1], 'room-from-launch');
});

test('Bot.Host invocation refuses to omit --kernel-config', () => {
  assert.throws(() => buildBotArgs({ botDll: 'Bot.Host.dll', endpoint: 'ws://127.0.0.1:9110/', admissionTicket: 'ticket_123', engineNative: 'lumio.dll', logDir: 'logs/bot', accountFrom: 'Bot1' }), /--kernel-config/);
});

test('Bot.Host invocation refuses to omit --gameplay', () => {
  assert.throws(
    () => buildBotArgs({
      botDll: 'Lumio.Client.Bot.Host.dll',
      endpoint: 'ws://127.0.0.1:9110/',
      admissionTicket: 'ticket_123',
      engineNative: 'lumio.dll',
      kernelConfig: 'run/kernel-config.json',
      logDir: 'logs/bot',
      accountFrom: 'Bot1',
    }),
    /--gameplay/,
  );
});

test('DS_READY parses production readiness payload and derives port', () => {
  const ready = parseDsReadyLine('DS_READY {"pid":42,"endpoint":"ws://127.0.0.1:9110","roomId":"bomber","tickRate":20}');
  assert.equal(ready.pid, 42);
  assert.equal(ready.port, 9110);
  assert.equal(ready.roomId, 'bomber');
  assert.equal(parseDsReadyLine('server started'), null);
});

test('DS_READY rejects malformed, non-network, or credential-bearing endpoints', () => {
  assert.throws(() => parseDsReadyLine('DS_READY {"pid":42,"endpoint":"not-a-url"}'));
  assert.throws(() => parseDsReadyLine('DS_READY {"pid":42,"endpoint":"http://127.0.0.1:9110"}'));
  assert.throws(() => parseDsReadyLine('DS_READY {"pid":42,"endpoint":"ws://127.0.0.1:9110/?ticket=secret"}'));
});

test('formal endpoint stays loopback and matches DS_READY', () => {
  const ready = parseDsReadyLine('DS_READY {"pid":42,"endpoint":"ws://127.0.0.1:9110"}');
  assert.equal(resolveDsEndpoint(ready), 'ws://127.0.0.1:9110/');
  assert.throws(() => resolveDsEndpoint(ready, 'ws://127.0.0.1:9111/'));
  assert.throws(() => resolveDsEndpoint(ready, 'wss://game.example:9110/'));
});

test('redact hides the admission ticket', () => {
  assert.deepEqual(redactArgs(['--admission-ticket', 'secret'], 'secret'), ['--admission-ticket', '<redacted>']);
});

test('real Bot argument construction keeps per-run kernel, voxel budget and client export', () => {
  const kernelConfigPath = 'run/kernel-config.json';
  const args = buildBotArgs({ botDll: 'Bot.dll', endpoint: 'ws://127.0.0.1:9110/', admissionTicket: 'test-ticket',
    engineNative: 'native.dll', kernelConfig: kernelConfigPath, logDir: 'logs', accountFrom: 'bot1',
    gameplay: 'Game.dll', configDir: 'exports/client', voxelConfig: 'bot-voxel-budget.json' });
  assert.equal(args[args.indexOf('--kernel-config') + 1], kernelConfigPath);
  // Bomber joins runtime+voxel and must carry its explicit voxel budget.
  assert.equal(args[args.indexOf('--voxel-config') + 1], 'bot-voxel-budget.json');
  // split-export/1: a Bot.Host is a client and must never be handed the S+V tree.
  assert.equal(args[args.indexOf('--config-dir') + 1], 'exports/client');
});

test('SDK-backed Bot refuses a missing or blank typed-config export', () => {
  for (const configDir of [undefined, '', '   ']) {
    assert.throws(() => buildBotArgs({ kernelConfig: 'kernel.json', gameplay: 'Game.dll', configDir }), /--config-dir/);
  }
});

test('Bot.Host carries --voxel-config when a budget is given and omits it for the entity-only bot', () => {
  const base = {
    botDll: 'Lumio.Client.Bot.Host.dll',
    endpoint: 'ws://127.0.0.1:9110/',
    admissionTicket: 'ticket_123',
    engineNative: 'lumio.dll',
    kernelConfig: 'run/kernel-config.json',
    logDir: 'logs/bot',
    accountFrom: 'Bot1',
    gameplay: 'Lumio.Bomber.Gameplay.dll',
    configDir: 'exports/bomber',
  };
  const withVoxel = buildBotArgs({ ...base, voxelConfig: 'Server/Assets/Maps/bot-voxel-budget.json' });
  assert.equal(withVoxel[withVoxel.indexOf('--voxel-config') + 1], 'Server/Assets/Maps/bot-voxel-budget.json');

  // Absent is the stated entity-only bot (ADR-101): no flag at all, not an empty value that
  // Bot.Host would have to interpret. Unlike --kernel-config / --gameplay / --config-dir this
  // one does not throw, because owning no voxel world is a configuration, not an omission.
  for (const voxelConfig of [undefined, null, '', '   ']) {
    assert.ok(!buildBotArgs({ ...base, voxelConfig }).includes('--voxel-config'));
  }
});
