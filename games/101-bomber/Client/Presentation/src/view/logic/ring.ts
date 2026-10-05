import type { RingRect } from '../../contract'

/**
 * 决赛圈安全圈的纯数学（design §4.2）：圈 = 以格为单位的闭区间正方形，X、Y ∈ [Min, Max] 为安全区。
 * 毒雾只铺在内场（外圈铁皮 0 与 size−1 不铺，玩家站不上去）。
 */

export function insideRing(x: number, y: number, ring: RingRect): boolean {
  return x >= ring.Min && x <= ring.Max && y >= ring.Min && y <= ring.Max
}

/** 内场里处在圈外的格（下标 Y·size + X，升序）。 */
export function fogCells(size: number, ring: RingRect): number[] {
  const out: number[] = []
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) if (!insideRing(x, y, ring)) out.push(y * size + x)
  }
  return out
}

export function sameRing(a: RingRect | null | undefined, b: RingRect | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.Min === b.Min && a.Max === b.Max
}

/**
 * 圈的世界坐标边框（米）：格 [Min, Max] 覆盖世界 [Min, Max + 1]。
 * 沿边框按固定间距切虚线段，visit(x, z, rotY) 给每段中心与朝向；phase ∈ [0, 1) 让虚线沿边走动。
 */
export function forEachRingDash(
  ring: RingRect,
  spacing: number,
  phase: number,
  inset: number,
  visit: (x: number, z: number, rotY: number) => void,
): void {
  const lo = ring.Min + inset
  const hi = ring.Max + 1 - inset
  const len = hi - lo
  if (len <= 0) return
  const n = Math.max(1, Math.round(len / spacing))
  const step = len / n
  const ph = ((phase % 1) + 1) % 1
  // 四条边首尾相接顺时针流动：上边左→右、右边上→下、下边右→左、左边下→上。
  for (let i = 0; i < n; i++) {
    const d = (i + ph) * step
    visit(lo + d, lo, 0)
    visit(hi, lo + d, Math.PI / 2)
    visit(hi - d, hi, 0)
    visit(lo, hi - d, Math.PI / 2)
  }
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：决赛圈缩到 1×1（D7）时正中那一格——当前圈或已预告的下一圈是 1×1 就返回它，
 * 给表现层画金色脉动辉光「往这里跑」；否则 null。
 */
export function finalCellOf(fc: { ring: RingRect; nextRing: RingRect | null } | null | undefined): { X: number; Y: number } | null {
  if (!fc) return null
  const r = fc.ring.Min === fc.ring.Max ? fc.ring : fc.nextRing && fc.nextRing.Min === fc.nextRing.Max ? fc.nextRing : null
  return r ? { X: r.Min, Y: r.Min } : null
}
