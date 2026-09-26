import { describe, expect, it } from 'vitest'
import { MatchPhase, 方向, type PlayerSkillsView, type WorldSnapshot } from '../../contract'
import { BombStatusWatch, bombStatus, statusChip } from '../bomb-status'

/** 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹的中招状态与快照兜底。 */

const ME = 1

function skills(over: Partial<PlayerSkillsView>): PlayerSkillsView {
  return {
    character: 'duck',
    facing: 方向.下,
    slots: { bomb: null, active: null, passive: null },
    cdFromTick: 0,
    cdUntilTick: 0,
    bubbleUntilTick: 0,
    auraUntilTick: 0,
    frozenUntilTick: 0,
    regenFromTick: 0,
    regenNextTick: 0,
    blinkTick: 0,
    ...over,
  }
}

function snap(tick: number, over: Partial<PlayerSkillsView> | null, opts: { hp?: number; matchIndex?: number; eliminated?: boolean } = {}): WorldSnapshot {
  return {
    Tick: tick,
    BomberMatchState: { MatchTick: tick, StartTick: 0, EndTick: 7200, Phase: MatchPhase.Running, HatKingNetEntityIdRaw: 0 },
    Players: [
      {
        NetEntityIdRaw: ME,
        LogicTransform: { WorldPosition: { x: 1.5, y: 1, z: 1.5 } },
        teleportTick: 0,
        BomberPlayerState: { HatCount: 0, RespawnAtTick: 0, ProtectedUntilTick: 0 },
        玩家属性: { 血量当前: opts.hp ?? 6, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
        meta: { name: 'me', isBot: false, animal: 'duck', slot: 0 },
        eliminated: opts.eliminated ?? false,
        ...(over ? { skills: skills(over) } : {}),
      },
    ],
    Bombs: [],
    HatPiles: [],
    Pickups: [],
    Chests: [],
    Terrain: { size: 3, ground: new Uint8Array(9), brick: new Uint8Array(9), rev: 0 },
    match: { matchIndex: opts.matchIndex ?? 1, phaseEndTick: 7200, tickRateHz: 20, resourceInitial: 0, resourceRemaining: 0, finalCircle: null },
  }
}

describe('bombStatus (中毒 / 麻痹状态)', () => {
  it('reads toxinUntilTick / shockUntilTick against the (fractional) render tick, with seconds left', () => {
    const p = snap(10, { toxinUntilTick: 70, shockUntilTick: 50 }).Players[0]
    expect(bombStatus(p, 10, 20)).toEqual({ poisoned: true, shocked: true, toxinSec: 3, shockSec: 2 })
    expect(bombStatus(p, 49.5, 20)).toMatchObject({ poisoned: true, shocked: true })
    expect(bombStatus(p, 50, 20)).toMatchObject({ poisoned: true, shocked: false, shockSec: 0 })
    expect(bombStatus(p, 70, 20)).toMatchObject({ poisoned: false, shocked: false })
  })

  it('old fixtures without the optional fields, missing skills, dead or eliminated players → no status', () => {
    const none = { poisoned: false, shocked: false, toxinSec: 0, shockSec: 0 }
    expect(bombStatus(snap(10, {}).Players[0], 10, 20)).toEqual(none)
    expect(bombStatus(snap(10, null).Players[0], 10, 20)).toEqual(none)
    expect(bombStatus(undefined, 10, 20)).toEqual(none)
    expect(bombStatus(snap(10, { toxinUntilTick: 70 }, { hp: 0 }).Players[0], 10, 20)).toEqual(none)
    expect(bombStatus(snap(10, { toxinUntilTick: 70 }, { eliminated: true }).Players[0], 10, 20)).toEqual(none)
  })
})

describe('statusChip (「麻痹中」小标签)', () => {
  it('shows 麻痹中 while shocked, 中毒中 while poisoned, both combined; nothing otherwise', () => {
    expect(statusChip({ poisoned: false, shocked: true, toxinSec: 0, shockSec: 1.25 })).toEqual({ kind: 'shock', text: '麻痹中', title: '麻痹中：移速变慢，还剩 1.3 秒' })
    expect(statusChip({ poisoned: true, shocked: false, toxinSec: 2, shockSec: 0 })).toEqual({
      kind: 'toxin',
      text: '中毒中',
      title: '中毒中：持续掉血，还剩 2 秒 · 吃血包或放泡泡能解毒',
    })
    expect(statusChip({ poisoned: true, shocked: true, toxinSec: 2, shockSec: 1 })?.text).toBe('中毒 · 麻痹中')
    expect(statusChip({ poisoned: false, shocked: false, toxinSec: 0, shockSec: 0 })).toBeNull()
  })
})

describe('BombStatusWatch (没有 PlayerPoisoned / PlayerShocked / PlayerCured 的数据源)', () => {
  it('infers poisoned / shocked from rising until-ticks (hit and refresh), cured from an early clear while alive', () => {
    const w = new BombStatusWatch()
    expect(w.check(snap(10, {}), ME)).toEqual([])
    expect(w.check(snap(11, { toxinUntilTick: 72 }), ME)).toEqual(['poisoned'])
    expect(w.check(snap(12, { toxinUntilTick: 72 }), ME)).toEqual([])
    expect(w.check(snap(20, { toxinUntilTick: 81, shockUntilTick: 61 }), ME)).toEqual(['poisoned', 'shocked'])
    // 提前清零（泡泡 / 血包）且活着 → 解毒；麻痹照旧。
    expect(w.check(snap(30, { toxinUntilTick: 0, shockUntilTick: 61 }), ME)).toEqual(['cured'])
  })

  it('natural expiry and death are not a cure', () => {
    const w = new BombStatusWatch()
    w.check(snap(10, { toxinUntilTick: 30 }), ME)
    expect(w.check(snap(30, { toxinUntilTick: 0 }), ME)).toEqual([])
    w.check(snap(40, { toxinUntilTick: 90 }), ME)
    expect(w.check(snap(45, { toxinUntilTick: 0 }, { hp: 0 }), ME)).toEqual([])
  })

  it('first snapshot and a new match only set the baseline', () => {
    const w = new BombStatusWatch()
    expect(w.check(snap(10, { toxinUntilTick: 70 }), ME)).toEqual([])
    expect(w.check(snap(11, { toxinUntilTick: 90 }, { matchIndex: 2 }), ME)).toEqual([])
    expect(w.check(snap(12, { toxinUntilTick: 0 }, { matchIndex: 2 }), ME)).toEqual(['cured'])
  })

  it('once the matching event has been seen, that cue only follows events (no double play)', () => {
    const w = new BombStatusWatch()
    w.check(snap(10, {}), ME)
    w.noteEvent('PlayerPoisoned')
    expect(w.check(snap(11, { toxinUntilTick: 72, shockUntilTick: 50 }), ME)).toEqual(['shocked'])
    w.noteEvent('PlayerShocked')
    w.noteEvent('PlayerCured')
    expect(w.check(snap(12, { toxinUntilTick: 0, shockUntilTick: 90 }), ME)).toEqual([])
  })
})
