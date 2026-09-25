import {
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { GeoBuilder, mat } from './merge'

/** 圆玩具炸弹（r 0.34，深紫黑）+ 金属帽；色带与引线另成实例批（色带按主人上色、引线随引信缩短）。 */
export const BOMB_R = 0.34
export const BOMB_CENTER_Y = 0.36
export const FUSE_BASE_Y = BOMB_CENTER_Y + BOMB_R + 0.05

export function bombBodyGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new SphereGeometry(BOMB_R, 28, 20), 0x3a3350, mat(0, BOMB_CENTER_Y, 0))
  // 高光贴片：玩具塑料的亮点
  b.add(new SphereGeometry(0.07, 10, 8), 0x8d82b0, mat(-0.13, BOMB_CENTER_Y + 0.17, 0.22, 0, 0, 0, 1, 0.7, 0.35))
  b.add(new CylinderGeometry(0.11, 0.13, 0.09, 18), 0xc9ced6, mat(0, BOMB_CENTER_Y + BOMB_R + 0.005, 0))
  b.add(new TorusGeometry(0.11, 0.018, 8, 18), 0xaab2be, mat(0, BOMB_CENTER_Y + BOMB_R + 0.05, 0, Math.PI / 2, 0, 0))
  return b.build()
}

/** 赤道色带（每实例色 = 主人脚圈色）。 */
export function bombBandGeometry(): BufferGeometry {
  const g = new TorusGeometry(BOMB_R + 0.004, 0.05, 10, 36)
  g.rotateX(Math.PI / 2)
  g.translate(0, BOMB_CENTER_Y, 0)
  return g
}

/** 引线：原点在帽口，沿 +Y 弯出；按剩余引信比例缩放 Y。 */
export const FUSE_TIP = new Vector3(0.14, 0.24, 0.02)

export function fuseGeometry(): BufferGeometry {
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.02, 0.1, 0.01), new Vector3(0.08, 0.2, 0.02), FUSE_TIP.clone()])
  const b = new GeoBuilder()
  b.add(new TubeGeometry(curve, 16, 0.022, 6, false), 0xe8d9b8)
  return b.build()
}

/** 危险辉光外壳（叠加，黑色 = 不可见）。 */
export function bombGlowGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(BOMB_R * 1.18, 2)
  g.translate(0, BOMB_CENTER_Y, 0)
  return g
}

/** 面朝镜头的方片（火花、尘埃），原点居中。 */
export function billboardQuad(): BufferGeometry {
  return new PlaneGeometry(1, 1)
}

/** 平躺在地上的方片（接触阴影、脚圈、辉光、预览格）。 */
export function groundQuad(): BufferGeometry {
  const g = new PlaneGeometry(1, 1)
  g.rotateX(-Math.PI / 2)
  return g
}
