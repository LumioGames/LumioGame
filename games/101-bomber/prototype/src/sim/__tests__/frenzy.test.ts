import { describe, expect, it } from 'vitest'
import { BlockType, PickupKind, 方向, type BombPlaced, type TickFrame } from '../../contract'
import { hatCountOf, maxHealthOf } from '../death-drops'
import { createPickup } from '../pickup'
import type { World } from '../world'
import { addBomb, BOMB, cell, evs, makeWorld, mv, player, put, run, setGround, step } from './helpers'
import { giveSkill } from './skill-helpers'

/**
 * 狂暴糖（ADR 0040，design §8.5；主 loop 裁定口径）：吃到即回满血 + 6 秒狂暴。狂暴期间放弹先走独立池——同时在场（未爆）的
 * 本人狂暴弹 ≤ frenzyExtraBombs（6），爆了就补；狂暴弹引信 1.2 s、不计炸弹数与帽数、主人免疫、他人照常挨炸。
 * 池满时再放 = 普通炸弹（计数、普通引信、自己不免疫）。狂暴期间两次放弹间隔 ≥ frenzyMinIntervalTicks（5）。死亡即结束狂暴。
 */

function world(over: Parameters<typeof makeWorld>[0] = {}): World {
  const w = makeWorld({ players: 3, ...over })
  put(w, 1, 5, 5)
  put(w, 2, 17, 17)
  put(w, 3, 17, 15)
  return w
}

/** 让 1 号吃下一颗狂暴糖（脚下放一颗、走一步），返回拾取那一帧。 */
function eatFrenzy(w: World): TickFrame {
  const p = player(w, 1)
  createPickup(w, Math.floor(p.my / 1000) * w.size + Math.floor(p.mx / 1000), PickupKind.Frenzy, { source: 'supply', droppedBy: 0, fromCell: 0 })
  return step(w)
}

/** 空旷的奇数格（避开铁皮柱），供每 Tick 换格放弹。 */
function freeCells(w: World): [number, number][] {
  const out: [number, number][] = []
  for (let y = 1; y < w.size - 1; y += 2) for (let x = 1; x < w.size - 1; x += 2) if (!(x >= 15 && y >= 13)) out.push([x, y])
  return out
}

describe('frenzy candy (ADR 0040, design §8.5)', () => {
  it('pickup: refills to the personal cap and starts a 6 s frenzy', () => {
    const w = world()
    const p = player(w, 1)
    p.health = 1
    const f = eatFrenzy(w)
    expect(evs(f, 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 1, Kind: PickupKind.Frenzy }])
    expect(p.health).toBe(maxHealthOf(w, p))
    expect(p.frenzyUntilTick).toBe(w.t + w.ticks.frenzy)
    expect(w.ticks.frenzy).toBe(120)
    expect(f.snapshot.Players.find((q) => q.NetEntityIdRaw === 1)?.frenzyUntilTick).toBe(w.t + 120)
  })

  it('spamming bombs: ≥ 5 ticks between placements, 1.2 s fuse, ≤ 6 own live frenzy bombs at any tick, no capacity or hats spent; normal bombs after it ends', () => {
    const w = world()
    const p = player(w, 1)
    eatFrenzy(w)
    const until = p.frenzyUntilTick
    const cap0 = p.capacity
    const hats0 = hatCountOf(w, p)
    const cells = freeCells(w)
    const placed: BombPlaced[] = []
    let k = 0
    while (w.t < until + 20) {
      const [x, y] = cells[k++ % cells.length]
      put(w, 1, x, y)
      const f = step(w, { 1: [BOMB] })
      placed.push(...evs(f, 'BombPlaced').filter((e) => e.OwnerNetEntityIdRaw === 1))
      const live = w.bombs.filter((b) => b.owner === 1 && b.uncounted && b.explodedAtTick === 0)
      expect(live.length).toBeLessThanOrEqual(w.rules.frenzyExtraBombs)
      if (w.t < until) {
        expect(p.capacity).toBe(cap0)
        expect(hatCountOf(w, p)).toBe(hats0)
      }
      expect(p.health).toBeGreaterThan(0)
    }
    const during = placed.filter((e) => e.Tick < until)
    const after = placed.filter((e) => e.Tick >= until)
    expect(during.length).toBeGreaterThanOrEqual(20)
    for (let i = 1; i < during.length; i++) expect(during[i].Tick - during[i - 1].Tick).toBeGreaterThanOrEqual(w.rules.frenzyMinIntervalTicks)
    for (const e of during) expect(e.FuseEndTick - e.Tick).toBe(w.ticks.frenzyFuse)
    expect(w.ticks.frenzyFuse).toBe(24)
    // 狂暴结束后放的是普通弹：计数、普通引信。
    expect(after.length).toBeGreaterThan(0)
    expect(after[0].FuseEndTick - after[0].Tick).toBe(w.ticks.fuse)
    const normal = w.bombs.find((b) => b.id === after[0].proto!.BombNetEntityIdRaw)
    expect(normal?.uncounted).toBe(false)
  })

  it('when 6 own frenzy bombs are live the next press is a normal bomb (counted, normal fuse); with no bombs in hand nothing is placed', () => {
    const w = world({ rules: { frenzyMinIntervalTicks: 1 } })
    const p = player(w, 1)
    eatFrenzy(w)
    const cells = freeCells(w)
    const placed: BombPlaced[] = []
    for (let i = 0; i < 8; i++) {
      put(w, 1, ...cells[i])
      placed.push(...evs(step(w, { 1: [BOMB] }), 'BombPlaced'))
    }
    const fuses = placed.map((e) => e.FuseEndTick - e.Tick)
    expect(fuses).toEqual([24, 24, 24, 24, 24, 24, w.ticks.fuse])
    expect(p.capacity).toBe(0)
    const normal = w.bombs.find((b) => b.id === placed[6].proto!.BombNetEntityIdRaw)!
    expect(normal.uncounted).toBe(false)
    expect(w.bombs.filter((b) => b.uncounted)).toHaveLength(6)
  })

  it('own frenzy bomb does not hurt its owner but hurts others; the owner’s normal bomb and others’ frenzy bombs still hurt', () => {
    const w = world()
    const p = player(w, 1)
    eatFrenzy(w)
    put(w, 3, 7, 5)
    const f0 = step(w, { 1: [BOMB] })
    const bomb = w.bombs.find((b) => b.owner === 1)!
    expect(bomb.uncounted).toBe(true)
    expect(evs(f0, 'BombPlaced')).toHaveLength(1)
    const hp1 = p.health
    const hp3 = player(w, 3).health
    const frames = run(w, w.ticks.frenzyFuse + 2)
    const dmg = evs(frames, 'DamageApplied')
    expect(dmg.filter((d) => d.VictimNetEntityIdRaw === 1)).toHaveLength(0)
    expect(dmg.filter((d) => d.VictimNetEntityIdRaw === 3)).toHaveLength(1)
    expect(p.health).toBe(hp1)
    expect(player(w, 3).health).toBe(hp3 - w.rules.bombDamagePoints)
    // 爆炸不回手：炸弹数没变。
    expect(p.capacity).toBe(1)

    // 别人的狂暴弹照样炸我。
    const v = makeWorld({ players: 2 })
    const me = put(v, 1, 5, 5)
    put(v, 2, 7, 5)
    player(v, 2).frenzyUntilTick = v.t + 200
    step(v, { 2: [BOMB] })
    const enemy = v.bombs.find((b) => b.owner === 2)!
    expect(enemy.uncounted).toBe(true)
    const before = me.health
    run(v, v.ticks.frenzyFuse + 2)
    expect(me.health).toBe(before - v.rules.bombDamagePoints)
  })

  it('a normal (counted) bomb placed in frenzy after the pool is full still hurts its owner', () => {
    const w = world({ rules: { frenzyExtraBombs: 0 } })
    const p = player(w, 1)
    eatFrenzy(w)
    step(w, { 1: [BOMB] })
    const b = w.bombs.find((q) => q.owner === 1)!
    expect(b.uncounted).toBe(false)
    const hp = p.health
    run(w, w.ticks.fuse + 2)
    expect(p.health).toBe(hp - w.rules.bombDamagePoints)
  })

  it('kicking an own frenzy bomb into water does not hand a bomb back', () => {
    const w = world()
    const p = player(w, 1)
    put(w, 1, 1, 1)
    giveSkill(w, 1, 'kick', 1)
    eatFrenzy(w)
    step(w, { 1: [BOMB] })
    const b = w.bombs.find((q) => q.owner === 1)!
    expect(b.uncounted).toBe(true)
    // 把这颗狂暴弹挪到 (3,1)、(4,1) 放水，人站 (2,1) 往右踢：滑进第一格水即熄灭。
    b.cell = cell(w, 3, 1)
    setGround(w, 4, 1, BlockType.水)
    put(w, 1, 2, 1)
    const cap = p.capacity
    let extinguished = false
    for (let i = 0; i < 10 && !extinguished; i++) extinguished = evs(step(w, { 1: [mv(方向.右)] }), 'BombExtinguished').length > 0
    expect(extinguished).toBe(true)
    expect(w.bombs.includes(b)).toBe(false)
    expect(p.capacity).toBe(cap)
  })

  it('death ends the frenzy (cleared on death, not resumed on respawn)', () => {
    const w = world()
    const p = player(w, 1)
    eatFrenzy(w)
    expect(p.frenzyUntilTick).toBeGreaterThan(w.t)
    p.health = 2
    addBomb(w, 2, 6, 5, 1)
    const frames = run(w, 3)
    expect(evs(frames, 'PlayerDied').map((d) => d.VictimNetEntityIdRaw)).toContain(1)
    expect(p.frenzyUntilTick).toBe(0)
    expect(p.frenzyLastPlaceTick).toBe(0)
    const view = frames[frames.length - 1].snapshot.Players.find((q) => q.NetEntityIdRaw === 1)
    expect(view?.frenzyUntilTick ?? 0).toBe(0)
    run(w, w.ticks.respawn + 2)
    expect(p.health).toBeGreaterThan(0)
    expect(p.frenzyUntilTick).toBe(0)
  })
})
