import { Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three'
import { Batch, M, tqs, trs } from '../batch'
import { crownGeometry, hatGeometry, hatSegmentGeometry } from '../geo/hat'
import { createHatStackLayout, hatStackLayout, hatSwayLag, hatTilt } from '../logic/hat-layout'
import type { SharedMaterials } from '../materials'
import { stripeTexture } from '../textures'

/**
 * 全场所有帽子共用一个 InstancedMesh（头顶帽塔 + 飞行中的表现帽：吃强化落帽、死亡飞帽）；
 * 压缩帽塔段与帽王皇冠各一个小池。
 */
const _q = new Quaternion()
const _q2 = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _z = new Vector3(0, 0, 1)

export class HatRenderer {
  readonly hats: Batch
  private readonly segments: Mesh[] = []
  private segUsed = 0
  private readonly crown: Mesh
  private readonly layout = createHatStackLayout()
  private readonly segMat: MeshStandardMaterial
  private readonly segGeo = hatSegmentGeometry()

  constructor(
    private readonly scene: Object3D,
    mats: SharedMaterials,
  ) {
    // renderOrder 2：领奖台期间帽塔要画在棋盘压暗层之后（见 podium.ts PODIUM_ORDER）。
    this.hats = new Batch(hatGeometry(), mats.plastic, 512, { castShadow: true, renderOrder: 2 })
    scene.add(this.hats.mesh)
    const stripes = stripeTexture()
    stripes.repeat.set(1, 3)
    this.segMat = new MeshStandardMaterial({ map: stripes, roughness: 0.7 })
    this.crown = new Mesh(crownGeometry(), mats.gold)
    this.crown.castShadow = true
    this.crown.renderOrder = 2
    this.crown.visible = false
    scene.add(this.crown)
  }

  begin(): void {
    this.hats.begin()
    this.segUsed = 0
    this.crown.visible = false
  }

  end(): void {
    this.hats.end()
    for (let i = this.segUsed; i < this.segments.length; i++) this.segments[i].visible = false
  }

  /** 单顶帽子（飞行帽）。 */
  hat(x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number): void {
    this.hats.push(trs(M, x, y, z, rx, ry, rz, s, s, s))
  }

  /**
   * 头顶帽塔。base = 头顶世界位置，headQuat = 头的世界朝向（歪头时整塔跟着歪），
   * sway = 世界空间摇摆偏移（越往上滞后越大）。返回塔高。
   */
  tower(n: number, base: Vector3, headQuat: Quaternion, swayX: number, swayZ: number, crowned: boolean): number {
    const l = hatStackLayout(n, this.layout)
    if (l.drawn === 0) {
      if (crowned) this.placeCrown(base.x, base.y, base.z, headQuat)
      return crowned ? 0.2 : 0
    }
    for (let i = 0; i < l.drawn; i++) {
      const off = l.offsets[i]
      const lag = hatSwayLag(i, off)
      const x = base.x + swayX * lag
      const z = base.z + swayZ * lag
      // 交替 ±4° 倾斜 + 摇摆方向的倾斜，叠在头的朝向上
      _q2.setFromAxisAngle(_z, hatTilt(i) - swayX * lag * 1.2)
      _q.copy(headQuat).multiply(_q2)
      _q2.setFromAxisAngle(_up, i * 0.7)
      _q.multiply(_q2)
      this.hats.push(tqs(M, x, base.y + off, z, _q, 1, 1, 1))
    }
    if (l.segmentHeight > 0) {
      const seg = this.segment()
      const lag = hatSwayLag(5, l.segmentBottom)
      seg.position.set(base.x + swayX * lag, base.y + l.segmentBottom, base.z + swayZ * lag)
      seg.quaternion.copy(headQuat)
      seg.scale.set(1, l.segmentHeight, 1)
      seg.visible = true
    }
    if (crowned) {
      const lag = hatSwayLag(l.drawn, l.totalHeight)
      this.placeCrown(base.x + swayX * lag, base.y + l.totalHeight - 0.02, base.z + swayZ * lag, headQuat)
    }
    return l.totalHeight + (crowned ? 0.2 : 0)
  }

  private placeCrown(x: number, y: number, z: number, q: Quaternion): void {
    this.crown.position.set(x, y, z)
    this.crown.quaternion.copy(q)
    this.crown.visible = true
  }

  private segment(): Mesh {
    let m = this.segments[this.segUsed]
    if (!m) {
      m = new Mesh(this.segGeo, this.segMat)
      m.castShadow = true
      m.renderOrder = 2
      this.scene.add(m)
      this.segments.push(m)
    }
    this.segUsed++
    return m
  }
}
