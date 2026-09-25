/**
 * 帽子塔布局（design §9.2：12 顶以内逐顶叠，超过用压缩塔段；数字另由 DOM 牌显示真实帽数）。
 * 纯数学，结果写进复用对象，避免每帧分配。
 */
export const HAT = {
  /** 单顶帽子高度（帽檐 + 帽身）。 */
  height: 0.16,
  spacing: 0.12,
  compressedSpacing: 0.085,
  maxIndividual: 12,
  /** 压缩时上下各画几顶。 */
  compressedEach: 5,
  maxTotal: 1.6,
  tiltRad: (4 * Math.PI) / 180,
} as const

export interface HatStackLayout {
  /** 实际逐顶画出的帽子数。 */
  drawn: number
  /** 每顶帽子底部相对头顶的高度；只有前 drawn 项有效。 */
  offsets: Float32Array
  /** 压缩段（>12 顶时出现）：底部高度与段高；无压缩段时 height = 0。 */
  segmentBottom: number
  segmentHeight: number
  /** 整座塔的高度（最上一顶帽子的顶）。 */
  totalHeight: number
}

export function createHatStackLayout(): HatStackLayout {
  return { drawn: 0, offsets: new Float32Array(HAT.maxIndividual), segmentBottom: 0, segmentHeight: 0, totalHeight: 0 }
}

/** 压缩段高：0.3·log2(n − 9)，并压到整塔 ≤ maxTotal。 */
export function compressedSegmentHeight(n: number): number {
  const s = HAT.compressedSpacing
  const each = HAT.compressedEach
  const fixed = (each - 1) * s + HAT.height * 0.75 + (each - 1) * s + HAT.height
  const cap = HAT.maxTotal - fixed
  return Math.max(0, Math.min(0.3 * Math.log2(Math.max(2, n - 9)), cap))
}

export function hatStackLayout(n: number, out: HatStackLayout = createHatStackLayout()): HatStackLayout {
  const count = Math.max(0, Math.floor(n))
  out.segmentBottom = 0
  out.segmentHeight = 0
  if (count === 0) {
    out.drawn = 0
    out.totalHeight = 0
    return out
  }
  if (count <= HAT.maxIndividual) {
    out.drawn = count
    for (let i = 0; i < count; i++) out.offsets[i] = i * HAT.spacing
    out.totalHeight = (count - 1) * HAT.spacing + HAT.height
    return out
  }
  const s = HAT.compressedSpacing
  const each = HAT.compressedEach
  out.drawn = each * 2
  for (let i = 0; i < each; i++) out.offsets[i] = i * s
  // 压缩段压住下半截最上一顶的帽身（重叠 1/4 帽高），读起来像同一座塔。
  const segBottom = (each - 1) * s + HAT.height * 0.75
  const segH = compressedSegmentHeight(count)
  const upperBase = segBottom + segH
  for (let i = 0; i < each; i++) out.offsets[each + i] = upperBase + i * s
  out.segmentBottom = segBottom
  out.segmentHeight = segH
  out.totalHeight = upperBase + (each - 1) * s + HAT.height
  return out
}

/** 第 i 顶的交替倾斜（±4°）。 */
export function hatTilt(i: number): number {
  return i % 2 === 0 ? HAT.tiltRad : -HAT.tiltRad
}

/** 弹簧摇摆的逐顶滞后系数：越往上越大（第 i 顶 ×(1 + 0.15·i)）。 */
export function hatSwayLag(i: number, offset: number): number {
  return (offset / HAT.maxTotal) * (1 + 0.15 * i)
}
