import { BlockType, 方向 } from '../contract'
import { DIR_VEC } from './grid'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能用到的格子几何（闪现落点、光环范围、踢弹滑行），纯函数。
 * 规则层用 `sim/world.ts gridProbe(w)` 喂数据，Bot 与表现层用快照喂，三方同一口径。
 */
export interface GridProbe {
  readonly size: number
  /** 砖层（BlockType），下标 = Y·size + X。 */
  readonly brick: ArrayLike<number>
  /** 地面层（BlockType）：踢进水里即熄灭要看它。 */
  readonly ground: ArrayLike<number>
  /** 该格有未爆炸弹或宝箱。 */
  occupied(ci: number): boolean
}

export interface BlinkScan {
  /** 落点格。 */
  landing: number
  /**
   * 火焰冲刺的火墙格 = 起点格 + 途经的砖层为空的格，**不含落点**（RESOLUTIONS #6）。按离起点由近到远。
   */
  path: readonly number[]
}

function stepCell(size: number, ci: number, dir: 方向): number {
  const { dx, dy } = DIR_VEC[dir]
  const x = (ci % size) + dx
  const y = Math.floor(ci / size) + dy
  if (x < 0 || y < 0 || x >= size || y >= size) return -1
  return y * size + x
}

/**
 * 闪现 / 火焰冲刺（D12）：朝 facing 扫 1..maxCells 格；出界或铁皮即停（后面的格够不着）。
 * 扫到的格里「砖层为空且没有未爆弹 / 宝箱」的都是候选，取最远的一个为落点——积木、木箱、炸弹、宝箱都能越过。
 * 没有落点（或面向为停）→ null：施放失败、不耗 CD。
 */
export function blinkScan(g: GridProbe, from: number, facing: 方向, maxCells: number): BlinkScan | null {
  if (facing === 方向.停) return null
  const scanned: number[] = []
  let landingAt = -1
  let c = from
  for (let k = 1; k <= maxCells; k++) {
    c = stepCell(g.size, c, facing)
    if (c < 0 || g.brick[c] === BlockType.铁皮) break
    scanned.push(c)
    if (g.brick[c] === BlockType.Air && !g.occupied(c)) landingAt = scanned.length - 1
  }
  if (landingAt < 0) return null
  const path = [from]
  for (let i = 0; i < landingAt; i++) if (g.brick[scanned[i]] === BlockType.Air) path.push(scanned[i])
  return { landing: scanned[landingAt], path }
}

/** 火焰光环（D13）：以 center 为心的 3×3（含熊自己脚下），界内且砖层为空的格，先 Y 后 X。 */
export function auraCells(g: Pick<GridProbe, 'size' | 'brick'>, center: number): number[] {
  const out: number[] = []
  const cx = center % g.size
  const cy = Math.floor(center / g.size)
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue
      const c = y * g.size + x
      if (g.brick[c] === BlockType.Air) out.push(c)
    }
  return out
}

/**
 * 踢弹滑行的终点（纯几何）：从 from 朝 dir 走，下一格界内、砖层为空且没有未爆弹 / 宝箱才前进，至多 maxCells 格。
 * 玩家不挡（与移动没有玩家碰撞一致，RESOLUTIONS #10）；水不在这里处理，见 {@link kickOutcome}。
 */
export function slideStop(g: GridProbe, from: number, dir: 方向, maxCells: number): number {
  if (dir === 方向.停) return from
  let c = from
  for (let k = 0; k < maxCells; k++) {
    const n = stepCell(g.size, c, dir)
    if (n < 0 || g.brick[n] !== BlockType.Air || g.occupied(n)) break
    c = n
  }
  return c
}

/**
 * 一次踢弹的完整结果（给 Bot 预测、给测试对照）：同 {@link slideStop}，但炸弹进入的第一个水格就是终点并熄灭
 * （design §8.4「踢进水里 = 拆弹」，RESOLUTIONS #9）。`cells` = 滑过的格数（0 = 踢不动）。
 */
export function kickOutcome(g: GridProbe, from: number, dir: 方向, maxCells: number): { stop: number; cells: number; water: boolean } {
  if (dir === 方向.停) return { stop: from, cells: 0, water: false }
  let c = from
  let cells = 0
  for (let k = 0; k < maxCells; k++) {
    const n = stepCell(g.size, c, dir)
    if (n < 0 || g.brick[n] !== BlockType.Air || g.occupied(n)) break
    c = n
    cells++
    if (g.ground[n] === BlockType.水) return { stop: c, cells, water: true }
  }
  return { stop: c, cells, water: false }
}
