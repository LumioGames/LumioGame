import { describe, expect, it } from 'vitest'
import { DeathCause, type BomberEvent } from '../../contract'
import { duckTrigger } from '../cues'
import {
  busFor,
  dbToGain,
  distanceLowpassHz,
  DUCK,
  duckGainAt,
  EXPLOSION_MIX,
  ExplosionCap,
  explosionThump,
  FOOTSTEP,
  FootstepClock,
  LOWPASS_OPEN_HZ,
  MIX,
  otherBombPlaceGain,
  rumbleGain,
} from '../mixing'

/** 分层混音（用户 2026-09-28 反馈「声音没有层次感，炸弹和移动的声音人多有点乱」）。 */

describe('buses', () => {
  it('routes the local player to self, everyone else to world, UI / announcements to ui', () => {
    expect(busFor('self')).toBe('self')
    expect(busFor('other')).toBe('world')
    expect(busFor('ui')).toBe('ui')
    expect(busFor('announce')).toBe('ui')
  })
  it('world sits about 6 dB under self; every bus has its own gain', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3)
    expect(MIX.world / MIX.self).toBeCloseTo(dbToGain(-6), 6)
    expect(MIX.ui).toBeGreaterThan(0)
    expect(MIX.music).toBeGreaterThan(0)
  })
})

describe('distance → low-pass (farther = more muffled)', () => {
  it('is open up close, muffled far away, monotonic in between', () => {
    expect(distanceLowpassHz(0)).toBe(LOWPASS_OPEN_HZ)
    expect(distanceLowpassHz(3)).toBe(LOWPASS_OPEN_HZ)
    expect(distanceLowpassHz(14)).toBe(EXPLOSION_MIX.farLowpassHz)
    expect(distanceLowpassHz(40)).toBe(EXPLOSION_MIX.farLowpassHz)
    let last = Infinity
    for (let d = 3; d <= 14; d += 0.5) {
      const f = distanceLowpassHz(d)
      expect(f).toBeLessThanOrEqual(last)
      last = f
    }
    expect(distanceLowpassHz(8.5)).toBeCloseTo(Math.sqrt(LOWPASS_OPEN_HZ * EXPLOSION_MIX.farLowpassHz), -1)
  })
  it('near explosions get a low-frequency thump, far ones none', () => {
    expect(explosionThump(0)).toBe(1)
    expect(explosionThump(3)).toBe(1)
    expect(explosionThump(5.5)).toBeGreaterThan(0)
    expect(explosionThump(5.5)).toBeLessThan(1)
    expect(explosionThump(8)).toBe(0)
    expect(explosionThump(20)).toBe(0)
  })
})

describe("other players' bomb placement", () => {
  it('is only heard within about 6 cells, and quietly', () => {
    expect(otherBombPlaceGain(0)).toBeLessThanOrEqual(0.35)
    expect(otherBombPlaceGain(3)).toBeGreaterThan(0)
    expect(otherBombPlaceGain(3)).toBeLessThan(otherBombPlaceGain(1))
    expect(otherBombPlaceGain(6)).toBe(0)
    expect(otherBombPlaceGain(9)).toBe(0)
  })
})

describe('explosion voice cap (≈ 4 at once, the rest merged into one bigger rumble)', () => {
  it('admits up to 4 overlapping explosions, counts the overflow, frees slots when they end', () => {
    const cap = new ExplosionCap()
    expect(EXPLOSION_MIX.maxVoices).toBe(4)
    const got = [0, 0.01, 0.02, 0.03, 0.04, 0.05].map((t) => cap.admit(t))
    expect(got).toEqual([true, true, true, true, false, false])
    expect(cap.takeOverflow()).toBe(2)
    expect(cap.takeOverflow()).toBe(0)
    expect(cap.admit(EXPLOSION_MIX.voiceSec + 0.02)).toBe(true)
  })
  it('the merged rumble grows with how many were merged, but is capped', () => {
    expect(rumbleGain(1)).toBeGreaterThan(0)
    expect(rumbleGain(3)).toBeGreaterThan(rumbleGain(1))
    expect(rumbleGain(50)).toBe(rumbleGain(200))
    expect(rumbleGain(50)).toBeLessThanOrEqual(EXPLOSION_MIX.rumbleMaxGain)
  })
})

describe('ducking the world bus on big moments (−6 dB for ~0.4 s)', () => {
  it('envelope: 1 before, ≈ −6 dB through the hold, back to 1 after the release', () => {
    expect(DUCK.db).toBe(-6)
    expect(DUCK.holdSec).toBeCloseTo(0.4)
    expect(duckGainAt(-0.1, 0)).toBe(1)
    expect(duckGainAt(DUCK.attackSec + 0.2, 0)).toBeCloseTo(dbToGain(-6), 3)
    expect(duckGainAt(DUCK.attackSec + DUCK.holdSec + DUCK.releaseSec + 0.01, 0)).toBe(1)
    const mid = duckGainAt(DUCK.attackSec + DUCK.holdSec + DUCK.releaseSec / 2, 0)
    expect(mid).toBeGreaterThan(dbToGain(-6))
    expect(mid).toBeLessThan(1)
  })

  const died = (victim: number, killer: number, cause: number = DeathCause.Bomb): BomberEvent => ({
    type: 'PlayerDied',
    VictimNetEntityIdRaw: victim,
    KillerNetEntityIdRaw: killer,
    ChainId: 1,
    Cause: cause as DeathCause,
    Cell: { X: 1, Y: 1 },
    Tick: 5,
  })
  it('triggers on a local kill, any Boss knock-down, and the central supply opening — not on ordinary deaths', () => {
    const boss = (id: number): boolean => id === 9
    expect(duckTrigger([died(3, 1)], 1, boss)).toBe(true)
    expect(duckTrigger([died(9, 4)], 1, boss)).toBe(true)
    expect(duckTrigger([{ type: 'SupplyOpened', presentationOnly: true, Cell: { X: 5, Y: 5 }, Tick: 5 }], 1, boss)).toBe(true)
    expect(duckTrigger([died(3, 4)], 1, boss)).toBe(false)
    expect(duckTrigger([died(1, 1, DeathCause.Poison)], 1, boss)).toBe(false)
    expect(duckTrigger([], 1, boss)).toBe(false)
  })
})

describe('footsteps (local player only)', () => {
  it('ticks every half cell walked, water steps in water, nothing while standing; teleports reset', () => {
    const f = new FootstepClock()
    expect(f.advance(2.5, 2.5, false)).toBeNull()
    expect(f.advance(2.5 + FOOTSTEP.everyCells * 0.6, 2.5, false)).toBeNull()
    expect(f.advance(2.5 + FOOTSTEP.everyCells * 1.05, 2.5, false)).toBe('ground')
    expect(f.advance(2.5 + FOOTSTEP.everyCells * 1.05, 2.5, false)).toBeNull()
    expect(f.advance(2.5 + FOOTSTEP.everyCells * 2.1, 2.5, true)).toBe('water')
    expect(f.advance(12.5, 12.5, false)).toBeNull()
    expect(FOOTSTEP.everyCells).toBeCloseTo(0.5)
  })
})
