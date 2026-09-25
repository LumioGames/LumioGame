import { DeathCause, PickupKind, type BomberEvent, type RingRect, type U64, type WorldSnapshot } from '../contract'
import { chainDelaySec } from './mixing'

/**
 * 音效触发的纯判定（无 WebAudio，可单测）。
 */

/**
 * 加冕号角（design §3.1 加冕：光柱 + 横幅 + 音乐层）：与 HUD 横幅、view 光柱同一口径——
 * 帽王换人且新王 ≥ N 顶，或现任帽王的帽数刚跨过 N；每位帽王连续在位期间只响一次。
 * 纯快照判定，不依赖 HatKingChanged（现任帽王从 2 顶涨到 3 顶时不会有该事件）。
 */
export class CrownWatch {
  private announced: U64 = 0
  private matchIndex = -1

  constructor(private readonly minHats: number) {}

  /** @returns 本次该响号角的帽王 id；不该响为 0。 */
  check(snap: WorldSnapshot): U64 {
    if (snap.match.matchIndex !== this.matchIndex) {
      this.matchIndex = snap.match.matchIndex
      this.announced = 0
    }
    const king = snap.BomberMatchState.HatKingNetEntityIdRaw
    if (king !== this.announced) this.announced = 0
    if (king === 0 || king === this.announced) return 0
    const hats = snap.Players.find((p) => p.NetEntityIdRaw === king)?.BomberPlayerState.HatCount ?? 0
    if (hats < this.minHats) return 0
    this.announced = king
    return king
  }
}

export interface LocalHitCue {
  /** 相对本批 t0 的延迟（秒）：与 view 的爆炸节奏一致（链内第 i 颗 40 ms，封顶 320 ms）。 */
  delay: number
  poison: boolean
}

/**
 * 本批里某位受害者受到的每一击 → 受击音的延迟；死亡音跟在最后一击之后。
 * 链内顺序优先用 `BombExploded.proto.IndexInChain`，缺席时按本人受击的到达顺序（与 HUD 同口径）。
 */
export function hitCues(events: readonly BomberEvent[], victimId: U64): LocalHitCue[] {
  const hints = new Map<U64, number>()
  for (const e of events) if (e.type === 'BombExploded' && e.proto) hints.set(e.proto.BombNetEntityIdRaw, e.proto.IndexInChain)
  const perChain = new Map<U64, number>()
  const out: LocalHitCue[] = []
  for (const e of events) {
    if (e.type !== 'DamageApplied' || e.VictimNetEntityIdRaw !== victimId) continue
    const poison = e.proto?.Cause === DeathCause.Poison
    const bomb = e.SourceBombNetEntityIdRaw !== 0 && !poison && e.proto?.Cause !== DeathCause.Drown
    let index = 0
    if (bomb && e.ChainId !== 0) {
      const k = perChain.get(e.ChainId) ?? 0
      perChain.set(e.ChainId, k + 1)
      index = hints.get(e.SourceBombNetEntityIdRaw) ?? k
    }
    out.push({ delay: bomb ? chainDelaySec(index) : 0, poison })
  }
  return out.sort((a, b) => a.delay - b.delay)
}

/** 死亡音相对最后一击的额外延迟（与 view 玩偶散架 +90 ms 同口径），秒。 */
export const DEATH_AFTER_HIT_SEC = 0.09

export function outsideRing(X: number, Y: number, ring: RingRect): boolean {
  return X < ring.Min || X > ring.Max || Y < ring.Min || Y > ring.Max
}

/** 本人是否并列第一（领奖台号角更亮的判定）；没人有帽子时不算。 */
export function localIsWinner(snap: WorldSnapshot, localId: U64): boolean {
  let best = 0
  for (const p of snap.Players) best = Math.max(best, p.BomberPlayerState.HatCount)
  const me = snap.Players.find((p) => p.NetEntityIdRaw === localId)
  return !!me && best > 0 && me.BomberPlayerState.HatCount === best
}

/** 是不是强化（吃到就多一顶帽子，ADR 0028）；血包不算。 */
export function isPowerup(kind: PickupKind): boolean {
  return kind !== PickupKind.HealthPack
}

/**
 * 本人「帽子 +1」音的快照兜底：数据源从没发过 PickupTaken 时，活着时帽数（= 强化数）上涨几顶就「啵」几声；
 * 一旦见过 PickupTaken（{@link noteEvent}），就只认事件，这里恒返回 0。换局时重置基线。
 */
export class HatGainWatch {
  private last: number | null = null
  private matchIndex = -1
  private sawEvents = false

  noteEvent(): void {
    this.sawEvents = true
  }

  /** @returns 本份快照推出的新增帽数（0 = 不用响）。 */
  check(snap: WorldSnapshot, localId: U64): number {
    if (snap.match.matchIndex !== this.matchIndex) {
      this.matchIndex = snap.match.matchIndex
      this.last = null
    }
    const me = snap.Players.find((p) => p.NetEntityIdRaw === localId)
    if (!me) return 0
    const hats = me.BomberPlayerState.HatCount
    const was = this.last
    this.last = hats
    if (this.sawEvents || was === null || hats <= was) return 0
    if (me.玩家属性.血量当前 <= 0 || me.eliminated) return 0
    return hats - was
  }
}
