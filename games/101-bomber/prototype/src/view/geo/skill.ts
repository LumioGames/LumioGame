import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { COMBOS, type SkillId } from '../../contract'
import { SKILL_COLOR } from '../../present/skill-style'
import { SKILL_FX } from '../logic/skill-fx'
import { shade } from '../palette'
import { BOMB_CENTER_Y, BOMB_R } from './bomb'
import { GeoBuilder, mat } from './merge'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能表现的几何——泡泡球、冰块、组合技项圈与环绕小球、
 * 冰冻弹霜壳、穿透弹钻刺，以及每种技能糖（约 0.3 的彩色糖球 + 正面浮雕剪影，靠形状区分、不只靠颜色）。
 */

const WHITE = 0xffffff
const INKISH = 0x3a3350

export function bubbleGeometry(): BufferGeometry {
  return new SphereGeometry(SKILL_FX.bubbleRadius, 28, 18)
}

/** 冰块（原点在底面中心）。 */
export function iceBlockGeometry(): BufferGeometry {
  const [w, h, d] = SKILL_FX.iceBlock
  const g = new RoundedBoxGeometry(w, h, d, 2, 0.12)
  g.translate(0, h / 2, 0)
  return g
}

/** 组合技项圈（平躺，原点在环心）。 */
export function comboRingGeometry(): BufferGeometry {
  const g = new TorusGeometry(SKILL_FX.comboRingRadius, SKILL_FX.comboRingTube, 8, 40)
  g.rotateX(Math.PI / 2)
  return g
}

export function orbGeometry(): BufferGeometry {
  return new IcosahedronGeometry(0.07, 1)
}

/** 冰冻弹的霜壳：比弹体大一圈的透明冰球（与弹体同原点）。 */
export function frostShellGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(BOMB_R * 1.08, 2)
  g.translate(0, BOMB_CENTER_Y, 0)
  return g
}

/** 穿透弹：赤道一圈朝外的金色钻刺（与弹体同原点）。 */
export function drillSpikeGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const n = 4
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4
    const x = Math.sin(a) * (BOMB_R + 0.05)
    const z = Math.cos(a) * (BOMB_R + 0.05)
    // 圆锥沿 +Y 建，转到朝外（绕 x / z 轴放倒）。
    b.add(new ConeGeometry(0.055, 0.16, 10), 0xffc93c, mat(x, BOMB_CENTER_Y, z, Math.cos(a) * (Math.PI / 2), 0, -Math.sin(a) * (Math.PI / 2)))
  }
  return b.build()
}

// ---- 技能糖（原点在糖心，约 0.3）----

const ORB_R = 0.15
/** 浮雕贴在糖球正面（+Z）。 */
const FACE_Z = ORB_R * 0.72

function flameShape(b: GeoBuilder, x: number, y: number, s: number, color: number): void {
  const pts: Vector2[] = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.55) * 0.09
    pts.push(new Vector2(Math.max(0.0001, r), -0.09 + t * 0.2))
  }
  b.add(new LatheGeometry(pts, 14), color, mat(x, y, FACE_Z, 0, 0, 0, s, s, s * 0.6))
}

function boltShape(b: GeoBuilder, x: number, y: number, s: number, color: number): void {
  const sh = new Shape()
  sh.moveTo(0.03, 0.11)
  sh.lineTo(-0.065, -0.005)
  sh.lineTo(-0.005, -0.005)
  sh.lineTo(-0.035, -0.11)
  sh.lineTo(0.065, 0.02)
  sh.lineTo(0.005, 0.02)
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 })
  b.add(g, color, mat(x, y, FACE_Z - 0.01, 0, 0, 0, s, s, s))
}

function heartShape(b: GeoBuilder, x: number, y: number, s: number, color: number): void {
  const sh = new Shape()
  sh.moveTo(0, -0.09)
  sh.bezierCurveTo(-0.03, -0.06, -0.1, -0.02, -0.095, 0.03)
  sh.bezierCurveTo(-0.09, 0.085, -0.025, 0.095, 0, 0.05)
  sh.bezierCurveTo(0.025, 0.095, 0.09, 0.085, 0.095, 0.03)
  sh.bezierCurveTo(0.1, -0.02, 0.03, -0.06, 0, -0.09)
  const g = new ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 10 })
  b.add(g, color, mat(x, y, FACE_Z - 0.01, 0, 0, 0, s, s, s))
}

function miniBombShape(b: GeoBuilder, x: number, y: number, s: number): void {
  b.add(new SphereGeometry(0.065, 14, 10), INKISH, mat(x, y - 0.01 * s, FACE_Z + 0.01, 0, 0, 0, s, s, s * 0.8))
  b.add(new CylinderGeometry(0.02, 0.024, 0.02, 10), 0xc9ced6, mat(x, y + 0.06 * s, FACE_Z + 0.01, 0, 0, 0, s, s, s))
}

function snowflakeShape(b: GeoBuilder, x: number, y: number, s: number, color: number): void {
  for (let i = 0; i < 3; i++) b.add(new BoxGeometry(0.13, 0.018, 0.018), color, mat(x, y, FACE_Z + 0.07, 0, 0, (i * Math.PI) / 3, s, s, s))
}

function drillShape(b: GeoBuilder, x: number, y: number, s: number): void {
  b.add(new ConeGeometry(0.035, 0.1, 10), 0xffc93c, mat(x + 0.055 * s, y + 0.055 * s, FACE_Z + 0.03, 0, 0, -Math.PI / 4, s, s, s))
}

function bootShape(b: GeoBuilder, x: number, y: number, s: number, color: number): void {
  b.add(new BoxGeometry(0.06, 0.11, 0.04), color, mat(x - 0.02 * s, y + 0.02 * s, FACE_Z, 0, 0, 0, s, s, s))
  b.add(new BoxGeometry(0.11, 0.045, 0.045), color, mat(x + 0.01 * s, y - 0.04 * s, FACE_Z + 0.005, 0, 0, 0, s, s, s))
}

function bubbleShape(b: GeoBuilder, x: number, y: number, s: number): void {
  b.add(new TorusGeometry(0.07, 0.014, 6, 24), WHITE, mat(x, y, FACE_Z + 0.02, 0, 0, 0, s, s, s))
  b.add(new SphereGeometry(0.022, 8, 6), WHITE, mat(x - 0.03 * s, y + 0.03 * s, FACE_Z + 0.03, 0, 0, 0, s, s, s))
}

/** 一个基础技能的正面剪影（组合技糖把两半各画一个）。 */
function emblem(b: GeoBuilder, id: SkillId, x: number, y: number, s: number): void {
  switch (id) {
    case 'regen':
      heartShape(b, x, y, s, 0xff5a6e)
      b.add(new SphereGeometry(0.03, 8, 6), 0x7bc96f, mat(x + 0.06 * s, y + 0.07 * s, FACE_Z + 0.01, 0, 0, 0.6, s * 1.4, s * 0.6, s))
      break
    case 'bubble':
      bubbleShape(b, x, y, s)
      break
    case 'blink':
      boltShape(b, x, y, s, 0xfff3b0)
      break
    case 'fireAura':
      flameShape(b, x, y, s, 0xffc93c)
      for (let i = 0; i < 3; i++) b.add(new ConeGeometry(0.018, 0.04, 6), 0xfff3b0, mat(x + (i - 1) * 0.04 * s, y + 0.1 * s, FACE_Z, 0, 0, 0, s, s, s))
      break
    case 'kick':
      bootShape(b, x, y, s, WHITE)
      break
    case 'freezeBomb':
      miniBombShape(b, x, y, s)
      snowflakeShape(b, x, y, s, 0xe8fbff)
      break
    case 'pierceBomb':
      miniBombShape(b, x, y, s)
      drillShape(b, x, y, s)
      break
    default:
      break
  }
}

/** 技能糖：SKILL_COLOR 糖球 + 浮雕；组合技 = 两半双色球 + 两个剪影。 */
export function skillCandyGeometry(id: SkillId): BufferGeometry {
  const b = new GeoBuilder()
  const combo = COMBOS.find((c) => c.result === id)
  if (combo) {
    const ca = SKILL_COLOR[combo.a]
    const cb = SKILL_COLOR[combo.b]
    b.add(new SphereGeometry(ORB_R, 24, 16), (_nx, _ny, _nz, px) => (px < 0 ? ca : cb), mat(0, 0, 0, 0, 0, 0, 1, 1, 0.8))
    b.add(new TorusGeometry(ORB_R * 0.98, 0.012, 6, 32), SKILL_COLOR[id], mat(0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 0.8))
    emblem(b, combo.a, -0.06, 0, 0.7)
    emblem(b, combo.b, 0.06, 0, 0.7)
  } else {
    const c = SKILL_COLOR[id]
    b.add(new SphereGeometry(ORB_R, 24, 16), (_nx, ny) => (ny > 0.55 ? shade(c, 1.12) : c), mat(0, 0, 0, 0, 0, 0, 1, 1, 0.8))
    emblem(b, id, 0, 0, 1)
  }
  // 背面也看得到是糖：一颗小高光
  b.add(new SphereGeometry(0.025, 8, 6), WHITE, mat(-0.06, 0.07, -FACE_Z + 0.02))
  return b.build()
}

/** 糖上的等级小金豆（1–3 颗）。 */
export function levelPipGeometry(): BufferGeometry {
  return new SphereGeometry(0.045, 10, 8)
}
