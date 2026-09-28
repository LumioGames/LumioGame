import { BlockType } from '../../contract'

/**
 * 水面的纯逻辑（用户 2026-09-28 试玩反馈「地面的水材质太弱了，一坨绿色」「水还是很丑」）：
 * 一眼是水——玩具水池的高饱和清亮蓝（色相 205°–235°，不偏绿、不偏青、不灰，和粉彩地面 / 积木 / 冰冻弹的冰白明显区分），
 * 岸边一圈浅色泡沫、由岸到水心由浅到深；玩家走进水、在水里走有水花与涟漪（{@link WaterTrail}）。
 * 取值都是表现取值，推断待验证。无 three 依赖，可在 node 下单测。
 */

export const WATER_COLORS = {
  /** 岸边浅水（sRGB）。 */
  shallow: 0x44a0ff,
  /** 水心深水（玩偶站在格心、正对深水：离每只玩偶 ΔE ≥ 30，见 doll-look.test）。 */
  deep: 0x2f7ce6,
  /** 岸边泡沫。 */
  foam: 0xeef8ff,
  /** 高光闪点。 */
  spark: 0xffffff,
} as const

export const WATER_FX = {
  /** 在水里每走这么多格泛一圈涟漪。 */
  rippleEveryCells: 0.45,
  /** 涟漪存活（毫秒）与直径变化（格）。 */
  rippleMs: 900,
  rippleFrom: 0.25,
  rippleTo: 1.2,
  /** 一帧里位移超过它（重生 / 闪现）不算走，按「进水」算。 */
  teleportCells: 1.5,
  /** 同时存在的涟漪上限。 */
  maxRipples: 64,
  /** 玩偶站在水里时下沉多少（格）：脚没进半透明水面里，像在蹚水（水面在 −0.15）。 */
  wadeY: -0.24,
} as const

/** 某个水格四边是否是岸（−x、+x、−y、+y；1 = 岸或棋盘外）。给水面 shader 画泡沫与深浅。 */
export function waterShoreMask(ground: Uint8Array, size: number, x: number, y: number): [number, number, number, number] {
  const shore = (cx: number, cy: number): number => (cx < 0 || cy < 0 || cx >= size || cy >= size || ground[cy * size + cx] !== BlockType.水 ? 1 : 0)
  return [shore(x - 1, y), shore(x + 1, y), shore(x, y - 1), shore(x, y + 1)]
}

/** 四个斜角（−x−y、+x−y、−x+y、+x+y）的斜对角邻格是否是岸（1 = 岸或棋盘外）。 */
export function waterCornerMask(ground: Uint8Array, size: number, x: number, y: number): [number, number, number, number] {
  const shore = (cx: number, cy: number): number => (cx < 0 || cy < 0 || cx >= size || cy >= size || ground[cy * size + cx] !== BlockType.水 ? 1 : 0)
  return [shore(x - 1, y - 1), shore(x + 1, y - 1), shore(x - 1, y + 1), shore(x + 1, y + 1)]
}

/** 打包成水面实例的 aTint：每个分量 = 边（0 / 1）+ 2 × 角（0 / 1）。 */
export function packShore(side: readonly number[], corner: readonly number[]): [number, number, number, number] {
  return [side[0] + 2 * corner[0], side[1] + 2 * corner[1], side[2] + 2 * corner[2], side[3] + 2 * corner[3]]
}

/**
 * 格内 (u, v)（0..1）到最近的岸的距离，封顶 1。与 world/terrain 的水面 shader 同一算法。
 * 只看四边会在拐角处断开（相邻两格算出的距离不一样，格缝上一道亮线）；加上四个斜角（到角点的直线距离）后，
 * 相邻水格在共享边上处处相等，深浅与泡沫连续。
 */
export function shoreDistance(code: readonly number[], u: number, v: number): number {
  const corner = code.map((c) => (c >= 1.5 ? 1 : 0))
  const side = code.map((c, i) => (c - 2 * corner[i] >= 0.5 ? 1 : 0))
  let d = 1
  if (side[0]) d = Math.min(d, u)
  if (side[1]) d = Math.min(d, 1 - u)
  if (side[2]) d = Math.min(d, v)
  if (side[3]) d = Math.min(d, 1 - v)
  if (corner[0]) d = Math.min(d, Math.hypot(u, v))
  if (corner[1]) d = Math.min(d, Math.hypot(1 - u, v))
  if (corner[2]) d = Math.min(d, Math.hypot(u, 1 - v))
  if (corner[3]) d = Math.min(d, Math.hypot(1 - u, 1 - v))
  return d
}

export type WaterStep = 'enter' | 'ripple' | null

/** 每位玩家在水里的足迹：进水 → 'enter'（水花 + 涟漪），在水里每走 rippleEveryCells 格 → 'ripple'。 */
export class WaterTrail {
  private readonly inside = new Map<number, { x: number; z: number; acc: number }>()

  step(id: number, inWater: boolean, x: number, z: number): WaterStep {
    if (!inWater) {
      this.inside.delete(id)
      return null
    }
    const st = this.inside.get(id)
    if (!st) {
      this.inside.set(id, { x, z, acc: 0 })
      return 'enter'
    }
    const d = Math.hypot(x - st.x, z - st.z)
    st.x = x
    st.z = z
    if (d > WATER_FX.teleportCells) {
      st.acc = 0
      return 'enter'
    }
    st.acc += d
    if (st.acc < WATER_FX.rippleEveryCells) return null
    st.acc -= WATER_FX.rippleEveryCells
    return 'ripple'
  }

  clear(): void {
    this.inside.clear()
  }
}
