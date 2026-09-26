import type { MatchResultsView, PlayerView, U64, WorldSnapshot } from '../contract'
import { matchResults, type RankInput } from '../shared/ranking'

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：快照 → 名次（D2「活到最后者赢」）的表现层适配。
 * 规则替身在 Settlement 发布 `match.results`，表现层**优先读它**；缺席（引擎 Replica / 旧数据源）时
 * 按快照自己排（shared/ranking.matchResults，与规则层同一份实现），出局 Tick 缺席时由调用方的记录补上。
 */

/** @param tickOf `eliminatedTick` 缺席时的出局 Tick 来源（HUD 记下的 PlayerEliminated.Tick 等）。 */
export function rankInputsOf(players: readonly PlayerView[], tickOf?: (id: U64) => U64 | undefined): RankInput[] {
  return players.map((p) => ({
    id: p.NetEntityIdRaw,
    eliminated: p.eliminated,
    eliminatedTick: p.eliminatedTick || tickOf?.(p.NetEntityIdRaw) || 0,
    hats: p.BomberPlayerState.HatCount,
  }))
}

export function resultsOf(snap: WorldSnapshot, tickOf?: (id: U64) => U64 | undefined): MatchResultsView {
  return snap.match.results ?? matchResults(rankInputsOf(snap.Players, tickOf))
}
