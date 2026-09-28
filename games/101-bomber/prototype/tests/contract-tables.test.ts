import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOT_PROFILES,
  BOT_TACTICS,
  BombKind,
  CHARACTER_ORDER,
  CHARACTERS,
  COMBOS,
  DEFAULT_CONFIG,
  DEFAULT_MAP_TIER,
  DEFAULT_RULES,
  DeathCause,
  LINEUP_WEIGHTS,
  MAP_TIERS,
  PickupKind,
  SKILL_IDS,
  SKILLS,
  bombCandyPool,
  candyPool,
  centerDistance,
  characterCode,
  comboFor,
  describeSkill,
  isPowerupKind,
  lineupFor,
  maxHealthOfView,
  msToTicks,
  parseBotDifficulty,
  parseCharacterId,
  parseMapTier,
  pickCode,
  poisonPointsAt,
  protoConfig,
  ringZoneOf,
  rulesForMap,
  skillCode,
  skillParams,
  ZONE_BOX,
  type BotDifficulty,
  type MapTierId,
  type SkillId,
} from '../src/contract'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard, referenceCross } from './support/pierce-cases'

/**
 * 第 4 轮契约数据表（原型扩展 NON-CONTRACT，ADR 0030 / 0031 / 0032）的不变量。
 * 放在 tests/ 而不是 src/contract/：架构守卫不许 contract 目录 import 'vitest'。
 */
const SRC = join(import.meta.dirname, '..', 'src')
const hz = DEFAULT_CONFIG.tickRateHz
const TAG = /^(已验证|推断待验证|引用)/

describe('skills table', () => {
  it('codes are unique and equal index + 1; 0 = none', () => {
    expect(new Set(SKILL_IDS).size).toBe(SKILL_IDS.length)
    SKILL_IDS.forEach((id, i) => {
      expect(skillCode(id)).toBe(i + 1)
      expect(SKILLS[id].id).toBe(id)
    })
    expect(skillCode(null)).toBe(0)
    expect(Object.keys(SKILLS).sort()).toEqual([...SKILL_IDS].sort())
  })

  it('base skills have 3 levels, combos 1; only actives have a cooldown; bomb-slot skills declare a BombKind', () => {
    for (const id of SKILL_IDS) {
      const d = SKILLS[id]
      expect(d.levels.length).toBe(d.combo ? 1 : 3)
      for (const l of d.levels) {
        if (d.slot === 'active') expect(l.cdMs).toBeGreaterThan(0)
        else expect(l.cdMs).toBe(0)
      }
      if (d.slot === 'bomb') expect(d.bombKind).toBeDefined()
      else expect(d.bombKind).toBeUndefined()
      if (d.combo) expect(d.candyWeight).toBe(0)
    }
    expect(SKILLS.freezeBomb.bombKind).toBe(BombKind.Freeze)
    expect(SKILLS.glacierBomb.bombKind).toBe(BombKind.Freeze)
    expect(SKILLS.pierceBomb.bombKind).toBe(BombKind.Pierce)
    expect(SKILLS.toxinBomb.bombKind).toBe(BombKind.Toxin)
    expect(SKILLS.shockBomb.bombKind).toBe(BombKind.Shock)
  })

  it('stable codes: round-4 codes unchanged, toxin / shock appended at the end (ADR 0033)', () => {
    expect(SKILL_IDS).toEqual([
      'regen',
      'bubble',
      'blink',
      'fireAura',
      'kick',
      'freezeBomb',
      'pierceBomb',
      'fireDash',
      'bounceBubble',
      'glacierBomb',
      'toxinBomb',
      'shockBomb',
    ])
    expect(skillCode('glacierBomb')).toBe(10)
    expect(skillCode('toxinBomb')).toBe(11)
    expect(skillCode('shockBomb')).toBe(12)
    // BombKind：契约 0–4 不动，5 / 6 为原型扩值。
    expect(BombKind).toEqual({ Standard: 0, Freeze: 1, Fire: 2, Pierce: 3, Split: 4, Toxin: 5, Shock: 6 })
    expect(DeathCause).toEqual({ Bomb: 0, Drown: 1, Burn: 2, Poison: 3, Toxin: 4 })
  })

  it('candy pool = the eight base skills; bomb-type weight 2, the rest 1 (ADR 0033, replaces RESOLUTIONS #2)', () => {
    expect(candyPool(SKILLS)).toEqual(['bubble', 'blink', 'fireAura', 'kick', 'freezeBomb', 'pierceBomb', 'toxinBomb', 'shockBomb'])
    expect(candyPool(SKILLS).map((id) => SKILLS[id].candyWeight)).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
    expect(bombCandyPool(SKILLS)).toEqual(['freezeBomb', 'pierceBomb', 'toxinBomb', 'shockBomb'])
    for (const id of bombCandyPool(SKILLS)) expect(SKILLS[id].slot).toBe('bomb')
    expect(SKILLS.regen.candyWeight).toBe(0)
    expect(SKILLS.glacierBomb.candyWeight).toBe(0)
  })

  it('toxin / shock rows (ADR 0033)', () => {
    const col = (id: SkillId, k: keyof ReturnType<typeof skillParams>): number[] => [1, 2, 3].map((l) => skillParams(SKILLS, id, l)[k])
    expect(col('toxinBomb', 'durationMs')).toEqual([3000, 4000, 5000])
    expect(col('shockBomb', 'durationMs')).toEqual([2000, 2500, 3000])
    expect(col('shockBomb', 'slowPermille')).toEqual([300, 300, 300])
    expect(col('toxinBomb', 'slowPermille')).toEqual([0, 0, 0])
    expect(col('freezeBomb', 'slowPermille')).toEqual([0, 0, 0])
    for (const id of ['toxinBomb', 'shockBomb'] as const) {
      expect(SKILLS[id]).toMatchObject({ slot: 'bomb', combo: false, candyWeight: 2, endsProtection: false })
      expect(SKILLS[id].src).toMatch(/^推断待验证/)
    }
    expect(SKILLS.toxinBomb.name).toBe('中毒弹')
    expect(SKILLS.shockBomb.name).toBe('麻痹弹')
  })

  it('L1 values = user brief, character skills as rebalanced for acceptance D (ADR 0034)', () => {
    expect(skillParams(SKILLS, 'bubble', 1)).toMatchObject({ durationMs: 3500, cdMs: 14000 })
    expect(skillParams(SKILLS, 'blink', 1)).toMatchObject({ rangeCells: 3, cdMs: 10000 })
    expect(skillParams(SKILLS, 'fireAura', 1)).toMatchObject({ durationMs: 5500, cdMs: 16000 })
    expect(skillParams(SKILLS, 'regen', 1)).toMatchObject({ intervalMs: 20000, points: 1 })
    expect(skillParams(SKILLS, 'fireDash', 1)).toMatchObject({ rangeCells: 3, cdMs: 12000, durationMs: 2000 })
    expect(skillParams(SKILLS, 'bounceBubble', 1)).toMatchObject({ durationMs: 3000, cdMs: 18000, rangeCells: 5 })
    expect(skillParams(SKILLS, 'glacierBomb', 1)).toMatchObject({ freezeMs: 1000, pierceLayers: 1 })
  })

  it('L1–L3 table is the contract table (RESOLUTIONS #8)', () => {
    const col = (id: SkillId, k: keyof ReturnType<typeof skillParams>): number[] => [1, 2, 3].map((l) => skillParams(SKILLS, id, l)[k])
    expect(col('bubble', 'durationMs')).toEqual([3500, 4000, 4500])
    expect(col('bubble', 'cdMs')).toEqual([14000, 12000, 10000])
    expect(col('blink', 'rangeCells')).toEqual([3, 3, 4])
    expect(col('blink', 'cdMs')).toEqual([10000, 8000, 6000])
    expect(col('fireAura', 'durationMs')).toEqual([5500, 6000, 6500])
    expect(col('fireAura', 'cdMs')).toEqual([16000, 14000, 12000])
    expect(col('regen', 'intervalMs')).toEqual([20000, 16000, 12000])
    expect(col('regen', 'points')).toEqual([1, 1, 1])
    expect(col('kick', 'rangeCells')).toEqual([3, 5, 99])
    expect(col('freezeBomb', 'freezeMs')).toEqual([800, 1000, 1200])
    expect(col('pierceBomb', 'pierceLayers')).toEqual([1, 2, 99])
    // 等级夹到 [1, 表长]。
    expect(skillParams(SKILLS, 'bubble', 0)).toBe(skillParams(SKILLS, 'bubble', 1))
    expect(skillParams(SKILLS, 'bubble', 9)).toBe(skillParams(SKILLS, 'bubble', 3))
    expect(skillParams(SKILLS, 'fireDash', 3)).toBe(skillParams(SKILLS, 'fireDash', 1))
  })

  it('only fire aura and fire dash end respawn protection (RESOLUTIONS #7)', () => {
    expect(SKILL_IDS.filter((id) => SKILLS[id].endsProtection)).toEqual(['fireAura', 'fireDash'])
  })

  it('every data row carries a source tag', () => {
    for (const id of SKILL_IDS) expect(SKILLS[id].src).toMatch(TAG)
    for (const c of COMBOS) expect(c.src).toMatch(TAG)
    for (const id of CHARACTER_ORDER) expect(CHARACTERS[id].src).toMatch(TAG)
    for (const p of Object.values(BOT_PROFILES)) expect(p.src).toMatch(TAG)
    expect(BOT_TACTICS.src).toMatch(TAG)
  })

  it('describeSkill fills in the numbers of the given level', () => {
    const r = { skills: SKILLS, burnPointsPerInterval: 2, burnIntervalMs: 1000 }
    const cfg = { healthPointsPerHeart: 2 }
    // 第 4 轮平衡（D 验收，ADR 0034）：泡泡 L2 = 4 秒 / CD 12 秒；回春 L1 = 20 秒回半心。
    expect(describeSkill(r, cfg, 'bubble', 2)).toBe('吹个泡泡，4 秒内不受伤、不能放弹（冷却 12 秒）')
    expect(describeSkill(r, cfg, 'blink', 3)).toContain('4 格')
    expect(describeSkill(r, cfg, 'kick', 3)).toContain('直到被挡')
    expect(describeSkill(r, cfg, 'regen', 1)).toBe('受伤后 20 秒没再挨打回 0.5 心，之后每 20 秒再回，满血为止')
    expect(describeSkill(r, cfg, 'fireAura', 1)).toContain('−1 心')
    expect(describeSkill(r, cfg, 'freezeBomb', 2)).toContain('1')
    for (const id of SKILL_IDS) for (let l = 1; l <= 3; l++) expect(describeSkill(r, cfg, id, l)).not.toMatch(/\{\w+\}/)
    // ADR 0033：中毒节拍来自 rules（没给则退化为「持续掉血」）；麻痹写百分比。
    const rt = { ...r, toxinIntervalMs: 1000, toxinPointsPerInterval: 1 }
    expect(describeSkill(rt, cfg, 'toxinBomb', 2)).toBe('炸到的对手还会中毒 4 秒，每 1 秒 −0.5 心，可致死')
    expect(describeSkill(r, cfg, 'toxinBomb', 1)).toContain('持续掉血')
    expect(describeSkill(r, cfg, 'shockBomb', 3)).toBe('炸到的对手还会麻痹 3 秒，移速降到 30%')
  })
})

describe('combos', () => {
  it('two different base skills → a combo that lives in one ingredient’s slot; each base skill in at most one row', () => {
    const used: SkillId[] = []
    for (const c of COMBOS) {
      expect(c.a).not.toBe(c.b)
      expect(SKILLS[c.a].combo).toBe(false)
      expect(SKILLS[c.b].combo).toBe(false)
      expect(SKILLS[c.result].combo).toBe(true)
      expect([SKILLS[c.a].slot, SKILLS[c.b].slot]).toContain(SKILLS[c.result].slot)
      used.push(c.a, c.b)
    }
    expect(new Set(used).size).toBe(used.length)
    expect(comboFor(COMBOS, 'fireAura', 'blink')?.result).toBe('fireDash')
    expect(comboFor(COMBOS, 'kick', 'bubble')?.result).toBe('bounceBubble')
    expect(comboFor(COMBOS, 'pierceBomb', 'freezeBomb')?.result).toBe('glacierBomb')
    expect(comboFor(COMBOS, 'blink', 'kick')).toBeUndefined()
  })

  it('a combo containing an exclusive skill sits in the exclusive skill’s slot (devolves in place, D8)', () => {
    for (const ch of CHARACTER_ORDER) {
      const ex = CHARACTERS[ch].skill
      for (const c of COMBOS) if (c.a === ex || c.b === ex) expect(SKILLS[c.result].slot).toBe(SKILLS[ex].slot)
    }
  })
})

describe('characters', () => {
  it('four characters with their exclusive skills; bot names are globally unique', () => {
    expect(CHARACTER_ORDER.map((c) => CHARACTERS[c].name)).toEqual(['棉花兔', '泡泡鸭', '闪电猫', '火焰熊'])
    expect(CHARACTER_ORDER.map((c) => CHARACTERS[c].skill)).toEqual(['regen', 'bubble', 'blink', 'fireAura'])
    expect(SKILLS[CHARACTERS.rabbit.skill].slot).toBe('passive')
    for (const c of ['duck', 'cat', 'bear'] as const) expect(SKILLS[CHARACTERS[c].skill].slot).toBe('active')
    const names = CHARACTER_ORDER.flatMap((c) => CHARACTERS[c].botNames)
    expect(new Set(names).size).toBe(names.length)
    for (const c of CHARACTER_ORDER) expect(CHARACTERS[c].animal).toBe(c)
  })

  it('codes and parsing', () => {
    expect(CHARACTER_ORDER.map(characterCode)).toEqual([1, 2, 3, 4])
    expect(characterCode(null)).toBe(0)
    expect(pickCode(null)).toBe(0)
    expect(pickCode('auto')).toBe(9)
    expect(pickCode('bear')).toBe(4)
    expect(parseCharacterId('Cat')).toBe('cat')
    expect(parseCharacterId(' duck ')).toBe('duck')
    expect(parseCharacterId('frog')).toBeNull()
    expect(parseCharacterId(null)).toBeNull()
  })
})

describe('final circle and match cap (ADR 0031)', () => {
  const stages = DEFAULT_RULES.ringStages
  it('six stages 13 → 1 with chest / clear / poison flags', () => {
    expect(stages.map((s) => s.size)).toEqual([13, 9, 7, 5, 3, 1])
    expect(stages.map((s) => msToTicks(s.atMs, hz))).toEqual([200, 700, 1100, 1500, 1900, 2200])
    expect(stages.map((s) => s.chest)).toEqual([true, true, true, true, true, false])
    expect(stages.map((s) => s.clearInside)).toEqual([false, false, false, true, true, true])
    expect(stages.map((s) => s.poisonPoints)).toEqual([1, 1, 1, 2, 2, 2])
    for (let i = 1; i < stages.length; i++) expect(stages[i].atMs - stages[i - 1].atMs).toBeGreaterThanOrEqual(DEFAULT_RULES.ringPreviewMs)
    expect(stages[stages.length - 1].atMs).toBeLessThan(DEFAULT_RULES.finalCircleMs)
    expect(DEFAULT_RULES.finalCircleMs).toBe(115000)
  })

  it('poisonPointsAt', () => {
    expect([-1, 2, 3, 5].map((i) => poisonPointsAt(DEFAULT_RULES, i))).toEqual([1, 1, 2, 2])
  })

  it('protoConfig applies the 4-minute cap (ADR 0035); the contract default stays 360 s', () => {
    expect(DEFAULT_CONFIG.matchDurationMs).toBe(360000)
    const cfg = protoConfig()
    expect(cfg.matchDurationMs).toBe(240000)
    expect(protoConfig(DEFAULT_RULES, { matchDurationMs: 120000 }).matchDurationMs).toBe(120000)
    expect(msToTicks(cfg.matchDurationMs, hz) - msToTicks(DEFAULT_RULES.finalCircleMs, hz)).toBe(2500)
  })
})

describe('movement data (ADR 0032)', () => {
  it('corner assist 500 / repeat 250 within a 6-tick window', () => {
    expect(DEFAULT_RULES.cornerAssistMilli).toBe(500)
    expect(DEFAULT_RULES.cornerAssistRepeatMilli).toBe(250)
    expect(DEFAULT_RULES.assistRepeatWindowTicks).toBe(6)
    expect(DEFAULT_RULES.dollFootprintMilli).toBe(700)
  })
})

describe('skill rules data (ADR 0030)', () => {
  it('drop / candy / fire / freeze values', () => {
    expect(DEFAULT_RULES.crateSkillCandyPermille).toBe(500)
    expect(DEFAULT_RULES.chestSkillCandies).toBe(1)
    expect(DEFAULT_RULES.skillDeathDropPermille).toBe(500)
    expect(DEFAULT_RULES.skillMaxLevel).toBe(3)
    expect(DEFAULT_RULES.skillCandyLevel).toBe(1)
    expect(DEFAULT_RULES.burnIntervalMs).toBe(1000)
    expect(DEFAULT_RULES.burnPointsPerInterval).toBe(2)
    expect(DEFAULT_RULES.freezeCapMs).toBe(1200)
    expect(DEFAULT_RULES.freezeBombDamages).toBe(true)
    // ADR 0033：宝箱技能糖保底炸弹类；中毒每 1500 ms −1 点（用户 2026-09-28 削弱，原 1000 ms）。
    expect(DEFAULT_RULES.chestSkillCandyPool).toBe('bomb')
    expect(DEFAULT_RULES.toxinIntervalMs).toBe(1500)
    expect(DEFAULT_RULES.toxinPointsPerInterval).toBe(1)
    expect(DEFAULT_RULES.skills).toBe(SKILLS)
    expect(DEFAULT_RULES.combos).toBe(COMBOS)
    expect(DEFAULT_RULES.characters).toBe(CHARACTERS)
  })

  it('isPowerupKind: fire / bomb / speed only (D5)', () => {
    expect(isPowerupKind(PickupKind.FirePlus)).toBe(true)
    expect(isPowerupKind(PickupKind.BombPlus)).toBe(true)
    expect(isPowerupKind(PickupKind.SpeedPlus)).toBe(true)
    expect(isPowerupKind(PickupKind.HealthPack)).toBe(false)
    expect(isPowerupKind(PickupKind.SkillCandy)).toBe(false)
    // ADR 0039 / 0040：金心与狂暴糖也不是帽子。
    expect(isPowerupKind(PickupKind.GoldHeart)).toBe(false)
    expect(isPowerupKind(PickupKind.Frenzy)).toBe(false)
    expect([PickupKind.GoldHeart, PickupKind.Frenzy]).toEqual([5, 6])
  })
})

describe('bot profiles (design §15 Bot 难度分档)', () => {
  it('hard = the round-3 bot-brain constants', () => {
    expect(BOT_PROFILES.hard).toMatchObject({
      reactMinTicks: 2,
      reactMaxTicks: 4,
      thinkEveryTicks: 2,
      noisePermille: 50,
      attackSkipPermille: 0,
      trapPermille: 920,
      frenzyBypass: true,
      blastScalePermille: 1000,
      engageScalePermille: 1000,
      skillUsePermille: 1000,
      reactMode: 'ownCell',
      showdownTradePermille: 1000,
    })
  })

  it('normal follows D9; ranges are sane; parse defaults to normal', () => {
    expect(BOT_PROFILES.normal).toMatchObject({ reactMinTicks: 4, reactMaxTicks: 7, noisePermille: 150, trapPermille: 0, maxOwnLiveAttackBombs: 1 })
    for (const p of Object.values(BOT_PROFILES)) {
      expect(p.reactMinTicks).toBeLessThanOrEqual(p.reactMaxTicks)
      expect(p.thinkEveryTicks).toBeGreaterThanOrEqual(1)
      for (const k of ['noisePermille', 'attackSkipPermille', 'trapPermille', 'blastScalePermille', 'engageScalePermille', 'skillUsePermille', 'showdownTradePermille'] as const) {
        expect(p[k]).toBeGreaterThanOrEqual(0)
        expect(p[k]).toBeLessThanOrEqual(1000)
      }
    }
    expect(parseBotDifficulty('easy')).toBe('easy')
    expect(parseBotDifficulty('HARD')).toBe('hard')
    expect(parseBotDifficulty('player')).toBe('normal')
    expect(parseBotDifficulty(null)).toBe('normal')
    expect(parseBotDifficulty(' Rookie ')).toBe('rookie')
  })

  it('M1 fields (ADR 0043): existing tiers keep today\'s behaviour (escape margin 2, no misperception, no greedy pickups); rookie is ranged', () => {
    for (const k of ['easy', 'normal', 'hard', 'player'] as const)
      expect(BOT_PROFILES[k]).toMatchObject({ escapeMarginTicks: 2, misperceivePermille: 0, greedyPickupPermille: 0 })
    for (const p of Object.values(BOT_PROFILES)) {
      expect(p.escapeMarginTicks).toBeGreaterThanOrEqual(0)
      for (const k of ['misperceivePermille', 'greedyPickupPermille'] as const) {
        expect(p[k]).toBeGreaterThanOrEqual(0)
        expect(p[k]).toBeLessThanOrEqual(1000)
      }
    }
    expect(TAG.test(BOT_PROFILES.rookie.src)).toBe(true)
  })
})

describe('lineupFor (ADR 0043)', () => {
  const count = (xs: readonly BotDifficulty[]) => {
    const c: Record<string, number> = {}
    for (const x of xs) c[x] = (c[x] ?? 0) + 1
    return c
  }

  it('15 bots → rookie 7 / normal 6 / hard 2, rookies first; fewer bots are proportional (largest remainder)', () => {
    expect(LINEUP_WEIGHTS).toEqual({ rookie: 7, normal: 6, hard: 2 })
    const l15 = lineupFor(15)
    expect(count(l15)).toEqual({ rookie: 7, normal: 6, hard: 2 })
    expect(l15).toEqual([...Array(7).fill('rookie'), ...Array(6).fill('normal'), ...Array(2).fill('hard')])
    expect(count(lineupFor(7))).toEqual({ rookie: 3, normal: 3, hard: 1 })
    expect(count(lineupFor(1))).toEqual({ rookie: 1 })
    expect(lineupFor(0)).toEqual([])
    for (let n = 0; n <= 30; n++) expect(lineupFor(n)).toHaveLength(n)
    expect(count(lineupFor(30))).toEqual({ rookie: 14, normal: 12, hard: 4 })
  })
})

describe('map tiers (ADR 0040, design §4.2 / §5.0)', () => {
  const ids: MapTierId[] = [19, 23, 27]

  it('three tiers keyed by size; power chests = chest stages; last three stages clear and poison 2; supply only on 27', () => {
    expect(Object.keys(MAP_TIERS).map(Number).sort((a, b) => a - b)).toEqual(ids)
    for (const id of ids) {
      const t = MAP_TIERS[id]
      expect(t.id).toBe(id)
      expect(t.size).toBe(id)
      expect(t.powerChests).toBe(t.ringStages.filter((s) => s.chest).length)
      expect(t.ringStages[t.ringStages.length - 1]).toMatchObject({ size: 1, chest: false, clearInside: true, poisonPoints: 2 })
      expect(t.ringStages.slice(-3).map((s) => s.size)).toEqual([5, 3, 1])
      expect(t.ringStages.every((s) => s.clearInside === s.size <= 5 && s.poisonPoints === (s.size <= 5 ? 2 : 1))).toBe(true)
      expect(t.boxes.wood.hits).toBe(1)
      expect(t.boxes.iron.hits).toBe(1)
      expect(t.boxes.gold.hits).toBe(2)
      for (const k of ['wood', 'iron', 'gold'] as const) expect(t.boxes[k].count % 4).toBe(0)
      expect(t.zones.coreMaxD).toBeLessThan(t.zones.midMaxD)
      expect(t.zones.midMaxD).toBeLessThan((id - 1) / 2)
      expect(t.centralSupply).toBe(id === 27)
      expect(t.plazaSide).toBe(id === 27 ? 3 : 0)
      expect(TAG.test(t.src)).toBe(true)
    }
    expect(ZONE_BOX).toEqual({ outer: 'wood', mid: 'iron', core: 'gold' })
  })

  it('rulesForMap: 19 × 8 is DEFAULT_RULES itself (default tier unchanged); 27 swaps stages / regen / players / map', () => {
    expect(DEFAULT_MAP_TIER).toBe(19)
    expect(DEFAULT_RULES.map).toBe(MAP_TIERS[19])
    expect(rulesForMap(DEFAULT_RULES, 19, 8)).toEqual(DEFAULT_RULES)
    expect(rulesForMap(DEFAULT_RULES, 19)).toEqual(DEFAULT_RULES)
    expect(DEFAULT_RULES.ringStages).toBe(MAP_TIERS[19].ringStages)
    const r27 = rulesForMap(DEFAULT_RULES, 27)
    expect(r27).toMatchObject({ playerCount: 16, regenOrbitsPerInterval: 4 })
    expect(r27.map).toBe(MAP_TIERS[27])
    expect(r27.ringStages).toBe(MAP_TIERS[27].ringStages)
    expect(r27.matchCapMs).toBe(DEFAULT_RULES.matchCapMs)
    expect(rulesForMap(DEFAULT_RULES, 23, 10).playerCount).toBe(10)
    expect(protoConfig().mapSize).toBe(19)
    expect(protoConfig(r27).mapSize).toBe(27)
    expect(protoConfig(r27, { mapSize: 23 }).mapSize).toBe(23)
    expect(protoConfig({ matchCapMs: 1000 }).mapSize).toBe(DEFAULT_CONFIG.mapSize)
  })

  it('ring zones by Chebyshev distance: 27 → core ≤ 4 / mid 5–8 / outer ≥ 9; 19 → ≤ 2 / 3–5 / ≥ 6', () => {
    const zone = (id: MapTierId, x: number, y: number) => ringZoneOf(MAP_TIERS[id].zones, centerDistance(id, x, y))
    expect(centerDistance(27, 13, 13)).toBe(0)
    expect([zone(27, 17, 13), zone(27, 18, 13), zone(27, 21, 5), zone(27, 22, 13), zone(27, 1, 1)]).toEqual(['core', 'mid', 'mid', 'outer', 'outer'])
    expect([zone(19, 11, 11), zone(19, 12, 9), zone(19, 14, 4), zone(19, 15, 9)]).toEqual(['core', 'mid', 'mid', 'outer'])
  })

  it('parseMapTier: 19 / 23 / 27, anything else → fallback', () => {
    expect([parseMapTier('27'), parseMapTier(' 23 '), parseMapTier('19')]).toEqual([27, 23, 19])
    expect([parseMapTier(null), parseMapTier('21'), parseMapTier('big')]).toEqual([19, 19, 19])
    expect(parseMapTier('x', 27)).toBe(27)
  })

  it('maxHealthOfView falls back to the global cap when the field is absent', () => {
    expect(maxHealthOfView({}, DEFAULT_CONFIG)).toBe(6)
    expect(maxHealthOfView({ maxHealth: 12 }, DEFAULT_CONFIG)).toBe(12)
  })
})

describe('pierce fixtures (tests/support/pierce-cases.ts)', () => {
  it.each(PIERCE_CASES.map((c) => [c.name, c] as const))('%s: the reference follows the canonical rule', (_, c) => {
    const b = parsePierceBoard(c.rows)
    const r = referenceCross(b, PIERCE_BOMB.x, PIERCE_BOMB.y, c.power, c.pierceLayers)
    const xy = (i: number): [number, number] => [i % b.size, Math.floor(i / b.size)]
    const sorted = (cs: readonly (readonly [number, number])[]) => [...cs].map(([x, y]) => `${x},${y}`).sort()
    expect(sorted(r.covered.map(xy))).toEqual(sorted(c.covered))
    expect(r.reach).toEqual(c.reach)
    expect(sorted(r.bricks.map(xy))).toEqual(sorted(c.bricks))
    expect(sorted(r.chestsHit.map(xy))).toEqual(sorted(c.chestsHit))
    // CellCount = 1 + ΣReach 与覆盖格数一致（被穿透的砖格计入 Reach）。
    expect(r.covered.length).toBe(1 + c.reach.reduce((a, v) => a + v, 0))
  })
})

/**
 * 原型扩展标注守卫（critic #19）：第 4 轮新增的每个契约字段 / 事件 / 类型，紧挨着的 JSDoc（或同一行）必须写
 * NON-CONTRACT。container 为 null 时在整个文件里找声明。
 */
function docFor(file: string, container: string | null, name: string): string | null {
  const text = readFileSync(join(SRC, 'contract', file), 'utf8')
  const lines = text.split('\n')
  let from = 0
  let to = lines.length
  if (container) {
    // 名字可能是中文，\b 对非 ASCII 不成立：用「后面跟空白 / 花括号 / 尖括号」判边界。
    const start = lines.findIndex((l) => new RegExp(`^\\s*export\\s+interface\\s+${container}(?=[\\s{<]|$)`).test(l))
    if (start < 0) return null
    let depth = 0
    let end = start
    for (let i = start; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
      }
      if (depth === 0 && i > start) {
        end = i
        break
      }
    }
    from = start + 1
    to = end
  }
  const decl = container
    ? new RegExp(`^\\s*${name}\\??:`)
    : new RegExp(`^\\s*(export\\s+)?(interface|type|const|function)\\s+${name}(?=[\\s{<(=:]|$)|^\\s*${name}\\??:`)
  let at = -1
  for (let i = from; i < to; i++)
    if (decl.test(lines[i])) {
      at = i
      break
    }
  if (at < 0) return null
  const doc = [lines[at]]
  let i = at - 1
  if (i >= 0 && lines[i].trim().endsWith('*/')) {
    for (; i >= 0; i--) {
      doc.unshift(lines[i])
      if (lines[i].includes('/**')) break
    }
  }
  return doc.join('\n')
}

describe('NON-CONTRACT markers on round-4 contract additions', () => {
  const marked: [string, string | null, string][] = [
    // config.ts
    ...[
      'matchCapMs',
      'finalCircleMs',
      'ringStages',
      'characters',
      'skills',
      'combos',
      'skillMaxLevel',
      'skillCandyLevel',
      'crateSkillCandyPermille',
      'chestSkillCandies',
      'skillDeathDropPermille',
      'burnIntervalMs',
      'burnPointsPerInterval',
      'freezeCapMs',
      'freezeImmuneMs',
      'freezeBombDamages',
      'kickSpeedMilli',
      'cornerAssistMilli',
      'cornerAssistRepeatMilli',
      'assistRepeatWindowTicks',
      'dollFootprintMilli',
      'dollReachMilli',
      'chestSkillCandyPool',
      'toxinIntervalMs',
      'toxinPointsPerInterval',
      // 方向 B · M1（ADR 0039 / 0040）
      'heartsPerHats',
      'maxHatHearts',
      'maxGoldHearts',
      'bossMinHearts',
      'goldBoxGoldHeartPermille',
      'powerChestGoldHeartPermille',
      'boxLoot',
      'supplyAnnounceMs',
      'supplyOpenMs',
      'supplyLoot',
      'frenzyMs',
      'frenzyFuseMs',
      'frenzyExtraBombs',
      'frenzyMinIntervalTicks',
      'map',
    ].map((n): [string, string | null, string] => ['config.ts', 'ProtoRules', n]),
    ...[
      'BoxLoot',
      'SupplyLoot',
      'MapTierId',
      'RingZone',
      'ResourceBoxTier',
      'ZONE_BOX',
      'ZoneRadii',
      'MapTierRules',
      'MAP_TIERS',
      'DEFAULT_MAP_TIER',
      'rulesForMap',
      'parseMapTier',
      'centerDistance',
      'ringZoneOf',
      'maxHealthFor',
      'maxHealthCeiling',
      'isBoss',
      'poisonPointsFor',
    ].map((n): [string, string | null, string] => ['config.ts', null, n]),
    ['config.ts', null, 'RingStage'],
    ['config.ts', null, 'protoConfig'],
    ['config.ts', null, 'poisonPointsAt'],
    // components.ts / input.ts
    ['components.ts', null, 'PickupKind'],
    ['components.ts', null, 'isPowerupKind'],
    ['components.ts', null, 'BombKind'],
    ['skills.ts', 'SkillParams', 'slowPermille'],
    ['skills.ts', null, 'bombCandyPool'],
    ['input.ts', '移动技能输入', '副方向'],
    // events.ts
    ...[
      'SkillActivated',
      'SkillFailed',
      'SkillGained',
      'SkillEvolved',
      'SkillsDropped',
      'PlayerHealed',
      'BombKicked',
      'PlayerFrozen',
      'MatchEndReason',
      'DeathCause',
      'PlayerPoisoned',
      'PlayerShocked',
      'PlayerCured',
    ].map(
      (n): [string, string | null, string] => ['events.ts', null, n],
    ),
    ['events.ts', 'MatchEnded', 'proto'],
    ['events.ts', null, 'SupplyAnnounced'],
    ['events.ts', null, 'SupplyOpened'],
    ['events.ts', 'PickupSpawned', 'Source'],
    ['events.ts', 'PickupSpawned', 'Skill'],
    ['events.ts', 'PickupSpawned', 'SkillLevel'],
    ['events.ts', 'PickupTaken', 'Skill'],
    ['events.ts', 'PickupTaken', 'SkillLevel'],
    // snapshot.ts
    ['snapshot.ts', 'PlayerView', 'skills'],
    ['snapshot.ts', 'PlayerSkillsView', 'toxinUntilTick'],
    ['snapshot.ts', 'PlayerSkillsView', 'shockUntilTick'],
    ['snapshot.ts', 'PlayerView', 'eliminatedTick'],
    ['snapshot.ts', 'BombView', 'kick'],
    ['snapshot.ts', 'PickupView', 'skill'],
    ['snapshot.ts', 'WorldSnapshot', 'FireZones'],
    ['snapshot.ts', 'MatchMeta', 'results'],
    // 方向 B · M1（ADR 0039 / 0040）
    ['snapshot.ts', 'PlayerView', 'maxHealth'],
    ['snapshot.ts', 'PlayerView', 'goldHearts'],
    ['snapshot.ts', 'PlayerView', 'frenzyUntilTick'],
    ['snapshot.ts', null, 'maxHealthOfView'],
    ['snapshot.ts', 'BombView', 'uncounted'],
    ['snapshot.ts', null, 'ResourceBoxView'],
    ['snapshot.ts', null, 'MapView'],
    ['snapshot.ts', null, 'SupplyView'],
    ['snapshot.ts', 'MatchMeta', 'map'],
    ['snapshot.ts', 'MatchMeta', 'supply'],
    ['snapshot.ts', 'WorldSnapshot', 'ResourceBoxes'],
    // ai.ts（整份 NON-CONTRACT，M1 新字段逐项也标）
    ['ai.ts', 'BotProfile', 'escapeMarginTicks'],
    ['ai.ts', 'BotProfile', 'misperceivePermille'],
    ['ai.ts', 'BotProfile', 'greedyPickupPermille'],
    ['ai.ts', null, 'LINEUP_WEIGHTS'],
    ['ai.ts', null, 'lineupFor'],
    ...['SkillSlotView', 'PlayerSkillsView', 'BombKickView', 'FireZoneView', 'MatchRankRow', 'MatchResultsView'].map(
      (n): [string, string | null, string] => ['snapshot.ts', null, n],
    ),
  ]
  it.each(marked)('%s %s.%s', (file, container, name) => {
    const doc = docFor(file, container, name)
    expect(doc, `${file}: ${container ?? ''}.${name} not found`).not.toBeNull()
    expect(doc).toContain('NON-CONTRACT')
  })

  it('SkillCandy is named in the PickupKind doc; the 技能 activation is marked inline', () => {
    expect(docFor('components.ts', null, 'PickupKind')).toContain('SkillCandy')
    // 方向 B · M1：金心 / 狂暴糖同样在 PickupKind 文档里点名；PlayerHealed 的 'boss' 来源写在事件文档里。
    expect(docFor('components.ts', null, 'PickupKind')).toMatch(/GoldHeart[\s\S]*Frenzy/)
    expect(docFor('events.ts', null, 'PlayerHealed')).toContain("Source 'boss'")
    const input = readFileSync(join(SRC, 'contract', 'input.ts'), 'utf8')
    const line = input.split('\n').find((l) => l.includes("ability: '技能'"))
    expect(line).toContain('NON-CONTRACT')
  })

  it('skills.ts and ai.ts are NON-CONTRACT as whole files', () => {
    for (const f of ['skills.ts', 'ai.ts']) expect(readFileSync(join(SRC, 'contract', f), 'utf8').slice(0, 800)).toContain('NON-CONTRACT')
  })
})
