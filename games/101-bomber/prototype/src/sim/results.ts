import type { MatchResultsView } from '../contract'
import { matchResults, type RankInput } from '../shared/ranking'
import { hatCountOf } from './death-drops'
import type { World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：World → 名次输入 / 一局结果的唯一映射（快照与 enterSettlement 共用）。
 * 全部由已哈希的状态派生（eliminated、eliminatedTick、强化级数），自身不进哈希。
 */
export function rankInputsOf(w: World): RankInput[] {
  return w.players.map((p) => ({ id: p.id, eliminated: p.eliminated, eliminatedTick: p.eliminatedTick, hats: hatCountOf(w, p) }))
}

export function simMatchResults(w: World): MatchResultsView {
  return matchResults(rankInputsOf(w))
}
