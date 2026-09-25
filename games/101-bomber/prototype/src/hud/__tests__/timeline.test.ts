import { describe, expect, it } from 'vitest'
import { BlockType } from '../../contract'
import { attributeDestroyedBricks, HudTimeline } from '../timeline'
import { emptyBricks, exploded, ME, SIZE, snap } from './fixtures'

const at = (X: number, Y: number): number => Y * SIZE + X

describe('attributeDestroyedBricks', () => {
  it('attributes a brick at reach + 1 to the bomb whose arm stopped there', () => {
    const prev = emptyBricks()
    prev[at(4, 1)] = BlockType.积木
    prev[at(1, 4)] = BlockType.木箱
    prev[at(7, 7)] = BlockType.铁皮
    const s = snap({
      tick: 10,
      rev: 1,
      bombs: [{ id: 50, owner: ME, X: 1, Y: 1, chain: 9, exploded: 10, reach: [1, 2, 1, 2] }],
    })
    s.Terrain.brick[at(7, 7)] = BlockType.铁皮
    const out = attributeDestroyedBricks(prev, s, 9)
    expect(out).toHaveLength(2)
    expect(out.every((b) => b.OwnerNetEntityIdRaw === ME && b.ChainId === 9 && b.Tick === 10)).toBe(true)
    expect(out.map((b) => b.Block).sort()).toEqual([BlockType.积木, BlockType.木箱])
  })

  it('leaves owner 0 when no exploding bomb reaches the cell, and ignores bombs exploded earlier', () => {
    const prev = emptyBricks()
    prev[at(6, 6)] = BlockType.积木
    const s = snap({ tick: 10, rev: 1, bombs: [{ id: 50, owner: ME, X: 1, Y: 6, chain: 9, exploded: 5, reach: [0, 0, 0, 8] }] })
    const out = attributeDestroyedBricks(prev, s, 9)
    expect(out).toEqual([{ Cell: { X: 6, Y: 6 }, Block: BlockType.积木, OwnerNetEntityIdRaw: 0, ChainId: 0, Tick: 10 }])
  })
})

describe('HudTimeline', () => {
  it('releases events and snapshots in tick order, events before their snapshot, with the prior snapshot as `before`', () => {
    const tl = new HudTimeline()
    const s0 = snap({ tick: 0 })
    expect(tl.advance(s0, 0, []).map((b) => b.tick)).toEqual([0])
    const s1 = snap({ tick: 1 })
    // 新快照刚到、renderTick 还在 0：不应释放。
    expect(tl.advance(s1, 0.2, [])).toEqual([])
    const e1 = exploded(1, 7, ME)
    const out = tl.advance(s1, 1, [e1])
    expect(out).toHaveLength(1)
    expect(out[0].events).toEqual([e1])
    expect(out[0].snapshot).toBe(s1)
    expect(out[0].before).toBe(s0)
    expect(tl.latestProcessed()).toBe(s1)
  })

  it('handles skipped snapshots: events of a tick without its snapshot still get the last processed snapshot as before', () => {
    const tl = new HudTimeline()
    const s0 = snap({ tick: 0 })
    tl.advance(s0, 0, [])
    const s3 = snap({ tick: 3 })
    const out = tl.advance(s3, 3, [exploded(2, 7, ME), exploded(3, 8, ME)])
    expect(out.map((b) => [b.tick, b.snapshot?.Tick ?? null, b.before?.Tick ?? null])).toEqual([
      [2, null, 0],
      [3, 3, 0],
    ])
  })

  it('derives destroyed bricks from terrain diffs and releases them with the same tick', () => {
    const tl = new HudTimeline()
    const b0 = emptyBricks()
    b0[at(3, 1)] = BlockType.积木
    tl.advance(snap({ tick: 0, brick: b0, rev: 0 }), 0, [])
    const s1 = snap({ tick: 1, rev: 1, bombs: [{ id: 50, owner: ME, X: 1, Y: 1, chain: 4, exploded: 1, reach: [0, 0, 0, 1] }] })
    const out = tl.advance(s1, 1, [])
    expect(out).toHaveLength(1)
    expect(out[0].derivedBricks).toHaveLength(1)
    expect(out[0].derivedBricks[0].OwnerNetEntityIdRaw).toBe(ME)
  })

  it('does not diff terrain across a match change (new map is not a demolition)', () => {
    const tl = new HudTimeline()
    const b0 = emptyBricks().fill(BlockType.积木)
    tl.advance(snap({ tick: 0, brick: b0, rev: 0, matchIndex: 1 }), 0, [])
    const out = tl.advance(snap({ tick: 1, rev: 1, matchIndex: 2 }), 1, [])
    expect(out[0].derivedBricks).toEqual([])
  })
})
