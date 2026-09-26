import { Color, IcosahedronGeometry, type Object3D } from 'three'
import type { FireZoneView } from '../../contract'
import { Batch, M, trs } from '../batch'
import { hash01 } from '../logic/rand'
import { auraFlameOffsets, fireFade, SKILL_FX } from '../logic/skill-fx'
import type { SharedMaterials } from '../materials'
import type { GroundMarks } from './ground-marks'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：会烧人的火（快照 FireZones）。
 *   - 火焰光环：3×3 小火苗跟着**插值后的**熊走（格偏移取自规则层给的格，被砖挡掉的格不画）+ 橙色地圈；
 *   - 火焰冲刺火墙：静止的格，最后 0.4 s 淡出；
 *   - 两者每格都有一片暖色地面辉光。
 * 只读快照，FireZones 缺席 = 没有火。
 */

/** 光环 / 火墙主人此刻的表现位置与逻辑格（runtime 从玩偶与快照给）。 */
export interface FireOwner {
  x: number
  z: number
  cellX: number
  cellY: number
}

const FLAMES_PER_CELL = 2
const FLAME_CAP = 256
const AURA_RING = 0xff7a3d
const FLAME_CORE = 0xffc93c
const FLAME_RIM = 0xff7a3d
const GLOW = { r: 1.4, g: 0.62, b: 0.2 }

export class FireCellLayer {
  private readonly flames: Batch
  private zones: readonly FireZoneView[] = []
  private readonly core = new Color(FLAME_CORE)
  private readonly rim = new Color(FLAME_RIM)

  constructor(parent: Object3D, mats: SharedMaterials) {
    this.flames = new Batch(new IcosahedronGeometry(0.5, 1), mats.flame, FLAME_CAP, { color: true })
    parent.add(this.flames.mesh)
  }

  /** 新快照：换成当前的火（光环在前、火墙在后）。 */
  sync(zones: readonly FireZoneView[]): void {
    this.zones = zones
  }

  clear(): void {
    this.zones = []
  }

  /** 开局前编译着色器用：临时画一团火。 */
  warmup(on: boolean): void {
    this.flames.begin()
    if (on) this.flames.push(trs(M, 0, -10, 0, 0, 0, 0, 0.01, 0.01, 0.01))
    this.flames.end()
  }

  update(now: number, renderTick: number, rate: number, marks: GroundMarks, ownerOf: (id: number) => FireOwner | null): void {
    this.flames.begin()
    const t = now / 1000
    for (const z of this.zones) {
      const fade = fireFade(z.untilTick, renderTick, rate)
      if (fade <= 0) continue
      if (z.source === 'aura') {
        const o = ownerOf(z.owner)
        if (!o) continue
        // 随机量按「相对熊的格偏移」取种子（-1..1 → 0..8），熊走动时每团火苗的抖动 / 大小 / 相位不变，只平移。
        for (const off of auraFlameOffsets(z.cells, { X: o.cellX, Y: o.cellY })) {
          this.cell(o.x + off.dx, o.z + off.dy, (off.dx + 1) * 3 + (off.dy + 1), t, fade, z.owner, marks)
        }
        marks.ring(o.x, o.z, SKILL_FX.auraRingDiameter * (0.97 + 0.03 * Math.sin(t * 6)), AURA_RING, 0.75 * fade)
      } else {
        for (const c of z.cells) this.cell(c.X + 0.5, c.Y + 0.5, c.X * 7 + c.Y * 13, t, fade, z.owner, marks)
      }
    }
    this.flames.end()
  }

  /** 一格火：两团上下跳动的火苗 + 地面辉光。key 是稳定的整数种子（不随世界坐标变），x / z 只管摆放。 */
  private cell(x: number, z: number, key: number, t: number, fade: number, seed: number, marks: GroundMarks): void {
    for (let i = 0; i < FLAMES_PER_CELL; i++) {
      const h = hash01(key + i * 31, seed)
      const ph = t * (5 + h * 3) + h * 6.28
      const lick = 0.5 + 0.5 * Math.sin(ph)
      const s = (i === 0 ? 0.3 + 0.1 * lick : 0.42 + 0.08 * lick) * fade
      const jx = (h - 0.5) * 0.25
      const jz = (hash01(i + 7, seed + key) - 0.5) * 0.25
      const k = this.flames.push(trs(M, x + jx, (i === 0 ? 0.28 : 0.2) + 0.14 * lick, z + jz, 0, ph, 0, s, s * 1.6, s))
      this.flames.color(k, i === 0 ? this.core : this.rim)
    }
    marks.glowAt(x, z, 1.2, GLOW.r, GLOW.g, GLOW.b, 0.55 * fade)
  }
}
