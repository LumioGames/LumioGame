import { describe, expect, it } from 'vitest'
import { BlockType } from '../../contract'
import { createPickup } from '../pickup'
import { addBomb, cell, evs, makeWorld, put, setBrick, setGround, step } from './helpers'

/** 设计 §7 第 4、5 项：连锁 ChainId、地形阻断、Reach、帧末写入（矩阵 1.1–1.3 / 1.7 / 1.8 / 6.8）。 */
describe('explosion propagation', () => {
  it('chains a bomb reached by the flame in the same tick with the same ChainId (1.3)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const a = addBomb(w, 1, 3, 1, 1)
    const b = addBomb(w, 2, 5, 1, 40)
    const f = step(w)
    expect(a.explodedAtTick).toBe(f.snapshot.Tick)
    expect(b.explodedAtTick).toBe(f.snapshot.Tick)
    expect(b.chainId).toBe(a.id)
    const ex = evs(f, 'BombExploded')
    expect(ex.map((e) => e.proto?.IndexInChain)).toEqual([0, 1])
    expect(ex.every((e) => e.ChainId === a.id)).toBe(true)
    const chain = evs(f, 'ChainResolved')
    expect(chain).toHaveLength(1)
    expect(chain[0]).toMatchObject({ ChainId: a.id, BombCount: 2, OwnerNetEntityIdRaws: [1, 2] })
    // 爆炸不建实体：两颗弹都还在快照里，转入爆炸态（1.8）。
    expect(f.snapshot.Bombs.map((x) => x.BomberBombState.ExplodedAtTick)).toEqual([f.snapshot.Tick, f.snapshot.Tick])
  })

  it('does not chain a bomb behind a soft brick; the brick is destroyed and stops the arm (1.2)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    setBrick(w, 4, 1, BlockType.积木)
    const a = addBomb(w, 1, 3, 1, 1)
    const c = addBomb(w, 1, 5, 1, 40)
    const f = step(w)
    expect(c.explodedAtTick).toBe(0)
    expect(a.reachRight).toBe(0)
    const bd = evs(f, 'BrickDestroyed')
    expect(bd).toHaveLength(1)
    expect(bd[0]).toMatchObject({ Cell: { X: 4, Y: 1 }, Block: BlockType.积木, ChainId: a.id, OwnerNetEntityIdRaw: 1 })
  })

  it('two bombs on both sides of one brick: one write, one drop roll, both arms stop on the start-of-tick photo (6.8)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    setBrick(w, 4, 1, BlockType.积木)
    const a = addBomb(w, 1, 3, 1, 1)
    const c = addBomb(w, 2, 5, 1, 1)
    const expected = w.rng.drop.clone()
    if (expected.NextInt(0, 1000) < w.cfg.dropRatePermille) expected.NextInt(0, 100)
    const rev = w.rev
    expect(w.brick[cell(w, 4, 1)]).toBe(BlockType.积木)
    const f = step(w)
    expect(a.reachRight).toBe(0)
    expect(c.reachLeft).toBe(0)
    expect(a.chainId).not.toBe(c.chainId)
    expect(evs(f, 'BrickDestroyed')).toHaveLength(1)
    expect(w.rng.drop.state()).toEqual(expected.state())
    expect(f.snapshot.Terrain.rev).toBe(rev + 1)
    expect(f.snapshot.Terrain.brick[cell(w, 4, 1)]).toBe(BlockType.Air)
  })

  it('hard brick stops without being covered; Reach equals the actual arm length (1.1, 1.8)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const b = addBomb(w, 1, 2, 1, 1, 2)
    const big = addBomb(w, 1, 5, 5, 1, 3)
    const f = step(w)
    // (2,1)：上 = 外圈、下 = (2,2) 铁皮柱、左 (1,1) 后撞外圈、右两格全开。
    expect([b.reachUp, b.reachDown, b.reachLeft, b.reachRight]).toEqual([0, 0, 1, 2])
    expect(b.covered).not.toContain(cell(w, 2, 2))
    const ex = evs(f, 'BombExploded').find((e) => e.proto?.BombNetEntityIdRaw === b.id)
    expect(ex?.CellCount).toBe(4)
    // (5,5) 火力 3：十字全在奇数行 / 列上，四臂都能走满 3 格。
    expect([big.reachUp, big.reachDown, big.reachLeft, big.reachRight]).toEqual([3, 3, 3, 3])
    const view = f.snapshot.Bombs.find((x) => x.NetEntityIdRaw === big.id)!
    expect(view.BomberBombState.ReachRight).toBe(3)
  })

  it('water is covered then stops: a player standing in it is hit, the one behind is not (1.7)', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 15, 15)
    setGround(w, 4, 1, BlockType.水)
    put(w, 2, 4, 1)
    put(w, 3, 3, 1)
    const b = addBomb(w, 1, 5, 1, 1, 3)
    const f = step(w)
    expect(b.reachLeft).toBe(1)
    expect(b.covered).toContain(cell(w, 4, 1))
    expect(b.covered).not.toContain(cell(w, 3, 1))
    const hits = evs(f, 'DamageApplied').map((d) => d.VictimNetEntityIdRaw)
    expect(hits).toEqual([2])
  })

  it('destroys pickups lying in the cross and emits PickupDestroyed (5.4)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const it0 = createPickup(w, cell(w, 4, 1), 0)
    const far = createPickup(w, cell(w, 9, 9), 1)
    addBomb(w, 1, 3, 1, 1)
    const f = step(w)
    expect(evs(f, 'PickupDestroyed').map((e) => e.PickupNetEntityIdRaw)).toEqual([it0.id])
    expect(f.snapshot.Pickups.map((p) => p.NetEntityIdRaw)).toEqual([far.id])
  })

  it.each([
    ['A first', false],
    ['B first', true],
  ])('same-tick roots whose flames meet share one ChainId regardless of list order (%s)', (_n, bFirst) => {
    const w = makeWorld({ players: 3 })
    put(w, 3, 15, 15)
    put(w, 1, 15, 13)
    put(w, 2, 13, 15)
    const mk = () => {
      const a = addBomb(w, 1, 3, 1, 1, 1)
      const b = addBomb(w, 2, 5, 1, 1, 2)
      return { a, b }
    }
    let a, b
    if (bFirst) {
      b = addBomb(w, 2, 5, 1, 1, 2)
      a = addBomb(w, 1, 3, 1, 1, 1)
    } else ({ a, b } = mk())
    const c = addBomb(w, 1, 7, 1, 40, 2)
    const f = step(w)
    const chains = evs(f, 'ChainResolved')
    expect(chains).toHaveLength(1)
    expect(chains[0]).toMatchObject({ ChainId: Math.min(a.id, b.id), BombCount: 3 })
    expect([a.chainId, b.chainId, c.chainId]).toEqual([chains[0].ChainId, chains[0].ChainId, chains[0].ChainId])
    expect(evs(f, 'BombExploded').map((e) => e.proto?.IndexInChain)).toEqual([0, 1, 2])
  })
})
