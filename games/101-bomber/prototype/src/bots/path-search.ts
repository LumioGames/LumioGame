import { FOUR_DIRS, DIR_VEC, inBounds } from '../shared/grid'
import { isOpen, isWater, type Board } from './board'
import { conflicts, type DangerMap } from './danger-map'

export interface SearchOptions {
  /** 陆地 / 水里每格耗时（Tick，可带小数：按真实移速算，不取整）。 */
  tpcLand: number
  tpcWater: number
  /**
   * 每格额外的慢速余量（Tick），缺省 0.5。占用区间取 [最快进入, 最慢离开)：
   * 只把人估慢会让「等火灭了再过」看起来更安全，必须两头一起放宽。
   */
  slowPerCell?: number
  /** 路径能否经过水格（起点除外：人已经在水里时总能离开）。 */
  allowWater: boolean
  /**
   * 按 FOUR_DIRS 顺序，从起点实际位置走出本格所需的 Tick。人可能正贴着格边，
   * 按整格估会把相邻格的进入时刻估晚，从而走进还在烧的火里。缺省 = 整格。
   */
  startExit?: readonly number[]
  /**
   * 连续泡水的 Tick 上限（不含）：溺水按「进水后每 drownInterval Tick」扣血，
   * 计划里任何一段连续水路都不得碰到这个线。缺省不限。
   */
  maxWaterTicks?: number
  /** 起点之前已经连续在水里的 Tick（起点在水里时，从实际位置走出起点的耗时也计入连续泡水）。 */
  startWaterTicks?: number
  /** 危险窗冲突判定的余量（Tick），缺省 2；走投无路时以 0 重试。 */
  margin?: number
}

/**
 * 一次时间感知 BFS 的结果：所有行为共用同一张场（logic-design §6「每次思考 ≤ 1 次 BFS」）。
 * 不建模原地等待。`reached` 先列不穿毒圈可达的格子，再列必须经毒格才到的。
 */
export interface PathField {
  start: number
  /** 步数；−1 = 不可达。 */
  steps: Int32Array
  /** 最快进入该格的 Tick。 */
  enter: Float64Array
  /** 最慢进入该格的 Tick。 */
  enterLate: Float64Array
  parent: Int32Array
  /** BFS 顺序的可达格（含起点）。 */
  reached: number[]
  /** 能否在起点危险窗到来之前离开起点。 */
  startOk: boolean
  /** 1 = 到该格的路线（不含起点）要经过毒圈格。 */
  viaPoison: Uint8Array
  /** 到该格的路线在毒圈里累计待的 Tick（起点在毒圈里时含走出起点的耗时；按不重置累计，往保守里估）。 */
  poisonTicks: Float64Array
}

export function searchPaths(board: Board, dm: DangerMap, start: number, now: number, opts: SearchOptions): PathField {
  const size = board.size
  const n2 = size * size
  const steps = new Int32Array(n2).fill(-1)
  const enter = new Float64Array(n2)
  const enterLate = new Float64Array(n2)
  const parent = new Int32Array(n2).fill(-1)
  const viaPoison = new Uint8Array(n2)
  const poisonTicks = new Float64Array(n2)
  const startPoisoned = dm.poison[start] <= now
  const reached: number[] = [start]
  const slow = opts.slowPerCell ?? 0.5
  const margin = opts.margin ?? 2
  steps[start] = 0
  enter[start] = now
  enterLate[start] = now
  const tpcOf = (c: number): number => (isWater(board, c) ? opts.tpcWater : opts.tpcLand)
  const startOk = !conflicts(dm, start, now, Math.ceil(now + tpcOf(start) + slow), margin)
  const maxWater = opts.maxWaterTicks ?? Infinity
  // 离开该格时已连续泡水的 Tick（陆地 = 0）。起点按「已泡的 + 从实际位置走出本格」算，不按整格：
  // 人可能已走到格边，整格估会把紧挨着的上岸路线误判成超额，把人困在水里干等到溺死。
  const waterRun = new Float64Array(n2)
  const startWet = isWater(board, start)
  // 毒圈格延后展开：能不穿毒就到的格子一律先走干净路线；只有非穿毒圈不可的格子才经毒格到达。
  const later: number[] = []
  for (let h = 0; h < reached.length || later.length > 0; h++) {
    if (h >= reached.length) {
      for (const c of later) reached.push(c)
      later.length = 0
    }
    const c = reached[h]
    const cx = c % size
    const cy = (c - cx) / size
    for (let k = 0; k < FOUR_DIRS.length; k++) {
      const v = DIR_VEC[FOUR_DIRS[k]]
      const x = cx + v.dx
      const y = cy + v.dy
      if (!inBounds(x, y, size)) continue
      const nb = y * size + x
      if (steps[nb] >= 0 || !isOpen(board, nb)) continue
      const wet = isWater(board, nb)
      if (wet && !opts.allowWater) continue
      const exit = c === start && opts.startExit ? opts.startExit[k] : tpcOf(c)
      const early = enter[c] + exit
      const late = enterLate[c] + exit + slow
      const cost = tpcOf(nb) + slow
      const base = c === start ? (startWet ? (opts.startWaterTicks ?? 0) + exit + slow : 0) : waterRun[c]
      const run = wet ? base + cost : 0
      if (run >= maxWater) continue
      if (conflicts(dm, nb, Math.floor(early), Math.ceil(late + cost), margin)) continue
      waterRun[nb] = run
      steps[nb] = steps[c] + 1
      enter[nb] = early
      enterLate[nb] = late
      parent[nb] = c
      const poisoned = dm.poison[nb] <= Math.ceil(late + cost)
      viaPoison[nb] = poisoned || viaPoison[c] ? 1 : 0
      poisonTicks[nb] = (c === start ? (startPoisoned ? exit + slow : 0) : poisonTicks[c]) + (poisoned ? cost : 0)
      if (poisoned) later.push(nb)
      else reached.push(nb)
    }
  }
  return { start, steps, enter, enterLate, parent, reached, startOk, viaPoison, poisonTicks }
}

/** 起点（含）→ goal（含）的格序列；goal 不可达返回空数组。 */
export function pathTo(field: PathField, goal: number): number[] {
  if (field.steps[goal] < 0) return []
  const out: number[] = []
  for (let c = goal; c >= 0; c = field.parent[c]) {
    out.push(c)
    if (c === field.start) break
  }
  return out.reverse()
}

/**
 * 从实际位置走出本格、进入各方向相邻格的 Tick（顺序同 FOUR_DIRS：上、下、左、右）。
 * 换轴时要先把垂直偏移滑回通道中心，这段路程也算上。cellOf 是 floor：向 −方向离格要越过格边再多 1 千分格。
 */
export function exitTicks(pos: { x: number; z: number }, X: number, Y: number, speedMilli: number, hz: number, permille: number): number[] {
  const ox = Math.round(pos.x * 1000) - (X * 1000 + 500)
  const oy = Math.round(pos.z * 1000) - (Y * 1000 + 500)
  const perStep = Math.max(1, Math.floor((speedMilli * permille) / 1000))
  const t = (milli: number): number => (milli * hz) / perStep
  return [t(500 + oy + 1 + Math.abs(ox)), t(500 - oy + Math.abs(ox)), t(500 + ox + 1 + Math.abs(oy)), t(500 - ox + Math.abs(oy))]
}
