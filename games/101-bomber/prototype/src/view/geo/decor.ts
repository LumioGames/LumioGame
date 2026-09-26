import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mulberry32 } from '../logic/rand'
import { INK, shade } from '../palette'
import { GeoBuilder, mat } from './merge'

/**
 * 棋盘外的玩具小镇（纯表现，世界观「桌面世界」）：积木小屋、圆球树、灌木、巨型骰子与蜡笔做尺度参照。
 * 全部按种子摆放、合成一份几何，镜头一侧（游戏 +Y，three +Z）只放低矮物（≤ 0.6）。
 */

function house(b: GeoBuilder, x: number, z: number, rot: number, roof: number, scale: number): void {
  const w = 2.2 * scale
  const d = 1.9 * scale
  const h = 1.6 * scale
  const local = new GeoBuilder()
  local.add(new RoundedBoxGeometry(w, h, d, 2, 0.08), 0xfbeed6, mat(0, h / 2, 0))
  // 底座石沿
  local.add(new BoxGeometry(w + 0.12, 0.18, d + 0.12), 0xe0c9a4, mat(0, 0.09, 0))
  // 三角屋顶：3 段圆柱 = 三棱柱，轴转到 Z 向、尖朝上。
  const rr = (w * 1.15) / Math.sqrt(3)
  local.add(new CylinderGeometry(rr, rr, d + 0.3, 3, 1), (_nx, ny) => (ny < -0.5 ? shade(roof, 0.7) : roof), mat(0, h + rr * 0.5, 0, -Math.PI / 2, 0, 0))
  // 门窗（朝 +Z 面）
  local.add(new RoundedBoxGeometry(0.42 * scale, 0.72 * scale, 0.08, 1, 0.04), 0xc97a4a, mat(-0.45 * scale, 0.36 * scale + 0.05, d / 2 + 0.02))
  for (const [wx, wy] of [
    [0.45 * scale, h * 0.55],
    [-0.45 * scale, h * 0.8],
  ]) {
    local.add(new RoundedBoxGeometry(0.46 * scale, 0.42 * scale, 0.06, 1, 0.03), 0xfff8ec, mat(wx, wy, d / 2 + 0.02))
    local.add(new BoxGeometry(0.34 * scale, 0.3 * scale, 0.07), 0x6fc3e0, mat(wx, wy, d / 2 + 0.025))
  }
  // 烟囱
  local.add(new BoxGeometry(0.28 * scale, 0.6 * scale, 0.28 * scale), 0xd88a5b, mat(w * 0.25, h + 0.55 * scale, -d * 0.15))
  b.addBuilder(local, mat(x, 0, z, 0, rot, 0))
}

function tree(b: GeoBuilder, x: number, z: number, s: number, rnd: () => number): void {
  b.add(new CylinderGeometry(0.1 * s, 0.14 * s, 0.9 * s, 8), 0xa8743f, mat(x, 0.45 * s, z))
  const greens = [0x6cc551, 0x58b048, 0x7ccf5f]
  const n = 2 + Math.floor(rnd() * 2)
  for (let i = 0; i < n; i++) {
    const r = (0.55 - i * 0.1) * s
    b.add(new IcosahedronGeometry(r, 1), greens[i % 3], mat(x + (rnd() - 0.5) * 0.3 * s, (1.05 + i * 0.45) * s, z + (rnd() - 0.5) * 0.3 * s))
  }
}

function bush(b: GeoBuilder, x: number, z: number, s: number, rnd: () => number): void {
  const n = 2 + Math.floor(rnd() * 2)
  for (let i = 0; i < n; i++) {
    const r = (0.26 + rnd() * 0.12) * s
    b.add(new IcosahedronGeometry(r, 1), rnd() < 0.5 ? 0x58b048 : 0x74c95a, mat(x + (rnd() - 0.5) * 0.5 * s, r * 0.8, z + (rnd() - 0.5) * 0.5 * s, 0, 0, 0, 1, 0.85, 1))
  }
  if (rnd() < 0.4) b.add(new SphereGeometry(0.06 * s, 8, 6), rnd() < 0.5 ? 0xff8fa3 : 0xfff3dc, mat(x, 0.42 * s, z + 0.12 * s))
}

function die(b: GeoBuilder, x: number, z: number, s: number, rot: number): void {
  const local = new GeoBuilder()
  local.add(new RoundedBoxGeometry(s, s, s, 3, s * 0.16), 0xfffaf2, mat(0, s / 2, 0))
  const pip = (px: number, py: number, pz: number, rx: number, rz: number) =>
    local.add(new CylinderGeometry(s * 0.08, s * 0.08, 0.02, 12), px === 0 && pz === 0 && py > s * 0.9 ? 0xe0435a : INK, mat(px, py, pz, rx, 0, rz))
  // 顶面 5 点
  for (const [u, v] of [
    [0, 0],
    [-0.25, -0.25],
    [0.25, 0.25],
    [-0.25, 0.25],
    [0.25, -0.25],
  ]) {
    pip(u * s, s + 0.005, v * s, 0, 0)
  }
  // 正面 3 点
  for (const t of [-0.25, 0, 0.25]) pip(t * s, s / 2 + t * s, s / 2 + 0.005, Math.PI / 2, 0)
  b.addBuilder(local, mat(x, 0, z, 0, rot, 0))
}

function crayon(b: GeoBuilder, x: number, z: number, rot: number, color: number): void {
  const local = new GeoBuilder()
  const len = 3.2
  local.add(new CylinderGeometry(0.22, 0.22, len, 6), color, mat(0, 0.22, 0, 0, 0, Math.PI / 2))
  local.add(new CylinderGeometry(0.225, 0.225, len * 0.5, 6), 0xfff3dc, mat(0.2, 0.22, 0, 0, 0, Math.PI / 2))
  local.add(new ConeGeometry(0.22, 0.5, 6), color, mat(len / 2 + 0.25, 0.22, 0, 0, 0, -Math.PI / 2))
  b.addBuilder(local, mat(x, 0, z, 0, rot, 0))
}

/** 围绕棋盘（中心 c、半边长 half）按种子摆装饰；全部并成一个几何体（一次 draw call）。 */
export function buildDecor(center: number, half: number, seed: number): BufferGeometry {
  const rnd = mulberry32(seed)
  const all = new GeoBuilder()
  const houses = all
  const plants = all
  const props = all
  const inner = half + 2.2
  const roofs = [0x3db8da, 0xff7a3d]

  // 远侧（−Z）一排小屋 + 左右两侧小屋，门朝棋盘。
  const housePlaces: [number, number, number][] = [
    [center - 8.5, center - inner - 3.5, 0],
    [center - 3, center - inner - 4.6, 0.1],
    [center + 3, center - inner - 3.6, -0.08],
    [center + 8.6, center - inner - 4.4, 0.05],
    [center - inner - 3.4, center - 6, Math.PI / 2],
    [center - inner - 3.8, center + 0.5, Math.PI / 2 + 0.1],
    [center + inner + 3.4, center - 6.5, -Math.PI / 2],
    [center + inner + 3.9, center + 0.2, -Math.PI / 2 - 0.08],
    [center - inner - 7.5, center - inner - 2.5, Math.PI / 4],
    [center + inner + 7.2, center - inner - 3, -Math.PI / 4],
  ]
  housePlaces.forEach(([x, z, r], i) => house(houses, x, z, r, roofs[i % 2], 1 + rnd() * 0.35))

  // 树：远侧与两侧
  for (let i = 0; i < 18; i++) {
    const side = i % 3
    let x: number
    let z: number
    if (side === 0) {
      x = center + (rnd() - 0.5) * (half * 2 + 14)
      z = center - inner - 1.3 - rnd() * 8
    } else {
      const sx = side === 1 ? -1 : 1
      x = center + sx * (inner + 1.1 + rnd() * 7)
      z = center + (rnd() - 0.75) * (half * 2 + 6)
    }
    tree(plants, x, z, 1 + rnd() * 0.6, rnd)
  }
  // 灌木：四周都有；镜头一侧只放矮灌木
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2
    const r = inner + 0.3 + rnd() * 5
    const x = center + Math.sin(a) * r
    const z = center + Math.cos(a) * r
    const cameraSide = z > center + half
    bush(plants, x, z, cameraSide ? 0.9 : 1 + rnd() * 0.5, rnd)
  }
  // 桌面小物：巨型骰子、蜡笔
  die(props, center - inner - 1.8, center + half - 1, 1.4, 0.4)
  die(props, center + inner + 6.5, center - 2, 1.1, -0.3)
  crayon(props, center + inner + 1.5, center + half + 1.5, 0.5, 0xff7a3d)
  crayon(props, center - inner - 5, center + half + 4, -0.35, 0x3db8da)
  crayon(props, center + 5, center - inner - 9.5, 0.1, 0xb57bff)

  return all.build()
}
