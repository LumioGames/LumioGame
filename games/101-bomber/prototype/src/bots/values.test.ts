import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, BOT_TACTICS, PickupKind, type AbilityActivation, type SupplyView, type U64 } from '../contract'
import { boxHitValue, brickValue, isFrenzied, nearestEnemyWithin, pickFarm, pickFrenzyFlee, pickHuntTarget, pickPickup, pickSupply } from './behaviors'
import { BotBrain } from './bot-brain'
import { buildBoard } from './board'
import { cellIdx, config, ctxFor, finalCircle, makeSnapshot, rules, setCell, standardMap, type SnapSpec } from './test-fixtures'

/**
 * 原型扩展（NON-CONTRACT，ADR 0039 / 0040 / 0043）：Bot 价值表——金心、狂暴糖、分级资源箱、中央补给开启点、狂暴中的对手；
 * 以及快照 BombView.uncounted（不计数的弹不算常规弹量）。快照假件手搭（规则层 M1-2 并行实现）。
 */
const at = (c: number): [number, number] => [c % 19, Math.floor(c / 19)]
const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length

describe('pickup value table', () => {
  const one = (kind: PickupKind, X: number, Y: number, me: SnapSpec['players'][number] = { id: 1, X: 1, Y: 1 }): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [me],
    pickups: [{ id: 40, X, Y, kind }],
  })
  const goal = (spec: SnapSpec): [number, number] | null => {
    const g = pickPickup(ctxFor(spec, 1), 7)
    return g ? at(g.cell) : null
  }

  it('a gold heart is worth a long walk (12 steps) where a power-up is not', () => {
    expect(goal(one(PickupKind.GoldHeart, 1, 13))).toEqual([1, 13])
    expect(goal(one(PickupKind.FirePlus, 1, 13))).toBeNull()
  })

  it('no gold heart once the bot holds maxGoldHearts', () => {
    expect(goal(one(PickupKind.GoldHeart, 1, 5, { id: 1, X: 1, Y: 1, goldHearts: rules.maxGoldHearts }))).toBeNull()
    expect(goal(one(PickupKind.GoldHeart, 1, 5, { id: 1, X: 1, Y: 1, goldHearts: rules.maxGoldHearts - 1 }))).toEqual([1, 5])
  })

  it('a frenzy candy is worth an even longer walk; at equal distance frenzy > gold heart > power-up', () => {
    expect(goal(one(PickupKind.Frenzy, 1, 15))).toEqual([1, 15])
    const same = (a: PickupKind, b: PickupKind): [number, number] | null =>
      goal({
        map: standardMap(),
        tick: 100,
        players: [{ id: 1, X: 1, Y: 1 }],
        pickups: [
          { id: 40, X: 5, Y: 1, kind: a },
          { id: 41, X: 1, Y: 5, kind: b },
        ],
      })
    expect(same(PickupKind.FirePlus, PickupKind.GoldHeart)).toEqual([1, 5])
    expect(same(PickupKind.GoldHeart, PickupKind.Frenzy)).toEqual([1, 5])
    expect(same(PickupKind.Frenzy, PickupKind.GoldHeart)).toEqual([5, 1])
  })
})

describe('resource boxes (BotTactics.boxValue per hit)', () => {
  it('per-hit value: wood 1.5 (= the old crate weight), iron 3, gold 6 over 2 hits', () => {
    expect(boxHitValue(BOT_TACTICS, undefined)).toBe(1.5)
    const v = (tier: 'wood' | 'iron' | 'gold', req: number) => boxHitValue(BOT_TACTICS, { Cell: { X: 0, Y: 0 }, tier, HitsLeft: req, HitsRequired: req })
    expect(v('wood', 1)).toBe(1.5)
    expect(v('iron', 1)).toBe(3)
    expect(v('gold', 2)).toBe(3)
  })

  // 自己 (5,5) 火力 2；(7,5) 是木箱格（资源箱砖层一律是木箱）。
  const box = (tier?: 'wood' | 'iron' | 'gold', extra: Partial<SnapSpec> = {}): SnapSpec => ({
    map: setCell(standardMap(), 7, 5, 'c'),
    tick: 100,
    players: [{ id: 1, X: 5, Y: 5 }],
    ...(tier ? { resourceBoxes: [{ X: 7, Y: 5, tier }] } : {}),
    ...extra,
  })

  it('brickValue reads the tier from the snapshot; an unlisted crate is wood', () => {
    const here = cellIdx(5, 5)
    const bv = (spec: SnapSpec) => brickValue(ctxFor(spec, 1), here, 2)
    expect(bv(box())).toBe(1.5)
    expect(bv(box('wood'))).toBe(1.5)
    expect(bv(box('iron'))).toBe(3)
    expect(bv(box('gold'))).toBe(3)
    expect(bv({ ...box(), map: setCell(standardMap(), 7, 5, 'b') })).toBe(1)
  })

  it('a gold box that still needs 2 hits is worth hitting even if another bomb will hit it; a doomed iron box is not', () => {
    const here = cellIdx(5, 5)
    // 别人的弹 (9,5) 火力 2 会先炸到 (7,5)。
    const other = { bombs: [{ id: 20, X: 9, Y: 5, owner: 2, fuseEndTick: 130 }] }
    expect(brickValue(ctxFor(box('gold', other), 1), here, 2)).toBe(3)
    expect(brickValue(ctxFor(box('iron', other), 1), here, 2)).toBe(0)
    expect(brickValue(ctxFor({ ...box('gold', other), resourceBoxes: [{ X: 7, Y: 5, tier: 'gold', hitsLeft: 1 }] }, 1), here, 2)).toBe(0)
  })

  it('farming prefers the gold box over an equally near wood box', () => {
    let map = standardMap()
    map = setCell(map, 9, 5, 'c')
    map = setCell(map, 5, 9, 'c')
    const spec: SnapSpec = {
      map,
      tick: 100,
      players: [{ id: 1, X: 5, Y: 5 }],
      resourceBoxes: [
        { X: 9, Y: 5, tier: 'gold' },
        { X: 5, Y: 9, tier: 'wood' },
      ],
    }
    const g = pickFarm(ctxFor(spec, 1), -1)
    expect(g).not.toBeNull()
    expect(at(g!.cell)[1]).toBe(5)
    const swapped = pickFarm(ctxFor({ ...spec, resourceBoxes: [{ X: 9, Y: 5, tier: 'wood' }, { X: 5, Y: 9, tier: 'gold' }] }, 1), -1)
    expect(at(swapped!.cell)[0]).toBe(5)
  })
})

describe('central supply (announced → hold the open point)', () => {
  const supply = (state: SupplyView['state']): SupplyView => ({ Cell: { X: 9, Y: 9 }, announceTick: 50, openTick: 300, state })
  const spec = (s: SupplyView | null, me: [number, number] = [9, 3]): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [{ id: 1, X: me[0], Y: me[1] }],
    supply: s,
  })
  const near = (c: [number, number]) => Math.max(Math.abs(c[0] - 9), Math.abs(c[1] - 9))

  it('announced and within reach: the nearest rest cell within 1 of the open point', () => {
    const g = pickSupply(ctxFor(spec(supply('announced')), 1))
    expect(g).not.toBeNull()
    expect(near(at(g!.cell))).toBeLessThanOrEqual(BOT_TACTICS.supplyHoldCells)
    expect(at(g!.cell)).toEqual([9, 8])
  })

  it('pending / opened / no supply / out of reach → nothing', () => {
    for (const s of [supply('pending'), supply('opened'), null]) expect(pickSupply(ctxFor(spec(s), 1))).toBeNull()
    expect(pickSupply(ctxFor(spec(supply('announced')), 1, { tactics: { ...BOT_TACTICS, supplyReachSteps: 4 } }))).toBeNull()
  })

  it('in the brain: a bot walks to the announced supply', () => {
    const b = new BotBrain({ self: 1, seed: 3, personality: 'farmer', config, rules, profile: { ...BOT_PROFILES.normal, noisePermille: 0 } })
    b.decide(makeSnapshot(spec(supply('announced'))))
    const st = b.debugState()
    expect(st.mode).toBe('pickup')
    expect(near([st.goal!.X, st.goal!.Y])).toBeLessThanOrEqual(1)
    const idle = new BotBrain({ self: 1, seed: 3, personality: 'farmer', config, rules, profile: { ...BOT_PROFILES.normal, noisePermille: 0 } })
    idle.decide(makeSnapshot(spec(supply('pending'))))
    expect(idle.debugState().mode).not.toBe('pickup')
  })
})

describe('frenzied enemies are a high threat', () => {
  const two = (frenzyUntil: number | undefined, me: [number, number] = [1, 1], f: [number, number] = [5, 1], n: [number, number] = [1, 9]): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [
      { id: 1, X: me[0], Y: me[1] },
      { id: 2, X: f[0], Y: f[1], ...(frenzyUntil !== undefined ? { frenzyUntil } : {}) },
      { id: 3, X: n[0], Y: n[1] },
    ],
  })

  it('isFrenzied reads frenzyUntilTick (exclusive); absent = no', () => {
    expect(isFrenzied({}, 100)).toBe(false)
    expect(isFrenzied({ frenzyUntilTick: 101 }, 100)).toBe(true)
    expect(isFrenzied({ frenzyUntilTick: 100 }, 100)).toBe(false)
  })

  it('hunting skips toward the other enemy; near-by engage ignores the frenzied one', () => {
    expect(pickHuntTarget(ctxFor(two(undefined), 1))?.NetEntityIdRaw).toBe(2)
    expect(pickHuntTarget(ctxFor(two(300), 1))?.NetEntityIdRaw).toBe(3)
    expect(nearestEnemyWithin(ctxFor(two(undefined), 1), 6)?.NetEntityIdRaw).toBe(2)
    expect(nearestEnemyWithin(ctxFor(two(300), 1), 6)).toBeNull()
  })

  it('flee: within 4 cells of a frenzied enemy the bot heads for a farther rest cell (≤ 8 steps)', () => {
    const spec = two(300, [5, 5], [7, 5], [17, 17])
    const ctx = ctxFor(spec, 1)
    const g = pickFrenzyFlee(ctx)
    expect(g).not.toBeNull()
    const [x, y] = at(g!.cell)
    expect(Math.abs(x - 7) + Math.abs(y - 5)).toBeGreaterThan(2)
    expect(ctx.field.steps[g!.cell]).toBeLessThanOrEqual(BOT_TACTICS.frenzyFleeSteps)
  })

  it('no flee when the enemy is not frenzied, the frenzy is over, it is 5+ cells away, or the bot is frenzied itself', () => {
    expect(pickFrenzyFlee(ctxFor(two(undefined, [5, 5], [7, 5]), 1))).toBeNull()
    expect(pickFrenzyFlee(ctxFor(two(90, [5, 5], [7, 5]), 1))).toBeNull()
    expect(pickFrenzyFlee(ctxFor(two(300, [5, 5], [11, 5]), 1))).toBeNull()
    const both: SnapSpec = { ...two(300, [5, 5], [7, 5]), players: [{ id: 1, X: 5, Y: 5, frenzyUntil: 300 }, { id: 2, X: 7, Y: 5, frenzyUntil: 300 }] }
    expect(pickFrenzyFlee(ctxFor(both, 1))).toBeNull()
  })

  it('in the brain: mode flee (enemy 4 cells away, not in the cross — so no opportunistic bomb first)', () => {
    const b = new BotBrain({ self: 1, seed: 3, personality: 'hunter', config, rules, profile: { ...BOT_PROFILES.normal, noisePermille: 0 } })
    b.decide(makeSnapshot(two(300, [5, 5], [7, 7], [17, 17])))
    expect(b.debugState().mode).toBe('flee')
    const calm = new BotBrain({ self: 1, seed: 3, personality: 'hunter', config, rules, profile: { ...BOT_PROFILES.normal, noisePermille: 0 } })
    calm.decide(makeSnapshot(two(undefined, [5, 5], [7, 7], [17, 17])))
    expect(calm.debugState().mode).not.toBe('flee')
  })
})

describe('BombView.uncounted', () => {
  it('the board keeps the flag (the bomb still burns and chains)', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 5, Y: 5, owner: 1, fuseEndTick: 130, uncounted: true }, { id: 21, X: 7, Y: 5, owner: 1, fuseEndTick: 130 }] }))
    expect(board.pending.map((b) => b.uncounted)).toEqual([true, false])
  })

  it('own uncounted bombs do not fill the bomb+ cap', () => {
    // 手上 3 + 场上 2 颗常规弹 = 5 < 6：炸弹+ 还值得捡；再多一颗不计数的狂暴弹也一样（旧口径会算成 6 = 满）。
    const spec = (uncounted: boolean): SnapSpec => ({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1, bombs: 3 }],
      bombs: [
        { id: 20, X: 17, Y: 17, owner: 1, fuseEndTick: 300 },
        { id: 21, X: 17, Y: 15, owner: 1, fuseEndTick: 300 },
        { id: 22, X: 15, Y: 17, owner: 1, fuseEndTick: 300, uncounted },
      ],
      pickups: [{ id: 40, X: 1, Y: 5, kind: PickupKind.BombPlus }],
    })
    expect(pickPickup(ctxFor(spec(true), 1), 7)).not.toBeNull()
    expect(pickPickup(ctxFor(spec(false), 1), 7)).toBeNull()
  })

  it('an uncounted own bomb does not use up normal’s one live attack bomb', () => {
    // 进攻弹要「原地站稳时直接按下」才记成进攻弹：对手先带重生保护（不打），Bot 在攻击位上停稳，保护一过就放。
    // 第一颗放在 (5,5)；之后人在 (9,5)、对手在 (11,5) 重演一遍。常规弹占满 normal 的「1 颗进攻弹」，狂暴弹不占。
    const spec = (t: number, me: [number, number], foe: [number, number], guarded: boolean, bomb: boolean, uncounted: boolean): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: me[0], Y: me[1], bombs: 3 },
        { id: 2, X: foe[0], Y: foe[1], protectedUntil: guarded ? 100000 : 0 },
      ],
      bombs: bomb ? [{ id: 51, X: 5, Y: 5, owner: 1, fuseEndTick: t + 300, uncounted }] : [],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    const run = (uncounted: boolean, seed: number): { first: boolean; second: number } => {
      const b = new BotBrain({ self: 1 as U64, seed, personality: 'hunter', config, rules, profile: { ...BOT_PROFILES.normal, noisePermille: 0, attackSkipPermille: 0 } })
      let t = 300
      for (const end = t + 6; t < end; t++) b.decide(makeSnapshot(spec(t, [5, 5], [7, 5], true, false, uncounted)))
      let first = false
      for (const end = t + 12; t < end && !first; t++) first = bombs(b.decide(makeSnapshot(spec(t, [5, 5], [7, 5], false, false, uncounted)))) > 0
      b.decide(makeSnapshot(spec(t++, [5, 5], [7, 5], true, true, uncounted)))
      for (const end = t + 6; t < end; t++) b.decide(makeSnapshot(spec(t, [9, 5], [11, 5], true, true, uncounted)))
      let second = 0
      for (const end = t + 20; t < end; t++) second += bombs(b.decide(makeSnapshot(spec(t, [9, 5], [11, 5], false, true, uncounted))))
      return { first, second }
    }
    let counted = 0
    let free = 0
    for (let seed = 1; seed <= 5; seed++) {
      const c = run(false, seed)
      const u = run(true, seed)
      expect(c.first).toBe(true)
      expect(u.first).toBe(true)
      counted += c.second
      free += u.second
    }
    expect(counted).toBe(0)
    expect(free).toBeGreaterThan(0)
  })
})
