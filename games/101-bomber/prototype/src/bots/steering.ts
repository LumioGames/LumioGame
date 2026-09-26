import { 方向, type BomberCell } from '../contract'

/**
 * 离通道中心超过该值（千分格）时，先沿垂直轴回到本格中心再转向。
 * 取 150：规则层的转角吸附阈值是 500，6 Tick 内连续吸附降到 250；150 在两者之下，
 * 且步长 ≤ 300（移速上限 6 格/秒 @20Hz）时回正一步不会越过 −150，不会来回抖。
 */
export const LANE_TOLERANCE_MILLI = 150

/**
 * 从当前格走向相邻格 next 的方向（四向）。玩家恒在至少一条轴的通道中心上；
 * 需要换轴而垂直偏移过大时，先朝本格中心修正。
 */
export function steerToward(pos: { x: number; z: number }, here: BomberCell, next: BomberCell): 方向 {
  const ox = Math.round(pos.x * 1000) - (here.X * 1000 + 500)
  const oy = Math.round(pos.z * 1000) - (here.Y * 1000 + 500)
  const dx = next.X - here.X
  const dy = next.Y - here.Y
  if (dx !== 0) {
    if (Math.abs(oy) > LANE_TOLERANCE_MILLI) return oy > 0 ? 方向.上 : 方向.下
    return dx > 0 ? 方向.右 : 方向.左
  }
  if (dy !== 0) {
    if (Math.abs(ox) > LANE_TOLERANCE_MILLI) return ox > 0 ? 方向.左 : 方向.右
    return dy > 0 ? 方向.下 : 方向.上
  }
  return 方向.停
}
