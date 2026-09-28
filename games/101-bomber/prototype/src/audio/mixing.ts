/**
 * 音频的纯逻辑部分（无 WebAudio，可单测）：定位衰减、声部上限与抢占、爆炸限流、五声音阶。
 */

/**
 * 有世界位置的音效（爆炸、连锁、放弹、别人的受击 / 倒下、金币串、宝箱、补给…）按离本机玩家的距离衰减
 * （用户试玩反馈 2026-09-28，推断待验证）：fullCells 格内满音量，silentCells 格外静音，中间 smoothstep 平滑过渡；
 * 声像按左右偏移 Δx / panCells 夹到 [-1, 1]（Synth 每个声部一个 StereoPannerNode）。
 * 本人自己的操作音（放弹、拾取、受击、击杀 / 命中确认）与 UI 音不走这里、不衰减。单位为格。
 */
export const SPATIAL = { fullCells: 4, silentCells: 14, panCells: 8 } as const

/** 距离 → 增益：≤ fullCells 为 1，≥ silentCells 为 0，中间 1 − smoothstep。 */
export function distanceGain(d: number): number {
  const t = Math.max(0, Math.min(1, (d - SPATIAL.fullCells) / (SPATIAL.silentCells - SPATIAL.fullCells)))
  return 1 - t * t * (3 - 2 * t)
}

/** 以本机玩家为听者：增益按 {@link distanceGain}，声像按 Δx / panCells。 */
export function spatialize(dx: number, dz: number): { gain: number; pan: number } {
  return { gain: distanceGain(Math.hypot(dx, dz)), pan: Math.max(-1, Math.min(1, dx / SPATIAL.panCells)) }
}

/**
 * 声部簿：最多 `max` 个同时发声，满了抢占最早开始的那个（返回被抢占的声部，调用方负责静音断开）。
 */
export class VoiceBook<T> {
  private readonly live: { item: T; end: number }[] = []

  constructor(readonly max = 24) {}

  add(item: T, end: number, now: number): T[] {
    this.prune(now)
    const stolen: T[] = []
    while (this.live.length >= this.max) {
      const v = this.live.shift()
      if (v) stolen.push(v.item)
    }
    this.live.push({ item, end })
    return stolen
  }

  prune(now: number): void {
    let keep = 0
    for (const v of this.live) if (v.end > now) this.live[keep++] = v
    this.live.length = keep
  }

  size(): number {
    return this.live.length
  }
}

/** 滑动窗口限流：窗口 `windowSec` 内最多 `max` 次（爆炸音 ≤ 6 次 / 100 ms）。时间单位同 AudioContext（秒）。 */
export class RateLimiter {
  private readonly times: number[] = []

  constructor(
    readonly max = 6,
    readonly windowSec = 0.1,
  ) {}

  allow(t: number): boolean {
    while (this.times.length && this.times[0] <= t - this.windowSec) this.times.shift()
    if (this.times.length >= this.max) return false
    // 调度时间可能乱序（连锁错开），按序插入保持窗口判断正确。
    let i = this.times.length
    while (i > 0 && this.times[i - 1] > t) i--
    this.times.splice(i, 0, t)
    return true
  }
}

/** C 大调五声音阶，从 C5 往上；连锁每多一颗升一级。 */
export function pentatonicHz(step: number): number {
  const degrees = [0, 2, 4, 7, 9]
  const octave = Math.floor(step / degrees.length)
  const semis = degrees[((step % degrees.length) + degrees.length) % degrees.length] + 12 * octave
  return 523.25 * 2 ** (semis / 12)
}

/** 连锁里第 i 颗的表现延迟（与 view 同口径：每颗 40 ms，封顶 320 ms），秒。 */
export function chainDelaySec(i: number): number {
  return Math.min(i * 0.04, 0.32)
}
