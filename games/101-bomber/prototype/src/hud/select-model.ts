import {
  CHARACTER_ORDER,
  describeSkill,
  parseCharacterId,
  type AnimalId,
  type BomberConfig,
  type BotDifficulty,
  type CharacterId,
  type ProtoRules,
  type SkillId,
  type SkillSlot,
} from '../contract'

/**
 * 选角界面的纯模型（ADR 0030 / D1：开局仪式里的一屏，`?char=` 可跳过；无 DOM，可单测）。
 * 卡片内容全部来自 `rules.characters` / `rules.skills`，说明文字由 describeSkill 按 Lv1 填值。
 */
export interface SelectCard {
  id: CharacterId
  name: string
  animal: AnimalId
  skill: SkillId
  skillName: string
  slot: SkillSlot
  kind: '主动' | '被动'
  keyHint: string
  desc: string
  tagline: string
}

export type SelectRules = Pick<ProtoRules, 'characters' | 'skills' | 'burnPointsPerInterval' | 'burnIntervalMs' | 'toxinIntervalMs' | 'toxinPointsPerInterval'>

export function selectCards(rules: SelectRules, cfg: Pick<BomberConfig, 'healthPointsPerHeart'>): SelectCard[] {
  return CHARACTER_ORDER.map((id) => {
    const c = rules.characters[id]
    const s = rules.skills[c.skill]
    const active = s.slot === 'active'
    return {
      id,
      name: c.name,
      animal: c.animal,
      skill: c.skill,
      skillName: s.name,
      slot: s.slot,
      kind: active ? '主动' : '被动',
      keyHint: active ? 'Shift / 副按钮' : '自动生效',
      desc: describeSkill(rules, cfg, c.skill, 1),
      tagline: c.tagline,
    }
  })
}

export type SelectMode = 'start' | 'switch'
export type SelectAction = { t: 'move'; d: -1 | 1 } | { t: 'pick'; i: number } | { t: 'confirm' } | { t: 'cancel' }

export interface SelectState {
  index: number
  done: 'confirmed' | 'cancelled' | null
}

/** move 循环；pick 只选中不确认；cancel 只在「换角色」模式有效（开局必须选一个）。 */
export function selectReduce(s: SelectState, a: SelectAction, n: number, mode: SelectMode): SelectState {
  if (s.done || n <= 0) return s
  switch (a.t) {
    case 'move':
      return { ...s, index: (((s.index + a.d) % n) + n) % n }
    case 'pick':
      return a.i >= 0 && a.i < n ? { ...s, index: a.i } : s
    case 'confirm':
      return { ...s, done: 'confirmed' }
    case 'cancel':
      return mode === 'switch' ? { ...s, done: 'cancelled' } : s
  }
}

const PICK_KEYS: Readonly<Record<string, number>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
}

/**
 * 键位：←→（及 ↑↓ / WASD）换卡、1–4 直选、Enter / 空格确认。
 * Esc 不在这里映射：它留给全局暂停键（换角色卡开着时 = 继续游戏，与帮助 / 设置卡一致），见 {@link selectKeysHint}。
 * 换角色的「取消」只走卡上的「取消」按钮（回到暂停卡）。
 */
export function selectKey(code: string): SelectAction | null {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
    case 'ArrowUp':
    case 'KeyW':
      return { t: 'move', d: -1 }
    case 'ArrowRight':
    case 'KeyD':
    case 'ArrowDown':
    case 'KeyS':
      return { t: 'move', d: 1 }
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      return { t: 'confirm' }
  }
  const i = PICK_KEYS[code]
  return i === undefined ? null : { t: 'pick', i }
}

/** 选角卡底部键位提示；须与实际按键行为一致（换角色模式 Esc = 全局暂停键 → 继续游戏）。 */
export function selectKeysHint(mode: SelectMode): string {
  return mode === 'start' ? '←→ 选择 · Enter 开始' : '←→ 选择 · Enter 确定 · Esc 继续游戏'
}

/** 上次选的角色（localStorage）→ 初始选中下标；没有 / 无效为 0。 */
export function initialIndex(last: string | null): number {
  const id = parseCharacterId(last)
  return id ? CHARACTER_ORDER.indexOf(id) : 0
}

/** Bot 难度的中文名（暂停卡 / 选角页脚）。 */
export const AI_LABEL: Readonly<Record<BotDifficulty, string>> = { easy: '简单', normal: '普通', hard: '困难' }

/** 开局规则卡上的「你是谁」一行：「你是 闪电猫 · Shift 闪现」/「你是 棉花兔 · 被动 回春」。 */
export function characterLine(c: SelectCard): string {
  return c.kind === '主动' ? `你是 ${c.name} · Shift ${c.skillName}` : `你是 ${c.name} · 被动 ${c.skillName}`
}
