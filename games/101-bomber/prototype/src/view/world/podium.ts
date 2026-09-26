import {
  AdditiveBlending,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type Object3D,
  type Quaternion,
  type Texture,
} from 'three'
import { Batch, M, tqs } from '../batch'
import { billboardQuad } from '../geo/bomb'
import { podiumGeometry, POPPER_LEN, POPPER_TILT, POPPERS } from '../geo/podium'
import { clamp01, easeOutBack } from '../logic/interp'
import { PODIUM } from '../logic/podium'
import { softQuadMaterial, type SharedMaterials } from '../materials'
import { SUNSHINE } from '../palette'
import type { GroundMarks } from './ground-marks'
import { SPOT_FRAG, SPOT_VERT } from './spotlight'

/**
 * 领奖台舞台（design §13）：积木舞台从棋盘中心升起（盖住下面的地形），其余棋盘压一层暗色；
 * 冠军头顶一束由上往下的聚光锥 + 上浮光尘 + 环绕的金色星闪。玩偶、帽塔、彩纸由 runtime 驱动。
 */
const CONE_H = 7
/** 舞台、台上玩偶与帽塔的不透明绘制顺序（在压暗层之后）。 */
export const PODIUM_ORDER = 2

export interface PodiumFrame {
  /** 舞台升起进度 0..1。 */
  rise: number
  /** 压暗强度 0..1。 */
  dim: number
  /** 冠军聚光 0..1；冠军站位为舞台局部坐标（站立面，不含升起偏移）。 */
  spot: number
  winnerX: number
  winnerY: number
  winnerZ: number
}

export class PodiumStage {
  readonly group = new Group()
  private readonly stage: Mesh
  private readonly cone: Mesh
  private readonly coneMat: ShaderMaterial
  private readonly dim: Mesh
  private readonly dimMat: MeshBasicMaterial
  private readonly motes: Batch
  private readonly stars: Batch
  private readonly moteColor = new Color(0xfff4c2)
  private readonly starColor = new Color(SUNSHINE)
  private riseY = 0

  constructor(
    scene: Object3D,
    mats: SharedMaterials,
    radial: Texture,
    star: Texture,
    private readonly cx: number,
    private readonly cz: number,
  ) {
    this.stage = new Mesh(podiumGeometry(), mats.plastic)
    this.stage.renderOrder = PODIUM_ORDER
    this.stage.castShadow = true
    this.stage.receiveShadow = true
    this.group.add(this.stage)
    const geo = new CylinderGeometry(0.28, 1.05, CONE_H, 32, 1, true)
    geo.translate(0, CONE_H / 2, 0)
    this.coneMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(0xfff1c0) }, uStrength: { value: 0 }, uTime: { value: 0 } },
      vertexShader: SPOT_VERT,
      fragmentShader: SPOT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    this.coneMat.toneMapped = false
    this.cone = new Mesh(geo, this.coneMat)
    this.cone.renderOrder = 6
    this.group.add(this.cone)
    this.group.position.set(cx, 0, cz)
    this.group.visible = false
    scene.add(this.group)

    // 压暗层走不透明队列 + 自定义混合：画在地形之后、舞台与台上玩偶之前（它们 renderOrder = PODIUM_ORDER），
    // 所以只压暗棋盘，不压暗舞台侧面（普通透明层会把台体下半截也盖暗）。
    this.dimMat = new MeshBasicMaterial({ color: 0x1d1733, transparent: false, opacity: 0, depthWrite: false, blending: CustomBlending })
    this.dim = new Mesh(new PlaneGeometry(90, 90), this.dimMat)
    this.dim.rotation.x = -Math.PI / 2
    this.dim.position.set(cx, 1.12, cz)
    this.dim.renderOrder = PODIUM_ORDER - 1
    this.dim.visible = false
    scene.add(this.dim)

    this.motes = new Batch(billboardQuad(), softQuadMaterial(radial, true), 16, { tint: true, renderOrder: 7 })
    this.stars = new Batch(billboardQuad(), softQuadMaterial(star, true), 10, { tint: true, renderOrder: 7 })
    scene.add(this.motes.mesh, this.stars.mesh)
  }

  /** 启动预热：全部可见一帧编译材质。 */
  warmup(on: boolean): void {
    this.group.visible = on
    this.dim.visible = on
    this.coneMat.uniforms.uStrength.value = on ? 1 : 0
  }

  get visible(): boolean {
    return this.group.visible
  }

  /** 舞台当前的抬升偏移（升起动画中 < 0）；玩偶与特效跟着它。 */
  get lift(): number {
    return this.riseY
  }

  /** 世界坐标 (x, z) 处的台面高度（彩纸落点）；台外为 0。 */
  floorAt(x: number, z: number): number {
    if (!this.group.visible) return 0
    const lx = x - this.cx
    const lz = z - this.cz
    if (Math.abs(lx) > PODIUM.stageWidth / 2 || Math.abs(lz) > PODIUM.stageDepth / 2) return 0
    for (const s of PODIUM.steps) {
      if (Math.abs(lx - s.dx) <= PODIUM.stepWidth / 2 && Math.abs(lz - PODIUM.stepZ) <= PODIUM.stepDepth / 2) return PODIUM.stageTop + s.h + this.riseY
    }
    return PODIUM.stageTop + this.riseY
  }

  /** 礼花筒筒口（世界坐标）与喷射方向（单位向量）。 */
  popper(i: number, out: { x: number; y: number; z: number; dx: number; dy: number; dz: number }): typeof out {
    const p = POPPERS[i % POPPERS.length]
    const s = Math.sin(POPPER_TILT)
    const c = Math.cos(POPPER_TILT)
    out.dx = Math.sin(p.ry) * s
    out.dy = c
    out.dz = Math.cos(p.ry) * s
    out.x = this.cx + p.x + out.dx * POPPER_LEN
    out.y = PODIUM.stageTop + this.riseY + out.dy * POPPER_LEN
    out.z = this.cz + p.z + out.dz * POPPER_LEN
    return out
  }

  hide(): void {
    this.group.visible = false
    this.dim.visible = false
    this.motes.begin()
    this.motes.end()
    this.stars.begin()
    this.stars.end()
  }

  update(f: PodiumFrame, now: number, camQuat: Quaternion, marks: GroundMarks): void {
    this.group.visible = true
    this.riseY = -1.6 * (1 - easeOutBack(clamp01(f.rise)))
    this.group.position.y = this.riseY
    this.dimMat.opacity = 0.42 * f.dim
    this.dim.visible = f.dim > 0
    const t = now / 1000
    this.motes.begin()
    this.stars.begin()
    const spot = clamp01(f.spot)
    this.cone.visible = spot > 0
    if (spot > 0) {
      // 聚光锥从头顶上方打下来（上窄下宽），底圈罩住冠军台阶面。
      this.cone.position.set(f.winnerX, f.winnerY, f.winnerZ)
      const wx = this.cx + f.winnerX
      const wy = f.winnerY + this.riseY
      const wz = this.cz + f.winnerZ
      this.cone.rotation.set(0, t * 0.4, 0)
      this.coneMat.uniforms.uStrength.value = 1.35 * spot
      this.coneMat.uniforms.uTime.value = t
      for (let i = 0; i < 16; i++) {
        const h = ((t * 0.35 + i / 16) % 1) * 5
        const a = i * 2.39996 + t * 0.5
        const r = 0.25 + 0.6 * (((i * 7) % 5) / 5)
        const idx = this.motes.push(tqs(M, wx + Math.sin(a) * r, wy + 0.2 + h, wz + Math.cos(a) * r, camQuat, 0.13, 0.13, 1))
        const fade = Math.sin((h / 5) * Math.PI) * spot
        this.motes.tint(idx, this.moteColor.r, this.moteColor.g, this.moteColor.b, fade * 0.9)
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 1.1
        const y = wy + 0.5 + 1.4 * ((i * 0.37 + t * 0.25) % 1)
        const tw = 0.5 + 0.5 * Math.sin(t * 6 + i * 1.7)
        const s = (0.12 + 0.14 * tw) * spot
        const idx = this.stars.push(tqs(M, wx + Math.sin(a) * 0.95, y, wz + Math.cos(a) * 0.95, camQuat, s, s, 1))
        this.stars.tint(idx, this.starColor.r * 1.5, this.starColor.g * 1.4, this.starColor.b, 0.95)
      }
      marks.glowAt(wx, wz, 2.2, 0.55 * spot, 0.45 * spot, 0.2 * spot, 1, wy + 0.02)
      marks.dashedRing(wx, wz, 1.5, SUNSHINE, 0.9 * spot, t * 0.9, wy + 0.025)
    }
    this.motes.end()
    this.stars.end()
  }
}
