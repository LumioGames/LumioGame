import {
  BombKind,
  DeathCause,
  MatchPhase,
  PickupKind,
  type AnimalId,
  type PlayerView,
  type U64,
  type WorldSnapshot,
} from '../contract'
import { ChainLedger } from './chain-ledger'
import { heartDelta, lossPopupText } from './format'
import { HatLossResolver, type ResolvedLoss } from './hat-loss'
import { DEATH_AFTER_LAST_HIT_MS, hitHintText, lastHitDelayMs, staggerLocalHits, type StaggeredHit } from './hit-stagger'
import { KillFeed } from './kill-feed'
import { percentBeaten, rankFinal, type FinalRow } from './ranking'
import { StatsTracker, type MatchStats } from './stats-tracker'
import type { TickBatch } from './timeline'
import { TIP_HATS_GOAL, TipId } from './tips'

/**
 * HUD 规则引擎：吃 `TickBatch`，吐「该演什么」（横幅 / 弹字 / 回顾卡 / 提示完成 / 结算），不碰 DOM。
 * 口径：design §3.1 爽感时刻（全场横幅只播加冕、倒台；其余弹字只对本人）、§9.6 死亡可解释、§13 结算。
 * 帽子 = 身上的强化数（ADR 0028）：「+1 帽」跟着本人吃强化走（PickupTaken，缺席时退回快照帽数差），
 * 「掉了 N 个强化」按 proto.HatsLost → PowerupsDropped → 快照帽数差 先到先用（hat-loss.ts）。
 */

export type PopupTone = 'chain' | 'kill' | 'demolish' | 'harvest' | 'comeback' | 'hat' | 'hatloss'

export interface RecapSource {
  /** 「灰灰猫的炸弹」/「你自己的炸弹」/「溺水」。 */
  label: string
  /** 「−1 心 · ×3 连锁」。 */
  detail: string
  animal: AnimalId | null
  slot: number | null
}

export interface DeathRecap {
  cause: 'bomb' | 'self' | 'drown' | 'burn' | 'poison'
  headline: string
  killerName: string | null
  killerAnimal: AnimalId | null
  killerSlot: number | null
  bombOwnerName: string | null
  bombKindName: string | null
  chainLength: number
  /** 最近在前，最多两条（design §9.6「最后两个伤害来源」）。 */
  sources: RecapSource[]
  /** 掉了几个强化（= 几顶帽子）；还没定下来为 null（定下来后经 `hats-lost` 时刻补上）。 */
  hatsLost: number | null
  /** 「火力 ×1、速度 ×2」；PowerupsDropped 到达前为 null（到达后经 `drops` 时刻补上）。 */
  drops: string | null
  /** 决赛圈内死亡 = 出局，不再复活（design §4.2）。 */
  final: boolean
  tick: U64
}

export interface SettlementResults {
  matchIndex: number
  /** 局终排名（`rankFinal`：并列时存活优先 → 出局越晚越前 → id）。 */
  rows: FinalRow[]
  /** 本局是否进入过决赛圈（结算表才标 ★ 存活 / 出局）。 */
  finalCircle: boolean
  /** MatchEnded 的 Tick（领奖台从这里起算 podiumMs）；缺事件时取进入结算的第一份快照。 */
  endTick: U64
  localRank: number
  percentBeaten: number
  playerCount: number
  stats: MatchStats
}

export type HudMoment =
  | { kind: 'banner'; tone: BannerTone; title: string; sub: string; mine: boolean }
  | { kind: 'popup'; key: string; tone: PopupTone; text: string; tier: number }
  | { kind: 'tip'; id: TipId }
  | { kind: 'notice'; text: string }
  | { kind: 'pickup'; pickupKind: PickupKind; text: string }
  | { kind: 'hits'; hits: StaggeredHit[]; hpBefore: number; hint: string | null }
  | { kind: 'death'; recap: DeathRecap; delayMs: number }
  | { kind: 'drops'; text: string }
  | { kind: 'hats-lost'; count: number }
  | { kind: 'eliminated'; rank: number; total: number }
  | { kind: 'respawned' }
  | { kind: 'match-reset'; matchIndex: number }
  | { kind: 'settlement'; results: SettlementResults }

export type BannerTone = 'crown' | 'fall' | 'final'

export interface HudBrainOptions {
  localId: U64
  /** design §9.3 光柱阈值 N：横幅也只为 ≥ N 顶的帽王播。 */
  pillarMinHats: number
  tickRateHz: number
  pointsPerHeart: number
}

/** 多杀文案（design §3.1）。 */
export function multiKillLabel(kills: number): string | null {
  if (kills >= 4) return '一锅端'
  if (kills === 3) return '三杀'
  if (kills === 2) return '双杀'
  return null
}

const BOMB_KIND_NAME: Readonly<Record<BombKind, string>> = {
  [BombKind.Standard]: '普通炸弹',
  [BombKind.Freeze]: '冰冻炸弹',
  [BombKind.Fire]: '火焰炸弹',
  [BombKind.Pierce]: '穿透炸弹',
  [BombKind.Split]: '分裂炸弹',
}

const PICKUP_TEXT: Readonly<Record<PickupKind, string>> = {
  [PickupKind.FirePlus]: '+1 火力',
  [PickupKind.BombPlus]: '+1 炸弹',
  [PickupKind.SpeedPlus]: '+1 速度',
  [PickupKind.HealthPack]: '+1 心',
}

const DROP_NAME: Readonly<Record<PickupKind, string>> = {
  [PickupKind.FirePlus]: '火力',
  [PickupKind.BombPlus]: '炸弹',
  [PickupKind.SpeedPlus]: '速度',
  [PickupKind.HealthPack]: '血包',
}

/** 死亡回顾的掉落行：「火力 ×1、速度 ×2」（按火力 / 炸弹 / 速度排序）；空列表为「无」。 */
export function dropsText(kinds: readonly PickupKind[]): string {
  const counts = new Map<PickupKind, number>()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  const parts = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${DROP_NAME[k] ?? '强化'} ×${n}`)
  return parts.length ? parts.join('、') : '无'
}

/** 决赛圈开场横幅文案（design §4.2 表现行）。 */
export const FINAL_CIRCLE_BANNER = { title: '决赛圈！', sub: '不能复活 · 圈外有毒' } as const

/** 「×N 连锁」弹字的最小颗数（design §3.1）。 */
export const CHAIN_POPUP_MIN = 3
/** 「拆迁」最小方块数（design §3.1）。 */
export const DEMOLISH_MIN = 12
/** 「收割」最小强化数与连拾间隔（design §3.1「一次连续捡起 ≥ 5 顶帽」= 连吃 5 个强化；间隔为原型取值）。 */
export const HARVEST_MIN = 5
export const HARVEST_GAP_MS = 1500
/** 「逆袭」：击杀帽王后多久内成为帽王才算（原型取值）。 */
export const COMEBACK_WINDOW_MS = 3000

interface DamageRecord {
  owner: U64
  chainId: U64
  bomb: U64
  points: number
  /** 非炸弹伤害：溺水 / 毒圈 / 燃烧；炸弹伤害为 null。 */
  env: 'drown' | 'poison' | 'burn' | null
  tick: U64
}

function findPlayer(snap: WorldSnapshot | null, id: U64): PlayerView | undefined {
  return snap?.Players.find((p) => p.NetEntityIdRaw === id)
}

export class HudBrain {
  readonly ledger = new ChainLedger()
  readonly stats: StatsTracker
  private matchIndex: number | null = null
  private announcedKing: U64 = 0
  private settled = false
  private readonly killsByChain = new Map<U64, number>()
  private readonly popupShown = new Map<string, string>()
  private damage: DamageRecord[] = []
  private comebackUntil = -1
  private harvestStart = -1
  private harvestLast = -1
  private harvestSum = 0
  /** 本人最近已知血量（快照或伤害单更新），用来在没有 proto.Points 时算每单扣了几点。 */
  private localHp: number | null = null
  private readonly meta = new Map<U64, { name: string; animal: AnimalId; slot: number }>()
  /** 本局出局名单：id → PlayerEliminated.Rank。 */
  private readonly eliminations = new Map<U64, number>()
  private finalCircle = false
  private matchEndedTick: U64 | null = null
  private readonly losses = new HatLossResolver()
  /** 倒台横幅等「掉了几个」定下来再播：死时是帽王（≥ N 顶）的死者。 */
  private readonly pendingFalls = new Set<U64>()
  /** 本会话见过 PickupTaken 之后「+1 帽」只认事件；之前退回快照帽数差。 */
  private sawPickupEvents = false
  /** 本人上一份快照里的帽数（快照推「+1 帽」与第 3 条提示用）。 */
  private myHats: number | null = null
  private gainSeq = 0
  readonly killFeed: KillFeed

  constructor(private readonly opts: HudBrainOptions) {
    this.stats = new StatsTracker(opts.localId)
    this.killFeed = new KillFeed(opts.localId)
  }

  consume(batch: TickBatch): HudMoment[] {
    const out: HudMoment[] = []
    const me = this.opts.localId
    this.learnNames(batch.before)
    this.learnNames(batch.snapshot)
    this.checkMatchReset(batch, out)

    // ---- 1. 链账本（事件先于地形推导，保证有 BrickDestroyed 时推导被丢弃） ----
    const chainTouched = new Set<U64>()
    const brickChains = new Set<U64>()
    for (const e of batch.events) {
      if (e.type === 'BombExploded') {
        this.ledger.addBomb(e.ChainId, e.SourceBombOwnerNetEntityIdRaw, e.Tick)
        chainTouched.add(e.ChainId)
      } else if (e.type === 'ChainResolved') {
        this.ledger.addResolved(e.ChainId, e.BombCount, e.BrickCount, e.OwnerNetEntityIdRaws, e.Tick)
        chainTouched.add(e.ChainId)
        brickChains.add(e.ChainId)
      } else if (e.type === 'BrickDestroyed') {
        this.ledger.addBrick(e.ChainId, e.OwnerNetEntityIdRaw, e.Tick, 'event')
        brickChains.add(e.ChainId)
        if (e.OwnerNetEntityIdRaw === me) out.push({ kind: 'tip', id: TipId.Brick })
      }
    }
    for (const b of batch.derivedBricks) {
      if (!this.ledger.addBrick(b.ChainId, b.OwnerNetEntityIdRaw, b.Tick, 'derived')) continue
      brickChains.add(b.ChainId)
      if (b.OwnerNetEntityIdRaw === me) out.push({ kind: 'tip', id: TipId.Brick })
    }
    this.stats.consumeEvents(batch, this.ledger)

    // ---- 2. 逐事件规则 ----
    const before = batch.before
    const beforeKing = before?.BomberMatchState.HatKingNetEntityIdRaw ?? 0
    const killChains = new Set<U64>()
    if (this.localHp === null) this.localHp = findPlayer(before, me)?.玩家属性.血量当前 ?? null
    // 本人本批受到的每一击，按 view 的连锁节奏排好（心、红晕、回顾都跟这个节奏走）。
    const hpBefore = this.localHp
    const hits = staggerLocalHits(batch.events, me, hpBefore, this.opts.pointsPerHeart)
    for (const h of hits) {
      const env = h.cause === 'bomb' ? null : h.cause
      this.damage.push({ owner: h.owner, chainId: h.chainId, bomb: h.bomb, points: h.points, env, tick: batch.tick })
      if (this.damage.length > 2) this.damage.shift()
    }
    const deathDelay = hits.length ? lastHitDelayMs(hits) + DEATH_AFTER_LAST_HIT_MS : 0
    let localDied = false
    for (const e of batch.events) {
      switch (e.type) {
        case 'DamageApplied':
          if (e.VictimNetEntityIdRaw === me) this.localHp = e.HealthPointsLeft
          break
        case 'PlayerDied': {
          const victim = e.VictimNetEntityIdRaw
          const killer = e.KillerNetEntityIdRaw
          const hatsBefore = findPlayer(before, victim)?.BomberPlayerState.HatCount ?? 0
          this.killFeed.onDied(e, (id) => this.nameOf(id))
          if (victim === me) {
            localDied = true
            out.push({ kind: 'death', recap: this.buildRecap(e, batch, e.proto?.HatsLost ?? null), delayMs: deathDelay })
          }
          if (killer === me && victim !== me && e.ChainId !== 0) {
            this.killsByChain.set(e.ChainId, (this.killsByChain.get(e.ChainId) ?? 0) + 1)
            killChains.add(e.ChainId)
            if (this.killsByChain.size > 128) this.killsByChain.delete(this.killsByChain.keys().next().value as U64)
          }
          // 倒台：死时是帽王且帽塔够光柱阈值；横幅等「掉了几个强化」定下来再播。
          if (beforeKing !== 0 && victim === beforeKing && hatsBefore >= this.opts.pillarMinHats) this.pendingFalls.add(victim)
          const known = this.losses.onDied(victim, e.Tick, e.proto?.HatsLost, hatsBefore)
          if (known) this.onLossResolved(known, out)
          if (killer === me && victim !== me && beforeKing !== 0 && victim === beforeKing) {
            const myHats = findPlayer(before, me)?.BomberPlayerState.HatCount ?? 0
            if (myHats === 0) this.comebackUntil = e.Tick + Math.ceil((COMEBACK_WINDOW_MS / 1000) * this.opts.tickRateHz)
          }
          break
        }
        case 'PlayerRespawned':
          if (e.NetEntityIdRaw === me) {
            this.damage = []
            out.push({ kind: 'respawned' })
            out.push({ kind: 'notice', text: '重新摆上桌 · 保护中，放弹即解除' })
          }
          break
        case 'PickupTaken':
          this.sawPickupEvents = true
          if (e.PickerNetEntityIdRaw === me) {
            out.push({ kind: 'pickup', pickupKind: e.Kind, text: PICKUP_TEXT[e.Kind] ?? '+1' })
            out.push({ kind: 'tip', id: TipId.Candy })
            // 帽子 = 强化数：吃到火力 / 炸弹 / 速度就多一顶帽子；血包不算。
            if (e.Kind !== PickupKind.HealthPack) this.onHatGain(e.Tick, 1, out)
          }
          break
        case 'PowerupsDropped': {
          if (e.VictimNetEntityIdRaw === me) out.push({ kind: 'drops', text: dropsText(e.Kinds) })
          const r = this.losses.onDropped(e.VictimNetEntityIdRaw, e.Kinds.length)
          if (r) this.onLossResolved(r, out)
          break
        }
        case 'PlayerEliminated':
          this.eliminations.set(e.NetEntityIdRaw, e.Rank)
          this.killFeed.onEliminated(e.NetEntityIdRaw)
          if (e.NetEntityIdRaw === me) {
            const total = (batch.snapshot ?? before)?.Players.length ?? e.Rank
            out.push({ kind: 'eliminated', rank: e.Rank, total })
          }
          break
        case 'FinalCircleStarted':
          this.startFinalCircle(out)
          break
        case 'RingShrinkAnnounced': {
          const side = e.Next.Max - e.Next.Min + 1
          const sec = Math.max(1, Math.round((e.AtTick - e.Tick) / this.opts.tickRateHz))
          out.push({ kind: 'notice', text: `安全圈 ${sec} 秒后缩到 ${side}×${side} · 往中间走` })
          break
        }
        case 'MatchEnded':
          this.matchEndedTick = e.Tick
          break
        case 'BombExtinguished':
          if (e.OwnerNetEntityIdRaw === me) out.push({ kind: 'notice', text: '水里放不了炸弹，引信熄灭了' })
          break
        default:
          break
      }
    }

    if (hits.length) {
      const hint = localDied ? null : hitHintText(hits, (c) => this.ledger.bombs(c), (id) => this.nameOf(id), me, this.opts.pointsPerHeart)
      out.push({ kind: 'hits', hits, hpBefore: hpBefore ?? hits[0].hpAfter + hits[0].points, hint })
    }

    // ---- 3. 链级弹字 ----
    for (const c of chainTouched) {
      const n = this.ledger.bombs(c)
      if (n >= CHAIN_POPUP_MIN && this.ledger.involves(c, me)) {
        this.popup(out, `chain:${c}`, 'chain', `×${n} 连锁`, Math.min(4, n - CHAIN_POPUP_MIN + 1))
      }
    }
    for (const c of brickChains) {
      const n = this.ledger.bricks(c)
      if (n >= DEMOLISH_MIN && this.ledger.involves(c, me)) this.popup(out, `demolish:${c}`, 'demolish', `拆迁 ×${n}`, 2)
    }
    for (const c of killChains) {
      const k = this.killsByChain.get(c) ?? 0
      const label = multiKillLabel(k)
      if (label) this.popup(out, `kill:${c}`, 'kill', label, Math.min(4, k))
    }

    // ---- 4. 快照规则 ----
    const snap = batch.snapshot
    if (snap) {
      this.stats.consumeSnapshot(batch)
      for (const r of this.losses.onSnapshot(snap)) this.onLossResolved(r, out)
      this.checkMyHats(snap, out)
      this.localHp = findPlayer(snap, me)?.玩家属性.血量当前 ?? this.localHp
      this.checkCrown(snap, out)
      if (snap.BomberMatchState.Phase === MatchPhase.Endgame && !this.finalCircle) this.startFinalCircle(out)
      for (const p of snap.Players) {
        // 没有 PlayerEliminated 表现事件的数据源：出局顺序退回「快照里第一次看到 eliminated」的先后。
        if (p.eliminated && !this.eliminations.has(p.NetEntityIdRaw)) {
          let alive = 0
          for (const q of snap.Players) if (!q.eliminated) alive++
          this.eliminations.set(p.NetEntityIdRaw, alive + 1)
          if (p.NetEntityIdRaw === me) out.push({ kind: 'eliminated', rank: alive + 1, total: snap.Players.length })
        }
      }
      const king = snap.BomberMatchState.HatKingNetEntityIdRaw
      if (this.comebackUntil >= 0) {
        if (king === me && snap.Tick <= this.comebackUntil) {
          this.popup(out, `comeback:${snap.Tick}`, 'comeback', '逆袭！', 4)
          this.comebackUntil = -1
        } else if (snap.Tick > this.comebackUntil) this.comebackUntil = -1
      }
      if (snap.BomberMatchState.Phase === MatchPhase.Settlement && !this.settled) {
        this.settled = true
        out.push({ kind: 'settlement', results: this.buildResults(snap) })
      }
    }
    return out
  }

  private checkMatchReset(batch: TickBatch, out: HudMoment[]): void {
    let idx: number | undefined
    for (const e of batch.events) if (e.type === 'MatchStarted') idx = e.MatchIndex
    idx ??= batch.snapshot?.match.matchIndex
    if (idx === undefined || idx === this.matchIndex) return
    this.matchIndex = idx
    this.stats.reset(idx)
    this.ledger.clear()
    this.killsByChain.clear()
    this.popupShown.clear()
    this.damage = []
    this.announcedKing = 0
    this.settled = false
    this.eliminations.clear()
    this.finalCircle = false
    this.matchEndedTick = null
    this.killFeed.clear()
    this.localHp = null
    this.comebackUntil = -1
    this.harvestStart = this.harvestLast = -1
    this.harvestSum = 0
    this.losses.clear()
    this.pendingFalls.clear()
    this.myHats = null
    out.push({ kind: 'match-reset', matchIndex: idx })
  }

  /**
   * 加冕：帽王换人且新王 ≥ N 顶，或现任帽王帽数刚跨过 N。每位帽王连续在位期间只播一次。
   * 纯快照判定（`HatKingNetEntityIdRaw` + `HatCount`），不依赖 HatKingChanged 的到达时机。
   */
  private checkCrown(snap: WorldSnapshot, out: HudMoment[]): void {
    const king = snap.BomberMatchState.HatKingNetEntityIdRaw
    if (king !== this.announcedKing) this.announcedKing = 0
    if (king === 0 || this.announcedKing === king) return
    const hats = findPlayer(snap, king)?.BomberPlayerState.HatCount ?? 0
    if (hats < this.opts.pillarMinHats) return
    this.announcedKing = king
    const mine = king === this.opts.localId
    out.push({
      kind: 'banner',
      tone: 'crown',
      mine,
      title: mine ? '你是帽王！' : `${this.nameOf(king)} 成为帽王`,
      sub: mine ? '全场都在追你' : `${hats} 个强化 · 追光柱去抢`,
    })
  }

  private startFinalCircle(out: HudMoment[]): void {
    if (this.finalCircle) return
    this.finalCircle = true
    out.push({ kind: 'banner', tone: 'final', mine: false, title: FINAL_CIRCLE_BANNER.title, sub: FINAL_CIRCLE_BANNER.sub })
  }

  /** 本人吃到 count 个强化：「+N 帽」弹字 + 收割计数。 */
  private onHatGain(tick: U64, count: number, out: HudMoment[]): void {
    this.popup(out, `hatgain:${tick}:${++this.gainSeq}`, 'hat', `+${count} 帽`, 1)
    this.onHarvest(tick, count, out)
  }

  /**
   * 本人帽数的快照判定：第一次达到 TIP_HATS_GOAL 顶完成第 3 条提示；
   * 数据源没有 PickupTaken 时，活着时帽数上涨就当吃了强化（「+N 帽」+ 第 2 条提示）。
   */
  private checkMyHats(snap: WorldSnapshot, out: HudMoment[]): void {
    const p = findPlayer(snap, this.opts.localId)
    if (!p) return
    const hats = p.BomberPlayerState.HatCount
    const was = this.myHats
    this.myHats = hats
    if (hats >= TIP_HATS_GOAL && (was === null || was < TIP_HATS_GOAL)) out.push({ kind: 'tip', id: TipId.Hats })
    if (was === null || hats <= was || this.sawPickupEvents) return
    if (p.玩家属性.血量当前 <= 0 || p.eliminated) return
    out.push({ kind: 'tip', id: TipId.Candy })
    this.onHatGain(snap.Tick, hats - was, out)
  }

  /** 死者掉了几个强化定下来了：击杀栏补后半句；本人弹「掉了 N 个强化」；帽王死时播倒台横幅。 */
  private onLossResolved(r: ResolvedLoss, out: HudMoment[]): void {
    const me = this.opts.localId
    this.killFeed.setLost(r.victim, r.tick, r.lost)
    if (r.victim === me) {
      out.push({ kind: 'hats-lost', count: r.lost })
      if (r.lost > 0) this.popup(out, `hatloss:${r.tick}`, 'hatloss', lossPopupText(r.lost), 2)
    }
    if (this.pendingFalls.delete(r.victim)) {
      const mine = r.victim === me
      const who = mine ? '你' : this.nameOf(r.victim)
      out.push({
        kind: 'banner',
        tone: 'fall',
        mine,
        title: r.lost > 0 ? `${who}${mine ? '' : ' '}掉了 ${r.lost} 个强化！` : mine ? '你倒台了！' : `帽王 ${who} 倒台了！`,
        sub: r.lost > 0 ? (mine ? '快抢回来' : '冲过去哄抢！') : '帽王倒台',
      })
    }
  }

  private onHarvest(tick: U64, count: number, out: HudMoment[]): void {
    const gap = Math.ceil((HARVEST_GAP_MS / 1000) * this.opts.tickRateHz)
    if (this.harvestLast < 0 || tick - this.harvestLast > gap) {
      this.harvestStart = tick
      this.harvestSum = 0
    }
    this.harvestSum += count
    this.harvestLast = tick
    if (this.harvestSum >= HARVEST_MIN) this.popup(out, `harvest:${this.harvestStart}`, 'harvest', `收割 ×${this.harvestSum}`, 2)
  }

  /** 同 key 的弹字只在文案变化时再发（×3 → ×5 连锁会升级同一个弹字）。 */
  private popup(out: HudMoment[], key: string, tone: PopupTone, text: string, tier: number): void {
    if (this.popupShown.get(key) === text) return
    this.popupShown.set(key, text)
    if (this.popupShown.size > 128) this.popupShown.delete(this.popupShown.keys().next().value as string)
    out.push({ kind: 'popup', key, tone, text, tier })
  }

  private buildRecap(e: Extract<TickBatch['events'][number], { type: 'PlayerDied' }>, batch: TickBatch, hatsLost: number | null): DeathRecap {
    const me = this.opts.localId
    const killer = e.KillerNetEntityIdRaw
    const cause: DeathRecap['cause'] =
      e.Cause === DeathCause.Drown
        ? 'drown'
        : e.Cause === DeathCause.Burn
          ? 'burn'
          : e.Cause === DeathCause.Poison
            ? 'poison'
            : killer === me || killer === 0
              ? 'self'
              : 'bomb'
    const km = killer !== 0 && killer !== me ? this.meta.get(killer) : undefined
    const headline =
      cause === 'drown'
        ? '在水里泡太久，溺水了'
        : cause === 'burn'
          ? '被火烧倒了'
          : cause === 'poison'
            ? '在圈外中毒倒下了'
            : cause === 'self'
              ? '被自己的炸弹炸飞了'
              : `被 ${this.nameOf(killer)} 炸飞了`
    const fatal = this.damage[this.damage.length - 1]
    const bombId = e.proto?.SourceBombNetEntityIdRaw ?? fatal?.bomb ?? 0
    let bombKindName: string | null = null
    if (cause === 'bomb' || cause === 'self') {
      const bomb = [batch.snapshot, batch.before].flatMap((s) => s?.Bombs ?? []).find((b) => b.NetEntityIdRaw === bombId)
      bombKindName = BOMB_KIND_NAME[bomb?.BomberBombState.BombKind ?? BombKind.Standard]
    }
    const ownerId = fatal && fatal.env === null ? fatal.owner : cause === 'bomb' ? killer : 0
    const ENV_LABEL = { drown: '溺水', poison: '毒圈', burn: '燃烧' } as const
    const sources = [...this.damage].reverse().map((d): RecapSource => {
      const om = d.env ? undefined : this.meta.get(d.owner)
      const n = d.chainId !== 0 ? this.ledger.bombs(d.chainId) : 0
      const label = d.env ? ENV_LABEL[d.env] : d.owner === me ? '你自己的炸弹' : `${this.nameOf(d.owner)}的炸弹`
      const detail = [heartDelta(d.points, this.opts.pointsPerHeart), n >= 2 ? `×${n} 连锁` : ''].filter(Boolean).join(' · ')
      return { label, detail, animal: om?.animal ?? null, slot: om?.slot ?? null }
    })
    return {
      cause,
      headline,
      killerName: cause === 'bomb' ? this.nameOf(killer) : null,
      killerAnimal: km?.animal ?? null,
      killerSlot: km?.slot ?? null,
      bombOwnerName: ownerId === 0 ? null : ownerId === me ? '你自己' : this.nameOf(ownerId),
      bombKindName,
      chainLength: e.ChainId !== 0 ? this.ledger.bombs(e.ChainId) : 0,
      sources,
      hatsLost,
      drops: null,
      final: this.finalCircle || (batch.snapshot ?? batch.before)?.BomberMatchState.Phase === MatchPhase.Endgame,
      tick: e.Tick,
    }
  }

  private buildResults(snap: WorldSnapshot): SettlementResults {
    const me = this.opts.localId
    const rows = rankFinal(snap.Players, this.eliminations, this.finalCircle, snap.BomberMatchState.HatKingNetEntityIdRaw, me)
    return {
      matchIndex: snap.match.matchIndex,
      rows,
      finalCircle: this.finalCircle,
      endTick: this.matchEndedTick ?? snap.Tick,
      localRank: rows.find((r) => r.isLocal)?.rank ?? rows.length,
      percentBeaten: percentBeaten(rows, me),
      playerCount: rows.length,
      stats: this.stats.snapshot(),
    }
  }

  private learnNames(snap: WorldSnapshot | null): void {
    if (!snap) return
    for (const p of snap.Players) {
      if (!this.meta.has(p.NetEntityIdRaw)) this.meta.set(p.NetEntityIdRaw, { name: p.meta.name, animal: p.meta.animal, slot: p.meta.slot })
    }
  }

  private nameOf(id: U64): string {
    return this.meta.get(id)?.name ?? `玩家 ${id}`
  }
}

/** 旧入口保留：扣血文案已移到 format.ts。 */
export { heartDelta }
