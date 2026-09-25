import { describe, expect, it } from 'vitest'
import { MatchPhase, type BomberEvent, type PlayerDied } from '../../contract'
import { circleHud, circleSubtitle, outsideRing } from '../final-circle'
import { FEED_MAX, feedBase, feedLossText, feedText, KillFeed } from '../kill-feed'
import { podiumEndTick, podiumModel, plateTitle, settlementScene } from '../podium'
import { rankFinal } from '../ranking'
import { ME, player, snap } from './fixtures'

describe('rankFinal (领奖台 / 结算表排名)', () => {
  it('ranks by hats with competition ranks; ties: survivors → later eliminated → id', () => {
    const players = [
      player({ id: ME, hats: 0, eliminated: true }),
      player({ id: 2, hats: 4 }),
      player({ id: 3, hats: 4 }),
      player({ id: 4, hats: 0, eliminated: true }),
      player({ id: 5, hats: 0 }),
      player({ id: 6, hats: 0, eliminated: true }),
    ]
    // Rank 越小 = 出局越晚：6 最后出局（第 3），ME 第 4，4 最早（第 5）
    const elim = new Map([
      [4, 5],
      [ME, 4],
      [6, 3],
    ])
    const rows = rankFinal(players, elim, true, 2, ME)
    expect(rows.map((r) => [r.id, r.rank, r.status])).toEqual([
      [2, 1, 'survivor'],
      [3, 1, 'survivor'],
      [5, 3, 'survivor'],
      [6, 4, 'eliminated'],
      [ME, 5, 'eliminated'],
      [4, 6, 'eliminated'],
    ])
  })

  it('without a final circle nobody is tagged and ties fall back to id', () => {
    const rows = rankFinal([player({ id: 3, hats: 1 }), player({ id: 2, hats: 1 })], new Map(), false, 0, ME)
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [2, null],
      [3, null],
    ])
  })
})

describe('podiumModel', () => {
  const rows = rankFinal(
    [player({ id: ME, hats: 1 }), player({ id: 2, hats: 5 }), player({ id: 3, hats: 3 }), player({ id: 4, hats: 3 }), player({ id: 5, hats: 0 })],
    new Map(),
    true,
    2,
    ME,
  )

  it('puts the first three display rows on first / second / third steps with rank · name · hats', () => {
    const m = podiumModel(rows)
    expect(m.plates.map((p) => [p.step, p.rank, p.name, p.hats, p.isWinner])).toEqual([
      ['first', 1, '小黄鸭', 5, true],
      ['second', 2, '豆豆熊', 3, false],
      ['third', 2, '灰灰猫', 3, false],
    ])
    expect(plateTitle(m.plates[0])).toBe('第 1 名 · 小黄鸭')
  })

  it('tells an off-stage local player his rank out of the total', () => {
    const m = podiumModel(rows)
    expect(m.localOnStage).toBe(false)
    expect(m.localLine).toBe('你的名次：第 4 名 / 共 5 人')
  })

  it('congratulates a local player on the podium', () => {
    const top = rankFinal([player({ id: ME, hats: 5 }), player({ id: 2, hats: 5 }), player({ id: 3, hats: 1 })], new Map(), true, 2, ME)
    const m = podiumModel(top)
    expect(m.localOnStage).toBe(true)
    expect(m.localLine).toBe('你拿到了第 1 名！')
    expect(plateTitle(m.plates.find((p) => p.isLocal)!)).toBe('第 1 名 · 你')
    expect(m.plates.filter((p) => p.isWinner)).toHaveLength(2)
  })

  it('no 本局帽王 when nobody has a hat; an eliminated 0-hat player ranks below 0-hat survivors, survivor ties say 并列', () => {
    const zero = rankFinal([player({ id: 2 }), player({ id: 3 }), player({ id: 4 }), player({ id: ME, eliminated: true })], new Map([[ME, 4]]), true, 0, ME)
    const m = podiumModel(zero)
    expect(m.plates.some((p) => p.isWinner)).toBe(false)
    expect(m.localLine).toBe('你的名次：第 4 名 / 共 4 人')
    const tied = podiumModel(
      rankFinal([player({ id: 2, hats: 2 }), player({ id: 3, hats: 1 }), player({ id: 4, hats: 1 }), player({ id: 5 }), player({ id: ME })], new Map(), true, 2, ME),
    )
    expect(tied.localLine).toBe('你的名次：并列第 4 名 / 共 5 人')
  })

  it('shows the podium for rules.podiumMs after MatchEnded, then the results table', () => {
    expect(podiumEndTick(100, 10000, 20)).toBe(300)
    expect(settlementScene(100, 100, 10000, 20)).toBe('podium')
    expect(settlementScene(299.5, 100, 10000, 20)).toBe('podium')
    expect(settlementScene(300, 100, 10000, 20)).toBe('results')
    expect(settlementScene(100, 100, 0, 20)).toBe('results')
    expect(settlementScene(120, 100, 4000, 20)).toBe('podium')
    expect(settlementScene(180, 100, 4000, 20)).toBe('results')
  })
})

describe('circleHud (决赛圈 HUD 状态)', () => {
  const ring = { Min: 3, Max: 15 }
  const fc = (extra: Partial<NonNullable<ReturnType<typeof snap>['match']['finalCircle']>> = {}) => ({
    trigger: 'time' as const,
    startTick: 100,
    endTick: 1900,
    ring,
    nextRing: null,
    nextRingTick: 0,
    stageIndex: 0,
    aliveCount: 5,
    ...extra,
  })

  it('shows a resource meter before the final circle with the 20% threshold marker', () => {
    const h = circleHud(snap({ tick: 10, resourceInitial: 200, resourceRemaining: 86 }), ME, 10, 200)
    expect(h.finalCircle).toBe(false)
    expect(h.resourcePct).toBe(43)
    expect(h.thresholdPct).toBe(20)
    expect(circleSubtitle(h)).toBeNull()
  })

  it('in the final circle: tag, alive N/M, shrink countdown, no resource meter', () => {
    const s = snap({
      tick: 200,
      phase: MatchPhase.Endgame,
      resourceInitial: 200,
      resourceRemaining: 10,
      players: [{ id: ME, x: 9.5, z: 9.5 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6, eliminated: true }, { id: 7, eliminated: true }, { id: 8, eliminated: true }],
      finalCircle: fc({ nextRing: { Min: 5, Max: 13 }, nextRingTick: 360 }),
    })
    const h = circleHud(s, ME, 200.5, 200)
    expect(h.finalCircle).toBe(true)
    expect(h.resourcePct).toBeNull()
    expect([h.alive, h.total]).toEqual([5, 8])
    expect(h.shrinkInSec).toBeCloseTo(7.975)
    expect(circleSubtitle(h)).toBe('存活 5/8 · 缩圈 0:08')
    expect(h.outside).toBe(false)
  })

  it('flags the local player outside the ring, but not when dead or eliminated', () => {
    const base = { tick: 200, phase: MatchPhase.Endgame, finalCircle: fc() }
    expect(circleHud(snap({ ...base, players: [{ id: ME, x: 1.5, z: 9.5 }] }), ME, 200, 200).outside).toBe(true)
    expect(circleHud(snap({ ...base, players: [{ id: ME, x: 1.5, z: 9.5, hp: 0 }] }), ME, 200, 200).outside).toBe(false)
    const out = circleHud(snap({ ...base, players: [{ id: ME, x: 1.5, z: 9.5, hp: 0, eliminated: true }] }), ME, 200, 200)
    expect(out.outside).toBe(false)
    expect(out.localEliminated).toBe(true)
    expect(outsideRing({ X: 15, Y: 3 }, ring)).toBe(false)
    expect(outsideRing({ X: 16, Y: 3 }, ring)).toBe(true)
  })
})

describe('KillFeed', () => {
  const died = (tick: number, victim: number, killer: number, cause: 0 | 1 | 3 = 0): PlayerDied => ({
    type: 'PlayerDied',
    VictimNetEntityIdRaw: victim,
    KillerNetEntityIdRaw: killer,
    ChainId: 1,
    Cause: cause,
    Cell: { X: 1, Y: 1 },
    Tick: tick,
  })
  const names: Record<number, string> = { 2: '豆豆熊', 3: '灰灰猫', 4: '小黄鸭', 5: '旺财' }
  const nameOf = (id: number): string => names[id] ?? `玩家 ${id}`

  it('keeps the last 4 kills newest first; no hat reward for the kill itself', () => {
    const f = new KillFeed(ME)
    f.onDied(died(1, 3, 2), nameOf)
    f.onDied(died(2, 4, 4), nameOf)
    f.onDied(died(3, 5, 5, 1), nameOf)
    f.onDied(died(4, 2, 2, 3), nameOf)
    f.onDied(died(5, ME, 3), nameOf)
    const e = f.entries()
    expect(e).toHaveLength(FEED_MAX)
    expect(e.map((x) => [feedText(x), x.lost])).toEqual([
      ['灰灰猫 炸飞了 你', null],
      ['豆豆熊 中毒倒下', null],
      ['旺财 溺水了', null],
      ['小黄鸭 被自己炸飞了', null],
    ])
    expect(e[0].involvesLocal).toBe(true)
  })

  it('appends 「B 掉了 N 个强化」 once the loss is known, and nothing for 0', () => {
    const f = new KillFeed(ME)
    f.onDied(died(1, 3, 2), nameOf)
    f.onDied(died(2, 4, 4), nameOf)
    const v = f.version
    f.setLost(3, 1, 2)
    f.setLost(4, 2, 1)
    expect(f.version).toBe(v + 2)
    expect(f.entries().map(feedText)).toEqual(['小黄鸭 被自己炸飞了 · 掉了 1 个强化', '豆豆熊 炸飞了 灰灰猫 · 灰灰猫 掉了 2 个强化'])
    expect(feedBase(f.entries()[1])).toBe('豆豆熊 炸飞了 灰灰猫')
    expect(feedLossText(f.entries()[1])).toBe('灰灰猫 掉了 2 个强化')
    f.setLost(3, 1, 2)
    expect(f.version).toBe(v + 2)
    f.onDied(died(3, 5, 2), nameOf)
    f.setLost(5, 3, 0)
    expect(feedText(f.entries()[0])).toBe('豆豆熊 炸飞了 旺财')
    f.setLost(5, 99, 4)
    expect(f.entries()[0].lost).toBe(0)
  })

  it('tags the victim entry 出局 when PlayerEliminated arrives and bumps the version', () => {
    const f = new KillFeed(ME)
    f.onDied(died(1, 3, 2), nameOf)
    const v = f.version
    f.onEliminated(3)
    expect(f.entries()[0].eliminated).toBe(true)
    expect(f.version).toBe(v + 1)
    f.onEliminated(9)
    expect(f.version).toBe(v + 1)
  })

  it('is fed by HudBrain from PlayerDied / PlayerEliminated', async () => {
    const { HudBrain } = await import('../hud-brain')
    const { batch } = await import('./fixtures')
    const b = new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 2 }, { id: 3 }] }) }))
    const ev: BomberEvent[] = [died(5, 3, 2)]
    b.consume(batch(5, ev))
    b.consume(batch(6, [{ type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: 3, Rank: 3, Tick: 6 }]))
    expect(b.killFeed.entries().map((x) => [feedText(x), x.eliminated])).toEqual([['小黄鸭 炸飞了 豆豆熊', true]])
    b.consume(batch(6, [{ type: 'PowerupsDropped', presentationOnly: true, VictimNetEntityIdRaw: 3, Kinds: [0, 1, 2], Cell: { X: 1, Y: 1 }, Tick: 6 }]))
    expect(b.killFeed.entries().map(feedText)).toEqual(['小黄鸭 炸飞了 豆豆熊 · 豆豆熊 掉了 3 个强化'])
  })
})
