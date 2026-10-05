import { BombKind } from '../../contract'
import { hash01 } from './rand'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030 / 0033）：炸弹种类 → 表现色调的纯逻辑（无 three 依赖，node 下单测）。
 * 「一眼可辨」：标准 = 橙火；冰冻 = 冰蓝 + 霜壳；中毒 = 毒绿烟雾（爆完还飘一会儿）；麻痹 = 电黄火花。
 * 炸弹本体（外壳罩色 / 引信火花 / 危险光）与爆炸十字（核心 / 热区 / 外圈 / 地面光）共用一张表。
 * 颜色与节奏全部是表现取值（推断待验证）。
 */

export type BombTone = 'fire' | 'frost' | 'toxin' | 'shock'

export const BOMB_TONES: readonly BombTone[] = ['fire', 'frost', 'toxin', 'shock']

export interface TonePalette {
  /** 炸弹外壳罩色（半透明罩在弹体外；null = 不罩，标准弹）。 */
  shell: number | null
  /** 外壳不透明度与自发光（深色弹体透出来会把黄 / 绿压脏：越亮的色调罩得越厚、自己发一点光）。 */
  shellOpacity: number
  shellGlow: number
  /** 引信火花色。 */
  spark: number
  /** 引爆前危险辉光（线性 RGB 系数，0..1）。 */
  danger: readonly [number, number, number]
  /** 引爆前地面危险圈。 */
  ring: number
  /** 爆炸：核心（最亮）/ 热区 / 外圈 / 地面光。 */
  core: number
  hot: number
  rim: number
  glow: number
  /** 危险窗结束后余烟再飘多久（毫秒；0 = 无）。只有中毒弹有。 */
  lingerMs: number
  /** 余烟颜色。 */
  smoke: number
  /** 每格同时跳的电火花数（0 = 无）。只有麻痹弹有。 */
  sparksPerCell: number
}

export const BOMB_TONE: Readonly<Record<BombTone, TonePalette>> = {
  fire: {
    shell: null,
    shellOpacity: 0,
    shellGlow: 0,
    spark: 0xffe58a,
    danger: [1.0, 0.29, 0.17],
    ring: 0xff4b2b,
    core: 0xfff3b0,
    hot: 0xffc93c,
    rim: 0xff7a3d,
    glow: 0xff9a3d,
    lingerMs: 0,
    smoke: 0xffffff,
    sparksPerCell: 0,
  },
  frost: {
    // 冰蓝（原 0xcff4ff 近白，远看分不出）：饱和一些。
    shell: 0x8fdcff,
    shellOpacity: 0.5,
    shellGlow: 0.1,
    spark: 0xcff4ff,
    danger: [0.35, 0.85, 1.0],
    ring: 0x3db8da,
    core: 0xe8fbff,
    hot: 0x9fe3ff,
    rim: 0x3db8da,
    glow: 0x5fd4ff,
    lingerMs: 0,
    smoke: 0xdff4fb,
    sparksPerCell: 0,
  },
  toxin: {
    shell: 0x7ed957,
    shellOpacity: 0.6,
    shellGlow: 0.2,
    spark: 0xc8ff8a,
    danger: [0.45, 1.0, 0.3],
    ring: 0x4fc23a,
    core: 0xe6ffc2,
    hot: 0x9be15d,
    rim: 0x3f9a3a,
    glow: 0x6ddc4a,
    lingerMs: 700,
    smoke: 0x8fcf6a,
    sparksPerCell: 0,
  },
  shock: {
    shell: 0xffe23c,
    shellOpacity: 0.78,
    shellGlow: 0.45,
    spark: 0xfffbd0,
    danger: [1.0, 0.92, 0.25],
    ring: 0xffdc1a,
    core: 0xffffff,
    hot: 0xfff27a,
    rim: 0xffe01a,
    glow: 0xffe84a,
    lingerMs: 0,
    smoke: 0xfffbd0,
    sparksPerCell: 2,
  },
}

/** 炸弹种类（BombView.BomberBombState.BombKind）→ 色调；未知种类按标准橙火。 */
export function bombTone(kind: number): BombTone {
  switch (kind) {
    case BombKind.Freeze:
      return 'frost'
    case BombKind.Toxin:
      return 'toxin'
    case BombKind.Shock:
      return 'shock'
    default:
      return 'fire'
  }
}

/** 赤道金钻刺：穿透弹，或任何带穿透层数的炸弹（与色调正交）。 */
export function bombDrill(kind: number, pierce: number): boolean {
  return kind === BombKind.Pierce || pierce > 0
}

/** 爆炸危险窗结束后的缩没时长（毫秒，与 fx/explosion 同一口径）。 */
export const BLAST_FADE_MS = 100

/** 一次爆炸表现的总时长：危险窗 + 缩没 + 余烟。 */
export function blastLifeMs(tone: BombTone, durMs: number): number {
  return durMs + BLAST_FADE_MS + BOMB_TONE[tone].lingerMs
}

/**
 * 中毒余烟：危险窗结束（afterMs = 0）起飘 lingerMs 毫秒——慢慢升、慢慢胀、线性淡出。
 * @returns alpha 0..1（0 = 不画）、rise 上升高度（格）、scale 相对火球的大小。
 */
export function lingerSmoke(afterMs: number, lingerMs: number): { alpha: number; rise: number; scale: number } {
  if (lingerMs <= 0 || afterMs < 0 || afterMs >= lingerMs) return { alpha: 0, rise: 0, scale: 0 }
  const u = afterMs / lingerMs
  return { alpha: 0.85 * (1 - u), rise: 0.1 + 0.45 * u, scale: 0.7 + 0.5 * Math.sqrt(u) }
}

/** 麻痹弹电火花换位频率（Hz）：小火花在格内跳，不整片频闪（照顾光敏）。 */
export const SPARK_HZ = 14

export interface SparkSeg {
  /** 相对格心的偏移（格）。 */
  dx: number
  dz: number
  /** 离地高度（格）。 */
  y: number
  /** 朝向（绕 Y）与倾斜（绕 Z）。 */
  yaw: number
  tilt: number
  /** 长度（格）。 */
  len: number
}

/** 某格某时刻的电火花（按格坐标 + 爆炸种子 + 时间桶确定，同一桶内逐帧稳定）。 */
export function shockSparks(x: number, y: number, seed: number, nowMs: number, n: number): SparkSeg[] {
  const bucket = Math.floor((nowMs / 1000) * SPARK_HZ)
  const key = (x * 73856093) ^ (y * 19349663) ^ Math.floor(seed * 1000)
  const out: SparkSeg[] = []
  for (let k = 0; k < n; k++) {
    const salt = bucket * 16 + k
    out.push({
      dx: (hash01(key, salt) - 0.5) * 0.7,
      dz: (hash01(key + 1, salt) - 0.5) * 0.7,
      y: 0.15 + hash01(key + 2, salt) * 0.6,
      yaw: hash01(key + 3, salt) * Math.PI * 2,
      tilt: (hash01(key + 4, salt) - 0.5) * 2.2,
      len: 0.2 + hash01(key + 5, salt) * 0.2,
    })
  }
  return out
}
