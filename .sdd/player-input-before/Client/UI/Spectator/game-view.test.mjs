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
      const presentation = { options, pushes: [], disposeCount: 0 };
      presentations.push(presentation);
      return {
        push: frame => presentation.pushes.push(frame.snapshot.phase),
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
  choose('duck');
  assert.equal(changeButton.style.display, '');
  view.update(frame(1), {});
  choose('cat');
  assert.equal(changeButton.style.display, '');
  view.update(frame(2), {});
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
  view.dispose();
  choose('bear');
  assert.deepEqual(calls, ['duck', 'cat', 'kangaroo']);
});
