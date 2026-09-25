import type { SimPlayer, World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：主动槽技能（Shift / 副按钮）。
 * **W0 桩**：签名已冻结，函数体归技能切片（泡泡 / 闪现 / 火焰光环 / 火焰冲刺 / 弹射泡泡，冷却与失败事件）。
 * 冻结门在 step.ts（冻结中按技能键发 SkillFailed 'frozen'，不会走到这里）。
 */
export function applySkill(w: World, p: SimPlayer, pressed: boolean): void {
  void w
  void p
  void pressed
}
