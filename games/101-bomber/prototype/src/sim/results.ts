import type { MatchResultsView } from '../contract'
import { matchResults, type RankInput } from '../shared/ranking'
import { hatCountOf } from './death-drops'
import type { World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：World → 名次输入 / 一局结果的唯一映射（快照与 enterSettlement 共用）。
 * 全部由已哈希的状态派生（eliminated、eliminatedTick、强化级数、本局退出者 w.departed），自身不进哈希。
 * 决赛圈 / 结算期中途退出的玩家照样有一行（design §4.2「掉线在决赛圈内等于出局」）。
 */
export function rankInputsOf(w: World): RankInput[] {
  const present = w.players.map((p) => ({ id: p.id, eliminated: p.eliminated, eliminatedTick: p.eliminatedTick, hats: hatCountOf(w, p) }))
  const index = w.match.index
  const gone = (w.departed ?? [])
    .filter((d) => d.match === index)
    .map((d) => ({ id: d.id, eliminated: d.eliminated, eliminatedTick: d.eliminatedTick, hats: d.hats }))
  return [...present, ...gone]
}

export function simMatchResults(w: World): MatchResultsView {
  return matchResults(rankInputsOf(w))
}
