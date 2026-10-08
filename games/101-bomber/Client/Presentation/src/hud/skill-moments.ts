import {
  describeSkill,
  type BomberCell,
  type CharacterId,
  type PlayerSkillsView,
  type ProtoRules,
  type SkillId,
  type U64,
  type WorldSnapshot,
} from '../contract'
import { visibleBomb } from '../present/favorite-bomb'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能相关的 HUD 文案与「快照推技能变化」（纯函数，无 DOM）。
 * 事件（SkillGained / SkillEvolved / SkillFailed / SkillsDropped）在时优先用事件；
 * 数据源没有这些表现事件时，HudBrain 用 {@link diffSkills} 从前后两份快照推出同样的时刻。
 */

export type SkillChange = { kind: 'equip' | 'replace'; skill: SkillId }

/** Replicated bomb identity changes only; legacy levels and other slots are inputs, not progression. */
export function diffSkills(b: PlayerSkillsView | undefined, a: PlayerSkillsView | undefined, rules: Pick<ProtoRules, 'skills'>): SkillChange[] {
  if (!b || !a) return []
  const before = b.slots.bomb?.skill
  const after = a.slots.bomb?.skill
  if (!after || before === after || !visibleBomb(after, rules)) return []
  return [{ kind: before ? 'replace' : 'equip', skill: after }]
}

export function bombPickupText(skill: SkillId, rules: Pick<ProtoRules, 'skills' | 'burnPointsPerInterval' | 'burnIntervalMs'>, pointsPerHeart: number): string {
  const detail = describeSkill(rules, { healthPointsPerHeart: pointsPerHeart }, skill, 1)
  return `${rules.skills[skill].name} · ${detail}`
}

export type SkillFailReason = 'cooldown' | 'noSkill' | 'noLanding' | 'frozen'

/** 按了技能键没放出来的提示。 */
export function skillFailText(
  reason: SkillFailReason,
  skill: SkillId | null,
  cdLeftSec: number,
  character: CharacterId | null,
  rules: Pick<ProtoRules, 'skills' | 'characters'>,
): string {
  switch (reason) {
    case 'cooldown': {
      const name = skill ? rules.skills[skill].name : '技能'
      return `${name} 冷却中 · ${Math.max(0.1, cdLeftSec).toFixed(1)} 秒`
    }
    case 'noSkill': {
      const own = character ? rules.skills[rules.characters[character].skill] : null
      return own && own.slot !== 'active' ? `${own.name}是被动技能，自动生效` : '还没有主动技能'
    }
    case 'noLanding':
      // 飞踢（飞腿袋鼠，用户 2026-09-28）复用这个失败原因：面前没有可踢的炸弹。
      return skill === 'flyKick' ? '面前没有能踢的炸弹' : '前方没有落脚点'
    case 'frozen':
      return '被冻住了，放不了技能'
  }
}

/** 死亡回顾「掉落技能」：「闪现 Lv2、踢弹 Lv1 · 弹射泡泡 退回 泡泡」；什么都没掉为「无」。 */
/** Read-only same-kind hint; admission and item mutation belong to Gameplay. */
export function blockedCandyText(
  slots: PlayerSkillsView['slots'],
  candy: { skill: SkillId; level: number },
  rules: Pick<ProtoRules, 'skills'>,
): string | null {
  return slots.bomb?.skill === candy.skill ? `已经装备 ${rules.skills[candy.skill].name}` : null
}

export type BurnSource = 'aura' | 'firewall' | 'fireRegion'

/** 烧伤来自哪片火：在快照的 FireZones 里找 owner 的、覆盖该格的那片（光环优先）；找不到为 null。 */
export function burnSourceAt(snap: WorldSnapshot | null, owner: U64, cell: BomberCell): BurnSource | null {
  for (const z of snap?.FireZones ?? []) {
    if (z.owner !== owner) continue
    if (z.cells.some((c) => c.X === cell.X && c.Y === cell.Y)) return z.source
  }
  return null
}

/** 「火焰光环」/「火墙」/「火」。 */
export function burnSourceName(src: BurnSource | null): string {
  return src === 'aura' ? '火焰光环' : src === 'firewall' ? '火墙' : '火'
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：中招提示里的「谁的弹」——别人（名字）、自己，或数据源没说（快照兜底）。
 */
export type StatusSource = { name: string } | 'self' | null

const sourceSeg = (src: { name: string } | 'self'): string => (src === 'self' ? '自己' : ` ${src.name} `)
const secSeg = (sec: number): string => String(Math.round(sec * 10) / 10)

/** 本人中毒：「中了 豆豆熊 的中毒弹！掉血 3 秒 · 吃血包或放泡泡能解毒」（秒数缺席 = 快照兜底，只说持续掉血）。 */
export function poisonedText(src: StatusSource, sec: number | null): string {
  const head = src ? `中了${sourceSeg(src)}的中毒弹！` : '中毒了！'
  const body = sec !== null && src ? `掉血 ${secSeg(sec)} 秒` : '持续掉血'
  return `${head}${body} · 吃血包或放泡泡能解毒`
}

/** 本人麻痹：「中了 灰灰猫 的麻痹弹！走得很慢 2 秒」。 */
export function shockedText(src: StatusSource, sec: number | null): string {
  const head = src ? `中了${sourceSeg(src)}的麻痹弹！` : '被麻痹了！'
  return sec !== null && src ? `${head}走得很慢 ${secSeg(sec)} 秒` : `${head}走得很慢`
}

/** 本人解毒：「泡泡解毒了」/「血包解毒了」/「解毒了」（快照兜底不知道怎么解的）。 */
export function curedText(reason: 'bubble' | 'healthPack' | null): string {
  return reason === 'bubble' ? '泡泡解毒了' : reason === 'healthPack' ? '血包解毒了' : '解毒了'
}
