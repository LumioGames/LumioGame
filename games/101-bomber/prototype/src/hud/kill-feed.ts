import { DeathCause, type PlayerDied, type U64 } from '../contract'

/**
 * Top-10 下方的紧凑击杀栏（design §9.6「帽子与强化的流向可见」的本地可读性辅助，不是全场横幅）：
 * 只留最近 4 条；死者掉了几个强化（= 几顶帽子，ADR 0028）定下来后补上「· B 掉了 N 个强化」；
 * 决赛圈出局的条目追加「出局」标签（PlayerEliminated 在死亡的下一 Tick 到达）。
 */
/** 'toxin' = 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹毒倒（击杀者 = 投弹者）。 */
export type FeedKind = 'kill' | 'self' | 'drown' | 'poison' | 'burn' | 'toxin'

export interface FeedEntry {
  key: string
  kind: FeedKind
  killerId: U64
  victimId: U64
  killerName: string
  victimName: string
  /** 死者掉了几个强化；还没定下来为 null（见 hat-loss.ts）。 */
  lost: number | null
  /** 原型扩展（NON-CONTRACT，ADR 0033）：炸死时那颗特殊炸弹的名字（「中毒弹」/「麻痹弹」…）；标准弹 / 查不到为 null。 */
  bombName: string | null
  eliminated: boolean
  involvesLocal: boolean
  tick: U64
}

export const FEED_MAX = 4

/** 前半句：「A 炸飞了 B」。 */
export function feedBase(e: FeedEntry): string {
  switch (e.kind) {
    case 'kill':
      return e.bombName ? `${e.killerName} 用${e.bombName}炸飞了 ${e.victimName}` : `${e.killerName} 炸飞了 ${e.victimName}`
    case 'self':
      return e.bombName ? `${e.victimName} 被自己的${e.bombName}炸飞了` : `${e.victimName} 被自己炸飞了`
    case 'drown':
      return `${e.victimName} 溺水了`
    case 'poison':
      return `${e.victimName} 中毒倒下`
    case 'burn':
      // 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火墙烧倒的有主人，读成击杀。
      return burnHasKiller(e) ? `${e.killerName} 烧倒了 ${e.victimName}` : `${e.victimName} 被烧倒了`
    case 'toxin':
      // 原型扩展（NON-CONTRACT，ADR 0033）：「A 用中毒弹毒倒了 B」/「B 被自己的中毒弹毒倒了」。
      if (feedHasKiller(e)) return `${e.killerName} 用中毒弹毒倒了 ${e.victimName}`
      return e.killerId === e.victimId ? `${e.victimName} 被自己的中毒弹毒倒了` : `${e.victimName} 被中毒弹毒倒了`
  }
}

/** 烧倒的有别人当主人（火焰熊的光环 / 火墙）。 */
export function burnHasKiller(e: FeedEntry): boolean {
  return e.kind === 'burn' && e.killerId !== 0 && e.killerId !== e.victimId
}

/** 这条读成「A 对 B」：炸飞别人、有别人当主人的烧倒 / 毒倒（ADR 0030 / 0033）。 */
export function feedHasKiller(e: FeedEntry): boolean {
  return e.kind === 'kill' || ((e.kind === 'burn' || e.kind === 'toxin') && e.killerId !== 0 && e.killerId !== e.victimId)
}

/** 这条的色点跟谁：击杀（含有主人的烧倒 / 毒倒）跟击杀者，其余跟死者。 */
export function feedColorId(e: FeedEntry): U64 {
  return feedHasKiller(e) ? e.killerId : e.victimId
}

/** 后半句：「B 掉了 N 个强化」；没掉 / 还不知道时为空串。 */
export function feedLossText(e: FeedEntry): string {
  if (!e.lost) return ''
  return feedHasKiller(e) ? `${e.victimName} 掉了 ${e.lost} 个强化` : `掉了 ${e.lost} 个强化`
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

  /** @param bombName 炸死（Cause = Bomb）时那颗特殊炸弹的名字（ADR 0033）；缺省 / null = 不写弹种。 */
  onDied(e: PlayerDied, nameOf: (id: U64) => string, bombName: string | null = null): void {
    const victim = e.VictimNetEntityIdRaw
    const killer = e.KillerNetEntityIdRaw
    const kind: FeedKind =
      e.Cause === DeathCause.Drown
        ? 'drown'
        : e.Cause === DeathCause.Poison
          ? 'poison'
          : e.Cause === DeathCause.Burn
            ? 'burn'
            : e.Cause === DeathCause.Toxin
              ? 'toxin'
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
      bombName: kind === 'kill' || kind === 'self' ? bombName : null,
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
