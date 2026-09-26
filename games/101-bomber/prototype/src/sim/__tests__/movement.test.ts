import { describe, expect, it } from 'vitest'
import { BlockType, 方向 } from '../../contract'
import { haltMove, sideDirection } from '../move'
import { addBomb, BOMB, evs, makeWorld, mv, put, run, setBrick, step } from './helpers'

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

  it('corner assist within 0.5 cell; within the repeat window only 0.25 (ADR 0032)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.mx = 3300
    run(w, 2, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3500)
    expect(p.my).toBe(1650)

    // 偏 0.45 格：旧阈值 400 拒绝，新阈值 500 吸附（450 → 275 → 100 → 格心 + 75 往下）。
    p.mx = 3050
    p.my = 1500
    p.lastAssistTick = -1000
    run(w, 3, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3500)
    expect(p.my).toBe(1575)

    // 上次吸附刚过 2 Tick：连续吸附阈值 250，偏 300 被拒绝。
    p.mx = 3200
    p.my = 1500
    p.lastAssistTick = w.t - 2
    step(w, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3200)
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

  it('a quick perpendicular tap while running keeps going after release and finishes its snap (ADR 0032)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 2, 1)
    step(w, { 2: [mv(方向.右, true)] })
    step(w, { 2: [mv(方向.下, true)] })
    expect(p.mx).toBe(2850)
    run(w, 5, { 2: [mv(方向.停)] })
    // 松手后沿右接续到 3025，缓冲转向在 −475 处起吸附，吸附走完（不停在半路）并拐进下方通道 50。
    expect(p.mx).toBe(3500)
    expect(p.my).toBe(1550)
    // 吸附走完后松手就是停。
    step(w, { 2: [mv(方向.停)] })
    expect(p.my).toBe(1550)
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

describe('two held keys and the move chooser (ADR 0032)', () => {
  it('sideDirection: only a perpendicular 副方向 counts; opposite keys and 停 never do', () => {
    expect(sideDirection(方向.右, 方向.上)).toBe(方向.上)
    expect(sideDirection(方向.上, 方向.左)).toBe(方向.左)
    expect(sideDirection(方向.右, 方向.左)).toBe(方向.停)
    expect(sideDirection(方向.右, 方向.右)).toBe(方向.停)
    expect(sideDirection(方向.停, 方向.上)).toBe(方向.停)
    expect(sideDirection(方向.右, undefined)).toBe(方向.停)
  })

  it('H1: newest key blocked → the older held key keeps moving and the newest turns in at the first opening', () => {
    const run2 = (side: 方向 | undefined) => {
      const w = makeWorld()
      put(w, 1, 15, 15)
      const p = put(w, 2, 2, 1)
      setBrick(w, 3, 2, BlockType.积木)
      step(w, { 2: [mv(方向.右, true)] })
      step(w, { 2: [mv(方向.下, true, side)] })
      run(w, 20, { 2: [mv(方向.下, false, side)] })
      return p
    }
    // 第 3 轮：缓冲 6 Tick 接续后停死在 3725。
    expect(run2(undefined)).toMatchObject({ mx: 3725, my: 1500 })
    const p = run2(方向.右)
    expect(p.mx).toBe(5500)
    expect(p.my).toBeGreaterThan(1500)
  })

  it('the newest key wins at the first opening, and only snaps forward', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 1, 3)
    setBrick(w, 1, 2, BlockType.积木)
    setBrick(w, 3, 2, BlockType.积木)
    step(w, { 2: [mv(方向.右, true)] })
    let lastX = p.mx
    for (let i = 0; i < 40 && p.my > 1500; i++) {
      step(w, { 2: [mv(方向.上, i === 0, 方向.右)] })
      expect(p.mx).toBeGreaterThanOrEqual(lastX)
      lastX = p.mx
    }
    // (5,2) 是第一个口子：拐进 x = 5 列一路走到顶（到顶后上被挡，才又沿副方向往右滑）。
    expect(p).toMatchObject({ mx: 5500, my: 1500 })
  })

  it('an opposite 副方向 is ignored (that is a U-turn, not a wall slide)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 17, 1)
    run(w, 5, { 2: [mv(方向.右, true, 方向.左)] })
    expect(p).toMatchObject({ mx: 17500, my: 1500 })
  })

  it('the side fallback never walks into a cell about to explode; the primary still may', () => {
    const scene = (input: ReturnType<typeof mv>) => {
      const w = makeWorld()
      put(w, 1, 15, 15)
      const p = put(w, 2, 1, 1)
      setBrick(w, 1, 2, BlockType.积木)
      addBomb(w, 1, 3, 1, 5, 1)
      let maxCell = 1
      const frames = []
      for (let i = 0; i < 10; i++) {
        frames.push(step(w, { 2: [input] }))
        maxCell = Math.max(maxCell, Math.floor(p.mx / 1000))
      }
      return { maxCell, hits: evs(frames, 'DamageApplied').filter((d) => d.VictimNetEntityIdRaw === 2).length }
    }
    expect(scene(mv(方向.下, false, 方向.右))).toEqual({ maxCell: 1, hits: 0 })
    // 对照：玩家自己按右（主方向）照走不误。
    expect(scene(mv(方向.右)).maxCell).toBeGreaterThanOrEqual(2)
  })

  it('a blocked reverse press never carries the player on in the old direction', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 4, 1)
    p.lastDir = 方向.右
    addBomb(w, 1, 3, 1, 40)
    step(w, { 2: [mv(方向.左, true)] })
    expect(p.mx).toBe(4500)
  })

  it('H2: a late press 0.45 cell past the lane snaps back and turns', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.mx = 3950
    step(w, { 2: [mv(方向.下, true)] })
    run(w, 3, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(3500)
    expect(p.my).toBeGreaterThan(1500)
  })

  it('a press past the cell: the buffer carries on to the next lane and the held key turns there', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 3, 1)
    p.mx = 3825
    step(w, { 2: [mv(方向.右, true)] })
    expect(p.mx).toBe(4000)
    step(w, { 2: [mv(方向.下, true)] })
    run(w, 8, { 2: [mv(方向.下)] })
    expect(p.mx).toBe(5500)
    expect(p.my).toBeGreaterThan(1500)
  })

  it('haltMove clears in-flight movement (buffer and carry-on)', () => {
    const arm = () => {
      const w = makeWorld()
      put(w, 1, 15, 15)
      const p = put(w, 2, 2, 1)
      step(w, { 2: [mv(方向.右, true)] })
      step(w, { 2: [mv(方向.下, true)] })
      return { w, p }
    }
    const control = arm()
    step(control.w, { 2: [mv(方向.停)] })
    expect(control.p.mx).toBeGreaterThan(2850)

    const { w, p } = arm()
    haltMove(p)
    step(w, { 2: [mv(方向.停)] })
    expect(p).toMatchObject({ mx: 2850, my: 1500 })
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
