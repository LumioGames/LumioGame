import type { BomberConfig, ProtoRules } from './config'
import type { BomberEvent } from './events'
import type { U64 } from './ids'
import type { AbilityActivation } from './input'
import type { WorldSnapshot } from './snapshot'

/** 一个 Tick 的发布物：该 Tick 结束时的快照 + 该 Tick 内产生的事件（按产生顺序）。 */
export interface TickFrame {
  snapshot: WorldSnapshot
  events: readonly BomberEvent[]
}

/**
 * 表现层唯一的数据来源接缝。现在由 `app/local-host.ts`（本地 TS 替身 + Bot）实现；
 * 将来由引擎 Replica 适配器实现（ADR-067：规则跑 C# .NET WASM，JS 只渲染 + 采输入），表现层不改。
 */
export interface GameSource {
  readonly config: BomberConfig
  readonly rules: ProtoRules
  /** 本机玩家的 NetEntityIdRaw。 */
  readonly localPlayerId: U64
  /** 订阅 Tick 发布；新订阅者会立即收到最近一帧。返回取消订阅函数。 */
  subscribe(cb: (frame: TickFrame) => void): () => void
  /** 本机玩家的技能激活；在下一个 Tick 生效（放弹按下会被锁存到被消费为止）。 */
  sendInput(activation: AbilityActivation): void
}
