import { describe, expect, it } from 'vitest'
import { chainDelaySec, pentatonicHz, RateLimiter, spatialize, VoiceBook } from '../mixing'

describe('spatialize', () => {
  it('attenuates 1/(1 + d/6) and pans by Δx/8 clamped to ±1', () => {
    expect(spatialize(0, 0)).toEqual({ gain: 1, pan: 0 })
    expect(spatialize(6, 0).gain).toBeCloseTo(0.5)
    expect(spatialize(4, 0).pan).toBeCloseTo(0.5)
    expect(spatialize(-20, 0).pan).toBe(-1)
  })
})

describe('VoiceBook', () => {
  it('caps concurrent voices and steals the oldest', () => {
    const b = new VoiceBook<string>(2)
    expect(b.add('a', 10, 0)).toEqual([])
    expect(b.add('b', 10, 0)).toEqual([])
    expect(b.add('c', 10, 0)).toEqual(['a'])
    expect(b.size()).toBe(2)
  })

  it('prunes finished voices before stealing', () => {
    const b = new VoiceBook<string>(2)
    b.add('a', 1, 0)
    b.add('b', 10, 0)
    expect(b.add('c', 10, 2)).toEqual([])
  })
})

describe('RateLimiter', () => {
  it('allows at most 6 explosion sounds per 100 ms, including out-of-order chain schedules', () => {
    const r = new RateLimiter(6, 0.1)
    const times = [0.04, 0, 0.08, 0.02, 0.06, 0.01]
    expect(times.map((t) => r.allow(t))).toEqual([true, true, true, true, true, true])
    expect(r.allow(0.05)).toBe(false)
    expect(r.allow(0.2)).toBe(true)
  })
})

describe('chain helpers', () => {
  it('pentatonic rises per link and staggers 40 ms per bomb capped at 320 ms', () => {
    expect(pentatonicHz(0)).toBeCloseTo(523.25)
    expect(pentatonicHz(5)).toBeCloseTo(1046.5)
    expect(pentatonicHz(3)).toBeGreaterThan(pentatonicHz(2))
    expect(chainDelaySec(2)).toBeCloseTo(0.08)
    expect(chainDelaySec(20)).toBeCloseTo(0.32)
  })
})
