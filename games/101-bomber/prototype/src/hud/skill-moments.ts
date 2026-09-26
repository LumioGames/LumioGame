import {
  SKILL_SLOTS,
  type BomberCell,
  type CharacterId,
  type PlayerSkillsView,
  type ProtoRules,
  type SkillId,
  type SkillSlot,
  type U64,
  type WorldSnapshot,
} from '../contract'
import { resolveSkillPickup, type SkillSlots } from '../shared/skill-rules'
import { SLOT_LABEL } from '../present/skill-style'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能相关的 HUD 文案与「快照推技能变化」（纯函数，无 DOM）。
 * 事件（SkillGained / SkillEvolved / SkillFailed / SkillsDropped）在时优先用事件；
 * 数据源没有这些表现事件时，HudBrain 用 {@link diffSkills} 从前后两份快照推出同样的时刻。
 */

export type SkillChange =
  | { kind: 'equip' | 'levelUp'; skill: SkillId; slot: SkillSlot; level: number }
  | { kind: 'evolve'; combo: SkillId; from: readonly [SkillId, SkillId]; slot: SkillSlot }
  | { kind: 'devolve'; combo: SkillId; to: SkillId; slot: SkillSlot }
  | { kind: 'lost'; skill: SkillId; slot: SkillSlot; level: number }

type SkillTables = Pick<ProtoRules, 'skills' | 'combos'>

function comboParts(rules: SkillTables, combo: SkillId): readonly [SkillId, SkillId] | null {
  const row = rules.combos.find((c) => c.result === combo)
  return row ? [row.a, row.b] : null
}

/**
 * 两份快照之间本人技能槽的变化。任一侧缺席（第一份快照 / 数据源没有 skills 字段）→ 不报。
 * 判定顺序：进化（组合技新出现）→ 退化（组合技变回其中一半）→ 升级 → 装上 → 丢失
 * （进化腾出来的槽不算丢失：那一半已并进组合技）。
 */
export function diffSkills(b: PlayerSkillsView | undefined, a: PlayerSkillsView | undefined, rules: SkillTables): SkillChange[] {
  if (!b || !a) return []
  const out: SkillChange[] = []
  const merged = new Set<SkillId>()
  for (const s of SKILL_SLOTS) {
    const bv = b.slots[s]
    const av = a.slots[s]
    if (av && rules.skills[av.skill].combo && bv?.skill !== av.skill) {
      const from = comboParts(rules, av.skill)
      if (from) {
        out.push({ kind: 'evolve', combo: av.skill, from, slot: s })
        merged.add(from[0])
        merged.add(from[1])
      }
    }
  }
  for (const s of SKILL_SLOTS) {
    const bv = b.slots[s]
    const av = a.slots[s]
    if (av && rules.skills[av.skill].combo && bv?.skill !== av.skill) continue
    if (bv && av && rules.skills[bv.skill].combo && bv.skill !== av.skill && comboParts(rules, bv.skill)?.includes(av.skill)) {
      out.push({ kind: 'devolve', combo: bv.skill, to: av.skill, slot: s })
    } else if (bv && av && bv.skill === av.skill) {
      if (av.level > bv.level) out.push({ kind: 'levelUp', skill: av.skill, slot: s, level: av.level })
    } else if (!bv && av) {
      out.push({ kind: 'equip', skill: av.skill, slot: s, level: av.level })
    } else if (bv && !av && !merged.has(bv.skill)) {
      out.push({ kind: 'lost', skill: bv.skill, slot: s, level: bv.level })
    }
  }
  return out
}

/** 「获得 闪现 Lv1」/「闪现 升到 Lv2」。 */
export function skillGainText(c: { kind: 'equip' | 'levelUp'; skill: SkillId; level: number }, rules: Pick<ProtoRules, 'skills'>): string {
  const name = rules.skills[c.skill].name
  if (c.kind === 'levelUp') return `${name} 升到 Lv${c.level}`
  return rules.skills[c.skill].combo ? `获得 ${name}` : `获得 ${name} Lv${c.level}`
}

/** 本人进化横幅：「进化：火焰冲刺！」/「闪现 + 火焰光环」（from 缺席时按配方表序）。 */
export function evolveBanner(combo: SkillId, from: readonly [SkillId, SkillId] | null, rules: SkillTables): { title: string; sub: string } {
  const parts = from ?? comboParts(rules, combo)
  return {
    title: `进化：${rules.skills[combo].name}！`,
    sub: parts ? `${rules.skills[parts[0]].name} + ${rules.skills[parts[1]].name}` : '组合技',
  }
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
      return '前方没有落脚点'
    case 'frozen':
      return '被冻住了，放不了技能'
  }
}

/** 死亡回顾「掉落技能」：「闪现 Lv2、踢弹 Lv1 · 弹射泡泡 退回 泡泡」；什么都没掉为「无」。 */
export function skillsDroppedText(
  skills: readonly { Skill: SkillId; Level: number }[],
  devolved: { Combo: SkillId; To: SkillId } | null,
  rules: Pick<ProtoRules, 'skills'>,
): string {
  const parts = skills.map((s) => `${rules.skills[s.Skill].name} Lv${s.Level}`)
  const main = parts.length ? parts.join('、') : ''
  const dev = devolved ? `${rules.skills[devolved.Combo].name} 退回 ${rules.skills[devolved.To].name}` : ''
  return [main, dev].filter(Boolean).join(' · ') || '无'
}

/** 站在一颗捡不起来的技能糖上时的提示；能捡（或糖会让你进化 / 升级）为 null。 */
export function blockedCandyText(
  slots: SkillSlots,
  candy: { skill: SkillId; level: number },
  rules: Pick<ProtoRules, 'skills' | 'combos' | 'skillMaxLevel'>,
): string | null {
  const r = resolveSkillPickup(rules, slots, candy)
  if (r.kind !== 'reject') return null
  const name = rules.skills[candy.skill].name
  if (r.reason === 'maxLevel') return `${name} 已经满级了`
  if (r.reason === 'comboNoLevels') return `${name} 是组合技，不能再升级`
  const slot = rules.skills[candy.skill].slot
  const held = slots[slot]
  return held ? `${SLOT_LABEL[slot]}已有 ${rules.skills[held.skill].name}，捡不了 ${name}` : `捡不了 ${name}`
}

export type BurnSource = 'aura' | 'firewall'

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
