import { Color, IcosahedronGeometry, MeshStandardMaterial, type Object3D } from 'three'
import { Batch, M, trs } from '../batch'
import { arcGeometry } from '../geo/skill'
import { BLAST_FADE_MS, BOMB_TONE, blastLifeMs, lingerSmoke, shockSparks, type BombTone } from '../logic/bomb-look'
import { CELL_GROW_MS } from '../logic/chain-stagger'
import type { SharedMaterials } from '../materials'
import type { GroundMarks } from '../world/ground-marks'

/**
 * 爆炸十字（按 Reach* 画）：每格两团蓬松火球（核心黄白 + 外圈橘），由中心向外每格晚 12 ms 长出，
 * 60 ms 长满；地面加色辉光覆盖整个危险窗；危险窗结束后 100 ms 缩没。
 * 原型扩展（NON-CONTRACT，ADR 0030）：冰冻弹 / 冰川弹换成冰霜配色（白芯、冰蓝、青边、青色地面光）。
 * 原型扩展（NON-CONTRACT，ADR 0033）：调色按 logic/bomb-look 的色调——
 *   - 中毒弹：毒绿烟团，危险窗结束后每格留一团绿烟再慢慢升起、淡出（lingerMs）；
 *   - 麻痹弹：电黄火团 + 每格几段跳动的电火花（小段换位，不整片频闪）。
 * 非橙火色调画在不带橙色自发光的材质上（火焰材质的橙色自发光会把冰蓝 / 毒绿染脏）。
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
  tone: BombTone
}

interface Palette {
  core: Color
  hot: Color
  rim: Color
  glow: Color
  smoke: Color
}

const GROW_MS = 60
const FLASH_MS = 130
const DIRS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

function palette(t: BombTone): Palette {
  const p = BOMB_TONE[t]
  return { core: new Color(p.core), hot: new Color(p.hot), rim: new Color(p.rim), glow: new Color(p.glow), smoke: new Color(p.smoke) }
}

export class ExplosionFx {
  /** 橙火（火焰材质，自带橙色自发光）。 */
  private readonly puffs: Batch
  /** 冰霜 / 毒绿 / 电黄（中性自发光，颜色全由实例色给）。 */
  private readonly tinted: Batch
  /** 麻痹弹的电火花（叠加辉光）。 */
  private readonly sparks: Batch
  private readonly blasts: Blast[] = []
  private readonly c = new Color()
  private readonly white = new Color(0xffffff)
  private readonly pal: Readonly<Record<BombTone, Palette>> = {
    fire: palette('fire'),
    frost: palette('frost'),
    toxin: palette('toxin'),
    shock: palette('shock'),
  }

  constructor(scene: Object3D, mats: SharedMaterials) {
    const puff = new IcosahedronGeometry(0.5, 1)
    this.puffs = new Batch(puff, mats.flame, 640, { color: true })
    this.tinted = new Batch(
      puff,
      new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, emissive: new Color(0x8a8a8a), emissiveIntensity: 0.55 }),
      640,
      { color: true },
    )
    this.sparks = new Batch(arcGeometry(), mats.glowAdd, 256, { color: true, renderOrder: 5 })
    scene.add(this.puffs.mesh, this.tinted.mesh, this.sparks.mesh)
  }

  /** @param tone 色调（logic/bomb-look.bombTone(BombKind)）；缺省橙火。 */
  start(cx: number, cy: number, up: number, down: number, left: number, right: number, startAt: number, durMs: number, seed: number, tone: BombTone = 'fire'): void {
    if (this.blasts.length >= 96) this.blasts.shift()
    this.blasts.push({ cx, cy, up, down, left, right, start: startAt, durMs, seed, tone })
  }

  clear(): void {
    this.blasts.length = 0
  }

  get active(): number {
    return this.blasts.length
  }

  update(now: number, marks: GroundMarks): void {
    this.puffs.begin()
    this.tinted.begin()
    this.sparks.begin()
    let keep = 0
    for (let bi = 0; bi < this.blasts.length; bi++) {
      const b = this.blasts[bi]
      const age = now - b.start
      if (age > blastLifeMs(b.tone, b.durMs)) continue
      this.blasts[keep++] = b
      if (age < 0) continue
      const batch = b.tone === 'fire' ? this.puffs : this.tinted
      const after = age - b.durMs - BLAST_FADE_MS
      if (after >= 0) {
        // 缩没之后：只剩中毒余烟。
        this.smoke(b, batch, after)
        continue
      }
      const fade = age > b.durMs ? 1 - (age - b.durMs) / BLAST_FADE_MS : 1
      this.cell(b, batch, b.cx, b.cy, 0, 0, 0, age, fade, now, false, marks)
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d]
        const reach = d === 0 ? b.up : d === 1 ? b.down : d === 2 ? b.left : b.right
        for (let k = 1; k <= reach; k++) this.cell(b, batch, b.cx + dx * k, b.cy + dy * k, k, dx, dy, age, fade, now, k === reach, marks)
      }
      if (age < FLASH_MS) {
        const u = age / FLASH_MS
        const i = batch.push(trs(M, b.cx + 0.5, 0.45, b.cy + 0.5, 0, 0, 0, 1.3 * (0.6 + u), 1.1 * (0.6 + u), 1.3 * (0.6 + u)))
        batch.color(i, this.c.copy(b.tone === 'fire' ? this.white : this.pal[b.tone].core).multiplyScalar(1.6 - u))
      }
    }
    this.blasts.length = keep
    this.puffs.end()
    this.tinted.end()
    this.sparks.end()
  }

  private cell(b: Blast, batch: Batch, x: number, y: number, dist: number, dx: number, dy: number, age: number, fade: number, now: number, tip: boolean, marks: GroundMarks): void {
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
    const pal = this.pal[b.tone]
    // 中毒弹更「烟」：团更圆更矮、慢慢翻滚。
    const smoky = b.tone === 'toxin' ? 1 : 0
    // 核心
    let i = batch.push(
      trs(M, px, 0.4 + wob * 0.5 - 0.05 * smoky, pz, 0, now * (0.002 - 0.001 * smoky) + dist, 0, 0.62 * s * along * (1 + wob), 0.58 * s * (1 - 0.1 * smoky), 0.62 * s * acrossZ * (1 + wob)),
    )
    batch.color(i, dist === 0 ? pal.core : this.c.copy(pal.hot).lerp(pal.core, 0.35 + wob))
    // 外圈（稍大、稍低、偏移）
    const jx = Math.sin(b.seed + dist * 2.3) * 0.08
    const jz = Math.cos(b.seed + dist * 1.9) * 0.08
    i = batch.push(trs(M, px + jx, 0.3, pz + jz, 0.4, dist * 0.9 + b.seed, 0, 0.86 * s * along * (1 + 0.1 * smoky), 0.62 * s, 0.86 * s * acrossZ * (1 + 0.1 * smoky)))
    batch.color(i, pal.rim)
    const g = 0.45 * fade * Math.min(1, t / GROW_MS)
    marks.glowAt(px, pz, 1.35, pal.glow.r * 1.4, pal.glow.g * 1.4, pal.glow.b * 1.4, g)
    const n = BOMB_TONE[b.tone].sparksPerCell
    if (n > 0 && fade > 0.2) {
      for (const sp of shockSparks(x, y, b.seed, now, n)) {
        const si = this.sparks.push(trs(M, px + sp.dx, sp.y, pz + sp.dz, 0, sp.yaw, sp.tilt, sp.len * s, 1.2, 1.2))
        this.sparks.color(si, this.c.setRGB(1.7 * fade, 1.55 * fade, 0.5 * fade))
      }
    }
  }

  /** 中毒余烟：危险窗结束后每格一团绿烟，慢慢升起、胀大、淡出（颜色压暗代替透明）。 */
  private smoke(b: Blast, batch: Batch, after: number): void {
    const L = BOMB_TONE[b.tone].lingerMs
    const pal = this.pal[b.tone]
    const one = (x: number, y: number, dist: number): void => {
      // 每格错开一点，免得整片一起升。
      const sm = lingerSmoke(after - dist * CELL_GROW_MS, L)
      if (sm.alpha <= 0) return
      const jx = Math.sin(b.seed + dist * 2.3 + x) * 0.1
      const jz = Math.cos(b.seed + dist * 1.9 + y) * 0.1
      const s = 0.62 * sm.scale * (0.35 + 0.65 * sm.alpha)
      this.c.copy(pal.smoke).multiplyScalar(0.55 + 0.45 * sm.alpha)
      // 一大一小两团，小团更高、偏一点：像一朵慢慢散开的毒云，而不是一块圆饼。
      let i = batch.push(trs(M, x + 0.5 + jx, 0.3 + sm.rise, y + 0.5 + jz, 0, b.seed + dist + after * 0.001, 0, s, s * 0.85, s))
      batch.color(i, this.c)
      i = batch.push(trs(M, x + 0.5 - jx * 1.8, 0.45 + sm.rise * 1.25, y + 0.5 - jz * 1.8 + 0.08, 0.3, b.seed - dist, 0, s * 0.6, s * 0.55, s * 0.6))
      batch.color(i, this.c.multiplyScalar(1.12))
    }
    one(b.cx, b.cy, 0)
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d]
      const reach = d === 0 ? b.up : d === 1 ? b.down : d === 2 ? b.left : b.right
      for (let k = 1; k <= reach; k++) one(b.cx + dx * k, b.cy + dy * k, k)
    }
  }
}
