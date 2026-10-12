import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file = new URL('./room-view.mjs', import.meta.url);
const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/export /g, '') : '';
function setup() {
  const nodes = new Map();
  function node(id) { return { id, hidden: false, textContent: '', disabled: false, dataset: {}, children: [], listeners: {},
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    addEventListener(event, fn) { this.listeners[event] = fn; }, setAttribute(key, value) { this[key] = value; } }; }
  for (const id of ['room', 'room-count', 'room-status', 'room-seats', 'room-fill', 'room-wait', 'room-character', 'room-selection-status']) nodes.set(id, node(id));
  const commands = [];
  const context = vm.createContext({ Math, Number, String, BigInt, document: { getElementById: id => nodes.get(id), createElement: node } });
  vm.runInContext(source, context);
  assert.equal(typeof context.createRoomView, 'function', 'the entry must provide the real room renderer');
  const view = context.createRoomView({ onFill: enabled => { commands.push(enabled); return true; }, onCharacter: id => { commands.push(id); return true; } });
  const human = { id: '1', name: 'Alice', isBot: false, isSelf: true };
  const state = { inputEnabled: true, selfId: '1', phase: 'WaitingForWorldReady', room: { capacity: 8, humans: 1, bots: 0, fillEnabled: false, nextBotJoinTick: '0', authorityTick: '100', tickRateHz: 20, players: [human] } };
  return { nodes, commands, view, state };
}
test('connecting shows eight empty seats without inventing roster or count', () => {
  const { view, nodes } = setup(); view.update(null, 'synchronizing');
  assert.match(nodes.get('room-status').textContent, /连接/);
  assert.equal(nodes.get('room-count').textContent, '— / 8');
  assert.equal(nodes.get('room-seats').children.length, 8);
  assert.equal(nodes.get('room-fill').disabled, true);
});
test('waiting renders actual human and seven sequential replicated bot additions', () => {
  const { view, nodes, state } = setup(); view.update(state, 'active');
  assert.equal(nodes.get('room-count').textContent, '1 / 8');
  assert.match(nodes.get('room-seats').children[0].textContent, /Alice.*你.*真人/);
  assert.match(nodes.get('room-status').textContent, /等待真人/);
  for (let i = 1; i <= 7; i++) {
    state.room.players.push({ id: String(i + 1), name: `bot00${i}`, isBot: true, isSelf: false }); state.room.bots = i;
    view.update(state, 'active');
    assert.equal(nodes.get('room-count').textContent, `${i + 1} / 8`);
    assert.match(nodes.get('room-seats').children[i].textContent, new RegExp(`bot00${i}.*机器人`));
  }
  assert.match(nodes.get('room-status').textContent, /满员/);
  assert.equal(nodes.get('room-fill').disabled, true);
});
test('fill controls publish intent and keep replicated state until authority confirms', () => {
  const { view, nodes, commands, state } = setup(); view.update(state, 'active');
  nodes.get('room-fill').listeners.click();
  assert.deepEqual(commands, [true]);
  assert.equal(state.room.fillEnabled, false);
  assert.match(nodes.get('room-status').textContent, /确认/);
  state.room.fillEnabled = true; state.room.nextBotJoinTick = '160'; view.update(state, 'active');
  assert.match(nodes.get('room-status').textContent, /3 秒/);
  state.room.authorityTick = '141'; view.update(state, 'active');
  assert.match(nodes.get('room-status').textContent, /1 秒/);
  nodes.get('room-wait').listeners.click(); assert.deepEqual(commands, [true, false]);
  state.room.fillEnabled = false; view.update(state, 'active'); assert.match(nodes.get('room-status').textContent, /等待真人/);
});
test('warmup and running leave the room for the real presentation', () => {
  const { view, nodes, state } = setup(); view.update(state, 'active'); assert.equal(nodes.get('room').hidden, false);
  for (const phase of ['Warmup', 'Running', 'FinalCircle', 'Results']) { state.phase = phase; view.update(state, 'active'); assert.equal(nodes.get('room').hidden, true); }
  view.update(null, 'failed'); assert.equal(nodes.get('room').hidden, false); assert.match(nodes.get('room-status').textContent, /连接失败/);
});
test('compact character selection uses configured identity and preserves authoritative reconnect', () => {
  const { view, nodes, commands, state } = setup(); view.configure({ characters: [{ name: 'duck', display_name: '飞鸭' }] });
  view.update(state, 'active'); nodes.get('room-character').value = 'duck'; nodes.get('room-character').listeners.change();
  assert.deepEqual(commands, ['duck']); assert.match(nodes.get('room-selection-status').textContent, /确认/);
  state.characterName = 'duck'; view.update(state, 'active'); assert.equal(nodes.get('room-character').value, 'duck');
  assert.equal(nodes.get('room-selection-status').textContent, '已选择');
});
test('waiting character latch confirms before Warmup and stays changeable', () => {
  const { view, nodes, commands, state } = setup(); view.configure({ characters: [{ name: 'duck' }, { name: 'cat' }] });
  view.update(state, 'active'); nodes.get('room-character').value = 'duck'; nodes.get('room-character').listeners.change();
  state.selectedCharacterName = 'duck'; view.update(state, 'active');
  assert.equal(nodes.get('room-character').disabled, false);
  assert.equal(nodes.get('room-selection-status').textContent, '已选择');
  nodes.get('room-character').value = 'cat'; nodes.get('room-character').listeners.change();
  assert.deepEqual(commands, ['duck', 'cat']);
});
test('compact choice displays established character labels without changing config identities', () => {
  const { view, nodes } = setup(); view.configure({ characters: [{ name: 'duck' }, { name: 'kangaroo' }] });
  assert.equal(nodes.get('room-character').children[1].value, 'duck');
  assert.equal(nodes.get('room-character').children[1].textContent, '泡泡鸭');
  assert.equal(nodes.get('room-character').children[2].textContent, '飞腿袋鼠');
});
