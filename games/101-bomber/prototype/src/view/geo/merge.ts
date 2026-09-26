import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

/**
 * 顶点色合批：把一件物体的多个零件（各自一种颜色、各自一个变换）并成一个几何体，
 * 一件物体 = 一次 draw call。只保留 position / normal / color。
 */
export type ColorFn = (nx: number, ny: number, nz: number, px: number, py: number, pz: number) => number

const _q = new Quaternion()
const _e = new Euler()

/** 构建期的矩阵便捷函数（会分配，只在构建时用）。 */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  _e.set(rx, ry, rz, 'YXZ')
  _q.setFromEuler(_e)
  return new Matrix4().compose(new Vector3(x, y, z), _q.clone(), new Vector3(sx, sy, sz))
}

export class GeoBuilder {
  private readonly parts: { pos: Float32Array; nrm: Float32Array; col: Float32Array }[] = []
  private readonly c = new Color()

  /** 加一个零件；geo 会被消费（dispose）。color 可为按法线 / 位置取色的函数（在变换后的空间里求值）。 */
  add(geo: BufferGeometry, color: number | ColorFn, m?: Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (m) g.applyMatrix4(m)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const pos = g.getAttribute('position') as BufferAttribute
    const nrm = g.getAttribute('normal') as BufferAttribute
    const n = pos.count
    const p = new Float32Array(n * 3)
    const nn = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const px = pos.getX(i)
      const py = pos.getY(i)
      const pz = pos.getZ(i)
      const nx = nrm.getX(i)
      const ny = nrm.getY(i)
      const nz = nrm.getZ(i)
      p[i * 3] = px
      p[i * 3 + 1] = py
      p[i * 3 + 2] = pz
      nn[i * 3] = nx
      nn[i * 3 + 1] = ny
      nn[i * 3 + 2] = nz
      const hex = typeof color === 'number' ? color : color(nx, ny, nz, px, py, pz)
      this.c.setHex(hex)
      col[i * 3] = this.c.r
      col[i * 3 + 1] = this.c.g
      col[i * 3 + 2] = this.c.b
    }
    this.parts.push({ pos: p, nrm: nn, col })
    if (g !== geo) g.dispose()
    geo.dispose()
    return this
  }

  /** 把另一个 builder 的零件整体变换后并进来。 */
  addBuilder(other: GeoBuilder, m: Matrix4): this {
    const nm = new Matrix4().copy(m).invert().transpose()
    const v = new Vector3()
    for (const part of other.parts) {
      const pos = part.pos.slice()
      const nrm = part.nrm.slice()
      for (let i = 0; i < pos.length; i += 3) {
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m)
        pos[i] = v.x
        pos[i + 1] = v.y
        pos[i + 2] = v.z
        v.set(nrm[i], nrm[i + 1], nrm[i + 2]).applyMatrix4(nm).normalize()
        nrm[i] = v.x
        nrm[i + 1] = v.y
        nrm[i + 2] = v.z
      }
      this.parts.push({ pos, nrm, col: part.col.slice() })
    }
    return this
  }

  get empty(): boolean {
    return this.parts.length === 0
  }

  build(): BufferGeometry {
    let total = 0
    for (const p of this.parts) total += p.pos.length
    const pos = new Float32Array(total)
    const nrm = new Float32Array(total)
    const col = new Float32Array(total)
    let o = 0
    for (const p of this.parts) {
      pos.set(p.pos, o)
      nrm.set(p.nrm, o)
      col.set(p.col, o)
      o += p.pos.length
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('normal', new BufferAttribute(nrm, 3))
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

