import type { AnimalId, BomberConfig, ProtoRules, TickFrame, U64, AbilityActivation } from '../contract'
import { hashWorld } from './hash'
import { removePlayerFromWorld } from './hats'
import { createWorld } from './match-phase'
import { buildFrame } from './snapshot'
import { stepWorld } from './step'
import type { World } from './world'

/**
 * TS 规则替身（Stage 0a 内核的浏览器内替身）。将来整体换成引擎 Replica 适配器，表现层不改。
 * 只允许 `app/local-host.ts` 与本目录测试 import。
 */
export interface SimPlayerSpec {
  name: string
  isBot: boolean
  animal: AnimalId
  slot: number
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
    this.frame = stepWorld(this.w, inputs)
    return this.frame
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
