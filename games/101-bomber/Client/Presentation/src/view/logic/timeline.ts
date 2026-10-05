interface Item {
  at: number
  seq: number
  fn: () => void
}

const byTime = (a: Item, b: Item): number => a.at - b.at || a.seq - b.seq

/**
 * 表现时钟上的一次性调度（毫秒，viewNow）。定帧时 viewNow 不走，排队的动作也跟着停。
 * 同一时刻的动作按加入顺序执行。事件频率低（每 Tick 至多几十条），闭包分配可接受；
 * 每帧的 run 不分配。
 */
export class Timeline {
  private items: Item[] = []
  private readonly due: Item[] = []
  private seq = 0

  add(at: number, fn: () => void): void {
    this.items.push({ at, seq: this.seq++, fn })
  }

  /** 执行所有 at ≤ now 的动作；动作里再 add 的、已到期的也会在本次执行。 */
  run(now: number): void {
    for (let guard = 0; guard < 8; guard++) {
      if (this.items.length === 0) return
      const due = this.due
      due.length = 0
      let keep = 0
      for (const it of this.items) {
        if (it.at <= now) due.push(it)
        else this.items[keep++] = it
      }
      this.items.length = keep
      if (due.length === 0) return
      due.sort(byTime)
      for (let i = 0; i < due.length; i++) due[i].fn()
      due.length = 0
    }
  }

  clear(): void {
    this.items.length = 0
  }

  get size(): number {
    return this.items.length
  }
}
