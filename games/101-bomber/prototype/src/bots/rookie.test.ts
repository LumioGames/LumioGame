import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, BOT_TACTICS, lineupFor, PickupKind, type AbilityActivation, type BotProfile, type U64 } from '../contract'
import { BotBrain, type BotPersonality } from './bot-brain'
import { buildBoard } from './board'
import { evaluateBomb, type BombGateInput } from './bomb-gate'
import { BotRng } from './bot-rng'
import { buildDangerMap, isSafe, restsAt } from './danger-map'
import { searchPaths } from './path-search'
import { BlastMisperception } from './perception'
import { busySnapshot, carved, cellIdx, config, finalCircle, makeSnapshot, rules, runMini, setCell, standardMap, type SnapSpec } from './test-fixtures'

/**
 * 原型扩展（NON-CONTRACT，ADR 0043；design §15「Bot 分层」）：菜鸟档（rookie）——会犯真实致命错误的陪练。
 * 数值钉、默认阵容、第三随机流 rng3（看小火力 / 冒险捡糖）、逃生余量 0，以及「既有三档逐位不变」的摘要钉。
 */
const brain = (profile: BotProfile, personality: BotPersonality = 'farmer', self: U64 = 1, seed = 7): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules, profile })

const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length
const casts = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '技能').length

describe('rookie tier numbers (ADR 0043, design §15)', () => {
  it('rookie = react 10–16, think every 3, 30 % noise, 50 % attack skip, no skills, 0 escape margin, 25 % misread, 30 % greedy', () => {
    expect(BOT_PROFILES.rookie).toMatchObject({
      reactMinTicks: 10,
      reactMaxTicks: 16,
      thinkEveryTicks: 3,
      noisePermille: 300,
      attackSkipPermille: 500,
      skillUsePermille: 0,
      escapeMarginTicks: 0,
      misperceivePermille: 250,
      greedyPickupPermille: 300,
      reactMode: 'perBomb',
    })
  })

  it('the fields ADR 0043 does not name are copied from easy', () => {
    const { rookie, easy } = BOT_PROFILES
    for (const k of ['trapPermille', 'maxOwnLiveAttackBombs', 'frenzyBypass', 'blastScalePermille', 'engageScalePermille', 'showdownTradePermille', 'ringEntry'] as const)
      expect(rookie[k]).toBe(easy[k])
  })

  it('no-mobbing knobs: +6 steps, only the nearest 2 bots, 3-cell exception', () => {
    expect(BOT_TACTICS).toMatchObject({ softTargetPenaltySteps: 6, softTargetHunters: 2, softTargetCloseCells: 3 })
  })

  it('default lineup: 15 bots → rookie 7 / normal 6 / hard 2 (rookies first); 7 bots → 3 / 3 / 1', () => {
    const l = lineupFor(15)
    expect(l).toEqual([...Array(7).fill('rookie'), ...Array(6).fill('normal'), ...Array(2).fill('hard')])
    const n = (xs: string[], d: string) => xs.filter((x) => x === d).length
    const l7 = lineupFor(7)
    expect([n(l7, 'rookie'), n(l7, 'normal'), n(l7, 'hard')]).toEqual([3, 3, 1])
  })
})

/** FNV-1a 32。 */
function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const PERSONALITIES: readonly BotPersonality[] = ['farmer', 'hunter', 'collector', 'roamer']

/**
 * 一个档位的决策摘要：4 种人格 × busySnapshot（平时 + 决赛圈摊牌）逐 Tick 输出与旧调试字段 + 一段 4 Bot 迷你对局。
 * 不传 softTargets（旧宿主口径）；新增的调试字段（rng3Draws / misreadBombs）不进摘要。
 */
function tierDigest(profile: BotProfile): string {
  const legacy = (b: BotBrain): string => {
    const d = b.debugState()
    return JSON.stringify([d.mode, d.goal, d.lastDir, d.behaviour, d.huntTarget, d.hiddenBombs, d.showdown, d.rng2Draws, d.lastCast])
  }
  let h = 0x811c9dc5
  PERSONALITIES.forEach((personality, k) => {
    const b = new BotBrain({ self: 2 + k, seed: 1234 + 17 * k, personality, config, rules, profile })
    for (let t = 100; t < 220; t++) {
      h = fnv(JSON.stringify(b.decide(busySnapshot(t))), h)
      h = fnv(legacy(b), h)
    }
    const s = new BotBrain({ self: 3 + k, seed: 99 + k, personality, config, rules, profile })
    for (let t = 400; t < 480; t++) {
      h = fnv(JSON.stringify(s.decide(busySnapshot(t, { finalCircle: finalCircle({ tick: t, ring: 7, next: 5, alive: 4 }) }))), h)
      h = fnv(legacy(s), h)
    }
  })
  let map = standardMap()
  for (const [x, y] of [
    [3, 1],
    [5, 3],
    [7, 7],
    [9, 5],
    [11, 9],
    [13, 13],
    [15, 11],
    [9, 13],
    [1, 7],
    [17, 5],
  ] as const)
    map = setCell(map, x, y, 'b')
  map = setCell(map, 9, 9, 'c')
  const spec: SnapSpec = {
    map,
    tick: 100,
    players: [
      { id: 1, X: 1, Y: 1 },
      { id: 2, X: 17, Y: 1 },
      { id: 3, X: 1, Y: 17 },
      { id: 4, X: 17, Y: 17 },
    ],
    pickups: [
      { id: 300, X: 5, Y: 5, kind: PickupKind.FirePlus },
      { id: 301, X: 13, Y: 5, kind: PickupKind.BombPlus, droppedBy: 3 },
      { id: 302, X: 9, Y: 15, kind: PickupKind.SpeedPlus },
    ],
    king: 4,
  }
  const brains = new Map<U64, BotBrain>([1, 2, 3, 4].map((id, k) => [id, new BotBrain({ self: id, seed: 4242 + id, personality: PERSONALITIES[k], config, rules, profile })]))
  const run = runMini(spec, brains, 400)
  h = fnv(JSON.stringify(run.placed), h)
  for (const id of [1, 2, 3, 4]) h = fnv((run.cells.get(id) ?? []).join(';'), h)
  return h.toString(16).padStart(8, '0')
}

describe('easy / normal / hard / player are bit-identical to before M1-3', () => {
  // 摘要在 M1-3 改动之前（基线 44d0d4c 的 bots 代码）跑出并钉死：新字段、rng3、目标规则、价值表都不得改变旧档的任何输出。
  it.each([
    ['easy', 'ecb790af'],
    ['normal', '56567f35'],
    ['hard', 'c0fcb10a'],
    ['player', '44be9691'],
  ] as const)('%s digest = %s', (id, digest) => {
    expect(tierDigest(BOT_PROFILES[id])).toBe(digest)
  })

  it('they never draw from the third rng and never misread a bomb', () => {
    for (const id of ['easy', 'normal', 'hard', 'player'] as const) {
      for (const personality of PERSONALITIES) {
        const b = brain(BOT_PROFILES[id], personality, 2, 1234)
        for (let t = 100; t < 180; t++) {
          b.decide(busySnapshot(t))
          expect(b.debugState().misreadBombs).toBe(0)
        }
        expect(b.debugState().rng3Draws).toBe(0)
      }
    }
  })
})

describe('rookie determinism', () => {
  it('same seed → same outputs and the same third-rng draws on a busy board; rookie does draw rng3', () => {
    for (const personality of PERSONALITIES) {
      const a = brain(BOT_PROFILES.rookie, personality, 2, 555)
      const b = brain(BOT_PROFILES.rookie, personality, 2, 555)
      for (let t = 100; t < 200; t++) {
        const snap = busySnapshot(t)
        expect(b.decide(snap)).toEqual(a.decide(snap))
        expect(b.debugState()).toEqual(a.debugState())
      }
      expect(a.debugState().rng3Draws).toBeGreaterThan(0)
    }
  })
})

describe('misread blast power (misperceivePermille, rng3)', () => {
  /** 40 颗别人的弹（火力 3）+ 1 颗自己的弹。 */
  const many = (): SnapSpec => {
    const bs: NonNullable<SnapSpec['bombs']> = []
    let id = 20
    for (let y = 1; y < 18; y += 2) for (let x = 3; x < 18; x += 4) if (bs.length < 40) bs.push({ id: id++, X: x, Y: y, owner: 2 + (id % 5), fuseEndTick: 150, power: 3 })
    return { map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1 }], bombs: [...bs, { id: 99, X: 1, Y: 3, owner: 1, fuseEndTick: 150, power: 3 }] }
  }

  it('each enemy bomb is rolled once at first sight (sticky, deterministic), own bombs never; ≈ 25 %', () => {
    let misread = 0
    let total = 0
    for (let seed = 1; seed <= 10; seed++) {
      const rng = new BotRng(seed)
      const m = new BlastMisperception(rng, 250)
      const b1 = buildBoard(makeSnapshot(many()))
      const n = m.observe(b1, 1)
      const enemies = b1.pending.filter((b) => b.owner !== 1)
      expect(rng.draws).toBe(enemies.length)
      expect(b1.pending.find((b) => b.owner === 1)!.power).toBe(3)
      expect(enemies.filter((b) => b.power === 2).length).toBe(n)
      expect(enemies.every((b) => b.power === 2 || b.power === 3)).toBe(true)
      // 下一 Tick 同一批弹：不再掷，结论不变。
      const b2 = buildBoard(makeSnapshot({ ...many(), tick: 101 }))
      expect(m.observe(b2, 1)).toBe(n)
      expect(rng.draws).toBe(enemies.length)
      expect(b2.pending.map((b) => b.power)).toEqual(b1.pending.map((b) => b.power))
      // 同种子另起一个：同结论。
      const again = buildBoard(makeSnapshot(many()))
      new BlastMisperception(new BotRng(seed), 250).observe(again, 1)
      expect(again.pending.map((b) => b.power)).toEqual(b1.pending.map((b) => b.power))
      misread += n
      total += enemies.length
    }
    expect(misread / total).toBeGreaterThan(0.17)
    expect(misread / total).toBeLessThan(0.33)
  })

  it('a misread bomb shrinks only this bot’s danger map: the 3rd cell of the arm looks safe', () => {
    const spec: SnapSpec = { map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 5, Y: 1, owner: 2, fuseEndTick: 140, power: 3 }] }
    const seen = new Set<boolean>()
    for (let seed = 1; seed <= 40; seed++) {
      const board = buildBoard(makeSnapshot(spec))
      const n = new BlastMisperception(new BotRng(seed), 250).observe(board, 1)
      const dm = buildDangerMap(board, 8)
      expect(isSafe(dm, cellIdx(8, 1))).toBe(n === 1)
      expect(isSafe(dm, cellIdx(7, 1))).toBe(false)
      seen.add(n === 1)
    }
    expect(seen).toEqual(new Set([true, false]))
    // 快照本身没被改。
    const snap = makeSnapshot(spec)
    new BlastMisperception(new BotRng(1), 1000).observe(buildBoard(snap), 1)
    expect(snap.Bombs[0].BomberBombState.Power).toBe(3)
  })

  it('power 1 read one smaller = only the bomb cell burns', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 5, Y: 1, owner: 2, fuseEndTick: 140, power: 1 }] }))
    expect(new BlastMisperception(new BotRng(1), 1000).observe(board, 1)).toBe(1)
    const dm = buildDangerMap(board, 8)
    expect(isSafe(dm, cellIdx(5, 1))).toBe(false)
    expect(isSafe(dm, cellIdx(6, 1))).toBe(true)
  })

  it('in the brain: a rookie misreads a fresh enemy bomb on ≈ 25 % of seeds; the same seed always decides the same', () => {
    const spec = (t: number): SnapSpec => ({ map: standardMap(), tick: t, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 9, Y: 9, owner: 2, fuseEndTick: 150 }] })
    let hits = 0
    for (let seed = 1; seed <= 80; seed++) {
      const run = (): number[] => {
        const b = brain(BOT_PROFILES.rookie, 'farmer', 1, seed)
        const out: number[] = []
        for (let t = 100; t < 106; t++) {
          b.decide(makeSnapshot(spec(t)))
          out.push(b.debugState().misreadBombs)
        }
        expect(b.debugState().rng3Draws).toBe(1)
        return out
      }
      const a = run()
      expect(run()).toEqual(a)
      expect(new Set(a).size).toBe(1)
      hits += a[0]
    }
    expect(hits / 80).toBeGreaterThan(0.1)
    expect(hits / 80).toBeLessThan(0.45)
  })
})

describe('escape margin (escapeMarginTicks)', () => {
  it('restsAt: margin 0 rests the tick the fire is out; the default keeps 2 ticks', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1 }], bombs: [{ id: 20, X: 5, Y: 5, owner: 2, fuseEndTick: 120 }] }))
    const dm = buildDangerMap(board, 8)
    const c = cellIdx(6, 5)
    const until = dm.until[c]
    expect(restsAt(dm, c, until, 0)).toBe(true)
    expect(restsAt(dm, c, until)).toBe(false)
    expect(restsAt(dm, c, until + 1)).toBe(false)
    expect(restsAt(dm, c, until + 2)).toBe(true)
  })

  /**
   * (1,1) 放弹（火力 2）：两条逃路都要穿过别人一颗弹（3,3）的十字——(3,1) 或 (1,3)。扫这颗弹的引信：
   * 余量 2 能逃 ⇒ 余量 0 一定能逃；且存在只有余量 0 才「能逃」的引信（菜鸟会在那里放弹）。
   */
  const sweepSpec = (fuse: number): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [{ id: 1, X: 1, Y: 1 }],
    bombs: [{ id: 20, X: 3, Y: 3, owner: 2, fuseEndTick: fuse, power: 2 }],
  })
  const gate = (margin?: number, placeTick = 101): BombGateInput => ({
    X: 1,
    Y: 1,
    power: 2,
    placeTick,
    fuseTicks: 42,
    dangerTicks: 8,
    tpcLand: 1000 * config.tickRateHz / config.speedTierToCellsPerSecond[0],
    tpcWater: 9,
    slowPerCell: 1.5,
    ...(margin !== undefined ? { margin } : {}),
  })
  /** 只有余量 0 才能逃的引信（放弹 Tick = placeTick）。 */
  const onlyZeroAt = (placeTick: number): number[] => {
    const out: number[] = []
    for (let fuse = 102; fuse <= 150; fuse++) {
      const board = buildBoard(makeSnapshot({ ...sweepSpec(fuse), tick: placeTick - 1 }))
      if (evaluateBomb(board, gate(0, placeTick)).ok && !evaluateBomb(board, gate(undefined, placeTick)).ok) out.push(fuse)
    }
    return out
  }
  const onlyZero = onlyZeroAt(101)

  it('bomb gate: margin 2 ok ⇒ margin 0 ok, and some timings pass only with margin 0', () => {
    for (let fuse = 102; fuse <= 150; fuse++) {
      const board = buildBoard(makeSnapshot(sweepSpec(fuse)))
      if (evaluateBomb(board, gate()).ok) expect(evaluateBomb(board, gate(0)).ok).toBe(true)
      expect(evaluateBomb(board, gate(2)).ok).toBe(evaluateBomb(board, gate()).ok)
    }
    expect(onlyZero.length).toBeGreaterThan(0)
  })

  it('path search: a zero-margin field reaches everything the default field reaches', () => {
    for (const fuse of [110, 115, 120, 125]) {
      const board = buildBoard(makeSnapshot(sweepSpec(fuse)))
      const dm = buildDangerMap(board, 8)
      const o = { tpcLand: 6, tpcWater: 9, allowWater: false }
      const two = searchPaths(board, dm, cellIdx(1, 1), 101, o)
      const zero = searchPaths(board, dm, cellIdx(1, 1), 101, { ...o, margin: 0 })
      for (const c of two.reached) expect(zero.steps[c]).toBeGreaterThanOrEqual(0)
      expect(zero.reached.length).toBeGreaterThanOrEqual(two.reached.length)
    }
  })

  it('in the brain: the same bot bombs an enemy at a margin-only timing with escapeMarginTicks 0, not with 2', () => {
    // 放弹要先停稳一拍（第一次决策只记意图）：取在 Tick 100、101 两次决策时都「只有余量 0 能逃」的引信。
    const next = new Set(onlyZeroAt(102))
    const fuse = onlyZero.find((f) => next.has(f))
    expect(fuse).toBeDefined()
    const spec = (t: number): SnapSpec => ({
      ...sweepSpec(fuse!),
      tick: t,
      players: [
        { id: 1, X: 1, Y: 1 },
        { id: 3, X: 1, Y: 3 },
      ],
      finalCircle: finalCircle({ tick: 100, alive: 2 }),
    })
    // hard 的狂热直通：十字罩住对手就放（只看自检）；没有技能，自检不过就不放。
    const placed = (margin: number): number => {
      const b = brain({ ...BOT_PROFILES.hard, escapeMarginTicks: margin, noisePermille: 0 }, 'hunter', 1, 3)
      return bombs(b.decide(makeSnapshot(spec(100)))) + bombs(b.decide(makeSnapshot(spec(101))))
    }
    expect(placed(0)).toBe(1)
    expect(placed(2)).toBe(0)
  })
})

describe('greedy pickups (greedyPickupPermille, rng3)', () => {
  // 糖在 (5,1)，别人的弹 (5,3) 火力 2 会在 140 烧到它：常规拾取（永不着火）与抢掉落（只看死者掉落）都不去。
  const spec = (t: number): SnapSpec => ({
    map: standardMap(),
    tick: t,
    players: [{ id: 1, X: 1, Y: 1 }],
    bombs: [{ id: 20, X: 5, Y: 3, owner: 2, fuseEndTick: 140 }],
    pickups: [{ id: 40, X: 5, Y: 1, kind: PickupKind.FirePlus }],
  })
  // 去掉反应延迟与噪声，只看贪糖这一个旋钮。
  const knob = (greedy: number): BotProfile => ({ ...BOT_PROFILES.rookie, reactMode: 'ownCell', noisePermille: 0, misperceivePermille: 0, greedyPickupPermille: greedy })
  const goesFor = (profile: BotProfile, seed: number): { goes: boolean; draws: number } => {
    const b = brain(profile, 'farmer', 1, seed)
    let goes = false
    // 快照不动人：原地发方向 4 Tick 就算卡住（STUCK_TICKS），只看这之前。
    for (let t = 100; t < 104; t++) {
      b.decide(makeSnapshot(spec(t)))
      const st = b.debugState()
      if (t === 100) goes = st.mode === 'pickup' && st.goal?.X === 5 && st.goal?.Y === 1
      // 每颗糖只掷一次：结论整段不变。
      else expect(st.mode === 'pickup' && st.goal?.X === 5 && st.goal?.Y === 1).toBe(goes)
    }
    return { goes, draws: b.debugState().rng3Draws }
  }

  it('≈ 30 % of seeds take the risk; each candy is rolled once; deterministic', () => {
    let n = 0
    for (let seed = 1; seed <= 80; seed++) {
      const r = goesFor(knob(300), seed)
      expect(r.draws).toBe(1)
      expect(goesFor(knob(300), seed)).toEqual(r)
      if (r.goes) n++
    }
    expect(n / 80).toBeGreaterThan(0.15)
    expect(n / 80).toBeLessThan(0.45)
  })

  it('0 ‰ never goes and never draws; 1000 ‰ always goes; the candy must still be reachable before the fire (greedyFireSlackTicks)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(goesFor(knob(0), seed)).toEqual({ goes: false, draws: 0 })
      expect(goesFor(knob(1000), seed).goes).toBe(true)
    }
    // 火 130 就到：走 4 格（约 126 才到）留不出 greedyFireSlackTicks，1000 ‰ 也不去。
    const b = brain(knob(1000), 'farmer', 1, 1)
    b.decide(makeSnapshot({ ...spec(100), bombs: [{ id: 20, X: 5, Y: 3, owner: 2, fuseEndTick: 130 }] }))
    expect(b.debugState().goal).not.toEqual({ X: 5, Y: 1 })
  })

  it('a strict (always safe) candy is taken without any roll', () => {
    const b = brain(knob(300), 'farmer', 1, 1)
    b.decide(makeSnapshot({ ...spec(100), bombs: [] }))
    expect(b.debugState()).toMatchObject({ mode: 'pickup', goal: { X: 5, Y: 1 }, rng3Draws: 0 })
  })
})

describe('rookie uses no skills (skillUsePermille 0)', () => {
  // 同 skills.test.ts「duck: bubble」：死胡同里火要到了，hard 会开泡泡。去掉反应延迟只看技能旋钮。
  const boxed = (t: number): SnapSpec => ({
    map: carved([
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
    tick: t,
    players: [{ id: 1, X: 1, Y: 1, skills: { active: ['bubble', 1] } }],
    bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 108 }],
  })
  const knob = (skillUse: number): BotProfile => ({
    ...BOT_PROFILES.rookie,
    reactMode: 'ownCell',
    reactMinTicks: 0,
    reactMaxTicks: 0,
    misperceivePermille: 0,
    skillUsePermille: skillUse,
  })

  it('never presses 技能 (and does not burn rng2 on it); the same bot with skillUse 1000 does', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = brain(knob(0), 'farmer', 1, seed)
      const out: AbilityActivation[][] = []
      for (let t = 100; t < 108; t++) out.push(r.decide(makeSnapshot(boxed(t))))
      expect(out.every((o) => casts(o) === 0)).toBe(true)
      expect(r.debugState().rng2Draws).toBe(0)
      const h = brain(knob(1000), 'farmer', 1, seed)
      let cast = 0
      for (let t = 100; t < 108; t++) cast += casts(h.decide(makeSnapshot(boxed(t))))
      expect(cast).toBeGreaterThan(0)
    }
  })
})
