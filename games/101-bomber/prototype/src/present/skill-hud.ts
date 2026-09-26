import {
  SKILL_SLOTS,
  describeSkill,
  skillParams,
  type BomberConfig,
  type CharacterId,
  type PlayerView,
  type ProtoRules,
  type SkillId,
  type SkillSlot,
} from '../contract'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：HUD 技能条、回春环与触屏技能按钮的纯模型（无 DOM，可单测）。
 * 只读快照里的 `PlayerView.skills`；缺席（引擎 Replica 没有这个字段）时退化成三个空槽、没有回春环、没有按钮。
 */

export interface SkillChipModel {
  slot: SkillSlot
  skill: SkillId | null
  name: string
  level: number
  maxLevel: number
  /** 专属技能（或含专属的组合技）。 */
  bound: boolean
  combo: boolean
  /** 只有主动槽有冷却：剩余比例 0..1（0 = 没在冷却）、剩余秒数、能不能放。 */
  cdFrac: number
  cdSec: number
  ready: boolean
  /** 泡泡 / 光环的持续剩余比例 0..1（0 = 没在生效）。 */
  effectFrac: number
  /** 操作提示：炸弹槽「放弹时」· 主动「Shift」/「副按钮」· 被动「自动」。 */
  key: string
  /** describeSkill(当前等级)，给悬停提示用；空槽为空串。 */
  desc: string
}

export interface RegenRingModel {
  visible: boolean
  /** 本轮计时进度 0..1。 */
  frac: number
  secLeft: number
}

export interface SkillHudModel {
  character: CharacterId | null
  chips: readonly [SkillChipModel, SkillChipModel, SkillChipModel]
  regen: RegenRingModel
  frozen: boolean
  bubbled: boolean
  /** 活着且未出局（技能按钮可按的前提）。 */
  alive: boolean
}

/** 触屏技能按钮的显示状态；主动槽为空（棉花兔）时为 null → 按钮隐藏。 */
export interface SkillButtonView {
  skill: SkillId
  label: string
  level: number
  cdFrac: number
  cdSec: number
  ready: boolean
  effect: boolean
  disabled: boolean
}

export type SkillHudRules = Pick<ProtoRules, 'skills' | 'skillMaxLevel' | 'burnPointsPerInterval' | 'burnIntervalMs'>
export type SkillHudConfig = Pick<BomberConfig, 'maxHealthPoints' | 'healthPointsPerHeart'>

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v)

/** 操作提示文案（选角卡与技能条共用）。 */
export function slotKeyHint(slot: SkillSlot, touch: boolean): string {
  if (slot === 'bomb') return '放弹时'
  if (slot === 'passive') return '自动'
  return touch ? '副按钮' : 'Shift'
}

function emptyChip(slot: SkillSlot, touch: boolean): SkillChipModel {
  return {
    slot,
    skill: null,
    name: '',
    level: 0,
    maxLevel: 0,
    bound: false,
    combo: false,
    cdFrac: 0,
    cdSec: 0,
    ready: false,
    effectFrac: 0,
    key: slotKeyHint(slot, touch),
    desc: '',
  }
}

const HIDDEN_REGEN: RegenRingModel = { visible: false, frac: 0, secLeft: 0 }

/**
 * @param renderTick 插值后的渲染 Tick（小数），冷却 / 持续环因此逐帧平滑。
 * @param rate Tick / 秒。
 */
export function skillHudModel(
  p: PlayerView | undefined,
  renderTick: number,
  rate: number,
  rules: SkillHudRules,
  cfg: SkillHudConfig,
  touch: boolean,
): SkillHudModel {
  const sk = p?.skills
  if (!p || !sk) {
    return {
      character: null,
      chips: [emptyChip('bomb', touch), emptyChip('active', touch), emptyChip('passive', touch)],
      regen: HIDDEN_REGEN,
      frozen: false,
      bubbled: false,
      alive: !!p && p.玩家属性.血量当前 > 0 && !p.eliminated,
    }
  }
  const hp = p.玩家属性.血量当前
  const alive = hp > 0 && !p.eliminated
  const frozen = renderTick < sk.frozenUntilTick
  const chip = (slot: SkillSlot): SkillChipModel => {
    const v = sk.slots[slot]
    if (!v) return emptyChip(slot, touch)
    const def = rules.skills[v.skill]
    const c: SkillChipModel = {
      ...emptyChip(slot, touch),
      skill: v.skill,
      name: def.name,
      level: v.level,
      maxLevel: def.combo ? 1 : rules.skillMaxLevel,
      bound: v.bound,
      combo: def.combo,
      desc: describeSkill(rules, cfg, v.skill, v.level),
    }
    if (slot === 'active') {
      const total = sk.cdUntilTick - sk.cdFromTick
      const left = Math.max(0, sk.cdUntilTick - renderTick)
      c.cdFrac = total > 0 ? clamp01(left / total) : 0
      c.cdSec = left / rate
      c.ready = left <= 0 && alive && !frozen
    }
    const until = v.skill === 'bubble' || v.skill === 'bounceBubble' ? sk.bubbleUntilTick : v.skill === 'fireAura' ? sk.auraUntilTick : 0
    const dur = Math.ceil((skillParams(rules.skills, v.skill, v.level).durationMs * rate) / 1000)
    c.effectFrac = until > renderTick && dur > 0 ? clamp01((until - renderTick) / dur) : 0
    return c
  }
  const passive = sk.slots.passive
  const span = sk.regenNextTick - sk.regenFromTick
  const regen: RegenRingModel =
    passive?.skill === 'regen' && hp > 0 && hp < cfg.maxHealthPoints && span > 0
      ? { visible: true, frac: clamp01((renderTick - sk.regenFromTick) / span), secLeft: Math.max(0, (sk.regenNextTick - renderTick) / rate) }
      : HIDDEN_REGEN
  return {
    character: sk.character,
    chips: [chip(SKILL_SLOTS[0]), chip(SKILL_SLOTS[1]), chip(SKILL_SLOTS[2])],
    regen,
    frozen,
    bubbled: renderTick < sk.bubbleUntilTick,
    alive,
  }
}

/** 主动槽 → 触屏技能按钮；空槽为 null（按钮隐藏）。 */
export function skillButtonView(m: SkillHudModel): SkillButtonView | null {
  const a = m.chips[1]
  if (!a.skill) return null
  return {
    skill: a.skill,
    label: a.name,
    level: a.level,
    cdFrac: a.cdFrac,
    cdSec: a.cdSec,
    ready: a.ready,
    effect: a.effectFrac > 0,
    disabled: !m.alive || m.frozen,
  }
}
