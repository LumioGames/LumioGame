import type { ProtoRules, SkillId, SkillSlot } from '../contract'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：吃技能糖的判定（design §8.1–§8.3，D6 / D16），纯函数。
 * 规则层（拾取）、Bot（值不值得去捡）与 HUD（提示）共用这一份，免得三处各写一套。
 */

export interface SkillHolding {
  skill: SkillId
  level: number
  bound: boolean
}

export type SkillSlots = Readonly<Record<SkillSlot, SkillHolding | null>>

export type SkillPickupOutcome =
  | { kind: 'levelUp'; slot: SkillSlot; level: number }
  | { kind: 'equip'; slot: SkillSlot; level: number }
  | {
      kind: 'evolve'
      combo: SkillId
      /** 组合技落在哪个槽（= SKILLS[combo].slot）。 */
      slot: SkillSlot
      /** 另一半原来所在、进化后腾空的槽；原地进化为 null。 */
      freed: SkillSlot | null
      /** [槽里原有的那一半, 糖里的那一半]；组合技 bound = 任一半 bound。 */
      parts: readonly [SkillHolding, SkillHolding]
    }
  | { kind: 'reject'; reason: 'maxLevel' | 'comboNoLevels' | 'slotTaken' }

/**
 * 一颗技能糖对当前技能槽的结果，按序判：
 * 1. 同槽同技能 → 升一级（糖本身的等级不看，§8.3）；组合技不能升级；满级拒收。专属技能同样可升。
 * 2. 糖是基础技能：按配方表序找「另一半」正好在某个槽（且那一半不是组合技）；组合技的目标槽要么就是那个槽、
 *    要么是空槽 → 进化。
 * 3. 糖的槽空着 → 装上（组合技糖装 1 级）。
 * 4. 否则拒收（本轮没有 Shift 替换确认），糖留在地上。
 */
export function resolveSkillPickup(
  t: Pick<ProtoRules, 'skills' | 'combos' | 'skillMaxLevel'>,
  slots: SkillSlots,
  candy: { skill: SkillId; level: number },
): SkillPickupOutcome {
  const def = t.skills[candy.skill]
  const held = slots[def.slot]
  if (held && held.skill === candy.skill) {
    if (def.combo) return { kind: 'reject', reason: 'comboNoLevels' }
    if (held.level >= t.skillMaxLevel) return { kind: 'reject', reason: 'maxLevel' }
    return { kind: 'levelUp', slot: def.slot, level: held.level + 1 }
  }
  if (!def.combo) {
    for (const row of t.combos) {
      if (row.a !== candy.skill && row.b !== candy.skill) continue
      const other = row.a === candy.skill ? row.b : row.a
      const s = slotHolding(slots, other)
      if (s === null) continue
      const have = slots[s]!
      if (t.skills[have.skill].combo) continue
      const r = t.skills[row.result].slot
      if (r !== s && slots[r] !== null) continue
      return {
        kind: 'evolve',
        combo: row.result,
        slot: r,
        freed: s !== r ? s : null,
        parts: [
          { skill: have.skill, level: have.level, bound: have.bound },
          { skill: candy.skill, level: candy.level, bound: false },
        ],
      }
    }
  }
  if (slots[def.slot] === null) return { kind: 'equip', slot: def.slot, level: def.combo ? 1 : Math.max(1, candy.level) }
  return { kind: 'reject', reason: 'slotTaken' }
}

const SLOT_ORDER: readonly SkillSlot[] = ['bomb', 'active', 'passive']

function slotHolding(slots: SkillSlots, skill: SkillId): SkillSlot | null {
  for (const s of SLOT_ORDER) if (slots[s]?.skill === skill) return s
  return null
}
