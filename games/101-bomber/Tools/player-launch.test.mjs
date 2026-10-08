import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLaunchArgs, planLaunchLogins } from './launcher.mjs';

test('two browser players reserve independent accounts within eight legacy slots', () => {
  const options = parseLaunchArgs(['--player', '--player-count', '2'], {});
  assert.equal(options.bots, 6);
  assert.equal(options.playerCount, 2);
  const logins = planLaunchLogins(options.bots, { ...options, spectator: true });
  assert.equal(logins.length, 8);
  assert.equal(new Set(logins).size, 8);
  assert.deepEqual(logins.slice(-2), [options.spectatorLogin + 'A', options.spectatorLogin + 'B']);
  for (const args of [
    ['--player-count', '2'], ['--player', '--player-count', '3'],
    ['--player', '--player-count', '2', '--bots', '7'],
  ]) assert.throws(() => parseLaunchArgs(args, {}), /player/);
});
