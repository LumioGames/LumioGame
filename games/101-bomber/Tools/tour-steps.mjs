import { findDsReady } from './ds-ready.mjs';
import { FROZEN_WORLD_PROFILE } from './server-profile.mjs';

export const TOUR_STEPS = Object.freeze([
  { id: '01', key: 'compile-config', title: 'compile config' },
  { id: '02', key: 'account-login', title: 'account login' },
  { id: '03', key: 'start-ds', title: 'start DS' },
  { id: '04', key: 'admit-room', title: 'admit room' },
  { id: '05', key: 'load-basemap', title: 'load base map' },
  { id: '06', key: 'match-join', title: 'match join' },
  { id: '07', key: 'bomb-place', title: 'bomb place' },
  { id: '08', key: 'bomb-detonate', title: 'bomb detonate' },
  { id: '09', key: 'chain-resolve', title: 'chain resolve' },
  { id: '10', key: 'damage', title: 'damage' },
  { id: '11', key: 'respawn', title: 'respawn' },
  { id: '12', key: 'final-circle', title: 'final circle' },
  { id: '13', key: 'match-end', title: 'match end' },
  { id: '14', key: 'next-match', title: 'next match in the same room' },
]);

export function formatStep(id, status, detail = '') {
  return 'step=' + id + ' status=' + status + (detail ? ' ' + detail : '');
}
export const DEFAULT_LOGIN_PREFIX = 'Bot';
export const ORDINARY_LOGIN_PREFIX = 'Player';

export function planBotLogins(bots, prefix = DEFAULT_LOGIN_PREFIX) {
  if (!Number.isInteger(bots) || bots < 1) {
    const error = new Error('--bots must be a positive integer.');
    error.code = 'USAGE';
    throw error;
  }
  return Array.from({ length: bots }, (_, index) => prefix + (index + 1));
}

// A first-round admission scenario never substitutes for this complete-match scenario.
export const TOUR_SCENARIO = 'Lumio.Bomber.Bots.BomberMatchScenario';
export const TOUR_ASSERTIONS = Object.freeze({
  '05': Object.freeze(['basemap_observed']),
  '06': Object.freeze(['match_joined', 'self_bound']),
  '07': Object.freeze(['first_bomb_place']),
  '08': Object.freeze(['bomb_detonated']),
  '09': Object.freeze(['chain_resolved']),
  '10': Object.freeze(['damage_applied']),
  '11': Object.freeze(['respawned']),
  '12': Object.freeze(['final_circle_started']),
  '13': Object.freeze(['match_ended', 'ranking_valid']),
  '14': Object.freeze(['next_match_started', 'same_room']),
});

export function parseBotResult(text) {
  const asserts = [];
  let run = null;
  let unparsable = 0;
  let runs = 0;
  let afterRun = false;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { unparsable++; continue; }
    if (run) afterRun = true;
    if (value?.kind === 'assert') asserts.push(value);
    else if (value?.kind === 'run') { run = value; runs++; }
    else unparsable++;
  }
  return { asserts, run, unparsable, runs, afterRun };
}

// The engine sink writes failed names only. Source-contract tests must pin the actual
// scenario's complete Assert implementation to TOUR_ASSERTIONS; absence is a red gate.
export function scenarioVerdict(result) {
  const absent = reason => ({ present: false, passed: false, failed: [], reason });
  if (result?.unparsable || result?.afterRun || result?.runs !== 1) return absent('malformed or incomplete result stream');
  if (result.asserts.length !== 1) return absent('expected one assert record');
  const [record] = result.asserts;
  const run = result.run;
  if (typeof record.passed !== 'boolean' || typeof record.failed !== 'string') return absent('malformed assert record');
  const failed = record.failed.split(',').map(name => name.trim()).filter(Boolean);
  if (record.passed !== (failed.length === 0)) return absent('contradictory assertion result');
  if (run.passed !== record.passed || run.bots !== 1) return absent('run record disagrees with assertions');
  return { present: true, passed: record.passed, failed, reason: '' };
}

export function assertionHeld(verdict, name) {
  return verdict?.present === true && !verdict.failed.some(entry =>
    entry === name || entry.startsWith(name + ':') || entry.startsWith(name + '('));
}

// Parse top-level logfmt fields. Text inside msg="..." is never treated as an event.
// Malformed quoting and duplicate keys invalidate the line.
export function parseLogfmt(line) {
  const result = Object.create(null);
  const source = String(line);
  let at = 0;
  while (at < source.length) {
    while (/\s/.test(source[at] ?? '') && at < source.length) at++;
    if (at === source.length) break;
    const key = /^[A-Za-z_][A-Za-z0-9_.-]*=/.exec(source.slice(at));
    if (!key) {
      // A logger may prefix the line with timestamp and level tokens.
      const next = source.indexOf(' ', at);
      if (next < 0) break;
      at = next + 1;
      continue;
    }
    const name = key[0].slice(0, -1);
    if (Object.hasOwn(result, name)) return null;
    at += key[0].length;
    let value;
    if (source[at] === '"') {
      const start = at++;
      let closed = false;
      while (at < source.length) {
        if (source[at] === '\\') { at += 2; continue; }
        if (source[at++] === '"') { closed = true; break; }
      }
      if (!closed) return null;
      try { value = JSON.parse(source.slice(start, at)); } catch { return null; }
      if (at < source.length && !/\s/.test(source[at])) return null;
    } else {
      const start = at;
      while (at < source.length && !/\s/.test(source[at])) at++;
      value = source.slice(start, at);
    }
    result[name] = value;
  }
  return result;
}

const UINT = /^(0|[1-9][0-9]*)$/;
const GAMEPLAY_LOG_TARGET = 'Lumio.Bomber.Gameplay.Contracts.Components.BomberMatchState';
export function gameplayEvents(text) {
  const events = [];
  const seen = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    // The released CoreCLR logger sends category TAB formatted-message to Native.
    // DS diagnostics renders textual fields inside msg, not as top-level columns.
    const envelope = parseLogfmt(line);
    if (!envelope || envelope.target !== GAMEPLAY_LOG_TARGET || envelope.lang !== 'cs'
      || envelope.truncated === 'true' || !UINT.test(envelope.world ?? '') || envelope.world === '0'
      || !UINT.test(envelope.tick ?? '') || !envelope.msg?.startsWith('event=')) continue;
    const fields = parseLogfmt(envelope.msg);
    if (!fields || !/^[a-z][a-z0-9_]*$/.test(fields.event ?? '')
      || !UINT.test(fields.matchId ?? '') || fields.matchId === '0'
      || !UINT.test(fields.gameTick ?? '') || !UINT.test(fields.eventSequence ?? '')
      || fields.eventSequence === '0' || !fields.roomId
      || BigInt(fields.gameTick) > BigInt(envelope.tick)) continue;
    fields.world = envelope.world;
    const identity = JSON.stringify([fields.world, fields.roomId, fields.matchId, fields.gameTick, fields.eventSequence]);
    const signature = JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(identity)) {
      if (seen.get(identity) !== signature) return []; // Conflicting records invalidate the evidence.
      continue; // stdout and rolling log may contain the same event.
    }
    seen.set(identity, signature);
    events.push(fields);
  }
  return events;
}

const BASE_MAP_BOOT = /empty store: first boot opens the world from the configured base map/;
const CHECKPOINT_RESTORE = /recovered checkpoint outranks base_map_path/;

export function judgeTourSteps({ dsReady = null, dsStdout = '', dsLogs = '', botAdmit = {}, botResult = '' } = {}) {
  const text = dsStdout + '\n' + dsLogs;
  const verdict = scenarioVerdict(parseBotResult(botResult));
  const held = id => TOUR_ASSERTIONS[id].every(name => assertionHeld(verdict, name));
  const result = (id, pass, detail) => ({ id, status: pass ? 'PASS' : 'FAIL', detail });
  let ready = dsReady;
  if (!ready) { try { ready = findDsReady(dsStdout); } catch { /* missing evidence */ } }
  const all = gameplayEvents(text);
  const firstEnd = all.find(event => event.event === 'match_ended');
  const start = all.find(event => event.event === 'match_started' && firstEnd
    && event.world === firstEnd.world && event.roomId === firstEnd.roomId && event.matchId === firstEnd.matchId
    && BigInt(event.gameTick) < BigInt(firstEnd.gameTick));
  const events = start ? all.filter(event => event.world === start.world && event.roomId === start.roomId && event.matchId === start.matchId) : [];
  const count = name => events.filter(event => event.event === name).length;
  const end = events.find(event => event.event === 'match_ended');
  const next = start && end && all.find(event => event.event === 'match_started'
    && event.world === start.world && event.roomId === start.roomId && event.matchId !== start.matchId
    && BigInt(event.gameTick) > BigInt(end.gameTick));
  const checks = [
    ['05', ready?.worldProfile === FROZEN_WORLD_PROFILE && BASE_MAP_BOOT.test(text) && !CHECKPOINT_RESTORE.test(text) && botAdmit.scopeActivated === true, 'base map restore and replica scope'],
    ['06', !!start && botAdmit.admitted === true, 'match_started and admission'],
    ['07', count('bomb_placed') > 0, 'bomb_placed'],
    ['08', count('bomb_detonated') > 0, 'bomb_detonated'],
    ['09', count('chain_resolved') > 0, 'chain_resolved'],
    ['10', count('damage_applied') > 0, 'damage_applied'],
    ['11', count('player_respawned') > 0, 'player_respawned'],
    ['12', count('final_circle_started') > 0, 'final_circle_started'],
    ['13', !!end && verdict.passed, 'match_ended and complete scenario assertions'],
    ['14', !!next && verdict.passed, 'new match after settlement in the same world and room'],
  ];
  return checks.map(([id, evidence, detail]) => result(id, evidence && held(id),
    detail + '; assertions=' + (verdict.present ? (held(id) ? 'held' : 'failed') : verdict.reason)));
}
