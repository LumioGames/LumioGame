import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, PickupKind, 方向, type AbilityActivation, type BotProfile, type SkillId, type U64 } from '../contract'
import { cellIndexOf, enemyCanEscape, type ThinkContext } from './behaviors'
import { BotBrain, type BotPersonality } from './bot-brain'
import { buildBoard } from './board'
import { buildDangerMap } from './danger-map'
import { busySnapshot, carved, config, finalCircle, makeSnapshot, rules, setCell, standardMap, type PlayerSpec, type SnapSpec } from './test-fixtures'

/** 原型扩展（NON-CONTRACT，ADR 0030）：Bot 用技能（只读快照）。缺省 hard 档（skillUse 1000，不掷）。 */
const brain = (personality: BotPersonality = 'hunter', self: U64 = 1, seed = 1, profile?: BotProfile): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules, ...(profile ? { profile } : {}) })

const moveOf = (out: AbilityActivation[]): 方向 => {
  const m = out.find((a) => a.ability === '移动')
  if (!m || m.ability !== '移动') throw new Error('no move')
  return m.输入.方向
}
const casts = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '技能').length
const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length

/** 同一局面推进若干 Tick，返回每 Tick 的输出。 */
function drive(b: BotBrain, spec: (t: number) => SnapSpec, from: number, n: number): AbilityActivation[][] {
  const out: AbilityActivation[][] = []
  for (let t = from; t < from + n; t++) out.push(b.decide(makeSnapshot(spec(t))))
  return out
}

describe('duck: bubble', () => {
  // 死胡同 (1,1)(2,1)(3,1)：别人的弹在 (3,1)，整条都在十字里、无路可逃。
  const boxed = (duck: PlayerSpec['skills'] | undefined, map = carved([[1, 1], [2, 1], [3, 1]])) => (t: number): SnapSpec => ({
    map,
    tick: t,
    players: [{ id: 1, X: 1, Y: 1, ...(duck ? { skills: duck } : {}) }],
    bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 108 }],
  })

  it('bubbles when boxed in and the fire is about to arrive', () => {
    const out = drive(brain('farmer'), boxed({ active: ['bubble', 1] }), 100, 8)
    expect(out.some((o) => casts(o) === 1)).toBe(true)
  })

  it('does not bubble while on cooldown', () => {
    const out = drive(brain('farmer'), boxed({ active: ['bubble', 1], cdUntilTick: 500 }), 100, 8)
    expect(out.every((o) => casts(o) === 0)).toBe(true)
  })

  it('does not bubble when a walking escape exists', () => {
    const out = drive(brain('farmer'), boxed({ active: ['bubble', 1] }, standardMap()), 100, 8)
    expect(out.every((o) => casts(o) === 0)).toBe(true)
  })

  it('bomb, then bubble: presses the bomb in a dead end with an enemy in the cross, then 技能 once its bomb appears', () => {
    const map = carved([[1, 1], [2, 1], [3, 1]])
    const b = brain('hunter')
    const spec = (t: number, bomb: boolean): SnapSpec => ({
      map,
      tick: t,
      players: [
        { id: 1, X: 1, Y: 1, skills: { active: ['bubble', 1] } },
        { id: 2, X: 3, Y: 1 },
      ],
      bombs: bomb ? [{ id: 30, X: 1, Y: 1, owner: 1, fuseEndTick: t + 40 }] : [],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    let pressed = -1
    for (let t = 100; t < 106 && pressed < 0; t++) if (bombs(b.decide(makeSnapshot(spec(t, false)))) > 0) pressed = t
    expect(pressed).toBeGreaterThan(0)
    const out = b.decide(makeSnapshot(spec(pressed + 1, true)))
    expect(casts(out)).toBe(1)
    expect(b.debugState().lastCast).toBe('bubble')
  })

  it('never presses a bomb while bubbled', () => {
    const spec = (t: number): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: 5, Y: 5, skills: { active: ['bubble', 1], bubbleUntilTick: 400, cdUntilTick: 500 } },
        { id: 2, X: 7, Y: 5 },
      ],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    expect(drive(brain('hunter'), spec, 300, 10).every((o) => bombs(o) === 0)).toBe(true)
  })
})

describe('cat: blink', () => {
  it('blinks over a brick out of a dead-end cross (iron everywhere else)', () => {
    // (2,1) 是别人的弹（挡路），(3,1) 积木挡住右臂；闪现越过弹和积木落到 (4,1)。
    const map = carved([[1, 1], [2, 1], [4, 1], [5, 1]], [[3, 1, 'b']])
    const spec = (t: number): SnapSpec => ({
      map,
      tick: t,
      players: [{ id: 1, X: 1, Y: 1, skills: { active: ['blink', 1] } }],
      bombs: [{ id: 20, X: 2, Y: 1, owner: 2, fuseEndTick: 108, power: 3 }],
    })
    const out = drive(brain('farmer'), spec, 100, 8).find((o) => casts(o) === 1)
    expect(out).toBeDefined()
    expect(moveOf(out!)).toBe(方向.右)
  })

  it('sends 停 with the blink when the snapshot facing already points that way', () => {
    const map = carved([[1, 1], [2, 1], [4, 1], [5, 1]], [[3, 1, 'b']])
    const spec = (t: number): SnapSpec => ({
      map,
      tick: t,
      players: [{ id: 1, X: 1, Y: 1, skills: { active: ['blink', 1], facing: 方向.右 } }],
      bombs: [{ id: 20, X: 2, Y: 1, owner: 2, fuseEndTick: 108, power: 3 }],
    })
    const out = drive(brain('farmer'), spec, 100, 8).find((o) => casts(o) === 1)
    expect(out && moveOf(out)).toBe(方向.停)
  })

  it('bomb, then blink: places in a dead end and blinks over the brick once the bomb appears', () => {
    const map = carved([[1, 1], [2, 1], [4, 1], [5, 1]], [[3, 1, 'b']])
    const b = brain('hunter')
    const spec = (t: number, bomb: boolean): SnapSpec => ({
      map,
      tick: t,
      players: [
        { id: 1, X: 2, Y: 1, skills: { active: ['blink', 1] } },
        { id: 2, X: 1, Y: 1 },
      ],
      bombs: bomb ? [{ id: 30, X: 2, Y: 1, owner: 1, fuseEndTick: t + 40 }] : [],
      finalCircle: finalCircle({ tick: t, alive: 2 }),
    })
    let pressed = -1
    for (let t = 100; t < 106 && pressed < 0; t++) if (bombs(b.decide(makeSnapshot(spec(t, false)))) > 0) pressed = t
    expect(pressed).toBeGreaterThan(0)
    const out = b.decide(makeSnapshot(spec(pressed + 1, true)))
    expect(casts(out)).toBe(1)
    expect(moveOf(out)).toBe(方向.右)
  })

  it('chase-blinks onto an attack cell that is a long walk away', () => {
    // (2,1) 积木：走到 (4,1) 要绕 7 步；闪现直接落 (4,1)，十字罩住 (6,1) 的对手。
    const map = setCell(standardMap(), 2, 1, 'b')
    let chased = 0
    for (let seed = 1; seed <= 5; seed++) {
      const b = brain('hunter', 1, seed)
      const spec = (t: number): SnapSpec => ({
        map,
        tick: t,
        players: [
          { id: 1, X: 1, Y: 1, skills: { active: ['blink', 1] } },
          { id: 2, X: 6, Y: 1 },
        ],
        finalCircle: finalCircle({ tick: t, alive: 2 }),
      })
      const out = drive(b, spec, 300, 6)
      if (out.some((o) => casts(o) === 1 && moveOf(o) === 方向.右)) chased++
    }
    expect(chased).toBeGreaterThanOrEqual(3)
  })
})

describe('bear: fire aura', () => {
  const spec = (enemy: PlayerSpec, bear: PlayerSpec['skills'] = { active: ['fireAura', 1] }) => (t: number): SnapSpec => ({
    map: standardMap(),
    tick: t,
    players: [{ id: 1, X: 5, Y: 5, skills: bear }, enemy],
  })

  it('casts when an enemy is adjacent', () => {
    expect(drive(brain('farmer'), spec({ id: 2, X: 6, Y: 5 }), 100, 4).some((o) => casts(o) === 1)).toBe(true)
  })

  it('does not cast at an enemy 3 cells away outside the showdown, nor at a bubbled neighbour', () => {
    expect(drive(brain('farmer'), spec({ id: 2, X: 8, Y: 5 }), 100, 6).every((o) => casts(o) === 0)).toBe(true)
    expect(drive(brain('farmer'), spec({ id: 2, X: 6, Y: 5, skills: { bubbleUntilTick: 300 } }), 100, 6).every((o) => casts(o) === 0)).toBe(true)
  })

  it('while the aura burns, its goal sits next to the target', () => {
    const b = brain('hunter')
    b.decide(makeSnapshot(spec({ id: 2, X: 9, Y: 5 }, { active: ['fireAura', 1], auraUntilTick: 300, cdUntilTick: 600 })(100)))
    const g = b.debugState().goal
    expect(g).not.toBeNull()
    expect(Math.max(Math.abs(g!.X - 9), Math.abs(g!.Y - 5))).toBeLessThanOrEqual(1)
  })
})

describe('burn zones', () => {
  const zone = (owner: U64, X: number, Y: number, source: 'aura' | 'firewall' = 'aura') => ({ owner, source, cells: [{ X, Y }], untilTick: 400 })

  it("an enemy's aura keeps the bot's goal out of the padded zone", () => {
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 100,
      players: [
        { id: 1, X: 3, Y: 5 },
        { id: 2, X: 7, Y: 5 },
      ],
      pickups: [{ id: 40, X: 6, Y: 5, kind: PickupKind.FirePlus }],
    }
    const free = brain('farmer')
    free.decide(makeSnapshot(spec))
    expect(free.debugState().goal).toEqual({ X: 6, Y: 5 })
    const hot = brain('farmer')
    hot.decide(makeSnapshot({ ...spec, fireZones: [zone(2, 7, 5)] }))
    expect(hot.debugState().goal).not.toEqual({ X: 6, Y: 5 })
  })

  it("a bot's own aura does not repel it", () => {
    const b = brain('farmer')
    b.decide(
      makeSnapshot({
        map: standardMap(),
        tick: 100,
        players: [{ id: 1, X: 3, Y: 5 }],
        pickups: [{ id: 40, X: 6, Y: 5, kind: PickupKind.FirePlus }],
        fireZones: [zone(1, 6, 5)],
      }),
    )
    expect(b.debugState().goal).toEqual({ X: 6, Y: 5 })
  })

  it('a bot standing in an enemy fire wall walks out', () => {
    const b = brain('farmer')
    const out = b.decide(makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 1, X: 5, Y: 5 }], fireZones: [zone(2, 5, 5, 'firewall')] }))
    expect(moveOf(out)).not.toBe(方向.停)
    expect(b.debugState().goal).not.toEqual({ X: 5, Y: 5 })
  })
})

describe('kick', () => {
  it('kick shot: pushes its own bomb along the row onto the enemy', () => {
    const b = brain('hunter')
    const spec = (t: number): SnapSpec => ({
      map: standardMap(),
      tick: t,
      players: [
        { id: 1, X: 5, Y: 5, skills: { passive: ['kick', 1] } },
        { id: 2, X: 9, Y: 5 },
      ],
      bombs: [{ id: 30, X: 6, Y: 5, owner: 1, fuseEndTick: 140 }],
    })
    const out = drive(b, spec, 100, 4)
    expect(out.some((o) => casts(o) === 0 && moveOf(o) === 方向.右 && b.debugState().lastCast === 'kick')).toBe(true)
  })

  it('kick clear: boxed in by an enemy bomb, kicks it down the corridor', () => {
    const map = carved([[5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    const b = brain('farmer')
    const spec = (t: number): SnapSpec => ({
      map,
      tick: t,
      players: [{ id: 1, X: 5, Y: 5, skills: { passive: ['kick', 1] } }],
      bombs: [{ id: 30, X: 6, Y: 5, owner: 2, fuseEndTick: 120, power: 3 }],
    })
    drive(b, spec, 100, 10)
    expect(b.debugState().lastCast).toBe('kick')
  })

  it('without kick the same bot only waits', () => {
    const map = carved([[5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    const b = brain('farmer')
    drive(b, (t) => ({ map, tick: t, players: [{ id: 1, X: 5, Y: 5 }], bombs: [{ id: 30, X: 6, Y: 5, owner: 2, fuseEndTick: 120, power: 3 }] }), 100, 10)
    expect(b.debugState().lastCast).toBeNull()
  })
})

describe('freeze', () => {
  it('a frozen bot only sends 停, even in danger', () => {
    const out = drive(
      brain('farmer'),
      (t) => ({ map: standardMap(), tick: t, players: [{ id: 1, X: 1, Y: 1, skills: { frozenUntilTick: 120 } }], bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 112 }] }),
      100,
      6,
    )
    for (const o of out) expect(o).toEqual([{ ability: '移动', 输入: { 方向: 方向.停, 按了转弯: false } }])
  })

  it('an enemy frozen through the blast window cannot escape; unfrozen it can', () => {
    const mk = (frozen: number) =>
      makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 2, X: 1, Y: 1, skills: { frozenUntilTick: frozen } }], bombs: [{ id: 20, X: 3, Y: 1, owner: 1, fuseEndTick: 130 }] })
    const ctx = { config, rules } as unknown as ThinkContext
    for (const [frozen, can] of [
      [0, true],
      [140, false],
    ] as const) {
      const snap = mk(frozen)
      const board = buildBoard(snap)
      expect(enemyCanEscape(board, buildDangerMap(board, 8), snap.Players[0], ctx)).toBe(can)
    }
    expect(cellIndexOf(buildBoard(mk(0)), mk(0).Players[0].LogicTransform.WorldPosition)).toBe(20)
  })
})

describe('skill candy', () => {
  const at = (skills: PlayerSpec['skills'], skill: SkillId, X: number): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [{ id: 1, X: 1, Y: 1, skills }],
    pickups: [{ id: 50, X, Y: 1, kind: PickupKind.SkillCandy, skill: [skill, 1] }],
  })
  const goesFor = (s: SnapSpec): boolean => {
    const b = brain('farmer')
    b.decide(makeSnapshot(s))
    return b.debugState().mode === 'pickup'
  }

  it('an evolving candy is worth a longer walk than a plain equip', () => {
    // 12 步：普通捡拾 7 + 进化 8 够得着，装备 7 + 3 够不着。
    expect(goesFor(at({ active: ['blink', 1] }, 'fireAura', 13))).toBe(true)
    expect(goesFor(at({ active: ['blink', 1] }, 'kick', 13))).toBe(false)
    expect(goesFor(at({ active: ['blink', 1] }, 'kick', 9))).toBe(true)
  })

  it('a candy the rules would reject is ignored (rabbit + kick: passive slot taken)', () => {
    expect(goesFor(at({ passive: ['regen', 1] }, 'kick', 3))).toBe(false)
  })

  it('a pierce candy is sought; a freeze candy only when freeze bombs deal damage', () => {
    expect(goesFor(at({}, 'pierceBomb', 5))).toBe(true)
    expect(goesFor(at({}, 'freezeBomb', 5))).toBe(true)
    const b = new BotBrain({ self: 1, seed: 1, personality: 'farmer', config, rules: { ...rules, freezeBombDamages: false } })
    b.decide(makeSnapshot(at({}, 'freezeBomb', 5)))
    expect(b.debugState().mode).not.toBe('pickup')
  })
})

describe('rabbit', () => {
  it('a hurt rabbit picks the hunt behaviour less often than a healthy one', () => {
    const hunts = (hp: number): number => {
      let n = 0
      for (let seed = 1; seed <= 60; seed++) {
        const b = brain('hunter', 1, seed)
        b.decide(makeSnapshot({ map: standardMap(), tick: 100, players: [{ id: 1, X: 1, Y: 1, hp, skills: { passive: ['regen', 1] } }, { id: 2, X: 17, Y: 17 }] }))
        if (b.debugState().behaviour === 'hunt') n++
      }
      return n
    }
    expect(hunts(2)).toBeLessThan(hunts(6))
  })
})

describe('performance with skills', () => {
  it('7 decides on a busy snapshot with skills, fire zones and kicked bombs: median < 5 ms', () => {
    const ids: SkillId[] = ['bubble', 'blink', 'fireAura', 'fireDash', 'bounceBubble', 'blink', 'bubble', 'fireAura']
    const snaps = Array.from({ length: 40 }, (_, k) => {
      const s = busySnapshot(100 + k)
      const players = s.Players.map((p, i) => ({ ...p, skills: { ...makeSnapshot({ map: ['.'], players: [{ id: 1, X: 0, Y: 0, skills: { active: [ids[i], 1], passive: ['kick', 1], bomb: ['pierceBomb', 1] } }] }).Players[0].skills! } }))
      const bombsList = s.Bombs.map((b, i) => (i % 5 === 0 ? { ...b, kick: { dir: 方向.右, progressMilli: 200, cellsLeft: 3, speedMilli: rules.kickSpeedMilli } } : b))
      return { ...s, Players: players, Bombs: bombsList, FireZones: [{ owner: 3, source: 'aura' as const, cells: [{ X: 17, Y: 1 }], untilTick: 400 }] }
    })
    const personalities: BotPersonality[] = ['farmer', 'hunter', 'collector', 'roamer', 'farmer', 'hunter', 'roamer']
    const brains = personalities.map((p, k) => brain(p, k + 2, 99 + k, BOT_PROFILES.normal))
    for (const s of snaps) for (const br of brains) br.decide(s)
    const samples: number[] = []
    for (const s of snaps) {
      const t0 = performance.now()
      for (const br of brains) br.decide(s)
      samples.push(performance.now() - t0)
    }
    samples.sort((x, y) => x - y)
    expect(samples[samples.length >> 1]).toBeLessThan(5)
  })
})
