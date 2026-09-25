import type { World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火墙烧伤（design §12 留火口径，Cause = Burn）。
 * **W0 桩**：签名已冻结，函数体归技能切片（清过期火墙、按 fireZones 下伤害单、每受害者 burnInterval 节拍）。
 */
export function queueBurns(w: World): void {
  void w
}
