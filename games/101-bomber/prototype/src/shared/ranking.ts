import type { MatchEndReason, MatchRankRow, MatchResultsView, U64 } from '../contract'

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：结算名次（D2「活到最后者赢」），纯函数、唯一一份实现。
 * 规则层（`sim/results.ts`）、HUD 名次表 / 领奖台、3D 领奖台都用它，不再各排各的。
 */
export interface RankInput {
  id: U64
  eliminated: boolean
  /** 出局 Tick（排序键，只比大小，不特判 ≤ 0）；存活者不看。 */
  eliminatedTick: U64
  hats: number
}

/**
 * - 存活者在前：帽数多者在前，再按 id；名次 = 1 + 帽数比自己多的存活者数（同帽同名次）。
 * - 出局者在后：出局越晚越靠前，再按帽数、id；名次 = 存活数 + 1 + 比自己晚出局的人数（同 Tick 出局同名次）。
 *   全员倒下时最后一批因此并列第 1。
 * - place = 排序后的位置（1..n 唯一）。
 */
export function rankMatch(ps: readonly RankInput[]): MatchRankRow[] {
  const alive = ps.filter((p) => !p.eliminated).sort((a, b) => b.hats - a.hats || a.id - b.id)
  const out = ps.filter((p) => p.eliminated).sort((a, b) => b.eliminatedTick - a.eliminatedTick || b.hats - a.hats || a.id - b.id)
  const rows: MatchRankRow[] = []
  for (const p of alive)
    rows.push({
      id: p.id,
      rank: 1 + alive.filter((q) => q.hats > p.hats).length,
      place: rows.length + 1,
      survived: true,
      hats: p.hats,
      eliminatedTick: 0,
    })
  for (const p of out)
    rows.push({
      id: p.id,
      rank: alive.length + 1 + out.filter((q) => q.eliminatedTick > p.eliminatedTick).length,
      place: rows.length + 1,
      survived: false,
      hats: p.hats,
      eliminatedTick: p.eliminatedTick,
    })
  return rows
}

/** 0 人存活 → 全员倒下；1 人存活且不止一人在局 → 只剩一人；否则时间到。 */
export function matchEndReason(survivors: number, playerCount: number): MatchEndReason {
  if (survivors === 0) return 'allDown'
  if (survivors === 1 && playerCount > 1) return 'lastSurvivor'
  return 'timeUp'
}

export function matchResults(ps: readonly RankInput[]): MatchResultsView {
  const rows = rankMatch(ps)
  const survivors = ps.filter((p) => !p.eliminated).length
  return { reason: matchEndReason(survivors, ps.length), winner: rows[0]?.id ?? 0, rows }
}
