import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, UNTIL_BLOCKED } from './contract'
import { projectReplicaConfig } from './replica-config'
import type { ReplicaConfig } from './replica-types'

function fixture(): ReplicaConfig {
  return { ...DEFAULT_CONFIG, groundLayer: 0, obstacleLayer: 1,
      game: { playerCount: 8, warmupMs: 3000, podiumMs: 1000, resultsMs: 2000 },
      skillRules: { shockSpeedPermille: 300, maxLevel: 3, freezeCapMs: 2500,
        fireExposureMs: 1000, firePoints: 1, toxinIntervalMs: 1000, toxinPoints: 1 },
      presentation: { footprintMilli: 700, forwardReachMilli: 100, hatPillarThreshold: 5 },
      finalCircle: { durationMs: 90000, resourceThresholdPermille: 200, poisonIntervalMs: 1000, previewMs: 2000 },
      life: { healthPackPoints: 2 }, movement: { waterSpeedPermille: 500 }, chest: { independentBombHits: 3 },
      characters: [{ id: 118003, name: 'cat', boundSkillId: 8, boundSlot: 'Active' }],
      bombKinds: [{ id: 119004, name: 'Pierce', kindCode: 3, enabled: true }],
      skills: [{ id: 5, name: 'kick', slot: 'Passive', bombKindCode: 0 },
        { id: 7, name: 'pierceBomb', slot: 'Bomb', bombKindCode: 3 },
        { id: 8, name: 'fireDash', slot: 'Active', bombKindCode: 0 },
        { id: 9, name: 'bounceBubble', slot: 'Active', bombKindCode: 0 }]
        .map(s => ({ ...s, candyWeight: 0, removesProtection: false, isCombo: false,
          trigger: s.slot === 'Bomb' ? 'PlaceBomb' : 'Activate' })),
      skillLevels: [{ skillId: 5, rangeMode: 'UntilObstacle' }, { skillId: 7, pierceMode: 'FullPowerLine' },
        { skillId: 8, wallMs: 2000, rangeCells: 3 }, { skillId: 9, kickRangeCells: 5, durationMs: 3000 }]
        .map(s => ({ level: 1, cooldownMs: 10000, durationMs: 0, rangeCells: 0, intervalMs: 0,
          healPoints: 0, freezeMs: 0, pierceLayers: 0, wallMs: 0, kickRangeCells: 0, ...s })),
      circleStages: [{ id: 112001, atMs: 10000, sideCells: 15, spawnChest: false, clearSoft: true, poisonPoints: 1 }],
      skillCombos: [],
      resourceTiers: [{ id: 113005, name: 'Wood' }, { id: 113006, name: 'Iron' }, { id: 113007, name: 'Gold' }],
  }
}

function exportedRows(table: string): Record<string, unknown>[] {
  const path = new URL(`../../Config/Tables/client/${table}.json`, import.meta.url)
  const exported = JSON.parse(readFileSync(path, 'utf8')) as { rows: Record<string, unknown>[] }
  return exported.rows.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) => {
    const key = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    return [key, key.endsWith('Id') ? Number(value) : value]
  })))
}

describe('activated display configuration', () => {
  it('projects actual exported rows without activating historical combos or bound candy', () => {
    const source = fixture()
    for (const [key, table] of Object.entries({
      characters: 'characters', bombKinds: 'bomb_kinds', skills: 'skills',
      skillLevels: 'skill_levels', skillRules: 'skill_rules', skillCombos: 'skill_combos', circleStages: 'circle_stages', resourceTiers: 'chest',
    })) source[key] = key === 'skillRules' ? exportedRows(table)[0] : exportedRows(table)

    expect((source.skills as Record<string, unknown>[]).find(skill => skill.name === 'bubble')?.candyWeight).toBe(1)
    expect((source.skills as Record<string, unknown>[]).find(skill => skill.name === 'glacierBomb')?.isCombo).toBe(true)
    const { rules, catalog } = projectReplicaConfig(source)
    expect(rules.skills.freezeBomb.levels[0].freezeMs).toBe(2000)
    expect(rules.skills.toxinBomb.levels[0].durationMs).toBe(4000)
    expect(rules.toxinIntervalMs).toBe(2000)
    expect(rules.toxinPointsPerInterval).toBe(1)
    expect([...catalog.skills.entries()].sort(([a], [b]) => a - b)).toEqual([
      [1, 'regen'], [2, 'bubble'], [3, 'blink'], [4, 'fireAura'],
      [6, 'freezeBomb'], [7, 'pierceBomb'], [11, 'toxinBomb'], [13, 'flyKick'],
    ])
    expect([...catalog.bombSkills!].sort((a, b) => a - b)).toEqual([6, 7, 11])
    expect([...catalog.characterSkills!].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 13])
    expect([...catalog.candySkills!].sort((a, b) => a - b)).toEqual([6, 7, 11])
    expect(rules.combos).toEqual([])
    expect([...catalog.resourceTiers!]).toEqual([[113005, 'wood'], [113006, 'iron'], [113007, 'gold']])
    for (const skill of ['regen', 'bubble', 'blink', 'fireAura', 'flyKick'] as const)
      expect(rules.skills[skill].candyWeight).toBe(0)
    expect(Object.entries(rules.skills).filter(([, skill]) => skill.candyWeight > 0)
      .map(([name]) => name).sort()).toEqual(['freezeBomb', 'pierceBomb', 'toxinBomb'])
    expect(DEFAULT_RULES.skills.splitBomb.name).toBe('集束弹')
  })

  it('preserves semantic range modes, wall duration, kick distance and stable stage IDs', () => {
    const source = fixture()
    const { rules, catalog } = projectReplicaConfig(source)
    expect(rules.skills.kick.levels[0].rangeCells).toBe(UNTIL_BLOCKED)
    expect(rules.skills.pierceBomb.levels[0].pierceLayers).toBe(UNTIL_BLOCKED)
    expect(rules.skills.fireDash.levels[0].durationMs).toBe(2000)
    expect(rules.skills.bounceBubble.levels[0].rangeCells).toBe(5)
    expect(catalog.circleStages!.get(112001)).toBe(0)
    expect([...catalog.characters.keys()]).toEqual([118003])
  })

  it('filters dormant and historical rows from production skills and candy weights', () => {
    const source = fixture()
    source.bombKinds = [...source.bombKinds as object[],
      { name: 'Fire', kindCode: 2, enabled: false },
      { name: 'Split', kindCode: 4, enabled: false },
      { name: 'Remote', kindCode: 7, enabled: false },
      { name: 'Shock', kindCode: 6, enabled: true }]
    source.skills = [...source.skills as object[],
      ...([['fireBomb', 40003, 2], ['remoteBomb', 40004, 7], ['splitBomb', 40005, 4],
        ['shockBomb', 12, 6]] as const).map(([name, id, bombKindCode]) => ({
          id, name, slot: 'Bomb', isCombo: false, candyWeight: name === 'shockBomb' ? 2 : 0,
          bombKindCode, removesProtection: true, trigger: 'PlaceBomb' }))]
    source.skillLevels = [...source.skillLevels as object[],
      ...[40003, 40004, 40005, 12].map(skillId => ({ skillId, level: 1, cooldownMs: 0,
        durationMs: 500, rangeCells: 0, rangeMode: 'Fixed', intervalMs: 0, healPoints: 0,
        freezeMs: 0, pierceLayers: 0, pierceMode: 'Fixed', wallMs: 0, kickRangeCells: 0 }))]
    source.skillCombos = [{ leftSkillId: 5, rightSkillId: 7, resultSkillId: 9 }]
    const { rules, catalog } = projectReplicaConfig(source)
    expect([...catalog.skills.entries()]).toEqual([[8, 'fireDash'], [7, 'pierceBomb']])
    expect([...catalog.bombSkills!]).toEqual([7])
    expect([...catalog.candySkills!]).toEqual([])
    expect(rules.combos).toEqual([])
    for (const id of ['kick', 'fireBomb', 'remoteBomb', 'splitBomb', 'shockBomb'] as const)
      expect(rules.skills[id].candyWeight).toBe(0)
    expect(rules.skills.regen.candyWeight).toBe(0)
  })

  it('rejects a mismatched enabled bomb row instead of remapping its kind', () => {
    const source = fixture();
    (source.skills as Array<Record<string, unknown>>)[1].bombKindCode = 2
    expect(() => projectReplicaConfig(source)).toThrow('presentation_bomb_skill_invalid:pierceBomb')
  })
})
