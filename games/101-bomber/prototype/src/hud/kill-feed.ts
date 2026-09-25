import { DeathCause, type PlayerDied, type U64 } from '../contract'

/**
 * Top-10 下方的紧凑击杀栏（design §9.6「帽子与强化的流向可见」的本地可读性辅助，不是全场横幅）：
 * 只留最近 4 条；死者掉了几个强化（= 几顶帽子，ADR 0028）定下来后补上「· B 掉了 N 个强化」；
 * 决赛圈出局的条目追加「出局」标签（PlayerEliminated 在死亡的下一 Tick 到达）。
 */
export type FeedKind = 'kill' | 'self' | 'drown' | 'poison' | 'burn'

export interface FeedEntry {
  key: string
  kind: FeedKind
  killerId: U64
  victimId: U64
  killerName: string
  victimName: string
  /** 死者掉了几个强化；还没定下来为 null（见 hat-loss.ts）。 */
  lost: number | null
  eliminated: boolean
  involvesLocal: boolean
  tick: U64
}

export const FEED_MAX = 4

/** 前半句：「A 炸飞了 B」。 */
export function feedBase(e: FeedEntry): string {
  switch (e.kind) {
    case 'kill':
      return `${e.killerName} 炸飞了 ${e.victimName}`
    case 'self':
      return `${e.victimName} 被自己炸飞了`
    case 'drown':
      return `${e.victimName} 溺水了`
    case 'poison':
      return `${e.victimName} 中毒倒下`
    case 'burn':
      return `${e.victimName} 被烧倒了`
  }
}

/** 后半句：「B 掉了 N 个强化」；没掉 / 还不知道时为空串。 */
export function feedLossText(e: FeedEntry): string {
  if (!e.lost) return ''
  return e.kind === 'kill' ? `${e.victimName} 掉了 ${e.lost} 个强化` : `掉了 ${e.lost} 个强化`
}

/** 整句：「A 炸飞了 B · B 掉了 N 个强化」。 */
export function feedText(e: FeedEntry): string {
  const loss = feedLossText(e)
  return loss ? `${feedBase(e)} · ${loss}` : feedBase(e)
}

export class KillFeed {
  private list: FeedEntry[] = []
  /** 每次内容变化 +1，DOM 侧据此决定要不要重画。 */
  version = 0

  constructor(private readonly localId: U64) {}

  onDied(e: PlayerDied, nameOf: (id: U64) => string): void {
    const victim = e.VictimNetEntityIdRaw
    const killer = e.KillerNetEntityIdRaw
    const kind: FeedKind =
      e.Cause === DeathCause.Drown
        ? 'drown'
        : e.Cause === DeathCause.Poison
          ? 'poison'
          : e.Cause === DeathCause.Burn
            ? 'burn'
            : killer === victim || killer === 0
              ? 'self'
              : 'kill'
    const me = this.localId
    this.list.unshift({
      key: `${e.Tick}:${victim}`,
      kind,
      killerId: killer,
      victimId: victim,
      killerName: killer === me ? '你' : nameOf(killer),
      victimName: victim === me ? '你' : nameOf(victim),
      lost: null,
      eliminated: false,
      involvesLocal: killer === me || victim === me,
      tick: e.Tick,
    })
    if (this.list.length > FEED_MAX) this.list.length = FEED_MAX
    this.version++
  }

  /** 死者掉了几个强化定下来了（tick = PlayerDied 的 Tick）。 */
  setLost(victim: U64, tick: U64, lost: number): void {
    const hit = this.list.find((x) => x.victimId === victim && x.tick === tick)
    if (!hit || hit.lost === lost) return
    hit.lost = lost
    this.version++
  }

  onEliminated(id: U64): void {
    const hit = this.list.find((x) => x.victimId === id && !x.eliminated)
    if (!hit) return
    hit.eliminated = true
    this.version++
  }

  /** 最新在前。 */
  entries(): readonly FeedEntry[] {
    return this.list
  }

  clear(): void {
    if (this.list.length === 0) return
    this.list = []
    this.version++
  }
}
