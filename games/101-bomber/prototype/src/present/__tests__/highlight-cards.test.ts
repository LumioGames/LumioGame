import { describe, expect, it } from 'vitest'
import { assignHighlights, HIGHLIGHT_KINDS, HIGHLIGHT_TITLE, type HighlightKind, type HighlightStats } from '../highlight-cards'

const HZ = 20

function stats(id: number, over: Partial<HighlightStats> = {}): HighlightStats {
  return { id, bestChain: 0, kills: 0, hatKingTicks: 0, bricks: 0, clutch: 0, pickups: 0, ...over }
}

/** 确定性 LCG（测试里不碰 Math.random）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function randomStats(n: number, rnd: () => number, withBoss: boolean, withGold: boolean, zeroChance = 0.3): HighlightStats[] {
  const v = (max: number): number => (rnd() < zeroChance ? 0 : Math.floor(rnd() * max) + 1)
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    // 单颗炸弹不算连锁：有连锁时至少 ×2。
    bestChain: v(8) && 1 + v(8),
    kills: v(8),
    hatKingTicks: v(2400),
    bricks: v(40),
    clutch: v(3),
    pickups: v(20),
    ...(withBoss ? { bossKills: v(3) } : {}),
    ...(withGold ? { goldHearts: v(3) } : {}),
  }))
}

describe('assignHighlights · 覆盖率 100%', () => {
  it('gives every player exactly one card from the 8 candidates, for any 2–16 player input', () => {
    const rnd = lcg(20260928)
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + (trial % 15)
      const withBoss = trial % 3 !== 0
      const withGold = trial % 4 !== 0
      const players = randomStats(n, rnd, withBoss, withGold, trial % 5 === 0 ? 0.9 : 0.3)
      const cards = assignHighlights(players, HZ)
      expect(cards).toHaveLength(n)
      expect(cards.map((c) => c.id).sort((a, b) => a - b)).toEqual(players.map((p) => p.id))
      for (const c of cards) {
        expect(HIGHLIGHT_KINDS).toContain(c.kind)
        expect(c.title).toBe(HIGHLIGHT_TITLE[c.kind])
        expect(c.detail.length).toBeGreaterThan(0)
        if (!withBoss) expect(c.kind).not.toBe('bossHunter')
        if (!withGold) expect(c.kind).not.toBe('goldHearts')
      }
    }
  })

  it('still gives a card to a player with an all-zero line (and to an all-zero lobby)', () => {
    const cards = assignHighlights([stats(1, { kills: 3 }), stats(2)], HZ)
    expect(cards.map((c) => c.id)).toEqual([1, 2])
    expect(cards[0].kind).toBe('mostKills')
    const idle = assignHighlights([stats(1), stats(2), stats(3)], HZ)
    expect(idle).toHaveLength(3)
    expect(new Set(idle.map((c) => c.kind)).size).toBe(3)
  })
})

describe('assignHighlights · 尽量不重复', () => {
  it('uses min(n, 8) distinct kinds and at most ⌈n / 8⌉ of any kind when everyone has every stat', () => {
    const rnd = lcg(7)
    for (let n = 2; n <= 16; n++) {
      for (let rep = 0; rep < 12; rep++) {
        const cards = assignHighlights(randomStats(n, rnd, true, true, 0), HZ)
        const counts = new Map<HighlightKind, number>()
        for (const c of cards) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1)
        expect(counts.size).toBe(Math.min(n, 8))
        expect(Math.max(...counts.values())).toBeLessThanOrEqual(Math.ceil(n / 8))
      }
    }
  })

  it('without Boss / gold-heart data the six remaining kinds are spread first', () => {
    const rnd = lcg(99)
    const cards = assignHighlights(randomStats(12, rnd, false, false, 0), HZ)
    const kinds = new Set(cards.map((c) => c.kind))
    expect(kinds.size).toBe(6)
    expect(kinds.has('bossHunter')).toBe(false)
    expect(kinds.has('goldHearts')).toBe(false)
  })

  it('duplicates only when a player has nothing else positive', () => {
    const cards = assignHighlights([stats(1, { pickups: 9 }), stats(2, { pickups: 4 }), stats(3, { pickups: 1, kills: 1 })], HZ)
    expect(cards.map((c) => [c.id, c.kind])).toEqual([
      [1, 'porter'],
      [2, 'porter'],
      [3, 'mostKills'],
    ])
  })
})

describe('assignHighlights · 相对全场最突出', () => {
  it('gives each player the stat where they stand out most against the field', () => {
    const cards = assignHighlights(
      [
        // 1 号击杀全场第一，连锁只是中游：拿最多击杀。
        stats(1, { kills: 9, bestChain: 4, pickups: 5 }),
        // 2 号连锁全场第一：拿最长连锁。
        stats(2, { kills: 2, bestChain: 8, pickups: 6 }),
        // 3 号当帽王最久。
        stats(3, { hatKingTicks: 1200, pickups: 7 }),
        // 4 号拾取最多。
        stats(4, { pickups: 15, bricks: 3 }),
        // 5 号拆得最多。
        stats(5, { bricks: 30, pickups: 2 }),
        // 6 号两次 1 心逃生。
        stats(6, { clutch: 2, pickups: 1 }),
      ],
      HZ,
    )
    expect(cards.map((c) => c.kind)).toEqual(['mostKills', 'longestChain', 'hatKing', 'porter', 'demolition', 'clutch'])
    expect(cards.every((c) => c.leader)).toBe(true)
  })

  it('lets a double leader take one title and hands the other to the runner-up', () => {
    // 1 号击杀与连锁都第一；2 号击杀第二、别无所长——2 号拿最多击杀更突出，1 号拿最长连锁。
    const cards = assignHighlights([stats(1, { kills: 6, bestChain: 7 }), stats(2, { kills: 5 })], HZ)
    expect(cards.map((c) => [c.id, c.kind, c.leader])).toEqual([
      [1, 'longestChain', true],
      [2, 'mostKills', false],
    ])
  })

  it('a single-bomb "chain" is not a chain', () => {
    const cards = assignHighlights([stats(1, { bestChain: 1, pickups: 1 }), stats(2, { pickups: 3 })], HZ)
    expect(cards[0].kind).not.toBe('longestChain')
  })

  it('formats the detail line per kind', () => {
    const one = (over: Partial<HighlightStats>): string => assignHighlights([stats(1, over), stats(2)], HZ)[0].detail
    expect(one({ bestChain: 7 })).toBe('×7 连锁')
    expect(one({ kills: 4 })).toBe('击飞 4 人')
    expect(one({ hatKingTicks: 20 * 83 })).toBe('当帽王 1 分 23 秒')
    expect(one({ bricks: 31 })).toBe('拆掉 31 块积木')
    expect(one({ clutch: 2 })).toBe('1 心逃生 2 次')
    expect(one({ pickups: 12 })).toBe('拾取 12 个')
    expect(one({ bossKills: 2 })).toBe('击倒 2 个 Boss')
    expect(one({ goldHearts: 3 })).toBe('收集 3 颗金心')
  })

  it('is deterministic for the same input', () => {
    const rnd = lcg(3)
    const players = randomStats(16, rnd, true, true)
    expect(assignHighlights(players, HZ)).toEqual(assignHighlights(players, HZ))
  })
})
