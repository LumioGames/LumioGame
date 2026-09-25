import { BlockType, type RingRect, type WorldSnapshot } from '../../src/contract'
import { cellOf } from '../../src/shared/grid'

/**
 * 决赛圈 1×1 可进入性检查（ADR 0031，endgame 设计 §3.8）：sim 测试、宿主测试、对局 harness 共用。
 * 只看地形与宝箱——炸弹（含被踢的）是暂时的，不算堵死。
 */
export interface FinalCellGrid {
  size: number
  brick: ArrayLike<number>
  ground: ArrayLike<number>
  chestCells: Iterable<number>
}

/**
 * null = 可进入：中心格砖层为空、不是水、没有宝箱，且从中心经「砖层为空且无宝箱」的格 BFS 能走到 5×5 的边
 * （与中心切比雪夫距离 2）。否则返回一句说明（测试失败时直接打出来）。
 */
export function finalCellBlocker(g: FinalCellGrid): string | null {
  const size = g.size
  const c = (size - 1) / 2
  const center = c * size + c
  const chests = new Set(g.chestCells)
  if (g.brick[center] !== BlockType.Air) return `centre (${c},${c}) brick = ${g.brick[center]}`
  if (g.ground[center] === BlockType.水) return `centre (${c},${c}) is water`
  if (chests.has(center)) return `centre (${c},${c}) holds a chest`
  const seen = new Set<number>([center])
  const q = [center]
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]
    const x = cur % size
    const y = Math.floor(cur / size)
    if (Math.max(Math.abs(x - c), Math.abs(y - c)) >= 2) return null
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const n = ny * size + nx
      if (seen.has(n) || g.brick[n] !== BlockType.Air || chests.has(n)) continue
      seen.add(n)
      q.push(n)
    }
  }
  const reached = [...seen].map((i) => `(${i % size},${Math.floor(i / size)})`).join(' ')
  return `centre (${c},${c}) is sealed inside the 5×5; reachable: ${reached}`
}

export function gridOfSnapshot(s: WorldSnapshot): FinalCellGrid {
  const size = s.Terrain.size
  const chestCells = s.Chests.map((ch) => {
    const k = cellOf(ch.LogicTransform.WorldPosition.x, ch.LogicTransform.WorldPosition.z)
    return k.Y * size + k.X
  })
  return { size, brick: s.Terrain.brick, ground: s.Terrain.ground, chestCells }
}

/** 安全圈（闭区间）内还剩的可破坏砖（积木 / 木箱）格下标；清场段生效后必须为空。 */
export function destructibleInside(g: Pick<FinalCellGrid, 'size' | 'brick'>, ring: RingRect): number[] {
  const out: number[] = []
  for (let y = ring.Min; y <= ring.Max; y++)
    for (let x = ring.Min; x <= ring.Max; x++) {
      const i = y * g.size + x
      if (g.brick[i] === BlockType.积木 || g.brick[i] === BlockType.木箱) out.push(i)
    }
  return out
}
