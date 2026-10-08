import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import type { AnimalId } from '../../contract'
import { DOLL_PROPORTIONS, FACE, OUTLINE_T } from '../logic/doll-look'
import { ANIMAL_COLORS, EYE_INK, FACE_INK, INK, shade } from '../palette'
import { GeoBuilder, mat, type ColorFn } from './merge'

/**
 * 动物毛绒玩偶（大头 Q 版：头高 ≈ 58% 全身、头顶 0.93 模型单位）：椭球身 + 团子头 + 胶囊短四肢分件（可动画）。
 * 九种动物先靠剪影（夸张的标志零件：兔长耳、鸭宽嘴 + 呆毛、猫尖耳 + 闪电纹 + 胡须、熊圆耳 + 浅口鼻、
 * 蛙大眼包、企鹅心形白面罩 + 白肚皮、猪鼻头 + 前垂耳、狗垂耳 + 眼罩、袋鼠 V 字直立长耳 + 长口鼻 + 肚兜口袋 + 拖地粗尾 + 大长脚）
 * 再靠颜色区分。
 * 决定剪影的零件另有一层背面外扩的描边外壳（*Shell 几何，materials.dollOutline）。
 * 朝向 +Z（面向镜头）为 0 度。零件原点：身体相对身体中心；头相对头心；眼睛相对眼线高度；手臂相对肩；脚相对脚心地面。
 * 取值见 logic/doll-look.ts；外沿预算（|z| ≤ 0.275、|x| ≤ 0.335，含外壳）由 doll-look.test 顶点实测守护。
 * 原型表现占位，不代表 ADR 0007 比稿的结论。
 */

export const DOLL = {
  bodyY: DOLL_PROPORTIONS.bodyY,
  bodyR: DOLL_PROPORTIONS.bodyR,
  headY: DOLL_PROPORTIONS.headY,
  /** 头椭球半径（x, y, z），再乘各动物的头部缩放（{@link headRadii}）。 */
  headR: DOLL_PROPORTIONS.headR,
  shoulderX: DOLL_PROPORTIONS.shoulderX,
  shoulderY: DOLL_PROPORTIONS.shoulderY,
  footX: DOLL_PROPORTIONS.footX,
  /** 头顶高（不含耳朵）；skill-fx 的泡泡按它定中心。 */
  height: DOLL_PROPORTIONS.height,
  /** 手臂静止时向外张开的角度（绕 z，弧度）；企鹅鳍翅另见 {@link DollGeometries.armRestZ}。 */
  armRestZ: 0.35,
  /** 走路时脚前后迈出的幅度（模型单位）。 */
  footSwing: 0.07,
} as const

/** 袋鼠长耳（头局部，模型单位）：耳根位置、外张角、半长 / 半宽 / 半厚、往头里沉的量（表现取值，推断待验证）。 */
const KANGAROO_EAR = { rootX: 0.13, rootY: 0.2, splay: 0.45, len: 0.145, w: 0.072, d: 0.036, sink: 0.035 } as const
/** 袋鼠粗尾（身体坐标、平移前）：胶囊半径 / 直段长、中心、绕 X 的倾角（正 = 下端朝后）。 */
const KANGAROO_TAIL = { r: 0.05, len: 0.14, y: 0.115, z: -0.165, tilt: 0.5 } as const
/** 袋鼠脚的前后半长（别人 0.11）。 */
const KANGAROO_FOOT_RZ = 0.14

export interface DollGeometries {
  body: BufferGeometry
  head: BufferGeometry
  eyes: BufferGeometry
  arm: BufferGeometry
  foot: BufferGeometry
  /** 描边外壳（背面外扩），各自挂成对应部件网格的子节点。 */
  bodyShell: BufferGeometry
  headShell: BufferGeometry
  armShell: BufferGeometry
  footShell: BufferGeometry
  /** 身体几何以身体中心为原点；网格放在这个高度（散架时绕中心翻滚）。 */
  bodyY: number
  /** 头顶在头心之上的高度（第一顶帽子帽檐的落点，已压进毛绒一点）。 */
  headTop: number
  /** 眼线高度（头局部）：eyes 几何以它为原点，眨眼压缩绕眼睛自己的中心。 */
  eyeY: number
  /** 手臂静止外张角（企鹅鳍翅张得更开）。 */
  armRestZ: number
  /** 脚网格的 z 偏移：让脚几何的包围盒在 z 上居中（两脚中点 = 逻辑位置，ADR 0032）。 */
  footZ: number
}

type V3 = [number, number, number]

/** 轴对齐椭球（头、口鼻、面罩……）：脸部零件贴在这些表面上。 */
interface Ell {
  c: V3
  r: V3
}

const WHITE = 0xffffff
const Z_AXIS = new Vector3(0, 0, 1)

/** 各动物的头部缩放（乘在头半径上）。 */
export const HEAD_SCALE: Readonly<Record<AnimalId, V3>> = {
  duck: [1, 1, 1],
  rabbit: [0.96, 1, 1],
  bear: [1, 0.97, 1],
  cat: [1, 0.97, 1],
  // 蛙头压扁有下限：ry 0.94 时头高占比 55.5%。
  frog: [1.04, 0.94, 1],
  penguin: [0.97, 1, 1],
  pig: [1.02, 0.96, 1],
  // 狗头收窄：垂耳挂在头外侧还要满足侧向预算。
  dog: [0.9, 1, 1],
  // 袋鼠头略收窄：两只外张的长耳还要满足侧向预算（用户 2026-09-28）。
  kangaroo: [0.95, 1, 1],
}

/** 头椭球半径（已乘头部缩放）。 */
export function headRadii(animal: AnimalId): V3 {
  const s = HEAD_SCALE[animal]
  const r = DOLL.headR
  return [r[0] * s[0], r[1] * s[1], r[2] * s[2]]
}

/** 沿 +z 看过去，(x, y) 处最靠前的椭球表面点与外法线。 */
function hit(surfs: readonly Ell[], x: number, y: number): { p: Vector3; n: Vector3 } {
  let best = -Infinity
  const p = new Vector3()
  const n = new Vector3(0, 0, 1)
  for (const e of surfs) {
    const dx = (x - e.c[0]) / e.r[0]
    const dy = (y - e.c[1]) / e.r[1]
    const k = 1 - dx * dx - dy * dy
    if (k < 0) continue
    const z = e.c[2] + e.r[2] * Math.sqrt(k)
    if (z <= best) continue
    best = z
    p.set(x, y, z)
    n.set((x - e.c[0]) / (e.r[0] * e.r[0]), (y - e.c[1]) / (e.r[1] * e.r[1]), (z - e.c[2]) / (e.r[2] * e.r[2])).normalize()
  }
  if (best === -Infinity) throw new Error(`no face surface at (${x}, ${y})`)
  return { p, n }
}

/** 朝向：局部 +Z 对齐法线 n，再绕法线转 spin。 */
function along(n: Vector3, spin = 0): Quaternion {
  const q = new Quaternion().setFromUnitVectors(Z_AXIS, n)
  if (spin !== 0) q.multiply(new Quaternion().setFromAxisAngle(Z_AXIS, spin))
  return q
}

function compose(p: Vector3 | V3, q: Quaternion, s: V3 = [1, 1, 1]): Matrix4 {
  const v = p instanceof Vector3 ? p : new Vector3(p[0], p[1], p[2])
  return new Matrix4().compose(v, q, new Vector3(s[0], s[1], s[2]))
}

/** 贴面零件：对齐法线，中心沿法线沉到只露出 protrude（depth = 零件自身沿局部 z 的半厚）。 */
function onFace(p: Vector3, n: Vector3, depth: number, protrude: number, scale: V3, spin = 0): Matrix4 {
  return compose(p.clone().addScaledVector(n, protrude - depth), along(n, spin), scale)
}

function euler(rx: number, ry: number, rz: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ'))
}

const sphere = (seg = 18, rings = 12): BufferGeometry => new SphereGeometry(1, seg, rings)

/** 袋鼠耳的叶形：单位球的上半边随高度往里收成尖（兔耳是圆头长条，猫耳是矮三角）。 */
function leafGeometry(seg = 18, rings = 14): BufferGeometry {
  const g = new SphereGeometry(1, seg, rings)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const k = y > 0 ? 1 - 0.7 * Math.pow(y, 1.6) : 1
    p.setX(i, p.getX(i) * k)
    p.setZ(i, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/** 零件 + 同形描边外壳。 */
function withShell(b: GeoBuilder, sh: GeoBuilder, geo: () => BufferGeometry, color: number | ColorFn, m: Matrix4, t: number): void {
  b.add(geo(), color, m)
  sh.addShell(geo(), m, t)
}

interface HeadParts {
  head: BufferGeometry
  eyes: BufferGeometry
  shell: BufferGeometry
  top: number
  eyeY: number
}

function buildHead(animal: AnimalId): HeadParts {
  const c = ANIMAL_COLORS[animal]
  const R = headRadii(animal)
  const headE: Ell = { c: [0, 0, 0], r: R }
  const h = new GeoBuilder()
  const e = new GeoBuilder()
  const hs = new GeoBuilder()
  withShell(h, hs, () => sphere(32, 24), c.body, mat(0, 0, 0, 0, 0, 0, R[0], R[1], R[2]), OUTLINE_T.head)

  // 头顶 5 针缝线（沿头顶经线横跨；大多时候被帽子挡住，用身体色压暗而不是纯墨色）
  for (let i = 0; i < 5; i++) {
    const th = (-40 + i * 20) * (Math.PI / 180)
    const y = Math.cos(th) * R[1] + 0.002
    const z = Math.sin(th) * R[2]
    h.add(new BoxGeometry(0.06, 0.012, 0.016), shade(c.body, 0.62), mat(0, y, z, th, 0, 0))
  }

  /** 眼睛 / 腮红所在的表面。 */
  let face: Ell[] = [headE]
  /** 「ω」嘴所在的表面（有口鼻的动物贴在口鼻上）与高度；null = 不画「ω」。 */
  let mouth: { surfs: Ell[]; y: number } | null = null
  let top = R[1] - 0.02
  let frogEyes: { c: V3; n: Vector3; r: number } | null = null
  const T = OUTLINE_T.feature

  switch (animal) {
    case 'duck': {
      // 宽扁嘴：靠宽度（占头宽 43%）与橙色认出来，向前只凸 0.04；上半 accent、下半压暗一档
      const bill = mat(0, -0.075, 0.2, 0, 0, 0, 0.13, 0.045, 0.06)
      const lo = shade(c.accent, 0.85)
      withShell(h, hs, () => sphere(22, 12), (_nx, _ny, _nz, _px, py) => (py >= -0.075 ? c.accent : lo), bill, T)
      // 呆毛：3 根胶囊左右张开；帽子直接压住，没帽子时露出来。根部压进头顶、长度收在第 0 层帽身里
      // （帽身顶 ≈ 头顶 + 0.147 模型单位；呆毛连外壳最高 ≈ 0.392 < 0.397），戴帽时不从帽顶戳出来。
      const lens = [0.075, 0.095, 0.075]
      for (let i = -1; i <= 1; i++) {
        const len = lens[i + 1]
        const a = i * 0.5
        const m = mat(Math.sin(a) * len * 0.5, 0.25 + Math.cos(a) * len * 0.5, -0.02, 0, 0, -a)
        withShell(h, hs, () => new CapsuleGeometry(0.035, len, 4, 10), c.mark, m, T)
      }
      break
    }
    case 'rabbit': {
      // 长耳：外张 + 后仰（从帽檐穿出来是有意的：兔子戴帽露耳）
      for (const sx of [-1, 1]) {
        const q = euler(-0.12, 0, -sx * 0.14)
        const dir = new Vector3(0, 1, 0).applyQuaternion(q)
        const ctr = new Vector3(sx * 0.1, 0.24, -0.02).addScaledVector(dir, 0.15 + 0.058)
        withShell(h, hs, () => new CapsuleGeometry(0.058, 0.3, 6, 14), c.body, compose(ctr, q, [1, 1, 0.7]), T)
        const inner = ctr.clone().add(new Vector3(0, 0.01, 0.03).applyQuaternion(q))
        h.add(new CapsuleGeometry(0.032, 0.24, 4, 10), c.accent, compose(inner, q, [1, 1, 0.4]))
      }
      const nose = hit(face, 0, -0.055)
      h.add(sphere(12, 8), c.accent, onFace(nose.p, nose.n, 0.016, 0.012, [0.026, 0.02, 0.016]))
      // 两颗门牙
      for (const sx of [-1, 1]) {
        const t = hit(face, sx * 0.0135, -0.125)
        h.add(new BoxGeometry(0.024, 0.028, 0.01), c.mark, onFace(t.p, t.n, 0.005, 0.007, [1, 1, 1]))
      }
      mouth = { surfs: face, y: -0.095 }
      break
    }
    case 'bear': {
      // 圆耳 + 浅色内耳
      for (const sx of [-1, 1]) {
        withShell(h, hs, () => sphere(16, 12), c.body, mat(sx * 0.2, 0.2, -0.02, 0, 0, 0, 0.085, 0.085, 0.051), T)
        h.add(sphere(12, 8), c.light, mat(sx * 0.2, 0.2, 0.018, 0, 0, 0, 0.05, 0.05, 0.02))
      }
      // 浅色口鼻 + 鼻子
      const muzzle: Ell = { c: [0, -0.08, 0.205], r: [0.11, 0.075, 0.05] }
      withShell(h, hs, () => sphere(20, 12), c.light, mat(...muzzle.c, 0, 0, 0, ...muzzle.r), T)
      h.add(sphere(14, 10), c.accent, mat(0, -0.05, 0.25, 0, 0, 0, 0.04, 0.028, 0.02))
      mouth = { surfs: [headE, muzzle], y: -0.115 }
      break
    }
    case 'cat': {
      // 尖耳（z 向压扁成三角片）+ 粉内耳：耳根落在头面 (±0.16, 0.22) 附近、往里沉 0.04，耳尖高出头顶一截
      for (const sx of [-1, 1]) {
        const q = euler(0, 0, -sx * 0.3)
        const ctr = new Vector3(sx * 0.16, 0.22, -0.01).add(new Vector3(0, 0.19 / 2 - 0.04, 0).applyQuaternion(q))
        withShell(h, hs, () => new ConeGeometry(0.095, 0.19, 12), c.body, compose(ctr, q, [1, 1, 0.6]), T)
        const inner = ctr.clone().add(new Vector3(0, -0.015, 0.022).applyQuaternion(q))
        h.add(new ConeGeometry(0.05, 0.11, 12), c.accent, compose(inner, q, [1, 1, 0.5]))
      }
      // 额头闪电三道纹
      const spins = [0.35, 0, -0.35]
      const pts: readonly (readonly [number, number])[] = [
        [-0.075, 0.16],
        [0, 0.19],
        [0.075, 0.16],
      ]
      for (let i = 0; i < 3; i++) {
        const s = hit(face, pts[i][0], pts[i][1])
        h.add(sphere(12, 8), c.mark, onFace(s.p, s.n, 0.012, 0.006, [0.02, 0.055, 0.012], spins[i]))
      }
      // 浅色口鼻 + 粉鼻子 + 胡须（尖端朝后）
      const muzzle: Ell = { c: [0, -0.085, 0.2], r: [0.12, 0.07, 0.04] }
      withShell(h, hs, () => sphere(20, 12), c.light, mat(...muzzle.c, 0, 0, 0, ...muzzle.r), T)
      const ms = [headE, muzzle]
      const nose = hit(ms, 0, -0.045)
      h.add(sphere(12, 8), c.accent, onFace(nose.p, nose.n, 0.014, 0.01, [0.024, 0.018, 0.014]))
      for (const sx of [-1, 1]) {
        for (const [dy, fan] of [
          [-0.07, 0.12],
          [-0.1, -0.08],
        ] as const) {
          const root = hit(ms, sx * 0.1, dy)
          const dir = new Vector3(sx * Math.cos(0.35), 0, -Math.sin(0.35))
          const ctr = root.p.clone().add(new Vector3(0, 0, 0.008)).addScaledVector(dir, 0.055)
          h.add(new BoxGeometry(0.11, 0.014, 0.014), FACE_INK, compose(ctr, euler(0, sx * 0.35, sx * fan)))
        }
      }
      mouth = { surfs: ms, y: -0.095 }
      break
    }
    case 'frog': {
      // 大眼包：眼睛装在眼包上；帽檐搭在两只眼睛顶上
      const n = new Vector3(0, 0.45, 0.89).normalize()
      for (const sx of [-1, 1]) {
        withShell(h, hs, () => sphere(20, 14), c.body, mat(sx * 0.13, 0.19, 0.07, 0, 0, 0, 0.1, 0.1, 0.1), T)
      }
      frogEyes = { c: [0.13, 0.19, 0.07], n, r: 0.1 }
      // 宽笑嘴（开口朝上的弧，弧底在脸上 y −0.06）
      const s = hit(face, 0, -0.06)
      h.add(new TorusGeometry(0.12, 0.012, 6, 28, Math.PI * 0.7), FACE_INK, mat(0, -0.06 + 0.12, s.p.z + 0.004, 0, 0, -Math.PI / 2 - Math.PI * 0.35))
      // 规格稿取 0.25，但眼睛朝 (0, 0.45, 0.89) 装在眼包上、眼顶到 y ≈ 0.307，0.25 的帽檐会横穿双眼（连高光一起挡掉）。
      // 帽檐抬到眼顶之上，读作「帽子搭在两只大眼睛上」；doll-look.test 实测守护「帽檐不穿眼」。
      top = 0.31
      break
    }
    case 'penguin': {
      // 心形白面罩（两个浅色椭球），眼睛与腮红落在面罩上
      const masks: Ell[] = [
        { c: [-0.075, -0.01, 0.13], r: [0.14, 0.17, 0.11] },
        { c: [0.075, -0.01, 0.13], r: [0.14, 0.17, 0.11] },
      ]
      for (const m of masks) h.add(sphere(22, 16), c.light, mat(...m.c, 0, 0, 0, ...m.r))
      face = [headE, ...masks]
      // 小喙（沿 +z，尖端 0.27；不做外壳）
      h.add(new ConeGeometry(0.045, 0.07, 12), c.accent, mat(0, -0.055, 0.235, Math.PI / 2, 0, 0, 1, 1, 0.7))
      break
    }
    case 'pig': {
      // 圆柱鼻头：外侧 accent、正面 light；两个鼻孔
      const snout = mat(0, -0.07, 0.21, Math.PI / 2, 0, 0)
      withShell(h, hs, () => new CylinderGeometry(0.085, 0.085, 0.08, 24), (_nx, _ny, nz) => (nz > 0.7 ? c.light : c.accent), snout, T)
      for (const sx of [-1, 1]) {
        h.add(sphere(10, 8), c.mark, mat(sx * 0.03, -0.07, 0.252, 0, 0, 0, 0.016, 0.024, 0.006))
        // 前垂耳
        withShell(h, hs, () => new ConeGeometry(0.075, 0.13, 12), c.body, mat(sx * 0.18, 0.2, 0.03, 0.55, 0, -sx * 0.5, 1, 1, 0.45), T)
      }
      mouth = { surfs: face, y: -0.16 }
      break
    }
    case 'kangaroo': {
      // 直立长耳（用户 2026-09-28）：椭球叶形、向外张成 V 字（兔耳是几乎竖直的平行长条，猫耳是矮三角），深梅色内耳。
      // 耳根落在头顶两侧、往里沉；高出第一顶帽子的部分都在帽身半径之外（doll-look.test「不从帽顶戳出」守护）。
      for (const sx of [-1, 1]) {
        const q = euler(-0.1, 0, -sx * KANGAROO_EAR.splay)
        const dir = new Vector3(0, 1, 0).applyQuaternion(q)
        const ctr = new Vector3(sx * KANGAROO_EAR.rootX, KANGAROO_EAR.rootY, -0.03).addScaledVector(dir, KANGAROO_EAR.len - KANGAROO_EAR.sink)
        withShell(h, hs, () => leafGeometry(), c.body, compose(ctr, q, [KANGAROO_EAR.w, KANGAROO_EAR.len, KANGAROO_EAR.d]), T)
        const inner = ctr.clone().add(new Vector3(0, 0.01, KANGAROO_EAR.d * 0.55).applyQuaternion(q))
        h.add(leafGeometry(14, 10), c.accent, compose(inner, q, [KANGAROO_EAR.w * 0.55, KANGAROO_EAR.len * 0.72, KANGAROO_EAR.d * 0.5]))
      }
      // 长口鼻（浅色，略朝下）+ 深梅色鼻头贴在口鼻顶前端
      const muzzle: Ell = { c: [0, -0.075, 0.19], r: [0.1, 0.08, 0.062] }
      withShell(h, hs, () => sphere(20, 12), c.light, mat(...muzzle.c, 0, 0, 0, ...muzzle.r), T)
      const ms = [headE, muzzle]
      const nose = hit(ms, 0, -0.04)
      h.add(sphere(14, 10), c.accent, onFace(nose.p, nose.n, 0.016, 0.012, [0.036, 0.024, 0.016]))
      mouth = { surfs: ms, y: -0.11 }
      break
    }
    case 'dog': {
      // 垂耳（花纹色），挂在头外侧
      for (const sx of [-1, 1]) {
        const q = euler(0, 0, sx * 0.15)
        const ctr = new Vector3(sx * 0.23, 0.12, -0.01).add(new Vector3(0, -0.06, 0).applyQuaternion(q))
        withShell(h, hs, () => new CapsuleGeometry(0.06, 0.16, 6, 12), c.mark, compose(ctr, q, [1, 1, 0.55]), T)
      }
      // 浅色口鼻 + 黑鼻子
      const muzzle: Ell = { c: [0, -0.085, 0.2], r: [0.12, 0.08, 0.05] }
      withShell(h, hs, () => sphere(20, 12), c.light, mat(...muzzle.c, 0, 0, 0, ...muzzle.r), T)
      h.add(sphere(14, 10), INK, mat(0, -0.055, 0.245, 0, 0, 0, 0.045, 0.032, 0.022))
      // 左眼眼罩（在眼睛下面，凸出 0.006）
      const p = hit(face, -FACE.eyeX, FACE.eyeY)
      h.add(sphere(18, 12), c.mark, onFace(p.p, p.n, 0.02, 0.006, [0.095, 0.1, 0.02]))
      const ms = [headE, muzzle]
      mouth = { surfs: ms, y: -0.115 }
      // 小粉舌头
      const tg = hit(ms, 0, -0.143)
      h.add(sphere(12, 8), c.accent, onFace(tg.p, tg.n, 0.01, 0.008, [0.025, 0.02, 0.01]))
      break
    }
  }

  // 大眼：竖椭圆墨色眼底 + 两颗白色高光（两只眼同一侧，太阳在左上）
  const [ex, ey, ez] = FACE.eyeR
  let eyeY: number = FACE.eyeY
  for (const sx of [-1, 1]) {
    let p: Vector3
    let n: Vector3
    if (frogEyes) {
      n = frogEyes.n
      p = new Vector3(sx * frogEyes.c[0], frogEyes.c[1], frogEyes.c[2]).addScaledVector(n, frogEyes.r)
      eyeY = p.y
    } else {
      const s = hit(face, sx * FACE.eyeX, FACE.eyeY)
      p = s.p
      n = s.n
    }
    const ctr = p.clone().addScaledVector(n, FACE.eyeProtrude - ez)
    const q = along(n)
    e.add(sphere(22, 16), EYE_INK, compose(ctr, q, [ex, ey, ez]))
    const me = compose(ctr, q)
    const gb = FACE.glintBig
    e.add(sphere(12, 8), WHITE, me.clone().multiply(mat(gb.x, gb.y, gb.z, 0, 0, 0, gb.r, gb.r, gb.r * gb.sz)))
    const gs = FACE.glintSmall
    e.add(sphere(8, 6), WHITE, me.clone().multiply(mat(gs.x, gs.y, gs.z, 0, 0, 0, gs.r)))
  }
  // 腮红（受光照）
  const [bx, by, bz] = FACE.blushR
  for (const sx of [-1, 1]) {
    const s = hit(face, sx * FACE.blushX, FACE.blushY)
    h.add(sphere(14, 10), c.blush, onFace(s.p, s.n, bz, FACE.blushProtrude, [bx, by, bz]))
  }
  // 「ω」嘴：两段开口朝上的半圆
  if (mouth) {
    const r = FACE.mouthR
    for (const sx of [-1, 1]) {
      const s = hit(mouth.surfs, sx * r, mouth.y + r * 0.5)
      h.add(new TorusGeometry(r, FACE.mouthTube, 6, 12, Math.PI), FACE_INK, compose(s.p.clone().addScaledVector(s.n, 0.003), along(s.n, Math.PI)))
    }
  }

  const eyes = e.build()
  eyes.translate(0, -eyeY, 0)
  eyes.computeBoundingBox()
  eyes.computeBoundingSphere()
  return { head: h.build(), eyes, shell: hs.build(), top, eyeY }
}

/** 身体椭球表面（模型坐标、身体几何平移前）上 (x, y) 处的前 / 后表面点与外法线。 */
function onBody(x: number, y: number, back: boolean): { p: Vector3; n: Vector3 } {
  const [rx, ry, rz] = DOLL.bodyR
  const cy = DOLL.bodyY
  const dx = x / rx
  const dy = (y - cy) / ry
  const z = (back ? -1 : 1) * rz * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))
  const n = new Vector3(x / (rx * rx), (y - cy) / (ry * ry), z / (rz * rz)).normalize()
  return { p: new Vector3(x, y, z), n }
}

/** 贴着身体背面横向绕的弧（猫背条纹）：单位圆环 → 按该高度的椭圆截面缩放 → 放平；弧心朝 −z。 */
function backBand(y: number, arc: number, halfH: number, tube: number): Matrix4 {
  const [rx, ry, rz] = DOLL.bodyR
  const k = Math.sqrt(Math.max(0, 1 - ((y - DOLL.bodyY) / ry) ** 2))
  return new Matrix4()
    .makeTranslation(0, y, 0)
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeScale(rx * k, rz * k, halfH / tube))
    .multiply(new Matrix4().makeRotationZ(-Math.PI / 2 - arc / 2))
}

function buildBody(animal: AnimalId): { body: BufferGeometry; shell: BufferGeometry } {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  const sh = new GeoBuilder()
  const [rx, ry, rz] = DOLL.bodyR
  const cy = DOLL.bodyY
  withShell(b, sh, () => sphere(28, 20), c.body, mat(0, cy, 0, 0, 0, 0, rx, ry, rz), OUTLINE_T.body)
  // 腰缝
  b.add(new TorusGeometry(1, 0.035, 6, 36), shade(c.body, 0.8), mat(0, cy - 0.02, 0, Math.PI / 2, 0, 0, rx * 1.005, rz * 1.005, 0.3))
  // 肚皮浅色（企鹅是整片白肚皮）
  if (animal === 'penguin') b.add(sphere(22, 16), c.light, mat(0, cy - 0.01, 0.07, 0, 0, 0, 0.17, 0.17, 0.12))
  else b.add(sphere(20, 14), c.light, mat(0, cy - 0.01, 0.09, 0, 0, 0, 0.12, 0.12, 0.1))

  // 尾巴等（背面 −Z）：贴着背收短 / 卷起，倒着走时也不探出脚印（ADR 0032）
  switch (animal) {
    case 'rabbit':
      // 棉球尾巴
      b.add(new IcosahedronGeometry(0.07, 1), c.light, mat(0, cy - 0.05, -rz + 0.01))
      break
    case 'cat': {
      // 贴背竖起、朝上卷的钩形尾巴，尾尖是花纹色
      const tail = mat(0.05, cy + 0.08, -rz - 0.012, 0, 0, 0.4)
      b.add(new TorusGeometry(0.085, 0.028, 8, 16, Math.PI * 1.1), c.body, tail)
      b.add(new TorusGeometry(0.085, 0.028, 8, 6, Math.PI * 0.3), c.mark, tail.clone().multiply(mat(0, 0, 0, 0, 0, Math.PI * 1.1)))
      // 背上两道黄条纹（贴着背的弧）
      for (const y of [0.3, 0.2]) b.add(new TorusGeometry(0.92, 0.12, 6, 20, 1.7), c.mark, backBand(y, 1.7, 0.022, 0.12))
      break
    }
    case 'pig':
      b.add(new TorusGeometry(0.04, 0.013, 6, 14, Math.PI * 1.7), c.accent, mat(0, cy - 0.02, -rz + 0.005, 0, Math.PI / 2, 0))
      break
    case 'dog':
      b.add(new CapsuleGeometry(0.028, 0.07, 4, 8), c.body, mat(0, cy + 0.06, -rz, -0.6, 0, 0))
      break
    case 'duck':
      b.add(new ConeGeometry(0.05, 0.09, 8), c.body, mat(0, cy + 0.05, -rz, -1.1, 0, 0))
      break
    case 'bear': {
      b.add(sphere(10, 8), c.body, mat(0, cy - 0.05, -rz + 0.005, 0, 0, 0, 0.05))
      // 肚皮火苗（火焰熊）：球 + 锥，z 向压扁贴在浅色肚皮上
      b.add(sphere(12, 10), c.mark, mat(0, 0.205, 0.19, 0, 0, 0, 0.045, 0.045, 0.018))
      b.add(new ConeGeometry(0.04, 0.07, 10), c.mark, mat(0, 0.26, 0.186, 0, 0, 0, 1, 1, 0.4))
      break
    }
    case 'kangaroo': {
      // 肚兜口袋（用户 2026-09-28）：浅色肚皮下半鼓出一个口袋，袋口一串薄荷青「针脚」贴着表面弯成浅浅的微笑
      const pouch: Ell = { c: [0, cy - 0.065, 0.13], r: [0.115, 0.085, 0.07] }
      b.add(sphere(20, 14), c.light, mat(...pouch.c, 0, 0, 0, ...pouch.r))
      const belly: Ell[] = [{ c: [0, cy, 0], r: [rx, ry, rz] }, pouch]
      for (let i = 0; i <= 8; i++) {
        const u = i / 4 - 1
        const s = hit(belly, u * 0.095, cy - 0.005 - 0.022 * (1 - u * u))
        b.add(sphere(10, 6), c.mark, onFace(s.p, s.n, 0.01, 0.008, [0.017, 0.014, 0.01]))
      }
      // 拖地粗尾巴：从后腰斜着拖到地上（站姿像三脚架），贴着背收住，倒着走也不探出脚印（ADR 0032）
      withShell(b, sh, () => new CapsuleGeometry(KANGAROO_TAIL.r, KANGAROO_TAIL.len, 6, 12), c.body, mat(0, KANGAROO_TAIL.y, KANGAROO_TAIL.z, KANGAROO_TAIL.tilt, 0, 0), OUTLINE_T.feature)
      break
    }
    case 'frog': {
      // 背上 3 个深绿斑点
      for (const [x, y] of [
        [0, 0.32],
        [-0.085, 0.22],
        [0.08, 0.17],
      ] as const) {
        const s = onBody(x, y, true)
        b.add(sphere(12, 8), c.mark, onFace(s.p, s.n, 0.014, 0.006, [0.04, 0.04, 0.014]))
      }
      break
    }
    default:
      break
  }
  const body = b.build()
  body.translate(0, -cy, 0)
  const shell = sh.build()
  shell.translate(0, -cy, 0)
  return { body, shell }
}

function buildArm(animal: AnimalId): { arm: BufferGeometry; shell: BufferGeometry } {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  const sh = new GeoBuilder()
  const t = OUTLINE_T.limb
  if (animal === 'penguin') {
    // 鳍翅
    withShell(b, sh, () => sphere(14, 12), c.body, mat(0, -0.1, 0, 0, 0, 0, 0.04, 0.13, 0.085), t)
  } else if (animal === 'duck') {
    // 小翅膀
    withShell(b, sh, () => sphere(14, 12), c.body, mat(0, -0.09, 0, 0, 0, 0, 0.045, 0.11, 0.08), t)
  } else {
    withShell(b, sh, () => new CapsuleGeometry(0.055, 0.09, 6, 12), c.body, mat(0, -0.075, 0), t)
    // 掌垫
    b.add(sphere(12, 8), c.light, mat(0, -0.148, 0.012, 0, 0, 0, 0.045, 0.035, 0.05))
  }
  return { arm: b.build(), shell: sh.build() }
}

function buildFoot(animal: AnimalId): { foot: BufferGeometry; shell: BufferGeometry } {
  const c = ANIMAL_COLORS[animal]
  const b = new GeoBuilder()
  const sh = new GeoBuilder()
  const t = OUTLINE_T.limb
  if (animal === 'duck' || animal === 'penguin' || animal === 'frog') {
    // 扁平蹼脚
    withShell(b, sh, () => sphere(14, 8), c.feet, mat(0, 0.03, 0.03, 0, 0, 0, 0.09, 0.03, 0.12), t)
  } else if (animal === 'kangaroo') {
    // 大长脚（用户 2026-09-28）：比别人长一截、略窄，脚尖一块薄荷青「鞋头」、脚底一道薄荷青——飞踢时踢出去的就是它
    withShell(b, sh, () => sphere(16, 10), c.feet, mat(0, 0.05, 0.02, 0, 0, 0, 0.075, 0.052, KANGAROO_FOOT_RZ), t)
    b.add(sphere(12, 8), c.mark, mat(0, 0.04, 0.02 + KANGAROO_FOOT_RZ - 0.04, 0, 0, 0, 0.055, 0.03, 0.045))
    b.add(sphere(12, 8), c.mark, mat(0, 0.006, 0.02, 0, 0, 0, 0.06, 0.008, KANGAROO_FOOT_RZ * 0.85))
  } else {
    withShell(b, sh, () => sphere(16, 10), c.feet, mat(0, 0.055, 0.02, 0, 0, 0, 0.085, 0.06, 0.11), t)
    // 脚尖浅色垫
    b.add(sphere(10, 8), c.light, mat(0, 0.03, 0.1, 0, 0, 0, 0.05, 0.022, 0.035))
  }
  return { foot: b.build(), shell: sh.build() }
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
    const body = buildBody(animal)
    const arm = buildArm(animal)
    const foot = buildFoot(animal)
    g = {
      body: body.body,
      head: head.head,
      eyes: head.eyes,
      arm: arm.arm,
      foot: foot.foot,
      bodyShell: body.shell,
      headShell: head.shell,
      armShell: arm.shell,
      footShell: foot.shell,
      bodyY: DOLL.bodyY,
      headTop: head.top,
      eyeY: head.eyeY,
      armRestZ: animal === 'penguin' ? 0.45 : DOLL.armRestZ,
      footZ: centredZ(foot.foot),
    }
    cache.set(animal, g)
  }
  return g
}

/** 受伤二档：身前一块缝补贴片（露线）。 */
export function patchGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const k = 0.9
  const place = mat(0.08, 0.27, 0.175, -0.2, 0.35, 0.15)
  b.add(new BoxGeometry(0.12 * k, 0.1 * k, 0.018), 0xf2e6d0, place)
  // 顶边一排红色十字针脚
  for (let i = 0; i < 4; i++) {
    b.add(new BoxGeometry(0.035 * k, 0.008, 0.012), 0xe0435a, place.clone().multiply(mat((-0.055 + i * 0.037) * k, 0.045, 0.008, 0, 0, i % 2 ? 0.6 : -0.6)))
  }
  return b.build()
}

/** 受伤三档：冒出来的棉花团（身体侧面两团、头顶两团）。 */
export function tuftGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new IcosahedronGeometry(0.055, 1), 0xffffff, mat(-0.19, 0.3, 0.06))
  b.add(new IcosahedronGeometry(0.042, 1), 0xffffff, mat(-0.22, 0.34, 0.0))
  b.add(new IcosahedronGeometry(0.05, 1), 0xffffff, mat(0.14, 0.86, 0.1))
  b.add(new IcosahedronGeometry(0.04, 1), 0xffffff, mat(0.18, 0.89, 0.04))
  return b.build()
}
