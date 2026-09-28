import type { U64 } from '../contract'

/**
 * 局末高光卡的纯逻辑分配（design §13「本人高光卡」，ADR 0043，支柱 9「人人有高光」）。
 * 每人恰好一张、来自 8 类候选、按各人相对全场最突出的一项分配、同局尽量不重复、不影响名次。
 *
 * 算法（原型取值，推断待验证）：
 * 1. 每类的「突出度」= 本人数值 / 全场该类最大值（0..1）；数值为 0 的不算这一类的高光（单颗炸弹不算连锁）。
 * 2. 分轮配卡：每一轮里每类最多再发一张，在还没拿到卡、且有非零项的人之间求「突出度总和最大」的一一对应
 *    （人数 ≤ 16、类别 ≤ 8，按类别位掩码做精确 DP）；一轮发不完的人进下一轮（这时才出现重复）。
 * 3. 所有项都是 0 的人最后拿「已发得最少」的一类，保证覆盖率 100%。
 * 数据缺席（整局没有任何人带该字段，如 Boss 猎人 / 金心收藏家在规则层接线之前）的类别不参与分配。
 * 同分时按输入顺序（调用方传名次顺序）与类别顺序决定，结果确定。
 */

export type HighlightKind = 'longestChain' | 'mostKills' | 'hatKing' | 'demolition' | 'bossHunter' | 'clutch' | 'goldHearts' | 'porter'

/** 8 类候选（design §13 顺序）。 */
export const HIGHLIGHT_KINDS: readonly HighlightKind[] = ['longestChain', 'mostKills', 'hatKing', 'demolition', 'bossHunter', 'clutch', 'goldHearts', 'porter']

export const HIGHLIGHT_TITLE: Readonly<Record<HighlightKind, string>> = {
  longestChain: '最长连锁',
  mostKills: '最多击杀',
  hatKing: '帽王最久',
  demolition: '拆迁王',
  bossHunter: 'Boss 猎人',
  clutch: '绝境逃生',
  goldHearts: '金心收藏家',
  porter: '搬运工',
}

/** 一位玩家本局的高光统计（表现层从事件 + 快照推出）。 */
export interface HighlightStats {
  id: U64
  /** 本人有炸弹参与的链里最多的炸弹颗数。 */
  bestChain: number
  kills: number
  /** 当帽王的累计 Tick。 */
  hatKingTicks: number
  /** 炸掉的方块数。 */
  bricks: number
  /** 1 心逃生次数（1 心时回到 1 心以上，或 1 心活到局终）。 */
  clutch: number
  /** 拾取数。 */
  pickups: number
  /** 击倒 Boss（心数上限 ≥ 6）的次数；缺席 = 数据源没有心数上限，本类不参与分配。 */
  bossKills?: number
  /** 捡到的金心数；缺席 = 数据源没有金心，本类不参与分配。 */
  goldHearts?: number
}

export interface HighlightCard {
  id: U64
  kind: HighlightKind
  title: string
  /** 该类的原始数值（帽王为 Tick）。 */
  value: number
  /** 「×7 连锁」「击飞 4 人」… */
  detail: string
  /** 全场该类第一（含并列）。 */
  leader: boolean
}

function valueOf(p: HighlightStats, k: HighlightKind): number {
  switch (k) {
    case 'longestChain':
      return p.bestChain >= 2 ? p.bestChain : 0
    case 'mostKills':
      return p.kills
    case 'hatKing':
      return p.hatKingTicks
    case 'demolition':
      return p.bricks
    case 'bossHunter':
      return p.bossKills ?? 0
    case 'clutch':
      return p.clutch
    case 'goldHearts':
      return p.goldHearts ?? 0
    case 'porter':
      return p.pickups
  }
}

/** 秒 → 「42 秒」/「1 分 05 秒」（与结算页帽王时长同一写法）。 */
function durationText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒`
}

function detailOf(k: HighlightKind, v: number, tickRateHz: number): string {
  switch (k) {
    case 'longestChain':
      return `×${v} 连锁`
    case 'mostKills':
      return `击飞 ${v} 人`
    case 'hatKing':
      return `当帽王 ${durationText(v / tickRateHz)}`
    case 'demolition':
      return `拆掉 ${v} 块积木`
    case 'bossHunter':
      return `击倒 ${v} 个 Boss`
    case 'clutch':
      return `1 心逃生 ${v} 次`
    case 'goldHearts':
      return `收集 ${v} 颗金心`
    case 'porter':
      return `拾取 ${v} 个`
  }
}

const EPS = 1e-9

/**
 * 一轮配卡：在 players（下标）之间给 kinds（下标）求突出度总和最大的一一对应，每类至多一人。
 * 返回 player 下标 → kind 下标（没配上的不在里面）。
 */
function matchRound(players: readonly number[], kindCount: number, score: (p: number, k: number) => number): Map<number, number> {
  const full = 1 << kindCount
  const n = players.length
  // best[i][mask]：第 i..n-1 位玩家、已用类别为 mask 时还能拿到的最大总突出度。
  const best: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(full))
  for (let i = n - 1; i >= 0; i--) {
    const p = players[i]
    for (let mask = 0; mask < full; mask++) {
      let v = best[i + 1][mask]
      for (let k = 0; k < kindCount; k++) {
        if (mask & (1 << k)) continue
        const s = score(p, k)
        if (s <= 0) continue
        const t = s + best[i + 1][mask | (1 << k)]
        if (t > v + EPS) v = t
      }
      best[i][mask] = v
    }
  }
  const out = new Map<number, number>()
  let mask = 0
  for (let i = 0; i < n; i++) {
    const p = players[i]
    const target = best[i][mask]
    let chosen = -1
    for (let k = 0; k < kindCount; k++) {
      if (mask & (1 << k)) continue
      const s = score(p, k)
      if (s <= 0) continue
      if (Math.abs(s + best[i + 1][mask | (1 << k)] - target) <= EPS) {
        chosen = k
        break
      }
    }
    if (chosen >= 0) {
      out.set(p, chosen)
      mask |= 1 << chosen
    }
  }
  return out
}

/**
 * 给本局每位玩家分一张高光卡。`players` 按名次顺序传入（同分时靠前者优先）；返回与输入同序。
 */
export function assignHighlights(players: readonly HighlightStats[], tickRateHz: number): HighlightCard[] {
  const kinds = HIGHLIGHT_KINDS.filter(
    (k) => (k !== 'bossHunter' || players.some((p) => p.bossKills !== undefined)) && (k !== 'goldHearts' || players.some((p) => p.goldHearts !== undefined)),
  )
  const K = kinds.length
  const vals = players.map((p) => kinds.map((k) => valueOf(p, k)))
  const max = kinds.map((_, k) => Math.max(0, ...vals.map((row) => row[k])))
  const score = (p: number, k: number): number => (max[k] > 0 && vals[p][k] > 0 ? vals[p][k] / max[k] : 0)

  const assigned = new Map<number, number>()
  const used = new Array<number>(K).fill(0)
  for (;;) {
    const waiting = players.map((_, i) => i).filter((i) => !assigned.has(i) && kinds.some((_, k) => score(i, k) > 0))
    if (waiting.length === 0) break
    const round = matchRound(waiting, K, score)
    if (round.size === 0) break
    for (const [p, k] of round) {
      assigned.set(p, k)
      used[k]++
    }
  }
  // 全零的人：拿已发得最少的一类（同数按类别顺序）。
  players.forEach((_, i) => {
    if (assigned.has(i)) return
    let k = 0
    for (let j = 1; j < K; j++) if (used[j] < used[k]) k = j
    assigned.set(i, k)
    used[k]++
  })

  return players.map((p, i) => {
    const k = assigned.get(i) ?? 0
    const kind = kinds[k]
    const value = vals[i][k]
    return { id: p.id, kind, title: HIGHLIGHT_TITLE[kind], value, detail: detailOf(kind, value, tickRateHz), leader: value > 0 && value === max[k] }
  })
}
