import { describe, expect, it } from 'vitest'
import { compareBest, EMPTY_BEST, PERSONAL_BEST_KEY, PersonalBestStore, type BestStorage } from '../personal-best'

function memoryStorage(init: Record<string, string> = {}): BestStorage & { data: Record<string, string> } {
  const data = { ...init }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

const throwing: BestStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('compareBest', () => {
  it('flags every positive stat as a record on the first match; rank counts from any finish', () => {
    const r = compareBest(EMPTY_BEST, { bestChain: 4, kills: 2, rank: 5, kingSec: 12.3 })
    expect(r.newRecords).toEqual(['bestChain', 'mostKills', 'bestRank', 'longestKingSec'])
    expect(r.best).toEqual({ bestChain: 4, mostKills: 2, bestRank: 5, longestKingSec: 12.3 })
  })

  it('only strictly better values are records; a lower rank number is better; zeros never are', () => {
    const prev = { bestChain: 4, mostKills: 2, bestRank: 3, longestKingSec: 30 }
    const same = compareBest(prev, { bestChain: 4, kills: 2, rank: 3, kingSec: 30 })
    expect(same.newRecords).toEqual([])
    expect(same.best).toEqual(prev)
    const better = compareBest(prev, { bestChain: 6, kills: 1, rank: 1, kingSec: 10 })
    expect(better.newRecords).toEqual(['bestChain', 'bestRank'])
    expect(better.best).toEqual({ bestChain: 6, mostKills: 2, bestRank: 1, longestKingSec: 30 })
    expect(compareBest(EMPTY_BEST, { bestChain: 0, kills: 0, rank: 8, kingSec: 0 }).newRecords).toEqual(['bestRank'])
  })

  it('keeps the hat-king time floored to 0.1 s so it never reads higher than the results page', () => {
    expect(compareBest(EMPTY_BEST, { bestChain: 0, kills: 0, rank: 1, kingSec: 10.97 }).best.longestKingSec).toBe(10.9)
  })

  it('a single bomb is not a chain record', () => {
    expect(compareBest(EMPTY_BEST, { bestChain: 1, kills: 0, rank: 2, kingSec: 0 }).newRecords).toEqual(['bestRank'])
  })
})

describe('PersonalBestStore', () => {
  it('persists across stores and reports records against what was saved', () => {
    const s = memoryStorage()
    const first = new PersonalBestStore(s).record({ bestChain: 5, kills: 3, rank: 2, kingSec: 40 })
    expect(first.previous).toEqual(EMPTY_BEST)
    expect(first.newRecords).toHaveLength(4)
    expect(JSON.parse(s.data[PERSONAL_BEST_KEY])).toEqual(first.best)
    const second = new PersonalBestStore(s).record({ bestChain: 3, kills: 4, rank: 2, kingSec: 10 })
    expect(second.previous).toEqual(first.best)
    expect(second.newRecords).toEqual(['mostKills'])
    expect(second.best.mostKills).toBe(4)
  })

  it('still returns a displayable result when storage throws on read and write', () => {
    const store = new PersonalBestStore(throwing)
    const r = store.record({ bestChain: 3, kills: 1, rank: 4, kingSec: 5 })
    expect(r.best).toEqual({ bestChain: 3, mostKills: 1, bestRank: 4, longestKingSec: 5 })
    expect(r.newRecords).toEqual(['bestChain', 'mostKills', 'bestRank', 'longestKingSec'])
    // 同一会话里退回内存：第二局仍然按上一局比。
    const again = store.record({ bestChain: 2, kills: 2, rank: 4, kingSec: 5 })
    expect(again.previous.mostKills).toBe(1)
    expect(again.newRecords).toEqual(['mostKills'])
    expect(store.load().mostKills).toBe(2)
  })

  it('works with no storage at all, and treats corrupt or partial data as empty fields', () => {
    expect(new PersonalBestStore(null).record({ bestChain: 2, kills: 0, rank: 1, kingSec: 0 }).newRecords).toEqual(['bestChain', 'bestRank'])
    const corrupt = memoryStorage({ [PERSONAL_BEST_KEY]: '{not json' })
    expect(new PersonalBestStore(corrupt).load()).toEqual(EMPTY_BEST)
    const partial = memoryStorage({ [PERSONAL_BEST_KEY]: JSON.stringify({ mostKills: 7, bestRank: 'x', bestChain: -3 }) })
    expect(new PersonalBestStore(partial).load()).toEqual({ ...EMPTY_BEST, mostKills: 7 })
  })

  it('a throwing localStorage getter does not break the default store', () => {
    const g = globalThis as unknown as Record<string, unknown>
    const had = Object.getOwnPropertyDescriptor(g, 'localStorage')
    Object.defineProperty(g, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      const r = new PersonalBestStore().record({ bestChain: 0, kills: 1, rank: 3, kingSec: 0 })
      expect(r.newRecords).toEqual(['mostKills', 'bestRank'])
    } finally {
      if (had) Object.defineProperty(g, 'localStorage', had)
      else delete g.localStorage
    }
  })
})
