import { 方向 } from '../contract'
import { FOUR_DIRS, idx } from '../shared/grid'
import { blinkScan } from '../shared/skill-geometry'
import { gridProbe, isWater, type Board } from './board'
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：自己炸弹的穿透层数（缺省 0）。 */
  pierce?: number
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
  const dm = buildDangerMap(board, g.dangerTicks, { X: g.X, Y: g.Y, power: g.power, fuseEndTick, pierce: g.pierce ?? 0 })
  const bombAt = board.bombAt.slice()
  bombAt[here] = board.pending.length
  const chainAt = (board.chainAt ?? board.bombAt).slice()
  chainAt[here] = board.pending.length
  const withBomb: Board = { ...board, bombAt, chainAt }
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

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：放弹自检没过时，能不能靠主动技能躲掉（「放弹再开泡泡 / 放弹再闪」）。
 * - shield：泡泡在放弹后 1 Tick 施放、持续 shieldTicks；本格危险（含假想弹）在泡泡结束前（留 2 Tick）烧完。
 * - blink：按 FOUR_DIRS 序，闪现落点永不着火、不是水、horizon 前不进毒圈、别人的火在落地时已灭。
 * 两者都给时先试 shield。只看这颗弹放下后的局面（ev.board / ev.dm）。
 */
export function bombSkillEscape(
  ev: BombEvaluation,
  here: number,
  placeTick: number,
  o: { shieldTicks?: number; blinkRange?: number; horizon: number },
): { via: 'shield' | 'blink'; dir: 方向 } | null {
  if (o.shieldTicks !== undefined && o.shieldTicks > 0 && ev.dm.until[here] + 2 <= placeTick + 1 + o.shieldTicks) {
    return { via: 'shield', dir: 方向.停 }
  }
  if (o.blinkRange !== undefined && o.blinkRange > 0) {
    const probe = gridProbe(ev.board)
    for (const d of FOUR_DIRS) {
      const r = blinkScan(probe, here, d, o.blinkRange)
      if (!r) continue
      const L = r.landing
      if (isSafe(ev.dm, L) && !isWater(ev.board, L) && poisonFreeAfter(ev.dm, L, o.horizon) && ev.dm.burn[L] <= placeTick + 2) {
        return { via: 'blink', dir: d }
      }
    }
  }
  return null
}

export function hasEscapeAfterBomb(board: Board, g: BombGateInput): boolean {
  return evaluateBomb(board, g).ok
}
