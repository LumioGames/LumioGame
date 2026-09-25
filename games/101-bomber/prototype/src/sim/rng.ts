/**
 * 确定性随机源，形状同契约 §4 `IBomberRandom`（NextInt / NextDouble）。
 * sfc32 内核，种子经 splitmix32 从 (seed, 流名) 派生；同一 Seed 派生的调用序列逐次相同，
 * 不读系统时钟。规则层禁止 `Math.random` / `Date.now`。
 */
export interface BomberRandom {
  NextInt(minInclusive: number, maxExclusive: number): number
  NextDouble(): number
}

const TWO_32 = 4294967296
/** `u * range` 必须小于 2^53 才能在 double 里精确，range 因此封顶 2^21。 */
const MAX_RANGE = 1 << 21

function hashName(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) >>> 0
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
  return (z ^ (z >>> 16)) >>> 0
}

/** 把主种子与一个整数（局序号、重试序号）混成新种子。 */
export function mixSeed(seed: number, k: number): number {
  return splitmix32((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0)
}

export class Sfc32 implements BomberRandom {
  private a = 0
  private b = 0
  private c = 0
  private d = 0

  constructor(seed: number, stream: string) {
    let s = (seed ^ hashName(stream)) >>> 0
    const next = (): number => {
      s = (s + 0x6d2b79f5) >>> 0
      return splitmix32(s)
    }
    this.a = next()
    this.b = next()
    this.c = next()
    this.d = next()
    for (let i = 0; i < 12; i++) this.nextU32()
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  NextInt(minInclusive: number, maxExclusive: number): number {
    const range = maxExclusive - minInclusive
    if (!(range > 0) || range > MAX_RANGE) throw new Error(`NextInt: bad range [${minInclusive}, ${maxExclusive})`)
    return minInclusive + Math.floor((this.nextU32() * range) / TWO_32)
  }

  NextDouble(): number {
    return this.nextU32() / TWO_32
  }

  state(): readonly number[] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]
  }

  clone(): Sfc32 {
    const r = Object.create(Sfc32.prototype) as Sfc32
    r.a = this.a
    r.b = this.b
    r.c = this.c
    r.d = this.d
    return r
  }
}
