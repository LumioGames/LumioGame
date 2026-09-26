import { describe, expect, it } from 'vitest'
import { BlockType, MatchPhase, type BomberEvent, type PlayerSkillsView } from '../../contract'
import { HudBrain, multiKillLabel, type HudMoment } from '../hud-brain'
import { feedText } from '../kill-feed'
import type { DerivedBrick } from '../timeline'
import { TipId } from '../tips'
import { batch, died, exploded, held, ME, pickup, skillsView, snap } from './fixtures'

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

  it('records the local character and every skill / evolution of the match, even after they were dropped (results table)', () => {
    const b = newBrain()
    const cat = (slots: PlayerSkillsView['slots']) => skillsView({ character: 'cat', slots })
    const s0 = cat({ bomb: null, active: held('blink', 1, true), passive: null })
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, skills: s0 }, { id: 2 }] }) }))
    const gain = (skill: 'fireAura' | 'pierceBomb', tick: number): BomberEvent => ({
      type: 'SkillGained',
      presentationOnly: true,
      PlayerNetEntityIdRaw: ME,
      Skill: skill,
      Slot: skill === 'fireAura' ? 'active' : 'bomb',
      Level: 1,
      How: 'equip',
      Tick: tick,
    })
    const other: BomberEvent = { ...(gain('pierceBomb', 3) as Extract<BomberEvent, { type: 'SkillGained' }>), PlayerNetEntityIdRaw: 2 }
    b.consume(batch(3, [other, gain('pierceBomb', 3)]))
    const evo: BomberEvent = {
      type: 'SkillEvolved',
      presentationOnly: true,
      PlayerNetEntityIdRaw: ME,
      From: ['blink', 'fireAura'],
      Combo: 'fireDash',
      Slot: 'active',
      FreedSlot: null,
      Tick: 5,
    }
    b.consume(batch(5, [gain('fireAura', 5), evo]))
    // 决赛圈出局掉光技能：快照只剩空槽，记录不丢。
    b.consume(batch(9, [], { snapshot: snap({ tick: 9, players: [{ id: ME, skills: cat({ bomb: null, active: null, passive: null }) }, { id: 2 }] }) }))
    const s = b.stats.snapshot()
    expect(s.character).toBe('cat')
    expect(s.skills).toEqual(['blink', 'pierceBomb', 'fireAura', 'fireDash'])
  })

  it('without skill events the character and skills come from snapshot slots', () => {
    const b = newBrain()
    const sk = skillsView({ character: 'duck', slots: { bomb: held('freezeBomb'), active: held('bubble', 1, true), passive: null } })
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, skills: sk }] }) }))
    expect(b.stats.stats.character).toBe('duck')
    expect([...b.stats.stats.skills].sort()).toEqual(['bubble', 'freezeBomb'])
    b.consume(batch(30, [], { snapshot: snap({ tick: 30, matchIndex: 2, phase: MatchPhase.Warmup }) }))
    expect(b.stats.stats.character).toBeNull()
    expect(b.stats.stats.skills).toEqual([])
  })

  it('live ranking falls back to recorded elimination ticks when snapshots lack eliminatedTick (review #13)', () => {
    const b = newBrain()
    const at = (tick: number, out: number[]) =>
      snap({ tick, phase: MatchPhase.Endgame, players: [1, 2, 3, 4].map((id) => ({ id, eliminated: out.includes(id) })) })
    b.consume(batch(100, [], { snapshot: at(100, []) }))
    b.consume(batch(110, [], { snapshot: at(110, [3]) }))
    b.consume(batch(120, [], { snapshot: at(120, [3, 4]) }))
    const s = at(130, [3, 4, 2])
    b.consume(batch(130, [], { snapshot: s }))
    expect(s.Players.every((p) => p.eliminatedTick === undefined)).toBe(true)
    expect([b.eliminationTick(3), b.eliminationTick(4), b.eliminationTick(2)]).toEqual([110, 120, 130])
    // 出局越晚名次越前：2（130）> 4（120）> 3（110），不再全部并列、按 id 排。
    expect(b.liveRanking(s).map((r) => [r.id, r.rank])).toEqual([
      [1, 1],
      [2, 2],
      [4, 3],
      [3, 4],
    ])
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
    expect(r.results.reason).toBe('timeUp')
    expect(r.results.winnerId).toBe(2)
    expect(b.consume(batch(11, [], { snapshot: snap({ tick: 11, phase: MatchPhase.Settlement, king: 2, players }) })).some((x) => x.kind === 'settlement')).toBe(
      false,
    )
  })
})

describe('HudBrain round 4 (skills, burn, survivor ranking)', () => {
  const texts = (ms: HudMoment[], kind: HudMoment['kind']): string[] =>
    ms.flatMap((m) => (m.kind === kind && 'text' in m ? [m.text] : m.kind === kind && 'title' in m ? [m.title] : []))

  it('a SkillCandy PickupTaken gives no hat popup but still completes the Candy tip', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(batch(5, [{ type: 'PickupTaken', PickerNetEntityIdRaw: ME, Kind: 4, Tick: 5, proto: { PickupNetEntityIdRaw: 9, Cell: { X: 1, Y: 1 }, Skill: 'kick', SkillLevel: 1 } }]))
    expect(hatPopups(m)).toEqual([])
    expect(m.some((x) => x.kind === 'tip' && x.id === TipId.Candy)).toBe(true)
    expect(texts(m, 'pickup')).toEqual(['+ 踢弹'])
  })

  it('SkillGained level-up flash; my SkillEvolved → evolve banner, someone else → none', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const g = b.consume(batch(5, [{ type: 'SkillGained', presentationOnly: true, PlayerNetEntityIdRaw: ME, Skill: 'blink', Slot: 'active', Level: 2, How: 'levelUp', Tick: 5 }]))
    expect(texts(g, 'pickup')).toEqual(['闪现 升到 Lv2'])
    const evo = (who: number): HudMoment[] =>
      b.consume(batch(6, [{ type: 'SkillEvolved', presentationOnly: true, PlayerNetEntityIdRaw: who, From: ['blink', 'fireAura'], Combo: 'fireDash', Slot: 'active', FreedSlot: null, Tick: 6 }]))
    const mine = evo(ME).find((x) => x.kind === 'banner')
    expect(mine).toMatchObject({ kind: 'banner', tone: 'evolve', mine: true, title: '进化：火焰冲刺！', sub: '闪现 + 火焰光环' })
    expect(banners(evo(2))).toEqual([])
  })

  it('SkillFailed cooldown notice carries the seconds left from the snapshot', () => {
    const b = newBrain()
    const sk = skillsView({ character: 'cat', slots: { bomb: null, active: held('blink', 1, true), passive: null }, cdFromTick: 0, cdUntilTick: 70 })
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, skills: sk }] }) }))
    const m = b.consume(batch(10, [{ type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: ME, Skill: 'blink', Reason: 'cooldown', Tick: 10 }]))
    expect(texts(m, 'notice')).toEqual(['闪现 冷却中 · 3.0 秒'])
  })

  it('without skill events, snapshot diffs produce gain and evolve moments', () => {
    const b = newBrain()
    const s0 = skillsView({ character: 'cat', slots: { bomb: null, active: held('blink', 1, true), passive: null } })
    const s1 = skillsView({ character: 'cat', slots: { bomb: held('pierceBomb'), active: held('blink', 1, true), passive: null } })
    const s2 = skillsView({ character: 'cat', slots: { bomb: held('pierceBomb'), active: held('fireDash', 1, true), passive: null } })
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, skills: s0 }] }) }))
    expect(texts(b.consume(batch(1, [], { snapshot: snap({ tick: 1, players: [{ id: ME, skills: s1 }] }) })), 'pickup')).toEqual(['获得 穿透弹 Lv1'])
    expect(banners(b.consume(batch(2, [], { snapshot: snap({ tick: 2, players: [{ id: ME, skills: s2 }] }) })))).toEqual(['进化：火焰冲刺！'])
  })

  it('standing on a candy that cannot be picked up explains why, once', () => {
    const b = newBrain()
    const sk = skillsView({ character: 'cat', slots: { bomb: null, active: held('blink', 1, true), passive: null } })
    const s = (t: number) => snap({ tick: t, players: [{ id: ME, skills: sk, x: 3.5, z: 3.5 }], pickups: [pickup(40, 3, 3, 4, { id: 'bubble', level: 1 })] })
    expect(texts(b.consume(batch(0, [], { snapshot: s(0) })), 'notice')).toEqual([])
    expect(texts(b.consume(batch(1, [], { snapshot: s(1) })), 'notice')).toEqual(['主动已有 闪现，捡不了 泡泡'])
    expect(texts(b.consume(batch(2, [], { snapshot: s(2) })), 'notice')).toEqual([])
  })

  it('burn death by 火焰熊: kill feed, recap killer and headline with the fire source', () => {
    const b = newBrain()
    const before = snap({
      tick: 9,
      players: [{ id: ME, hp: 2 }, { id: 3 }],
      fireZones: [{ owner: 3, source: 'aura', cells: [{ X: 1, Y: 1 }], untilTick: 80 }],
    })
    b.consume(batch(9, [], { snapshot: before }))
    const burn: BomberEvent = {
      type: 'DamageApplied',
      VictimNetEntityIdRaw: ME,
      SourceBombNetEntityIdRaw: 0,
      SourceBombOwnerNetEntityIdRaw: 3,
      ChainId: 0,
      HealthPointsLeft: 0,
      Tick: 10,
      proto: { Cause: 2, Points: 2 },
    }
    const dead: BomberEvent = { ...(died(10, ME, 3, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>), Cause: 2 }
    const m = b.consume(batch(10, [burn, dead], { before }))
    const d = m.find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect(d.recap.killerName).toBe('豆豆熊')
    expect(d.recap.headline).toBe('被 豆豆熊 的火焰光环烧倒了')
    expect(d.recap.burnSource).toBe('aura')
    expect(d.recap.sources[0].label).toBe('豆豆熊的火')
    expect(feedText(b.killFeed.entries()[0])).toBe('豆豆熊 烧倒了 你')
  })

  it('burn death on the cast tick: the zone only exists in the end-of-tick snapshot, recap still names the skill', () => {
    const b = newBrain()
    const before = snap({ tick: 9, players: [{ id: ME, hp: 2 }, { id: 3 }] })
    b.consume(batch(9, [], { snapshot: before }))
    const after = snap({
      tick: 10,
      players: [{ id: ME, hp: 0 }, { id: 3 }],
      fireZones: [{ owner: 3, source: 'firewall', cells: [{ X: 1, Y: 1 }], untilTick: 50 }],
    })
    const dead: BomberEvent = { ...(died(10, ME, 3, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>), Cause: 2 }
    const d = b.consume(batch(10, [dead], { snapshot: after, before })).find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect(d.recap.headline).toBe('被 豆豆熊 的火墙烧倒了')
    expect(d.recap.burnSource).toBe('firewall')
  })

  it('burn death where the bear died the same tick: falls back to the previous snapshot zone', () => {
    const b = newBrain()
    const before = snap({
      tick: 9,
      players: [{ id: ME, hp: 2 }, { id: 3 }],
      fireZones: [{ owner: 3, source: 'aura', cells: [{ X: 1, Y: 1 }], untilTick: 80 }],
    })
    b.consume(batch(9, [], { snapshot: before }))
    const dead: BomberEvent = { ...(died(10, ME, 3, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>), Cause: 2 }
    const after = snap({ tick: 10, players: [{ id: ME, hp: 0 }, { id: 3, hp: 0 }] })
    const d = b.consume(batch(10, [dead], { snapshot: after, before })).find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect(d.recap.headline).toBe('被 豆豆熊 的火焰光环烧倒了')
    expect(d.recap.burnSource).toBe('aura')
  })

  it('burn hit while alive shows the owner hint', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 3 }] }) }))
    const m = b.consume(
      batch(5, [
        { type: 'DamageApplied', VictimNetEntityIdRaw: ME, SourceBombNetEntityIdRaw: 0, SourceBombOwnerNetEntityIdRaw: 3, ChainId: 0, HealthPointsLeft: 4, Tick: 5, proto: { Cause: 2, Points: 2 } },
      ]),
    )
    const h = m.find((x) => x.kind === 'hits')
    expect(h?.kind === 'hits' && h.hint).toBe('被 豆豆熊 的火烧到 −1 心')
  })

  it('names refresh after a new match with new roster metadata', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 2 }] }) }))
    const s = snap({ tick: 10, matchIndex: 2, players: [{ id: ME }, { id: 2 }] })
    s.Players[1].meta = { ...s.Players[1].meta, name: '雷雷猫', animal: 'cat' }
    b.consume(batch(10, [{ type: 'MatchStarted', presentationOnly: true, MatchIndex: 2, Tick: 10 }], { snapshot: s }))
    b.consume(batch(11, [died(11, 2, 2, 0)]))
    expect(b.killFeed.entries().map((e) => e.victimName)).toEqual(['雷雷猫'])
  })

  it('settlement with match.results: a 0-hat survivor is rank 1 and the winner', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const s = snap({
      tick: 50,
      phase: MatchPhase.Settlement,
      players: [{ id: ME, hats: 4, eliminated: true, eliminatedTick: 40 }, { id: 2, hats: 0 }],
      results: {
        reason: 'lastSurvivor',
        winner: 2,
        rows: [
          { id: 2, rank: 1, place: 1, survived: true, hats: 0, eliminatedTick: 0 },
          { id: ME, rank: 2, place: 2, survived: false, hats: 4, eliminatedTick: 40 },
        ],
      },
    })
    const r = b.consume(batch(50, [{ type: 'MatchEnded', Tick: 50 }], { snapshot: s })).find((x) => x.kind === 'settlement')
    if (r?.kind !== 'settlement') throw new Error('no settlement')
    expect([r.results.reason, r.results.winnerId, r.results.localRank, r.results.rows[0].id]).toEqual(['lastSurvivor', 2, 2, 2])
    expect(r.results.percentBeaten).toBe(0)
  })

  it('1×1 ring notice', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(batch(5, [{ type: 'RingShrinkAnnounced', presentationOnly: true, StageIndex: 5, Next: { Min: 9, Max: 9 }, AtTick: 205, Tick: 5 }]))
    expect(texts(m, 'notice')).toEqual(['10 秒后只剩正中 1 格 · 快进去！'])
  })

  it('SkillsDropped → skills-lost; PlayerHealed → heal; PlayerFrozen → notice', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(
      batch(5, [
        { type: 'SkillsDropped', presentationOnly: true, VictimNetEntityIdRaw: ME, Skills: [{ Skill: 'kick', Level: 1 }], Devolved: null, Cell: { X: 1, Y: 1 }, Tick: 5 },
        { type: 'PlayerHealed', presentationOnly: true, NetEntityIdRaw: ME, Points: 2, HealthPointsLeft: 6, Source: 'regen', Tick: 5 },
        { type: 'PlayerFrozen', presentationOnly: true, VictimNetEntityIdRaw: ME, SourceBombNetEntityIdRaw: 7, SourceBombOwnerNetEntityIdRaw: 2, UntilTick: 21, Tick: 5 },
      ]),
    )
    expect(texts(m, 'skills-lost')).toEqual(['踢弹 Lv1'])
    expect(m.some((x) => x.kind === 'heal' && x.points === 2)).toBe(true)
    expect(texts(m, 'notice')).toEqual(['被冻住了！'])
  })
})

describe('HudBrain ADR 0033 中毒弹 / 麻痹弹 (原型扩展 NON-CONTRACT)', () => {
  const notices = (ms: HudMoment[]): string[] => ms.flatMap((m) => (m.kind === 'notice' ? [m.text] : []))
  const poisoned = (victim: number, owner: number, tick: number, until: number): BomberEvent => ({
    type: 'PlayerPoisoned',
    presentationOnly: true,
    VictimNetEntityIdRaw: victim,
    SourceBombNetEntityIdRaw: 44,
    SourceBombOwnerNetEntityIdRaw: owner,
    UntilTick: until,
    Tick: tick,
  })
  const toxinTick = (tick: number, owner: number, left: number): BomberEvent => ({
    type: 'DamageApplied',
    VictimNetEntityIdRaw: ME,
    SourceBombNetEntityIdRaw: 44,
    SourceBombOwnerNetEntityIdRaw: owner,
    ChainId: 0,
    HealthPointsLeft: left,
    Tick: tick,
    proto: { Cause: 4, Points: 1 },
  })
  const toxinDeath = (tick: number, killer: number): BomberEvent => ({
    ...(died(tick, ME, killer, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>),
    Cause: 4,
    proto: { HatsLost: 0, SourceBombNetEntityIdRaw: 44 },
  })

  it('poisoned / shocked / cured notices only for the local player, with the thrower and seconds', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 3 }] }) }))
    const m = b.consume(
      batch(5, [
        poisoned(ME, 3, 5, 66),
        poisoned(3, ME, 5, 66),
        { type: 'PlayerShocked', presentationOnly: true, VictimNetEntityIdRaw: ME, SourceBombNetEntityIdRaw: 45, SourceBombOwnerNetEntityIdRaw: ME, UntilTick: 46, Tick: 5 },
      ]),
    )
    expect(notices(m)).toEqual(['中了 豆豆熊 的中毒弹！掉血 3 秒 · 吃血包或放泡泡能解毒', '中了自己的麻痹弹！走得很慢 2 秒'])
    const c = b.consume(batch(9, [{ type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: ME, Reason: 'healthPack', Tick: 9 }]))
    expect(notices(c)).toEqual(['血包解毒了'])
    expect(notices(b.consume(batch(9, [{ type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: 3, Reason: 'bubble', Tick: 9 }])))).toEqual([])
  })

  it('casting bubble while poisoned folds the cure into the bubble notice (one notice, not two)', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0 }) }))
    const m = b.consume(
      batch(8, [
        { type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: ME, Reason: 'bubble', Tick: 8 },
        { type: 'SkillActivated', presentationOnly: true, PlayerNetEntityIdRaw: ME, Skill: 'bubble', Level: 1, Cell: { X: 1, Y: 1 }, ToCell: { X: 1, Y: 1 }, UntilTick: 68, CdUntilTick: 368, Tick: 8 },
      ]),
    )
    expect(notices(m)).toEqual(['泡泡护体 3 秒 · 解毒了 · 期间不能放弹'])
  })

  it('without status events: snapshot until-ticks give generic notices; once events exist no double notice', () => {
    const b = newBrain()
    const s = (t: number, over: Partial<PlayerSkillsView>) => snap({ tick: t, players: [{ id: ME, skills: skillsView(over) }] })
    b.consume(batch(0, [], { snapshot: s(0, {}) }))
    expect(notices(b.consume(batch(1, [], { snapshot: s(1, { toxinUntilTick: 62, shockUntilTick: 41 }) })))).toEqual([
      '中毒了！持续掉血 · 吃血包或放泡泡能解毒',
      '被麻痹了！走得很慢',
    ])
    expect(notices(b.consume(batch(2, [], { snapshot: s(2, { toxinUntilTick: 0, shockUntilTick: 41 }) })))).toEqual(['解毒了'])
    const withEvent = b.consume(batch(3, [poisoned(ME, ME, 3, 64)], { snapshot: s(3, { toxinUntilTick: 64, shockUntilTick: 41 }) }))
    expect(notices(withEvent)).toEqual(['中了自己的中毒弹！掉血 3 秒 · 吃血包或放泡泡能解毒'])
  })

  it('toxin tick hint while alive names the thrower', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME }, { id: 3 }] }) }))
    const h = b.consume(batch(25, [toxinTick(25, 3, 5)])).find((x) => x.kind === 'hits')
    expect(h?.kind === 'hits' && h.hint).toBe('被 豆豆熊 的中毒弹毒到 −半心')
    expect(h?.kind === 'hits' && h.hits[0].delayMs).toBe(0)
  })

  it('toxin death (Cause 4): recap headline 「被 X 的中毒弹毒倒了」, killer, bomb kind, sources; kill feed and kill credit', () => {
    const b = newBrain()
    const before = snap({ tick: 0, players: [{ id: ME, hp: 3 }, { id: 3 }] })
    b.consume(batch(0, [], { snapshot: before }))
    b.consume(batch(25, [toxinTick(25, 3, 2)]))
    b.consume(batch(45, [toxinTick(45, 3, 1)]))
    const m = b.consume(batch(65, [toxinTick(65, 3, 0), toxinDeath(65, 3)]))
    const d = m.find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect(d.recap).toMatchObject({ cause: 'toxin', headline: '被 豆豆熊 的中毒弹毒倒了', killerName: '豆豆熊', bombOwnerName: '豆豆熊', bombKindName: '中毒弹' })
    expect(d.recap.sources.map((x) => [x.label, x.detail])).toEqual([
      ['豆豆熊的中毒弹', '−半心 · 中毒'],
      ['豆豆熊的中毒弹', '−半心 · 中毒'],
    ])
    expect(d.recap.sources[0].animal).toBe('bear')
    expect(feedText(b.killFeed.entries()[0])).toBe('豆豆熊 用中毒弹毒倒了 你')
    expect(b.stats.stats.killsById.get(3)).toBe(1)
  })

  it('poisoned by your own bomb: 「被自己的中毒弹毒倒了」, no killer; others dying to your toxin credit you', () => {
    const b = newBrain()
    b.consume(batch(0, [], { snapshot: snap({ tick: 0, players: [{ id: ME, hp: 1 }, { id: 2 }] }) }))
    const d = b.consume(batch(5, [toxinTick(5, ME, 0), toxinDeath(5, ME)])).find((x) => x.kind === 'death')
    if (d?.kind !== 'death') throw new Error('no recap')
    expect([d.recap.headline, d.recap.killerName, d.recap.bombOwnerName, d.recap.sources[0].label]).toEqual(['被自己的中毒弹毒倒了', null, '你自己', '你自己的中毒弹'])
    expect(feedText(b.killFeed.entries()[0])).toBe('你 被自己的中毒弹毒倒了')
    b.consume(batch(9, [{ ...(died(9, 2, ME, 0) as Extract<BomberEvent, { type: 'PlayerDied' }>), Cause: 4 }]))
    expect(feedText(b.killFeed.entries()[0])).toBe('你 用中毒弹毒倒了 小黄鸭')
    expect(b.stats.stats.kills).toBe(1)
  })

  it('a direct 麻痹弹 kill names the bomb kind in the recap', () => {
    const b = newBrain()
    const before = snap({ tick: 9, players: [{ id: ME, hp: 2 }, { id: 2 }], bombs: [{ id: 7, owner: 2, X: 1, Y: 2, chain: 3 }] })
    before.Bombs[0].BomberBombState.BombKind = 6
    b.consume(batch(9, [], { snapshot: before }))
    const hit: BomberEvent = { type: 'DamageApplied', VictimNetEntityIdRaw: ME, SourceBombNetEntityIdRaw: 7, SourceBombOwnerNetEntityIdRaw: 2, ChainId: 3, HealthPointsLeft: 0, Tick: 10, proto: { Cause: 0, Points: 2 } }
    const d = b.consume(batch(10, [hit, died(10, ME, 2, 3)], { before })).find((x) => x.kind === 'death')
    expect(d?.kind === 'death' && d.recap.bombKindName).toBe('麻痹弹')
    expect(feedText(b.killFeed.entries()[0])).toBe('小黄鸭 用麻痹弹炸飞了 你')
  })

  it('kill feed names special bombs for others too (proto.SourceBomb), plain bombs stay 「炸飞了」', () => {
    const b = newBrain()
    const s = snap({ tick: 9, players: [{ id: ME }, { id: 2 }, { id: 3 }], bombs: [{ id: 7, owner: 2, X: 1, Y: 2 }, { id: 8, owner: 3, X: 3, Y: 2 }] })
    s.Bombs[0].BomberBombState.BombKind = 5
    b.consume(batch(9, [], { snapshot: s }))
    const kill = (victim: number, killer: number, bomb: number): BomberEvent => ({
      ...(died(10, victim, killer, 3) as Extract<BomberEvent, { type: 'PlayerDied' }>),
      proto: { HatsLost: 0, SourceBombNetEntityIdRaw: bomb },
    })
    b.consume(batch(10, [kill(3, 2, 7), kill(2, 2, 7), kill(ME, 3, 8)], { before: s }))
    expect(b.killFeed.entries().map((e) => feedText(e))).toEqual(['豆豆熊 炸飞了 你', '小黄鸭 被自己的中毒弹炸飞了', '小黄鸭 用中毒弹炸飞了 豆豆熊'])
  })
})
