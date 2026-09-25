import { describe, expect, it } from 'vitest'
import { MatchPhase, type BomberEvent } from '../../contract'
import { chainDelayMs, HeartTrack, hitHintText, staggerLocalHits } from '../hit-stagger'
import { HudBrain, type HudMoment } from '../hud-brain'
import { TipId } from '../tips'
import { batch, died, ME, snap } from './fixtures'

const dmg = (bomb: number, owner: number, chain: number, left: number, extra: Partial<Extract<BomberEvent, { type: 'DamageApplied' }>> = {}): BomberEvent => ({
  type: 'DamageApplied',
  VictimNetEntityIdRaw: ME,
  SourceBombNetEntityIdRaw: bomb,
  SourceBombOwnerNetEntityIdRaw: owner,
  ChainId: chain,
  HealthPointsLeft: left,
  Tick: 10,
  ...extra,
})
const boom = (bomb: number, owner: number, chain: number, index: number): BomberEvent => ({
  type: 'BombExploded',
  ChainId: chain,
  SourceBombOwnerNetEntityIdRaw: owner,
  CellCount: 5,
  Tick: 10,
  proto: { BombNetEntityIdRaw: bomb, Cell: { X: 1, Y: 1 }, IndexInChain: index },
})

describe('chain heart stagger (review: hearts all dropped at once)', () => {
  it('uses the view rhythm: 40 ms per bomb, capped at 320 ms', () => {
    expect([0, 1, 2, 8, 20].map(chainDelayMs)).toEqual([0, 40, 80, 320, 320])
  })

  it('orders hits by IndexInChain and drops one heart per hit on that schedule', () => {
    // 事件到达顺序与链内顺序相反：第 3 颗先到。
    const ev = [boom(101, 2, 7, 0), boom(102, 3, 7, 1), boom(103, 2, 7, 2), dmg(103, 2, 7, 4), dmg(101, 2, 7, 2), dmg(102, 3, 7, 0)]
    const hits = staggerLocalHits(ev, ME, 6, 2)
    expect(hits.map((h) => [h.bomb, h.delayMs, h.hpAfter])).toEqual([
      [101, 0, 4],
      [102, 40, 2],
      [103, 80, 0],
    ])
  })

  it('falls back to arrival order within the chain when IndexInChain is absent', () => {
    const hits = staggerLocalHits([dmg(5, 2, 9, 4), dmg(6, 2, 9, 2)], ME, 6, 2)
    expect(hits.map((h) => [h.delayMs, h.points, h.hpAfter])).toEqual([
      [0, 2, 4],
      [40, 2, 2],
    ])
  })

  it('HeartTrack shows each step at its time and returns to the snapshot afterwards', () => {
    const hits = staggerLocalHits([dmg(1, 2, 9, 4), dmg(2, 2, 9, 2), dmg(3, 2, 9, 0)], ME, 6, 2)
    const t = new HeartTrack()
    t.schedule(1000, 6, hits)
    expect(t.displayed(1000, 0)).toBe(4)
    expect(t.displayed(1039, 0)).toBe(4)
    expect(t.displayed(1040, 0)).toBe(2)
    expect(t.pending(1040)).toBe(true)
    expect(t.displayed(1080, 0)).toBe(0)
    expect(t.displayed(2000, 0)).toBe(0)
    expect(t.pending(2000)).toBe(false)
    expect(t.displayed(2000, 6)).toBe(6)
  })

  it('HudBrain emits per-hit schedule and delays the death recap until the last hit + 90 ms', () => {
    const b = new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
    const before = snap({ tick: 9, players: [{ id: ME, hp: 6 }, { id: 2 }, { id: 3 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const m = b.consume(
      batch(10, [boom(1, 2, 7, 0), boom(2, 3, 7, 1), boom(3, 2, 7, 2), dmg(1, 2, 7, 4), dmg(2, 3, 7, 2), dmg(3, 2, 7, 0), died(10, ME, 2, 7)], { before }),
    )
    const hits = m.find((x): x is Extract<HudMoment, { kind: 'hits' }> => x.kind === 'hits')
    expect(hits?.hits.map((h) => h.delayMs)).toEqual([0, 40, 80])
    expect(hits?.hpBefore).toBe(6)
    expect(hits?.hint).toBeNull()
    const death = m.find((x): x is Extract<HudMoment, { kind: 'death' }> => x.kind === 'death')
    expect(death?.delayMs).toBe(170)
  })
})

describe('live damage-source hint (review: no hint of who hit you)', () => {
  const nameOf = (id: number): string => ({ 2: '小黄鸭', 3: '豆豆熊' })[id] ?? `玩家 ${id}`

  it('names the chain owner and the chain length for a survivor of someone else’s chain', () => {
    const hits = staggerLocalHits([dmg(1, 3, 7, 4), dmg(2, 3, 7, 2)], ME, 6, 2)
    expect(hitHintText(hits, () => 4, nameOf, ME, 2)).toBe('被 豆豆熊 的连锁 ×4 命中 −2 心')
  })

  it('single bomb / own bomb / mixed owners / drowning', () => {
    expect(hitHintText(staggerLocalHits([dmg(1, 2, 7, 4)], ME, 6, 2), () => 1, nameOf, ME, 2)).toBe('被 小黄鸭 的炸弹命中 −1 心')
    expect(hitHintText(staggerLocalHits([dmg(1, ME, 7, 4)], ME, 6, 2), () => 1, nameOf, ME, 2)).toBe('被你自己的炸弹命中 −1 心')
    expect(hitHintText(staggerLocalHits([dmg(1, ME, 7, 4), dmg(2, 2, 7, 2)], ME, 6, 2), () => 2, nameOf, ME, 2)).toBe('被 小黄鸭 等人 的连锁 ×2 命中 −2 心')
    const drown = staggerLocalHits([dmg(0, 0, 0, 5, { proto: { Cause: 1, Points: 1 } })], ME, 6, 2)
    expect(hitHintText(drown, () => 0, nameOf, ME, 2)).toBeNull()
  })

  it('HudBrain attaches the hint to a non-lethal hit from a chain the local player does not own', () => {
    const b = new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
    const before = snap({ tick: 9, players: [{ id: ME, hp: 6 }, { id: 2 }, { id: 3 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const m = b.consume(batch(10, [boom(1, 3, 7, 0), boom(2, 3, 7, 1), dmg(1, 3, 7, 4), dmg(2, 3, 7, 2)], { before }))
    const hits = m.find((x): x is Extract<HudMoment, { kind: 'hits' }> => x.kind === 'hits')
    expect(hits?.hint).toBe('被 豆豆熊 的连锁 ×2 命中 −2 心')
  })
})

describe('HudBrain hat readability + final circle moments', () => {
  const newBrain = (): HudBrain => new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
  const hatTexts = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'popup' && (m.tone === 'hat' || m.tone === 'hatloss') ? [m.text] : []))

  it('+1 帽 on each own power-up pickup (not health packs, not others), never for a kill', () => {
    const b = newBrain()
    const before = snap({ tick: 0, players: [{ id: ME, hats: 4 }, { id: 2 }] })
    b.consume(batch(0, [], { snapshot: before }))
    const take = (t: number, picker: number, kind: 0 | 1 | 2 | 3): BomberEvent => ({ type: 'PickupTaken', PickerNetEntityIdRaw: picker, Kind: kind, Tick: t })
    expect(hatTexts(b.consume(batch(3, [take(3, ME, 0)])))).toEqual(['+1 帽'])
    expect(hatTexts(b.consume(batch(4, [take(4, ME, 3)])))).toEqual([])
    expect(hatTexts(b.consume(batch(5, [take(5, 2, 1)])))).toEqual([])
    expect(hatTexts(b.consume(batch(6, [take(6, ME, 2)])))).toEqual(['+1 帽'])
    expect(hatTexts(b.consume(batch(9, [died(9, 2, ME, 4)], { before })))).toEqual([])
  })

  it('掉了 N 个强化（−N 帽） on own death: from proto.HatsLost right away', () => {
    const b = newBrain()
    const before = snap({ tick: 0, players: [{ id: ME, hats: 4 }, { id: 2 }] })
    b.consume(batch(0, [], { snapshot: before }))
    const m = b.consume(batch(9, [died(9, ME, 2, 4, 2)], { before }))
    expect(hatTexts(m)).toEqual(['掉了 2 个强化（−2 帽）'])
    expect(m).toContainEqual({ kind: 'hats-lost', count: 2 })
    const d = m.find((x) => x.kind === 'death')
    expect(d?.kind === 'death' && d.recap.hatsLost).toBe(2)
  })

  it('without proto: resolves from PowerupsDropped one tick later', () => {
    const b = newBrain()
    const before = snap({ tick: 0, players: [{ id: ME, hats: 4 }, { id: 2 }] })
    b.consume(batch(0, [], { snapshot: before }))
    const m = b.consume(batch(9, [died(9, ME, 2, 4)], { before }))
    expect(hatTexts(m)).toEqual([])
    const d = m.find((x) => x.kind === 'death')
    expect(d?.kind === 'death' && d.recap.hatsLost).toBeNull()
    const dropped: BomberEvent = { type: 'PowerupsDropped', presentationOnly: true, VictimNetEntityIdRaw: ME, Kinds: [0, 2, 2], Cell: { X: 1, Y: 1 }, Tick: 10 }
    const m2 = b.consume(batch(10, [dropped]))
    expect(hatTexts(m2)).toEqual(['掉了 3 个强化（−3 帽）'])
    expect(m2).toContainEqual({ kind: 'drops', text: '火力 ×1、速度 ×2' })
  })

  it('without any presentation data: resolves from the HatCount diff, or 0 after the resolve window', () => {
    const b = newBrain()
    const before = snap({ tick: 0, players: [{ id: ME, hats: 5 }, { id: 2, hats: 2 }] })
    b.consume(batch(0, [], { snapshot: before }))
    expect(hatTexts(b.consume(batch(9, [died(9, ME, 2, 4), died(9, 2, ME, 4)], { before, snapshot: snap({ tick: 9, players: [{ id: ME, hats: 5, hp: 0 }, { id: 2, hats: 2, hp: 0 }] }) })))).toEqual([])
    const m = b.consume(batch(10, [], { snapshot: snap({ tick: 10, players: [{ id: ME, hats: 3, hp: 0 }, { id: 2, hats: 2, hp: 0 }] }) }))
    expect(hatTexts(m)).toEqual(['掉了 2 个强化（−2 帽）'])
    expect(b.killFeed.entries().map((e) => e.lost)).toEqual([null, 2])
    b.consume(batch(12, [], { snapshot: snap({ tick: 12, players: [{ id: ME, hats: 3, hp: 0 }, { id: 2, hats: 2, hp: 0 }] }) }))
    expect(b.killFeed.entries().map((e) => e.lost)).toEqual([0, 2])
  })

  it('snapshot fallback for +N 帽 only when the source never sent PickupTaken', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, hats: 0 }] }) }))
    const m = b.consume(batch(1, [], { snapshot: snap({ tick: 1, players: [{ id: ME, hats: 2 }] }) }))
    expect(hatTexts(m)).toEqual(['+2 帽'])
    expect(m.some((x) => x.kind === 'tip' && x.id === TipId.Candy)).toBe(true)
    // 死了帽数变少、复活不变：都不弹
    expect(hatTexts(b.consume(batch(2, [], { snapshot: snap({ tick: 2, players: [{ id: ME, hats: 1, hp: 0 }] }) })))).toEqual([])
    const e = newBrain()
    e.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, hats: 0 }] }) }))
    const take: BomberEvent = { type: 'PickupTaken', PickerNetEntityIdRaw: ME, Kind: 1, Tick: 1 }
    expect(hatTexts(e.consume(batch(1, [take], { snapshot: snap({ tick: 1, players: [{ id: ME, hats: 1 }] }) })))).toEqual(['+1 帽'])
  })

  it('first-play tip 3 completes when the local HatCount first reaches 3', () => {
    const b = newBrain()
    const tip3 = (ms: HudMoment[]): boolean => ms.some((x) => x.kind === 'tip' && x.id === TipId.Hats)
    expect(tip3(b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, hats: 2 }] }) })))).toBe(false)
    expect(tip3(b.consume(batch(1, [], { snapshot: snap({ tick: 1, players: [{ id: ME, hats: 3 }] }) })))).toBe(true)
    expect(tip3(b.consume(batch(2, [], { snapshot: snap({ tick: 2, players: [{ id: ME, hats: 4 }] }) })))).toBe(false)
  })

  it('death recap lists dropped power-ups from PowerupsDropped', async () => {
    const { dropsText } = await import('../hud-brain')
    expect(dropsText([2, 0, 0, 1])).toBe('火力 ×2、炸弹 ×1、速度 ×1')
    expect(dropsText([])).toBe('无')
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(batch(6, [{ type: 'PowerupsDropped', presentationOnly: true, VictimNetEntityIdRaw: ME, Kinds: [0, 2, 2], Cell: { X: 1, Y: 1 }, Tick: 6 }]))
    expect(m).toContainEqual({ kind: 'drops', text: '火力 ×1、速度 ×2' })
  })

  it('final circle: one banner (event or snapshot fallback), eliminated overlay moment, recap marked final', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 2 }, { id: 3 }] }) }))
    const start: BomberEvent = { type: 'FinalCircleStarted', presentationOnly: true, Trigger: 'resource', EndTick: 1900, Tick: 100 }
    const m1 = b.consume(batch(100, [start], { snapshot: snap({ tick: 100, phase: MatchPhase.Endgame, players: [{ id: ME }, { id: 2 }, { id: 3 }] }) }))
    expect(m1.filter((m) => m.kind === 'banner').map((m) => m.kind === 'banner' && [m.tone, m.title, m.sub])).toEqual([['final', '决赛圈！', '不能复活 · 圈外有毒']])
    const m2 = b.consume(batch(150, [died(150, ME, 2, 9)], { snapshot: snap({ tick: 150, phase: MatchPhase.Endgame }) }))
    const d = m2.find((x): x is Extract<HudMoment, { kind: 'death' }> => x.kind === 'death')
    expect(d?.recap.final).toBe(true)
    const m3 = b.consume(batch(151, [{ type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: ME, Rank: 3, Tick: 151 }]))
    expect(m3).toContainEqual({ kind: 'eliminated', rank: 3, total: 3 })

    const fb = newBrain()
    fb.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const f1 = fb.consume(batch(100, [], { snapshot: snap({ tick: 100, phase: MatchPhase.Endgame }) }))
    const f2 = fb.consume(batch(101, [start], { snapshot: snap({ tick: 101, phase: MatchPhase.Endgame }) }))
    expect([...f1, ...f2].filter((m) => m.kind === 'banner')).toHaveLength(1)
  })

  it('settlement rows use the final ranking and carry the MatchEnded tick for the podium timer', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    b.consume(batch(100, [], { snapshot: snap({ tick: 100, phase: MatchPhase.Endgame }) }))
    b.consume(batch(120, [{ type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: 3, Rank: 4, Tick: 120 }]))
    b.consume(batch(130, [{ type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: 4, Rank: 3, Tick: 130 }]))
    const players = [
      { id: ME, hats: 2 },
      { id: 2, hats: 0 },
      { id: 3, hats: 0, eliminated: true },
      { id: 4, hats: 0, eliminated: true },
    ]
    const m = b.consume(batch(200, [{ type: 'MatchEnded', Tick: 200 }], { snapshot: snap({ tick: 200, phase: MatchPhase.Settlement, players }) }))
    const r = m.find((x): x is Extract<HudMoment, { kind: 'settlement' }> => x.kind === 'settlement')
    expect(r?.results.endTick).toBe(200)
    expect(r?.results.finalCircle).toBe(true)
    expect(r?.results.rows.map((x) => [x.id, x.rank, x.status])).toEqual([
      [ME, 1, 'survivor'],
      [2, 2, 'survivor'],
      [4, 3, 'eliminated'],
      [3, 4, 'eliminated'],
    ])
  })
})
