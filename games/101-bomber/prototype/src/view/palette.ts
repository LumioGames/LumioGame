import type { AnimalId } from '../contract'

/** 比稿方向 B 色板（plan「画面」）；地形偏低饱和粉彩，角色用满饱和。 */
export const INK = 0x2b2320
export const SUNSHINE = 0xffc93c
export const TANGERINE = 0xff7a3d
export const SKY = 0x3db8da
export const LEAF = 0x6cc551
export const CREAM = 0xfff3dc
export const BACKGROUND = 0xddf1f7

/**
 * 脚圈 / 炸弹色带：slot 0 是本机（蓝，与参考图一致）。16 个槽（ADR 0040：16 人 · 27×27），前 8 个不变；
 * 颜色不是唯一的识别手段（名牌、击杀栏还有名字与动物色点）。HUD 的 icons.SLOT_COLOR 逐槽同值（growth-look.test 守护）。
 */
export const SLOT_COLORS: readonly number[] = [
  SKY,
  TANGERINE,
  SUNSHINE,
  LEAF,
  0xb57bff,
  0xff6fa8,
  0xffffff,
  INK,
  0x2ec4b6,
  0xe63946,
  0x3a5bd9,
  0xb8e04a,
  0x8d5a3b,
  0xd33fc6,
  0x9aa3ad,
  0x1b7f5a,
]

export function slotColor(slot: number): number {
  const n = SLOT_COLORS.length
  return SLOT_COLORS[((slot % n) + n) % n]
}

export const SOFT_BLOCK_COLORS: readonly number[] = [0xf9d98a, 0xf7b48a, 0x9fd3e2, 0xb3dc9c]

export interface AnimalColors {
  body: number
  /** 耳内 / 嘴 / 鼻等点缀。 */
  accent: number
  feet: number
  /** 口鼻 / 肚皮浅色。 */
  light: number
  /** 标志花纹（鸭呆毛、猫闪电纹、狗垂耳与眼罩、蛙背斑、熊肚皮火苗……）。 */
  mark: number
  /** 腮红。 */
  blush: number
}

/**
 * 玩偶色板（原型表现取值，不是正式美术方向；ADR 0007 比稿未定）。
 * 纪律（doll-look.test 守护）：body 离每个地形参考色 ΔE76 ≥ 20；有色玩偶彩度 C* ≥ 45（高于地形最高的 42.9 一档），
 * 兔 / 企鹅是「明度型」（L ≥ 88 / L ≤ 30）豁免彩度；玩偶两两 ΔE ≥ 30。
 */
export const ANIMAL_COLORS: Readonly<Record<AnimalId, AnimalColors>> = {
  duck: { body: 0xffd21f, accent: 0xff8a1f, feet: 0xff8a1f, light: 0xfff0a0, mark: 0xffb300, blush: 0xff8a5c },
  rabbit: { body: 0xede6ff, accent: 0xff6f9c, feet: 0xdcd2f5, light: 0xffffff, mark: 0xffffff, blush: 0xff8fb0 },
  bear: { body: 0xb94a2c, accent: 0x3a2020, feet: 0x9a3a22, light: 0xffd2a0, mark: 0xffb347, blush: 0xff9a8a },
  cat: { body: 0x6c63ff, accent: 0xff8fb0, feet: 0x5a50e0, light: 0xe9e6ff, mark: 0xffd83d, blush: 0xff8fc0 },
  frog: { body: 0x2ec45a, accent: 0xff7f9e, feet: 0x25a84b, light: 0xd8f7a8, mark: 0x1e8f43, blush: 0xff7f9e },
  penguin: { body: 0x24375e, accent: 0xffa51f, feet: 0xffa51f, light: 0xffffff, mark: 0x3e5a92, blush: 0xff9cb5 },
  pig: { body: 0xff86ae, accent: 0xff5f93, feet: 0xe86a95, light: 0xffc6da, mark: 0xc2446f, blush: 0xff4f86 },
  dog: { body: 0xf28a2e, accent: 0xff7f9e, feet: 0xd9741f, light: 0xfff3e0, mark: 0x7a3e1c, blush: 0xff5e7a },
}

/** 玩偶描边（暖可可墨色，不用纯黑）。 */
export const OUTLINE = 0x3a2824
/** 眼底墨色（偏蓝，受光不变：眼睛用不受光材质）。 */
export const EYE_INK = 0x1b1530
/** 嘴 / 胡须等脸部线条。 */
export const FACE_INK = 0x3a2824

/**
 * 地形参考色（只给测试用：玩偶配色要从数值上避开它们）。照抄 world/terrain.ts、geo/blocks.ts、textures.ts 的字面色；
 * 那边改了色，这里要跟着改（不反向依赖，避免测试牵动地形模块）。
 */
export const TERRAIN_REFERENCE_COLORS: Readonly<Record<string, number>> = {
  // 水不在这里：用户 2026-09-28 反馈后水面是全场唯一的饱和色地形，见 WATER_REFERENCE_COLORS。
  /** 积木四色（SOFT_BLOCK_COLORS）。 */
  brickHoney: 0xf9d98a,
  brickPeach: 0xf7b48a,
  brickSky: 0x9fd3e2,
  brickMint: 0xb3dc9c,
  /** 软垫两档奶油色（textures.drawMatTexture）。 */
  matLight: 0xf7eedb,
  matDark: 0xefe1c6,
  /** 木箱两色（blocks.ts 侧面 / 顶面）。 */
  crateSide: 0xc98f5a,
  crateTop: 0xd49c66,
  /** 铁皮两色（blocks.ts 侧面 / 顶面）。 */
  tinSide: 0x7f95b2,
  tinTop: 0x95aac4,
  /** 围边（terrain.ts rims）。 */
  rim: 0xf6ead3,
}

/**
 * 水面参考色（只给测试用；照抄 logic/water WATER_COLORS 的浅水 / 深水）。用户 2026-09-28 反馈「水一坨绿色」后，
 * 水改成饱和的蓝，彩度高于其余哑光地形，所以不参与「玩偶彩度要高于地形」的纪律；改成要求每只玩偶离两种水色 ΔE ≥ 30
 * （玩偶站在水心时仍分得清，推断待验证）。
 */
export const WATER_REFERENCE_COLORS: Readonly<Record<string, number>> = {
  waterShallow: 0x44a0ff,
  waterDeep: 0x2f7ce6,
}

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
}

/** sRGB hex → CIELAB（D65）。纯数学，测试与调色用。 */
export function labOf(hex: number): [number, number, number] {
  const r = srgbToLinear((hex >> 16) & 255)
  const g = srgbToLinear((hex >> 8) & 255)
  const b = srgbToLinear(hex & 255)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 色差。 */
export function deltaE76(a: number, b: number): number {
  const p = labOf(a)
  const q = labOf(b)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** CIELAB 彩度 C*。 */
export function chromaOf(hex: number): number {
  const l = labOf(hex)
  return Math.hypot(l[1], l[2])
}

/** 线性空间里按系数压暗 / 提亮一个 sRGB hex（构建期用，不在热循环里调）。 */
export function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)))
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)))
  return (r << 16) | (g << 8) | b
}

export function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}
