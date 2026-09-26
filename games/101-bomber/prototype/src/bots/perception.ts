import type { U64 } from '../contract'
import type { Board } from './board'
import type { BotRng } from './bot-rng'

/**
 * 原型扩展（NON-CONTRACT，design §15 Bot 难度分档（原型工具））：逐弹反应延迟（reactMode 'perBomb'）。
 * 别人的每颗炸弹第一次出现在快照里时，从第二随机流抽一个 [min, max] Tick 的「看见」延迟；看见之前该弹
 * 仍占格挡路（board.bombAt 不动），但不进危险图、不连锁（PendingBomb.hidden）。自己的弹当场看见。
 * 已经爆炸的火焰永远可见——只有「引信中的弹」会被晚看见。
 */
export class BombPerception {
  /** 弹 id → 看见的快照 Tick（插入序遍历，确定性）。 */
  private readonly seenAt = new Map<U64, number>()

  constructor(
    private readonly rng: BotRng,
    private readonly minTicks: number,
    private readonly maxTicks: number,
  ) {}

  /** 每次决策调用一次（buildBoard 之后、buildDangerMap 之前）：标 hidden，返回隐藏的弹数。 */
  observe(board: Board, self: U64): number {
    const live = new Set<U64>()
    let hidden = 0
    for (const b of board.pending) {
      live.add(b.id)
      let at = this.seenAt.get(b.id)
      if (at === undefined) {
        at = b.owner === self ? board.tick : board.tick + this.rng.nextInt(this.minTicks, this.maxTicks + 1)
        this.seenAt.set(b.id, at)
      }
      b.hidden = board.tick < at
      if (b.hidden) hidden++
    }
    for (const id of this.seenAt.keys()) if (!live.has(id)) this.seenAt.delete(id)
    return hidden
  }

  /** 死亡 / 不在对局中时清空（重生后重新看场上的弹）。 */
  reset(): void {
    this.seenAt.clear()
  }
}
