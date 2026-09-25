import { Color, type Texture } from 'three'
import { Batch, M, trs } from '../batch'
import { groundQuad } from '../geo/bomb'
import { softQuadMaterial } from '../materials'
import { INK } from '../palette'

/**
 * 地面贴片批：接触阴影（玩偶 0.9 / 炸弹 0.75 / 糖果 0.55 格，离地越高越小越淡）、
 * 实心圆环（脚圈、危险红圈）、虚线圆环（保护期、帽王地圈）、叠加辉光（爆炸地面）。
 * 每种一个 InstancedMesh，全部立即模式。
 */
export class GroundMarks {
  readonly shadows: Batch
  readonly rings: Batch
  readonly dashed: Batch
  readonly glow: Batch
  private readonly ink = new Color(INK)
  private readonly tmp = new Color()

  constructor(radial: Texture, ring: Texture, dashedRing: Texture) {
    const q = groundQuad()
    this.shadows = new Batch(q, softQuadMaterial(radial, false), 160, { tint: true, renderOrder: 1 })
    this.rings = new Batch(q, softQuadMaterial(ring, false), 64, { tint: true, renderOrder: 2 })
    this.dashed = new Batch(q, softQuadMaterial(dashedRing, false), 32, { tint: true, renderOrder: 2 })
    this.glow = new Batch(q, softQuadMaterial(radial, true), 420, { tint: true, renderOrder: 3 })
  }

  get meshes() {
    return [this.shadows.mesh, this.rings.mesh, this.dashed.mesh, this.glow.mesh]
  }

  begin(): void {
    this.shadows.begin()
    this.rings.begin()
    this.dashed.begin()
    this.glow.begin()
  }

  end(): void {
    this.shadows.end()
    this.rings.end()
    this.dashed.end()
    this.glow.end()
  }

  /** 接触阴影：size 为直径（格），height 为物体离地高度。 */
  shadow(x: number, z: number, size: number, height: number, strength = 1, y = 0.012): void {
    const h = Math.max(0, height)
    const k = 1 / (1 + h * 0.9)
    const i = this.shadows.push(trs(M, x, y, z, 0, 0, 0, size * k, 1, size * k))
    this.shadows.tint(i, this.ink.r, this.ink.g, this.ink.b, 0.32 * k * strength)
  }

  ring(x: number, z: number, diameter: number, hex: number, alpha: number, rot = 0, y = 0.02): void {
    const i = this.rings.push(trs(M, x, y, z, 0, rot, 0, diameter, 1, diameter))
    this.tmp.setHex(hex)
    this.rings.tint(i, this.tmp.r, this.tmp.g, this.tmp.b, alpha)
  }

  dashedRing(x: number, z: number, diameter: number, hex: number, alpha: number, rot: number, y = 0.025): void {
    const i = this.dashed.push(trs(M, x, y, z, 0, rot, 0, diameter, 1, diameter))
    this.tmp.setHex(hex)
    this.dashed.tint(i, this.tmp.r, this.tmp.g, this.tmp.b, alpha)
  }

  /** 叠加辉光：color 为线性 RGB（可 > 1 做过曝）。 */
  glowAt(x: number, z: number, size: number, r: number, g: number, b: number, a: number, y = 0.03): void {
    const i = this.glow.push(trs(M, x, y, z, 0, 0, 0, size, 1, size))
    this.glow.tint(i, r, g, b, a)
  }
}
