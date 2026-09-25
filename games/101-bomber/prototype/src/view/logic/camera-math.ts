/**
 * 镜头参数与纯数学（plan「画面 · 镜头」）。不给玩家旋转；俯角固定。
 */
export const CAMERA = {
  fovDeg: 45,
  /** 参考图（Bubble Bay）是低一些的斜俯视；design 的 55°–65° 来自已存档美术稿，原型按用户要求贴近参考图。 */
  pitchDeg: 46,
  followDistance: 11.5,
  overviewDistance: 25,
  maxDistance: 26,
  /** 窄屏时保证横向至少看到的格数。 */
  minVisibleCellsX: 13,
  lookAhead: 0.6,
  smoothTime: 0.15,
  /** 死亡 → 重生点的滑行用更慢的平滑。 */
  respawnGlideSmoothTime: 0.45,
  edgeMargin: 4,
  overviewBlendMs: 400,
  shakeDecaySec: 0.2,
  selfHitShake: 0.1,
} as const

/** 窄屏自动拉远：distance = max(12.5, 13 / (2·tan(fov/2)·aspect))，封顶 26。 */
export function followDistanceForAspect(aspect: number): number {
  const a = Math.max(0.1, aspect)
  const halfFov = ((CAMERA.fovDeg / 2) * Math.PI) / 180
  const need = CAMERA.minVisibleCellsX / (2 * Math.tan(halfFov) * a)
  return Math.min(CAMERA.maxDistance, Math.max(CAMERA.followDistance, need))
}

/** 跟随目标离棋盘边 ≥ margin 格。 */
export function clampFollow(v: number, boardSize: number, margin: number): number {
  const lo = margin
  const hi = boardSize - margin
  if (lo > hi) return boardSize / 2
  return v < lo ? lo : v > hi ? hi : v
}

/** 连锁震动幅度（格）：N ≥ 3 起 0.12 + 0.04·(N−3)，封顶 0.4。 */
export function chainShakeAmplitude(chainLength: number): number {
  if (chainLength < 3) return 0
  return Math.min(0.4, 0.12 + 0.04 * (chainLength - 3))
}

/** 连锁定帧（毫秒）：N ≥ 3 起 50 + 10·(N−3)，封顶 80。 */
export function chainHitstopMs(chainLength: number): number {
  if (chainLength < 3) return 0
  return Math.min(80, 50 + 10 * (chainLength - 3))
}

/** 相机离目标的偏移：固定俯角，镜头在目标的游戏 +Y（three +Z）一侧。 */
export function cameraOffset(distance: number, out: { y: number; z: number }): { y: number; z: number } {
  const pitch = (CAMERA.pitchDeg * Math.PI) / 180
  out.y = distance * Math.sin(pitch)
  out.z = distance * Math.cos(pitch)
  return out
}

/** 平滑伪噪声震动（确定性正弦叠加），返回 [-1, 1] 量级的偏移。 */
export function shakeNoise(t: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  out.x = Math.sin(t * 47.1) * 0.6 + Math.sin(t * 83.7 + 1.3) * 0.4
  out.y = Math.sin(t * 59.3 + 0.7) * 0.5 + Math.sin(t * 97.1 + 2.1) * 0.3
  out.z = Math.sin(t * 53.9 + 2.9) * 0.6 + Math.sin(t * 71.3 + 0.4) * 0.4
  return out
}
