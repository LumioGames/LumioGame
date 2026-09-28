import { Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { Batch, M, tqs, trs } from '../batch'
import { crownGeometry, hatGeometry } from '../geo/hat'
import { createHatStackLayout, hatStackLayout, hatSwayLag, hatTilt } from '../logic/hat-layout'
import type { SharedMaterials } from '../materials'

/**
 * 全场所有帽子共用一个 InstancedMesh（头顶帽塔 + 飞行中的表现帽：吃强化落帽、死亡飞帽）；帽王皇冠一个小池。
 * 帽塔封顶 4 顶、越往上越小，超出的帽数由 DOM「×N」牌显示（labels.ts）。
 */
const _q = new Quaternion()
const _q2 = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _z = new Vector3(0, 0, 1)

export class HatRenderer {
  readonly hats: Batch
  /** 皇冠池：场内帽王 + 领奖台上并列第 1 的人各戴一顶（ADR 0031：rank === 1 都戴冠）。 */
  private readonly crowns: Mesh[] = []
  private crownUsed = 0
  private readonly crownGeo = crownGeometry()
  private readonly goldMat: SharedMaterials['gold']
  private readonly layout = createHatStackLayout()

  constructor(
    private readonly scene: Object3D,
    mats: SharedMaterials,
  ) {
    // renderOrder 2：领奖台期间帽塔要画在棋盘压暗层之后（见 podium.ts PODIUM_ORDER）。
    this.hats = new Batch(hatGeometry(), mats.plastic, 512, { castShadow: true, renderOrder: 2 })
    scene.add(this.hats.mesh)
    this.goldMat = mats.gold
    this.crownMesh()
    this.crownUsed = 0
  }

  begin(): void {
    this.hats.begin()
    this.crownUsed = 0
  }

  end(): void {
    this.hats.end()
    for (let i = this.crownUsed; i < this.crowns.length; i++) this.crowns[i].visible = false
  }

  /** 单顶帽子（飞行帽）。 */
  hat(x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number): void {
    this.hats.push(trs(M, x, y, z, rx, ry, rz, s, s, s))
  }

  /**
   * 头顶帽塔（最多 4 顶 + 可选皇冠）。base = 头顶世界位置，headQuat = 头的世界朝向（歪头时整塔跟着歪），
   * sway = 世界空间摇摆偏移（越往上滞后越大），unit = 高度与缩放系数（场内 1；领奖台跟玩偶放大），
   * lift = 只在竖直方向的加高（Boss，ADR 0039 / 0043：帽子跟着拉高，XZ 不变）。
   * 返回塔高（世界单位，已含皇冠）。
   */
  tower(n: number, base: Vector3, headQuat: Quaternion, swayX: number, swayZ: number, crowned: boolean, unit = 1, lift = 1): number {
    const l = hatStackLayout(n, crowned, this.layout)
    for (let i = 0; i < l.drawn; i++) {
      const off = l.offsets[i]
      const s = l.scales[i] * unit
      const lag = hatSwayLag(i, off)
      const x = base.x + swayX * lag
      const z = base.z + swayZ * lag
      // 交替 ±4° 倾斜 + 摇摆方向的倾斜，叠在头的朝向上
      _q2.setFromAxisAngle(_z, hatTilt(i) - swayX * lag * 1.2)
      _q.copy(headQuat).multiply(_q2)
      _q2.setFromAxisAngle(_up, i * 0.7)
      _q.multiply(_q2)
      this.hats.push(tqs(M, x, base.y + off * unit * lift, z, _q, s, s * lift, s))
    }
    if (crowned) {
      const lag = hatSwayLag(l.drawn, l.crownY)
      const crown = this.crownMesh()
      crown.position.set(base.x + swayX * lag, base.y + l.crownY * unit * lift, base.z + swayZ * lag)
      crown.quaternion.copy(headQuat)
      const cs = l.crownScale * unit
      crown.scale.set(cs, cs * lift, cs)
      crown.visible = true
    }
    return l.totalHeight * unit * lift
  }

  private crownMesh(): Mesh {
    let m = this.crowns[this.crownUsed]
    if (!m) {
      m = new Mesh(this.crownGeo, this.goldMat)
      m.castShadow = true
      m.renderOrder = 2
      m.visible = false
      this.scene.add(m)
      this.crowns.push(m)
    }
    this.crownUsed++
    return m
  }
}
