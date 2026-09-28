import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, lineupFor, type TickFrame } from '../../contract'
import { LocalHost } from '../local-host'
import { appConfig, appLineup, appRules, devEvolveCandies, parseAppParams } from '../params'

describe('parseAppParams', () => {
  it('parses seed, match, map, bots, ai and char', () => {
    const p = parseAppParams('?seed=5&match=150&map=23&bots=3&ai=hard&char=cat', false)
    expect(p).toMatchObject({ seed: 5, matchSec: 150, map: 23, bots: 3, ai: 'hard', aiExplicit: true, character: 'cat' })
    expect([...p.dev]).toEqual([])
  })

  it('defaults (user 2026-09-28, revises ADR 0040): random seed, default match, 23×23 map, 11 bots, default lineup, select screen', () => {
    expect(parseAppParams('', true)).toMatchObject({ seed: null, matchSec: null, map: 23, bots: 11, ai: 'normal', aiExplicit: false, character: null })
  })

  it('bots default to and are capped at the tier’s spawn count − 1 (19 → 7, 23 → 11, 27 → 15); unknown map → 23', () => {
    expect(parseAppParams('?map=19', false)).toMatchObject({ map: 19, bots: 7 })
    expect(parseAppParams('?map=19&bots=15', false).bots).toBe(7)
    expect(parseAppParams('?map=23', false)).toMatchObject({ map: 23, bots: 11 })
    expect(parseAppParams('?map=27&bots=9', false)).toMatchObject({ map: 27, bots: 9 })
    expect(parseAppParams('?map=31', false).map).toBe(23)
  })

  it('clamps bots to 0..tier cap (default 23 tier → 11), unknown ai → normal, invalid char → null, non-positive match → default', () => {
    expect(parseAppParams('?bots=-2', false).bots).toBe(0)
    expect(parseAppParams('?bots=40', false).bots).toBe(11)
    expect(parseAppParams('?map=27&bots=40', false).bots).toBe(15)
    expect(parseAppParams('?ai=nightmare', false).ai).toBe('normal')
    expect(parseAppParams('?char=wolf', false).character).toBeNull()
    expect(parseAppParams('?char=BEAR', false).character).toBe('bear')
    expect(parseAppParams('?match=0', false).matchSec).toBeNull()
    expect(parseAppParams('?match=abc', false).matchSec).toBeNull()
  })

  it('dev flags only when enabled, unknown flags dropped', () => {
    expect([...parseAppParams('?dev=evolve,fast', false).dev]).toEqual([])
    expect([...parseAppParams('?dev=evolve,fast,bogus', true).dev].sort()).toEqual(['evolve', 'fast'])
    expect([...parseAppParams('?dev=autopilot', true).dev]).toEqual(['autopilot'])
  })
})

describe('appRules / appLineup (ADR 0040 / 0043)', () => {
  it('the default page is 12 players on the 23 tier; ?map=27 is 16 players; ?map=19 is the old 8-player rules object', () => {
    const r = appRules(parseAppParams('', false))
    expect(r.map.id).toBe(23)
    expect(r.playerCount).toBe(12)
    expect(r.ringStages.map((s) => s.size)).toEqual([15, 11, 7, 5, 3, 1])
    expect(appConfig(parseAppParams('', false), r).mapSize).toBe(23)
    expect(appRules(parseAppParams('?map=27', false))).toMatchObject({ playerCount: 16, map: { id: 27 } })
    expect(appRules(parseAppParams('?map=19', false))).toEqual(DEFAULT_RULES)
    expect(appRules(parseAppParams('?map=23&bots=5', false))).toMatchObject({ playerCount: 6, map: { id: 23 } })
  })

  it('no ?ai= → the ADR 0043 lineup for the bot count; ?ai= → every bot on that tier (no lineup)', () => {
    expect(appLineup(parseAppParams('', false))).toEqual(lineupFor(11))
    expect(appLineup(parseAppParams('?bots=7', false))).toEqual(lineupFor(7))
    expect(appLineup(parseAppParams('?ai=hard', false))).toBeNull()
  })

  it('the default URL opens a 12-player 23×23 match that runs, with the central supply scheduled', () => {
    const p = parseAppParams('?seed=42', false)
    const rules = appRules(p)
    const lineup = appLineup(p)
    const host = new LocalHost({ seed: 42, config: appConfig(p, rules), rules, botCount: p.bots, ...(lineup ? { botLineup: lineup } : {}) })
    let last = null as unknown as TickFrame
    host.subscribe((f) => (last = f))
    const snap0 = last.snapshot
    expect(snap0.Terrain.size).toBe(23)
    expect(snap0.Players).toHaveLength(12)
    expect(snap0.match.map?.tier).toBe(23)
    expect(snap0.match.supply?.state).toBe('pending')
    expect(snap0.ResourceBoxes).toHaveLength(24)
    host.stepTicks(200)
    const snap = last.snapshot
    expect(snap.Tick).toBe(200)
    expect(snap.Players.filter((q) => q.玩家属性.血量当前 > 0).length).toBeGreaterThan(0)
  })
})

describe('appConfig (ADR 0035 4-minute cap)', () => {
  it('defaults to the 240 s cap via protoConfig while DEFAULT_CONFIG stays 360 s', () => {
    expect(appConfig(parseAppParams('', false)).matchDurationMs).toBe(240000)
    expect(appConfig(parseAppParams('', false)).matchDurationMs).toBe(DEFAULT_RULES.matchCapMs)
    expect(DEFAULT_CONFIG.matchDurationMs).toBe(360000)
  })

  it('?match overrides the duration (≤ 115 s = whole match is the final circle)', () => {
    expect(appConfig(parseAppParams('?match=150', false)).matchDurationMs).toBe(150000)
    expect(appConfig(parseAppParams('?match=100', false)).matchDurationMs).toBeLessThanOrEqual(DEFAULT_RULES.finalCircleMs)
    expect(appConfig(parseAppParams('?match=150', false)).tickRateHz).toBe(DEFAULT_CONFIG.tickRateHz)
  })
})

describe('devEvolveCandies', () => {
  it('gives the other half of the character combo, or a non-exclusive pair for the rabbit', () => {
    expect(devEvolveCandies(DEFAULT_RULES, 'cat')).toEqual(['fireAura'])
    expect(devEvolveCandies(DEFAULT_RULES, 'bear')).toEqual(['blink'])
    expect(devEvolveCandies(DEFAULT_RULES, 'duck')).toEqual(['kick'])
    expect(devEvolveCandies(DEFAULT_RULES, 'rabbit')).toEqual(['freezeBomb', 'pierceBomb'])
  })
})
