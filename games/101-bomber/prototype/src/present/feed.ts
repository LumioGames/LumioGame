import type { BomberEvent } from '../contract/events'
import type { TickFrame } from '../contract/source'
import type { WorldSnapshot } from '../contract/snapshot'

/**
 * 表现时钟：缓存最近两帧快照，渲染落后一帧做插值；事件排队到 `renderTick ≥ e.Tick` 才派发，
 * 保证特效与插值后的实体位置对齐。本地替身与将来的引擎 Replica 都调 `push()`，表现层只读 `sample()`。
 * 定帧（hitstop）只冻结渲染时钟，不影响规则层与输入。
 */
export interface FeedSample {
  /** 插值起点（上一帧）。 */
  prev: WorldSnapshot
  /** 插值终点（最新帧）。 */
  curr: WorldSnapshot
  /** prev → curr 的插值系数，0..1。 */
  alpha: number
  /** 小数 Tick：prev.Tick + alpha·(curr.Tick − prev.Tick)。所有倒计时都从它算。 */
  renderTick: number
  /** 本次 sample 新到期的事件（按产生顺序）；每个事件只会出现在一次 sample 里。 */
  dueEvents: readonly BomberEvent[]
  /** 表现时钟（毫秒，定帧期间不走）；动画相位用它。 */
  viewNow: number
  /** 真实时钟（毫秒）。 */
  realNow: number
  /** 该 sample 是否处于定帧中。 */
  frozen: boolean
}

interface Received {
  snapshot: WorldSnapshot
  recvAt: number
}

export class PresentationFeed {
  private a: Received | null = null
  private b: Received | null = null
  private queue: BomberEvent[] = []
  private frozenUntil = 0
  private viewClock = 0
  private lastReal = -1
  private last: FeedSample | null = null

  constructor(private readonly tickMs: number) {}

  push(frame: TickFrame, recvAt: number): void {
    const r: Received = { snapshot: frame.snapshot, recvAt }
    if (!this.b) {
      this.a = r
      this.b = r
    } else {
      this.a = this.b
      this.b = r
    }
    for (const e of frame.events) this.queue.push(e)
  }

  /** 定帧：冻结表现时钟 ms 毫秒（连锁定帧 50–80 ms，design §3.1）。 */
  freeze(ms: number, realNow: number): void {
    this.frozenUntil = Math.max(this.frozenUntil, realNow + ms)
  }

  /** 新局 / 重连时清空。 */
  reset(): void {
    this.a = this.b = null
    this.queue = []
    this.last = null
  }

  sample(realNow: number): FeedSample | null {
    if (!this.a || !this.b) return null
    const dt = this.lastReal < 0 ? 0 : Math.max(0, realNow - this.lastReal)
    this.lastReal = realNow
    const frozen = realNow < this.frozenUntil
    if (frozen && this.last) {
      return { ...this.last, dueEvents: [], realNow, frozen: true }
    }
    this.viewClock += dt
    const prev = this.a.snapshot
    const curr = this.b.snapshot
    const span = curr.Tick - prev.Tick
    const alpha = span <= 0 ? 1 : Math.min(1, Math.max(0, (realNow - this.b.recvAt) / this.tickMs))
    const renderTick = prev.Tick + alpha * span
    const due: BomberEvent[] = []
    let keep = 0
    for (const e of this.queue) {
      if (e.Tick <= renderTick + 1e-6) due.push(e)
      else this.queue[keep++] = e
    }
    this.queue.length = keep
    const s: FeedSample = { prev, curr, alpha, renderTick, dueEvents: due, viewNow: this.viewClock, realNow, frozen: false }
    this.last = s
    return s
  }
}
