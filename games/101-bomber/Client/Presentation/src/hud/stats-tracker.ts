import { MatchPhase, PickupKind, type CharacterId, type SkillId, type U64, type WorldSnapshot } from '../contract'
import type { HighlightStats } from '../present/highlight-cards'
import type { ChainLedger } from './chain-ledger'
import type { TickBatch } from './timeline'

/**
 * 本人本局统计（design §13 结算页）：优先使用复制总数；旧夹具从事件和快照补齐。matchIndex 变化时清零。
 * 另按人累计全场的高光卡统计（design §13 高光卡，ADR 0043）：最长连锁、击杀、帽王时长、拆迁、拾取、1 心逃生、
 * 击倒 Boss（死者死前心数上限 ≥ 6，ADR 0039）、捡到的金心。快照从没带过 `maxHealth` / `goldHearts` 的数据源，
 * 后两类不给高光卡（字段缺席 = 本类不参与分配）。
 */
export interface MatchStats {
  matchIndex: number
  kills: number
  deaths: number
  bombsPlaced: number
  bricksDestroyed: number
  /** 糖果拾取数（含血包）。 */
  pickups: number
  /** 本人有炸弹参与的链里，最多的炸弹颗数。 */
  bestChain: number
  maxHats: number
  /** 本人身为帽王的累计 Tick（只算 Running / Endgame）。 */
  hatKingTicks: number
  /** 原型扩展（NON-CONTRACT，ADR 0039）：本局本人最高心数上限（整心；快照缺 maxHealth 时 = 基础 3 心）。 */
  maxHearts: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：本人主动技能成功施放次数（SkillActivated）。 */
  skillCasts: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：本局角色（结算表「角色」）；未知为 null。 */
  character: CharacterId | null
  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：本局拿到过的技能与进化出的组合技，按首次出现顺序、去重（结算表「本局技能与进化」）。
   * 整局累计：决赛圈出局掉光技能也照样列出。
   */
  skills: SkillId[]
  /** 全场击杀数（结算表用）。 */
  killsById: Map<U64, number>
}

function empty(matchIndex: number): MatchStats {
  return {
    matchIndex,
    kills: 0,
    deaths: 0,
    bombsPlaced: 0,
    bricksDestroyed: 0,
    pickups: 0,
    bestChain: 0,
    maxHats: 0,
    hatKingTicks: 0,
    maxHearts: 0,
    skillCasts: 0,
    character: null,
    skills: [],
    killsById: new Map(),
  }
}

/** 一位玩家本局的高光统计（全场每人一份）。 */
interface PlayerTally {
  bestChain: number
  hatKingTicks: number
  eventBricks: number
  derivedBricks: number
  pickups: number
  clutch: number
  /** 击倒 Boss 的次数。 */
  bossKills: number
  /** 捡到的金心数。 */
  goldHearts: number
  /** 此刻正处在 1 心（> 0 且 ≤ 1 心）。 */
  low: boolean
  authoritativeClutch: boolean
}

export interface StatsTrackerOptions {
  /** Boss 门槛（半心点，= bossMinHearts × 每心点数）；缺省 12。 */
  bossMinPoints?: number
  /** 基础心数上限（半心点，= BomberConfig.maxHealthPoints）；缺省 3 心。 */
  baseMaxHealth?: number
}

export class StatsTracker {
  private s: MatchStats
  private eventBricks = 0
  private derivedBricks = 0
  private lastSnapTick = -1
  private readonly board = new Map<U64, PlayerTally>()
  private sawBrickEvents = false
  /** 数据源的快照带过心数上限 / 金心（这两类高光卡才参与分配）。 */
  private sawMaxHealth = false
  private sawGoldHearts = false
  private readonly bossMinPoints: number
  private readonly baseMaxHealth: number

  constructor(
    private readonly localId: U64,
    matchIndex = 0,
    private readonly pointsPerHeart = 2,
    opts: StatsTrackerOptions = {},
  ) {
    this.s = empty(matchIndex)
    this.bossMinPoints = opts.bossMinPoints ?? 6 * pointsPerHeart
    this.baseMaxHealth = opts.baseMaxHealth ?? 3 * pointsPerHeart
  }

  private tally(id: U64): PlayerTally {
    let t = this.board.get(id)
    if (!t) {
      t = { bestChain: 0, hatKingTicks: 0, eventBricks: 0, derivedBricks: 0, pickups: 0, clutch: 0, bossKills: 0, goldHearts: 0, low: false, authoritativeClutch: false }
      this.board.set(id, t)
    }
    return t
  }

  /** 高光卡输入；数据源没有心数上限 / 金心时不带 bossKills / goldHearts（这两类不参与分配）。 */
  highlightStats(id: U64): HighlightStats {
    const t = this.board.get(id)
    return {
      id,
      bestChain: t?.bestChain ?? 0,
      kills: this.s.killsById.get(id) ?? 0,
      hatKingTicks: t?.hatKingTicks ?? 0,
      bricks: t ? (this.sawBrickEvents ? t.eventBricks : t.derivedBricks) : 0,
      clutch: t?.clutch ?? 0,
      pickups: t?.pickups ?? 0,
      ...(this.sawMaxHealth ? { bossKills: t?.bossKills ?? 0 } : {}),
      ...(this.sawGoldHearts ? { goldHearts: t?.goldHearts ?? 0 } : {}),
    }
  }

  /** 局终：1 心活到最后也算一次绝境逃生（design §13「绝境逃生（1 心活下来）」）。每局调用一次。 */
  finalizeClutch(snap: WorldSnapshot): void {
    for (const p of snap.Players) {
      const t = this.board.get(p.NetEntityIdRaw)
      if (!t || t.authoritativeClutch || !t.low) continue
      t.low = false
      if (p.玩家属性.血量当前 > 0 && !p.eliminated) t.clutch++
    }
  }

  get stats(): Readonly<MatchStats> {
    return this.s
  }

  /** 拷贝一份（结算页冻结用）。 */
  snapshot(): MatchStats {
    return { ...this.s, skills: [...this.s.skills], killsById: new Map(this.s.killsById) }
  }

  reset(matchIndex: number): void {
    this.s = empty(matchIndex)
    this.eventBricks = 0
    this.derivedBricks = 0
    this.lastSnapTick = -1
    this.board.clear()
    this.sawBrickEvents = false
    this.sawMaxHealth = false
    this.sawGoldHearts = false
  }

  /** 事件部分；`ledger` 须已先吃过同一批事件。 */
  consumeEvents(batch: TickBatch, ledger: ChainLedger): void {
    const me = this.localId
    const touched = new Set<U64>()
    for (const e of batch.events) {
      switch (e.type) {
        case 'BombPlaced':
          if (e.OwnerNetEntityIdRaw === me) this.s.bombsPlaced++
          break
        case 'PlayerDied':
          if (e.KillerNetEntityIdRaw !== e.VictimNetEntityIdRaw) {
            this.s.killsById.set(e.KillerNetEntityIdRaw, (this.s.killsById.get(e.KillerNetEntityIdRaw) ?? 0) + 1)
            if (e.KillerNetEntityIdRaw === me) this.s.kills++
            // 击倒 Boss（ADR 0039 / 0043）：死者死前（上一份快照）心数上限 ≥ 门槛。
            const victim = batch.before?.Players.find((p) => p.NetEntityIdRaw === e.VictimNetEntityIdRaw)
            if (e.KillerNetEntityIdRaw !== 0 && victim?.maxHealth !== undefined && victim.maxHealth >= this.bossMinPoints) {
              this.tally(e.KillerNetEntityIdRaw).bossKills++
            }
          }
          if (e.VictimNetEntityIdRaw === me) this.s.deaths++
          break
        case 'PickupTaken':
          if (e.PickerNetEntityIdRaw === me) this.s.pickups++
          this.tally(e.PickerNetEntityIdRaw).pickups++
          if (e.Kind === PickupKind.GoldHeart) this.tally(e.PickerNetEntityIdRaw).goldHearts++
          break
        case 'BrickDestroyed':
          if (e.OwnerNetEntityIdRaw === me) this.eventBricks++
          if (e.OwnerNetEntityIdRaw !== 0) this.tally(e.OwnerNetEntityIdRaw).eventBricks++
          break
        case 'SkillActivated':
          if (e.PlayerNetEntityIdRaw === me) this.s.skillCasts++
          break
        case 'SkillGained':
          if (e.PlayerNetEntityIdRaw === me) this.noteSkill(e.Skill)
          break
        case 'SkillEvolved':
          if (e.PlayerNetEntityIdRaw === me) this.noteSkill(e.Combo)
          break
        case 'BombExploded':
        case 'ChainResolved':
          touched.add(e.ChainId)
          break
        default:
          break
      }
    }
    for (const b of batch.derivedBricks) {
      if (b.OwnerNetEntityIdRaw === me) this.derivedBricks++
      if (b.OwnerNetEntityIdRaw !== 0) this.tally(b.OwnerNetEntityIdRaw).derivedBricks++
    }
    this.sawBrickEvents = ledger.sawBrickEvents
    this.s.bricksDestroyed = ledger.sawBrickEvents ? this.eventBricks : this.derivedBricks
    for (const c of touched) {
      const n = ledger.bombs(c)
      if (ledger.involves(c, me)) this.s.bestChain = Math.max(this.s.bestChain, n)
      for (const o of ledger.owners(c)) {
        if (o === 0) continue
        const t = this.tally(o)
        t.bestChain = Math.max(t.bestChain, n)
      }
    }
  }

  private noteSkill(id: SkillId): void {
    if (!this.s.skills.includes(id)) this.s.skills.push(id)
  }

  consumeSnapshot(batch: TickBatch): void {
    const snap = batch.snapshot
    if (!snap) return
    const me = snap.Players.find((p) => p.NetEntityIdRaw === this.localId)
    if (me) this.s.maxHats = Math.max(this.s.maxHats, me.BomberPlayerState.HatCount)
    if (me) this.s.maxHearts = Math.max(this.s.maxHearts, Math.floor((me.maxHealth ?? this.baseMaxHealth) / this.pointsPerHeart))
    for (const p of snap.Players) {
      if (p.maxHealth !== undefined) this.sawMaxHealth = true
      if (p.goldHearts !== undefined) this.sawGoldHearts = true
    }
    // 没有技能表现事件的数据源（及开局专属技能）：从快照的角色与技能槽补齐。
    if (me?.skills) {
      this.s.character ??= me.skills.character
      for (const v of Object.values(me.skills.slots)) if (v) this.noteSkill(v.skill)
    }
    const phase = snap.BomberMatchState.Phase
    const live = phase === MatchPhase.Running || phase === MatchPhase.Endgame
    const king = snap.BomberMatchState.HatKingNetEntityIdRaw
    if (live && this.lastSnapTick >= 0 && king !== 0) {
      const dt = snap.Tick - this.lastSnapTick
      this.tally(king).hatKingTicks += dt
      if (king === this.localId) this.s.hatKingTicks += dt
    }
    this.lastSnapTick = snap.Tick
    if (live) this.trackClutch(snap)
    for (const totals of snap.statistics ?? []) {
      this.s.killsById.set(totals.id, totals.kills)
      const tally = this.tally(totals.id)
      tally.bestChain = totals.bestChain
      tally.hatKingTicks = totals.hatKingTicks
      tally.eventBricks = tally.derivedBricks = totals.destroyedBlocks
      tally.pickups = totals.pickups
      if (totals.clutchEscapes !== undefined) {
        tally.clutch = totals.clutchEscapes
        tally.authoritativeClutch = true
        tally.low = false
      }
      if (totals.bossKills !== undefined) {
        tally.bossKills = totals.bossKills
        this.sawMaxHealth = true
      }
      if (totals.goldenHeartPickups !== undefined) {
        tally.goldHearts = totals.goldenHeartPickups
        this.sawGoldHearts = true
      }
      if (totals.id === this.localId) {
        this.s.kills = totals.kills
        this.s.bombsPlaced = totals.bombs
        this.s.bricksDestroyed = totals.destroyedBlocks
        this.s.pickups = totals.pickups
        this.s.bestChain = totals.bestChain
        this.s.maxHats = totals.peakHats
        this.s.skillCasts = totals.skillCasts
        this.s.hatKingTicks = totals.hatKingTicks
        if (totals.character !== undefined) this.s.character = totals.character
        if (totals.deaths !== undefined) this.s.deaths = totals.deaths
        if (totals.peakHealthPoints !== undefined) this.s.maxHearts = Math.floor(totals.peakHealthPoints / this.pointsPerHeart)
        if (totals.specialBombHistory !== undefined) this.s.skills = [...totals.specialBombHistory]
      }
    }
  }

  /** 1 心逃生：掉到 1 心（活着）之后回到 1 心以上算一次；中途倒下不算。 */
  private trackClutch(snap: WorldSnapshot): void {
    for (const p of snap.Players) {
      const hp = p.玩家属性.血量当前
      const t = this.tally(p.NetEntityIdRaw)
      if (t.authoritativeClutch) continue
      if (hp <= 0 || p.eliminated) t.low = false
      else if (hp <= this.pointsPerHeart) t.low = true
      else if (t.low) {
        t.low = false
        t.clutch++
      }
    }
  }
}
