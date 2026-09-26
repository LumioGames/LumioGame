import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, BOT_TACTICS, type AbilityActivation, type BotProfile, type BotTactics, type U64 } from '../contract'
import { BotBrain, type BotPersonality } from './bot-brain'
import { buildBoard } from './board'
import { buildDangerMap } from './danger-map'
import { hitPoints, isShowdown, lateEntryHorizon, poisonRate } from './showdown'
import { cellIdx, config, finalCircle, makeSnapshot, rules, runMini, standardMap, type PlayerSpec, type SnapSpec } from './test-fixtures'

/** 原型扩展（NON-CONTRACT，ADR 0031）：决赛圈摊牌期（5×5 起）——晚进圈、以血换血、先打最弱、按段毒伤。 */
const brain = (personality: BotPersonality = 'hunter', self: U64 = 1, seed = 1, profile?: BotProfile, tactics?: BotTactics): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules, ...(profile ? { profile } : {}), ...(tactics ? { tactics } : {}) })

const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length
const casts = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '技能').length

describe('showdown helpers', () => {
  // 圈边长都是奇数：showdownRingSide 这一段起算摊牌，再大一段（+2）不算。
  const SIDE = BOT_TACTICS.showdownRingSide

  it('isShowdown: only once the current ring side is ≤ showdownRingSide', () => {
    expect(isShowdown(null, BOT_TACTICS)).toBe(false)
    expect(isShowdown(finalCircle({ ring: SIDE + 2 }), BOT_TACTICS)).toBe(false)
    expect(isShowdown(finalCircle({ ring: SIDE }), BOT_TACTICS)).toBe(true)
    expect(isShowdown(finalCircle({ ring: 5 }), { ...BOT_TACTICS, showdownRingSide: 5 })).toBe(true)
    expect(isShowdown(finalCircle({ ring: 7 }), { ...BOT_TACTICS, showdownRingSide: 5 })).toBe(false)
    expect(isShowdown(finalCircle({ ring: 1 }), BOT_TACTICS)).toBe(true)
    expect(isShowdown(finalCircle({}), BOT_TACTICS)).toBe(false)
  })

  it('poisonRate reads the stage table and looks ahead to the announced stage', () => {
    const at = (stageIndex: number, next: boolean) => ({ ...finalCircle({ ring: 9, next: next ? 7 : undefined }), stageIndex })
    expect(poisonRate(rules, null)).toBe(rules.poisonPointsPerInterval)
    expect(poisonRate(rules, at(0, false))).toBe(1)
    expect(poisonRate(rules, at(2, false))).toBe(1)
    expect(poisonRate(rules, at(2, true))).toBe(2)
    expect(poisonRate(rules, at(3, false))).toBe(2)
    expect(poisonRate(rules, at(5, false))).toBe(2)
  })

  it('lateEntryHorizon: now + lateEntryTicks in the showdown with a next ring, otherwise null', () => {
    expect(lateEntryHorizon(finalCircle({ ring: 3, next: 1 }), BOT_TACTICS, 500)).toBe(500 + BOT_TACTICS.lateEntryTicks)
    expect(lateEntryHorizon(finalCircle({ ring: 3 }), BOT_TACTICS, 500)).toBeNull()
    expect(lateEntryHorizon(finalCircle({ ring: SIDE + 2, next: SIDE }), BOT_TACTICS, 500)).toBeNull()
  })

  it('hitPoints counts every bomb whose cover holds the cell', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), players: [], bombs: [{ id: 1, X: 9, Y: 9, owner: 2, fuseEndTick: 140 }] }))
    const dm = buildDangerMap(board, 8, { X: 9, Y: 9, power: 2, fuseEndTick: 150 })
    expect(hitPoints(dm, cellIdx(9, 9), config, rules)).toBe(4)
    expect(hitPoints(dm, cellIdx(9, 10), config, rules)).toBe(4)
    expect(hitPoints(dm, cellIdx(9, 12), config, rules)).toBe(0)
  })
})

describe('late entry', () => {
  // 3×3 圈（中心 (9,9)，四角是铁皮柱 → 十字形 5 格）；我方在臂上。
  const spec = (nextIn: number): SnapSpec => ({
    map: standardMap(),
    tick: 300,
    players: [{ id: 1, X: 8, Y: 9 }],
    finalCircle: finalCircle({ tick: 300, ring: 3, next: 1, nextTick: 300 + nextIn }),
  })
  const goals = (b: BotBrain, s: SnapSpec): string[] => {
    const out: string[] = []
    const wrap = {
      decide: (snap: Parameters<BotBrain['decide']>[0]) => {
        const o = b.decide(snap)
        const g = b.debugState().goal
        if (g) out.push(`${g.X},${g.Y}`)
        return o
      },
    }
    runMini(s, new Map([[1, wrap]]), 40)
    return out
  }

  it('with the 1×1 far off a hunter fights from the arm: bombs the enemy on the opposite arm, escape via a side arm', () => {
    const b = brain('hunter')
    let placed = false
    for (let t = 300; t < 306 && !placed; t++)
      placed =
        bombs(
          b.decide(
            makeSnapshot({
              map: standardMap(),
              tick: t,
              players: [
                { id: 1, X: 8, Y: 9 },
                { id: 2, X: 10, Y: 9 },
              ],
              finalCircle: finalCircle({ tick: t, ring: 3, next: 1, nextTick: 700, alive: 2 }),
            }),
          ),
        ) > 0
    expect(placed).toBe(true)
  })

  it('within lateEntryTicks of the shrink it aims at the centre', () => {
    const g = goals(brain('roamer'), spec(BOT_TACTICS.lateEntryTicks - 5))
    expect(g.length).toBeGreaterThan(0)
    expect(g.every((x) => x === '9,9')).toBe(true)
  })
})

describe('trades on the 1×1 pile', () => {
  const pile = (meHp: number, enemyHp: number, me: Partial<PlayerSpec> = {}, enemy: Partial<PlayerSpec> = {}) => (t: number): SnapSpec => ({
    map: standardMap(),
    tick: t,
    players: [
      { id: 1, X: 9, Y: 9, hp: meHp, ...me },
      { id: 2, X: 9, Y: 9, hp: enemyHp, ...enemy },
    ],
    finalCircle: finalCircle({ tick: t, ring: 1, alive: 2 }),
  })
  const placed = (spec: (t: number) => SnapSpec, profile?: BotProfile, r = rules): boolean => {
    const b = new BotBrain({ self: 1, seed: 1, personality: 'hunter', config, rules: r, ...(profile ? { profile } : {}) })
    for (let t = 300; t < 306; t++) if (bombs(b.decide(makeSnapshot(spec(t)))) > 0) return true
    return false
  }

  it('6 vs 4 → trades (strictly ahead afterwards)', () => {
    expect(placed(pile(6, 4))).toBe(true)
    expect(placed(pile(6, 4), BOT_PROFILES.normal)).toBe(true)
  })
  it('4 vs 6 and 6 vs 6 → never', () => {
    expect(placed(pile(4, 6))).toBe(false)
    expect(placed(pile(6, 6))).toBe(false)
  })
  it('3 vs 1 → lethal trade; 2 vs 1 → never (it would die too)', () => {
    expect(placed(pile(3, 1))).toBe(true)
    expect(placed(pile(2, 1))).toBe(false)
  })
  it('an enemy with a bubble ready is not a victim', () => {
    expect(placed(pile(6, 4, {}, { skills: { active: ['bubble', 1] } }))).toBe(false)
  })
  it('a freeze bomb only trades when freeze bombs deal damage', () => {
    const freezer = { skills: { bomb: ['freezeBomb', 1] as ['freezeBomb', number] } }
    expect(placed(pile(6, 4, freezer))).toBe(true)
    expect(placed(pile(6, 4, freezer), undefined, { ...rules, freezeBombDamages: false })).toBe(false)
  })
  it('a duck shield-trades even at equal HP: bomb, then bubble, costing itself nothing', () => {
    const b = brain('hunter')
    const spec = (t: number, bomb: boolean): SnapSpec => ({
      ...pile(4, 4, { skills: { active: ['bubble', 1] } })(t),
      bombs: bomb ? [{ id: 40, X: 9, Y: 9, owner: 1, fuseEndTick: t + 40 }] : [],
    })
    let pressed = -1
    for (let t = 300; t < 306 && pressed < 0; t++) if (bombs(b.decide(makeSnapshot(spec(t, false)))) > 0) pressed = t
    expect(pressed).toBeGreaterThan(0)
    // 泡泡能扛住自己的弹：普通进攻（狂热直通）或换血都行，关键是弹出来后第一 Tick 开泡泡。
    expect(['bomb', 'trade']).toContain(b.debugState().mode)
    expect(casts(b.decide(makeSnapshot(spec(pressed + 1, true))))).toBe(1)
  })
})

describe('trades in the 3×3', () => {
  it('from the centre against an enemy trapped on an arm (poison behind it)', () => {
    const b = brain('hunter')
    let done = false
    for (let t = 300; t < 306 && !done; t++) {
      done =
        bombs(
          b.decide(
            makeSnapshot({
              map: standardMap(),
              tick: t,
              players: [
                { id: 1, X: 9, Y: 9, hp: 6 },
                { id: 2, X: 10, Y: 9, hp: 4 },
              ],
              finalCircle: finalCircle({ tick: t, ring: 3, alive: 2 }),
            }),
          ),
        ) > 0
    }
    expect(done).toBe(true)
  })
})

describe('targets', () => {
  it('in the showdown the hunt target is the weakest enemy, not the hat king', () => {
    const b = brain('hunter')
    const spec = (t: number): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: 9, Y: 9 },
        { id: 2, X: 7, Y: 7, hats: 6, hp: 6 },
        { id: 3, X: 11, Y: 11, hp: 2 },
      ],
      king: 2,
      finalCircle: finalCircle({ tick: t, ring: 5, alive: 3 }),
    })
    for (let t = 300; t < 304; t++) b.decide(makeSnapshot(spec(t)))
    expect(b.debugState().showdown).toBe(true)
    expect(b.debugState().behaviour).toBe('hunt')
    expect(b.debugState().huntTarget).toBe(3)
  })
})
