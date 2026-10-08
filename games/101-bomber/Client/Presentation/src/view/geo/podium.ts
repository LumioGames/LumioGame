import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PODIUM } from '../logic/podium'
import { CREAM, INK, LEAF, SKY, SOFT_BLOCK_COLORS, SUNSHINE, TANGERINE, shade } from '../palette'
import { GeoBuilder, mat } from './merge'

/**
 * 领奖台（design §13）：积木搭成的舞台 + 三级台阶（金 1 / 蓝 2 / 橙 3，正面是积木拼出的立体数字，不只靠颜色）
 * + 红地毯 + 四角礼花筒 + 背后一串三角彩旗。原点 = 舞台中心地面，+Z 朝镜头。整台合成一个几何（1 次 draw call）。
 */

const STEP_COLORS = [SUNSHINE, SKY, TANGERINE] as const
const CARPET = 0xe0435a
const PENNANTS = [SUNSHINE, TANGERINE, SKY, LEAF, 0xff6fa8, 0xb57bff]

/**
 * 七段式积木数字（段 a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中）。
 * 只需要 1 / 2 / 3；「1」额外带一个左上小旗和底座，读起来更像印刷体。
 */
const SEGMENTS: Record<number, readonly string[]> = {
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
}

function digit(b: GeoBuilder, n: number, cx: number, cy: number, z: number, h: number): void {
  const w = h * 0.58
  const t = h * 0.2
  const half = h / 2
  const seg = (name: string): [number, number, number, number] => {
    // [x, y, sx, sy]（相对数字中心）
    switch (name) {
      case 'a':
        return [0, half - t / 2, w, t]
      case 'd':
        return [0, -half + t / 2, w, t]
      case 'g':
        return [0, 0, w, t]
      case 'b':
        return [w / 2 - t / 2, h / 4, t, half + t / 2]
      case 'c':
        return [w / 2 - t / 2, -h / 4, t, half + t / 2]
      case 'e':
        return [-w / 2 + t / 2, -h / 4, t, half + t / 2]
      default:
        return [-w / 2 + t / 2, h / 4, t, half + t / 2]
    }
  }
  const parts: [number, number, number, number][] = SEGMENTS[n].map(seg)
  if (n === 1) {
    // 「1」居中：整体往左挪到中线，再加小旗与底座。
    for (const p of parts) p[0] -= w / 2 - t / 2
    parts.push([-t * 0.9, half - t * 0.9, t * 1.1, t * 0.7])
    parts.push([0, -half + t * 0.35, t * 2.6, t * 0.7])
  }
  for (const [x, y, sx, sy] of parts) {
    // 深色描边垫底 + 奶油色积木段
    b.add(new RoundedBoxGeometry(sx + 0.05, sy + 0.05, 0.05, 2, 0.02), INK, mat(cx + x, cy + y, z + 0.02))
    b.add(new RoundedBoxGeometry(sx, sy, 0.09, 2, Math.min(sx, sy) * 0.3), 0xfff8ec, mat(cx + x, cy + y, z + 0.06))
  }
}

function studs(b: GeoBuilder, cx: number, y: number, cz: number, nx: number, nz: number, pitch: number, color: number): void {
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = cx + (i - (nx - 1) / 2) * pitch
      const z = cz + (k - (nz - 1) / 2) * pitch
      b.add(new CylinderGeometry(0.11, 0.11, 0.07, 14), color, mat(x, y + 0.035, z))
    }
  }
}

/** 四角礼花筒（舞台中心坐标）：位置、朝向（绕 Y）与筒口；彩纸从筒口喷出。 */
export const POPPER_TILT = 0.5
export const POPPER_LEN = 0.7
export const POPPERS: readonly { x: number; z: number; ry: number }[] = [
  { x: -PODIUM.stageWidth / 2 + 0.35, z: PODIUM.stageDepth / 2 - 0.4, ry: Math.PI * 0.8 },
  { x: PODIUM.stageWidth / 2 - 0.35, z: PODIUM.stageDepth / 2 - 0.4, ry: -Math.PI * 0.8 },
  { x: -PODIUM.stageWidth / 2 + 0.35, z: -PODIUM.stageDepth / 2 + 0.4, ry: Math.PI * 0.25 },
  { x: PODIUM.stageWidth / 2 - 0.35, z: -PODIUM.stageDepth / 2 + 0.4, ry: -Math.PI * 0.25 },
]

function popper(b: GeoBuilder, x: number, y: number, z: number, ry: number): void {
  // 礼花筒：条纹圆锥 + 金色筒口 + 飘出的几条纸带，朝舞台中心斜向上。
  const local = new GeoBuilder()
  local.add(new ConeGeometry(0.2, 0.62, 16, 1, true), (_nx, _ny, _nz, _px, py) => (Math.floor((py + 0.31) * 9) % 2 === 0 ? 0xff6fa8 : CREAM), mat(0, 0.31, 0, Math.PI, 0, 0))
  local.add(new CylinderGeometry(0.21, 0.21, 0.06, 16, 1, true), SUNSHINE, mat(0, 0.62, 0))
  local.add(new SphereGeometry(0.05, 8, 6), SUNSHINE, mat(0, 0, 0))
  for (let i = 0; i < 3; i++) local.add(new BoxGeometry(0.03, 0.3, 0.012), [SKY, LEAF, TANGERINE][i], mat(-0.08 + i * 0.08, 0.78, 0, 0, 0, (i - 1) * 0.5))
  b.addBuilder(local, mat(x, y, z, 0, ry, 0).multiply(mat(0, 0, 0, POPPER_TILT, 0, 0)))
}

export function podiumGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const W = PODIUM.stageWidth
  const D = PODIUM.stageDepth
  const top = PODIUM.stageTop
  // 舞台：奶油色台体 + 正面 / 侧面一圈彩色积木砖 + 台沿一排凸点
  b.add(new RoundedBoxGeometry(W, top, D, 3, 0.1), (_nx, ny) => (ny > 0.6 ? 0xf6ead3 : 0xe9d8b8), mat(0, top / 2, 0))
  const cols = 8
  const bw = W / cols
  for (let i = 0; i < cols; i++) {
    const x = -W / 2 + bw * (i + 0.5)
    b.add(new RoundedBoxGeometry(bw - 0.06, top - 0.16, 0.14, 2, 0.05), SOFT_BLOCK_COLORS[i % 4], mat(x, top / 2, D / 2 + 0.03))
  }
  const rows = 5
  const bd = D / rows
  for (const sx of [-1, 1]) {
    for (let k = 0; k < rows; k++) {
      const z = -D / 2 + bd * (k + 0.5)
      b.add(new RoundedBoxGeometry(0.14, top - 0.16, bd - 0.06, 2, 0.05), SOFT_BLOCK_COLORS[(k + (sx > 0 ? 2 : 0)) % 4], mat(sx * (W / 2 + 0.03), top / 2, z))
    }
  }
  studs(b, 0, top, D / 2 - 0.22, 14, 1, 0.52, 0xfbf1dd)
  // 红地毯：从台前一直铺到冠军台阶脚下
  const carpetLen = D / 2 - (PODIUM.stepZ + PODIUM.stepDepth / 2) - 0.1
  const carpetZ = D / 2 - 0.1 - carpetLen / 2
  b.add(new BoxGeometry(1.3, 0.03, carpetLen), CARPET, mat(0, top + 0.015, carpetZ))
  for (const sx of [-1, 1]) b.add(new BoxGeometry(0.06, 0.035, carpetLen), SUNSHINE, mat(sx * 0.62, top + 0.018, carpetZ))
  // 三级台阶
  for (let i = 0; i < 3; i++) {
    const s = PODIUM.steps[i]
    const c = STEP_COLORS[i]
    const w = PODIUM.stepWidth
    const d = PODIUM.stepDepth
    b.add(new RoundedBoxGeometry(w, s.h, d, 3, 0.07), (_nx, ny) => (ny > 0.6 ? shade(c, 1.08) : c), mat(s.dx, top + s.h / 2, PODIUM.stepZ))
    // 顶沿白色饰条 + 顶面四角凸点
    b.add(new BoxGeometry(w + 0.02, 0.07, d + 0.02), 0xfff8ec, mat(s.dx, top + s.h - 0.1, PODIUM.stepZ))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new CylinderGeometry(0.1, 0.1, 0.07, 14), shade(c, 1.12), mat(s.dx + sx * 0.55, top + s.h + 0.035, PODIUM.stepZ + sz * 0.52))
    const dh = Math.min(0.62, s.h * 0.62)
    digit(b, i + 1, s.dx, top + (s.h - 0.1) / 2, PODIUM.stepZ + d / 2, dh)
  }
  // 四角礼花筒
  for (const p of POPPERS) popper(b, p.x, top, p.z, p.ry)
  // 背后彩旗：两根旗杆 + 下垂的三角旗串
  const poleH = 3.4
  const px = W / 2 - 0.2
  const pz = -D / 2 + 0.15
  for (const sx of [-1, 1]) {
    b.add(new CylinderGeometry(0.06, 0.07, poleH, 10), 0xfff8ec, mat(sx * px, top + poleH / 2, pz))
    b.add(new SphereGeometry(0.12, 12, 8), SUNSHINE, mat(sx * px, top + poleH + 0.08, pz))
  }
  const flags = 17
  for (let i = 0; i < flags; i++) {
    const u = (i + 0.5) / flags
    const x = -px + 2 * px * u
    const sag = 0.7 * (1 - Math.pow(2 * u - 1, 2))
    const y = top + poleH - 0.1 - sag
    b.add(new ConeGeometry(0.17, 0.34, 3), PENNANTS[i % PENNANTS.length], mat(x, y - 0.17, pz, 0, 0, Math.PI, 1, 1, 0.25))
  }
  for (let i = 0; i < 24; i++) {
    const u0 = i / 24
    const u1 = (i + 1) / 24
    const x0 = -px + 2 * px * u0
    const x1 = -px + 2 * px * u1
    const y0 = top + poleH - 0.1 - 0.7 * (1 - Math.pow(2 * u0 - 1, 2))
    const y1 = top + poleH - 0.1 - 0.7 * (1 - Math.pow(2 * u1 - 1, 2))
    const len = Math.hypot(x1 - x0, y1 - y0)
    b.add(new BoxGeometry(len, 0.02, 0.02), INK, mat((x0 + x1) / 2, (y0 + y1) / 2, pz, 0, 0, Math.atan2(y1 - y0, x1 - x0)))
  }
  return b.build()
}
