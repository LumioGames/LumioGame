import type { World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：棉花兔被动·回春（design §12 的角色例外，D3）。
 * **W0 桩**：签名已冻结，函数体归技能切片。step.ts 在伤害单结算之后、阶段机之前调用（结算期不调）。
 */
export function applyRecovery(w: World): void {
  void w
}
