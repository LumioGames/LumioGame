import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CREAM, SUNSHINE, shade } from '../palette'
import { GeoBuilder, mat } from './merge'

/**
 * 决赛圈强力宝箱（design §4.2）：约 1 格的金色玩具宝箱——金色箱体 + 深色包带 + 深色锁扣 + 盖上白色五角星，
 * 靠轮廓（拱形盖 + 星）与木箱 / 积木区分，不只靠金色。箱体原点在格心地面；盖子原点在后上沿铰链。
 */

export const CHEST = {
  width: 0.92,
  depth: 0.74,
  bodyH: 0.5,
  /** 拱形盖半径 = 深度一半。 */
  lidR: 0.37,
} as const

const BAND = 0x6b4420
const LOCK = 0x3a2a1e

function star(r: number, inner: number): Shape {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : inner
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  s.closePath()
  return s
}

export function chestBodyGeometry(): BufferGeometry {
  const { width: w, depth: d, bodyH: h } = CHEST
  const b = new GeoBuilder()
  b.add(new RoundedBoxGeometry(w, h, d, 3, 0.06), (_nx, ny) => (ny > 0.6 ? shade(SUNSHINE, 1.05) : SUNSHINE), mat(0, h / 2, 0))
  // 底座包边 + 两条竖包带
  b.add(new RoundedBoxGeometry(w + 0.04, 0.08, d + 0.04, 2, 0.02), BAND, mat(0, 0.04, 0))
  for (const x of [-0.27, 0.27]) b.add(new BoxGeometry(0.1, h + 0.005, d + 0.025), BAND, mat(x, h / 2, 0))
  // 正面锁扣：深色底板 + 金色锁孔环
  b.add(new RoundedBoxGeometry(0.2, 0.22, 0.06, 2, 0.025), LOCK, mat(0, h - 0.1, d / 2 + 0.01))
  b.add(new CylinderGeometry(0.035, 0.035, 0.02, 12), SUNSHINE, mat(0, h - 0.09, d / 2 + 0.045, Math.PI / 2, 0, 0))
  b.add(new BoxGeometry(0.018, 0.05, 0.02), LOCK, mat(0, h - 0.125, d / 2 + 0.05))
  // 四角铆钉
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(new SphereGeometry(0.03, 8, 6), shade(SUNSHINE, 0.8), mat(sx * (w / 2 - 0.02), 0.13, sz * (d / 2 - 0.02)))
  }
  return b.build()
}

/** 拱形盖（原点 = 后上沿铰链，盖子向 +Z 延伸）。 */
export function chestLidGeometry(): BufferGeometry {
  const { width: w, lidR: r } = CHEST
  const b = new GeoBuilder()
  // θ ∈ [0, π] 的半圆柱绕 Z 转 90° 后拱顶朝上、轴沿 X。
  const dome = new CylinderGeometry(r, r, w, 28, 1, false, 0, Math.PI)
  b.add(dome, (_nx, ny) => (ny > 0.5 ? shade(SUNSHINE, 1.08) : SUNSHINE), mat(0, 0, r, 0, 0, Math.PI / 2))
  for (const x of [-0.27, 0.27]) {
    b.add(new CylinderGeometry(r + 0.012, r + 0.012, 0.1, 28, 1, false, 0, Math.PI), BAND, mat(x, 0, r, 0, 0, Math.PI / 2))
  }
  // 盖正面的白色五角星（外描一圈深色，灰度下也读得出来），贴在拱面 φ ≈ 51° 处、朝外法线方向。
  const ny = 0.62
  const nz = 0.78
  const tilt = -Math.asin(ny)
  const at = (lift: number) => mat(0, r * ny + ny * lift, r + r * nz + nz * lift, tilt, 0, 0)
  b.add(new ExtrudeGeometry(star(0.15, 0.065), { depth: 0.02, bevelEnabled: false }), LOCK, at(-0.004))
  b.add(
    new ExtrudeGeometry(star(0.12, 0.052), { depth: 0.024, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 }),
    CREAM,
    at(0.006),
  )
  return b.build()
}
