import { BlockType } from '../contract'
import { regenActive } from './final-circle'
import { spawnZones } from './mapgen'
import { cellOfIdx, countResource, emit, isAlive, playerCell, type World } from './world'

/** 再生格离任何活人 / 炸弹至少这么远（曼哈顿），避免积木凭空长在脚边或把人封死。 */
const CLEAR_RADIUS = 3

/**
 * 软砖再生（design §5，ADR 0026）：常规阶段每 regenInterval 个 Tick，在帧末把至多 regenOrbitsPerInterval 组
 * 四象限镜像格补回积木，直到可破坏砖回到开局的 regenTargetPermille。只长在无人区域：
 * 砖层为空、地面不是水、不在出生安全区、格上没有炸弹 / 糖果 / 宝箱、离活人与炸弹 ≥ CLEAR_RADIUS。
 * 与爆炸摧毁同在 VoxelCommit 相写入，下一帧才可见。
 */
export function regenBricks(w: World): void {
  if (!regenActive(w)) return
  const sinceStart = w.t - w.match.startTick
  if (sinceStart <= 0 || sinceStart % w.ticks.regenInterval !== 0) return
  const init = w.resourceInitial
  if (init <= 0 || countResource(w) * 1000 >= init * w.rules.regenTargetPermille) return

  const size = w.size
  const reserved = new Uint8Array(size * size)
  for (const z of spawnZones(size)) for (const c of z.cells) reserved[c] = 1
  const blockers: number[] = []
  for (const p of w.players) if (isAlive(p)) blockers.push(playerCell(w, p))
  for (const b of w.bombs) blockers.push(b.cell)
  const occupied = new Set<number>()
  // 本 Tick 刚被炸掉的格不立刻长回，否则表现层看到的砖层没变，这块砖永远不会被「炸飞」。
  for (const e of w.out) if (e.type === 'BrickDestroyed') occupied.add(e.Cell.Y * size + e.Cell.X)
  for (const it of w.pickups) occupied.add(it.cell)
  for (const c of w.chests) occupied.add(c.cell)

  const free = (c: number): boolean => {
    if (w.brick[c] !== BlockType.Air || w.ground[c] === BlockType.水 || reserved[c] || occupied.has(c)) return false
    const x = c % size
    const y = Math.floor(c / size)
    for (const o of blockers) if (Math.abs((o % size) - x) + Math.abs(Math.floor(o / size) - y) < CLEAR_RADIUS) return false
    return true
  }

  const half = Math.floor((size - 1) / 2)
  const orbits: number[][] = []
  for (let y = 1; y <= half; y++)
    for (let x = 1; x <= half; x++) {
      const mx = size - 1 - x
      const my = size - 1 - y
      const orbit = [...new Set([y * size + x, y * size + mx, my * size + x, my * size + mx])]
      if (orbit.every(free)) orbits.push(orbit)
    }
  if (orbits.length === 0) return

  const grown: number[] = []
  for (let k = 0; k < w.rules.regenOrbitsPerInterval && orbits.length > 0; k++) {
    const orbit = orbits.splice(w.rng.regen.NextInt(0, orbits.length), 1)[0]
    for (const c of orbit) {
      w.brick[c] = BlockType.积木
      grown.push(c)
    }
  }
  w.rev++
  emit(w, { type: 'BricksRegrown', presentationOnly: true, Cells: grown.map((c) => cellOfIdx(w, c)), Tick: w.t })
}
