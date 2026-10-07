import { describe, expect, it } from 'vitest'
import { MatchPhase, PickupKind } from '../../contract'
import { createPickup } from '../pickup'
import { addBomb, cell, evs, makeWorld, put, run, startCircle, step } from './helpers'
import { giveSkill } from './skill-helpers'

/**
 * 棉花兔被动·回春（原型扩展 NON-CONTRACT，ADR 0030，D3）：受伤后 N 秒没再挨打回 points 点，之后每 N 秒再回，满血为止。
 * N / points 读配表（第 4 轮平衡后 L1 = 20 秒 / 半心，ADR 0034），这里不写死。
 */

function rabbitHitAt() {
  const w = makeWorld({ picks: ['rabbit', null] })
  const r = put(w, 1, 5, 5)
  put(w, 2, 13, 13)
  addBomb(w, 2, 5, 3, 1)
  step(w)
  const D = w.t
  return { w, r, D }
}

/** 回春 L1 / L2 的间隔（Tick）与每次回的点数，取自 w.ticks（= 配表 SKILLS.regen 换算）。 */
function regenRow(level = 1) {
  const w = makeWorld({ picks: ['rabbit', null] })
  return { N: w.ticks.skills.regen[level - 1].interval, P: w.rules.skills.regen.levels[level - 1].points }
}

describe('regen', () => {
  it('hit at D heals P at D+N, again at D+2N … and stops at full (timers back to 0)', () => {
    const { N, P } = regenRow()
    expect(P).toBeGreaterThan(0)
    const { w, r, D } = rabbitHitAt()
    r.health = 2
    // 直接把血压到 2（计时仍从 D 起算）：要回 ceil((满血 − 2) / P) 次才满，最后一次夹到满血。
    const max = w.cfg.maxHealthPoints
    const times = Math.ceil((max - 2) / P)
    expect(times).toBeGreaterThanOrEqual(2)
    expect(r.regenFromTick).toBe(D)
    expect(r.regenNextTick).toBe(D + N)
    const frames = run(w, N * times)
    const heals = evs(frames, 'PlayerHealed')
    expect(heals.map((h) => [h.Tick, h.Points, h.HealthPointsLeft])).toEqual(
      Array.from({ length: times }, (_, i) => {
        const left = Math.min(max, 2 + P * (i + 1))
        return [D + N * (i + 1), left - Math.min(max, 2 + P * i), left]
      }),
    )
    expect(heals[0]).toMatchObject({ NetEntityIdRaw: 1, Source: 'regen' })
    expect(r.health).toBe(w.cfg.maxHealthPoints)
    expect([r.regenFromTick, r.regenNextTick]).toEqual([0, 0])
    expect(evs(run(w, N + 100), 'PlayerHealed')).toHaveLength(0)
  })

  it('a second hit at D+150 moves the heal to D+150+N', () => {
    const { N } = regenRow()
    expect(N).toBeGreaterThan(150)
    const { w, r, D } = rabbitHitAt()
    run(w, 149)
    addBomb(w, 2, 5, 3, 1)
    step(w)
    expect(w.t).toBe(D + 150)
    expect(r.health).toBe(2)
    expect(r.regenNextTick).toBe(D + 150 + N)
    const heals = evs(run(w, N + 50), 'PlayerHealed')
    expect(heals[0].Tick).toBe(D + 150 + N)
  })

  it('a health pack does not reset the timer', () => {
    const { N } = regenRow()
    const { w, r, D } = rabbitHitAt()
    r.health = 2
    run(w, 50)
    createPickup(w, cell(w, 5, 5), PickupKind.HealthPack)
    step(w)
    expect(r.health).toBe(4)
    expect(r.regenNextTick).toBe(D + N)
    const heals = evs(run(w, N - 50), 'PlayerHealed')
    expect(heals.map((h) => h.Tick)).toEqual([D + N])
  })

  it('regen L2 heals after its own (shorter) interval', () => {
    const { N: N1 } = regenRow(1)
    const { N: N2 } = regenRow(2)
    expect(N2).toBeLessThan(N1)
    const w = makeWorld({ picks: ['rabbit', null] })
    const r = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'regen', 2, true)
    addBomb(w, 2, 5, 3, 1)
    step(w)
    const D = w.t
    expect(r.regenNextTick).toBe(D + N2)
  })

  it('legacy players and non-rabbits never heal', () => {
    const w = makeWorld({ players: 3, picks: [null, 'duck', 'bear'] })
    put(w, 1, 5, 5)
    put(w, 2, 7, 5)
    put(w, 3, 9, 5)
    for (const p of w.players) p.health = 2
    const frames = run(w, regenRow().N + 50)
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
    for (let i = 0; i < regenRow().N + 50; i++) frames.push(step(w2))
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
