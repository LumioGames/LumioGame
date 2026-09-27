/**
 * 玩偶「长相」的纯数学与取值（原型表现，不是正式美术方向；ADR 0007 比稿未定，ADR 0008「动物玩偶派对」）。
 * 大头 Q 版（头高 ≈ 58% 全身）+ 大眼（单眼宽 ≥ 头宽 22%、白色高光）+ 腮红 + 小嘴，
 * 卡通分阶光照 + 深色背面外扩描边 + 边缘补光，负责让玩偶从积木地面里跳出来。
 * geo/doll.ts 按这里的数建模；doll-look.test 用真几何实测守护。无 three 依赖。
 *
 * 模型单位：朝向 +Z，原点在两脚中点的地面上；场内缩放 ≈ 1.2（logic/doll-fit）。
 */

/** 比例（模型单位）。头椭球前后略扁，像团子。 */
export const DOLL_PROPORTIONS = {
  bodyY: 0.25,
  bodyR: [0.21, 0.2, 0.18] as const,
  headY: 0.66,
  headR: [0.3, 0.27, 0.23] as const,
  shoulderX: 0.19,
  shoulderY: 0.33,
  footX: 0.095,
  /** 头顶高（不含耳朵）。 */
  height: 0.93,
  /** 头高占全身的下限（每只动物都要满足）。 */
  minHeadShare: 0.55,
  /** 静止姿态下的外沿预算（含描边外壳）：走路挤压 ×1.031 后 ≤ DOLL_MODEL_REACH 0.29。 */
  restReachZ: 0.275,
  /** 静止姿态下的侧向预算（含描边外壳）：歪头 + 挤压 + 缩放 1.2 后 < 0.44 格。 */
  restReachX: 0.335,
} as const

/**
 * 脸部（头局部坐标，头心为原点）。眼睛做竖椭圆：46° 俯角下脸的纵向缩成 cos 46° ≈ 0.69 倍，屏幕上才显得圆。
 * 眼底横半径比规格稿 0.068 放大到 0.072：眼睛贴着表面法线外倾约 19°，正视投影的宽度会缩，
 * 0.068 时投影宽只有头宽的 21.6%，放大后每只动物实测都 ≥ 22%（doll-look.test）。
 */
export const FACE = {
  eyeX: 0.125,
  eyeY: -0.005,
  /** 眼底椭球半径（x, y, z）。 */
  eyeR: [0.072, 0.085, 0.028] as const,
  /** 眼底凸出表面的量（沿法线）。 */
  eyeProtrude: 0.018,
  /** 大高光：眼局部坐标（两只眼同一侧，太阳在左上，不镜像）、半径、z 向压扁。 */
  glintBig: { x: -0.022, y: 0.028, z: 0.019, r: 0.024, sz: 0.5 },
  glintSmall: { x: 0.024, y: -0.03, z: 0.017, r: 0.011 },
  /** 腮红。 */
  blushX: 0.19,
  blushY: -0.08,
  blushR: [0.058, 0.034, 0.012] as const,
  blushProtrude: 0.008,
  /** 「ω」嘴：两段半圆 Torus。 */
  mouthR: 0.022,
  mouthTube: 0.01,
  /** 眨眼时 eyes.scale.y。 */
  blinkScale: 0.1,
} as const

/** 描边外壳厚度（模型单位）。 */
export const OUTLINE_T = {
  head: 0.018,
  body: 0.018,
  limb: 0.014,
  /** 耳朵、口鼻、鸭嘴、猪鼻头、眼包、呆毛。 */
  feature: 0.012,
} as const

/** 卡通分阶光照的三档灰度（0–255，暗 / 中 / 亮）。 */
export const TOON_RAMP_STEPS: readonly number[] = [110, 185, 255]

/** 边缘补光。 */
export const RIM = { color: 0xfff2dc, k: 0.35, power: 3 } as const

/** 头高占全身的比例：头高 2·ry，全身高 headY + ry（头顶，不含耳朵）。 */
export function headShare(ry: number, headY: number = DOLL_PROPORTIONS.headY): number {
  return (2 * ry) / (headY + ry)
}

/** 描边在屏幕上的粗细（像素）：t 模型单位 × 缩放 × 每米像素。 */
export function outlinePx(t: number, scale: number, pxPerM: number): number {
  return t * scale * pxPerM
}
