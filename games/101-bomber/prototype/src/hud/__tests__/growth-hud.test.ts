import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, MatchPhase, PickupKind, type BomberEvent, type FinalCircleView, type SupplyView } from '../../contract'
import { PersonalBestStore } from '../../present/personal-best'
import { circleHud } from '../final-circle'
import { goldHeartMask } from '../format'
import { bossDownBanner, HudBrain, type HudMoment, type SettlementResults } from '../hud-brain'
import { batch, died, ME, snap, type PlayerSpec } from './fixtures'

/** 方向 B 的 HUD 接线（ADR 0039 / 0040 / 0043）：金色心格、按上限的毒速、击倒 Boss 全场横幅、补给横幅、高光卡两类数据、最高心数。 */

const newBrain = (): HudBrain =>
  new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2, personalBest: new PersonalBestStore(null) })
const banners = (ms: HudMoment[], tone: string): { title: string; sub: string; mine: boolean }[] =>
  ms.flatMap((m) => (m.kind === 'banner' && m.tone === tone ? [{ title: m.title, sub: m.sub, mine: m.mine }] : []))

describe('goldHeartMask（HUD 最多 8 心，金心为金色心格）', () => {
  it('marks the top goldHearts cells of the current cap as gold', () => {
    expect(goldHeartMask(6, 2, 0)).toEqual([false, false, false])
    expect(goldHeartMask(12, 2, 1)).toEqual([false, false, false, false, false, true])
    expect(goldHeartMask(16, 2, 3)).toEqual([false, false, false, false, false, true, true, true])
    // 金心数超过上限心数时不越界。
    expect(goldHeartMask(4, 2, 5)).toEqual([true, true])
  })
})

describe('circleHud 毒速按本人上限（ADR 0039：满血约 6 秒 / 3 秒毒死）', () => {
  const fc = (stageIndex: number): FinalCircleView => ({
    trigger: 'time',
    startTick: 100,
    endTick: 1900,
    stageIndex,
    ring: { Min: 0, Max: 8 },
    nextRing: null,
    nextRingTick: 0,
    aliveCount: 2,
  })
  const at = (maxHealth: number | undefined, stageIndex: number) => {
    const players: PlayerSpec[] = [{ id: ME, x: 4.5, z: 4.5, ...(maxHealth !== undefined ? { maxHealth } : {}) }, { id: 2 }]
    return circleHud(snap({ tick: 200, phase: MatchPhase.Endgame, players, finalCircle: fc(stageIndex) }), ME, 200, 200, DEFAULT_RULES, 2, 6)
  }
  it('a 3-heart player keeps −0.5 / −1 心/秒', () => {
    expect(at(6, 0).poisonPerSec).toBe(0.5)
    expect(at(undefined, 0).poisonPerSec).toBe(0.5)
  })
  it('an 8-heart Boss loses ⌈段点数 × 16 / 6⌉ points per second', () => {
    expect(at(16, 0).poisonPerSec).toBe(1.5)
    expect(at(16, 0).poisonText).toBe('圈外中毒 −1.5 心/秒！回到圈内')
    const last = DEFAULT_RULES.ringStages.length - 1
    expect(at(16, last).poisonPerSec).toBe(3)
  })
})

describe('击倒 Boss 全场横幅（design §3.1，ADR 0039 / 0043）', () => {
  it('bossDownBanner wording', () => {
    expect(bossDownBanner('灰灰猫', '豆豆熊', 8, false)).toEqual({ title: '灰灰猫 击倒了 8 心 Boss！', sub: 'Boss 豆豆熊 倒下了 · 冲过去哄抢！' })
    expect(bossDownBanner('你', '豆豆熊', 6, true).title).toBe('你击倒了 6 心 Boss！')
    expect(bossDownBanner(null, '豆豆熊', 7, false)).toEqual({ title: '7 心 Boss 倒下了！', sub: '豆豆熊 · 冲过去哄抢！' })
  })

  it('fires for everyone when a ≥ 6-heart player is knocked down, not for a 5-heart one', () => {
    const b = newBrain()
    const players: PlayerSpec[] = [{ id: ME }, { id: 3, maxHealth: 16 }, { id: 4, maxHealth: 10 }]
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
    const before = snap({ tick: 4, players })
    const boss = b.consume(batch(5, [died(5, 3, 4, 40, 2)], { before }))
    expect(banners(boss, 'boss')).toEqual([{ title: '灰灰猫 击倒了 8 心 Boss！', sub: 'Boss 豆豆熊 倒下了 · 冲过去哄抢！', mine: false }])
    const small = b.consume(batch(6, [died(6, 4, 3, 41, 2)], { before }))
    expect(banners(small, 'boss')).toEqual([])
  })

  it('the local killer gets its own wording; poison deaths of a Boss still announce', () => {
    const b = newBrain()
    const players: PlayerSpec[] = [{ id: ME }, { id: 3, maxHealth: 12 }]
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
    const before = snap({ tick: 4, players })
    expect(banners(b.consume(batch(5, [died(5, 3, ME, 40, 1)], { before })), 'boss')[0]).toMatchObject({ title: '你击倒了 6 心 Boss！', mine: true })
    const c = newBrain()
    c.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
    const poison = died(5, 3, 3, 0)
    if (poison.type === 'PlayerDied') poison.Cause = 3
    expect(banners(c.consume(batch(5, [poison], { before })), 'boss')[0]?.title).toBe('6 心 Boss 倒下了！')
  })
})

describe('中央补给全场横幅（ADR 0040）', () => {
  const sup = (state: SupplyView['state']): SupplyView => ({ Cell: { X: 4, Y: 4 }, announceTick: 100, openTick: 300, state })
  it('announces from events once each (preview, then opening)', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, supply: sup('pending') }) }))
    const ann: BomberEvent = { type: 'SupplyAnnounced', presentationOnly: true, Cell: { X: 4, Y: 4 }, AtTick: 300, Tick: 100 }
    expect(banners(b.consume(batch(100, [ann], { snapshot: snap({ tick: 100, supply: sup('announced') }) })), 'supply')).toEqual([
      { title: '中央补给 10 秒后开启！', sub: '看棋盘中心的光柱 · 狂暴糖 · 金心 · 特殊炸弹', mine: false },
    ])
    expect(banners(b.consume(batch(101, [], { snapshot: snap({ tick: 101, supply: sup('announced') }) })), 'supply')).toEqual([])
    const open: BomberEvent = { type: 'SupplyOpened', presentationOnly: true, Cell: { X: 4, Y: 4 }, Tick: 300 }
    expect(banners(b.consume(batch(300, [open], { snapshot: snap({ tick: 300, supply: sup('opened') }) })), 'supply').map((x) => x.title)).toEqual([
      '中央补给开启！',
    ])
  })

  it('falls back to the snapshot state when the source has no supply events', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, supply: sup('pending') }) }))
    expect(banners(b.consume(batch(100, [], { snapshot: snap({ tick: 100, supply: sup('announced') }) })), 'supply').map((x) => x.title)).toEqual([
      '中央补给 10 秒后开启！',
    ])
    expect(banners(b.consume(batch(300, [], { snapshot: snap({ tick: 300, supply: sup('opened') }) })), 'supply').map((x) => x.title)).toEqual([
      '中央补给开启！',
    ])
  })
})

describe('结算：Boss 猎人 / 金心收藏家接上数据、最高心数', () => {
  function settle(b: HudBrain, tick: number, players: PlayerSpec[]): SettlementResults {
    const m = b.consume(batch(tick, [], { snapshot: snap({ tick, phase: MatchPhase.Settlement, players }) }))
    const r = m.find((x) => x.kind === 'settlement')
    if (r?.kind !== 'settlement') throw new Error('no settlement')
    return r.results
  }

  it('counts Boss knock-downs and gold hearts per player and deals those cards', () => {
    const b = newBrain()
    const players: PlayerSpec[] = [
      { id: ME, maxHealth: 8, goldHearts: 1 },
      { id: 2, maxHealth: 6, goldHearts: 0 },
      { id: 3, maxHealth: 16, goldHearts: 3 },
      { id: 4, maxHealth: 6, goldHearts: 0 },
    ]
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
    const before = snap({ tick: 4, players })
    b.consume(batch(5, [died(5, 3, 2, 40, 3)], { before }))
    // 本人也击飞一个（非 Boss）：「最多击杀」有人拿，2 号的卡落到更突出的「Boss 猎人」。
    b.consume(batch(7, [died(7, 4, ME, 42, 0)], { before }))
    const gold = (tick: number, picker: number): BomberEvent => ({ type: 'PickupTaken', PickerNetEntityIdRaw: picker, Kind: PickupKind.GoldHeart, Tick: tick })
    b.consume(batch(9, [gold(9, 4), gold(9, 4), gold(10, ME)]))
    const r = settle(b, 30, players)
    expect(r.highlights.find((c) => c.id === 2)).toMatchObject({ kind: 'bossHunter', detail: '击倒 1 个 Boss' })
    expect(r.highlights.find((c) => c.id === 4)).toMatchObject({ kind: 'goldHearts', detail: '收集 2 颗金心' })
    expect(r.stats.maxHearts).toBe(4)
  })

  it('without maxHealth / goldHearts in the snapshot those two kinds stay out', () => {
    const b = newBrain()
    const players: PlayerSpec[] = [{ id: ME }, { id: 2 }, { id: 3 }]
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
    const r = settle(b, 30, players)
    expect(r.highlights.some((c) => c.kind === 'bossHunter' || c.kind === 'goldHearts')).toBe(false)
    expect(r.stats.maxHearts).toBe(3)
  })
})
