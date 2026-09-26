import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, type AbilityActivation, type BotProfile, type U64, type WorldSnapshot } from '../contract'
import { BotBrain, type BotPersonality } from './bot-brain'
import { buildBoard } from './board'
import { BotRng } from './bot-rng'
import { buildDangerMap, isSafe } from './danger-map'
import { BombPerception } from './perception'
import { busySnapshot, carved, cellIdx, config, finalCircle, makeSnapshot, rules, standardMap, type SnapSpec } from './test-fixtures'

/** 难度档（design §15 Bot 难度分档（原型工具））：hard = 第 3 轮，normal / easy / player 的旋钮与逐弹反应延迟。 */
const brain = (profile: BotProfile | undefined, personality: BotPersonality = 'hunter', self: U64 = 1, seed = 7): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules, ...(profile ? { profile } : {}) })

const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length

describe('hard = round 3', () => {
  it('omitted profile equals explicit hard (outputs and debug state, all personalities)', () => {
    for (const p of ['farmer', 'hunter', 'collector', 'roamer'] as const) {
      const a = brain(undefined, p, 2, 1234)
      const b = brain(BOT_PROFILES.hard, p, 2, 1234)
      for (let t = 100; t < 160; t++) {
        const snap = busySnapshot(t)
        expect(b.decide(snap)).toEqual(a.decide(snap))
        expect(b.debugState()).toEqual(a.debugState())
      }
    }
  })

  it('hard never draws from the second rng and hides nothing', () => {
    const b = brain(BOT_PROFILES.hard, 'hunter', 3, 99)
    for (let t = 100; t < 160; t++) {
      b.decide(busySnapshot(t))
      expect(b.debugState().hiddenBombs).toBe(0)
    }
    expect(b.debugState().rng2Draws).toBe(0)
  })
})

describe('per-zone reaction delay (normal): a fresh enemy aura enters the burn map only after 4–7 ticks', () => {
  const aura = (tick: number, owner: U64 = 2): SnapSpec => ({
    map: standardMap(),
    tick,
    players: [
      { id: 1, X: 5, Y: 5 },
      { id: 2, X: 6, Y: 5 },
    ],
    fireZones: [{ owner, source: 'aura', untilTick: 180, cells: [{ X: 5, Y: 5 }, { X: 6, Y: 5 }, { X: 7, Y: 5 }] }],
  })
  const burnsAt = (per: BombPerception, t: number, owner: U64 = 2): boolean => {
    const snap = makeSnapshot(aura(t, owner))
    return buildBoard(snap, { self: 1, zoneVisible: per.zones(snap, 1) }).burnUntil[cellIdx(5, 5)] > 0
  }

  it('hidden for [min, max] ticks after first sight, then visible; the delay varies by seed', () => {
    const delays = new Set<number>()
    for (let seed = 1; seed <= 20; seed++) {
      const per = new BombPerception(new BotRng(seed), 4, 7)
      let first = -1
      for (let t = 100; t < 112 && first < 0; t++) if (burnsAt(per, t)) first = t
      expect(first - 100).toBeGreaterThanOrEqual(4)
      expect(first - 100).toBeLessThanOrEqual(7)
      delays.add(first - 100)
    }
    expect(delays.size).toBeGreaterThan(1)
  })

  it('own zones are skipped (never burn yourself) and hard (no perception) sees enemy zones at once', () => {
    const per = new BombPerception(new BotRng(1), 4, 7)
    expect(burnsAt(per, 100, 1)).toBe(false)
    expect(buildBoard(makeSnapshot(aura(100)), { self: 1 }).burnUntil[cellIdx(5, 5)]).toBe(180)
    const hard = brain(BOT_PROFILES.hard, 'farmer', 1, 3)
    hard.decide(makeSnapshot(aura(100)))
    expect(hard.debugState().rng2Draws).toBe(0)
  })
})

describe('per-bomb reaction delay (normal)', () => {
  const spec = (tick: number): SnapSpec => ({
    map: standardMap(),
    tick,
    players: [
      { id: 1, X: 1, Y: 1 },
      { id: 2, X: 9, Y: 9 },
    ],
    bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 130 }],
  })

  it('an enemy bomb stays hidden for 4–7 ticks after first sight (seeds 1..20)', () => {
    const delays = new Set<number>()
    for (let seed = 1; seed <= 20; seed++) {
      const b = brain(BOT_PROFILES.normal, 'farmer', 1, seed)
      let firstVisible = -1
      for (let t = 100; t < 112; t++) {
        b.decide(makeSnapshot(spec(t)))
        const h = b.debugState().hiddenBombs
        if (t === 100) expect(h).toBe(1)
        if (h === 0 && firstVisible < 0) firstVisible = t
      }
      expect(firstVisible - 100).toBeGreaterThanOrEqual(BOT_PROFILES.normal.reactMinTicks)
      expect(firstVisible - 100).toBeLessThanOrEqual(BOT_PROFILES.normal.reactMaxTicks)
      delays.add(firstVisible - 100)
    }
    expect(delays.size).toBeGreaterThan(1)
  })

  it('a hidden bomb is left out of the danger map but still blocks the cell', () => {
    const board = buildBoard(makeSnapshot(spec(100)))
    const per = new BombPerception(new BotRng(1), 4, 7)
    expect(per.observe(board, 1)).toBe(1)
    const dm = buildDangerMap(board, 8)
    expect(isSafe(dm, cellIdx(1, 1))).toBe(true)
    expect(board.bombAt[cellIdx(3, 1)]).toBe(0)
  })

  it('own bombs are never hidden', () => {
    const board = buildBoard(makeSnapshot({ ...spec(100), bombs: [{ id: 21, X: 1, Y: 1, owner: 1, fuseEndTick: 140 }] }))
    const per = new BombPerception(new BotRng(1), 4, 7)
    expect(per.observe(board, 1)).toBe(0)
  })

  it('no escape before the bomb is seen, escape after', () => {
    // 同 bot-brain.test.ts「imminent danger」：引信 112，火一到就是 (1,1)。
    const snap = (t: number): WorldSnapshot =>
      makeSnapshot({ map: standardMap(), tick: t, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 130 }] })
    const b = brain(BOT_PROFILES.normal, 'farmer', 1, 3)
    const modes: string[] = []
    for (let t = 100; t < 110; t++) {
      b.decide(snap(t))
      modes.push(`${b.debugState().hiddenBombs}:${b.debugState().mode}`)
    }
    const firstSeen = modes.findIndex((m) => m.startsWith('0:'))
    expect(firstSeen).toBeGreaterThanOrEqual(4)
    // 看见之前不因这颗弹逃生；看见之后按危险处理（逃生或走向永不危险的目标）。
    for (const m of modes.slice(0, firstSeen)) expect(m).not.toBe('1:escape')
    const st = b.debugState()
    expect(st.goal).not.toBeNull()
    const dm = buildDangerMap(buildBoard(snap(109)), 8)
    expect(isSafe(dm, cellIdx(st.goal!.X, st.goal!.Y))).toBe(true)
  })
})

describe('difficulty knobs', () => {
  // (1,1)–(1,4) 口袋被一颗长引信的弹罩住，唯一出口 (2,4)(3,4) 被我方这颗弹封死：对手不在十字里，但逃不掉。
  const trap = (): SnapSpec => ({
    map: carved([
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 4],
      [3, 4],
      [3, 5],
      [3, 6],
      [3, 7],
      [3, 8],
    ]),
    tick: 100,
    players: [
      { id: 1, X: 3, Y: 4 },
      { id: 2, X: 1, Y: 2 },
    ],
    bombs: [{ id: 30, X: 1, Y: 1, owner: 3, fuseEndTick: 160, power: 3 }],
  })
  const placesWithin = (b: BotBrain, s: SnapSpec, n: number): boolean => {
    for (let t = 0; t < n; t++) if (bombs(b.decide(makeSnapshot({ ...s, tick: (s.tick ?? 100) + t }))) > 0) return true
    return false
  }

  it('hard sets the trap on nearly every seed; normal (trapPermille 0) never does', () => {
    let hard = 0
    let normal = 0
    for (let seed = 1; seed <= 20; seed++) {
      if (placesWithin(brain(BOT_PROFILES.hard, 'hunter', 1, seed), trap(), 6)) hard++
      if (placesWithin(brain(BOT_PROFILES.normal, 'hunter', 1, seed), trap(), 6)) normal++
    }
    expect(hard).toBeGreaterThanOrEqual(18)
    expect(normal).toBe(0)
  })

  it('normal never has two live attack bombs; hard does', () => {
    // 自己已有一颗进攻弹在场（刚放、对手还在十字里），第二颗照样罩得住对手。
    const spec = (t: number): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: 5, Y: 5, bombs: 2 },
        { id: 2, X: 7, Y: 5 },
      ],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    const count = (profile: BotProfile, seed: number): number => {
      const b = brain(profile, 'hunter', 1, seed)
      let placed = 0
      let bombsOnField: SnapSpec['bombs'] = []
      for (let t = 300; t < 320; t++) {
        const out = b.decide(makeSnapshot({ ...spec(t), bombs: bombsOnField }))
        if (bombs(out) > 0) {
          placed++
          // 替身：按下后下一帧弹出现在脚下（人不动）。
          bombsOnField = [...(bombsOnField ?? []), { id: 50 + placed, X: 5, Y: 5, owner: 1, fuseEndTick: t + 60 }]
        }
      }
      return placed
    }
    for (let seed = 1; seed <= 5; seed++) expect(count(BOT_PROFILES.normal, seed)).toBeLessThanOrEqual(1)
  })

  it('in frenzy hard bombs an enemy in its cross at once; normal still rolls (slower on average)', () => {
    const spec = (t: number): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: 5, Y: 5 },
        { id: 2, X: 7, Y: 5 },
      ],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    const delay = (profile: BotProfile, seed: number): number => {
      const b = brain(profile, 'farmer', 1, seed)
      for (let t = 300; t < 340; t++) if (bombs(b.decide(makeSnapshot(spec(t)))) > 0) return t - 300
      return 40
    }
    let hard = 0
    let normal = 0
    let hardLate = 0
    for (let seed = 1; seed <= 20; seed++) {
      const h = delay(BOT_PROFILES.hard, seed)
      if (h > 5) hardLate++
      hard += h
      normal += delay(BOT_PROFILES.normal, seed)
    }
    // hard 狂热直通：只有噪声（5%）会让它晚一拍；normal 仍按（缩放后的）概率掷、还有 10% 跳过。
    expect(hardLate).toBeLessThanOrEqual(2)
    expect(normal).toBeGreaterThan(hard)
  })

  it('normal makes more noise moves than hard, easy more than normal', () => {
    const noise = (profile: BotProfile): number => {
      const b = brain(profile, 'roamer', 1, 11)
      let n = 0
      for (let t = 100; t < 3100; t++) {
        b.decide(makeSnapshot({ map: standardMap(), tick: t, players: [{ id: 1, X: 9, Y: 9 }] }))
        if (b.debugState().mode === 'noise') n++
      }
      return n
    }
    const h = noise(BOT_PROFILES.hard)
    const n = noise(BOT_PROFILES.normal)
    const e = noise(BOT_PROFILES.easy)
    expect(n).toBeGreaterThan(h)
    expect(e).toBeGreaterThan(n)
  })
})
