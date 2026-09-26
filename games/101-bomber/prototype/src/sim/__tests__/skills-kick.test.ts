import { describe, expect, it } from 'vitest'
import { BlockType, PickupKind, 方向, type TickFrame } from '../../contract'
import { createPickup } from '../pickup'
import { addBomb, cell, evs, makeWorld, mv, player, put, setBrick, setGround, SKILL, step } from './helpers'
import { giveSkill, putChest } from './skill-helpers'

/**
 * 踢弹（原型扩展 NON-CONTRACT，ADR 0030，design §8.4）与弹射泡泡：先于移动判定、8 格 / 秒滑行、玩家不挡、
 * 进入的第一个水格熄灭（RESOLUTIONS #9 / #10）。
 */

const RIGHT = { 1: [mv(方向.右)] }
const X = (w: ReturnType<typeof makeWorld>, ci: number) => ci % w.size

/** 1 号（踢弹 L1）在 (1,1)，2 号的弹在 (3,1)；按住右直到踢出，返回踢出的那一帧。 */
function kickSetup(level = 1) {
  const w = makeWorld()
  const p = put(w, 1, 1, 1)
  put(w, 2, 17, 17)
  giveSkill(w, 1, 'kick', level)
  const b = addBomb(w, 2, 3, 1, 200)
  return { w, p, b }
}

function holdUntilKick(w: ReturnType<typeof makeWorld>, max = 20): TickFrame {
  for (let i = 0; i < max; i++) {
    const f = step(w, RIGHT)
    if (evs(f, 'BombKicked').length > 0) return f
  }
  throw new Error('no kick')
}

describe('kick', () => {
  it('L1: kicked the tick after reaching the centre, pushed one cell at once, 2 ticks per cell, stops after 3', () => {
    const { w, p, b } = kickSetup()
    let reached = -1
    for (let i = 0; i < 20 && reached < 0; i++) {
      step(w, RIGHT)
      if (p.mx === 2500) reached = w.t
    }
    expect(b.cell).toBe(cell(w, 3, 1))
    const f = step(w, RIGHT)
    const k = w.t
    expect(k).toBe(reached + 1)
    expect(evs(f, 'BombKicked')).toEqual([
      { type: 'BombKicked', presentationOnly: true, BombNetEntityIdRaw: b.id, KickerNetEntityIdRaw: 1, Dir: 方向.右, FromCell: { X: 3, Y: 1 }, Tick: k },
    ])
    expect(X(w, b.cell)).toBe(4)
    expect(b.kickedBy).toBe(1)
    // 玩家不停顿地跟上。
    expect(p.mx).toBeGreaterThan(2500)
    step(w)
    expect(X(w, b.cell)).toBe(4)
    step(w)
    expect(X(w, b.cell)).toBe(5)
    expect(w.t).toBe(k + 2)
    step(w)
    step(w)
    expect(X(w, b.cell)).toBe(6)
    expect(b.kickDir).toBe(方向.停)
    expect(b.kickAcc).toBe(0)
    step(w)
    step(w)
    expect(X(w, b.cell)).toBe(6)
  })

  it('stops early at a soft brick, another bomb or a chest; L3 slides until blocked', () => {
    for (const block of ['brick', 'bomb', 'chest'] as const) {
      const { w, b } = kickSetup()
      if (block === 'brick') setBrick(w, 6, 1, BlockType.积木)
      else if (block === 'bomb') addBomb(w, 2, 6, 1, 200)
      else putChest(w, 6, 1)
      holdUntilKick(w)
      for (let i = 0; i < 8; i++) step(w)
      expect(X(w, b.cell), block).toBe(5)
      expect(b.kickDir).toBe(方向.停)
    }
    const { w, b } = kickSetup(3)
    holdUntilKick(w)
    for (let i = 0; i < 40; i++) step(w)
    expect(X(w, b.cell)).toBe(17)
  })

  it('slides under a player and over a pickup', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    put(w, 3, 5, 1)
    giveSkill(w, 1, 'kick', 1)
    const b = addBomb(w, 2, 3, 1, 200)
    createPickup(w, cell(w, 4, 1), PickupKind.FirePlus)
    holdUntilKick(w)
    for (let i = 0; i < 8; i++) step(w)
    expect(X(w, b.cell)).toBe(6)
  })

  it('kicked into water: extinguished on the first water cell, capacity returned (debt first)', () => {
    const w = makeWorld()
    const p = put(w, 1, 1, 1)
    const o = put(w, 2, 17, 17)
    giveSkill(w, 1, 'kick', 3)
    setGround(w, 5, 1, BlockType.水)
    setGround(w, 6, 1, BlockType.水)
    const b = addBomb(w, 2, 3, 1, 200)
    expect(o.capacity).toBe(0)
    holdUntilKick(w)
    const frames = [step(w), step(w)]
    expect(evs(frames, 'BombExtinguished')).toEqual([{ type: 'BombExtinguished', presentationOnly: true, OwnerNetEntityIdRaw: 2, Cell: { X: 5, Y: 1 }, Tick: w.t }])
    expect(w.bombs).not.toContain(b)
    expect(o.capacity).toBe(1)
    expect(p.health).toBe(w.cfg.maxHealthPoints)
    expect(evs([step(w), step(w)], 'BombExploded')).toHaveLength(0)

    // 相邻就是水：踢出的那一刻就熄灭；主人背着 capacityDebt 时先抵债。
    const w2 = makeWorld()
    put(w2, 1, 1, 1)
    const o2 = put(w2, 2, 17, 17)
    giveSkill(w2, 1, 'kick', 1)
    setGround(w2, 4, 1, BlockType.水)
    addBomb(w2, 2, 3, 1, 200)
    o2.capacityDebt = 1
    const f = holdUntilKick(w2)
    expect(evs(f, 'BombExtinguished')).toMatchObject([{ Cell: { X: 4, Y: 1 } }])
    expect(w2.bombs).toHaveLength(0)
    expect(o2.capacityDebt).toBe(0)
    expect(o2.capacity).toBe(0)
  })

  it('no kick: without the skill, off-lane, a flaming bomb, a brick right behind, while frozen', () => {
    // 没技能：炸弹挡路。
    const w0 = makeWorld()
    const p0 = put(w0, 1, 1, 1)
    put(w0, 2, 17, 17)
    addBomb(w0, 2, 3, 1, 200)
    for (let i = 0; i < 15; i++) expect(evs(step(w0, RIGHT), 'BombKicked')).toHaveLength(0)
    expect(p0.mx).toBe(2500)

    // 不在通道上（垂直偏移未吸附完）。
    const { w: w1, p: p1 } = kickSetup()
    p1.mx = 2500
    p1.my = 1600
    expect(evs(step(w1, RIGHT), 'BombKicked')).toHaveLength(0)

    // 爆炸态的弹不能踢（也不挡路）。
    const w2 = makeWorld()
    put(w2, 1, 2, 1)
    put(w2, 2, 17, 17)
    giveSkill(w2, 1, 'kick', 1)
    const fb = addBomb(w2, 2, 3, 1, 1, 1)
    step(w2)
    expect(fb.explodedAtTick).toBe(w2.t)
    expect(evs(step(w2, RIGHT), 'BombKicked')).toHaveLength(0)

    // 身后紧贴着砖：踢不动、不出事件。
    const { w: w3, p: p3 } = kickSetup()
    setBrick(w3, 4, 1, BlockType.积木)
    for (let i = 0; i < 15; i++) expect(evs(step(w3, RIGHT), 'BombKicked')).toHaveLength(0)
    expect(p3.mx).toBe(2500)

    // 冻结中。
    const { w: w5, p: p5 } = kickSetup()
    p5.mx = 2500
    p5.frozenUntilTick = w5.t + 5
    expect(evs(step(w5, RIGHT), 'BombKicked')).toHaveLength(0)
  })

  it('a sliding bomb cannot be kicked again until it stops, and slides on under the would-be kicker', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const q = put(w, 3, 5, 1)
    giveSkill(w, 1, 'kick', 3)
    giveSkill(w, 3, 'kick', 3)
    const b = addBomb(w, 2, 3, 1, 200)
    holdUntilKick(w)
    expect(X(w, b.cell)).toBe(4)
    expect(b.kickDir).toBe(方向.右)
    // 3 号在 (5,1) 格心朝左推：相邻 (4,1) 的弹还在滑，踢不回去，也挡住了他；随后弹从他脚下滑过去。
    let kicks = 0
    for (let i = 0; i < 4; i++) kicks += evs(step(w, { 3: [mv(方向.左)] }), 'BombKicked').length
    expect(kicks).toBe(0)
    expect(X(w, b.cell)).toBeGreaterThanOrEqual(6)
    expect(b.kickDir).toBe(方向.右)
    expect(q.mx).toBeLessThan(5500)
  })

  it('a fuse ending mid-slide explodes where the bomb is, centred there, and the slide ends', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'kick', 3)
    const b = addBomb(w, 2, 3, 1, 10, 1)
    holdUntilKick(w)
    let at = -1
    for (let i = 0; i < 12 && at < 0; i++) {
      step(w)
      if (b.explodedAtTick > 0) at = b.cell
    }
    expect(X(w, at)).toBeGreaterThan(4)
    expect(X(w, at)).toBeLessThan(17)
    expect(b.covered[0]).toBe(at)
    expect([b.kickDir, b.kickCellsLeft, b.kickAcc]).toEqual([方向.停, 0, 0])
  })

  it('a kicked bomb chains another bomb from where it rests', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'kick', 1)
    const b = addBomb(w, 2, 3, 1, 30, 1)
    const other = addBomb(w, 2, 7, 1, 200, 1)
    holdUntilKick(w)
    for (let i = 0; i < 30 && b.explodedAtTick === 0; i++) step(w)
    // 火力 1 的弹从 (3,1) 够不着 (7,1)；踢到 (6,1) 后才连锁。
    expect(X(w, b.cell)).toBe(6)
    expect(other.explodedAtTick).toBe(b.explodedAtTick)
    expect(other.chainId).toBe(b.chainId)
  })

  it('bounceBubble kicks 5 cells only while bubbled', () => {
    const w = makeWorld({ picks: ['duck', null] })
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'bounceBubble', 1, true, [
      { skill: 'bubble', level: 1, bound: true },
      { skill: 'kick', level: 1, bound: false },
    ])
    const b = addBomb(w, 2, 3, 1, 200)
    step(w, { 1: [SKILL] })
    holdUntilKick(w)
    for (let i = 0; i < 12; i++) step(w)
    expect(X(w, b.cell)).toBe(8)

    const w2 = makeWorld({ picks: ['duck', null] })
    const p2 = put(w2, 1, 1, 1)
    put(w2, 2, 17, 17)
    giveSkill(w2, 1, 'bounceBubble', 1, true, [
      { skill: 'bubble', level: 1, bound: true },
      { skill: 'kick', level: 1, bound: false },
    ])
    addBomb(w2, 2, 3, 1, 400)
    step(w2, { 1: [SKILL] })
    for (let i = 0; i < 60; i++) step(w2)
    expect(player(w2, 1).bubbleUntilTick).toBeLessThanOrEqual(w2.t)
    for (let i = 0; i < 15; i++) expect(evs(step(w2, RIGHT), 'BombKicked')).toHaveLength(0)
    expect(p2.mx).toBe(2500)
  })

  it('two keys: primary 下 blocked by iron, 副方向 右 with a bomb ahead → kicks 右', () => {
    const w = makeWorld()
    const p = put(w, 1, 2, 1)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'kick', 1)
    const b = addBomb(w, 2, 3, 1, 200)
    const f = step(w, { 1: [mv(方向.下, false, 方向.右)] })
    expect(evs(f, 'BombKicked')).toMatchObject([{ Dir: 方向.右 }])
    expect(X(w, b.cell)).toBe(4)
    expect(p.facing).toBe(方向.下)
  })

  it('two keys: an opposite 副方向 never kicks backwards (only a perpendicular 副方向 counts, same as movement)', () => {
    const scene = (side?: 方向) => {
      const w = makeWorld()
      // (17,1) 右边 (18,1) 是边界铁皮；身后 (16,1) 是 2 号的静止弹。
      const p = put(w, 1, 17, 1)
      put(w, 2, 9, 17)
      giveSkill(w, 1, 'kick', 1)
      const b = addBomb(w, 2, 16, 1, 200)
      const f = step(w, { 1: [mv(方向.右, false, side)] })
      return { kicks: evs(f, 'BombKicked'), x: X(w, b.cell), mx: p.mx }
    }
    for (const side of [方向.左, undefined]) {
      const r = scene(side)
      expect(r.kicks, `side ${side}`).toHaveLength(0)
      expect(r.x, `side ${side}`).toBe(16)
      expect(r.mx, `side ${side}`).toBe(17500)
    }
  })

  it('the snapshot publishes the slide', () => {
    const { w, b } = kickSetup()
    const f = holdUntilKick(w)
    expect(f.snapshot.Bombs.find((v) => v.NetEntityIdRaw === b.id)?.kick).toEqual({
      dir: 方向.右,
      progressMilli: w.ticks.kickMilliPerTick,
      cellsLeft: 2,
      speedMilli: w.rules.kickSpeedMilli,
    })
  })
})
