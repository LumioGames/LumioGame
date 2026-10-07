/**
 * 个人最佳（design §13，ADR 0043，支柱 9）：浏览器本地记住最佳连锁、最多击杀、最好名次、帽王最久；
 * 刷新时结算页显示「新纪录！」。约束 7：没有账号持久化——正式版要账号级存储后再迁移（risks A5）。
 * 读写一律容错：存储读不到 / 写不进（隐私模式、配额、SecurityError）时退回本会话内存，照常返回可显示的结果。
 * 只存本机、不影响规则。原型扩展（NON-CONTRACT）。
 */

export type PersonalBestKey = 'bestChain' | 'mostKills' | 'bestRank' | 'longestKingSec'

export interface PersonalBest {
  /** 最佳连锁（颗数；单颗不算连锁）。 */
  bestChain: number
  mostKills: number
  /** 最好名次（越小越好）；没有记录为 null。 */
  bestRank: number | null
  /** 帽王最久（秒，保留 1 位小数）。 */
  longestKingSec: number
}

/** 一局的成绩（本人）。 */
export interface MatchBest {
  bestChain: number
  kills: number
  rank: number
  kingSec: number
}

export interface PersonalBestResult {
  /** 记下本局之后的个人最佳。 */
  best: PersonalBest
  /** 本局之前的个人最佳。 */
  previous: PersonalBest
  /** 本局刷新了哪几项（按 bestChain / mostKills / bestRank / longestKingSec 顺序）。 */
  newRecords: PersonalBestKey[]
}

/** localStorage 的最小接口（可注入，便于测试与容错）。 */
export interface BestStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const PERSONAL_BEST_KEY = 'lumio-101-bomber-best'

export const EMPTY_BEST: Readonly<PersonalBest> = Object.freeze({ bestChain: 0, mostKills: 0, bestRank: null, longestKingSec: 0 })

/** 浏览器的 localStorage；访问本身抛异常（SecurityError）或不存在时为 null。 */
export function defaultBestStorage(): BestStorage | null {
  try {
    return (globalThis as { localStorage?: BestStorage }).localStorage ?? null
  } catch {
    return null
  }
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** 存储里的 JSON → PersonalBest；坏字段按空处理。 */
function parseBest(raw: string | null): PersonalBest {
  if (!raw) return { ...EMPTY_BEST }
  let o: Record<string, unknown>
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object') return { ...EMPTY_BEST }
    o = v as Record<string, unknown>
  } catch {
    return { ...EMPTY_BEST }
  }
  const rank = count(o.bestRank)
  return {
    bestChain: Math.floor(count(o.bestChain)),
    mostKills: Math.floor(count(o.mostKills)),
    bestRank: rank >= 1 ? Math.floor(rank) : null,
    longestKingSec: count(o.longestKingSec),
  }
}

/** 纯比较：本局哪几项严格优于旧纪录（0 与单颗炸弹不算纪录；名次越小越好）。 */
export function compareBest(prev: PersonalBest, m: MatchBest): { best: PersonalBest; newRecords: PersonalBestKey[] } {
  const best: PersonalBest = { ...prev }
  const newRecords: PersonalBestKey[] = []
  const chain = m.bestChain >= 2 ? m.bestChain : 0
  if (chain > prev.bestChain) {
    best.bestChain = chain
    newRecords.push('bestChain')
  }
  if (m.kills > prev.mostKills) {
    best.mostKills = m.kills
    newRecords.push('mostKills')
  }
  if (m.rank >= 1 && (prev.bestRank === null || m.rank < prev.bestRank)) {
    best.bestRank = m.rank
    newRecords.push('bestRank')
  }
  // 向下取到 0.1 秒：与结算页「N 秒」（向下取整）同一口径，不会出现「10 秒」却记成「11 秒」。
  const king = Math.floor(Math.max(0, m.kingSec) * 10 + 1e-9) / 10
  if (king > prev.longestKingSec + 1e-9) {
    best.longestKingSec = king
    newRecords.push('longestKingSec')
  }
  return { best, newRecords }
}

export class PersonalBestStore {
  /** 本会话内存副本：存储不可用时照样能跟上一局比。 */
  private memory: PersonalBest | null = null

  constructor(private readonly storage: BestStorage | null = defaultBestStorage()) {}

  load(): PersonalBest {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(PERSONAL_BEST_KEY)
        if (raw !== null || !this.memory) return parseBest(raw)
      } catch {
        // 读不到：退回内存。
      }
    }
    return this.memory ? { ...this.memory } : { ...EMPTY_BEST }
  }

  /** 记下一局；无论存储是否可用都返回可显示的结果。 */
  record(m: MatchBest): PersonalBestResult {
    const previous = this.load()
    const { best, newRecords } = compareBest(previous, m)
    this.memory = { ...best }
    if (this.storage) {
      try {
        this.storage.setItem(PERSONAL_BEST_KEY, JSON.stringify(best))
      } catch {
        // 写不进（隐私模式 / 配额）：只留本会话内存。
      }
    }
    return { best, previous, newRecords }
  }
}
