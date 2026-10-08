import type { CharacterId, ProtoRules, SkillId } from '../contract'

/** ADR-0047 display metadata until the character config exports a favorite field. */
export const FAVORITE_BOMB: Readonly<Record<CharacterId, SkillId>> = Object.freeze({
  rabbit: 'splitBomb',
  duck: 'freezeBomb',
  cat: 'remoteBomb',
  bear: 'fireBomb',
  kangaroo: 'pierceBomb',
})

export const SPECIAL_BOMB_IDS = ['fireBomb', 'freezeBomb', 'remoteBomb', 'splitBomb', 'pierceBomb', 'toxinBomb'] as const

/** Equipped slots are already filtered by catalog.bombSkills in the replica adapter. */
export function visibleBomb(skill: SkillId, rules: Pick<ProtoRules, 'skills'>): boolean {
  const row = rules.skills[skill]
  return SPECIAL_BOMB_IDS.some((id) => id === skill) && row?.slot === 'bomb' && !row.combo
}
