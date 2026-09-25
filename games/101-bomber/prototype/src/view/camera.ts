import { PerspectiveCamera } from 'three'
import {
  CAMERA,
  cameraOffset,
  clampFollow,
  followDistanceForAspect,
  shakeNoise,
} from './logic/camera-math'
import { clamp01, easeInOutCubic, smoothDamp, type DampState } from './logic/interp'
import type { CamPose } from './logic/podium'

/**
 * 跟随镜头：透视 FOV 42°、固定俯角 58°、距离 12.5（窄屏自动拉远），不给玩家旋转。
 * 跟随目标 = 插值位置 + 0.6 格前瞻，0.15 s 平滑，离棋盘边 ≥ 4 格夹紧；V 键 0.4 s 过渡到全局俯瞰。
 * 震动只平移（不转），幅度 × 设置里的强度，0 = 完全不动。
 */
export class CameraRig {
  readonly camera: PerspectiveCamera
  private readonly sx: DampState = { value: 0, velocity: 0 }
  private readonly sz: DampState = { value: 0, velocity: 0 }
  private overview = false
  private blend = 0
  private followDist: number = CAMERA.followDistance
  private shakeAmp = 0
  private shakePeak = 0
  private shakeClock = 0
  private glideUntil = 0
  private initialized = false
  private readonly off = { y: 0, z: 0 }
  private readonly noise = { x: 0, y: 0, z: 0 }
  private readonly center: number
  /** 电影镜头（领奖台）：pose 为世界坐标，weight 0..1 与跟随镜头混合。 */
  private cine: CamPose | null = null
  private cineWeight = 0

  constructor(private readonly boardSize: number) {
    this.camera = new PerspectiveCamera(CAMERA.fovDeg, 16 / 9, 0.3, 140)
    this.center = boardSize / 2
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.followDist = followDistanceForAspect(aspect)
    this.camera.updateProjectionMatrix()
  }

  toggleOverview(): void {
    this.overview = !this.overview
  }

  get isOverview(): boolean {
    return this.overview
  }

  /** 叠加一次震动（格）；取最大值，不累加。 */
  shake(amplitude: number): void {
    if (amplitude > this.shakeAmp) {
      this.shakeAmp = amplitude
      this.shakePeak = amplitude
    }
  }

  /** 领奖台电影镜头；null = 回到跟随 / 俯瞰。weight 由调用方做缓入缓出。 */
  setCinematic(pose: CamPose | null, weight: number): void {
    this.cine = pose
    this.cineWeight = pose ? clamp01(weight) : 0
  }

  /** 死亡点 → 重生点用慢一点的平滑滑过去。 */
  glide(untilRealSec: number): void {
    this.glideUntil = untilRealSec
  }

  /**
   * @param dtSec 表现时钟步长（定帧时为 0，镜头也停）
   * @param realSec 真实时钟（秒），给震动相位 / 衰减用
   */
  update(dtSec: number, realDtSec: number, realSec: number, targetX: number, targetZ: number, dirX: number, dirZ: number, shakeScale: number): void {
    const size = this.boardSize
    const wantX = clampFollow(targetX + dirX * CAMERA.lookAhead, size, CAMERA.edgeMargin)
    const wantZ = clampFollow(targetZ + dirZ * CAMERA.lookAhead, size, CAMERA.edgeMargin)
    if (!this.initialized) {
      this.sx.value = wantX
      this.sz.value = wantZ
      this.initialized = true
    }
    const st = realSec < this.glideUntil ? CAMERA.respawnGlideSmoothTime : CAMERA.smoothTime
    smoothDamp(this.sx, wantX, st, dtSec)
    smoothDamp(this.sz, wantZ, st, dtSec)

    const step = realDtSec / (CAMERA.overviewBlendMs / 1000)
    this.blend = clamp01(this.blend + (this.overview ? step : -step))
    const e = easeInOutCubic(this.blend)
    const lookX = this.sx.value + (this.center - this.sx.value) * e
    const lookZ = this.sz.value + (this.center - this.sz.value) * e
    const dist = this.followDist + (Math.max(this.followDist, CAMERA.overviewDistance) - this.followDist) * e
    cameraOffset(dist, this.off)

    // 震动：线性衰减 0.2 s，按设置强度缩放。
    this.shakeClock += realDtSec
    if (this.shakeAmp > 0) this.shakeAmp = Math.max(0, this.shakeAmp - (this.shakePeak / CAMERA.shakeDecaySec) * realDtSec)
    const amp = this.shakeAmp * Math.max(0, Math.min(1, shakeScale))
    shakeNoise(this.shakeClock, this.noise)
    const ox = this.noise.x * amp
    const oy = this.noise.y * amp * 0.6
    const oz = this.noise.z * amp

    let px = lookX
    let py = this.off.y
    let pz = lookZ + this.off.z
    let lx = lookX
    let ly = 0
    let lz = lookZ
    const w = this.cineWeight
    if (this.cine && w > 0) {
      const c = this.cine
      px += (c.px - px) * w
      py += (c.py - py) * w
      pz += (c.pz - pz) * w
      lx += (c.lx - lx) * w
      ly += (c.ly - ly) * w
      lz += (c.lz - lz) * w
    }
    this.camera.position.set(px + ox, py + oy, pz + oz)
    this.camera.lookAt(lx + ox, ly + oy, lz + oz)
    this.camera.updateMatrixWorld()
  }

  /** 当前镜头看向的地面点（给标签 / 屏外判定参考）。 */
  get lookTarget(): { x: number; z: number } {
    return { x: this.sx.value, z: this.sz.value }
  }
}
