import type { SkillId, SkillSlot } from '../contract'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能的表现数据——HUD 技能条、触屏技能按钮、选角卡与 3D 视图共用一份，
 * 免得各画各的。纯数据，不含规则；颜色与图形均为表现取值（推断待验证）。
 */

const svg = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`

/** 技能图标：内联 SVG，全部用 currentColor（颜色由 CSS / SKILL_COLOR 决定），不用 emoji。静态可信，可进 innerHTML。 */
export const SKILL_ICON: Readonly<Record<SkillId, string>> = {
  // 回春：心 + 一片叶子
  regen: svg(
    '<path fill="currentColor" d="M11 20.5s-6.8-4.1-8.7-8.4C1 9 2.9 5.4 6.3 5.4c1.9 0 3.4 1.1 4.7 2.8 1.3-1.7 2.8-2.8 4.7-2.8 3.4 0 5.3 3.6 4 6.7-1.9 4.3-8.7 8.4-8.7 8.4z" opacity=".9"/>' +
      '<path d="M16.5 2.5c3.6.4 5 3 4.6 6.3-3.2.3-5.2-1.6-4.6-6.3z" fill="#fff" opacity=".85"/>',
  ),
  // 泡泡：圆泡 + 高光
  bubble: svg(
    '<circle cx="12" cy="12.5" r="8.3" stroke="currentColor" stroke-width="2.2" fill="none"/>' +
      '<path d="M7.6 10.4a4.8 4.8 0 0 1 3.4-3.2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="18.6" cy="4.6" r="2" fill="currentColor"/>',
  ),
  // 闪现：闪电
  blink: svg('<path fill="currentColor" d="M14.2 1.8 4.6 13.9h6.3L9.4 22.2l10-12.6h-6.4z"/>'),
  // 火焰光环：火苗 + 地面一圈
  fireAura: svg(
    '<path fill="currentColor" d="M12.3 2.4c.5 2.9 4.2 4.9 4.2 9.5a4.5 4.5 0 0 1-9 0c0-2.3 1.1-3.6 2.3-5 .3 1.5.9 2.4 1.9 2.8-.5-2.8.3-4.9.6-7.3z"/>' +
      '<ellipse cx="12" cy="19.2" rx="9" ry="2.6" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  ),
  // 踢弹：靴子 + 小弹
  kick: svg(
    '<path fill="currentColor" d="M4 3.5h5v8.2l5.4 2.6c1.2.6 1.9 1.8 1.9 3.1V19H4z"/>' +
      '<circle cx="19.4" cy="9.4" r="3.2" fill="currentColor" opacity=".8"/>',
  ),
  // 冰冻弹：弹 + 雪花
  freezeBomb: svg(
    '<circle cx="10" cy="14" r="6.8" fill="currentColor"/>' +
      '<path d="M18.5 2.5v7M15.3 4.3l6.4 3.4M21.7 4.3l-6.4 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M10 10.4v7.2M6.9 12.2l6.2 3.6M13.1 12.2l-6.2 3.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>',
  ),
  // 穿透弹：弹 + 钻头
  pierceBomb: svg(
    '<circle cx="9.5" cy="14.5" r="6.8" fill="currentColor"/>' +
      '<path fill="currentColor" d="m14.5 9.5 7.8-7.3-2.6 10.2-2.2-.6z"/>' +
      '<path d="M6.5 14.5h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>',
  ),
  // 火焰冲刺：闪电 + 身后火苗
  fireDash: svg(
    '<path fill="currentColor" d="M16.4 1.8 8.8 12h5l-1.3 9.2 8.2-11h-5.1z"/>' +
      '<path fill="currentColor" opacity=".75" d="M5.6 9.5c.4 2 2.9 3.3 2.9 6.5a3.1 3.1 0 0 1-6.2 0c0-1.6.8-2.5 1.6-3.4.2 1 .6 1.7 1.3 2-.4-2 .1-3.4.4-5.1z"/>',
  ),
  // 弹射泡泡：泡泡 + 弹出箭头
  bounceBubble: svg(
    '<circle cx="10" cy="13" r="7.5" stroke="currentColor" stroke-width="2.2" fill="none"/>' +
      '<path d="M6.4 11.2a4.3 4.3 0 0 1 3-2.9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M15.5 7.5 21.5 2.5M16.8 2.5h4.7v4.7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  // 冰川弹：弹 + 雪花 + 钻头
  glacierBomb: svg(
    '<circle cx="9.5" cy="14.5" r="6.8" fill="currentColor"/>' +
      '<path fill="currentColor" d="m14.5 9.5 7.8-7.3-2.6 10.2-2.2-.6z"/>' +
      '<path d="M9.5 11v7M6.5 12.8l6 3.4M12.5 12.8l-6 3.4" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>',
  ),
}

/** 技能主色（0xRRGGBB）：技能糖外壳、技能条光环、组合技光环、闪现拖尾。表现取值（推断待验证）。 */
export const SKILL_COLOR: Readonly<Record<SkillId, number>> = {
  regen: 0xff8fb0,
  bubble: 0x7fe3ff,
  blink: 0xffd84d,
  fireAura: 0xff7a3d,
  kick: 0xb57bff,
  freezeBomb: 0x9fe3ff,
  pierceBomb: 0xc9ced6,
  fireDash: 0xff5a2a,
  bounceBubble: 0x3db8da,
  glacierBomb: 0xbfefff,
}

/** SKILL_COLOR → CSS 颜色串（'#rrggbb'）。 */
export const skillCss = (id: SkillId): string => `#${SKILL_COLOR[id].toString(16).padStart(6, '0')}`

/** 组合技在玩偶身上的「形态」：腰间光环色、环绕小球色、自发光强度、小球材质（所有人可见，D4 / B）。 */
export interface ComboForm {
  ring: number
  orb: number
  glow: number
  orbMat: 'flame' | 'glow'
}

/** 只有组合技有形态；键集合 = COMBOS 的 result 集合（skill-style.test 守护）。 */
export const COMBO_FORM: Readonly<Partial<Record<SkillId, ComboForm>>> = {
  fireDash: { ring: 0xff7a3d, orb: 0xffc93c, glow: 0.14, orbMat: 'flame' },
  bounceBubble: { ring: 0x7fe3ff, orb: 0xffffff, glow: 0.1, orbMat: 'glow' },
  glacierBomb: { ring: 0xbfefff, orb: 0x9fe3ff, glow: 0.12, orbMat: 'glow' },
}

/** 技能槽的中文名（HUD 空槽、选角卡槽位徽标）。 */
export const SLOT_LABEL: Readonly<Record<SkillSlot, string>> = { bomb: '炸弹槽', active: '主动', passive: '被动' }
