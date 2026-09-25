import { describe, expect, it } from 'vitest'
import { PickupKind } from '../../contract'
import { newId } from '../world'
import { addBomb, cell, evs, makeWorld, put, run, step } from './helpers'

/** ADR 0029：死者掉出的强化落地后 deathDropProtect 内不会被爆炸摧毁；其余掉落物照旧可炸。 */
describe('death-drop protection', () => {
  const drop = (w: ReturnType<typeof makeWorld>, x: number, y: number, droppedBy: number) => {
    const it = { id: newId(w), cell: cell(w, x, y), kind: PickupKind.FirePlus, bornTick: w.t, droppedBy }
    w.pickups.push(it)
    return it
  }

  it('a fresh death drop survives a blast, a brick drop in the same blast is destroyed', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const death = drop(w, 9, 7, 2)
    const brick = drop(w, 11, 7, 0)
    addBomb(w, 1, 10, 7, 1, 2)
    const frames = run(w, 3)
    const destroyed = evs(frames, 'PickupDestroyed').map((e) => e.PickupNetEntityIdRaw)
    expect(destroyed).toContain(brick.id)
    expect(destroyed).not.toContain(death.id)
    expect(w.pickups.some((p) => p.id === death.id)).toBe(true)
  })

  it('after the protection window the same death drop is destroyed', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const death = drop(w, 9, 7, 2)
    run(w, w.ticks.deathDropProtect)
    addBomb(w, 1, 10, 7, 1, 2)
    const frames = run(w, 3)
    expect(evs(frames, 'PickupDestroyed').map((e) => e.PickupNetEntityIdRaw)).toContain(death.id)
  })

  it('the snapshot exposes protectedUntilTick for death drops only', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const death = drop(w, 9, 7, 2)
    drop(w, 11, 7, 0)
    const f = step(w)
    const byId = new Map(f.snapshot.Pickups.map((p) => [p.NetEntityIdRaw, p]))
    expect(byId.get(death.id)?.protectedUntilTick).toBe(death.bornTick + w.ticks.deathDropProtect)
    expect([...byId.values()].filter((p) => p.droppedBy === 0).every((p) => p.protectedUntilTick === 0)).toBe(true)
  })
})
