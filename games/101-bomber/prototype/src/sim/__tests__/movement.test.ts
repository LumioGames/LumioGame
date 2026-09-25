import { describe, expect, it } from 'vitest'
import { 方向 } from '../../contract'
import { addBomb, BOMB, evs, makeWorld, mv, put, run, step } from './helpers'

/** 设计 §7 第 6 项 + §3 手感规则（矩阵 1.5 / 1.6；design §6.1）。 */
describe('movement', () => {
  it('moves 175 milli-cells per tick at 3500 and stops at a cell centre in front of a wall', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 1, 1)
    step(w, { 2: [mv(方向.右, true)] })
    expect(p.mx).toBe(1675)
    // 向上：外圈铁皮，已在格心 → 不动。
    step(w, { 2: [mv(方向.上, true)] })
    expect(p.my).toBe(1500)
  })

  it('pass-through: the owner can walk off the bomb, and is blocked once he has left (1.6)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    const f0 = step(w, { 2: [BOMB] })
    expect(evs(f0, 'BombPlaced')).toHaveLength(1)
    run(w, 6, { 2: [mv(方向.右)] })
    expect(Math.floor(p.mx / 1000)).toBe(4)
    run(w, 10, { 2: [mv(方向.左)] })
    expect(p.mx).toBe(4500)
  })

  it('another player cannot enter a bomb cell', () => {
    const w = makeWorld()
    put(w, 1, 3, 1)
    const q = put(w, 2, 5, 1)
    step(w, { 1: [BOMB] })
    run(w, 12, { 2: [mv(方向.左)] })
    expect(q.mx).toBe(4500)
  })

  it('corner assist slides into a side lane within tolerance and refuses beyond it', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.mx = 3300
    run(w, 2, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3500)
    expect(p.my).toBe(1650)

    p.mx = 3050
    p.my = 1500
    p.lastAssistTick = -1000
    run(w, 3, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3050)
    expect(p.my).toBe(1500)
  })

  it('corner assist never pulls a player toward a cross that is about to explode', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.mx = 3300
    addBomb(w, 1, 3, 3, 5)
    step(w, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3300)
    expect(p.my).toBe(1500)
  })

  it('turn buffer: an early perpendicular press keeps running and turns at the next opening', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 2, 1)
    step(w, { 2: [mv(方向.右, true)] })
    expect(p.mx).toBe(2675)
    step(w, { 2: [mv(方向.下, true)] })
    run(w, 5, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3500)
    expect(p.my).toBeGreaterThan(1500)
  })

  it('a stopped player pressing into a pillar does not replay the direction he last walked (stale lastDir)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 1, 1)
    run(w, 6, { 2: [mv(方向.下)] })
    expect(p.my).toBe(2550)
    // 走回 (1,2) 格心停下。
    p.my = 2500
    run(w, 10, { 2: [mv(方向.停)] })
    run(w, 8, { 2: [mv(方向.右, true)] })
    expect(p.mx).toBe(1500)
    expect(p.my).toBe(2500)
  })

  it('the buffered continuation never carries the player into a cross about to explode', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 1, 1)
    run(w, 4, { 2: [mv(方向.下)] })
    expect(p.my).toBe(2200)
    // (3,3) 火力 2 的十字覆盖 (1,3)，已进危险窗。
    addBomb(w, 1, 3, 3, 6)
    const frames = [step(w, { 2: [mv(方向.右, true)] }), ...run(w, 12, { 2: [mv(方向.右)] })]
    expect(Math.floor(p.my / 1000)).toBe(2)
    expect(evs(frames, 'DamageApplied').filter((d) => d.VictimNetEntityIdRaw === 2)).toHaveLength(0)
  })

  it('a quick perpendicular tap while running keeps the live movement going after release until the turn', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 2, 1)
    step(w, { 2: [mv(方向.右, true)] })
    step(w, { 2: [mv(方向.下, true)] })
    expect(p.mx).toBe(2850)
    run(w, 5, { 2: [mv(方向.停)] })
    // 松手后仍沿右继续，进入转角修正容差后拐向下方通道（吸附到 x = 3500 途中）。
    expect(p.mx).toBeGreaterThan(3200)
    expect(p.my).toBe(1500)
  })

  it('without the buffer an off-lane perpendicular press just stops', () => {
    const w = makeWorld({ rules: { turnBufferTicks: 0 } })
    put(w, 1, 15, 15)
    const p = put(w, 2, 2, 1)
    step(w, { 2: [mv(方向.右, true)] })
    run(w, 6, { 2: [mv(方向.下, true)] })
    expect(p.mx).toBe(2675)
    expect(p.my).toBe(1500)
  })
})

describe('bomb placement admission and buffer', () => {
  it('step 3: no bomb in hand → rejected, nothing spent; the 125 ms buffer places it once one returns (1.5)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.capacity = 0
    const f0 = step(w, { 2: [BOMB] })
    expect(evs(f0, 'BombPlaced')).toHaveLength(0)
    expect(p.capacity).toBe(0)
    p.capacity = 1
    const f1 = step(w)
    expect(evs(f1, 'BombPlaced')).toHaveLength(1)
    expect(p.capacity).toBe(0)
  })

  it('the buffer expires after inputBuffer ticks', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.capacity = 0
    step(w, { 2: [BOMB] })
    run(w, w.ticks.inputBuffer - 1)
    p.capacity = 1
    expect(evs(run(w, 3), 'BombPlaced')).toHaveLength(0)
  })

  it('step 5: a bomb already on the cell → rejected, capacity untouched (1.5)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.capacity = 2
    const f0 = step(w, { 2: [BOMB] })
    expect(evs(f0, 'BombPlaced')).toMatchObject([{ OwnerNetEntityIdRaw: 2, Cell: { X: 3, Y: 1 }, FuseEndTick: f0.snapshot.Tick + w.ticks.fuse }])
    const f1 = step(w, { 2: [BOMB] })
    expect(evs(f1, 'BombPlaced')).toHaveLength(0)
    expect(p.capacity).toBe(1)
    expect(w.bombs).toHaveLength(1)
  })

  it('a press while on an occupied cell places the bomb when the player enters the next cell within the buffer', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.capacity = 2
    step(w, { 2: [BOMB] })
    const frames = [step(w, { 2: [mv(方向.右, true), BOMB] }), ...run(w, 2, { 2: [mv(方向.右)] })]
    const placed = evs(frames, 'BombPlaced')
    expect(placed).toHaveLength(1)
    expect(placed[0].Cell).toEqual({ X: 4, Y: 1 })
    expect(placed[0].Tick).toBe(frames[2].snapshot.Tick)
  })

  it('a bomb returns to the hand at detonation', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 9, 9)
    step(w, { 2: [BOMB] })
    expect(p.capacity).toBe(0)
    run(w, 3, { 2: [mv(方向.右, true)] })
    run(w, w.ticks.fuse, { 2: [mv(方向.右)] })
    expect(p.capacity).toBe(1)
  })
})
