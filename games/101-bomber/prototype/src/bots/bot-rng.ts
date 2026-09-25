/**
 * Bot 自带的种子随机流（mulberry32）。`src/bots` 禁用 `Math.random`：同一快照序列 + 同一种子必须得到同一输出，
 * 否则命令流回放无法复现 Bot 行为。
 */
export class BotRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  /** [0, 1)。 */
  nextDouble(): number {
    return this.nextU32() / 4294967296
  }

  /** [minIncl, maxExcl)。 */
  nextInt(minIncl: number, maxExcl: number): number {
    return minIncl + Math.floor(this.nextDouble() * (maxExcl - minIncl))
  }
}
