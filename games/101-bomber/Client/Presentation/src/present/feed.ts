import type { BomberEvent } from '../contract/events'
import type { TickFrame } from '../contract/source'
import type { WorldSnapshot } from '../contract/snapshot'

export interface LocalPresentationPose {
  playerId: number
  entity: string
  connectionGeneration: string
  publicationSequence: string
  model: {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number; w: number }
  }
}

/**
 * 表现时钟：缓存最近两帧快照，渲染落后一帧做插值；事件排队到 `renderTick ≥ e.Tick` 才派发，
 * 保证特效与插值后的实体位置对齐。本地替身与将来的引擎 Replica 都调 `push()`，表现层只读 `sample()`。
 * 定帧（hitstop）只冻结渲染时钟，不影响规则层与输入；慢镜（slowMo，design §3.1 整局最后一杀）只缩放表现时钟 viewNow，
 * renderTick、事件派发、规则层与输入照常按真实时间走。
 */
export interface FeedSample {
  /** Session-evaluated owner Model. Null means not initialized; absent keeps legacy rendering. */
  localPose?: LocalPresentationPose | null
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
  /** 表现时钟此刻的倍率：1 = 正常，慢镜中 < 1，定帧中 0。 */
  timeScale: number
  /**
   * 请求本机慢镜：真实时间 ms 毫秒内 viewNow 按 scale 倍走（design §3.1：整局最后一杀 0.6 秒 · 0.3×）。
   * 由 feed 注入，表现层不必持有 feed；与定帧一样只是本机表现，不影响规则与输入。
   */
  slowMo(ms: number, scale: number): void
}

interface Received {
  snapshot: WorldSnapshot
  recvAt: number
}

export class PresentationFeed {
  private a: Received | null = null
  private b: Received | null = null
  private queue: BomberEvent[] = []
  private readonly eventKeys = new Set<string>()
  private frozenUntil = 0
  private slowUntil = 0
  private slowScale = 1
  private viewClock = 0
  private lastReal = -1
  private last: FeedSample | null = null

  constructor(private readonly tickMs: number) {}

  push(frame: TickFrame, recvAt: number): void {
    if (this.b && frame.snapshot.Tick < this.b.snapshot.Tick) return
    if (this.b && frame.snapshot.Tick === this.b.snapshot.Tick) {
      // Voxel delivery may follow the entity frame for the same committed tick.
      // Replace that display data without restarting interpolation or replaying FX.
      this.b = { snapshot: structuredClone(frame.snapshot), recvAt: this.b.recvAt }
      if (this.a?.snapshot.Tick === frame.snapshot.Tick) this.a = this.b
      this.enqueue(frame.events.filter(e => e.occurrenceId !== undefined))
      return
    }
    const owned = structuredClone(frame)
    const r: Received = { snapshot: owned.snapshot, recvAt }
    if (!this.b) {
      this.a = r
      this.b = r
    } else {
      this.a = this.b
      this.b = r
    }
    this.enqueue(owned.events)
  }

  private enqueue(events: readonly BomberEvent[]): void {
    for (const e of events) {
      if (e.occurrenceId) {
        if (this.eventKeys.has(e.occurrenceId)) continue
        this.eventKeys.add(e.occurrenceId)
        if (this.eventKeys.size > 512) this.eventKeys.delete(this.eventKeys.values().next().value!)
      }
      this.queue.push(structuredClone(e))
    }
  }

  /** 定帧：冻结表现时钟 ms 毫秒（连锁定帧 50–80 ms，design §3.1）。 */
  freeze(ms: number, realNow: number): void {
    this.frozenUntil = Math.max(this.frozenUntil, realNow + ms)
  }

  /**
   * 慢镜：从 realNow 起 ms 毫秒（真实时间）内表现时钟按 scale 倍走；重叠的请求取更晚的结束时刻。
   * 只缩放 viewNow（动画相位、粒子、玩偶散架与掉落弧线），renderTick 与事件派发不变。
   */
  slowMo(ms: number, scale: number, realNow: number): void {
    if (!(ms > 0)) return
    this.slowUntil = Math.max(this.slowUntil, realNow + ms)
    this.slowScale = Math.max(0, Math.min(1, scale))
  }

  private readonly requestSlowMo = (ms: number, scale: number): void => {
    this.slowMo(ms, scale, Math.max(0, this.lastReal))
  }

  /** 新局 / 重连时清空。 */
  reset(): void {
    this.a = this.b = null
    this.queue = []
    this.eventKeys.clear()
    this.last = null
    this.frozenUntil = 0
    this.viewClock = 0
    this.lastReal = -1
    this.slowUntil = 0
  }

  sample(realNow: number): FeedSample | null {
    if (!this.a || !this.b) return null
    const dt = this.lastReal < 0 ? 0 : Math.min(100, Math.max(0, realNow - this.lastReal))
    this.lastReal = realNow
    const frozen = realNow < this.frozenUntil
    if (frozen && this.last) {
      return { ...this.last, dueEvents: [], realNow, frozen: true, timeScale: 0 }
    }
    // 慢镜：本帧落在慢镜窗口里的那一段按倍率走，其余照常。
    const slowPart = Math.min(dt, Math.max(0, Math.min(realNow, this.slowUntil) - (realNow - dt)))
    const timeScale = realNow < this.slowUntil ? this.slowScale : 1
    this.viewClock += dt - slowPart + slowPart * this.slowScale
    const prev = this.a.snapshot
    const curr = this.b.snapshot
    const span = curr.Tick - prev.Tick
    const alpha = span <= 0 ? 1 : Math.min(1, Math.max(0, (realNow - this.b.recvAt) / (span * this.tickMs)))
    const renderTick = prev.Tick + alpha * span
    const due: BomberEvent[] = []
    let keep = 0
    for (const e of this.queue) {
      if (e.Tick <= renderTick + 1e-6) due.push(e)
      else this.queue[keep++] = e
    }
    this.queue.length = keep
    const s: FeedSample = {
      prev,
      curr,
      alpha,
      renderTick,
      dueEvents: due,
      viewNow: this.viewClock,
      realNow,
      frozen: false,
      timeScale,
      slowMo: this.requestSlowMo,
    }
    this.last = s
    return s
  }
}
