import { describe, expect, it } from 'vitest'
import { MatchPhase, PickupKind } from '../../contract'
import { createPickup } from '../pickup'
import { addBomb, cell, evs, makeWorld, put, run, startCircle, step } from './helpers'
import { giveSkill } from './skill-helpers'

/** 棉花兔被动·回春（原型扩展 NON-CONTRACT，ADR 0030，D3）：受伤后 10 秒没再挨打回 1 心，之后每 10 秒再回，满血为止。 */

function rabbitHitAt() {
  const w = makeWorld({ picks: ['rabbit', null] })
  const r = put(w, 1, 5, 5)
  put(w, 2, 13, 13)
  addBomb(w, 2, 5, 3, 1)
  step(w)
  const D = w.t
  return { w, r, D }
}

describe('regen', () => {
  it('hit at D heals 2 at D+200, again at D+400 … and stops at full (timers back to 0)', () => {
    const { w, r, D } = rabbitHitAt()
    r.health = 2
    // 直接把血压到 2（计时仍从 D 起算）：要回两次才满。
    expect(r.regenFromTick).toBe(D)
    expect(r.regenNextTick).toBe(D + 200)
    const frames = run(w, 400)
    const heals = evs(frames, 'PlayerHealed')
    expect(heals.map((h) => [h.Tick, h.Points, h.HealthPointsLeft])).toEqual([
      [D + 200, 2, 4],
      [D + 400, 2, 6],
    ])
    expect(heals[0]).toMatchObject({ NetEntityIdRaw: 1, Source: 'regen' })
    expect(r.health).toBe(w.cfg.maxHealthPoints)
    expect([r.regenFromTick, r.regenNextTick]).toEqual([0, 0])
    expect(evs(run(w, 300), 'PlayerHealed')).toHaveLength(0)
  })

  it('a second hit at D+150 moves the heal to D+350', () => {
    const { w, r, D } = rabbitHitAt()
    run(w, 149)
    addBomb(w, 2, 5, 3, 1)
    step(w)
    expect(w.t).toBe(D + 150)
    expect(r.health).toBe(2)
    const heals = evs(run(w, 250), 'PlayerHealed')
    expect(heals[0].Tick).toBe(D + 350)
  })

  it('a health pack does not reset the timer', () => {
    const { w, r, D } = rabbitHitAt()
    r.health = 2
    run(w, 50)
    createPickup(w, cell(w, 5, 5), PickupKind.HealthPack)
    step(w)
    expect(r.health).toBe(4)
    expect(r.regenNextTick).toBe(D + 200)
    const heals = evs(run(w, 150), 'PlayerHealed')
    expect(heals.map((h) => h.Tick)).toEqual([D + 200])
  })

  it('regen L2 heals after 160 ticks', () => {
    const w = makeWorld({ picks: ['rabbit', null] })
    const r = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'regen', 2, true)
    addBomb(w, 2, 5, 3, 1)
    step(w)
    const D = w.t
    expect(r.regenNextTick).toBe(D + 160)
  })

  it('legacy players and non-rabbits never heal', () => {
    const w = makeWorld({ players: 3, picks: [null, 'duck', 'bear'] })
    put(w, 1, 5, 5)
    put(w, 2, 7, 5)
    put(w, 3, 9, 5)
    for (const p of w.players) p.health = 2
    const frames = run(w, 450)
    expect(evs(frames, 'PlayerHealed')).toHaveLength(0)
    for (const p of w.players) expect(p.regenNextTick).toBe(0)
  })

  it('no regen while dead, and none during Settlement', () => {
    const { w, r } = rabbitHitAt()
    r.health = 2
    addBomb(w, 2, 5, 3, 1)
    step(w)
    expect(r.health).toBe(0)
    expect([r.regenFromTick, r.regenNextTick]).toEqual([0, 0])

    const w2 = makeWorld({ picks: ['rabbit', null] })
    const r2 = put(w2, 1, 5, 5)
    put(w2, 2, 13, 13)
    r2.health = 2
    w2.match.phase = MatchPhase.Settlement
    w2.match.endTick = w2.t
    const frames = []
    for (let i = 0; i < 250; i++) frames.push(step(w2))
    expect(evs(frames, 'PlayerHealed')).toHaveLength(0)
    expect(r2.regenNextTick).toBe(0)
  })

  it('standing in poison never regenerates (every hit resets the timer)', () => {
    const w = makeWorld({ picks: ['rabbit', null] })
    const r = put(w, 1, 1, 1)
    put(w, 2, 9, 9)
    startCircle(w)
    w.finalCircle!.ring = { min: 8, max: 10 }
    r.health = 5
    const frames = run(w, 120)
    expect(evs(frames, 'PlayerHealed')).toHaveLength(0)
    expect(r.health).toBeLessThan(5)
  })

  it('the snapshot publishes regenFromTick / regenNextTick', () => {
    const { w, r } = rabbitHitAt()
    const f = step(w)
    expect(f.snapshot.Players[0].skills).toMatchObject({ regenFromTick: r.regenFromTick, regenNextTick: r.regenNextTick })
    expect(r.regenNextTick).toBeGreaterThan(0)
  })
})
