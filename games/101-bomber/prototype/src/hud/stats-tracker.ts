import { MatchPhase, type U64 } from '../contract'
import type { ChainLedger } from './chain-ledger'
import type { TickBatch } from './timeline'

/**
 * 本人本局统计（design §13 结算页）：全部从事件 + 快照推出，matchIndex 变化时清零。
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：本人主动技能成功施放次数（SkillActivated）。 */
  skillCasts: number
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
    skillCasts: 0,
    killsById: new Map(),
  }
}

export class StatsTracker {
  private s: MatchStats
  private eventBricks = 0
  private derivedBricks = 0
  private lastSnapTick = -1

  constructor(private readonly localId: U64, matchIndex = 0) {
    this.s = empty(matchIndex)
  }

  get stats(): Readonly<MatchStats> {
    return this.s
  }

  /** 拷贝一份（结算页冻结用）。 */
  snapshot(): MatchStats {
    return { ...this.s, killsById: new Map(this.s.killsById) }
  }

  reset(matchIndex: number): void {
    this.s = empty(matchIndex)
    this.eventBricks = 0
    this.derivedBricks = 0
    this.lastSnapTick = -1
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
          }
          if (e.VictimNetEntityIdRaw === me) this.s.deaths++
          break
        case 'PickupTaken':
          if (e.PickerNetEntityIdRaw === me) this.s.pickups++
          break
        case 'BrickDestroyed':
          if (e.OwnerNetEntityIdRaw === me) this.eventBricks++
          break
        case 'SkillActivated':
          if (e.PlayerNetEntityIdRaw === me) this.s.skillCasts++
          break
        case 'BombExploded':
        case 'ChainResolved':
          touched.add(e.ChainId)
          break
        default:
          break
      }
    }
    for (const b of batch.derivedBricks) if (b.OwnerNetEntityIdRaw === me) this.derivedBricks++
    this.s.bricksDestroyed = ledger.sawBrickEvents ? this.eventBricks : this.derivedBricks
    for (const c of touched) {
      if (ledger.involves(c, me)) this.s.bestChain = Math.max(this.s.bestChain, ledger.bombs(c))
    }
  }

  consumeSnapshot(batch: TickBatch): void {
    const snap = batch.snapshot
    if (!snap) return
    const me = snap.Players.find((p) => p.NetEntityIdRaw === this.localId)
    if (me) this.s.maxHats = Math.max(this.s.maxHats, me.BomberPlayerState.HatCount)
    const phase = snap.BomberMatchState.Phase
    const live = phase === MatchPhase.Running || phase === MatchPhase.Endgame
    if (live && this.lastSnapTick >= 0 && snap.BomberMatchState.HatKingNetEntityIdRaw === this.localId) {
      this.s.hatKingTicks += snap.Tick - this.lastSnapTick
    }
    this.lastSnapTick = snap.Tick
  }
}
