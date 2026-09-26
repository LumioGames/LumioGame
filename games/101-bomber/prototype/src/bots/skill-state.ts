import { BombKind, msToTicks, skillParams, 方向, type CharacterId, type PlayerView, type ProtoRules, type SkillId, type SkillParams } from '../contract'
import type { SkillSlots } from '../shared/skill-rules'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：Bot 只从快照读技能状态（PlayerView.skills），不碰规则层。
 * 快照没有 skills（第 3 轮夹具）时一律当「无角色、无技能」，旧行为不变。
 */
export interface HeldSkill {
  id: SkillId
  level: number
}

export interface SkillSnapshot {
  character: CharacterId | null
  facing: 方向
  active: HeldSkill | null
  passive: HeldSkill | null
  bomb: HeldSkill | null
  cdUntil: number
  bubbleUntil: number
  auraUntil: number
  frozenUntil: number
  blinkTick: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹的中毒到此 Tick（不含）；0 = 没中毒。 */
  toxinUntil: number
}

const NONE: SkillSnapshot = {
  character: null,
  facing: 方向.停,
  active: null,
  passive: null,
  bomb: null,
  cdUntil: 0,
  bubbleUntil: 0,
  auraUntil: 0,
  frozenUntil: 0,
  blinkTick: 0,
  toxinUntil: 0,
}

export function readSkills(p: PlayerView): SkillSnapshot {
  const s = p.skills
  if (!s) return NONE
  const held = (v: { skill: SkillId; level: number } | null | undefined): HeldSkill | null => (v ? { id: v.skill, level: v.level } : null)
  return {
    character: s.character,
    facing: s.facing,
    active: held(s.slots.active),
    passive: held(s.slots.passive),
    bomb: held(s.slots.bomb),
    cdUntil: s.cdUntilTick,
    bubbleUntil: s.bubbleUntilTick,
    auraUntil: s.auraUntilTick,
    frozenUntil: s.frozenUntilTick,
    blinkTick: s.blinkTick,
    toxinUntil: s.toxinUntilTick ?? 0,
  }
}

/** 给 shared/skill-rules resolveSkillPickup 用的槽视图（绑定信息照抄快照）。 */
export function slotsOf(p: PlayerView): SkillSlots {
  const s = p.skills
  const h = (v: { skill: SkillId; level: number; bound: boolean } | null | undefined) => (v ? { skill: v.skill, level: v.level, bound: v.bound } : null)
  return { bomb: h(s?.slots.bomb), active: h(s?.slots.active), passive: h(s?.slots.passive) }
}

/** 主动技能在 now 可用：有、冷却已过、没被冻住。 */
export function activeReady(s: SkillSnapshot, now: number): boolean {
  return s.active !== null && s.cdUntil <= now && s.frozenUntil <= now
}

export function paramsOf(rules: Pick<ProtoRules, 'skills'>, h: HeldSkill): SkillParams {
  return skillParams(rules.skills, h.id, h.level)
}

/** 泡泡 / 光环持续的 Tick（同规则层 msToTicks 口径）。 */
export function durationTicks(rules: Pick<ProtoRules, 'skills'>, h: HeldSkill, hz: number): number {
  return msToTicks(paramsOf(rules, h).durationMs, hz)
}

export const isBubbleSkill = (id: SkillId): boolean => id === 'bubble' || id === 'bounceBubble'
export const isBlinkSkill = (id: SkillId): boolean => id === 'blink' || id === 'fireDash'

/** 自己放出的炸弹种类（炸弹槽技能的 bombKind；空槽 = Standard）。 */
export function ownBombKind(rules: Pick<ProtoRules, 'skills'>, s: SkillSnapshot): BombKind {
  return s.bomb ? (rules.skills[s.bomb.id].bombKind ?? BombKind.Standard) : BombKind.Standard
}

/** 自己炸弹的穿透层数（穿透弹 / 冰川弹）。 */
export function ownPierce(rules: Pick<ProtoRules, 'skills'>, s: SkillSnapshot): number {
  return s.bomb ? paramsOf(rules, s.bomb).pierceLayers : 0
}

/** 能踢弹：被动踢弹，或弹射泡泡且泡泡中。返回滑行格数。 */
export function hasKick(rules: Pick<ProtoRules, 'skills'>, s: SkillSnapshot, now: number): { range: number } | null {
  if (s.passive?.id === 'kick') return { range: paramsOf(rules, s.passive).rangeCells }
  if (s.active?.id === 'bounceBubble' && s.bubbleUntil > now) return { range: paramsOf(rules, s.active).rangeCells }
  return null
}

/** 泡泡护体到的 Tick（不含）；不在泡泡里 = −1。 */
export function immuneUntilOf(s: SkillSnapshot, now: number): number {
  return s.bubbleUntil > now ? s.bubbleUntil : -1
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：中毒还会掉的半心点（按剩余 Tick ÷ 间隔向上取整估，偏保守）；没中毒 = 0。
 * 泡泡与血包都能解毒——Bot 用它决定「开泡泡解毒 / 满血也去吃血包」。
 */
export function toxinPointsLeft(rules: Pick<ProtoRules, 'toxinIntervalMs' | 'toxinPointsPerInterval'>, s: SkillSnapshot, now: number, hz: number): number {
  if (s.toxinUntil <= now) return 0
  const interval = Math.max(1, msToTicks(rules.toxinIntervalMs, hz))
  return Math.ceil((s.toxinUntil - now) / interval) * rules.toxinPointsPerInterval
}
