/**
 * 表现插值的纯数学部分（无 three 依赖，可在 node 下单测）。
 */

export interface XZ {
  x: number
  z: number
}

/**
 * 实体位置插值：渲染落后一帧，在 prev → curr 之间按 alpha 线性插值。
 * `teleportTick > prevTick`（重生 / 开局摆位发生在 prev 之后）时直接取 curr，不跨瞬移插值；
 * prev 里没有该实体（刚出现）同理。
 */
export function interpolateXZ(
  out: XZ,
  prev: XZ | undefined,
  curr: XZ,
  teleportTick: number,
  prevTick: number,
  alpha: number,
): XZ {
  if (!prev || teleportTick > prevTick) {
    out.x = curr.x
    out.z = curr.z
    return out
  }
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  out.x = prev.x + (curr.x - prev.x) * a
  out.z = prev.z + (curr.z - prev.z) * a
  return out
}

const TAU = Math.PI * 2

/** from → to 的最短有符号角差，落在 (−π, π]。 */
export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  else if (d <= -Math.PI) d += TAU
  return d
}

/** 指数逼近目标角（k 为每秒收敛率），走最短弧；结果归一到 (−π, π]。 */
export function approachAngle(current: number, target: number, k: number, dtSec: number): number {
  const t = 1 - Math.exp(-k * Math.max(0, dtSec))
  const next = current + shortestAngleDelta(current, target) * t
  return shortestAngleDelta(0, next)
}

export interface DampState {
  value: number
  velocity: number
}

/**
 * 临界阻尼平滑（Game Programming Gems 4 的 SmoothDamp 近似）：
 * smoothTime 约为到达目标所需时间；dt = 0 时原样返回。
 */
export function smoothDamp(s: DampState, target: number, smoothTime: number, dtSec: number): number {
  if (dtSec <= 0) return s.value
  const st = Math.max(1e-4, smoothTime)
  const omega = 2 / st
  const x = omega * dtSec
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = s.value - target
  const temp = (s.velocity + omega * change) * dtSec
  s.velocity = (s.velocity - omega * temp) * exp
  s.value = target + (change + temp) * exp
  return s.value
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 血量阶段（design §12 三档）：按整心向上取整；≤0 为 0（死亡）。 */
export function heartStage(points: number, pointsPerHeart: number): number {
  if (points <= 0) return 0
  return Math.ceil(points / Math.max(1, pointsPerHeart))
}
