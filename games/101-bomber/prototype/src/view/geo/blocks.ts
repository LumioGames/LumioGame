import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TANGERINE } from '../palette'
import { GeoBuilder, mat } from './merge'

/**
 * 三种砖的几何（原点在格心地面）。区分靠高度 + 轮廓 + 细节，不只靠颜色（灰度下也分得开）：
 * 积木 0.80 高、顶面 2×2 凸点；铁皮 1.0 高、橙色色带 + 铆钉；木箱 0.86 高、X 形板条 + 金属包角 + 小锁。
 */

export const SOFT_HEIGHT = 0.8
export const HARD_HEIGHT = 1.0
export const CRATE_HEIGHT = 0.86

/** 积木：白色基底（每实例色上色），凸点略亮一点。 */
export function softBlockGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new RoundedBoxGeometry(0.92, SOFT_HEIGHT, 0.92, 3, 0.08), 0xf0f0f0, mat(0, SOFT_HEIGHT / 2, 0))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(new CylinderGeometry(0.11, 0.11, 0.07, 16), 0xffffff, mat(sx * 0.22, SOFT_HEIGHT + 0.03, sz * 0.22))
    }
  }
  return b.build()
}

export function hardBlockGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const body = 0x7f95b2
  const top = 0x95aac4
  b.add(new RoundedBoxGeometry(0.96, HARD_HEIGHT, 0.96, 3, 0.07), (_nx, ny) => (ny > 0.6 ? top : body), mat(0, HARD_HEIGHT / 2, 0))
  // 橙色色带（h 0.55–0.67），略大一圈才能从侧面露出来。
  b.add(new BoxGeometry(0.975, 0.12, 0.975), TANGERINE, mat(0, 0.61, 0))
  // 顶面内凹面板的浅边，打破大平面。
  b.add(new BoxGeometry(0.7, 0.02, 0.7), 0xa8bbd2, mat(0, HARD_HEIGHT + 0.005, 0))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(new SphereGeometry(0.045, 10, 8), 0xd7dee8, mat(sx * 0.37, HARD_HEIGHT - 0.005, sz * 0.37, 0, 0, 0, 1, 0.6, 1))
    }
  }
  // 正面两颗铆钉（朝镜头），侧看也有细节。
  for (const sx of [-1, 1]) b.add(new SphereGeometry(0.035, 8, 6), 0xd7dee8, mat(sx * 0.33, 0.3, 0.485, 0, 0, 0, 1, 1, 0.6))
  return b.build()
}

export function crateGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const wood = 0xc98f5a
  const dark = 0x9e6a3c
  const metal = 0xb8c0cc
  const h = CRATE_HEIGHT
  b.add(new RoundedBoxGeometry(0.88, h, 0.88, 2, 0.03), (_nx, ny) => (ny > 0.6 ? 0xd49c66 : wood), mat(0, h / 2, 0))
  // 横向木板缝
  for (const y of [h * 0.34, h * 0.67]) {
    b.add(new BoxGeometry(0.895, 0.02, 0.895), dark, mat(0, y, 0))
  }
  // 四个侧面：先在局部 +Z 面上摆好，再绕 Y 转到对应面。
  const diag = Math.hypot(0.7, h - 0.16)
  const ang = Math.atan2(h - 0.16, 0.7)
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const s of [-1, 1]) {
      b.add(new BoxGeometry(diag, 0.075, 0.03), dark, mat(0, 0, 0, 0, ry, 0).multiply(mat(0, h / 2, 0.45, 0, 0, s * ang)))
    }
    for (const y of [0.06, h - 0.06]) {
      b.add(new BoxGeometry(0.9, 0.1, 0.035), 0xb97f4c, mat(0, 0, 0, 0, ry, 0).multiply(mat(0, y, 0.44)))
    }
  }
  // 顶面两条压板
  for (const x of [-0.24, 0.24]) b.add(new BoxGeometry(0.1, 0.03, 0.9), dark, mat(x, h + 0.005, 0))
  // 八个金属包角
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0.07, h - 0.07]) b.add(new RoundedBoxGeometry(0.16, 0.16, 0.16, 1, 0.03), metal, mat(sx * 0.405, y, sz * 0.405))
    }
  }
  // 必掉提示：正面一枚小金锁
  b.add(new RoundedBoxGeometry(0.13, 0.11, 0.05, 1, 0.015), 0xe2b33c, mat(0, h * 0.42, 0.47))
  b.add(new TorusGeometry(0.038, 0.013, 6, 12, Math.PI), 0xd7dee8, mat(0, h * 0.42 + 0.055, 0.47))
  b.add(new CylinderGeometry(0.012, 0.012, 0.02, 6), 0x5a3a24, mat(0, h * 0.42 - 0.01, 0.497, Math.PI / 2, 0, 0))
  return b.build()
}

// ---- 方向 B：三级资源箱（ADR 0040，design §5.0）——木 / 铁 / 金靠轮廓 + 材质区分，不只靠颜色 ----

/** 铁箱高度：比木箱矮一截，顶面收成斜角（带斜面的保险箱）。 */
export const IRON_BOX_HEIGHT = 0.77
/** 金箱：长方箱身 + 拱形箱盖。 */
export const GOLD_CHEST_BODY = 0.46
export const GOLD_CHEST_LID = 0.31

/**
 * 铁箱：深铁灰箱身 + 亮钢包角立柱与腰带 + 铆钉 + 正面黄铜转盘锁；顶面是四棱台斜角（给「金属材质」的 tin 材质用）。
 */
export function ironBoxGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const body = 0x5b6778
  const steel = 0xc9d3de
  const bodyH = 0.58
  b.add(new RoundedBoxGeometry(0.84, bodyH, 0.84, 2, 0.04), (_nx, ny) => (ny > 0.6 ? 0x6b7889 : body), mat(0, bodyH / 2, 0))
  // 斜角顶：四棱台（4 段圆柱转 45° = 方台），底半宽 0.42 → 顶半宽 0.3。
  const lidH = 0.16
  b.add(new CylinderGeometry(0.3 * Math.SQRT2, 0.42 * Math.SQRT2, lidH, 4, 1), 0x7a8798, mat(0, bodyH + lidH / 2, 0, 0, Math.PI / 4, 0))
  // 包角立柱 + 腰带
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(new BoxGeometry(0.1, bodyH, 0.1), steel, mat(sx * 0.4, bodyH / 2, sz * 0.4))
  }
  b.add(new BoxGeometry(0.86, 0.08, 0.86), steel, mat(0, bodyH * 0.55, 0))
  // 腰带上的铆钉（四面）
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const x of [-0.24, 0, 0.24]) {
      b.add(new SphereGeometry(0.025, 8, 6), 0xeef2f6, mat(0, 0, 0, 0, ry, 0).multiply(mat(x, bodyH * 0.55, 0.43, 0, 0, 0, 1, 1, 0.6)))
    }
  }
  // 正面转盘锁（朝镜头）
  b.add(new CylinderGeometry(0.11, 0.11, 0.04, 20), 0xd9a441, mat(0, bodyH * 0.3, 0.43, Math.PI / 2, 0, 0))
  b.add(new BoxGeometry(0.14, 0.03, 0.03), 0x7a5a1c, mat(0, bodyH * 0.3, 0.46))
  // 顶面四颗螺栓
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.add(new CylinderGeometry(0.035, 0.035, 0.03, 8), steel, mat(sx * 0.16, bodyH + lidH + 0.01, sz * 0.16))
  }
  return b.build()
}

/**
 * 金箱：长方箱身 + 半圆拱形箱盖（宝箱轮廓）+ 亮金包带 + 正面锁扣与红宝石（配带金属感的顶点色材质）。
 */
export function goldChestGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  const body = 0xd99a2b
  const band = 0xffe07a
  const w = 0.86
  const d = 0.62
  const h = GOLD_CHEST_BODY
  const r = GOLD_CHEST_LID
  b.add(new RoundedBoxGeometry(w, h, d, 2, 0.04), body, mat(0, h / 2, 0))
  // 拱形盖：半圆柱，轴沿 X。
  b.add(new CylinderGeometry(r, r, w - 0.02, 24, 1, false, 0, Math.PI), 0xe8ab35, mat(0, h, 0, 0, 0, Math.PI / 2))
  // 包带：箱身竖带 + 盖上半圆带 + 盖沿横带
  for (const x of [-0.28, 0.28]) {
    b.add(new BoxGeometry(0.08, h + 0.01, d + 0.02), band, mat(x, h / 2, 0))
    b.add(new CylinderGeometry(r + 0.012, r + 0.012, 0.08, 24, 1, false, 0, Math.PI), band, mat(x, h, 0, 0, 0, Math.PI / 2))
  }
  b.add(new BoxGeometry(w + 0.02, 0.05, d + 0.02), band, mat(0, h, 0))
  // 正面锁扣 + 红宝石
  b.add(new RoundedBoxGeometry(0.16, 0.18, 0.04, 1, 0.015), band, mat(0, h - 0.04, d / 2))
  b.add(new SphereGeometry(0.05, 12, 8), 0xff3b5c, mat(0, h - 0.04, d / 2 + 0.025, 0, 0, 0, 1, 1, 0.6))
  return b.build()
}
