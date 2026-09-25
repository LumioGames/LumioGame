/**
 * 技能输入（契约 §2.1）：移动与放弹是实体上的 GAS Ability，不是命令 DTO。
 * `方向` 只有四向 + 停（契约胜过 design.md §6.1 的「自由八向」）。上 = 游戏 −Y（屏幕上方、远离镜头）。
 */
export const 方向 = { 停: 0, 上: 1, 下: 2, 左: 3, 右: 4 } as const
export type 方向 = (typeof 方向)[keyof typeof 方向]

/** `移动技能.输入`（TypeId 1）。`按了转弯` 为 true 时，本方向进入转角缓冲（契约 `转角缓冲剩余帧`）。 */
export interface 移动技能输入 {
  方向: 方向
  按了转弯: boolean
}

/** 一次技能激活；放弹技能（TypeId 2）输入为空，落点由规则层按「最近合法格中心」算。 */
export type AbilityActivation =
  | { ability: '移动'; 输入: 移动技能输入 }
  | { ability: '放弹' }
