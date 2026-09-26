import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES } from '../../contract'
import { appConfig, devEvolveCandies, parseAppParams } from '../params'

describe('parseAppParams', () => {
  it('parses seed, match, bots, ai and char', () => {
    const p = parseAppParams('?seed=5&match=150&bots=3&ai=hard&char=cat', false)
    expect(p).toMatchObject({ seed: 5, matchSec: 150, bots: 3, ai: 'hard', character: 'cat' })
    expect([...p.dev]).toEqual([])
  })

  it('defaults: random seed, default match, 7 bots, normal AI, select screen', () => {
    expect(parseAppParams('', true)).toMatchObject({ seed: null, matchSec: null, bots: 7, ai: 'normal', character: null })
  })

  it('clamps bots to 0..7, unknown ai → normal, invalid char → null, non-positive match → default', () => {
    expect(parseAppParams('?bots=-2', false).bots).toBe(0)
    expect(parseAppParams('?bots=40', false).bots).toBe(7)
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

describe('appConfig (ADR 0031 7-minute cap)', () => {
  it('defaults to the 420 s cap via protoConfig while DEFAULT_CONFIG stays 360 s', () => {
    expect(appConfig(parseAppParams('', false)).matchDurationMs).toBe(420000)
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
