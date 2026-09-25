import type { 移动技能输入 } from '../contract'
import type { SimPlayer, World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：踢弹（design §8.4 被动）/ 弹射泡泡（泡泡期内）。
 * **W0 桩**：签名已冻结，函数体归技能切片。
 */

/** 推进方向（含副方向）相邻格的静止未爆炸弹被踢出；在 applyMove 之前调用（step.ts）。 */
export function tryKick(w: World, p: SimPlayer, input: 移动技能输入): void {
  void w
  void p
  void input
}

/** 滑行中的炸弹按 kickSpeedMilli 前进；前方不通即停，玩家不挡；进入的第一个水格熄灭（RESOLUTIONS #9）。 */
export function advanceKickedBombs(w: World): void {
  void w
}
