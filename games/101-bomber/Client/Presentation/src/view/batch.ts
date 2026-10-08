import {
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'

/**
 * 立即模式的实例批：每帧 begin → push… → end，按当前状态整批重写实例矩阵。
 * 这个原型的实体量级（几十到几百）下，比逐槽位簿记更简单也足够快。
 * 预分配容量，热路径不分配。
 */
export interface BatchOptions {
  /** 每实例 vec4 `aTint`（给自定义 ShaderMaterial 用）。 */
  tint?: boolean
  /** 每实例颜色（`instanceColor`，给内建材质用）。 */
  color?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
  renderOrder?: number
}

export class Batch {
  readonly mesh: InstancedMesh
  readonly capacity: number
  private readonly tintAttr: InstancedBufferAttribute | null
  private n = 0

  constructor(geometry: BufferGeometry, material: Material, capacity: number, opts: BatchOptions = {}) {
    const geo = opts.tint ? geometry.clone() : geometry
    this.capacity = capacity
    this.tintAttr = null
    if (opts.tint) {
      this.tintAttr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
      geo.setAttribute('aTint', this.tintAttr)
    }
    this.mesh = new InstancedMesh(geo, material, capacity)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = !!opts.castShadow
    this.mesh.receiveShadow = !!opts.receiveShadow
    if (opts.renderOrder !== undefined) this.mesh.renderOrder = opts.renderOrder
    if (opts.color) {
      // 先建好 instanceColor，程序只编译一次（否则首次 setColorAt 会触发重编译）。
      for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, WHITE)
    }
    this.mesh.count = 0
  }

  begin(): void {
    this.n = 0
  }

  get count(): number {
    return this.n
  }

  /** 推一个实例；满了返回 −1（静默丢弃，表现层宁可少画不崩）。 */
  push(m: Matrix4): number {
    if (this.n >= this.capacity) return -1
    this.mesh.setMatrixAt(this.n, m)
    return this.n++
  }

  tint(i: number, r: number, g: number, b: number, a: number): void {
    if (i < 0 || !this.tintAttr) return
    const arr = this.tintAttr.array as Float32Array
    const o = i * 4
    arr[o] = r
    arr[o + 1] = g
    arr[o + 2] = b
    arr[o + 3] = a
  }

  color(i: number, c: Color): void {
    if (i < 0) return
    this.mesh.setColorAt(i, c)
  }

  end(): void {
    this.mesh.count = this.n
    this.mesh.visible = this.n > 0
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    if (this.tintAttr) this.tintAttr.needsUpdate = true
  }
}

const WHITE = new Color(1, 1, 1)

// ---- 变换拼装的共享暂存（单线程，调用方立刻用完） ----
const _p = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _e = new Euler()

export const M = new Matrix4()

/** 平移 + 欧拉旋转（XYZ）+ 缩放 → m。 */
export function trs(
  m: Matrix4,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
): Matrix4 {
  _e.set(rx, ry, rz, 'YXZ')
  _q.setFromEuler(_e)
  return m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
}

/** 平移 + 给定四元数 + 缩放 → m。 */
export function tqs(m: Matrix4, x: number, y: number, z: number, q: Quaternion, sx: number, sy: number, sz: number): Matrix4 {
  return m.compose(_p.set(x, y, z), q, _s.set(sx, sy, sz))
}

/** 线性空间 RGB 暂存（Color.setHex 会做 sRGB → 线性）。 */
export function linear(hex: number, out: Color = new Color()): Color {
  return out.setHex(hex)
}
