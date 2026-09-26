import { BlockType } from '../contract'
import { flameCells } from './explosion'
import { inRect } from './final-circle'
import { addBrickWrite } from './terrain-commit'
import {
  cellOfIdx,
  centerMilli,
  emit,
  isAlive,
  playerCell,
  resetAbilityFields,
  type Rect,
  type SimPlayer,
  type World,
} from './world'

/**
 * 出生 / 重生（design §5「出生 / 重生点」、§12）。19×19 无分区：距任一活人与炸弹 ≥ spawnMinDistance，
 * 且有一个 L 形安全区（该点 + 相邻两个垂直方向各一格）；安全区里的积木 ≤ 2 块经帧末写批清掉。
 * 满足不了就把距离逐格放宽到 0（宁可近一点也要能重生，矩阵 7.5「无实体卡在不可重生状态」）。
 */

interface Choice {
  cell: number
  clears: number[]
}

const L_ORIENT: readonly (readonly [number, number])[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
]

export function findRespawnCell(w: World, self: SimPlayer): Choice {
  const size = w.size
  const flame = flameCells(w)
  const bombCell = new Uint8Array(size * size)
  const threats: { x: number; y: number }[] = []
  for (const b of w.bombs) {
    bombCell[b.cell] = 1
    threats.push({ x: b.cell % size, y: Math.floor(b.cell / size) })
  }
  for (const p of w.players) {
    if (p === self || !isAlive(p)) continue
    const c = playerCell(w, p)
    threats.push({ x: c % size, y: Math.floor(c / size) })
  }
  const chestCell = new Uint8Array(size * size)
  for (const ch of w.chests) chestCell[ch.cell] = 1
  const ring: Rect | null = w.finalCircle?.ring ?? null
  const blockedCell = (c: number): boolean =>
    w.ground[c] === BlockType.水 || flame[c] === 1 || bombCell[c] === 1 || chestCell[c] === 1
  const armOk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    const c = y * size + x
    const b = w.brick[c]
    return (b === BlockType.Air || b === BlockType.积木) && !blockedCell(c)
  }

  for (let minD = w.rules.spawnMinDistance; minD >= 0; minD--) {
    const free: Choice[] = []
    const clearing: Choice[] = []
    for (let c = 0; c < size * size; c++) {
      if (w.brick[c] !== BlockType.Air || blockedCell(c)) continue
      const x = c % size
      const y = Math.floor(c / size)
      if (ring && !inRect(ring, x, y)) continue
      let near = false
      for (const th of threats)
        if (Math.abs(th.x - x) + Math.abs(th.y - y) < minD) {
          near = true
          break
        }
      if (near) continue
      let best: number[] | null = null
      for (const [sx, sy] of L_ORIENT) {
        if (!armOk(x + sx, y) || !armOk(x, y + sy)) continue
        const clears: number[] = []
        for (const a of [y * size + x + sx, (y + sy) * size + x]) if (w.brick[a] === BlockType.积木) clears.push(a)
        if (best === null || clears.length < best.length) best = clears
        if (best.length === 0) break
      }
      if (best === null) continue
      ;(best.length === 0 ? free : clearing).push({ cell: c, clears: best })
    }
    const pool = free.length > 0 ? free : clearing
    if (pool.length > 0) return pool[w.rng.spawn.NextInt(0, pool.length)]
  }
  if (ring) {
    // 决赛圈里连 L 形安全区都凑不出：退到离圈心最近的空陆地格。
    const mid = (size - 1) / 2
    let best = -1
    let bestD = Infinity
    for (let y: number = ring.min; y <= ring.max; y++)
      for (let x: number = ring.min; x <= ring.max; x++) {
        const c = y * size + x
        if (w.brick[c] !== BlockType.Air || blockedCell(c)) continue
        const d = Math.abs(x - mid) + Math.abs(y - mid)
        if (d < bestD) {
          best = c
          bestD = d
        }
      }
    if (best >= 0) return { cell: best, clears: [] }
  }
  return { cell: playerCell(w, self), clears: [] }
}

export function placePlayerAt(w: World, p: SimPlayer, cell: number): void {
  p.mx = centerMilli(cell % w.size)
  p.my = centerMilli(Math.floor(cell / w.size))
  p.teleportTick = w.t
  resetAbilityFields(p)
}

export function processRespawns(w: World): void {
  const t = w.t
  for (const p of w.players) {
    if (!p.awaitingRespawn || t < p.respawnAtTick) continue
    const choice = findRespawnCell(w, p)
    for (const c of choice.clears) addBrickWrite(w, c, w.brick[c] as BlockType, 0, 0)
    p.awaitingRespawn = false
    p.health = w.cfg.maxHealthPoints
    p.protectedUntilTick = t + w.ticks.protection
    placePlayerAt(w, p, choice.cell)
    emit(w, { type: 'PlayerRespawned', NetEntityIdRaw: p.id, Cell: cellOfIdx(w, choice.cell), Tick: t })
  }
}

/** 开局摆位：出生候选经 spawn 流洗牌，按 slot 顺序落位。 */
export function placeAtMatchStart(w: World): void {
  const order = w.spawns.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = w.rng.spawn.NextInt(0, i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  const bySlot = [...w.players].sort((a, b) => a.spec.slot - b.spec.slot)
  bySlot.forEach((p, i) => {
    const z = w.spawns[order[i]]
    placePlayerAt(w, p, z.cells[0])
  })
}
