import { describe, expect, it } from 'vitest'
import { BlockType, bombCandyPool, candyPool, PickupKind, type SkillId } from '../../contract'
import { hatCountOf } from '../death-drops'
import type { Sfc32 } from '../rng'
import { chestCandyPool, rollSkillCandy } from '../skill-candy'
import { addBomb, evs, makeWorld, player, put, setBrick, step } from './helpers'
import { giveSkill, putCandy, putChest } from './skill-helpers'

/**
 * 技能糖（原型扩展 NON-CONTRACT，ADR 0030）：来源（D14）、吃糖规则（D6 / D16）、三种进化；技能不算帽子（D5）。
 * ADR 0033：池内权重炸弹类 2、其余 1；决赛圈宝箱的技能糖保底炸弹类。
 */

/** 参考实现：按 candyWeight 在 pool 序上掷一次（与 skill-candy.ts rollSkillCandy 同口径）。 */
function refRoll(rng: Sfc32, skills: Parameters<typeof candyPool>[0], pool: readonly SkillId[]): SkillId {
  let total = 0
  for (const id of pool) total += skills[id].candyWeight
  let r = rng.NextInt(0, total)
  for (const id of pool) {
    r -= skills[id].candyWeight
    if (r < 0) return id
  }
  return pool[pool.length - 1]
}

function crateBlast(permille: number, block: BlockType = BlockType.木箱, seed = 1) {
  const w = makeWorld({ seed, rules: { crateSkillCandyPermille: permille } })
  put(w, 1, 1, 17)
  put(w, 2, 17, 17)
  setBrick(w, 7, 5, block)
  addBomb(w, 1, 5, 5, 1, 2)
  const f = step(w)
  return { w, f }
}

describe('candy sources', () => {
  it('a crate at 1000‰ drops a level-1 skill candy from the pool; at 0‰ never', () => {
    const { w, f } = crateBlast(1000)
    const sp = evs(f, 'PickupSpawned')
    expect(sp).toHaveLength(1)
    expect(sp[0]).toMatchObject({ Kind: PickupKind.SkillCandy, Source: 'crate', SkillLevel: 1, Cell: { X: 7, Y: 5 } })
    expect(candyPool(w.rules.skills)).toContain(sp[0].Skill)
    expect(f.snapshot.Pickups[0].skill).toEqual({ id: sp[0].Skill, level: 1 })
    for (let seed = 1; seed <= 10; seed++) {
      const { f: g } = crateBlast(0, BlockType.木箱, seed)
      expect(evs(g, 'PickupSpawned')[0].Kind).not.toBe(PickupKind.SkillCandy)
    }
  })

  it('the drop stream is identical at 0‰ and 1000‰; the candy identity replays from rng.skill', () => {
    const a = crateBlast(0)
    const b = crateBlast(1000)
    expect(a.w.rng.drop.state()).toEqual(b.w.rng.drop.state())
    const w = makeWorld({ rules: { crateSkillCandyPermille: 1000 } })
    put(w, 1, 1, 17)
    put(w, 2, 17, 17)
    setBrick(w, 7, 5, BlockType.木箱)
    addBomb(w, 1, 5, 5, 1, 2)
    const replay = w.rng.skill.clone()
    const f = step(w)
    replay.NextInt(0, 1000)
    expect(evs(f, 'PickupSpawned')[0].Skill).toBe(refRoll(replay, w.rules.skills, candyPool(w.rules.skills)))
  })

  it('pool weights (ADR 0033): bomb-type 2 each, the other four 1 each; ~2/3 of crate candies are bomb-type', () => {
    const w = makeWorld()
    const pool = candyPool(w.rules.skills)
    expect(pool.map((id) => [id, w.rules.skills[id].candyWeight])).toEqual([
      ['bubble', 1],
      ['blink', 1],
      ['fireAura', 1],
      ['kick', 1],
      ['freezeBomb', 2],
      ['pierceBomb', 2],
      ['toxinBomb', 2],
      ['shockBomb', 2],
    ])
    const counts = new Map<SkillId, number>()
    const n = 12000
    for (let i = 0; i < n; i++) {
      const id = rollSkillCandy(w)!
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const bomb = bombCandyPool(w.rules.skills).reduce((a, id) => a + (counts.get(id) ?? 0), 0)
    expect(bomb / n).toBeGreaterThan(0.63)
    expect(bomb / n).toBeLessThan(0.70)
    for (const id of pool) expect(counts.get(id) ?? 0, id).toBeGreaterThan(0)
  })

  it('a final chest candy is always bomb-type by default (chestSkillCandyPool = bomb); rng.drop is untouched either way', () => {
    const open = (seed: number, chestSkillCandyPool: 'bomb' | 'all') => {
      const w = makeWorld({ seed, rules: { chestSkillCandyPool } })
      put(w, 1, 1, 17)
      put(w, 2, 17, 17)
      const c = putChest(w, 9, 5)
      c.hitsLeft = 0
      const replay = w.rng.skill.clone()
      const drop = w.rng.drop.state()
      const f = step(w)
      const candy = evs(f, 'PickupSpawned').filter((e) => e.Source === 'chest' && e.Kind === PickupKind.SkillCandy)
      expect(candy).toHaveLength(1)
      expect(w.rng.drop.state()).toEqual(drop)
      expect(candy[0].Skill).toBe(refRoll(replay, w.rules.skills, chestCandyPool(w)))
      return candy[0].Skill!
    }
    const bombPool = bombCandyPool(makeWorld().rules.skills)
    expect(bombPool).toEqual(['freezeBomb', 'pierceBomb', 'toxinBomb', 'shockBomb'])
    const got = new Set<SkillId>()
    for (let seed = 1; seed <= 40; seed++) {
      const s = open(seed, 'bomb')
      expect(bombPool).toContain(s)
      got.add(s)
    }
    expect(got.size).toBeGreaterThan(1)
    const all = new Set<SkillId>()
    for (let seed = 1; seed <= 40; seed++) all.add(open(seed, 'all'))
    expect([...all].some((id) => !bombPool.includes(id))).toBe(true)
  })

  it('a soft brick (积木) never drops skill candy, even at 1000‰', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { f } = crateBlast(1000, BlockType.积木, seed)
      for (const e of evs(f, 'PickupSpawned')) expect(e.Kind).not.toBe(PickupKind.SkillCandy)
    }
  })

  it('a final chest spills four power-ups plus one skill candy on 5 distinct cells within 2', () => {
    const w = makeWorld()
    put(w, 1, 1, 17)
    put(w, 2, 17, 17)
    const c = putChest(w, 9, 5)
    c.hitsLeft = 0
    c.opener = 0
    const f = step(w)
    const loot = evs(f, 'PickupSpawned').filter((e) => e.Source === 'chest')
    expect(loot.map((e) => e.Kind)).toEqual([0, 1, 2, 3, PickupKind.SkillCandy])
    expect(new Set(loot.map((e) => `${e.Cell.X},${e.Cell.Y}`)).size).toBe(5)
    for (const e of loot) expect(Math.abs(e.Cell.X - 9) + Math.abs(e.Cell.Y - 5)).toBeLessThanOrEqual(2)
  })

  it('rollSkillCandy returns null for an empty pool without drawing', () => {
    const w = makeWorld()
    const skills = Object.fromEntries(Object.entries(w.rules.skills).map(([k, v]) => [k, { ...v, candyWeight: 0 }])) as typeof w.rules.skills
    ;(w as { rules: typeof w.rules }).rules = { ...w.rules, skills }
    const before = w.rng.skill.state()
    expect(rollSkillCandy(w)).toBeNull()
    expect(w.rng.skill.state()).toEqual(before)
  })
})

describe('pickup rules', () => {
  function legacy(n = 2) {
    const w = makeWorld({ players: n })
    put(w, 1, 5, 5)
    for (let i = 2; i <= n; i++) put(w, i, 17, 19 - 2 * i)
    return w
  }

  it('an empty slot equips at the candy level; PickupTaken carries Skill / SkillLevel and precedes SkillGained', () => {
    const w = legacy()
    putCandy(w, 5, 5, 'kick', 2)
    const f = step(w)
    expect(player(w, 1).slots.passive).toEqual({ skill: 'kick', level: 2, bound: false, parts: null })
    const types = f.events.map((e) => e.type)
    expect(types.indexOf('PickupTaken')).toBeLessThan(types.indexOf('SkillGained'))
    expect(evs(f, 'PickupTaken')).toMatchObject([{ Kind: PickupKind.SkillCandy, proto: { Skill: 'kick', SkillLevel: 2 } }])
    expect(evs(f, 'SkillGained')).toMatchObject([{ PlayerNetEntityIdRaw: 1, Skill: 'kick', Slot: 'passive', Level: 2, How: 'equip' }])
  })

  it('same skill levels up by one (candy level ignored); at L3 the candy is refused and stays', () => {
    const w = legacy()
    giveSkill(w, 1, 'kick', 1)
    putCandy(w, 5, 5, 'kick', 3)
    expect(evs(step(w), 'SkillGained')).toMatchObject([{ How: 'levelUp', Level: 2 }])
    giveSkill(w, 1, 'kick', 3)
    putCandy(w, 5, 5, 'kick', 1)
    const f = step(w)
    expect(evs(f, 'PickupTaken')).toHaveLength(0)
    expect(w.pickups).toHaveLength(1)
    expect(player(w, 1).slots.passive?.level).toBe(3)
  })

  it('an occupied slot refuses the candy and does not block a second player on the cell', () => {
    const w = legacy(3)
    giveSkill(w, 1, 'blink', 1)
    const q = put(w, 2, 5, 5)
    q.mx = 5600
    putCandy(w, 5, 5, 'bubble')
    const f = step(w)
    expect(evs(f, 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 2 }])
    expect(player(w, 2).slots.active?.skill).toBe('bubble')
    expect(player(w, 1).slots.active?.skill).toBe('blink')
  })

  it('combo candy equips at level 1 with parts null; the same combo candy is then refused', () => {
    const w = legacy()
    putCandy(w, 5, 5, 'glacierBomb', 1)
    step(w)
    expect(player(w, 1).slots.bomb).toEqual({ skill: 'glacierBomb', level: 1, bound: false, parts: null })
    putCandy(w, 5, 5, 'glacierBomb', 1)
    expect(evs(step(w), 'PickupTaken')).toHaveLength(0)
  })

  it('skill pickups and evolutions never change the hat count or the hat king (D5)', () => {
    const w = legacy()
    for (const s of ['kick', 'freezeBomb', 'pierceBomb', 'bubble'] as const) {
      putCandy(w, 5, 5, s)
      const f = step(w)
      expect(evs(f, 'HatKingChanged')).toHaveLength(0)
      expect(hatCountOf(w, player(w, 1))).toBe(0)
    }
    expect(player(w, 1).slots.bomb?.skill).toBe('glacierBomb')
    expect(player(w, 1).slots.active?.skill).toBe('bounceBubble')
  })
})

describe('evolutions', () => {
  it('cat + fireAura → fireDash in place (bound, parts [blink L1 bound, fireAura L1])', () => {
    const w = makeWorld({ picks: ['cat', null] })
    put(w, 1, 5, 5)
    put(w, 2, 17, 17)
    putCandy(w, 5, 5, 'fireAura')
    const f = step(w)
    expect(player(w, 1).slots.active).toEqual({
      skill: 'fireDash',
      level: 1,
      bound: true,
      parts: [
        { skill: 'blink', level: 1, bound: true },
        { skill: 'fireAura', level: 1, bound: false },
      ],
    })
    expect(evs(f, 'SkillEvolved')).toEqual([
      { type: 'SkillEvolved', presentationOnly: true, PlayerNetEntityIdRaw: 1, From: ['blink', 'fireAura'], Combo: 'fireDash', Slot: 'active', FreedSlot: null, Tick: w.t },
    ])
    const types = f.events.map((e) => e.type)
    expect(types.indexOf('PickupTaken')).toBeLessThan(types.indexOf('SkillEvolved'))
  })

  it('bear + blink → fireDash; duck + kick → bounceBubble (passive stays empty)', () => {
    const w = makeWorld({ players: 2, picks: ['bear', 'duck'] })
    put(w, 1, 5, 5)
    put(w, 2, 9, 9)
    putCandy(w, 5, 5, 'blink')
    putCandy(w, 9, 9, 'kick')
    step(w)
    expect(player(w, 1).slots.active).toMatchObject({ skill: 'fireDash', bound: true, parts: [{ skill: 'fireAura', bound: true }, { skill: 'blink' }] })
    expect(player(w, 2).slots.active).toMatchObject({ skill: 'bounceBubble', bound: true })
    expect(player(w, 2).slots.passive).toBeNull()
  })

  it('legacy: kick in passive + bubble candy with an empty active slot → bounceBubble, passive freed', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'kick', 2)
    putCandy(w, 5, 5, 'bubble')
    const f = step(w)
    expect(player(w, 1).slots).toEqual({
      bomb: null,
      active: {
        skill: 'bounceBubble',
        level: 1,
        bound: false,
        parts: [
          { skill: 'kick', level: 2, bound: false },
          { skill: 'bubble', level: 1, bound: false },
        ],
      },
      passive: null,
    })
    expect(evs(f, 'SkillEvolved')).toMatchObject([{ From: ['kick', 'bubble'], Combo: 'bounceBubble', Slot: 'active', FreedSlot: 'passive' }])
  })

  it('freezeBomb + pierceBomb → glacierBomb in the bomb slot', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    put(w, 2, 17, 17)
    giveSkill(w, 1, 'freezeBomb', 1)
    putCandy(w, 5, 5, 'pierceBomb')
    step(w)
    expect(player(w, 1).slots.bomb).toMatchObject({ skill: 'glacierBomb', bound: false, parts: [{ skill: 'freezeBomb' }, { skill: 'pierceBomb' }] })
  })

  it('cat + kick, then bubble → refused (slotTaken): bounceBubble would need the active slot', () => {
    const w = makeWorld({ picks: ['cat', null] })
    put(w, 1, 5, 5)
    put(w, 2, 17, 17)
    putCandy(w, 5, 5, 'kick')
    step(w)
    putCandy(w, 5, 5, 'bubble')
    const f = step(w)
    expect(evs(f, 'PickupTaken')).toHaveLength(0)
    expect(player(w, 1).slots.active?.skill).toBe('blink')
    expect(player(w, 1).slots.passive?.skill).toBe('kick')
  })
})
