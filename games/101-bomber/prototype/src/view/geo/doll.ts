import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three'
import type { AnimalId } from '../../contract'
import { ANIMAL_COLORS, INK, shade } from '../palette'
import { GeoBuilder, mat } from './merge'

/**
 * 动物毛绒玩偶（约 2.1 头身、总高 1.08 格）：椭球身 + 球头 + 胶囊短四肢分件（可动画）。
 * 八种动物先靠轮廓（耳 / 嘴 / 眼的位置）再靠颜色区分。朝向 +Z（面向镜头）为 0 度。
 * 零件原点：身体相对根（脚底）；头相对头心；手臂相对肩；脚相对脚心地面。
 */

export const DOLL = {
  bodyY: 0.32,
  bodyR: [0.26, 0.24, 0.22] as const,
  headY: 0.82,
  headR: 0.26,
  shoulderX: 0.225,
  shoulderY: 0.45,
  footX: 0.11,
  height: 1.08,
  /** 手臂静止时向外张开的角度（绕 z，弧度）：原 0.38 收到 0.32，侧向不碰方块面（ADR 0032）。 */
  armRestZ: 0.32,
  /** 走路时脚前后迈出的幅度（模型单位）。 */
  footSwing: 0.08,
} as const

export interface DollGeometries {
  body: BufferGeometry
  head: BufferGeometry
  eyes: BufferGeometry
  arm: BufferGeometry
  foot: BufferGeometry
  /** 身体几何以身体中心为原点；网格放在这个高度（散架时绕中心翻滚）。 */
  bodyY: number
  /** 头顶在头心之上的高度（帽塔起点）。 */
  headTop: number
  /** 脚网格的 z 偏移：让脚几何的包围盒在 z 上居中（两脚中点 = 逻辑位置，ADR 0032）。 */
  footZ: number
}

const CHEEK = 0xff8fa3
const WHITE = 0xffffff

function headScale(animal: AnimalId): [number, number, number] {
  if (animal === 'frog') return [1.08, 0.8, 1]
  if (animal === 'penguin') return [1, 0.98, 0.98]
  return [1, 0.96, 0.98]
}

/** 头面上的点（椭球面，局部坐标，面朝 +Z）。 */
function onHead(s: [number, number, number], x: number, y: number, lift = 0): [number, number, number] {
  const r = DOLL.headR
  const nx = x / (r * s[0])
  const ny = y / (r * s[1])
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  return [x, y, nz * r * s[2] + lift]
}

function buildHead(animal: AnimalId): { head: BufferGeometry; eyes: BufferGeometry; top: number } {
  const c = ANIMAL_COLORS[animal]
  const s = headScale(animal)
  const r = DOLL.headR
  const h = new GeoBuilder()
  const e = new GeoBuilder()
  h.add(new SphereGeometry(r, 28, 22), c.body, mat(0, 0, 0, 0, 0, 0, s[0], s[1], s[2]))

  // 头顶 7 针缝线（沿头顶经线横跨）
  for (let i = 0; i < 7; i++) {
    const th = (-50 + i * 18) * (Math.PI / 180)
    const y = Math.cos(th) * r * s[1] + 0.003
    const z = Math.sin(th) * r * s[2]
    h.add(new BoxGeometry(0.06, 0.012, 0.016), INK, mat(0, y, z, th, 0, 0))
  }

  let eyeY = 0.035
  let eyeX = 0.092
  let eyeLift = 0
  let top = r * s[1]

  switch (animal) {
    case 'duck': {
      // 扁嘴收进脸里（ADR 0032：向前探出 ≤ 0.35 格）
      h.add(new SphereGeometry(0.1, 16, 10), c.accent, mat(0, -0.055, r * s[2] - 0.045, 0, 0, 0, 1.5, 0.38, 0.7))
      for (let i = -1; i <= 1; i++) {
        h.add(new SphereGeometry(0.045, 10, 8), shade(c.body, 1.04), mat(i * 0.035, r * s[1] + 0.02, -0.02 + Math.abs(i) * 0.01, 0, 0, i * 0.5, 0.8, 1.4, 0.8))
      }
      top += 0.03
      break
    }
    case 'rabbit': {
      for (const sx of [-1, 1]) {
        h.add(new CapsuleGeometry(0.062, 0.3, 6, 12), c.body, mat(sx * 0.09, r * s[1] + 0.13, -0.02, 0, 0, -sx * 0.16, 1, 1, 0.7))
        h.add(new CapsuleGeometry(0.036, 0.24, 4, 10), c.accent, mat(sx * 0.09, r * s[1] + 0.13, 0.022, 0, 0, -sx * 0.16, 1, 1, 0.4))
      }
      const n = onHead(s, 0, -0.045)
      h.add(new SphereGeometry(0.025, 10, 8), c.accent, mat(n[0], n[1], n[2] - 0.004, 0, 0, 0, 1.2, 0.9, 0.7))
      break
    }
    case 'bear': {
      for (const sx of [-1, 1]) {
        h.add(new SphereGeometry(0.09, 14, 10), c.body, mat(sx * 0.18, r * s[1] * 0.78, -0.02, 0, 0, 0, 1, 1, 0.65))
        h.add(new SphereGeometry(0.05, 10, 8), c.light, mat(sx * 0.18, r * s[1] * 0.78, 0.02, 0, 0, 0, 1, 1, 0.4))
      }
      h.add(new SphereGeometry(0.1, 14, 10), c.light, mat(0, -0.075, r * s[2] - 0.045, 0, 0, 0, 1.05, 0.75, 0.7))
      h.add(new SphereGeometry(0.035, 10, 8), c.accent, mat(0, -0.045, r * s[2] - 0.005, 0, 0, 0, 1.2, 0.85, 0.8))
      top += 0.02
      break
    }
    case 'cat': {
      for (const sx of [-1, 1]) {
        h.add(new ConeGeometry(0.085, 0.17, 4), c.body, mat(sx * 0.15, r * s[1] + 0.03, -0.01, 0, Math.PI / 4, -sx * 0.32))
        h.add(new ConeGeometry(0.045, 0.1, 4), c.accent, mat(sx * 0.148, r * s[1] + 0.02, 0.018, 0, Math.PI / 4, -sx * 0.32))
        for (const dy of [-0.02, 0.012]) {
          h.add(new BoxGeometry(0.1, 0.007, 0.007), INK, mat(sx * 0.16, -0.06 + dy, r * s[2] - 0.035, 0, sx * 0.35, sx * dy * 4))
        }
      }
      const n = onHead(s, 0, -0.05)
      h.add(new SphereGeometry(0.02, 8, 6), c.accent, mat(n[0], n[1], n[2], 0, 0, 0, 1.3, 0.9, 0.7))
      top += 0.06
      break
    }
    case 'frog': {
      eyeX = 0.115
      eyeY = 0.2
      eyeLift = 0.075
      for (const sx of [-1, 1]) h.add(new SphereGeometry(0.085, 14, 10), c.body, mat(sx * 0.115, 0.17, 0.075))
      h.add(new TorusGeometry(0.1, 0.009, 6, 20, Math.PI * 0.8), INK, mat(0, -0.02, r * s[2] - 0.03, Math.PI + 0.2, 0, Math.PI * 0.1 + Math.PI, 1, 0.6, 1))
      top = 0.25
      break
    }
    case 'penguin': {
      // 白色脸盘，豆豆眼落在白脸上才看得见
      h.add(new SphereGeometry(0.2, 18, 14), WHITE, mat(0, -0.02, r * s[2] - 0.13, 0, 0, 0, 1.08, 0.9, 0.7))
      h.add(new ConeGeometry(0.05, 0.12, 12), c.accent, mat(0, -0.05, r * s[2] - 0.01, Math.PI / 2, 0, 0, 1, 0.55, 0.7))
      break
    }
    case 'pig': {
      const snout = onHead(s, 0, -0.06)
      h.add(new CylinderGeometry(0.075, 0.08, 0.06, 18), c.accent, mat(0, snout[1], snout[2] - 0.005, Math.PI / 2, 0, 0, 1.2, 1, 0.85))
      for (const sx of [-1, 1]) {
        h.add(new SphereGeometry(0.015, 8, 6), shade(c.accent, 0.6), mat(sx * 0.03, snout[1], snout[2] + 0.017))
        h.add(new ConeGeometry(0.08, 0.13, 3), c.body, mat(sx * 0.16, r * s[1] * 0.85, 0.03, 0.7, 0, -sx * 0.45, 1, 1, 0.5))
      }
      break
    }
    case 'dog': {
      for (const sx of [-1, 1]) {
        h.add(new CapsuleGeometry(0.06, 0.22, 6, 10), c.accent, mat(sx * 0.245, -0.03, -0.01, 0, 0, sx * 0.25, 1, 1, 0.55))
      }
      h.add(new SphereGeometry(0.1, 14, 10), c.light, mat(0, -0.07, r * s[2] - 0.045, 0, 0, 0, 1.1, 0.75, 0.7))
      h.add(new SphereGeometry(0.035, 10, 8), INK, mat(0, -0.04, r * s[2] - 0.005, 0, 0, 0, 1.25, 0.85, 0.8))
      // 左眼眼罩
      const p = onHead(s, -0.092, 0.035)
      h.add(new SphereGeometry(0.075, 14, 10), c.accent, mat(p[0], p[1], p[2] - 0.028, 0, -0.35, 0, 1, 1, 0.45))
      break
    }
  }

  // 纽扣眼 + 白色高光
  for (const sx of [-1, 1]) {
    const p = animal === 'frog' ? ([sx * eyeX, eyeY, 0.075 + 0.07] as [number, number, number]) : onHead(s, sx * eyeX, eyeY, eyeLift)
    e.add(new SphereGeometry(0.046, 14, 10), INK, mat(p[0], p[1], p[2] - 0.012, 0, sx * 0.3, 0, 1, 1.12, 0.5))
    e.add(new SphereGeometry(0.015, 8, 6), WHITE, mat(p[0] + 0.014, p[1] + 0.02, p[2] + 0.012))
  }
  // 腮红
  if (animal !== 'penguin') {
    for (const sx of [-1, 1]) {
      const p = onHead(s, sx * 0.155, -0.06)
      h.add(new SphereGeometry(0.048, 12, 8), CHEEK, mat(p[0], p[1], p[2] - 0.02, 0, sx * 0.55, 0, 1, 0.7, 0.4))
    }
  } else {
    for (const sx of [-1, 1]) {
      const p = onHead(s, sx * 0.14, -0.07)
      h.add(new SphereGeometry(0.04, 10, 8), CHEEK, mat(p[0], p[1], p[2] - 0.02, 0, sx * 0.55, 0, 1, 0.7, 0.4))
    }
  }
  // 嘴（除鸭 / 企鹅 / 猪 / 蛙外的小「ω」）
  if (animal === 'rabbit' || animal === 'cat' || animal === 'bear' || animal === 'dog') {
    const p = onHead(s, 0, -0.09)
    for (const sx of [-1, 1]) {
      h.add(new TorusGeometry(0.018, 0.005, 4, 10, Math.PI), INK, mat(sx * 0.018, p[1], p[2] + (animal === 'bear' || animal === 'dog' ? 0.015 : 0.002), Math.PI, 0, 0))
    }
  }
  return { head: h.build(), eyes: e.build(), top }
}

function buildBody(animal: AnimalId): BufferGeometry {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  const [rx, ry, rz] = animal === 'penguin' ? [0.27, 0.3, 0.24] : DOLL.bodyR
  const cy = animal === 'penguin' ? 0.34 : DOLL.bodyY
  b.add(new SphereGeometry(1, 26, 18), c.body, mat(0, cy, 0, 0, 0, 0, rx, ry, rz))
  // 腰缝
  b.add(new TorusGeometry(1, 0.05, 6, 32), shade(c.body, 0.78), mat(0, cy - 0.02, 0, Math.PI / 2, 0, 0, rx * 1.005, rz * 1.005, 0.24))
  // 肚皮浅色
  if (animal === 'penguin') {
    b.add(new SphereGeometry(1, 20, 14), c.light, mat(0, cy - 0.02, 0.07, 0, 0, 0, rx * 0.78, ry * 0.85, rz * 0.8))
  } else if (animal !== 'frog') {
    b.add(new SphereGeometry(1, 18, 12), c.light, mat(0, cy + 0.01, 0.1, 0, 0, 0, rx * 0.55, ry * 0.6, rz * 0.6))
  } else {
    b.add(new SphereGeometry(1, 18, 12), c.light, mat(0, cy, 0.1, 0, 0, 0, rx * 0.6, ry * 0.65, rz * 0.6))
  }
  // 尾巴（背面 −Z）：贴着背收短 / 卷起，倒着走时也不探出脚印（ADR 0032）
  switch (animal) {
    case 'rabbit':
      b.add(new IcosahedronGeometry(0.065, 1), 0xffffff, mat(0, cy - 0.06, -rz + 0.01))
      break
    case 'cat':
      // 贴背竖起、朝上卷的钩形尾巴（原来横着向后伸 0.4 模型单位）
      b.add(new TorusGeometry(0.085, 0.028, 8, 16, Math.PI * 1.4), c.body, mat(0.05, cy + 0.1, -rz - 0.012, 0, 0, 0.4))
      break
    case 'pig':
      b.add(new TorusGeometry(0.04, 0.013, 6, 14, Math.PI * 1.7), c.accent, mat(0, cy - 0.02, -rz + 0.005, 0, Math.PI / 2, 0))
      break
    case 'dog':
      b.add(new CapsuleGeometry(0.028, 0.07, 4, 8), c.body, mat(0, cy + 0.06, -rz, -0.6, 0, 0))
      break
    case 'duck':
      b.add(new ConeGeometry(0.06, 0.1, 8), c.body, mat(0, cy + 0.04, -rz, -1.1, 0, 0))
      break
    case 'bear':
      b.add(new SphereGeometry(0.05, 10, 8), c.body, mat(0, cy - 0.05, -rz + 0.005))
      break
    default:
      break
  }
  const geo = b.build()
  geo.translate(0, -cy, 0)
  return geo
}

function bodyCenterY(animal: AnimalId): number {
  return animal === 'penguin' ? 0.34 : DOLL.bodyY
}

function buildArm(animal: AnimalId): BufferGeometry {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  if (animal === 'penguin') {
    b.add(new SphereGeometry(1, 12, 10), c.body, mat(0, -0.1, 0, 0, 0, 0, 0.05, 0.14, 0.09))
  } else {
    b.add(new CapsuleGeometry(0.068, 0.12, 6, 10), c.body, mat(0, -0.09, 0))
    b.add(new SphereGeometry(0.06, 10, 8), c.light, mat(0, -0.165, 0.005, 0, 0, 0, 1, 0.6, 1))
  }
  return b.build()
}

function buildFoot(animal: AnimalId): BufferGeometry {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  if (animal === 'duck' || animal === 'penguin') {
    b.add(new SphereGeometry(1, 12, 8), c.feet, mat(0, 0.035, 0.05, 0, 0, 0, 0.1, 0.04, 0.14))
  } else {
    b.add(new SphereGeometry(1, 14, 10), c.feet, mat(0, 0.065, 0.02, 0, 0, 0, 0.095, 0.068, 0.125))
    b.add(new SphereGeometry(1, 10, 8), c.light, mat(0, 0.03, 0.1, 0, 0, 0, 0.06, 0.03, 0.04))
  }
  return b.build()
}

/** 让几何的 z 包围盒居中所需的偏移。 */
function centredZ(g: BufferGeometry): number {
  g.computeBoundingBox()
  const b = g.boundingBox
  return b ? -(b.min.z + b.max.z) / 2 : 0
}

const cache = new Map<AnimalId, DollGeometries>()

export function dollGeometries(animal: AnimalId): DollGeometries {
  let g = cache.get(animal)
  if (!g) {
    const head = buildHead(animal)
    const foot = buildFoot(animal)
    g = {
      body: buildBody(animal),
      head: head.head,
      eyes: head.eyes,
      arm: buildArm(animal),
      foot,
      bodyY: bodyCenterY(animal),
      headTop: head.top,
      footZ: centredZ(foot),
    }
    cache.set(animal, g)
  }
  return g
}

/** 受伤二档：身前一块缝补贴片（露线）。 */
export function patchGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new BoxGeometry(0.12, 0.1, 0.02), 0xf2e6d0, mat(0.09, 0.4, 0.2, -0.2, 0.35, 0.15))
  for (let i = 0; i < 4; i++) {
    b.add(new BoxGeometry(0.035, 0.008, 0.012), 0xe0435a, mat(0.09 - 0.055 + i * 0.037, 0.46 - i * 0.004, 0.214, -0.2, 0.35, 0.15 + (i % 2 ? 0.6 : -0.6)))
  }
  return b.build()
}

/** 受伤三档：冒出来的棉花团。 */
export function tuftGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new IcosahedronGeometry(0.06, 1), 0xffffff, mat(-0.2, 0.46, 0.08))
  b.add(new IcosahedronGeometry(0.045, 1), 0xffffff, mat(-0.24, 0.5, 0.02))
  b.add(new IcosahedronGeometry(0.05, 1), 0xffffff, mat(0.14, 0.99, 0.12))
  b.add(new IcosahedronGeometry(0.04, 1), 0xffffff, mat(0.18, 1.02, 0.06))
  return b.build()
}
