import { describe, expect, it } from 'vitest'
import { BlockType, MatchPhase, type BomberEvent } from '../../contract'
import { HudBrain, multiKillLabel, type HudMoment } from '../hud-brain'
import type { DerivedBrick } from '../timeline'
import { TipId } from '../tips'
import { batch, died, exploded, ME, snap } from './fixtures'

const newBrain = (): HudBrain => new HudBrain({ localId: ME, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
/** 爽感弹字（不含帽子流向的 +N / −N 帽）。 */
const popups = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'popup' && m.tone !== 'hat' && m.tone !== 'hatloss' ? [m.text] : []))
const hatPopups = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'popup' && (m.tone === 'hat' || m.tone === 'hatloss') ? [m.text] : []))
const banners = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'banner' ? [m.title] : []))

describe('multiKillLabel', () => {
  it('maps kill counts per chain to 双杀 / 三杀 / 一锅端', () => {
    expect(multiKillLabel(1)).toBeNull()
    expect(multiKillLabel(2)).toBe('双杀')
    expect(multiKillLabel(3)).toBe('三杀')
    expect(multiKillLabel(4)).toBe('一锅端')
    expect(multiKillLabel(7)).toBe('一锅端')
  })
})

describe('HudBrain popups', () => {
  it('counts multi-kills per ChainId, upgrading the same popup across ticks', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    expect(popups(b.consume(batch(5, [died(5, 2, ME, 77)])))).toEqual([])
    expect(popups(b.consume(batch(5, [died(5, 3, ME, 77)])))).toEqual(['双杀'])
    const m = b.consume(batch(6, [died(6, 4, ME, 77), died(6, 5, ME, 77)]))
    expect(popups(m)).toEqual(['一锅端'])
    const p = m.find((x) => x.kind === 'popup')
    expect(p && p.kind === 'popup' && p.key).toBe('kill:77')
  })

  it('does not merge kills from different chains, and ignores suicides and kills by others', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(batch(5, [died(5, 2, ME, 1), died(5, 3, ME, 2), died(5, ME, ME, 3), died(5, 4, 6, 1)]))
    expect(popups(m)).toEqual([])
    expect(b.stats.stats.kills).toBe(2)
    expect(b.stats.stats.killsById.get(6)).toBe(1)
  })

  it('shows ×N 连锁 only for chains of ≥ 3 that include a local bomb', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    expect(popups(b.consume(batch(3, [exploded(3, 10, 2), exploded(3, 10, 3), exploded(3, 10, 4)])))).toEqual([])
    expect(popups(b.consume(batch(4, [exploded(4, 11, ME), exploded(4, 11, 2)])))).toEqual([])
    expect(popups(b.consume(batch(5, [exploded(5, 12, 2), exploded(5, 12, ME), exploded(5, 12, 3), exploded(5, 12, 4)])))).toEqual(['×4 连锁'])
    expect(b.stats.stats.bestChain).toBe(4)
  })

  it('shows 拆迁 ×N from terrain-derived bricks when no BrickDestroyed events exist', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const bricks: DerivedBrick[] = Array.from({ length: 12 }, (_, i) => ({ Cell: { X: i, Y: 0 }, Block: BlockType.积木, OwnerNetEntityIdRaw: ME, ChainId: 20, Tick: 3 }))
    const m = b.consume({ ...batch(3, [exploded(3, 20, ME)]), derivedBricks: bricks })
    expect(popups(m)).toEqual(['拆迁 ×12'])
    expect(b.stats.stats.bricksDestroyed).toBe(12)
    expect(m.some((x) => x.kind === 'tip' && x.id === TipId.Brick)).toBe(true)
  })

  it('prefers BrickDestroyed events and does not double count derived bricks for the same tick', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const ev: BomberEvent[] = [
      exploded(3, 20, ME),
      { type: 'BrickDestroyed', presentationOnly: true, Cell: { X: 1, Y: 0 }, Block: BlockType.积木, ChainId: 20, OwnerNetEntityIdRaw: ME, Tick: 3 },
    ]
    const derived: DerivedBrick[] = [{ Cell: { X: 1, Y: 0 }, Block: BlockType.积木, OwnerNetEntityIdRaw: ME, ChainId: 20, Tick: 3 }]
    b.consume({ ...batch(3, ev), derivedBricks: derived })
    expect(b.stats.stats.bricksDestroyed).toBe(1)
    expect(b.ledger.bricks(20)).toBe(1)
  })

  it('收割 fires when ≥ 5 power-ups (= hats) are eaten with gaps ≤ 1.5 s, not across a longer gap, not for health packs', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const pick = (t: number, n: number, kind: 0 | 3 = 0): BomberEvent[] =>
      Array.from({ length: n }, () => ({ type: 'PickupTaken', PickerNetEntityIdRaw: ME, Kind: kind, Tick: t }))
    expect(popups(b.consume(batch(10, pick(10, 2))))).toEqual([])
    expect(popups(b.consume(batch(50, pick(50, 2))))).toEqual([]) // 间隔 40 tick = 2 s，重新起算
    expect(popups(b.consume(batch(55, pick(55, 3, 3))))).toEqual([]) // 血包不是强化
    expect(popups(b.consume(batch(60, pick(60, 3))))).toEqual(['收割 ×5'])
    expect(popups(b.consume(batch(70, pick(70, 1))))).toEqual(['收割 ×6'])
  })

  it('逆袭 when a 0-hat local player kills the king and becomes king', () => {
    const b = newBrain()
    const before = snap({ tick: 9, king: 2, players: [{ id: ME, hats: 0 }, { id: 2, hats: 4 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const after = snap({ tick: 10, king: ME, players: [{ id: ME, hats: 1 }, { id: 2, hats: 0 }] })
    const m = b.consume(batch(10, [died(10, 2, ME, 5)], { snapshot: after, before }))
    expect(popups(m)).toContain('逆袭！')
  })

  it('no 逆袭 when the killer already had hats', () => {
    const b = newBrain()
    const before = snap({ tick: 9, king: 2, players: [{ id: ME, hats: 1 }, { id: 2, hats: 4 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const after = snap({ tick: 10, king: ME, players: [{ id: ME, hats: 2 }, { id: 2, hats: 0 }] })
    expect(popups(b.consume(batch(10, [died(10, 2, ME, 5)], { snapshot: after, before })))).not.toContain('逆袭！')
  })
})

describe('HudBrain banners (加冕 / 倒台 only)', () => {
  it('crowns only when the king holds ≥ N hats, once per reign, and again when the threshold is crossed later', () => {
    const b = newBrain()
    expect(banners(b.consume(batch(0, [], { snapshot: snap({ tick: 0, king: 2, players: [{ id: ME }, { id: 2, hats: 2 }] }) })))).toEqual([])
    expect(banners(b.consume(batch(1, [], { snapshot: snap({ tick: 1, king: 2, players: [{ id: ME }, { id: 2, hats: 3 }] }) })))).toEqual([
      '小黄鸭 成为帽王',
    ])
    expect(banners(b.consume(batch(2, [], { snapshot: snap({ tick: 2, king: 2, players: [{ id: ME }, { id: 2, hats: 4 }] }) })))).toEqual([])
    const mine = b.consume(batch(3, [], { snapshot: snap({ tick: 3, king: ME, players: [{ id: ME, hats: 5 }, { id: 2, hats: 4 }] }) }))
    expect(banners(mine)).toEqual(['你是帽王！'])
  })

  it('倒台 banner 「X 掉了 N 个强化！」 when the king (≥ N hats) dies, N = HatsLost', () => {
    const b = newBrain()
    const before = snap({ tick: 9, king: 2, players: [{ id: ME }, { id: 2, hats: 6 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const m = b.consume(batch(10, [died(10, 2, 3, 5, 3)], { before }))
    expect(banners(m)).toEqual(['小黄鸭 掉了 3 个强化！'])
    const b2 = newBrain()
    const small = snap({ tick: 9, king: 2, players: [{ id: ME }, { id: 2, hats: 2 }] })
    b2.consume(batch(9, [], { snapshot: small }))
    expect(banners(b2.consume(batch(10, [died(10, 2, 3, 5, 2)], { before: small })))).toEqual([])
  })

  it('倒台 without proto waits for PowerupsDropped or the HatCount diff; own fall and 0-drop wording', () => {
    const b = newBrain()
    const before = snap({ tick: 9, king: 2, players: [{ id: ME }, { id: 2, hats: 6 }] })
    b.consume(batch(9, [], { snapshot: before }))
    expect(banners(b.consume(batch(10, [died(10, 2, 3, 5)], { before, snapshot: snap({ tick: 10, players: [{ id: ME }, { id: 2, hats: 6, hp: 0 }] }) })))).toEqual([])
    expect(banners(b.consume(batch(11, [], { snapshot: snap({ tick: 11, players: [{ id: ME }, { id: 2, hats: 2, hp: 0 }] }) })))).toEqual(['小黄鸭 掉了 4 个强化！'])
    const mine = newBrain()
    const b3 = snap({ tick: 9, king: ME, players: [{ id: ME, hats: 4 }, { id: 2 }] })
    mine.consume(batch(9, [], { snapshot: b3 }))
    const m = mine.consume(batch(10, [died(10, ME, 2, 5), { type: 'PowerupsDropped', presentationOnly: true, VictimNetEntityIdRaw: ME, Kinds: [1, 1], Cell: { X: 1, Y: 1 }, Tick: 10 }], { before: b3 }))
    expect(banners(m)).toEqual(['你掉了 2 个强化！'])
    const zero = newBrain()
    zero.consume(batch(9, [], { snapshot: before }))
    expect(banners(zero.consume(batch(10, [died(10, 2, 3, 5, 0)], { before })))).toEqual(['帽王 小黄鸭 倒台了！'])
  })

  it('never uses banners for chains or multi-kills', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(batch(5, [exploded(5, 1, ME), exploded(5, 1, ME), exploded(5, 1, ME), died(5, 2, ME, 1), died(5, 3, ME, 1)]))
    expect(banners(m)).toEqual([])
  })
})

describe('HudBrain death recap', () => {
  it('reports killer, bomb owner, chain length and the last two damage sources (most recent first)', () => {
    const b = newBrain()
    const before = snap({ tick: 9, players: [{ id: ME, hp: 6, hats: 6 }, { id: 2 }, { id: 3 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const dmg = (t: number, owner: number, chain: number, left: number): BomberEvent => ({
      type: 'DamageApplied',
      VictimNetEntityIdRaw: ME,
      SourceBombNetEntityIdRaw: 100 + t,
      SourceBombOwnerNetEntityIdRaw: owner,
      ChainId: chain,
      HealthPointsLeft: left,
      Tick: t,
    })
    b.consume(batch(10, [dmg(10, 2, 30, 4)], { before }))
    b.consume(batch(20, [exploded(20, 31, 3), exploded(20, 31, 3), exploded(20, 31, 2), dmg(20, 3, 31, 2), dmg(20, 2, 31, 0)], { before }))
    const m = b.consume(batch(21, [died(21, ME, 2, 31, 3)], { before }))
    const d = m.find((x) => x.kind === 'death')
    expect(d?.kind).toBe('death')
    if (d?.kind !== 'death') return
    expect(d.recap.cause).toBe('bomb')
    expect(d.recap.killerName).toBe('小黄鸭')
    expect(d.recap.bombOwnerName).toBe('小黄鸭')
    expect(d.recap.chainLength).toBe(3)
    expect(d.recap.hatsLost).toBe(3)
    expect(d.recap.sources.map((s) => [s.label, s.detail])).toEqual([
      ['小黄鸭的炸弹', '−1 心 · ×3 连锁'],
      ['豆豆熊的炸弹', '−1 心 · ×3 连锁'],
    ])
    expect(b.stats.stats.deaths).toBe(1)
  })

  it('labels drowning (Killer == Victim, Cause 1) without a bomb owner', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const drown: BomberEvent = {
      type: 'DamageApplied',
      VictimNetEntityIdRaw: ME,
      SourceBombNetEntityIdRaw: 0,
      SourceBombOwnerNetEntityIdRaw: 0,
      ChainId: 0,
      HealthPointsLeft: 0,
      Tick: 5,
    }
    b.consume(batch(5, [drown]))
    const m = b.consume(batch(6, [{ ...(died(6, ME, ME, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>), Cause: 1 }]))
    const d = m.find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect(d.recap.cause).toBe('drown')
    expect(d.recap.bombOwnerName).toBeNull()
    expect(d.recap.bombKindName).toBeNull()
    expect(d.recap.sources[0].label).toBe('溺水')
    expect(b.stats.stats.kills).toBe(0)
  })
})

describe('HudBrain stats + match lifecycle', () => {
  it('tracks bombs placed, pickups, max hats and hat-king time; resets when matchIndex changes', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const placed: BomberEvent = { type: 'BombPlaced', OwnerNetEntityIdRaw: ME, Cell: { X: 1, Y: 1 }, FuseEndTick: 42, Tick: 1 }
    const candy: BomberEvent = { type: 'PickupTaken', PickerNetEntityIdRaw: ME, Kind: 0, Tick: 1 }
    const m = b.consume(batch(1, [placed, candy], { snapshot: snap({ tick: 1, king: ME, players: [{ id: ME, hats: 4 }] }) }))
    expect(m.some((x) => x.kind === 'pickup' && x.text === '+1 火力')).toBe(true)
    expect(m.some((x) => x.kind === 'tip' && x.id === TipId.Candy)).toBe(true)
    b.consume(batch(21, [], { snapshot: snap({ tick: 21, king: ME, players: [{ id: ME, hats: 2 }] }) }))
    const s = b.stats.stats
    expect([s.bombsPlaced, s.pickups, s.maxHats, s.hatKingTicks]).toEqual([1, 1, 4, 21])
    const reset = b.consume(batch(30, [], { snapshot: snap({ tick: 30, matchIndex: 2, phase: MatchPhase.Warmup }) }))
    expect(reset.some((x) => x.kind === 'match-reset' && x.matchIndex === 2)).toBe(true)
    expect(b.stats.stats.bombsPlaced).toBe(0)
    expect(b.stats.stats.maxHats).toBe(0)
  })

  it('emits settlement results once with rank and percent beaten', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const players = [{ id: ME, hats: 3 }, { id: 2, hats: 5 }, { id: 3, hats: 1 }, { id: 4, hats: 0 }, { id: 5, hats: 3 }]
    const s1 = snap({ tick: 10, phase: MatchPhase.Settlement, king: 2, players })
    const m = b.consume(batch(10, [{ type: 'MatchEnded', Tick: 10 }], { snapshot: s1 }))
    const r = m.find((x) => x.kind === 'settlement')
    if (r?.kind !== 'settlement') throw new Error('no settlement')
    expect(r.results.localRank).toBe(2)
    expect(r.results.percentBeaten).toBe(50)
    expect(b.consume(batch(11, [], { snapshot: snap({ tick: 11, phase: MatchPhase.Settlement, king: 2, players }) })).some((x) => x.kind === 'settlement')).toBe(
      false,
    )
  })
})
