import type { PlayerSkillsView } from '../../contract'
import { hash01 } from './rand'

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：玩偶中招状态表现的纯逻辑（无 three 依赖，node 下单测）。
 *   - 中毒（skills.toxinUntilTick）：头顶一圈冒绿泡（往上飘再破）+ 整体略微偏绿；
 *   - 麻痹（skills.shockUntilTick）：身上跳电黄电弧 + 走路步频放慢 + 轻微打颤；
 *   - 冻住（skills.frozenUntilTick，ADR 0030）：色调冰蓝，优先于中毒绿。
 * 坐标全部是模型单位（× 玩偶缩放 ≈ 1.2 才是格），横向外沿收在 0.7 格脚印里（ADR 0032，测试守护）。
 * 取值为表现取值（推断待验证）。
 */

export const STATUS_FX = {
  /** 冻住的冰蓝色调（乘在顶点色上）。 */
  frozenTint: 0xcfefff,
  /** 中毒的淡绿色调（「略微」：每通道 ≥ 0xb0，不压暗玩偶）。 */
  toxinTint: 0xd8f5c8,
  /** 同时冒的绿泡数。 */
  toxinBubbles: 4,
  /** 一个泡从冒出到破的周期（秒）。 */
  toxinBubblePeriod: 1.1,
  /**
   * 冒出高度（模型单位，脚底起）与升高量：从头顶一圈（头心 0.82、半径 0.26）冒出往上飘——
   * 从肚子冒的话大半程都埋在身体 / 头里看不见（脚印只有 0.7 格，泡没法往外放）。
   */
  toxinBubbleStartY: 1.04,
  toxinBubbleRise: 0.6,
  /** 泡离身体中轴的最大水平距离（模型单位）。 */
  toxinBubbleOrbit: 0.2,
  /** 泡最大半径（模型单位）。 */
  toxinBubbleR: 0.06,
  /** 泡在周期的这一比例之后开始「破」（快速缩没）。 */
  toxinBubblePopAt: 0.82,
  /** 同时跳的电弧数与换位频率（Hz，小电弧跳位置，不整身频闪）。 */
  shockArcs: 4,
  shockArcHz: 12,
  /** 电弧中心离身体中轴的距离、弧长范围（模型单位）。 */
  shockArcRadius: 0.24,
  shockArcLenMin: 0.16,
  shockArcLenMax: 0.24,
  /** 麻痹时每走一格迈步的相位倍率（< 1 = 步子慢、像拖着腿）。 */
  shockGait: 0.55,
  /** 麻痹打颤的幅度（弧度）与频率（Hz）。 */
  shockTremble: 0.035,
  shockTrembleHz: 22,
} as const

export interface DollStatus {
  frozen: boolean
  poisoned: boolean
  shocked: boolean
}

/** 快照技能状态 → 玩偶此刻的中招状态（UntilTick 不含；可选字段缺席 = 0 = 没有）。 */
export function dollStatus(sk: PlayerSkillsView | undefined, renderTick: number): DollStatus {
  return {
    frozen: renderTick < (sk?.frozenUntilTick ?? 0),
    poisoned: renderTick < (sk?.toxinUntilTick ?? 0),
    shocked: renderTick < (sk?.shockUntilTick ?? 0),
  }
}

/** 玩偶整体色调：冻住冰蓝 > 中毒淡绿 > 白（不染）。 */
export function statusTint(s: DollStatus): number {
  if (s.frozen) return STATUS_FX.frozenTint
  if (s.poisoned) return STATUS_FX.toxinTint
  return 0xffffff
}

/** 每走一格的迈步相位倍率：冻住 0（不迈步），麻痹 shockGait，其余 1。 */
export function gaitRate(s: DollStatus): number {
  if (s.frozen) return 0
  if (s.shocked) return STATUS_FX.shockGait
  return 1
}

/** 麻痹打颤（绕 Z 的小角度，弧度）；按 id 错相。 */
export function shockTremble(t: number, id: number): number {
  const w = Math.PI * 2 * STATUS_FX.shockTrembleHz
  return STATUS_FX.shockTremble * (0.6 * Math.sin(w * t + id) + 0.4 * Math.sin(w * 1.7 * t + id * 3))
}

export interface BubbleFx {
  /** 相对玩偶脚底中心（模型单位）。 */
  dx: number
  y: number
  dz: number
  /** 半径（模型单位，0 = 这一刻刚破）。 */
  r: number
}

/** 中毒绿泡：第 k 个泡在周期内的位置与大小；每个周期换一个冒出的方位。按 (t, id) 确定。 */
export function toxinBubbles(t: number, id: number): BubbleFx[] {
  const n = STATUS_FX.toxinBubbles
  const P = STATUS_FX.toxinBubblePeriod
  const out: BubbleFx[] = []
  const off = hash01(id, 11)
  for (let k = 0; k < n; k++) {
    const x = t / P + k / n + off
    const cycle = Math.floor(x)
    const u = x - cycle
    const ang = hash01(id * 31 + k, cycle) * Math.PI * 2
    // 越往上越靠中轴一点，像从头上冒出来往上飘。
    const rad = STATUS_FX.toxinBubbleOrbit * (0.8 + 0.2 * hash01(id * 31 + k, cycle + 7)) * (1 - 0.3 * u)
    const pop = STATUS_FX.toxinBubblePopAt
    // 先由小胀大，过了 popAt 快速缩没（「破」）。
    const grow = u < pop ? 0.35 + 0.65 * (u / pop) : Math.max(0, 1 - (u - pop) / (1 - pop))
    out.push({
      dx: Math.cos(ang) * rad,
      y: STATUS_FX.toxinBubbleStartY + STATUS_FX.toxinBubbleRise * u,
      dz: Math.sin(ang) * rad,
      r: STATUS_FX.toxinBubbleR * grow,
    })
  }
  return out
}

export interface ArcFx {
  /** 绕身体中轴的方位角（弧度）；弧段中心在半径 shockArcRadius 的圆上，沿切向摆放。 */
  ang: number
  /** 中心高度（模型单位，脚底起）。 */
  y: number
  /** 沿切向面内的倾斜（弧度）。 */
  tilt: number
  /** 弧长（模型单位）。 */
  len: number
}

/** 麻痹电弧：每 1 / shockArcHz 秒整体换一次位置（同一时间桶内逐帧稳定）。 */
export function shockArcs(t: number, id: number): ArcFx[] {
  const bucket = Math.floor(t * STATUS_FX.shockArcHz)
  const out: ArcFx[] = []
  for (let k = 0; k < STATUS_FX.shockArcs; k++) {
    const key = id * 97 + k
    out.push({
      ang: hash01(key, bucket) * Math.PI * 2,
      y: 0.15 + hash01(key, bucket + 1e5) * 0.85,
      tilt: (hash01(key, bucket + 2e5) - 0.5) * 2.4,
      len: STATUS_FX.shockArcLenMin + hash01(key, bucket + 3e5) * (STATUS_FX.shockArcLenMax - STATUS_FX.shockArcLenMin),
    })
  }
  return out
}
