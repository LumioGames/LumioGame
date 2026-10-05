import { Color, type BufferGeometry, type Material } from 'three'
import { Batch, M, trs } from '../batch'

/**
 * CPU 粒子池（结构数组，预分配）：积木碎片、木屑、棉花团、玩偶零件以外的一切小东西。
 * 支持重力、空气阻力、落地一次弹跳（恢复系数）后摩擦停住、末段缩小淡出（实例材质没有逐实例透明度，用缩放代替）。
 */
export interface ParticleSpawn {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** 基础尺寸（几何按单位尺寸建）。 */
  size: number
  /** 非等比缩放（碎木条等），默认 1。 */
  sx?: number
  sy?: number
  sz?: number
  lifeMs: number
  color: number
  gravity?: number
  drag?: number
  restitution?: number
  spin?: number
  /** 出生后多久开始长大到全尺寸（棉花团「噗」一下）。 */
  growMs?: number
}

export class ParticlePool {
  readonly batch: Batch
  private readonly cap: number
  private n = 0
  private overwrite = 0
  private readonly f: Float32Array
  private static readonly STRIDE = 24
  private readonly c = new Color()
  /** 地面高度（默认 0）；领奖台彩纸落在台面上用。 */
  floorAt: ((x: number, z: number) => number) | null = null

  constructor(geometry: BufferGeometry, material: Material, capacity: number, castShadow = false) {
    this.cap = capacity
    this.batch = new Batch(geometry, material, capacity, { color: true, castShadow })
    this.f = new Float32Array(capacity * ParticlePool.STRIDE)
  }

  get live(): number {
    return this.n
  }

  spawn(p: ParticleSpawn): void {
    let i: number
    if (this.n < this.cap) i = this.n++
    else i = this.overwrite = (this.overwrite + 1) % this.cap // 满了就轮流覆盖旧的
    const o = i * ParticlePool.STRIDE
    const f = this.f
    f[o] = p.x
    f[o + 1] = p.y
    f[o + 2] = p.z
    f[o + 3] = p.vx
    f[o + 4] = p.vy
    f[o + 5] = p.vz
    f[o + 6] = p.size
    f[o + 7] = p.sx ?? 1
    f[o + 8] = p.sy ?? 1
    f[o + 9] = p.sz ?? 1
    f[o + 10] = 0 // age
    f[o + 11] = p.lifeMs
    this.c.setHex(p.color)
    f[o + 12] = this.c.r
    f[o + 13] = this.c.g
    f[o + 14] = this.c.b
    f[o + 15] = p.gravity ?? -18
    f[o + 16] = p.drag ?? 0
    f[o + 17] = p.restitution ?? 0.35
    f[o + 18] = 0 // bounced
    f[o + 19] = (p.spin ?? 8) * ((p.vx + p.vz) >= 0 ? 1 : -1)
    f[o + 20] = p.growMs ?? 0
    f[o + 21] = (p.x * 3.1 + p.z * 1.7) % 6.283 // rot seed
    f[o + 22] = 0
    f[o + 23] = 0
  }

  clear(): void {
    this.n = 0
  }

  update(dtMs: number): void {
    const f = this.f
    const S = ParticlePool.STRIDE
    const dt = dtMs / 1000
    let i = 0
    while (i < this.n) {
      const o = i * S
      f[o + 10] += dtMs
      if (f[o + 10] >= f[o + 11]) {
        // 与末尾交换删除
        const last = (this.n - 1) * S
        if (last !== o) f.copyWithin(o, last, last + S)
        this.n--
        continue
      }
      if (dt > 0) {
        const drag = f[o + 16]
        if (drag > 0) {
          const k = Math.exp(-drag * dt)
          f[o + 3] *= k
          f[o + 4] *= k
          f[o + 5] *= k
        }
        f[o + 4] += f[o + 15] * dt
        f[o + 0] += f[o + 3] * dt
        f[o + 1] += f[o + 4] * dt
        f[o + 2] += f[o + 5] * dt
        const floor = f[o + 6] * f[o + 8] * 0.5 + (this.floorAt ? this.floorAt(f[o], f[o + 2]) : 0)
        if (f[o + 1] < floor) {
          f[o + 1] = floor
          if (f[o + 4] < 0) {
            if (f[o + 18] === 0 && f[o + 17] > 0) {
              f[o + 4] = -f[o + 4] * f[o + 17]
              f[o + 3] *= 0.6
              f[o + 5] *= 0.6
              f[o + 18] = 1
            } else {
              f[o + 4] = 0
              f[o + 3] *= 0.8
              f[o + 5] *= 0.8
              f[o + 19] *= 0.8
            }
          }
        }
        f[o + 21] += f[o + 19] * dt
      }
      i++
    }
  }

  /** 写实例矩阵；调用前后由外部 begin/end 之外单独完成，这里自带 begin/end。 */
  render(): void {
    const b = this.batch
    const f = this.f
    const S = ParticlePool.STRIDE
    b.begin()
    for (let i = 0; i < this.n; i++) {
      const o = i * S
      const age = f[o + 10]
      const life = f[o + 11]
      const t = age / life
      const grow = f[o + 20] > 0 ? Math.min(1, age / f[o + 20]) : 1
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
      const s = f[o + 6] * fade * (0.35 + 0.65 * grow)
      const r = f[o + 21]
      const idx = b.push(trs(M, f[o], f[o + 1], f[o + 2], r * 0.7, r, r * 0.5, s * f[o + 7], s * f[o + 8], s * f[o + 9]))
      if (idx >= 0) {
        this.c.setRGB(f[o + 12], f[o + 13], f[o + 14])
        b.color(idx, this.c)
      }
    }
    b.end()
  }
}
