import type { AnimalId, PlayerView, U64 } from '../contract'

/**
 * Top-10 排名（design §4「帽数并列即并列同胜」、§9.3「帽王并列不换王」）。
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

export function rankPlayers(players: readonly PlayerView[], kingId: U64, localId: U64): RankRow[] {
  const rows: RankRow[] = players.map((p) => ({
    id: p.NetEntityIdRaw,
    name: p.meta.name,
    animal: p.meta.animal,
    slot: p.meta.slot,
    hats: p.BomberPlayerState.HatCount,
    rank: 0,
    isKing: kingId !== 0 && p.NetEntityIdRaw === kingId,
    isLocal: p.NetEntityIdRaw === localId,
  }))
  rows.sort((a, b) => b.hats - a.hats || Number(b.isKing) - Number(a.isKing) || a.id - b.id)
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i > 0 && rows[i].hats === rows[i - 1].hats ? rows[i - 1].rank : i + 1
  }
  return rows
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

/** 「击败了 X% 的玩家」：帽数严格少于本人的玩家占其余玩家的比例；并列不算击败。 */
export function percentBeaten(rows: readonly RankRow[], localId: U64): number {
  const me = rows.find((r) => r.id === localId)
  if (!me) return 0
  const others = rows.length - 1
  if (others <= 0) return 100
  const beaten = rows.filter((r) => r.id !== localId && r.hats < me.hats).length
  return Math.round((beaten / others) * 100)
}

/** 局终身份：决赛圈存活 / 决赛圈出局；本局没进决赛圈时为 null。 */
export type FinalStatus = 'survivor' | 'eliminated' | null

export interface FinalRow extends RankRow {
  status: FinalStatus
  /** PlayerEliminated.Rank（出局时的名次，越小 = 出局越晚）；未出局或未知为 null。 */
  elimRank: number | null
}

const STATUS_ORDER: Readonly<Record<'survivor' | 'eliminated' | 'none', number>> = { survivor: 0, none: 1, eliminated: 2 }

/**
 * 局终排名（design §4 平局 / §13）：帽数降序；帽数相同时决赛圈存活者在前、出局越晚越靠前（Rank 越小），
 * 只有帽数与存活情况（及出局名次）都相同才并列同名次（1, 1, 3）；展示顺序最后按 id 升序。
 * view 的领奖台有一份同口径的副本（hud 与 view 互不 import），改口径时两边一起改。
 */
export function rankFinal(
  players: readonly PlayerView[],
  eliminations: ReadonlyMap<U64, number>,
  finalCircle: boolean,
  kingId: U64,
  localId: U64,
): FinalRow[] {
  const rows: FinalRow[] = players.map((p) => {
    const out = p.eliminated || eliminations.has(p.NetEntityIdRaw)
    return {
      id: p.NetEntityIdRaw,
      name: p.meta.name,
      animal: p.meta.animal,
      slot: p.meta.slot,
      hats: p.BomberPlayerState.HatCount,
      rank: 0,
      isKing: kingId !== 0 && p.NetEntityIdRaw === kingId,
      isLocal: p.NetEntityIdRaw === localId,
      status: finalCircle || out ? (out ? 'eliminated' : 'survivor') : null,
      elimRank: eliminations.get(p.NetEntityIdRaw) ?? null,
    }
  })
  const order = (r: FinalRow): number => STATUS_ORDER[r.status ?? 'none']
  rows.sort(
    (a, b) =>
      b.hats - a.hats ||
      order(a) - order(b) ||
      (a.elimRank ?? Number.POSITIVE_INFINITY) - (b.elimRank ?? Number.POSITIVE_INFINITY) ||
      a.id - b.id,
  )
  const tie = (a: FinalRow, b: FinalRow): boolean =>
    a.hats === b.hats && order(a) === order(b) && (a.elimRank ?? -1) === (b.elimRank ?? -1)
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i > 0 && tie(rows[i], rows[i - 1]) ? rows[i - 1].rank : i + 1
  }
  return rows
}
