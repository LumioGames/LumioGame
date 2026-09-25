import type { AnimalId } from '../contract'

/** 比稿方向 B 色板（plan「画面」）；地形偏低饱和粉彩，角色用满饱和。 */
export const INK = 0x2b2320
export const SUNSHINE = 0xffc93c
export const TANGERINE = 0xff7a3d
export const SKY = 0x3db8da
export const LEAF = 0x6cc551
export const CREAM = 0xfff3dc
export const BACKGROUND = 0xddf1f7

/** 脚圈 / 炸弹色带：slot 0 是本机（蓝，与参考图一致）。 */
export const SLOT_COLORS: readonly number[] = [SKY, TANGERINE, SUNSHINE, LEAF, 0xb57bff, 0xff6fa8, 0xffffff, INK]

export function slotColor(slot: number): number {
  return SLOT_COLORS[((slot % 8) + 8) % 8]
}

export const SOFT_BLOCK_COLORS: readonly number[] = [0xf9d98a, 0xf7b48a, 0x9fd3e2, 0xb3dc9c]

export interface AnimalColors {
  body: number
  /** 耳内 / 嘴 / 鼻等点缀。 */
  accent: number
  feet: number
  /** 口鼻 / 肚皮浅色。 */
  light: number
}

export const ANIMAL_COLORS: Readonly<Record<AnimalId, AnimalColors>> = {
  duck: { body: 0xffd34d, accent: 0xff8a3d, feet: 0xff8a3d, light: 0xfff0b0 },
  rabbit: { body: 0xf5eee6, accent: 0xffa6b8, feet: 0xe8ddd0, light: 0xffffff },
  bear: { body: 0xb9804f, accent: 0x5a3a24, feet: 0x9a6a40, light: 0xebcb9e },
  cat: { body: 0x9aa3b5, accent: 0xff9fb0, feet: 0x808a9e, light: 0xdfe3ec },
  frog: { body: 0x6cc551, accent: 0xff8fa3, feet: 0x58b048, light: 0xd9f2b8 },
  penguin: { body: 0x2f4a6b, accent: 0xffb02e, feet: 0xffb02e, light: 0xffffff },
  pig: { body: 0xffa6b8, accent: 0xff8198, feet: 0xf28da3, light: 0xffd0da },
  dog: { body: 0xe3b77e, accent: 0x8a5a3b, feet: 0xc99a62, light: 0xf6e3c4 },
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
