import { describe, expect, it } from 'vitest'
import { MatchPhase } from '../../contract'
import { musicMode, VARIANTS, type MusicInputs } from '../music'

/** 狂暴（ADR 0040，design §3.1「狂暴 · 全身红光 + 加速音乐」）：本人狂暴期间音乐换成更快的一层。 */
const base: MusicInputs = { phase: MatchPhase.Running, renderTick: 100, tickRateHz: 20, matchEndedTick: null, podiumMs: 10000, stalled: false }

describe('musicMode · frenzy', () => {
  it('speeds the music up while the local player is in frenzy, in play only', () => {
    expect(musicMode({ ...base, frenzy: true })).toBe('frenzy')
    expect(musicMode({ ...base, phase: MatchPhase.Endgame, frenzy: true })).toBe('frenzy')
    expect(musicMode({ ...base, phase: MatchPhase.Warmup, frenzy: true })).toBe('main')
    expect(musicMode({ ...base, phase: MatchPhase.Settlement, frenzy: true })).toBe('results')
    expect(musicMode({ ...base, stalled: true, frenzy: true })).toBe('silent')
    expect(musicMode(base)).toBe('main')
  })

  it('the frenzy layer is faster and denser than the final-circle layer', () => {
    expect(VARIANTS.frenzy.bpm).toBeGreaterThan(VARIANTS.final.bpm)
    expect(VARIANTS.frenzy.ticks).toBe(2)
    expect(VARIANTS.frenzy.octaveLayer).toBe(true)
  })
})
