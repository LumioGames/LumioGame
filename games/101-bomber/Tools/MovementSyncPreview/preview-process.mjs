import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { childEnvironment, sameIdentity, scrubBotTicket } from './preview-contracts.mjs';

export function createPreviewProcessTools(official, { officialBotHost, platformDll, readIdentity,
  previewId, record = () => {}, onTicket = () => {} }) {
  const owned = new WeakMap();
  const retained = new Set();
  const validIdentity = (pid, identity) => identity?.pid === pid
    && Number.isFinite(Date.parse(identity.startTime)) && typeof identity.exe === 'string' && identity.exe.length > 0;
  const originalHandleAlive = ownership => ownership.state.child === ownership.child
    && ownership.child?.pid === ownership.pid && !ownership.state.closed
    && ownership.child.exitCode == null && ownership.child.signalCode == null;
  const capture = (ownership, recovered = false) => {
    assert(originalHandleAlive(ownership), 'original child handle closed or changed');
    const identity = readIdentity(ownership.pid);
    assert(validIdentity(ownership.pid, identity)
      && resolve(identity.exe).toLowerCase() === resolve(ownership.executable).toLowerCase(),
    'owned process identity unavailable');
    assert(originalHandleAlive(ownership), 'original child handle closed or changed');
    assert(Date.parse(identity.startTime) >= Date.parse(ownership.launchStarted)
      && Date.parse(identity.startTime) <= Date.parse(ownership.launchFinished),
    'owned process start time outside original launch window');
    ownership.expected = { pid: identity.pid, startTime: identity.startTime, exe: identity.exe };
    if (recovered) record({ kind: 'MOVEMENT_PREVIEW_OWNED_PROCESS_IDENTITY_RECOVERED', previewId,
      ...ownership.expected, firstError: String(ownership.firstError) });
    return ownership.expected;
  };
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
    const launchStarted = new Date().toISOString();
    const state = official.startLogged(executable, publicArgs, { ...options, env: environment });
    const launchFinished = new Date().toISOString();
    const pid = state.child?.pid;
    const ownership = { state, child: state.child, pid, executable, launchStarted,
      launchFinished, expected: null, firstError: null };
    owned.set(state, ownership);
    retained.add(state);
    let identity;
    try {
      assert(Number.isInteger(pid) && pid > 0, 'owned process PID missing');
      identity = capture(ownership);
    } catch (error) {
      ownership.firstError = error;
      record({ kind: 'MOVEMENT_PREVIEW_PROCESS_IDENTITY_UNAVAILABLE', previewId, pid,
        cwd: options.cwd, args: publicArgs, log: options.log, at: new Date().toISOString(),
        retainedOwnedStart: true, error: String(error) });
      throw error;
    }
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
      const ownership = owned.get(state);
      assert(ownership, 'unowned process cleanup refused');
      if (state.closed && ownership.expected) { retained.delete(state); return; }
      try {
        if (!ownership.expected) {
          let lastError;
          for (let attempt = 0; attempt < 3 && !ownership.expected; attempt++) {
            try { capture(ownership, true); } catch (error) { lastError = error; }
          }
          if (!ownership.expected) throw new Error(`owned process identity unavailable; retained for recovery: ${lastError}`);
        }
        const current = readIdentity(ownership.expected.pid);
        assert(sameIdentity(ownership.expected, current), 'owned process identity mismatch');
        assert(originalHandleAlive(ownership), 'original child handle closed or changed');
        await official.forceCleanup(state);
        retained.delete(state);
      } catch (error) {
        record({ kind: 'MOVEMENT_PREVIEW_PROCESS_CLEANUP_FAILED', previewId, pid: ownership.pid,
          retainedOwnedStart: true, expected: ownership.expected, firstError: String(ownership.firstError),
          launchStarted: ownership.launchStarted, launchFinished: ownership.launchFinished,
          error: String(error) });
        throw error;
      }
    },
    async cleanupRetained() {
      let failure;
      for (const state of [...retained]) {
        try { await this.forceCleanup(state); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
    },
  };
}
