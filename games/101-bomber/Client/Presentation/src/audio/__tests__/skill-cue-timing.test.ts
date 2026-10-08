import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RULES, MatchPhase, PickupKind, 方向, type BomberEvent, type PlayerSkillsView, type WorldSnapshot } from '../../contract'
import { PresentationFeed } from '../../present/feed'

/**
 * 回归（review #9）：技能音的快照兜底必须与事件对齐到同一 Tick。PresentationFeed 的 `curr` 比到期事件领先一帧，
 * 若兜底看 `curr`，第一次本人放技能 / 进化会先响一声兜底、下一帧再响真事件——同一次技能响两遍。
 */
const calls: string[] = []

vi.mock('../synth', () => ({
  Synth: class {
    now(): number {
      return 0
    }
    setMuted(): void {}
    setMusicEnabled(): void {}
    resume(): void {}
    setHiss(): void {}
    musicNote(): void {}
    dispose(): void {}
  },
}))

vi.mock('../sounds', async (orig) => {
  const real: Record<string, unknown> = await orig()
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(real)) out[k] = typeof real[k] === 'function' ? () => void calls.push(k) : real[k]
  return out
})

const { createAudio } = await import('../index')

const ME = 1
const TICK_MS = 50

function skills(sk: Partial<PlayerSkillsView>): PlayerSkillsView {
  return {
    character: 'duck',
    facing: 方向.下,
    slots: { bomb: null, active: { skill: 'bubble', level: 1, bound: true }, passive: null },
    cdFromTick: 0,
    cdUntilTick: 0,
    bubbleUntilTick: 0,
    auraUntilTick: 0,
    frozenUntilTick: 0,
    regenFromTick: 0,
    regenNextTick: 0,
    blinkTick: 0,
    ...sk,
  }
}

function snap(tick: number, sk: Partial<PlayerSkillsView>, hats = 0): WorldSnapshot {
  return {
    Tick: tick,
    BomberMatchState: { MatchTick: tick, StartTick: 0, EndTick: 7200, Phase: MatchPhase.Running, HatKingNetEntityIdRaw: 0 },
    Players: [
      {
        NetEntityIdRaw: ME,
        LogicTransform: { WorldPosition: { x: 1.5, y: 1, z: 1.5 } },
        teleportTick: 0,
        BomberPlayerState: { HatCount: hats, RespawnAtTick: 0, ProtectedUntilTick: 0 },
        玩家属性: { 血量当前: 6, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
        meta: { name: 'me', isBot: false, animal: 'duck', slot: 0 },
        eliminated: false,
        skills: skills(sk),
      },
    ],
    Bombs: [],
    HatPiles: [],
    Pickups: [],
    Chests: [],
    Terrain: { size: 3, ground: new Uint8Array(9), brick: new Uint8Array(9), rev: 0 },
    match: { matchIndex: 1, phaseEndTick: 7200, tickRateHz: 20, resourceInitial: 0, resourceRemaining: 0, finalCircle: null },
  }
}

/** rAF 节奏：每 tick 先推一帧（recvAt 略晚于 rAF 时间戳，同 main.ts 的 pump），再按 60 fps 采样三次。 */
function drive(frames: { snapshot: WorldSnapshot; events: BomberEvent[] }[]): void {
  const feed = new PresentationFeed(TICK_MS)
  const audio = createAudio({ muted: false, music: false, rules: DEFAULT_RULES })
  audio.unlock()
  let now = 0
  for (const f of frames) {
    feed.push(f, now + 0.3)
    for (let i = 0; i < 3; i++) {
      const s = feed.sample(now)
      if (s) audio.update(s, ME)
      now += TICK_MS / 3
    }
  }
  audio.dispose()
}

describe('skill sound snapshot fallback vs the event (review #9: no double play)', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('first local cast with a SkillActivated event plays only the event sound', () => {
    const cast: BomberEvent = {
      type: 'SkillActivated',
      presentationOnly: true,
      PlayerNetEntityIdRaw: ME,
      Skill: 'bubble',
      Level: 1,
      Cell: { X: 1, Y: 1 },
      ToCell: { X: 1, Y: 1 },
      UntilTick: 70,
      CdUntilTick: 370,
      Tick: 10,
    }
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, { cdFromTick: 10, cdUntilTick: 370, bubbleUntilTick: 70 }), events: [cast] },
      { snapshot: snap(11, { cdFromTick: 10, cdUntilTick: 370, bubbleUntilTick: 70 }), events: [] },
      { snapshot: snap(12, { cdFromTick: 10, cdUntilTick: 370, bubbleUntilTick: 70 }), events: [] },
    ])
    expect(calls.filter((c) => c.startsWith('skill') || c === 'evolve')).toEqual(['skillBubble'])
  })

  it('first evolve with a SkillEvolved event plays the evolve sound once', () => {
    const evolved = { slots: { bomb: null, active: { skill: 'bounceBubble' as const, level: 1, bound: true }, passive: null } }
    const evo: BomberEvent = {
      type: 'SkillEvolved',
      presentationOnly: true,
      PlayerNetEntityIdRaw: ME,
      From: ['bubble', 'kick'],
      Combo: 'bounceBubble',
      Slot: 'active',
      FreedSlot: null,
      Tick: 10,
    }
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, evolved), events: [evo] },
      { snapshot: snap(11, evolved), events: [] },
      { snapshot: snap(12, evolved), events: [] },
    ])
    expect(calls.filter((c) => c.startsWith('skill') || c === 'evolve')).toEqual(['evolve'])
  })

  it('a source with no skill events still gets the fallback sound, exactly once', () => {
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, { cdFromTick: 10, cdUntilTick: 370 }), events: [] },
      { snapshot: snap(11, { cdFromTick: 10, cdUntilTick: 370 }), events: [] },
      { snapshot: snap(12, { cdFromTick: 10, cdUntilTick: 370 }), events: [] },
    ])
    expect(calls.filter((c) => c.startsWith('skill') || c === 'evolve')).toEqual(['skillBlink'])
  })

  it('first powerup with a PickupTaken event pops the hat once (same one-tick lead as the skill fallback)', () => {
    const take: BomberEvent = { type: 'PickupTaken', PickerNetEntityIdRaw: ME, Kind: PickupKind.FirePlus, Tick: 10 }
    drive([
      { snapshot: snap(8, {}, 0), events: [] },
      { snapshot: snap(9, {}, 0), events: [] },
      { snapshot: snap(10, {}, 1), events: [take] },
      { snapshot: snap(11, {}, 1), events: [] },
      { snapshot: snap(12, {}, 1), events: [] },
    ])
    expect(calls.filter((c) => c === 'hatPickup')).toEqual(['hatPickup'])
  })
})

describe('ADR 0033 status sounds (原型扩展 NON-CONTRACT): events vs snapshot fallback, no double play', () => {
  beforeEach(() => {
    calls.length = 0
  })
  const status = (c: string): boolean => c === 'poisonHiss' || c === 'zap' || c === 'cureChime' || c === 'toxinTick'
  const poisoned: BomberEvent = {
    type: 'PlayerPoisoned',
    presentationOnly: true,
    VictimNetEntityIdRaw: ME,
    SourceBombNetEntityIdRaw: 44,
    SourceBombOwnerNetEntityIdRaw: 2,
    UntilTick: 71,
    Tick: 10,
  }
  const shocked: BomberEvent = { ...poisoned, type: 'PlayerShocked', UntilTick: 51 }
  const cured: BomberEvent = { type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: ME, Reason: 'healthPack', Tick: 12 }

  it('PlayerPoisoned / PlayerShocked / PlayerCured events: hiss, zap and chime once each', () => {
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, { toxinUntilTick: 71, shockUntilTick: 51 }), events: [poisoned, shocked] },
      { snapshot: snap(11, { toxinUntilTick: 71, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(12, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [cured] },
      { snapshot: snap(13, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(14, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [] },
    ])
    expect(calls.filter(status)).toEqual(['poisonHiss', 'zap', 'cureChime'])
  })

  it('without status events the snapshot fallback plays each exactly once', () => {
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, { toxinUntilTick: 71, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(11, { toxinUntilTick: 71, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(12, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(13, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [] },
      { snapshot: snap(14, { toxinUntilTick: 0, shockUntilTick: 51 }), events: [] },
    ])
    expect(calls.filter(status)).toEqual(['poisonHiss', 'zap', 'cureChime'])
  })

  it('a toxin tick on the local player is a soft bubble, not the hurt squeak', () => {
    const tick: BomberEvent = {
      type: 'DamageApplied',
      VictimNetEntityIdRaw: ME,
      SourceBombNetEntityIdRaw: 44,
      SourceBombOwnerNetEntityIdRaw: 2,
      ChainId: 0,
      HealthPointsLeft: 5,
      Tick: 10,
      proto: { Cause: 4, Points: 1 },
    }
    drive([
      { snapshot: snap(8, {}), events: [] },
      { snapshot: snap(9, {}), events: [] },
      { snapshot: snap(10, {}), events: [tick] },
      { snapshot: snap(11, {}), events: [] },
    ])
    expect(calls.filter((c) => c === 'hurt' || c === 'toxinTick')).toEqual(['toxinTick'])
  })
})
