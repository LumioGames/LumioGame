import { DeathCause, isPowerupKind, type BomberEvent, type PickupKind, type ProtoRules, type RingRect, type SkillId, type U64, type WorldSnapshot } from '../contract'
import { resultsOf } from '../present/ranking'
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火墙的烧伤（嘶的一声 + 受击）。 */
  burn: boolean
  /** 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹的毒发掉血（小毒泡「啵」，不用受击吱声）。 */
  toxin: boolean
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
    const burn = e.proto?.Cause === DeathCause.Burn
    const toxin = e.proto?.Cause === DeathCause.Toxin
    // 毒伤的 SourceBomb 是当初那颗中毒弹（非 0），但它不是这一刻的爆炸：不排连锁节奏。
    const bomb = e.SourceBombNetEntityIdRaw !== 0 && !poison && !burn && !toxin && e.proto?.Cause !== DeathCause.Drown
    let index = 0
    if (bomb && e.ChainId !== 0) {
      const k = perChain.get(e.ChainId) ?? 0
      perChain.set(e.ChainId, k + 1)
      index = hints.get(e.SourceBombNetEntityIdRaw) ?? k
    }
    out.push({ delay: bomb ? chainDelaySec(index) : 0, poison, burn, toxin })
  }
  return out.sort((a, b) => a.delay - b.delay)
}

/** 死亡音相对最后一击的额外延迟（与 view 玩偶散架 +90 ms 同口径），秒。 */
export const DEATH_AFTER_HIT_SEC = 0.09

export function outsideRing(X: number, Y: number, ring: RingRect): boolean {
  return X < ring.Min || X > ring.Max || Y < ring.Min || Y > ring.Max
}

/**
 * 本人是不是冠军（领奖台号角更亮的判定，D2「活到最后者赢」，ADR 0031）：名次 1（并列第 1 也算），
 * 与帽数无关——0 帽的唯一幸存者也是冠军。优先读规则层的 match.results。
 */
export function localIsWinner(snap: WorldSnapshot, localId: U64): boolean {
  return resultsOf(snap).rows.some((r) => r.id === localId && r.rank === 1)
}

/** 是不是强化（吃到就多一顶帽子，ADR 0028）；血包与技能糖都不算（D5）。 */
export function isPowerup(kind: PickupKind): boolean {
  return isPowerupKind(kind)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：本人技能音的快照兜底。数据源从没发过 SkillActivated / SkillEvolved 时，
 * 冷却终点变大 = 刚放了技能，主动槽 / 任一槽新出现组合技 = 刚进化；见过事件（{@link noteEvent}）后恒返回空。
 */
export class SkillCueWatch {
  private lastCd: number | null = null
  private lastCombos = new Set<SkillId>()
  private matchIndex = -1
  private sawEvents = false

  noteEvent(): void {
    this.sawEvents = true
  }

  check(snap: WorldSnapshot, localId: U64, skills: ProtoRules['skills']): { cast: boolean; evolved: SkillId | null } {
    const none = { cast: false, evolved: null }
    const me = snap.Players.find((p) => p.NetEntityIdRaw === localId)
    const sk = me?.skills
    if (snap.match.matchIndex !== this.matchIndex) {
      this.matchIndex = snap.match.matchIndex
      this.lastCd = null
      this.lastCombos = new Set()
    }
    if (!sk) return none
    const combos = new Set<SkillId>()
    for (const v of Object.values(sk.slots)) if (v && skills[v.skill].combo) combos.add(v.skill)
    const wasCd = this.lastCd
    const wasCombos = this.lastCombos
    this.lastCd = sk.cdUntilTick
    this.lastCombos = combos
    if (this.sawEvents || wasCd === null) return none
    let evolved: SkillId | null = null
    for (const c of combos) if (!wasCombos.has(c)) evolved = c
    return { cast: sk.cdUntilTick > wasCd, evolved }
  }
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
