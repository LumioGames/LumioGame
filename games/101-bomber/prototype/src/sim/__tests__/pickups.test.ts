import { describe, expect, it } from 'vitest'
import { BlockType, PickupKind } from '../../contract'
import { createPickup } from '../pickup'
import type { SimPlayer } from '../world'
import { addBomb, cell, evs, makeWorld, put, setBrick, step } from './helpers'

/** 设计 §7 第 10 项（矩阵 5.1–5.4；design §7.4 / §8.5 / §10）。 */
describe('pickups', () => {
  const cases: [string, PickupKind, (p: SimPlayer) => void, (p: SimPlayer) => void, (p: SimPlayer) => number, number][] = [
    ['FirePlus', PickupKind.FirePlus, (p) => void (p.power = 6), (p) => void (p.power = 5), (p) => p.power, 6],
    ['SpeedPlus', PickupKind.SpeedPlus, (p) => void (p.speed = 6000), (p) => void (p.speed = 5900), (p) => p.speed, 6000],
    ['HealthPack', PickupKind.HealthPack, (p) => void (p.health = 6), (p) => void (p.health = 3), (p) => p.health, 5],
  ]
  it.each(cases)('%s: at cap stays on the ground, below cap is taken and clamped (5.2, 5.3)', (_name, kind, atCap, below, read, expected) => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 5, 5)
    atCap(p)
    const it0 = createPickup(w, cell(w, 5, 5), kind)
    const f0 = step(w)
    expect(evs(f0, 'PickupTaken')).toHaveLength(0)
    expect(f0.snapshot.Pickups.map((x) => x.NetEntityIdRaw)).toEqual([it0.id])
    below(p)
    const f1 = step(w)
    expect(evs(f1, 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 2, Kind: kind }])
    expect(read(p)).toBe(expected)
    expect(f1.snapshot.Pickups).toHaveLength(0)
  })

  it('BombPlus cap counts bombs in hand plus live bombs on the field (5.3)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 5, 5)
    addBomb(w, 2, 9, 9, 100)
    p.capacity = 5
    createPickup(w, cell(w, 5, 5), PickupKind.BombPlus)
    expect(evs(step(w), 'PickupTaken')).toHaveLength(0)
    p.capacity = 4
    expect(evs(step(w), 'PickupTaken')).toHaveLength(1)
    expect(p.capacity).toBe(5)
  })

  it('a capped player does not block another player on the same cell', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 15, 15)
    put(w, 2, 5, 5).power = 6
    put(w, 3, 5, 5)
    createPickup(w, cell(w, 5, 5), PickupKind.FirePlus)
    expect(evs(step(w), 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 3 }])
  })

  it('a crate always drops one candy on its cell; the candy appears in the same tick the crate breaks', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    setBrick(w, 4, 1, BlockType.木箱)
    addBomb(w, 1, 3, 1, 1)
    const f = step(w)
    expect(evs(f, 'BrickDestroyed')).toMatchObject([{ Block: BlockType.木箱, Cell: { X: 4, Y: 1 } }])
    const sp = evs(f, 'PickupSpawned')
    expect(sp).toHaveLength(1)
    expect(sp[0].Cell).toEqual({ X: 4, Y: 1 })
    expect(f.snapshot.Pickups).toHaveLength(1)
  })

  it('soft-brick drops follow the seeded drop stream (5.1)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const bricks: [number, number][] = [
      [3, 2],
      [3, 4],
      [2, 3],
      [4, 3],
    ]
    for (const [x, y] of bricks) setBrick(w, x, y, BlockType.积木)
    addBomb(w, 1, 3, 3, 1)
    const r = w.rng.drop.clone()
    const expected: number[] = []
    for (let i = 0; i < 4; i++) {
      if (r.NextInt(0, 1000) >= w.cfg.dropRatePermille) continue
      const k = r.NextInt(0, 100)
      expected.push(k < 30 ? 0 : k < 60 ? 1 : k < 85 ? 2 : 3)
    }
    const f = step(w)
    expect(evs(f, 'BrickDestroyed')).toHaveLength(4)
    expect(evs(f, 'PickupSpawned').map((e) => e.Kind)).toEqual(expected)
  })
})
