import type { U64, WorldSnapshot } from '../contract'

/**
 * 死亡掉了几个强化（= 掉了几顶帽子，ADR 0028）的判定，三种来源按先到先用：
 * 1. `PlayerDied.proto.HatsLost`（原型扩展，死亡当 Tick 就知道）；
 * 2. `PowerupsDropped.Kinds.length`（表现事件，死亡的下一 Tick）；
 * 3. 快照 diff：死者的 `HatCount` 比死前那份快照少了几顶（契约口径，引擎 Replica 只有这个）。
 * 死后 {@link LOSS_RESOLVE_TICKS} 个 Tick 帽数都没变，就当没掉（0）。
 * 结果只给 HUD 文案用（本人弹字、倒台横幅、击杀栏），不参与任何规则。
 */

export interface ResolvedLoss {
  victim: U64
  /** PlayerDied 的 Tick（击杀栏按它找条目）。 */
  tick: U64
  lost: number
}

/** 规则层死亡结算晚一 Tick（契约 §2.2）；多给一点余量。 */
export const LOSS_RESOLVE_TICKS = 3

interface Pending {
  tick: U64
  before: number
}

export class HatLossResolver {
  private readonly pending = new Map<U64, Pending>()

  /**
   * @param known `proto.HatsLost`（没有就 undefined）
   * @param hatsBefore 死前最后一份快照里的帽数
   * @returns 已能定下来就返回结果，否则 null（等后续事件 / 快照）
   */
  onDied(victim: U64, tick: U64, known: number | undefined, hatsBefore: number): ResolvedLoss | null {
    if (known !== undefined) {
      this.pending.delete(victim)
      return { victim, tick, lost: Math.max(0, known) }
    }
    this.pending.set(victim, { tick, before: Math.max(0, hatsBefore) })
    return null
  }

  /** PowerupsDropped：还没定下来的死亡用它的件数。 */
  onDropped(victim: U64, count: number): ResolvedLoss | null {
    const p = this.pending.get(victim)
    if (!p) return null
    this.pending.delete(victim)
    return { victim, tick: p.tick, lost: Math.max(0, count) }
  }

  /** 快照：帽数比死前少了就定下来；超时没变当 0；人不在快照里了也当 0。 */
  onSnapshot(snap: WorldSnapshot): ResolvedLoss[] {
    const out: ResolvedLoss[] = []
    if (this.pending.size === 0) return out
    for (const [victim, p] of this.pending) {
      if (snap.Tick < p.tick) continue
      const pl = snap.Players.find((q) => q.NetEntityIdRaw === victim)
      const now = pl ? pl.BomberPlayerState.HatCount : null
      if (now !== null && now < p.before) out.push({ victim, tick: p.tick, lost: p.before - now })
      else if (now === null || snap.Tick >= p.tick + LOSS_RESOLVE_TICKS) out.push({ victim, tick: p.tick, lost: 0 })
      else continue
      this.pending.delete(victim)
    }
    return out
  }

  isPending(victim: U64): boolean {
    return this.pending.has(victim)
  }

  clear(): void {
    this.pending.clear()
  }
}
