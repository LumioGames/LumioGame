import type { AnimalId, MatchResultsView, PlayerView, U64 } from '../contract'
import { rankInputsOf } from '../present/ranking'
import { matchResults } from '../shared/ranking'

/**
 * Top-10 排名（design §9.3「帽王并列不换王」；第 4 轮 D2：活到最后者赢，存活者永远排在出局者前面）。
 * 名次用竞赛排名（1, 1, 3）；同帽数的显示顺序：现任帽王在前，其余按 NetEntityIdRaw 升序，保证逐帧稳定不跳。
 */
export interface RankRow {
  id: U64
  name: string
  animal: AnimalId
  slot: number
  hats: number
  /** 1 起；并列同名次。 */
  rank: number
  isKing: boolean
  isLocal: boolean
}

/**
 * 实时榜：存活者在前（帽数降序 → 现任帽王在前 → id），出局者在后（出局越晚越前 → id）。
 * 名次：存活者之间按帽数竞赛排名；出局者 = 存活数 + 1 + 比他晚出局的人数（D2「活到最后者赢」，ADR 0031）。
 * 常规阶段没人出局，与第 3 轮的纯帽数榜完全一样。
 * @param tickOf 快照缺 `eliminatedTick` 时的出局 Tick 来源。
 */
export function rankPlayers(players: readonly PlayerView[], kingId: U64, localId: U64, tickOf?: (id: U64) => U64 | undefined): RankRow[] {
  const row = (p: PlayerView): RankRow => ({
    id: p.NetEntityIdRaw,
    name: p.meta.name,
    animal: p.meta.animal,
    slot: p.meta.slot,
    hats: p.BomberPlayerState.HatCount,
    rank: 0,
    isKing: kingId !== 0 && p.NetEntityIdRaw === kingId,
    isLocal: p.NetEntityIdRaw === localId,
  })
  const tick = (p: PlayerView): number => p.eliminatedTick || tickOf?.(p.NetEntityIdRaw) || 0
  const alive = players.filter((p) => !p.eliminated).map(row)
  alive.sort((a, b) => b.hats - a.hats || Number(b.isKing) - Number(a.isKing) || a.id - b.id)
  for (let i = 0; i < alive.length; i++) {
    alive[i].rank = i > 0 && alive[i].hats === alive[i - 1].hats ? alive[i - 1].rank : i + 1
  }
  const out = players.filter((p) => p.eliminated).sort((a, b) => tick(b) - tick(a) || a.NetEntityIdRaw - b.NetEntityIdRaw)
  const outRows = out.map((p) => ({ ...row(p), rank: alive.length + 1 + out.filter((q) => tick(q) > tick(p)).length }))
  return [...alive, ...outRows]
}

/** 取前 `limit` 行；本人不在其中时追加在末尾（design §9.3「Top-5 + 本人」）。 */
export function visibleRows<T extends RankRow>(rows: readonly T[], limit: number): T[] {
  const top = rows.slice(0, limit)
  if (!top.some((r) => r.isLocal)) {
    const me = rows.find((r) => r.isLocal)
    if (me) top.push(me)
  }
  return top
}

/** 「击败了 X% 的玩家」：名次严格低于本人的玩家占其余玩家的比例；并列不算击败。 */
export function percentBeaten(rows: readonly RankRow[], localId: U64): number {
  const me = rows.find((r) => r.id === localId)
  if (!me) return 0
  const others = rows.length - 1
  if (others <= 0) return 100
  const beaten = rows.filter((r) => r.id !== localId && r.rank > me.rank).length
  return Math.round((beaten / others) * 100)
}

/** 局终身份：决赛圈存活 / 决赛圈出局；本局没进决赛圈且没人出局时为 null。 */
export type FinalStatus = 'survivor' | 'eliminated' | null

/** 本局出局记录：PlayerEliminated 的 Rank 与 Tick（或快照兜底：存活数 + 1、快照 Tick）。 */
export interface ElimRecord {
  rank: number
  tick: U64
}

export interface FinalRow extends RankRow {
  status: FinalStatus
  /** 出局时的名次（PlayerEliminated.Rank）；未出局或未知为 null。 */
  elimRank: number | null
  /** 活到了最后（D2）。 */
  survived: boolean
  /** 1..n 唯一站位（领奖台 1–3）。 */
  place: number
  /** 出局 Tick；存活为 0。 */
  eliminatedTick: U64
}

/**
 * 局终排名（D2「活到最后者赢」，ADR 0031）：优先用规则层发布的 `match.results`，缺席时按快照用
 * shared/ranking 排（与规则层 / 3D 领奖台同一份实现）。行序 = place；这里只补名字、动物、帽王等显示信息。
 */
export function rankFinal(
  players: readonly PlayerView[],
  eliminations: ReadonlyMap<U64, ElimRecord>,
  finalCircle: boolean,
  kingId: U64,
  localId: U64,
  results?: MatchResultsView | null,
): FinalRow[] {
  const byId = new Map(players.map((p) => [p.NetEntityIdRaw, p]))
  const r = results ?? matchResults(rankInputsOf(players, (id) => eliminations.get(id)?.tick))
  const rows: FinalRow[] = []
  for (const x of r.rows) {
    const p = byId.get(x.id)
    if (!p) continue
    rows.push({
      id: x.id,
      name: p.meta.name,
      animal: p.meta.animal,
      slot: p.meta.slot,
      hats: x.hats,
      rank: x.rank,
      isKing: kingId !== 0 && x.id === kingId,
      isLocal: x.id === localId,
      status: finalCircle || !x.survived ? (x.survived ? 'survivor' : 'eliminated') : null,
      elimRank: eliminations.get(x.id)?.rank ?? null,
      survived: x.survived,
      place: x.place,
      eliminatedTick: x.eliminatedTick,
    })
  }
  return rows
}
