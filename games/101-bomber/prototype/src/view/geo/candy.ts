import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three'
import { PickupKind } from '../../contract'
import { GeoBuilder, mat } from './merge'

/**
 * 糖果：参考图同款「金环 + 悬浮旋转」。四种靠形状区分，不只靠颜色：
 * 火力+ 火苗、炸弹+ 小炸弹带白色 +、速度+ 闪电、血包 缝线爱心。原点在糖果中心，尺寸约 0.3。
 */

function flame(): BufferGeometry {
  const pts: Vector2[] = []
  const n = 14
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // 水滴轮廓：底圆顶尖。
    const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.55) * 0.13
    pts.push(new Vector2(Math.max(0.0001, r), -0.14 + t * 0.32))
  }
  const b = new GeoBuilder()
  b.add(new LatheGeometry(pts, 18), 0xff7a3d)
  b.add(new LatheGeometry(pts, 14), 0xffc93c, mat(0, -0.03, 0.055, 0, 0, 0, 0.55))
  b.add(new SphereGeometry(0.02, 8, 6), 0xfff3dc, mat(-0.03, 0.02, 0.12))
  return b.build()
}

function miniBomb(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new SphereGeometry(0.12, 18, 14), 0x3a3350, mat(0, -0.02, 0))
  b.add(new CylinderGeometry(0.045, 0.05, 0.04, 12), 0xc9ced6, mat(0, 0.1, 0))
  b.add(new CylinderGeometry(0.012, 0.012, 0.08, 6), 0xe8d9b8, mat(0.02, 0.15, 0, 0, 0, -0.4))
  b.add(new SphereGeometry(0.025, 8, 6), 0xffc93c, mat(0.04, 0.2, 0))
  // 白色「+」
  b.add(new BoxGeometry(0.1, 0.028, 0.03), 0xffffff, mat(0, -0.02, 0.115))
  b.add(new BoxGeometry(0.028, 0.1, 0.03), 0xffffff, mat(0, -0.02, 0.115))
  return b.build()
}

function bolt(): BufferGeometry {
  const s = new Shape()
  s.moveTo(0.04, 0.17)
  s.lineTo(-0.1, -0.01)
  s.lineTo(-0.005, -0.01)
  s.lineTo(-0.05, -0.17)
  s.lineTo(0.1, 0.03)
  s.lineTo(0.005, 0.03)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 })
  g.translate(0, 0, -0.03)
  const b = new GeoBuilder()
  b.add(g, (_nx, _ny, nz) => (Math.abs(nz) > 0.7 ? 0x3db8da : 0x2a9fc4))
  return b.build()
}

function heart(): BufferGeometry {
  const s = new Shape()
  s.moveTo(0, -0.14)
  s.bezierCurveTo(-0.05, -0.09, -0.16, -0.03, -0.15, 0.05)
  s.bezierCurveTo(-0.14, 0.13, -0.04, 0.15, 0, 0.08)
  s.bezierCurveTo(0.04, 0.15, 0.14, 0.13, 0.15, 0.05)
  s.bezierCurveTo(0.16, -0.03, 0.05, -0.09, 0, -0.14)
  const g = new ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 16 })
  g.translate(0, 0, -0.035)
  const b = new GeoBuilder()
  b.add(g, 0xff5a6e)
  // 奶油色十字缝线
  for (const side of [1, -1]) {
    b.add(new BoxGeometry(0.1, 0.018, 0.012), 0xfff3dc, mat(0, 0.0, side * 0.062, 0, 0, Math.PI / 4))
    b.add(new BoxGeometry(0.1, 0.018, 0.012), 0xfff3dc, mat(0, 0.0, side * 0.062, 0, 0, -Math.PI / 4))
  }
  return b.build()
}

export function candyGeometry(kind: PickupKind): BufferGeometry {
  switch (kind) {
    case PickupKind.FirePlus:
      return flame()
    case PickupKind.BombPlus:
      return miniBomb()
    case PickupKind.SpeedPlus:
      return bolt()
    case PickupKind.HealthPack:
      return heart()
    default:
      return miniBomb()
  }
}

/** 金环（竖直，面朝镜头）。 */
export function candyRingGeometry(): BufferGeometry {
  return new TorusGeometry(0.3, 0.022, 8, 40)
}
