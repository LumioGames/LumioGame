import { describe, expect, it } from 'vitest'
import { StatsTracker } from '../stats-tracker'
import { MatchPhase } from '../../contract'
import type { PlayerStatisticsView } from '../../contract'
import { snap, batch } from './fixtures'

describe('replicated match totals', () => {
  const durable = (over: Partial<PlayerStatisticsView> = {}): PlayerStatisticsView => ({
    id: 1, kills: 4, deaths: 5, bombs: 19, destroyedBlocks: 12, pickups: 8, bestChain: 5,
    peakHats: 15, skillCasts: 3, evolutions: 0, hatKingTicks: 400, character: 'kangaroo',
    peakHealthPoints: 18, bossKills: 2, clutchEscapes: 3, goldenHeartPickups: 6,
    specialBombHistory: ['pierceBomb', 'freezeBomb'], ...over,
  })
  it('restores every result and highlight from durable totals with no observed life or events', () => {
    const stats = new StatsTracker(1)
    const final = snap({ tick: 100, players: [], phase: MatchPhase.Settlement })
    final.statistics = [durable()]
    stats.consumeSnapshot(batch(100, [], { snapshot: final }))
    stats.finalizeClutch(final)
    expect(stats.snapshot()).toMatchObject({ kills: 4, deaths: 5, maxHearts: 9, character: 'kangaroo',
      skills: ['pierceBomb', 'freezeBomb'], hatKingTicks: 400 })
    expect(stats.highlightStats(1)).toEqual({ id: 1, kills: 4, bestChain: 5, hatKingTicks: 400,
      bricks: 12, pickups: 8, clutch: 3, bossKills: 2, goldHearts: 6 })
  })
  it.each([0, 3])('never adds final low-health inference to committed clutch count %i', clutchEscapes => {
    const stats = new StatsTracker(1)
    const live = snap({ tick: 100, players: [{ id: 1, hp: 2 }] })
    live.statistics = [durable({ clutchEscapes })]
    stats.consumeSnapshot(batch(100, [], { snapshot: live }))
    stats.finalizeClutch(live)
    stats.finalizeClutch(live)
    expect(stats.highlightStats(1).clutch).toBe(clutchEscapes)
  })
  it('takes authoritative zeroes literally and clears durable authority for the next match', () => {
    const stats = new StatsTracker(1)
    const live = snap({ tick: 100, players: [{ id: 1, hp: 2, maxHealth: 18, goldHearts: 6 }] })
    live.statistics = [durable()]
    stats.consumeSnapshot(batch(100, [], { snapshot: live }))
    const final = snap({ tick: 101, players: [], phase: MatchPhase.Settlement })
    final.statistics = [durable({ deaths: 0, peakHealthPoints: 0, bossKills: 0, clutchEscapes: 0,
      goldenHeartPickups: 0, character: null, specialBombHistory: [] })]
    stats.consumeSnapshot(batch(101, [], { snapshot: final }))
    expect(stats.snapshot()).toMatchObject({ deaths: 0, maxHearts: 0, character: null, skills: [] })
    expect(stats.highlightStats(1)).toMatchObject({ bossKills: 0, clutch: 0, goldHearts: 0 })
    stats.reset(2)
    expect(stats.snapshot()).toMatchObject({ deaths: 0, character: null, skills: [] })
    const next = snap({ tick: 1, players: [{ id: 1, hp: 2 }] })
    stats.consumeSnapshot(batch(1, [], { snapshot: next }))
    stats.finalizeClutch(next)
    expect(stats.highlightStats(1).clutch).toBe(1)
    expect(stats.highlightStats(1)).not.toHaveProperty('bossKills')
    expect(stats.highlightStats(1)).not.toHaveProperty('goldHearts')
  })
  it('restores pre-join activity and uses frozen result totals at settlement', () => {
    const stats = new StatsTracker(1)
    const live = snap({ tick: 50 })
    live.statistics = [{ id: 1, kills: 4, bombs: 19, destroyedBlocks: 12,
      pickups: 8, bestChain: 5, peakHats: 15, skillCasts: 3, evolutions: 1, hatKingTicks: 400 }]
    stats.consumeSnapshot(batch(50, [], { snapshot: live }))
    expect(stats.snapshot()).toMatchObject({ kills: 4, bombsPlaced: 19, bricksDestroyed: 12,
      pickups: 8, bestChain: 5, maxHats: 15, skillCasts: 3, hatKingTicks: 400 })
    expect(stats.highlightStats(1)).toMatchObject({ kills: 4, bricks: 12, bestChain: 5, pickups: 8 })
    const final = snap({ tick: 100 })
    final.statistics = [{ ...live.statistics[0], kills: 6, bombs: 29, character: 'cat', hatKingTicks: 550 }]
    stats.consumeSnapshot(batch(100, [], { snapshot: final }))
    expect(stats.snapshot()).toMatchObject({ kills: 6, bombsPlaced: 29, character: 'cat', hatKingTicks: 550 })
    expect(stats.snapshot().killsById.get(1)).toBe(6)
  })
})
