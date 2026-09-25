import { MatchPhase, type BomberCell, type RingRect, type U64, type WorldSnapshot } from '../contract'
import { cellOf } from '../shared/grid'

/**
 * 决赛圈 HUD 状态推导（design §4.2 表现行，ADR 0025）：纯快照 → 计分板标签、存活数、缩圈倒计时、
 * 决赛圈前的资源计量条、本人是否在圈外 / 已出局。
 */
export interface CircleHud {
  finalCircle: boolean
  /** 未出局人数（含重生倒计时中的）/ 总人数。 */
  alive: number
  total: number
  /** 距下一段缩圈的秒数；没有预告时为 null。 */
  shrinkInSec: number | null
  /** 决赛圈前：剩余可破坏砖占开局的百分比（0–100，整数）；决赛圈中 / 结算 / 无数据时为 null。 */
  resourcePct: number | null
  /** 资源触发阈值（百分比），给计量条上的刻度线。 */
  thresholdPct: number
  /** 本人活着、未出局、决赛圈中且站在安全圈外。 */
  outside: boolean
  localEliminated: boolean
}

/** 闭区间正方形安全圈：X、Y ∈ [Min, Max] 为圈内。 */
export function outsideRing(cell: BomberCell, ring: RingRect): boolean {
  return cell.X < ring.Min || cell.X > ring.Max || cell.Y < ring.Min || cell.Y > ring.Max
}

export function circleHud(snap: WorldSnapshot, localId: U64, renderTick: number, resourcePermille: number): CircleHud {
  const phase = snap.BomberMatchState.Phase
  const fc = phase === MatchPhase.Endgame ? snap.match.finalCircle : null
  const me = snap.Players.find((p) => p.NetEntityIdRaw === localId)
  const localEliminated = me?.eliminated ?? false
  let alive = 0
  for (const p of snap.Players) if (!p.eliminated) alive++
  if (fc) alive = fc.aliveCount
  let shrinkInSec: number | null = null
  if (fc?.nextRing && fc.nextRingTick > 0) shrinkInSec = Math.max(0, (fc.nextRingTick - renderTick) / snap.match.tickRateHz)
  const running = phase === MatchPhase.Running || phase === MatchPhase.Warmup
  const init = snap.match.resourceInitial
  const resourcePct = running && init > 0 ? Math.max(0, Math.min(100, Math.round((snap.match.resourceRemaining / init) * 100))) : null
  let outside = false
  if (fc && me && !localEliminated && me.玩家属性.血量当前 > 0) {
    const w = me.LogicTransform.WorldPosition
    outside = outsideRing(cellOf(w.x, w.z), fc.ring)
  }
  return {
    finalCircle: fc !== null,
    alive,
    total: snap.Players.length,
    shrinkInSec,
    resourcePct,
    thresholdPct: Math.round(resourcePermille / 10),
    outside,
    localEliminated,
  }
}

/** 计分板副标题：「存活 5/8 · 缩圈 0:08」；决赛圈外返回 null（沿用默认副标题）。 */
export function circleSubtitle(h: CircleHud): string | null {
  if (!h.finalCircle) return null
  const parts = [`存活 ${h.alive}/${h.total}`]
  if (h.shrinkInSec !== null) {
    const s = Math.max(0, Math.ceil(h.shrinkInSec - 1e-9))
    parts.push(`缩圈 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
  }
  return parts.join(' · ')
}
