/** 表现层的确定性伪随机（装饰摆放、飞帽落点、眨眼间隔），同一 id 每帧结果稳定。 */

export function hash32(n: number): number {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

/** [0, 1) */
export function hash01(n: number, salt = 0): number {
  return hash32(n * 0x9e3779b1 + salt * 0x85ebca6b) / 4294967296
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
