import { describe, expect, it } from 'vitest'
import { matchEndReason, matchResults, rankMatch, type RankInput } from '../ranking'

/** D2（ADR 0031）：活到最后者赢；出局越晚越靠前；同 Tick 出局同名次。 */
const alive = (id: number, hats: number): RankInput => ({ id, eliminated: false, eliminatedTick: 0, hats })
const out = (id: number, tick: number, hats: number): RankInput => ({ id, eliminated: true, eliminatedTick: tick, hats })

describe('rankMatch', () => {
  it('a 0-hat sole survivor ranks above an eliminated player with 5 hats', () => {
    const rows = rankMatch([out(1, 100, 5), alive(2, 0)])
    expect(rows.map((r) => [r.id, r.rank, r.place, r.survived])).toEqual([
      [2, 1, 1, true],
      [1, 2, 2, false],
    ])
  })

  it('time up: survivors by hats (ties share), then eliminations latest first; same tick shares', () => {
    const rows = rankMatch([alive(1, 3), alive(2, 1), alive(3, 3), out(4, 200, 9), out(5, 100, 0), out(6, 100, 2)])
    expect(rows.map((r) => [r.id, r.rank, r.place])).toEqual([
      [1, 1, 1],
      [3, 1, 2],
      [2, 3, 3],
      [4, 4, 4],
      [6, 5, 5],
      [5, 5, 6],
    ])
    expect(rows[3].eliminatedTick).toBe(200)
    expect(rows[0].eliminatedTick).toBe(0)
  })

  it('all down: the last batch shares rank 1', () => {
    const rows = rankMatch([out(1, 50, 0), out(2, 90, 1), out(3, 90, 4)])
    expect(rows.map((r) => [r.id, r.rank])).toEqual([
      [3, 1],
      [2, 1],
      [1, 3],
    ])
  })
})

describe('matchEndReason / matchResults', () => {
  it('reasons', () => {
    expect(matchEndReason(0, 8)).toBe('allDown')
    expect(matchEndReason(1, 8)).toBe('lastSurvivor')
    expect(matchEndReason(1, 1)).toBe('timeUp')
    expect(matchEndReason(3, 8)).toBe('timeUp')
  })

  it('winner = rows[0]', () => {
    const r = matchResults([out(1, 10, 2), alive(2, 0), out(3, 20, 1)])
    expect(r.reason).toBe('lastSurvivor')
    expect(r.winner).toBe(2)
    expect(r.rows[0].id).toBe(2)
    expect(matchResults([]).winner).toBe(0)
    const all = matchResults([out(4, 9, 0), out(5, 9, 3)])
    expect(all.reason).toBe('allDown')
    expect(all.winner).toBe(5)
  })
})
