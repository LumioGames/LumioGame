import type { Object3D, Texture } from 'three'
import type { TerrainView } from '../../contract'
import { Batch, M, trs } from '../batch'
import { groundQuad } from '../geo/bomb'
import { computeFireCross, createFireCross, forEachCrossCell } from '../logic/fire-preview'
import { softQuadMaterial } from '../materials'

/**
 * 本机待放炸弹的预计十字（plan：只给本人画，不给场上每颗炸弹画）。
 * 冷色填充 + 奶油虚线边（冷 = 你的计划，暖 = 实时危险）；条件不满足时 0.15 s 淡出。
 */
export class BombPreview {
  private readonly batch: Batch
  private readonly cross = createFireCross()
  private alpha = 0
  private cx = -1
  private cy = -1
  private cellAlpha = 0
  private readonly visit = (x: number, y: number, dist: number): void => {
    const s = 0.9 - dist * 0.02
    const i = this.batch.push(trs(M, x + 0.5, 0.022, y + 0.5, 0, 0, 0, s, 1, s))
    this.batch.tint(i, 1, 1, 1, this.cellAlpha)
  }

  constructor(scene: Object3D, previewTex: Texture) {
    this.batch = new Batch(groundQuad(), softQuadMaterial(previewTex, false), 64, { tint: true, renderOrder: 2 })
    scene.add(this.batch.mesh)
  }

  /** blockers：挡火的宝箱格（火焰停在其前）；pierce：本机炸弹槽的穿透层数（原型扩展 NON-CONTRACT，ADR 0030）。 */
  update(
    show: boolean,
    terrain: Pick<TerrainView, 'size' | 'ground' | 'brick'>,
    cellX: number,
    cellY: number,
    power: number,
    now: number,
    dt: number,
    blockers?: ReadonlySet<number>,
    pierce = 0,
  ): void {
    this.alpha = Math.max(0, Math.min(1, this.alpha + (show ? dt / 0.15 : -dt / 0.15)))
    this.batch.begin()
    if (this.alpha > 0) {
      if (show) {
        this.cx = cellX
        this.cy = cellY
        computeFireCross(terrain, cellX, cellY, power, this.cross, blockers, pierce)
      }
      const c = this.cross
      this.cellAlpha = this.alpha * (0.42 + 0.08 * Math.sin(now * 0.006))
      forEachCrossCell(this.cx, this.cy, c.up, c.down, c.left, c.right, this.visit)
    }
    this.batch.end()
  }
}
