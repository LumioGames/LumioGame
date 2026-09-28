import { describe, expect, it } from 'vitest'
import { BIG_FOUNTAIN, BOSS_FOUNTAIN, CHEST_ARC, DEATH_FOUNTAIN, fountainFor, pickupArcPose } from '../world/pickups'

/** 死者掉落沿抛物线喷出（design §3.1，ADR 0043）：≥ 6 帽的喷泉更高更大；宝箱喷出的弧线不变。 */
describe('death-drop fountain arc', () => {
  it('picks the big fountain from 6 hats up', () => {
    expect(fountainFor(0)).toBe(DEATH_FOUNTAIN)
    expect(fountainFor(5)).toBe(DEATH_FOUNTAIN)
    expect(fountainFor(6)).toBe(BIG_FOUNTAIN)
    expect(BIG_FOUNTAIN.height).toBeGreaterThan(DEATH_FOUNTAIN.height)
    expect(BIG_FOUNTAIN.ms).toBeGreaterThan(DEATH_FOUNTAIN.ms)
    expect(DEATH_FOUNTAIN.height).toBeGreaterThan(CHEST_ARC.height)
  })

  it('a Boss knock-down gets the biggest fountain regardless of hats (ADR 0043 大号爆装喷泉)', () => {
    expect(fountainFor(0, true)).toBe(BOSS_FOUNTAIN)
    expect(fountainFor(9, true)).toBe(BOSS_FOUNTAIN)
    expect(fountainFor(9, false)).toBe(BIG_FOUNTAIN)
    expect(BOSS_FOUNTAIN.height).toBeGreaterThan(BIG_FOUNTAIN.height)
    expect(BOSS_FOUNTAIN.pop).toBeGreaterThan(BIG_FOUNTAIN.pop)
  })

  it('is a parabola that starts slightly raised, peaks mid-flight and lands at 0 with full size', () => {
    const start = pickupArcPose(0, DEATH_FOUNTAIN)
    const mid = pickupArcPose(0.5, DEATH_FOUNTAIN)
    const end = pickupArcPose(1, DEATH_FOUNTAIN)
    expect(start.lift).toBeCloseTo(0.4)
    expect(mid.lift).toBeCloseTo(DEATH_FOUNTAIN.height + 0.2)
    expect(end.lift).toBeCloseTo(0)
    expect(end.scale).toBeCloseTo(1)
    expect(pickupArcPose(0.5, BIG_FOUNTAIN).scale).toBeGreaterThan(mid.scale)
  })

  it('keeps the old chest arc (1.3 high, 0.7 → 1 scale)', () => {
    expect(pickupArcPose(0.5, CHEST_ARC)).toEqual({ lift: 1.3 + 0.2, scale: 0.85 })
    expect(CHEST_ARC.ms).toBe(350)
  })
})
