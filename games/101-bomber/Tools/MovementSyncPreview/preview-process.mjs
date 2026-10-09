import assert from 'node:assert/strict';
import { childEnvironment, sameIdentity, scrubBotTicket } from './preview-contracts.mjs';

export function createPreviewProcessTools(official, { officialBotHost, platformDll, readIdentity,
  previewId, record = () => {}, onTicket = () => {} }) {
  const owned = new WeakMap();
  const launch = (executable, args, options, { platform = false } = {}) => {
    let environment = childEnvironment(options.env ?? process.env,
      Object.fromEntries(Object.entries(options.env ?? {}).filter(([key]) =>
        ['LUMIO_BOMBER_BOT_INDEX', 'LUMIO_BOMBER_BOT_COUNT',
          'LUMIO_BOMBER_HUMAN_PARTICIPANTS', 'LUMIO_BOT_WIRE_PROFILE'].includes(key))));
    let publicArgs = args;
    if (platform) {
      assert(args.length === 1 && args[0] === platformDll, 'unrecognized Platform child');
      const allowed = /^(?:PLATFORM_DB_CONNECTION_STRING|PLATFORM_LISTEN_URL|PLATFORM_PUBLIC_ORIGIN|PLATFORM_GAMES_ROOT|PLATFORM_REGISTRATION_PROFILE|Platform__Allocations__bomber__\w+|LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX|LUMIO_ACCOUNT_ADMISSION_KEY_ID|LUMIO_ACCOUNT_BOT_TOOL_PUBLIC_KEY_HEX)$/;
      for (const [key, value] of Object.entries(options.env ?? {})) {
        if (allowed.test(key)) environment[key] = String(value);
      }
    } else if (args.includes('--admission-ticket')) {
      const scrubbed = scrubBotTicket(executable, args, environment, officialBotHost);
      onTicket(scrubbed.env.LumioBotAdmissionTicket);
      publicArgs = scrubbed.args;
      environment = scrubbed.env;
      if (Object.hasOwn(options.env ?? {}, 'LumioBotConfigDirectory')) {
        assert(typeof options.env.LumioBotConfigDirectory === 'string'
          && options.env.LumioBotConfigDirectory.length > 0, 'official Bot config directory required');
        environment.LumioBotConfigDirectory = options.env.LumioBotConfigDirectory;
      }
    }
    const state = official.startLogged(executable, publicArgs, { ...options, env: environment });
    const pid = state.child?.pid;
    assert(Number.isInteger(pid) && pid > 0, 'owned process PID missing');
    let identity;
    try { identity = readIdentity(pid); } catch (error) {
      record({ kind: 'MOVEMENT_PREVIEW_PROCESS_IDENTITY_UNAVAILABLE', previewId, pid,
        cwd: options.cwd, args: publicArgs, log: options.log, at: new Date().toISOString(), error: String(error) });
      throw error;
    }
    assert(identity?.pid === pid && identity?.startTime && identity?.exe, 'owned process identity unavailable');
    owned.set(state, identity);
    record({ kind: 'MOVEMENT_PREVIEW_OWNED_PROCESS_STARTED', previewId, pid,
      startTime: identity.startTime, exe: identity.exe, cwd: options.cwd,
      args: publicArgs, log: options.log, startedUtc: new Date().toISOString() });
    return state;
  };
  return {
    command(executable, args, options = {}) {
      return official.command(executable, args, { ...options, env: childEnvironment(options.env ?? process.env) });
    },
    startLogged(executable, args, options = {}) { return launch(executable, args, options); },
    startPlatform(executable, args, options = {}) { return launch(executable, args, options, { platform: true }); },
    assertAlive: official.assertAlive,
    waitExit: official.waitExit,
    async forceCleanup(state) {
      const expected = owned.get(state);
      assert(expected, 'unowned process cleanup refused');
      if (state.closed) return;
      const current = readIdentity(expected.pid);
      assert(sameIdentity(expected, current), 'owned process identity mismatch');
      await official.forceCleanup(state);
    },
  };
}
