import { describe, expect, it } from 'vitest'
import { BlockType, candyPool, msToTicks, 方向, type TickFrame } from '../../contract'
import { addBomb, evs, makeWorld, mv, player, put, setBrick, setGround, SKILL, step } from './helpers'
import { face, giveSkill, putChest } from './skill-helpers'

/**
 * 飞腿袋鼠的专属主动技「飞踢」（原型扩展 NON-CONTRACT，用户 2026-09-28 拍板）：
 * 沿面朝方向——相邻格有静止的未爆炸弹就踢它；相邻格是空地且隔一格有静止炸弹就踢那颗；炸弹按现有踢弹滑速一直滑到被挡住，
 * 滑行 / 停下 / 入水熄灭并返还炸弹数与被动踢弹完全一致（复用 kick.ts）；kickedBy = 施放者，击杀仍归炸弹主人。
 * 冷却 4 / 3.5 / 3 秒；面前没有可踢的炸弹 → 施放失败、不进冷却。
 */

type W = ReturnType<typeof makeWorld>
const X = (w: W, ci: number) => ci % w.size
const kick = (w: W) => step(w, { 1: [SKILL] })

/** 1 号 = 飞腿袋鼠，站在 (x, y) 朝 dir；2 号（炸弹主人）远在 (17,17)。 */
function roo(x = 5, y = 5, dir: 方向 = 方向.右, players = 2) {
  const w = makeWorld({ players, picks: ['kangaroo'] })
  const k = put(w, 1, x, y)
  put(w, 2, 17, 17)
  face(w, 1, dir)
  return { w, k }
}

function expectFailed(w: W, f: TickFrame): void {
  expect(evs(f, 'SkillFailed')).toMatchObject([{ PlayerNetEntityIdRaw: 1, Skill: 'flyKick', Reason: 'noLanding' }])
  expect(evs(f, 'SkillActivated')).toHaveLength(0)
  expect(evs(f, 'BombKicked')).toHaveLength(0)
  expect(player(w, 1).cdUntilTick).toBe(0)
  expect(player(w, 1).cdFromTick).toBe(0)
}

describe('flyKick (kangaroo exclusive active)', () => {
  it('the kangaroo starts with flyKick Lv1 bound in the active slot', () => {
    const { k } = roo()
    expect(k.character).toBe('kangaroo')
    expect(k.slots.active).toEqual({ skill: 'flyKick', level: 1, bound: true, parts: null })
    expect(k.slots.passive).toBeNull()
  })

  it('adjacent static bomb: kicked along the facing, pushed one cell at once, kickedBy = caster, owner unchanged, CD 4 s', () => {
    const { w, k } = roo()
    const b = addBomb(w, 2, 6, 5, 200)
    const f = kick(w)
    const T = w.t
    const CD = msToTicks(4000, w.cfg.tickRateHz)
    expect(CD).toBe(80)
    expect(evs(f, 'BombKicked')).toEqual([
      { type: 'BombKicked', presentationOnly: true, BombNetEntityIdRaw: b.id, KickerNetEntityIdRaw: 1, Dir: 方向.右, FromCell: { X: 6, Y: 5 }, Tick: T },
    ])
    expect(evs(f, 'SkillActivated')).toMatchObject([
      { PlayerNetEntityIdRaw: 1, Skill: 'flyKick', Level: 1, Cell: { X: 5, Y: 5 }, ToCell: { X: 5, Y: 5 }, UntilTick: 0, CdUntilTick: T + CD },
    ])
    expect(evs(f, 'SkillFailed')).toHaveLength(0)
    expect(X(w, b.cell)).toBe(7)
    expect(b.kickedBy).toBe(1)
    expect(b.owner).toBe(2)
    expect(b.kickDir).toBe(方向.右)
    expect([k.cdFromTick, k.cdUntilTick]).toEqual([T, T + CD])
    // 袋鼠本人不动。
    expect([k.mx, k.my]).toEqual([5500, 5500])
  })

  it('slides at the existing kick speed (8 cells/s) until blocked — here the iron border', () => {
    const { w } = roo()
    const b = addBomb(w, 2, 6, 5, 400)
    kick(w)
    expect(w.ticks.kickMilliPerTick).toBe(400)
    // 与被动踢弹同一节奏：踢出的那个 Tick 已累计 400，之后每 Tick +400、满 1000 前进一格。
    const xs: number[] = []
    for (let i = 0; i < 4; i++) {
      step(w)
      xs.push(X(w, b.cell))
    }
    expect(xs).toEqual([7, 8, 8, 9])
    for (let i = 0; i < 40; i++) step(w)
    expect(X(w, b.cell)).toBe(17)
    expect(b.kickDir).toBe(方向.停)
    expect(b.explodedAtTick).toBe(0)
  })

  it('stops at a soft brick, another bomb or a chest; players never block, pickups neither', () => {
    for (const block of ['brick', 'bomb', 'chest'] as const) {
      const { w } = roo(5, 5, 方向.右, 3)
      put(w, 3, 9, 5)
      if (block === 'brick') setBrick(w, 12, 5, BlockType.积木)
      else if (block === 'bomb') addBomb(w, 2, 12, 5, 400)
      else putChest(w, 12, 5)
      const b = addBomb(w, 2, 6, 5, 400)
      kick(w)
      for (let i = 0; i < 30; i++) step(w)
      expect(X(w, b.cell), block).toBe(11)
      expect(b.kickDir).toBe(方向.停)
    }
  })

  it('one cell gap: the adjacent cell is open ground and the bomb behind it gets kicked (a player on the gap does not matter)', () => {
    const { w } = roo(5, 5, 方向.右, 3)
    put(w, 3, 6, 5)
    const b = addBomb(w, 2, 7, 5, 400)
    const f = kick(w)
    expect(evs(f, 'BombKicked')).toMatchObject([{ BombNetEntityIdRaw: b.id, KickerNetEntityIdRaw: 1, Dir: 方向.右, FromCell: { X: 7, Y: 5 } }])
    expect(X(w, b.cell)).toBe(8)
    expect(b.kickedBy).toBe(1)
    for (let i = 0; i < 40; i++) step(w)
    expect(X(w, b.cell)).toBe(17)
  })

  it('the adjacent bomb wins over a second bomb behind it; blocked right behind → nothing is kicked, the cast fails, no CD', () => {
    const { w } = roo()
    const near = addBomb(w, 2, 6, 5, 400)
    addBomb(w, 2, 7, 5, 400)
    expectFailed(w, kick(w))
    expect(X(w, near.cell)).toBe(6)
    // 紧贴着砖 / 宝箱 / 铁皮边也一样踢不动。
    for (const block of ['brick', 'chest', 'border'] as const) {
      const { w: w2 } = block === 'border' ? roo(16, 5) : roo()
      if (block === 'brick') setBrick(w2, 7, 5, BlockType.木箱)
      else if (block === 'chest') putChest(w2, 7, 5)
      const b = addBomb(w2, 2, block === 'border' ? 17 : 6, 5, 400)
      expectFailed(w2, kick(w2))
      expect(b.kickDir, block).toBe(方向.停)
    }
  })

  it('nothing kickable → SkillFailed(noLanding), no CD, the next real kick works at once', () => {
    // 面前什么都没有；炸弹隔两格（够不着）；相邻是砖 / 宝箱挡着后面的弹；相邻是铁皮柱；边界。
    const cases: [string, (w: W) => void, number, number, 方向][] = [
      ['empty', () => {}, 5, 5, 方向.右],
      ['too far', (w) => void addBomb(w, 2, 8, 5, 400), 5, 5, 方向.右],
      ['brick in front', (w) => (setBrick(w, 6, 5, BlockType.积木), void addBomb(w, 2, 7, 5, 400)), 5, 5, 方向.右],
      ['chest in front', (w) => (putChest(w, 6, 5), void addBomb(w, 2, 7, 5, 400)), 5, 5, 方向.右],
      ['iron pillar', () => {}, 6, 5, 方向.下],
      ['border', () => {}, 1, 5, 方向.左],
    ]
    for (const [name, setup, x, y, dir] of cases) {
      const { w } = roo(x, y, dir)
      setup(w)
      const f = kick(w)
      expect(evs(f, 'SkillFailed'), name).toMatchObject([{ Skill: 'flyKick', Reason: 'noLanding' }])
      expect(player(w, 1).cdUntilTick, name).toBe(0)
    }
    const { w, k } = roo()
    expectFailed(w, kick(w))
    const b = addBomb(w, 2, 6, 5, 400)
    const f = kick(w)
    expect(evs(f, 'BombKicked')).toHaveLength(1)
    expect(b.kickDir).toBe(方向.右)
    expect(k.cdUntilTick).toBe(w.t + 80)
  })

  it('a sliding bomb or a bomb in flames is not a target (and blocks the gap behind it)', () => {
    // 滑行中的弹：先被别人（被动踢弹）踢出去，正滑过袋鼠面前。
    const { w } = roo(5, 5, 方向.下, 3)
    put(w, 3, 3, 7)
    giveSkill(w, 3, 'kick', 3)
    const b = addBomb(w, 2, 4, 7, 400)
    let kicked = false
    for (let i = 0; i < 20 && !kicked; i++) kicked = evs(step(w, { 3: [mv(方向.右)] }), 'BombKicked').length > 0
    expect(kicked).toBe(true)
    // 滑到 (5,7)（袋鼠朝下隔一格）或 (5,6) 时出手。
    for (let i = 0; i < 10 && X(w, b.cell) < 5; i++) step(w)
    expect(b.kickDir).toBe(方向.右)
    const f = kick(w)
    expect(evs(f, 'BombKicked')).toHaveLength(0)
    expect(evs(f, 'SkillFailed')).toMatchObject([{ Reason: 'noLanding' }])

    // 爆炸态的弹（火焰中）。
    const { w: w2 } = roo()
    const fb = addBomb(w2, 2, 6, 5, 1, 1)
    step(w2)
    expect(fb.explodedAtTick).toBe(w2.t)
    expect(evs(kick(w2), 'SkillFailed')).toMatchObject([{ Reason: 'noLanding' }])
  })

  it('kicked into water: extinguished on the first water cell, the owner gets the bomb back (debt first); adjacent water = at once', () => {
    const { w, k } = roo()
    const o = player(w, 2)
    setGround(w, 9, 5, BlockType.水)
    setGround(w, 10, 5, BlockType.水)
    const b = addBomb(w, 2, 6, 5, 400)
    expect(o.capacity).toBe(0)
    kick(w)
    const frames: TickFrame[] = []
    for (let i = 0; i < 8; i++) frames.push(step(w))
    expect(evs(frames, 'BombExtinguished')).toMatchObject([{ OwnerNetEntityIdRaw: 2, Cell: { X: 9, Y: 5 } }])
    expect(w.bombs).not.toContain(b)
    expect(o.capacity).toBe(1)
    expect(k.capacity).toBe(w.cfg.initialBombCapacity)

    const { w: w2 } = roo()
    const o2 = player(w2, 2)
    setGround(w2, 7, 5, BlockType.水)
    addBomb(w2, 2, 6, 5, 400)
    o2.capacityDebt = 1
    const f = kick(w2)
    expect(evs(f, 'BombExtinguished')).toMatchObject([{ Cell: { X: 7, Y: 5 } }])
    expect(w2.bombs).toHaveLength(0)
    expect([o2.capacityDebt, o2.capacity]).toEqual([0, 0])
  })

  it('kill credit stays with the bomb owner, not the kicker', () => {
    const { w } = roo(5, 5, 方向.右, 3)
    const v = put(w, 3, 11, 5)
    v.health = 1
    const b = addBomb(w, 2, 6, 5, 10, 1)
    kick(w)
    const frames: TickFrame[] = []
    for (let i = 0; i < 12; i++) frames.push(step(w))
    expect(b.explodedAtTick).toBeGreaterThan(0)
    expect(evs(frames, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 3, SourceBombOwnerNetEntityIdRaw: 2 }])
    expect(evs(frames, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 3, KillerNetEntityIdRaw: 2 }])
  })

  it('cooldown 4 / 3.5 / 3 s by level; pressing during CD → SkillFailed(cooldown), the bomb stays put', () => {
    const { w, k } = roo()
    expect(w.rules.skills.flyKick.levels.map((l) => l.cdMs)).toEqual([4000, 3500, 3000])
    expect(w.ticks.skills.flyKick.map((r) => r.cd)).toEqual([80, 70, 60])
    const first = addBomb(w, 2, 6, 5, 400)
    kick(w)
    const T = w.t
    expect(first.kickDir).toBe(方向.右)
    // 第一颗滑走后，同一格再摆一颗静止的弹。
    step(w)
    step(w)
    expect(X(w, first.cell)).toBeGreaterThanOrEqual(8)
    const second = addBomb(w, 2, 6, 5, 400)
    expect(evs(kick(w), 'SkillFailed')).toMatchObject([{ Skill: 'flyKick', Reason: 'cooldown' }])
    while (w.t < T + 78) step(w)
    expect(evs(kick(w), 'SkillFailed')).toMatchObject([{ Reason: 'cooldown' }])
    expect(w.t).toBe(T + 79)
    expect(second.kickDir).toBe(方向.停)
    // t === cdUntilTick 时已可施放。
    const f = kick(w)
    expect(w.t).toBe(T + 80)
    expect(evs(f, 'BombKicked')).toMatchObject([{ BombNetEntityIdRaw: second.id }])
    expect(k.cdUntilTick).toBe(T + 160)

    // Lv3：CD 3 秒。
    const { w: w3, k: k3 } = roo()
    giveSkill(w3, 1, 'flyKick', 3, true)
    addBomb(w3, 2, 6, 5, 400)
    kick(w3)
    expect(k3.cdUntilTick).toBe(w3.t + 60)
  })

  it('facing = the last non-stop move input (blocked moves count too); 下 at match start', () => {
    const { w, k } = roo(5, 5, 方向.下)
    const up = addBomb(w, 2, 5, 4, 400)
    // 同一 Tick 按上 + Shift：面向先更新，再施放。
    const f = step(w, { 1: [mv(方向.上), SKILL] })
    expect(k.facing).toBe(方向.上)
    expect(evs(f, 'BombKicked')).toMatchObject([{ Dir: 方向.上, FromCell: { X: 5, Y: 4 } }])
    expect(Math.floor(up.cell / w.size)).toBe(3)
  })

  it('does not end respawn protection; frozen → SkillFailed(frozen)', () => {
    const { w, k } = roo()
    k.protectedUntilTick = w.t + 50
    addBomb(w, 2, 6, 5, 400)
    kick(w)
    expect(k.protectedUntilTick).toBeGreaterThan(w.t)

    const { w: w2, k: k2 } = roo()
    addBomb(w2, 2, 6, 5, 400)
    k2.frozenUntilTick = w2.t + 5
    expect(evs(kick(w2), 'SkillFailed')).toMatchObject([{ Skill: 'flyKick', Reason: 'frozen' }])
    expect(k2.cdUntilTick).toBe(0)
  })

  it('is kangaroo-only: never in the candy pool', () => {
    const w = makeWorld()
    expect(w.rules.skills.flyKick.candyWeight).toBe(0)
    expect(candyPool(w.rules.skills)).not.toContain('flyKick')
  })
})
