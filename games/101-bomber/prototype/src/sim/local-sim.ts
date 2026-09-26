import { MatchPhase, PickupKind } from '../contract'
import type { AnimalId, BomberConfig, CharacterPick, ProtoRules, SkillId, TickFrame, U64, AbilityActivation } from '../contract'
import { hashWorld } from './hash'
import { removePlayerFromWorld } from './hats'
import { createWorld } from './match-phase'
import { createPickup } from './pickup'
import { buildFrame } from './snapshot'
import { stepWorld } from './step'
import { findPlayer, isAlive, playerCell, type World } from './world'

/**
 * TS 规则替身（Stage 0a 内核的浏览器内替身）。将来整体换成引擎 Replica 适配器，表现层不改。
 * 只允许 `app/local-host.ts` 与本目录测试 import。
 */
export interface SimPlayerSpec {
  name: string
  isBot: boolean
  animal: AnimalId
  slot: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：选角。缺省 = 无角色、无技能（旧测试夹具行为不变）；
   * 'auto' = 每局开局按均衡原则分配（Bot）。有角色时 name / animal 由角色决定（真人保留 name）。
   */
  character?: CharacterPick
}

export interface LocalSimOptions {
  seed: number
  config: BomberConfig
  rules: ProtoRules
  players: readonly SimPlayerSpec[]
}

export class LocalSim {
  private readonly w: World
  private readonly slotIds = new Map<number, U64>()
  private frame: TickFrame
  /** 开发钩子排队的技能糖：[玩家 id, 技能]，每个进行中的 Tick 放一颗。 */
  private devCandies: [U64, SkillId][] = []

  constructor(opts: LocalSimOptions) {
    this.w = createWorld(opts)
    for (const p of this.w.players) this.slotIds.set(p.spec.slot, p.id)
    const events = this.w.out
    this.w.out = []
    this.frame = buildFrame(this.w, events)
  }

  /** 最近一次发布的帧（构造后即有第 0 帧：开局 Warmup）。 */
  current(): TickFrame {
    return this.frame
  }

  /** 推进一个 Tick。inputs 以玩家 NetEntityIdRaw 为键，在 ApplyInputs 相按玩家 id 升序生效。 */
  step(inputs: ReadonlyMap<U64, readonly AbilityActivation[]>): TickFrame {
    this.flushDevCandy()
    this.frame = stepWorld(this.w, inputs)
    return this.frame
  }

  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：改选角，**下一局** startMatch 生效（D15）。null = 无角色。
   */
  setPick(slot: number, pick: CharacterPick | null): void {
    const p = findPlayer(this.w, this.playerIdForSlot(slot))
    if (p) p.pick = pick
  }

  /**
   * 开发钩子（只在 import.meta.env.DEV 下由宿主调用）：接下来每个进行中的 Tick 在该玩家脚下放一颗技能糖
   * （等级 skillCandyLevel，经 createPickup，PickupSpawned Source = 'crate'）。糖是普通拾取物，照常进哈希。
   */
  devSpawnSkillCandies(id: U64, skills: readonly SkillId[]): void {
    for (const s of skills) this.devCandies.push([id, s])
  }

  private flushDevCandy(): void {
    const w = this.w
    if (this.devCandies.length === 0) return
    if (w.match.phase !== MatchPhase.Running && w.match.phase !== MatchPhase.Endgame) return
    const [id, skill] = this.devCandies[0]
    const p = findPlayer(w, id)
    if (!p || !isAlive(p)) return
    this.devCandies.shift()
    const cell = playerCell(w, p)
    createPickup(w, cell, PickupKind.SkillCandy, { source: 'crate', droppedBy: 0, fromCell: cell }, { skill, level: w.rules.skillCandyLevel })
  }

  playerIdForSlot(slot: number): U64 {
    const id = this.slotIds.get(slot)
    if (id === undefined) throw new Error(`LocalSim: no player in slot ${slot}`)
    return id
  }

  /** 当前完整权威状态的确定性哈希（含 RNG 状态与移动私有字段）。 */
  stateHash(): string {
    return hashWorld(this.w)
  }

  /** 玩家中途退出：身上强化全部掉成道具（帽数 = 强化数，ADR 0028）。产生的事件随下一帧发布。 */
  removePlayer(id: U64): void {
    removePlayerFromWorld(this.w, id)
  }
}
