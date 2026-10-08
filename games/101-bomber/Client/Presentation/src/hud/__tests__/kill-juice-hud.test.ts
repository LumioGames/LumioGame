import { describe, expect, it } from 'vitest'
import { MatchPhase, PickupKind, type BomberEvent } from '../../contract'
import { PersonalBestStore, type BestStorage } from '../../present/personal-best'
import { HudBrain, knockoutText, othersStreakBanner, streakBanner, type HudMoment, type SettlementResults } from '../hud-brain'
import { batch, died, exploded, ME, snap } from './fixtures'

/** 击杀手感在 HUD 上的落点（design §3.1 单杀 / 连杀 / 连锁，§13 高光卡 / 个人最佳，ADR 0043）。 */

function memoryStorage(): BestStorage {
  const data: Record<string, string> = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

const newBrain = (store = new PersonalBestStore(memoryStorage())): HudBrain =>
  new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2, personalBest: store })

const knockouts = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'popup' && m.tone === 'knockout' ? [m.text] : []))
const milestones = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'popup' && m.tone === 'milestone' ? [m.text] : []))
const streaks = (ms: HudMoment[]): { title: string; sub: string; mine: boolean }[] =>
  ms.flatMap((m) => (m.kind === 'banner' && m.tone === 'streak' ? [{ title: m.title, sub: m.sub, mine: m.mine }] : []))
const dropped = (tick: number, victim: number, n: number): BomberEvent => ({
  type: 'PowerupsDropped',
  presentationOnly: true,
  VictimNetEntityIdRaw: victim,
  Kinds: Array.from({ length: n }, () => PickupKind.FirePlus),
  Cell: { X: 1, Y: 1 },
  Tick: tick,
})

const players = [{ id: ME }, { id: 2 }, { id: 3, hats: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]

function started(b: HudBrain): void {
  b.consume(batch(0, [], { snapshot: snap({ tick: 0, players }) }))
}

describe('knockoutText / streakBanner', () => {
  it('「击飞 XX！+N」, without +N while unknown or zero', () => {
    expect(knockoutText('豆豆熊', 3)).toBe('击飞 豆豆熊！+3')
    expect(knockoutText('豆豆熊', 0)).toBe('击飞 豆豆熊！')
    expect(knockoutText('豆豆熊', null)).toBe('击飞 豆豆熊！')
  })

  it('merges a window streak and a spree crossed in the same batch; spree is the headline', () => {
    const k = { tick: 1, killer: ME, victim: 2, chainId: 1, rapid: 3, spree: 3, pitchStep: 2 }
    expect(streakBanner([{ ...k, rapidLabel: '三杀', spreeLabel: '大杀特杀' }])).toEqual({ title: '大杀特杀！', sub: '三杀 · 不死连杀 3' })
    expect(streakBanner([{ ...k, rapidLabel: '三杀', spreeLabel: null }])).toEqual({ title: '三杀！', sub: '8 秒内击飞 3 人' })
    expect(streakBanner([{ ...k, rapid: 1, rapidLabel: null, spreeLabel: '大杀特杀' }])).toEqual({ title: '大杀特杀！', sub: '不死连杀 3 人' })
    expect(streakBanner([{ ...k, rapidLabel: null, spreeLabel: null }])).toBeNull()
  })

  it('others: 三杀+ window streaks and every spree get a named banner; 双杀 stays a kill-feed badge only (user 2026-09-28)', () => {
    const k = { tick: 1, killer: 7, victim: 2, chainId: 1, rapid: 3, spree: 3, pitchStep: 2 }
    expect(othersStreakBanner({ ...k, rapidLabel: '三杀', spreeLabel: '大杀特杀' }, '火焰熊')).toEqual({ title: '火焰熊 大杀特杀！', sub: '不死连杀 3 人' })
    expect(othersStreakBanner({ ...k, rapidLabel: '三杀', spreeLabel: null }, '火焰熊')).toEqual({ title: '火焰熊 三杀！', sub: '8 秒内击飞 3 人' })
    expect(othersStreakBanner({ ...k, rapid: 2, spree: 2, rapidLabel: '双杀', spreeLabel: null }, '火焰熊')).toBeNull()
    expect(othersStreakBanner({ ...k, rapidLabel: null, spreeLabel: null }, '火焰熊')).toBeNull()
  })
})

describe('HudBrain · 单杀弹字', () => {
  it('shows 击飞 XX！+N immediately when the drop count is known (proto.HatsLost)', () => {
    const b = newBrain()
    started(b)
    const m = b.consume(batch(5, [died(5, 3, ME, 40, 3)]))
    expect(knockouts(m)).toEqual(['击飞 豆豆熊！+3'])
  })

  it('shows 击飞 XX！ first and fills in +N on the same popup once PowerupsDropped arrives', () => {
    const b = newBrain()
    started(b)
    const first = b.consume(batch(5, [died(5, 3, ME, 40)]))
    expect(knockouts(first)).toEqual(['击飞 豆豆熊！'])
    const key = first.find((x) => x.kind === 'popup' && x.tone === 'knockout')
    const later = b.consume(batch(6, [dropped(6, 3, 2)]))
    expect(knockouts(later)).toEqual(['击飞 豆豆熊！+2'])
    const same = later.find((x) => x.kind === 'popup' && x.tone === 'knockout')
    expect(same && same.kind === 'popup' && key && key.kind === 'popup' && same.key === key.key).toBe(true)
  })

  it('does not pop for kills by others, suicides or kills of me', () => {
    const b = newBrain()
    started(b)
    expect(knockouts(b.consume(batch(5, [died(5, 3, 4, 40), died(5, ME, ME, 41), died(5, ME, 2, 42)])))).toEqual([])
  })

  it('the second quick kill pops bigger', () => {
    const b = newBrain()
    started(b)
    const tiers = [died(5, 3, ME, 40, 0), died(40, 4, ME, 41, 0)].map((e) => {
      const p = b.consume(batch(e.Tick, [e])).find((x) => x.kind === 'popup' && x.tone === 'knockout')
      return p && p.kind === 'popup' ? p.tier : 0
    })
    expect(tiers[1]).toBeGreaterThan(tiers[0])
  })
})

describe('HudBrain · 连杀横幅与击杀栏', () => {
  it('8 秒内第二杀（不同链）→ 本人横幅「双杀！」+ 击杀栏称号', () => {
    const b = newBrain()
    started(b)
    expect(streaks(b.consume(batch(5, [died(5, 3, ME, 40, 0)])))).toEqual([])
    const m = b.consume(batch(60, [died(60, 4, ME, 41, 0)]))
    expect(streaks(m)).toEqual([{ title: '双杀！', sub: '8 秒内击飞 2 人', mine: true }])
    expect(b.killFeed.entries()[0].badge).toBe('双杀')
  })

  it('不死连杀 3 → 大杀特杀 even when the kills are far apart; others get the feed badge and a named banner (user 2026-09-28)', () => {
    const b = newBrain()
    started(b)
    b.consume(batch(5, [died(5, 3, ME, 40, 0)]))
    b.consume(batch(400, [died(400, 4, ME, 41, 0)]))
    const m = b.consume(batch(800, [died(800, 5, ME, 42, 0)]))
    expect(streaks(m).map((x) => x.title)).toEqual(['大杀特杀！'])
    const o = newBrain()
    started(o)
    o.consume(batch(5, [died(5, 3, 6, 40, 0)]))
    o.consume(batch(400, [died(400, 4, 6, 41, 0)]))
    const om = o.consume(batch(800, [died(800, 5, 6, 42, 0)]))
    expect(streaks(om)).toHaveLength(1)
    expect(streaks(om)[0]).toMatchObject({ mine: false, sub: '不死连杀 3 人' })
    expect(streaks(om)[0].title).toMatch(/ 大杀特杀！$/)
    expect(o.killFeed.entries()[0].badge).toBe('大杀特杀')
  })

  it('a single chain double kill stays the 多杀 popup, not a streak banner', () => {
    const b = newBrain()
    started(b)
    expect(streaks(b.consume(batch(5, [died(5, 3, ME, 40, 0), died(5, 4, ME, 40, 0)])))).toEqual([])
  })
})

describe('HudBrain · 首次 ×5 / ×8 连锁', () => {
  it('pops 首次 ×5 连锁！ once per match for a chain with a local bomb', () => {
    const b = newBrain()
    started(b)
    const five = [exploded(3, 10, ME), exploded(3, 10, 2), exploded(3, 10, 3), exploded(3, 10, 4), exploded(3, 10, 5)]
    expect(milestones(b.consume(batch(3, five)))).toEqual(['首次 ×5 连锁！'])
    const again = five.map((e) => {
      if (e.type !== 'BombExploded') throw new Error('Expected BombExploded fixture')
      return { ...e, ChainId: 11, Tick: 9 }
    })
    expect(milestones(b.consume(batch(9, again)))).toEqual([])
  })
})

describe('HudBrain · 整局最后一杀后结算晚开（慢镜时长）', () => {
  const end = (tick: number): BomberEvent => ({ type: 'MatchEnded', Tick: tick })
  const settleSnap = (tick: number) => snap({ tick, phase: MatchPhase.Settlement, players })

  it('holds the settlement moment 12 Ticks (0.6 s) after a match-ending kill', () => {
    const b = newBrain()
    started(b)
    const at = b.consume(batch(50, [died(50, 3, ME, 40, 1), end(50)], { snapshot: settleSnap(50) }))
    expect(at.some((x) => x.kind === 'settlement')).toBe(false)
    expect(knockouts(at)).toEqual(['击飞 豆豆熊！+1'])
    expect(b.consume(batch(61, [], { snapshot: settleSnap(61) })).some((x) => x.kind === 'settlement')).toBe(false)
    expect(b.consume(batch(62, [], { snapshot: settleSnap(62) })).some((x) => x.kind === 'settlement')).toBe(true)
  })

  it('settles right away when the match ended without a kill', () => {
    const b = newBrain()
    started(b)
    expect(b.consume(batch(50, [end(50)], { snapshot: settleSnap(50) })).some((x) => x.kind === 'settlement')).toBe(true)
  })
})

describe('HudBrain · 结算：高光卡与个人最佳', () => {
  function settle(b: HudBrain, tick: number): SettlementResults {
    const m = b.consume(batch(tick, [], { snapshot: snap({ tick, phase: MatchPhase.Settlement, players }) }))
    const r = m.find((x) => x.kind === 'settlement')
    if (r?.kind !== 'settlement') throw new Error('no settlement')
    return r.results
  }

  it('deals exactly one highlight card per ranked player, in row order', () => {
    const b = newBrain()
    started(b)
    b.consume(batch(5, [died(5, 3, ME, 40, 0), exploded(5, 40, ME), exploded(5, 40, 2), exploded(5, 40, 4)]))
    b.consume(batch(9, [{ type: 'PickupTaken', PickerNetEntityIdRaw: 4, Kind: PickupKind.FirePlus, Tick: 9 }]))
    const r = settle(b, 20)
    expect(r.highlights.map((c) => c.id)).toEqual(r.rows.map((row) => row.id))
    const mine = r.highlights.find((c) => c.id === ME)
    expect(mine?.kind).toBe('mostKills')
    expect(r.highlights.find((c) => c.id === 4)?.kind).toBe('porter')
  })

  it('records the personal best and flags new records; the next match compares against it', () => {
    const store = new PersonalBestStore(memoryStorage())
    const b = newBrain(store)
    started(b)
    b.consume(batch(5, [died(5, 3, ME, 40, 0)]))
    const r = settle(b, 20)
    expect(r.personalBest?.newRecords).toContain('mostKills')
    expect(r.personalBest?.best.mostKills).toBe(1)
    const b2 = newBrain(store)
    started(b2)
    const r2 = settle(b2, 20)
    expect(r2.personalBest?.newRecords).not.toContain('mostKills')
    expect(r2.personalBest?.previous.mostKills).toBe(1)
  })

  it('counts a player who survives the match on 1 heart as 绝境逃生', () => {
    const b = newBrain()
    const lobby = [{ id: ME }, { id: 2, hp: 2 }]
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: lobby }) }))
    b.consume(batch(1, [], { snapshot: snap({ tick: 1, players: lobby }) }))
    const m = b.consume(batch(2, [], { snapshot: snap({ tick: 2, phase: MatchPhase.Settlement, players: lobby }) }))
    const r = m.find((x) => x.kind === 'settlement')
    if (r?.kind !== 'settlement') throw new Error('no settlement')
    expect(r.results.highlights.find((c) => c.id === 2)).toMatchObject({ kind: 'clutch', detail: '1 心逃生 1 次' })
  })
})
