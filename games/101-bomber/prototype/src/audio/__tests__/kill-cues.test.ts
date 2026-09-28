import { describe, expect, it } from 'vitest'
import { DeathCause, type BomberEvent, type U64 } from '../../contract'
import { coinCascadeCount, localBombHits } from '../cues'

const ME: U64 = 1

const dmg = (bomb: U64, chain: U64, victim: U64, owner: U64, cause?: number): BomberEvent => ({
  type: 'DamageApplied',
  VictimNetEntityIdRaw: victim,
  SourceBombNetEntityIdRaw: bomb,
  SourceBombOwnerNetEntityIdRaw: owner,
  ChainId: chain,
  HealthPointsLeft: 4,
  Tick: 1,
  ...(cause !== undefined ? { proto: { Cause: cause as DeathCause, Points: 2 } } : {}),
})

describe('localBombHits (design §3.1 命中：自己的炸弹伤到人 → 命中音)', () => {
  it('lists hits of my bombs on other players, on the same chain rhythm as the hurt sounds', () => {
    const hits = localBombHits([dmg(11, 5, 2, ME), dmg(12, 5, 2, ME), dmg(13, 5, 3, ME)], ME)
    expect(hits).toEqual([
      { victim: 2, delay: 0 },
      { victim: 2, delay: 0.04 },
      { victim: 3, delay: 0 },
    ])
  })

  it('ignores other owners, self-hits and non-bomb damage (poison / burn / toxin / drown)', () => {
    const ev = [
      dmg(11, 5, 2, 4),
      dmg(11, 5, ME, ME),
      dmg(0, 0, 2, ME, DeathCause.Poison),
      dmg(9, 0, 2, ME, DeathCause.Burn),
      dmg(9, 0, 2, ME, DeathCause.Toxin),
      dmg(0, 0, 2, ME, DeathCause.Drown),
    ]
    expect(localBombHits(ev, ME)).toEqual([])
  })

  it('uses BombExploded.proto.IndexInChain when present', () => {
    const boom: BomberEvent = { type: 'BombExploded', ChainId: 5, SourceBombOwnerNetEntityIdRaw: ME, CellCount: 5, Tick: 1, proto: { BombNetEntityIdRaw: 12, Cell: { X: 1, Y: 1 }, IndexInChain: 3 } }
    expect(localBombHits([boom, dmg(12, 5, 2, ME)], ME)).toEqual([{ victim: 2, delay: 0.12 }])
  })
})

describe('coinCascadeCount (死者 ≥ 6 帽：金币串音效)', () => {
  it('is 0 below 6 hats, else one coin per dropped power-up (capped)', () => {
    expect(coinCascadeCount(5, 3)).toBe(0)
    expect(coinCascadeCount(6, 3)).toBe(3)
    expect(coinCascadeCount(9, undefined)).toBe(5)
    expect(coinCascadeCount(40, 20)).toBe(12)
    // 一个都没掉（例如全被保护）就不响。
    expect(coinCascadeCount(8, 0)).toBe(0)
  })
})
