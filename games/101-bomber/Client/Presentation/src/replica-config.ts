import { DEFAULT_CONFIG, DEFAULT_RULES, UNTIL_BLOCKED, type BomberConfig, type CharacterId,
  type ProtoRules, type SkillId, type SkillParams, type ResourceBoxTier } from './contract'
import type { ReplicaConfig } from './replica-types'
import type { ReplicaCatalog } from './replica-adapter'

type Row = Record<string, string | number | boolean>
const rows = (value: unknown): Row[] => {
  if (!Array.isArray(value)) throw new Error('presentation_config_rows_missing')
  return value as Row[]
}
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('presentation_config_row_missing')
  return value as Row
}
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('presentation_config_number_missing')
  return value
}

/** Only display styling keeps defaults; gameplay values come from activated config readers. */
export function projectReplicaConfig(source: ReplicaConfig): { config: BomberConfig; rules: ProtoRules; catalog: ReplicaCatalog } {
  const config = { ...DEFAULT_CONFIG }
  for (const key of Object.keys(config) as (keyof BomberConfig)[]) {
    if (key === 'hatPileExpireMs' || key === 'hatPileMinStacks' || key === 'hatPileMaxStacks') continue
    if (key === 'speedTierToCellsPerSecond') {
      if (!Array.isArray(source[key]) || !source[key].length) throw new Error('presentation_speed_tiers_missing')
      config[key] = source[key].map(number)
    } else config[key] = number(source[key])
  }
  const rules = structuredClone(DEFAULT_RULES)
  const game = row(source.game), skillRules = row(source.skillRules), display = row(source.presentation)
  const circle = row(source.finalCircle), life = row(source.life), movement = row(source.movement)
  rules.skills = Object.fromEntries(Object.entries(rules.skills)
    .map(([key, skill]) => [key, { ...skill, candyWeight: 0 }])) as ProtoRules['skills']
  const supportedBombCodes = new Set([1, 2, 3, 4, 5, 7])
  const enabledKindCodes = new Set(rows(source.bombKinds).filter(kind => kind.enabled === true)
    .map(kind => number(kind.kindCode)))
  const skillIds = new Map<number, SkillId>()
  const authoredSkills = new Map<number, Row>()
  for (const s of rows(source.skills)) {
    const key = String(s.name) as SkillId
    if (!Object.hasOwn(rules.skills, key)) throw new Error(`presentation_skill_unsupported:${key}`)
    const id = number(s.id)
    if (skillIds.has(id) || [...skillIds.values()].includes(key)) throw new Error(`presentation_skill_duplicate:${key}`)
    skillIds.set(id, key)
    authoredSkills.set(id, s)
    const levels: SkillParams[] = rows(source.skillLevels).filter(l => l.skillId === s.id)
      .sort((a, b) => number(a.level) - number(b.level)).map(l => ({
        cdMs: number(l.cooldownMs), durationMs: number(key === 'fireDash' ? l.wallMs : l.durationMs),
        rangeCells: l.rangeMode === 'UntilObstacle' ? UNTIL_BLOCKED : number(key === 'bounceBubble' ? l.kickRangeCells : l.rangeCells),
        intervalMs: number(l.intervalMs), points: number(l.healPoints), freezeMs: number(l.freezeMs),
        pierceLayers: l.pierceMode === 'FullPowerLine' ? UNTIL_BLOCKED : number(l.pierceLayers),
        slowPermille: key === 'shockBomb' ? number(skillRules.shockSpeedPermille) : 0,
      }))
    if (!levels.length) throw new Error(`presentation_skill_levels_missing:${key}`)
    rules.skills = { ...rules.skills, [key]: { ...rules.skills[key], levels,
      endsProtection: Boolean(s.removesProtection), combo: Boolean(s.isCombo) } }
  }
  const characterIds = new Map<number, CharacterId>()
  const activeSkills = new Map<number, SkillId>()
  const bombSkills = new Set<number>()
  const characterSkills = new Set<number>()
  const candySkills = new Set<number>()
  for (const c of rows(source.characters)) {
    const key = String(c.name) as CharacterId
    if (!(key in rules.characters)) throw new Error(`presentation_character_unsupported:${key}`)
    characterIds.set(number(c.id), key)
    const boundId = number(c.boundSkillId)
    const skill = skillIds.get(boundId)
    if (!skill) throw new Error(`presentation_character_skill_missing:${key}`)
    const bound = authoredSkills.get(boundId)!
    const slot = String(c.boundSlot)
    if ((slot !== 'Active' && slot !== 'Passive') || bound.slot !== slot
      || rules.skills[skill].slot !== slot.toLowerCase() || bound.isCombo !== false)
      throw new Error(`presentation_character_skill_slot:${key}`)
    activeSkills.set(boundId, skill)
    characterSkills.add(boundId)
    rules.characters = { ...rules.characters, [key]: { ...rules.characters[key], skill } }
  }
  for (const [id, key] of skillIds) {
    const skill = authoredSkills.get(id)!
    if (skill.isCombo === true) continue
    const expectedCode = rules.skills[key].bombKind
    if (expectedCode === undefined || !supportedBombCodes.has(expectedCode) || !enabledKindCodes.has(expectedCode)) continue
    if (skill.slot !== 'Bomb' || skill.isCombo !== false || skill.trigger !== 'PlaceBomb'
      || number(skill.bombKindCode) !== expectedCode)
      throw new Error(`presentation_bomb_skill_invalid:${key}`)
    activeSkills.set(id, key)
    bombSkills.add(id)
    const candyWeight = number(skill.candyWeight)
    if (candyWeight > 0) candySkills.add(id)
    rules.skills = { ...rules.skills, [key]: { ...rules.skills[key], candyWeight } }
  }
  rules.playerCount = number(game.playerCount)
  rules.warmupMs = number(game.warmupMs)
  rules.podiumMs = number(game.podiumMs)
  rules.settlementMs = number(game.podiumMs) + number(game.resultsMs)
  rules.finalCircleMs = number(circle.durationMs)
  rules.finalCircleResourcePermille = number(circle.resourceThresholdPermille)
  rules.poisonIntervalMs = number(circle.poisonIntervalMs)
  rules.ringPreviewMs = number(circle.previewMs)
  rules.ringStages = rows(source.circleStages).map(s => ({ atMs: number(s.atMs), size: number(s.sideCells),
    chest: Boolean(s.spawnChest), clearInside: Boolean(s.clearSoft), poisonPoints: number(s.poisonPoints) }))
  rules.healthPackPoints = number(life.healthPackPoints)
  rules.dollFootprintMilli = number(display.footprintMilli)
  rules.dollReachMilli = number(display.forwardReachMilli)
  rules.hatKingPillarMinHats = number(display.hatPillarThreshold)
  rules.waterSpeedPermille = number(movement.waterSpeedPermille)
  rules.skillMaxLevel = number(skillRules.maxLevel)
  rules.freezeCapMs = number(skillRules.freezeCapMs)
  rules.burnIntervalMs = number(skillRules.fireExposureMs)
  rules.burnPointsPerInterval = number(skillRules.firePoints)
  rules.toxinIntervalMs = number(skillRules.toxinIntervalMs)
  rules.toxinPointsPerInterval = number(skillRules.toxinPoints)
  rules.chestHitsRequired = number(row(source.chest).independentBombHits)
  const resourceTiers = new Map<number, ResourceBoxTier>()
  for (const tier of rows(source.resourceTiers)) {
    if (!['Wood', 'Iron', 'Gold'].includes(String(tier.name))) continue
    const id = number(tier.id)
    if (resourceTiers.has(id)) throw new Error(`presentation_resource_tier_duplicate:${id}`)
    resourceTiers.set(id, String(tier.name).toLowerCase() as ResourceBoxTier)
  }
  rows(source.skillCombos)
  rules.combos = []
  return { config, rules, catalog: { characters: characterIds, skills: activeSkills, bombSkills, characterSkills, candySkills,
    circleStages: new Map(rows(source.circleStages).map((s, i) => [number(s.id), i])), resourceTiers } }
}
