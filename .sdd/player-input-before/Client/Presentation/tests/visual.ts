import { createPresentation, CHARACTER_ORDER, DEFAULT_RULES, DEFAULT_CONFIG, BlockType } from '../src'
import { snap, skillsView } from '../src/hud/__tests__/fixtures'

const snapshot = snap({ tick: 100, players: CHARACTER_ORDER.map((character, i) => ({
  id: i + 1, x: 7.5 + i, z: 9.5, hats: i * 4,
  skills: skillsView({ character, slots: {
    bomb: null, passive: null,
    active: { skill: 'bubble', level: 1, bound: true },
  } }),
})) })
for (const [i, player] of snapshot.Players.entries()) player.meta.animal = DEFAULT_RULES.characters[CHARACTER_ORDER[i]].animal
const size = DEFAULT_CONFIG.mapSize
snapshot.Terrain = {
  size, rev: 1,
  ground: new Uint8Array(size * size).fill(BlockType.地面),
  brick: new Uint8Array(size * size).fill(BlockType.Air),
}
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const index = y * size + x
  if (x === 0 || y === 0 || x === size - 1 || y === size - 1) snapshot.Terrain.brick[index] = BlockType.铁皮
  else if (y < 7 && x % 2 === 0 && y % 2 === 0) snapshot.Terrain.brick[index] = BlockType.积木
  if (x > 6 && x < 12 && y > 11 && y < 15) snapshot.Terrain.ground[index] = BlockType.水
}
const presentation = createPresentation({
  stage: document.getElementById('stage')!, labels: document.getElementById('labels')!, hud: document.getElementById('hud')!,
  config: { ...DEFAULT_CONFIG, mapSize: size }, localPlayerId: 1,
  callbacks: { onUseSkill: () => { state.skills++ }, onPlaceBomb: () => { state.bombs++ } },
})
const state = { skills: 0, bombs: 0, presentation }
Object.assign(window, { presentationFixture: state })
presentation.push({ snapshot, events: [] })
presentation.toggleOverview()
