import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./game-view.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '')
  .replace('export function createGameView', 'function createGameView');

test('selection follows local readiness and phases without rebuilding presentation', () => {
  const calls = [];
  const presentations = [];
  const changeButton = { style: { display: '' } };
  const element = () => ({ hidden: false, classList: { add() {}, remove() {} },
    querySelector(selector) {
      assert.equal(selector, '.hud-buttons [title="换角色"]');
      return changeButton;
    } });
  const nodes = new Map([
    ['presentation', element()], ['game-stage', element()],
    ['game-labels', element()], ['game-hud', element()],
  ]);
  const sandbox = {
    document: { getElementById: id => nodes.get(id), body: { classList: { add() {}, remove() {} } } },
    window: {},
    performance: { now: () => 1 },
    createReplicaAdapter: () => ({
      localPlayerId: 'player',
      project: frame => ({ Players: [], phase: frame.match.phase }),
      events: () => [],
    }),
    projectReplicaConfig: () => ({
      catalog: { characters: new Map([[118002, 'duck']]) },
      rules: { characters: { duck: {} } },
      config: {},
    }),
    ReplicaTerrain: class { read() { return {}; } },
    createPresentation: options => {
      const presentation = { options, pushes: [], windows: [], disposeCount: 0 };
      presentations.push(presentation);
      return {
        push: frame => presentation.pushes.push(frame.snapshot.phase),
        setSelectionWindow: (open, initial) => presentation.windows.push([open, initial]),
        inputBlocked: () => false,
        dispose: () => presentation.disposeCount++,
      };
    },
  };
  vm.runInNewContext(source + '\nglobalThis.createGameView = createGameView;', sandbox);
  const view = sandbox.createGameView({ onChangeCharacter: id => calls.push(id) });
  const frame = (phase, ready = true) => ({ match: { id: 'world', matchId: '1', phase },
    selfId: ready ? 'self' : null, players: ready ? [{ id: 'self' }] : [],
    config: { mapSize: 19, groundLayer: 0, obstacleLayer: 1, blocks: [] }, tick: '1' });
  const choose = id => presentations[0].options.callbacks.onChangeCharacter(id);
  view.update(frame(0, false), {});
  choose('unready');
  assert.equal(changeButton.style.display, 'none');
  view.update(frame(0), {});
  assert.deepEqual(presentations[0].windows, [[false, true], [true, true]]);
  choose('duck');
  assert.equal(changeButton.style.display, '');
  view.update(frame(1), {});
  assert.deepEqual(presentations[0].windows.at(-1), [true, false]);
  choose('cat');
  assert.equal(changeButton.style.display, '');
  view.update(frame(2), {});
  assert.deepEqual(presentations[0].windows.at(-1), [false, false]);
  choose('closed');
  assert.equal(changeButton.style.display, 'none');
  view.update(frame(4), {});
  assert.equal(presentations.length, 1);
  view.update(frame(5), {});
  choose('kangaroo');
  assert.equal(changeButton.style.display, '');
  assert.deepEqual(calls, ['duck', 'cat', 'kangaroo']);
  assert.deepEqual(presentations[0].pushes, [0, 0, 1, 2, 4, 5]);
  assert.equal(presentations[0].disposeCount, 0);
  view.update({ ...frame(1), match: { id: 'world', matchId: '2', phase: 1 } }, {});
  assert.equal(presentations.length, 2);
  assert.deepEqual(presentations[1].windows, [[true, false]]);
  view.dispose();
  choose('bear');
  assert.deepEqual(calls, ['duck', 'cat', 'kangaroo']);
  const failedView = sandbox.createGameView({ onChangeCharacter: () => false });
  failedView.update(frame(0), {});
  const failed = presentations.at(-1);
  assert.equal(failed.options.callbacks.onChangeCharacter('duck'), false);
  failedView.update(frame(1), {});
  assert.deepEqual(failed.windows.at(-1), [true, true], 'failed submission must keep the first-selection flow available');
  failedView.dispose();
  const spectatorView = sandbox.createGameView({});
  spectatorView.update(frame(0), {});
  assert.equal(presentations.at(-1).options.callbacks.onChangeCharacter, undefined);
  spectatorView.dispose();
});

// Isolate observable presentation lifetime; the source under test remains the
// actual GameView module above. This fixture does not establish raw adapter IDs.
function waitingPresentationFixture(callbacks = {}) {
  const nodes = new Map(['presentation','game-stage','game-labels','game-hud'].map(id => [id,
    { hidden: true, classList: { add() {}, remove() {} }, querySelector: () => ({ style: {} }) }]));
  const state = { ready: false, localId: 1, projectable: true, adapters: [], presentations: [], now: 1,
    configProjects: 0, terrainReads: 0, projectedTicks: [], events: 0, projectError: null };
  const sandbox = { document: { getElementById: id => nodes.get(id), body: { classList: { add() {}, remove() {} } } },
    window: {}, performance: { now: () => state.now },
    projectReplicaConfig: () => { state.configProjects++; return {
      catalog: { characters: new Map([[118002, 'duck']]) }, rules: { characters: { duck: {} } }, config: {} }; },
    createReplicaAdapter: () => {
      const adapter = { get localPlayerId() { return state.localId; },
        project: frame => {
          state.projectedTicks.push(frame.tick);
          if (state.projectError) throw state.projectError;
          return state.projectable ? { Tick: Number(frame.tick), Players: frame.players ?? [] } : null;
        }, events: () => { state.events++; return []; } };
      state.adapters.push(adapter); return adapter;
    },
    ReplicaTerrain: class { read(grid) { state.terrainReads++; if (grid.error) throw grid.error; return grid.ready ? { grid } : null; } },
    createPresentation: options => {
      const owned = { options, pushes: [], windows: [], disposeCount: 0 }; state.presentations.push(owned);
      return { push: frame => owned.pushes.push(frame), setSelectionWindow: (...args) => owned.windows.push(args),
        inputBlocked: () => false, dispose() { owned.disposeCount++; } };
    },
  };
  vm.runInNewContext(source + '\nglobalThis.createGameView = createGameView;', sandbox);
  const view = sandbox.createGameView({ inputReady: () => state.ready, ...callbacks });
  const frame = tick => ({ tick, selfId: '00000000000000010000000000000003',
    match: { id: '00000000000000010000000000000001', matchId: '1', phase: 2 },
    players: [{ id: '00000000000000010000000000000003' }], chests: [], events: [],
    config: { mapSize: 19, groundLayer: 0, obstacleLayer: 1, blocks: [] } });
  return { nodes, state, view, frame, evidence: sandbox.window.__lumioPresentation };
}

test('owner pose maps only the current raw life to its renderer handle and retains a valid pose without interpolation', () => {
  let value;
  const read = () => value;
  const p = waitingPresentationFixture({ readOwnerPose: read });
  p.view.update(p.frame('10'), { ready: true });
  const options = p.state.presentations[0].options;
  assert.equal(typeof options.readLocalPose, 'function');
  assert.equal(options.readLocalPose(), null);
  value = { entity: p.frame('10').selfId, connectionGeneration: '9', publicationSequence: '9007199254740993',
    sessionGeneration: '1', model: { position: { x: 12, y: 0, z: 13 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } };
  const pose = options.readLocalPose();
  assert.equal(pose.playerId, 1); assert.equal(pose.entity, value.entity);
  assert.equal(pose.connectionGeneration, '9'); assert.equal(pose.publicationSequence, '9007199254740993');
  assert.equal(pose.model, value.model);
  value = null;
  assert.equal(options.readLocalPose(), pose, 'an unavailable evaluation holds only the current lifetime display');
  p.view.suspend('world-rebinding');
  assert.equal(options.readLocalPose(), null);
  p.view.update(p.frame('11'), { ready: true });
  assert.equal(options.readLocalPose(), null, 'a rebound lifetime has no inherited Model display');
  p.view.dispose();
  assert.equal(options.readLocalPose(), null);
});

test('same-tick publication replacement is accepted while old entity, sequence and generation are rejected', () => {
  let calls = 0, value;
  const p = waitingPresentationFixture({ readOwnerPose: () => { calls++; return value; } });
  p.view.update(p.frame('10'), { ready: true });
  const read = p.state.presentations[0].options.readLocalPose;
  assert.equal(typeof read, 'function');
  const pose = (generation, sequence, x = 1, entity = p.frame('10').selfId) => ({ entity,
    connectionGeneration: generation, publicationSequence: sequence, sessionGeneration: '1',
    model: { position: { x, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });
  value = pose('9', '9007199254740993'); read();
  value = pose('9', '9007199254740994', 5); assert.equal(read().model.position.x, 5);
  value = pose('9', '9007199254740993', 7); assert.equal(read().model.position.x, 5);
  value = pose('10', '1', 8); assert.equal(read().model.position.x, 8);
  value = pose('9', '9007199254740995', 9); assert.equal(read().model.position.x, 8);
  value = pose('10', '2', 9, 'other-life'); assert.equal(read(), null);
  const formerRead = read;
  p.state.localId = 2; p.view.update(p.frame('11'), { ready: true });
  const before = calls; assert.equal(formerRead(), null); assert.equal(calls, before);
  p.view.dispose();
  const disposedRead = p.state.presentations.at(-1).options.readLocalPose;
  assert.equal(disposedRead(), null); assert.equal(calls, before);
});

test('older consumers without an owner callback preserve their optional rendering contract', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  assert.equal(p.state.presentations[0].options.readLocalPose, undefined);
});

test('inactive or replaced Session lifetime clears a cached pose even before a new publication exists', () => {
  let lifetime = 'attempt1:session1';
  let value;
  const p = waitingPresentationFixture({ readOwnerPose: () => value, ownerPoseLifetime: () => lifetime });
  p.view.update(p.frame('10'), { ready: true });
  const read = p.state.presentations[0].options.readLocalPose;
  value = { entity: p.frame('10').selfId, connectionGeneration: '9', publicationSequence: '1', sessionGeneration: '1',
    model: { position: { x: 12, y: 0, z: 13 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } };
  assert.equal(read().model.position.x, 12);
  value = null; assert.equal(read().model.position.x, 12);
  lifetime = null; assert.equal(read(), null);
  lifetime = 'attempt1:session2'; assert.equal(read(), null);
});

for (const missing of ['match', 'config']) test(`a new GameView with missing ${missing} remains hidden and cannot act as a first screen`, () => {
  const p = waitingPresentationFixture(), frame = p.frame('1'); delete frame[missing];
  p.view.update(frame, { ready: true });
  assert.equal(p.state.presentations.length, 0); assert.equal(p.nodes.get('presentation').hidden, true);
  assert.notEqual(p.evidence.status, 'active'); assert.equal(p.evidence.frame, null);
  assert.equal(p.view.inputBlocked(), true);
});

for (const missing of ['match', 'config']) test(`an established GameView hides stale evidence while current ${missing} is missing, then resumes only a fresh projection`, () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const owned = p.state.presentations[0], frame = p.frame('11'); delete frame[missing];
  p.view.update(frame, { ready: true });
  assert.equal(owned.pushes.length, 1, 'no stale or incomplete projection is pushed');
  assert.notEqual(p.evidence.status, 'active'); assert.equal(p.evidence.frame, null);
  assert.equal(p.evidence.self, null); assert.equal(p.evidence.authorityTick, null);
  assert.equal(p.nodes.get('presentation').hidden, true); assert.equal(p.view.inputBlocked(), true);
  p.view.update(p.frame('12'), { ready: true });
  assert.equal(p.state.presentations.length, 1); assert.equal(p.state.adapters.length, 1); assert.equal(owned.disposeCount, 0);
  assert.equal(p.nodes.get('presentation').hidden, false); assert.equal(p.evidence.status, 'active'); assert.equal(p.evidence.authorityTick, '12');
  assert.equal(owned.pushes.length, 2); assert.equal(owned.pushes.at(-1).snapshot.Tick, 12);
});

test('a replacement terrain waiting window hides the whole root and clears old evidence without retiring its renderer', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const owned = p.state.presentations[0]; p.view.update(p.frame('11'), { ready: false });
  assert.equal(owned.pushes.length, 1); assert.equal(p.nodes.get('presentation').hidden, true);
  assert.equal(p.evidence.status, 'loading-terrain'); assert.equal(p.evidence.frame, null);
  assert.equal(p.evidence.self, null); assert.equal(p.evidence.authorityTick, null); assert.equal(p.view.inputBlocked(), true);
  p.view.update(p.frame('12'), { ready: true });
  assert.equal(p.state.presentations.length, 1); assert.equal(p.state.adapters.length, 1); assert.equal(owned.disposeCount, 0);
  assert.equal(p.nodes.get('presentation').hidden, false); assert.equal(p.evidence.status, 'active'); assert.equal(p.evidence.authorityTick, '12');
});

test('a null fresh projection cannot leave the previous active frame visible', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const owned = p.state.presentations[0]; p.state.projectable = false; p.view.update(p.frame('11'), { ready: true });
  assert.equal(owned.pushes.length, 1); assert.notEqual(p.evidence.status, 'active'); assert.equal(p.evidence.frame, null);
  assert.equal(p.nodes.get('presentation').hidden, true); assert.equal(p.view.inputBlocked(), true);
  p.state.projectable = true; p.view.update(p.frame('12'), { ready: true });
  assert.equal(p.evidence.authorityTick, '12'); assert.equal(p.state.presentations.length, 1);
});

test('input readiness follows the current Session and is also disabled during a hidden projection window', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const options = p.state.presentations[0].options;
  assert.equal(options.callbacks.inputReady(), false, 'a fresh image cannot enable an unready current Session');
  p.state.ready = true; assert.equal(options.callbacks.inputReady(), true);
  p.view.update(p.frame('11'), { ready: false });
  assert.equal(options.callbacks.inputReady(), false, 'the old ready Session must not authorize hidden presentation input');
  p.view.update(p.frame('12'), { ready: true }); assert.equal(options.callbacks.inputReady(), true);
  p.state.ready = false; assert.equal(options.callbacks.inputReady(), false);
});

test('terrain faults remain the same thrown error and cannot preserve stale active presentation', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const error = new Error('formal terrain failure');
  assert.throws(() => p.view.update(p.frame('11'), { error }), value => value === error);
  assert.notEqual(p.evidence.status, 'active'); assert.equal(p.evidence.frame, null);
  assert.equal(p.nodes.get('presentation').hidden, true); assert.equal(p.view.inputBlocked(), true);
});

test('a genuine changed local renderer ID still retires its former renderer', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const first = p.state.presentations[0]; p.state.localId = 2; p.view.update(p.frame('11'), { ready: true });
  assert.equal(first.disposeCount, 1); assert.equal(p.state.presentations.length, 2);
  assert.equal(p.state.presentations[1].options.localPlayerId, 2); assert.equal(p.state.adapters.length, 1);
  p.view.dispose(); assert.equal(p.state.presentations[1].disposeCount, 1); assert.equal(p.nodes.get('presentation').hidden, true);
});

for (const resumedTick of ['10', '12']) test(`an unavailable zero authority frame waits without changing the same-match timeline, then resumes at ${resumedTick}`, () => {
  const p = waitingPresentationFixture(); p.state.ready = true;
  p.view.update(p.frame('10'), { ready: true });
  const adapter = p.state.adapters[0], owned = p.state.presentations[0];
  assert.equal(owned.options.callbacks.inputReady(), true);
  p.view.update(p.frame('0'), { ready: true });
  assert.equal(p.evidence.status, 'waiting-projection');
  assert.equal(p.nodes.get('presentation').hidden, true);
  assert.equal(p.evidence.frame, null); assert.equal(p.evidence.players, 0);
  assert.equal(p.evidence.self, null); assert.equal(p.evidence.authorityTick, null); assert.equal(p.evidence.events, 0);
  assert.equal(p.view.inputBlocked(), true); assert.equal(owned.options.callbacks.inputReady(), false);
  assert.equal(p.state.terrainReads, 1, 'unavailable authority does not read or mutate terrain');
  assert.deepEqual(p.state.projectedTicks, ['10'], 'zero must not enter the existing adapter timeline');
  assert.equal(owned.pushes.length, 1); assert.equal(p.state.events, 1);
  assert.equal(p.state.configProjects, 1); assert.equal(p.state.adapters.length, 1); assert.equal(owned.disposeCount, 0);
  p.view.update(p.frame(resumedTick), { ready: true });
  assert.equal(p.evidence.status, 'active'); assert.equal(p.evidence.authorityTick, resumedTick);
  assert.equal(p.nodes.get('presentation').hidden, false); assert.equal(p.view.inputBlocked(), false);
  assert.equal(owned.options.callbacks.inputReady(), true);
  assert.equal(p.state.adapters[0], adapter); assert.equal(p.state.presentations.length, 1);
  assert.equal(owned.disposeCount, 0); assert.equal(owned.pushes.length, 2);
  assert.equal(p.state.terrainReads, 2); assert.equal(p.state.events, 2);
  assert.deepEqual(p.state.projectedTicks, ['10', resumedTick]);
});

test('an initial zero authority frame cannot create terrain, an adapter, or a first screen', () => {
  const p = waitingPresentationFixture(); p.state.ready = true;
  p.view.update(p.frame('0'), { ready: true });
  assert.equal(p.evidence.status, 'waiting-projection'); assert.equal(p.nodes.get('presentation').hidden, true);
  assert.equal(p.evidence.frame, null); assert.equal(p.view.inputBlocked(), true);
  assert.equal(p.state.configProjects, 0); assert.equal(p.state.terrainReads, 0);
  assert.equal(p.state.adapters.length, 0); assert.equal(p.state.presentations.length, 0);
  assert.deepEqual(p.state.projectedTicks, []); assert.equal(p.state.events, 0);
});

test('a zero frame from another match waits before retiring the old timeline, then a real new-match frame rebuilds it', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const first = p.state.presentations[0], nextMatch = tick => ({ ...p.frame(tick),
    match: { ...p.frame(tick).match, matchId: '2' } });
  p.view.update(nextMatch('0'), { ready: true });
  assert.equal(p.evidence.status, 'waiting-projection'); assert.equal(first.disposeCount, 0);
  assert.equal(p.state.configProjects, 1); assert.equal(p.state.terrainReads, 1);
  assert.equal(p.state.adapters.length, 1); assert.equal(p.state.presentations.length, 1);
  p.view.update(nextMatch('1'), { ready: true });
  assert.equal(p.evidence.status, 'active'); assert.equal(p.evidence.authorityTick, '1');
  assert.equal(first.disposeCount, 1); assert.equal(p.state.adapters.length, 2);
  assert.equal(p.state.presentations.length, 2); assert.equal(p.state.configProjects, 2);
});

test('a positive tick regression still reaches the adapter and propagates its original guard error', () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const error = new Error('presentation_tick_regressed'); p.state.projectError = error;
  assert.throws(() => p.view.update(p.frame('9'), { ready: true }), value => value === error);
  assert.deepEqual(p.state.projectedTicks, ['10', '9']);
  assert.equal(p.evidence.status, 'error'); assert.equal(p.evidence.frame, null);
  assert.equal(p.nodes.get('presentation').hidden, true); assert.equal(p.view.inputBlocked(), true);
  assert.equal(p.state.presentations[0].pushes.length, 1); assert.equal(p.state.events, 1);
});

for (const tick of [undefined, 0]) test(`only the string zero waits; ${String(tick)} still reaches the strict projection delegate`, () => {
  const p = waitingPresentationFixture(); p.view.update(p.frame('10'), { ready: true });
  const error = new Error('malformed authority tick'); p.state.projectError = error;
  assert.throws(() => p.view.update(p.frame(tick), { ready: true }), value => value === error);
  assert.deepEqual(p.state.projectedTicks, ['10', tick]);
  assert.equal(p.evidence.status, 'error'); assert.equal(p.state.presentations[0].pushes.length, 1);
});
