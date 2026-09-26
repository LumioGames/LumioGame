import { describe, expect, it } from 'vitest'
import { BlockType, DeathCause, 方向 } from '../../contract'
import { startMatch } from '../match-phase'
import { addBomb, cell, evs, makeWorld, mv, player, put, run, setBrick, SKILL, step } from './helpers'
import { face, giveSkill } from './skill-helpers'

/** 火焰光环与火焰冲刺火墙（原型扩展 NON-CONTRACT，ADR 0030，D13）：接触即烧，每受害者每秒至多一次，−1 心，Cause = Burn。 */

const burns = (frames: Parameters<typeof evs>[0], victim: number) =>
  evs(frames, 'DamageApplied').filter((e) => e.VictimNetEntityIdRaw === victim && e.proto?.Cause === DeathCause.Burn)

function bearWorld(players = 2) {
  const w = makeWorld({ players, picks: ['bear'] })
  const bear = put(w, 1, 5, 5)
  for (let i = 2; i <= players; i++) put(w, i, 17, 17 - 2 * (i - 2))
  return { w, bear }
}

const DASH_PARTS = [
  { skill: 'blink', level: 1, bound: true },
  { skill: 'fireAura', level: 1, bound: false },
] as const

describe('fire aura', () => {
  it('3×3 around the bear (air cells only, incl. his own) for 80 ticks, published as a FireZone', () => {
    const { w } = bearWorld()
    const f = step(w, { 1: [SKILL] })
    const T = w.t
    expect(evs(f, 'SkillActivated')).toMatchObject([{ Skill: 'fireAura', UntilTick: T + 80, CdUntilTick: T + 400 }])
    expect(f.snapshot.FireZones).toEqual([
      {
        owner: 1,
        source: 'aura',
        untilTick: T + 80,
        cells: [
          { X: 5, Y: 4 },
          { X: 4, Y: 5 },
          { X: 5, Y: 5 },
          { X: 6, Y: 5 },
          { X: 5, Y: 6 },
        ],
      },
    ])
    run(w, 78)
    expect(step(w).snapshot.FireZones).toHaveLength(1)
    expect(w.t).toBe(T + 79)
    expect(step(w).snapshot.FireZones).toEqual([])
  })

  it('an enemy inside is hit at T, T+20, T+40 and dies on the third hit (killer = bear, Cause = Burn)', () => {
    const { w } = bearWorld()
    const enemy = put(w, 2, 6, 5)
    const frames = [step(w, { 1: [SKILL] })]
    const T = w.t
    frames.push(...run(w, 45))
    const hits = burns(frames, 2)
    expect(hits.map((h) => h.Tick)).toEqual([T, T + 20, T + 40])
    for (const h of hits) expect(h).toMatchObject({ SourceBombNetEntityIdRaw: 0, SourceBombOwnerNetEntityIdRaw: 1, ChainId: 0, proto: { Cause: 2, Points: 2 } })
    expect(evs(frames, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 1, Cause: DeathCause.Burn, Tick: T + 40 }])
    expect(enemy.health).toBe(0)
  })

  it('stepping out and back in within the interval does not re-hit early', () => {
    const { w } = bearWorld()
    const enemy = put(w, 2, 6, 5)
    step(w, { 1: [SKILL] })
    const T = w.t
    put(w, 2, 8, 5)
    run(w, 5)
    put(w, 2, 6, 5)
    const frames = run(w, 20)
    expect(burns(frames, 2).map((h) => h.Tick)).toEqual([T + 20])
    expect(enemy.health).toBe(w.cfg.maxHealthPoints - 4)
  })

  it('the bear himself, a protected player and a bubbled player take no burn', () => {
    const w = makeWorld({ players: 3, picks: ['bear', null, 'duck'] })
    const bear = put(w, 1, 5, 5)
    const prot = put(w, 2, 6, 5)
    put(w, 3, 5, 4)
    prot.protectedUntilTick = w.t + 1000
    step(w, { 3: [SKILL] })
    const frames = [step(w, { 1: [SKILL] }), ...run(w, 30)]
    expect(evs(frames, 'DamageApplied')).toHaveLength(0)
    expect(bear.health).toBe(w.cfg.maxHealthPoints)
    expect(player(w, 3).burnReadyTick).toBe(0)
  })

  it('writes nothing: bricks, rev and bombs untouched', () => {
    const { w } = bearWorld()
    setBrick(w, 5, 4, BlockType.积木)
    const b = addBomb(w, 2, 4, 5, 40)
    const brick = Uint8Array.from(w.brick)
    const rev = w.rev
    const frames = [step(w, { 1: [SKILL] }), ...run(w, 20)]
    expect(Array.from(w.brick)).toEqual(Array.from(brick))
    expect(w.rev).toBe(rev)
    expect(evs(frames, 'BrickDestroyed')).toHaveLength(0)
    expect(b.explodedAtTick).toBe(0)
    expect(frames[0].snapshot.FireZones![0].cells).not.toContainEqual({ X: 5, Y: 4 })
  })

  it('follows the bear, and ends the moment the bear dies', () => {
    const { w, bear } = bearWorld()
    step(w, { 1: [SKILL] })
    run(w, 6, { 1: [mv(方向.右)] })
    const cx = Math.floor(bear.mx / 1000)
    expect(cx).toBeGreaterThan(5)
    const z = step(w).snapshot.FireZones![0]
    expect(z.cells).toContainEqual({ X: cx, Y: 5 })
    bear.health = 2
    addBomb(w, 2, cx, 5, 1)
    const f = step(w)
    expect(bear.health).toBe(0)
    expect(f.snapshot.FireZones).toEqual([])
  })

  it('two overlapping bears: one hit per interval, killer = the lower-id bear', () => {
    const w = makeWorld({ players: 3, picks: ['bear', 'bear', null] })
    put(w, 1, 5, 5)
    put(w, 2, 7, 5)
    const v = put(w, 3, 6, 5)
    const frames = [step(w, { 1: [SKILL], 2: [SKILL] }), ...run(w, 45)]
    const hits = burns(frames, 3)
    expect(hits).toHaveLength(3)
    expect(hits.every((h) => h.SourceBombOwnerNetEntityIdRaw === 1)).toBe(true)
    expect(evs(frames, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 3, KillerNetEntityIdRaw: 1 }])
    expect(v.health).toBe(0)
    // 两熊相距 2 格，互不在对方 3×3 里。
    expect(burns(frames, 1)).toHaveLength(0)
  })

  it('an owner is immune only to his own fire: adjacent bears burn each other', () => {
    const w = makeWorld({ players: 2, picks: ['bear', 'bear'] })
    put(w, 1, 5, 5)
    put(w, 2, 6, 5)
    const f = step(w, { 1: [SKILL], 2: [SKILL] })
    expect(burns(f, 1)).toMatchObject([{ SourceBombOwnerNetEntityIdRaw: 2 }])
    expect(burns(f, 2)).toMatchObject([{ SourceBombOwnerNetEntityIdRaw: 1 }])
  })
})

describe('fire dash wall', () => {
  function dashWorld() {
    const w = makeWorld({ players: 3, picks: ['cat', null, null] })
    const cat = put(w, 1, 5, 5)
    put(w, 2, 17, 17)
    put(w, 3, 17, 15)
    giveSkill(w, 1, 'fireDash', 1, true, [...DASH_PARTS])
    face(w, 1, 方向.右)
    return { w, cat }
  }

  it('dashes like a blink and leaves a wall on start + passed air cells (landing excluded) for 40 ticks', () => {
    const { w, cat } = dashWorld()
    setBrick(w, 6, 5, BlockType.积木)
    const f = step(w, { 1: [SKILL] })
    const T = w.t
    expect(cat.mx).toBe(8500)
    expect(evs(f, 'SkillActivated')).toMatchObject([{ Skill: 'fireDash', ToCell: { X: 8, Y: 5 }, UntilTick: T + 40, CdUntilTick: T + 240 }])
    expect(w.fireWalls).toMatchObject([{ owner: 1, cells: [cell(w, 5, 5), cell(w, 7, 5)], bornTick: T, untilTick: T + 40 }])
    expect(f.snapshot.FireZones).toMatchObject([{ owner: 1, source: 'firewall', untilTick: T + 40 }])
  })

  it('burns enemies (killer = owner), not the owner; pruned at untilTick', () => {
    const { w } = dashWorld()
    step(w, { 1: [SKILL] })
    const T = w.t
    put(w, 1, 5, 5)
    put(w, 2, 7, 5)
    const frames = run(w, 45)
    expect(burns(frames, 2).map((h) => h.Tick)).toEqual([T + 1, T + 21])
    expect(burns(frames, 1)).toHaveLength(0)
    expect(burns(frames, 2)[0].SourceBombOwnerNetEntityIdRaw).toBe(1)
    expect(w.fireWalls).toHaveLength(0)
  })

  it('persists after the owner dies and still credits the owner; startMatch clears it', () => {
    const { w, cat } = dashWorld()
    step(w, { 1: [SKILL] })
    cat.health = 2
    addBomb(w, 3, 8, 5, 1)
    step(w)
    expect(cat.health).toBe(0)
    put(w, 2, 6, 5)
    const f = step(w)
    expect(burns(f, 2)).toMatchObject([{ SourceBombOwnerNetEntityIdRaw: 1 }])
    expect(f.snapshot.FireZones).toHaveLength(1)
    startMatch(w, 1)
    expect(w.fireWalls).toEqual([])
  })
})
