import { idx } from '../shared/grid'
import { isWater, type Board } from './board'
import { buildDangerMap, isSafe, poisonFreeAfter, type DangerMap } from './danger-map'
import { searchPaths } from './path-search'

export interface BombGateInput {
  X: number
  Y: number
  power: number
  /** 放弹技能生效的 Tick（= board.now）。 */
  placeTick: number
  fuseTicks: number
  dangerTicks: number
  tpcLand: number
  tpcWater: number
  /** 逃生路程每格的慢速余量（见 SearchOptions.slowPerCell）。 */
  slowPerCell?: number
}

export interface BombEvaluation {
  /** 放了之后自己能逃（放弹自检通过）。 */
  ok: boolean
  /** 含假想炸弹的棋盘（假想弹占格挡路）与危险图：给「这颗弹能不能困死对手」复用。 */
  board: Board
  dm: DangerMap
}

/** 逃生终点在引爆 + 危险窗之后这么多 Tick 内不能进毒圈，否则躲完火还得马上跑。 */
const POISON_SLACK = 20

/**
 * 放弹自检（logic-design §6 Bomb gate）：在当前格加一颗假想炸弹、重算连锁危险图，
 * 必须能在危险窗到来前经**陆路**走到一个永不危险、近期不进毒圈的格子才放。水里放弹会熄灭，直接拒绝。
 */
export function evaluateBomb(board: Board, g: BombGateInput): BombEvaluation {
  const here = idx(g.X, g.Y, board.size)
  const fuseEndTick = g.placeTick + g.fuseTicks
  const dm = buildDangerMap(board, g.dangerTicks, { X: g.X, Y: g.Y, power: g.power, fuseEndTick })
  const bombAt = board.bombAt.slice()
  bombAt[here] = board.pending.length
  const withBomb: Board = { ...board, bombAt }
  if (isWater(board, here) || board.bombAt[here] >= 0) return { ok: false, board: withBomb, dm }
  const field = searchPaths(board, dm, here, g.placeTick, {
    tpcLand: g.tpcLand,
    tpcWater: g.tpcWater,
    slowPerCell: g.slowPerCell,
    allowWater: false,
  })
  let ok = false
  const hereOut = board.poisonAt[here] <= g.placeTick
  if (field.startOk) {
    const horizon = fuseEndTick + g.dangerTicks + POISON_SLACK
    for (const c of field.reached) {
      // 圈内放弹的逃生路线不许穿毒圈：残血在决赛圈里多半是被「躲自己的弹躲到圈外」毒死的。
      if (c !== here && isSafe(dm, c) && !isWater(board, c) && poisonFreeAfter(dm, c, horizon) && (field.viaPoison[c] === 0 || hereOut)) {
        ok = true
        break
      }
    }
  }
  return { ok, board: withBomb, dm }
}

export function hasEscapeAfterBomb(board: Board, g: BombGateInput): boolean {
  return evaluateBomb(board, g).ok
}
