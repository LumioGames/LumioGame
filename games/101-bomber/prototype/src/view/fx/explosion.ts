import { Color, IcosahedronGeometry, type Object3D } from 'three'
import { Batch, M, trs } from '../batch'
import { CELL_GROW_MS } from '../logic/chain-stagger'
import type { SharedMaterials } from '../materials'
import type { GroundMarks } from '../world/ground-marks'

/**
 * 爆炸十字（按 Reach* 画）：每格两团蓬松火球（核心黄白 + 外圈橘），由中心向外每格晚 12 ms 长出，
 * 60 ms 长满；地面加色辉光覆盖整个危险窗；危险窗结束后 100 ms 缩没。
 * 原型扩展（NON-CONTRACT，ADR 0030）：冰冻弹 / 冰川弹换成冰霜配色（白芯、冰蓝、青边、青色地面光）。
 */
interface Blast {
  cx: number
  cy: number
  up: number
  down: number
  left: number
  right: number
  start: number
  durMs: number
  seed: number
  frost: boolean
}

interface Palette {
  core: Color
  hot: Color
  rim: Color
  glow: Color
}

const GROW_MS = 60
const FADE_MS = 100
const FLASH_MS = 130
const DIRS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

export class ExplosionFx {
  private readonly puffs: Batch
  private readonly blasts: Blast[] = []
  private readonly c = new Color()
  private readonly white = new Color(0xffffff)
  private readonly fire: Palette = { core: new Color(0xfff3b0), hot: new Color(0xffc93c), rim: new Color(0xff7a3d), glow: new Color(0xff9a3d) }
  private readonly ice: Palette = { core: new Color(0xe8fbff), hot: new Color(0x9fe3ff), rim: new Color(0x3db8da), glow: new Color(0x5fd4ff) }

  constructor(scene: Object3D, mats: SharedMaterials) {
    this.puffs = new Batch(new IcosahedronGeometry(0.5, 1), mats.flame, 640, { color: true })
    scene.add(this.puffs.mesh)
  }

  /** @param frost 冰冻弹 / 冰川弹：冰霜配色。 */
  start(cx: number, cy: number, up: number, down: number, left: number, right: number, startAt: number, durMs: number, seed: number, frost = false): void {
    if (this.blasts.length >= 96) this.blasts.shift()
    this.blasts.push({ cx, cy, up, down, left, right, start: startAt, durMs, seed, frost })
  }

  clear(): void {
    this.blasts.length = 0
  }

  get active(): number {
    return this.blasts.length
  }

  update(now: number, marks: GroundMarks): void {
    this.puffs.begin()
    let keep = 0
    for (let bi = 0; bi < this.blasts.length; bi++) {
      const b = this.blasts[bi]
      const age = now - b.start
      if (age > b.durMs + FADE_MS) continue
      this.blasts[keep++] = b
      if (age < 0) continue
      const fade = age > b.durMs ? 1 - (age - b.durMs) / FADE_MS : 1
      this.cell(b, b.cx, b.cy, 0, 0, 0, age, fade, now, false, marks)
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d]
        const reach = d === 0 ? b.up : d === 1 ? b.down : d === 2 ? b.left : b.right
        for (let k = 1; k <= reach; k++) this.cell(b, b.cx + dx * k, b.cy + dy * k, k, dx, dy, age, fade, now, k === reach, marks)
      }
      if (age < FLASH_MS) {
        const u = age / FLASH_MS
        const i = this.puffs.push(trs(M, b.cx + 0.5, 0.45, b.cy + 0.5, 0, 0, 0, 1.3 * (0.6 + u), 1.1 * (0.6 + u), 1.3 * (0.6 + u)))
        this.puffs.color(i, this.c.copy(this.white).multiplyScalar(1.6 - u))
      }
    }
    this.blasts.length = keep
    this.puffs.end()
  }

  private cell(b: Blast, x: number, y: number, dist: number, dx: number, dy: number, age: number, fade: number, now: number, tip: boolean, marks: GroundMarks): void {
    const t = age - dist * CELL_GROW_MS
    if (t < 0) return
    const u = Math.min(1, t / GROW_MS)
    // easeOutBack 的轻微过冲，火球「噗」地鼓出来
    const grow = 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2)
    const s = Math.max(0, grow * fade * (tip ? 0.82 : 1))
    if (s <= 0.001) return
    const wob = Math.sin(now * 0.03 + dist * 1.7 + b.seed) * 0.08
    const px = x + 0.5
    const pz = y + 0.5
    const along = dx !== 0 ? 1.18 : 1
    const acrossZ = dy !== 0 ? 1.18 : 1
    const pal = b.frost ? this.ice : this.fire
    // 核心
    let i = this.puffs.push(trs(M, px, 0.4 + wob * 0.5, pz, 0, now * 0.002 + dist, 0, 0.62 * s * along * (1 + wob), 0.58 * s, 0.62 * s * acrossZ * (1 + wob)))
    this.puffs.color(i, dist === 0 ? pal.core : this.c.copy(pal.hot).lerp(pal.core, 0.35 + wob))
    // 外圈（稍大、稍低、偏移）
    const jx = Math.sin(b.seed + dist * 2.3) * 0.08
    const jz = Math.cos(b.seed + dist * 1.9) * 0.08
    i = this.puffs.push(trs(M, px + jx, 0.3, pz + jz, 0.4, dist * 0.9 + b.seed, 0, 0.86 * s * along, 0.62 * s, 0.86 * s * acrossZ))
    this.puffs.color(i, pal.rim)
    const g = 0.45 * fade * Math.min(1, t / GROW_MS)
    marks.glowAt(px, pz, 1.35, pal.glow.r * 1.4, pal.glow.g * 1.4, pal.glow.b * 1.4, g)
  }
}
