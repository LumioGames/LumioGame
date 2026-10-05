import type { BomberEvent } from './events'
import type { WorldSnapshot } from './snapshot'

/** 一个 Tick 的发布物：该 Tick 结束时的快照 + 该 Tick 内产生的事件（按产生顺序）。 */
export interface TickFrame {
  snapshot: WorldSnapshot
  events: readonly BomberEvent[]
}

