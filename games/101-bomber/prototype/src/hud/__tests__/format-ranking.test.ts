import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, heartFills, speedLevel } from '../format'
import { percentBeaten, rankPlayers, visibleRows } from '../ranking'
import { ME, player } from './fixtures'

describe('formatClock', () => {
  it('formats match remaining as mm:ss', () => {
    expect(formatClock(360)).toBe('06:00')
    expect(formatClock(179.2)).toBe('03:00')
    expect(formatClock(59)).toBe('00:59')
  })
  it('rounds up so the last fraction of a second still shows 00:01', () => {
    expect(formatClock(0.3)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-2)).toBe('00:00')
  })
})

describe('formatDuration', () => {
  it('uses seconds below a minute and m 分 ss 秒 above', () => {
    expect(formatDuration(42.9)).toBe('42 秒')
    expect(formatDuration(65)).toBe('1 分 05 秒')
  })
})

describe('heartFills', () => {
  it('shows half-heart precision from half-heart points', () => {
    expect(heartFills(6, 6, 2)).toEqual([1, 1, 1])
    expect(heartFills(3, 6, 2)).toEqual([1, 0.5, 0])
    expect(heartFills(1, 6, 2)).toEqual([0.5, 0, 0])
    expect(heartFills(0, 6, 2)).toEqual([0, 0, 0])
    expect(heartFills(-4, 6, 2)).toEqual([0, 0, 0])
  })
})

describe('speedLevel', () => {
  it('base speed is level 1, each +350 milli adds a level, slowdowns never go below 1', () => {
    expect(speedLevel(3500, 3500, 350)).toBe(1)
    expect(speedLevel(4200, 3500, 350)).toBe(3)
    expect(speedLevel(2450, 3500, 350)).toBe(1)
  })
})

describe('rankPlayers', () => {
  const players = [
    player({ id: ME, hats: 2 }),
    player({ id: 2, hats: 5 }),
    player({ id: 3, hats: 5 }),
    player({ id: 4, hats: 0 }),
    player({ id: 5, hats: 2 }),
  ]

  it('uses competition ranking for ties (1, 1, 3, 3, 5)', () => {
    const rows = rankPlayers(players, 0, ME)
    expect(rows.map((r) => [r.id, r.rank])).toEqual([
      [2, 1],
      [3, 1],
      [ME, 3],
      [5, 3],
      [4, 5],
    ])
  })

  it('puts the reigning hat king first among equals (ties do not replace the king)', () => {
    const rows = rankPlayers(players, 3, ME)
    expect(rows[0].id).toBe(3)
    expect(rows[0].isKing).toBe(true)
    expect(rows[1].id).toBe(2)
    expect(rows[0].rank).toBe(rows[1].rank)
  })

  it('is stable: equal hats without a king sort by id', () => {
    const a = rankPlayers(players, 0, ME).map((r) => r.id)
    const b = rankPlayers([...players].reverse(), 0, ME).map((r) => r.id)
    expect(a).toEqual(b)
  })

  it('appends the local player when outside the visible top-N', () => {
    const many = Array.from({ length: 12 }, (_, i) => player({ id: i + 1, hats: i + 1 === ME ? 0 : 20 - i }))
    const rows = rankPlayers(many, 0, ME)
    const shown = visibleRows(rows, 10)
    expect(shown).toHaveLength(11)
    expect(shown[10].isLocal).toBe(true)
    expect(visibleRows(rows, 5)).toHaveLength(6)
  })

  it('does not duplicate the local player already in the top-N', () => {
    const rows = rankPlayers(players, 0, ME)
    expect(visibleRows(rows, 10)).toHaveLength(5)
  })

  it('percentBeaten counts only players ranked strictly below', () => {
    const rows = rankPlayers(players, 0, ME)
    // 本人 2 顶：只严格排在 id 4（0 顶）前面；并列的 id 5 不算。4 名对手里击败 1 名。
    expect(percentBeaten(rows, ME)).toBe(25)
    expect(percentBeaten(rankPlayers([player({ id: ME })], 0, ME), ME)).toBe(100)
  })

  it('in the final circle survivors rank above every eliminated player (D2), eliminated by later tick', () => {
    const rows = rankPlayers(
      [
        player({ id: ME, hats: 0 }),
        player({ id: 2, hats: 6, eliminated: true, eliminatedTick: 90 }),
        player({ id: 3, hats: 1 }),
        player({ id: 4, hats: 2, eliminated: true, eliminatedTick: 120 }),
        player({ id: 5, hats: 0, eliminated: true }),
      ],
      2,
      ME,
      (id) => (id === 5 ? 120 : undefined),
    )
    expect(rows.map((r) => [r.id, r.rank])).toEqual([
      [3, 1],
      [ME, 2],
      [4, 3],
      [5, 3],
      [2, 5],
    ])
    expect(percentBeaten(rows, ME)).toBe(75)
  })
})
