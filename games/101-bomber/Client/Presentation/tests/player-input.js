import { createPresentation, CHARACTER_ORDER, DEFAULT_RULES, DEFAULT_CONFIG, BlockType } from '../src/index.ts'
import { snap, skillsView } from '../src/hud/__tests__/fixtures.ts'
import { createPlayerInput } from '../../UI/Spectator/player-controls.mjs'

// Read-only rendering/input fixture. These callbacks log intents; no gameplay is simulated.
const snapshot = snap({ tick: 100, players: CHARACTER_ORDER.map((character, i) => ({
  id: i + 1, x: 7.5 + i, z: 9.5, hats: i * 4,
  skills: skillsView({ character, slots: { bomb: null, passive: null,
    active: { skill: 'bubble', level: 1, bound: true } } }),
})) })
for (const [i, p] of snapshot.Players.entries()) p.meta.animal = DEFAULT_RULES.characters[CHARACTER_ORDER[i]].animal
const size = DEFAULT_CONFIG.mapSize
snapshot.Terrain = { size, rev: 1, ground: new Uint8Array(size * size).fill(BlockType.地面),
  brick: new Uint8Array(size * size).fill(BlockType.Air) }
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  if (x === 0 || y === 0 || x === size - 1 || y === size - 1) snapshot.Terrain.brick[y * size + x] = BlockType.铁皮
}
const state = { ready: true, sendSuccess: true, commands: [], directions: [], selections: [], snapshot }
const presentation = createPresentation({
  stage: document.getElementById('stage'), labels: document.getElementById('labels'), hud: document.getElementById('hud'),
  config: DEFAULT_CONFIG, localPlayerId: 2,
  callbacks: {
    inputReady: () => state.ready,
    onMove: (a, b) => { state.directions.push([a, b]); const m = [0, 1, 3, 4, 2]; input.setTouchDirection(m[a], m[b]) },
    onUseSkill: () => state.commands.push(['skill']),
    onPlaceBomb: () => state.commands.push(['bomb']),
    onChangeCharacter: id => { if (!state.sendSuccess) return false; state.selections.push(id); return true },
  },
})
const input = createPlayerInput({
  ready: () => state.ready && !presentation.inputBlocked(),
  sendMove: (...args) => state.commands.push(['move', ...args]),
  placeBomb: () => state.commands.push(['bomb']), useSkill: () => state.commands.push(['skill']),
})
Object.assign(state, { presentation, input, pushSkill(overrides) {
  snapshot.Tick++
  Object.assign(snapshot.Players[1].skills, overrides)
  presentation.push({ snapshot: { ...snapshot, Players: [...snapshot.Players] }, events: [] })
}, dispose() { input.destroy(); presentation.dispose() } })
window.playerInputFixture = state
presentation.push({ snapshot, events: [] })
presentation.setSelectionWindow(true, true)
presentation.toggleOverview()
