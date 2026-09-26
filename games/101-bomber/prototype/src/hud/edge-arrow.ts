import type { FeedSample } from '../present/feed'
import type { U64 } from '../contract'

/**
 * 屏幕边缘帽王方向箭头（design §9.3 / §9.6，ADR 0014 首发必做）的纯几何部分。
 */
export interface ScreenPointLike {
  x: number
  y: number
  onScreen: boolean
  behind: boolean
}

export interface ArrowPlacement {
  visible: boolean
  x: number
  y: number
  /** 弧度，0 = 指向右，顺时针为正（屏幕 y 向下）。 */
  angle: number
}

/**
 * 目标在视口内（归一化坐标 |n| ≤ threshold 且不在相机背后）时隐藏；
 * 否则把「屏幕中心 → 目标」方向夹到距边 `margin` 像素的内切椭圆上。
 */
export function edgeArrowPlacement(p: ScreenPointLike, width: number, height: number, margin = 48, threshold = 0.85): ArrowPlacement {
  const cx = width / 2
  const cy = height / 2
  const nx = (p.x - cx) / cx
  const ny = (p.y - cy) / cy
  if (!p.behind && Math.abs(nx) <= threshold && Math.abs(ny) <= threshold) return { visible: false, x: 0, y: 0, angle: 0 }
  let dx = p.x - cx
  let dy = p.y - cy
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    dx = 0
    dy = 1
  }
  const a = Math.max(1, cx - margin)
  const b = Math.max(1, cy - margin)
  const t = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2)
  return { visible: true, x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) }
}

/** 插值后的实体位置（米，引擎轴）；瞬移后不插值（与 view 同口径）。 */
export function interpolatedPlayerPos(sample: FeedSample, id: U64): { x: number; z: number } | null {
  const c = sample.curr.Players.find((p) => p.NetEntityIdRaw === id)
  if (!c) return null
  const p = sample.prev.Players.find((q) => q.NetEntityIdRaw === id)
  const cw = c.LogicTransform.WorldPosition
  if (!p || c.teleportTick > sample.prev.Tick) return { x: cw.x, z: cw.z }
  const pw = p.LogicTransform.WorldPosition
  const a = sample.alpha
  return { x: pw.x + (cw.x - pw.x) * a, z: pw.z + (cw.z - pw.z) * a }
}
