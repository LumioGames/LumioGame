import { describe, expect, it } from 'vitest'
import {
  BlockType,
  DEFAULT_RULES,
  MatchPhase,
  PickupKind,
  protoConfig,
  rulesForMap,
  type BomberEvent,
  type ResourceBoxTier,
  type TickFrame,
  type U64,
  type WorldSnapshot,
} from '../../src/contract'
import { M1Collector, formatM1, summarizeM1, type HighlightProbeFactory, type M1MatchMetrics } from './m1-metrics'

/**
 * M1 报告项的推导（ADR 0039 / 0040 / 0043，design §15 / §17）：只从事件与快照推导，这里用手搭的最小帧逐项钉住口径。
 * 27 档：中心 (13, 13)，核心 d ≤ 4、中圈 5–8、外圈 ≥ 9；20 Hz。
 */
const RULES = rulesForMap(DEFAULT_RULES, 27)
const CFG = protoConfig(RULES)
const HZ = CFG.tickRateHz
const START = 60

interface P {
  id: U64
  x?: number
  y?: number
  hp?: number
  maxHealth?: number
  goldHearts?: number
  frenzyUntilTick?: number
  eliminated?: boolean
}

interface Box {
  x: number
  y: number
  tier: ResourceBoxTier
}

function snap(tick: number, players: readonly P[], o: { phase?: number; boxes?: readonly Box[] } = {}): WorldSnapshot {
  return {
    Tick: tick,
    BomberMatchState: { MatchTick: tick, StartTick: START, EndTick: 0, Phase: o.phase ?? MatchPhase.Running, HatKingNetEntityIdRaw: 0 },
    Players: players.map((p) => ({
      NetEntityIdRaw: p.id,
      LogicTransform: { WorldPosition: { x: (p.x ?? 13) + 0.5, y: 1, z: (p.y ?? 13) + 0.5 } },
      玩家属性: { 血量当前: p.hp ?? 6 },
      eliminated: p.eliminated ?? false,
      maxHealth: p.maxHealth ?? 6,
      goldHearts: p.goldHearts ?? 0,
      frenzyUntilTick: p.frenzyUntilTick ?? 0,
    })),
    Terrain: { size: 27 },
    match: { tickRateHz: HZ, map: { tier: 27, size: 27, zones: RULES.map.zones } },
    ResourceBoxes: (o.boxes ?? []).map((b) => ({ Cell: { X: b.x, Y: b.y }, tier: b.tier, HitsLeft: 1, HitsRequired: 1 })),
  } as unknown as WorldSnapshot
}

const frame = (snapshot: WorldSnapshot, events: readonly BomberEvent[] = []): TickFrame => ({ snapshot, events })
const died = (tick: number, victim: U64, killer: U64): BomberEvent => ({
  type: 'PlayerDied',
  VictimNetEntityIdRaw: victim,
  KillerNetEntityIdRaw: killer,
  ChainId: 1,
  Cause: 0,
  Cell: { X: 1, Y: 1 },
  Tick: tick,
})
const ended = (tick: number): BomberEvent => ({ type: 'MatchEnded', Tick: tick })
const spawned = (tick: number, id: U64, kind: number, source: 'brick' | 'crate' | 'death' | 'chest' | 'supply', droppedBy: U64 = 0): BomberEvent => ({
  type: 'PickupSpawned',
  presentationOnly: true,
  PickupNetEntityIdRaw: id,
  Cell: { X: 3, Y: 3 },
  Kind: kind as PickupKind,
  Tick: tick,
  Source: source,
  DroppedByNetEntityIdRaw: droppedBy,
  FromCell: { X: 3, Y: 3 },
})
const taken = (tick: number, id: U64, kind: number, picker: U64): BomberEvent => ({
  type: 'PickupTaken',
  PickerNetEntityIdRaw: picker,
  Kind: kind as PickupKind,
  Tick: tick,
  proto: { PickupNetEntityIdRaw: id, Cell: { X: 3, Y: 3 } },
})
const brick = (tick: number, x: number, y: number, block: number, chain: number): BomberEvent => ({
  type: 'BrickDestroyed',
  presentationOnly: true,
  Cell: { X: x, Y: y },
  Block: block as BlockType,
  ChainId: chain,
  OwnerNetEntityIdRaw: chain === 0 ? 0 : 1,
  Tick: tick,
})

function run(frames: readonly TickFrame[], probe?: HighlightProbeFactory): M1MatchMetrics {
  const c = new M1Collector(CFG, RULES, probe ? probe({ config: CFG, rules: RULES, localId: 1 }) : null)
  for (const f of frames) c.frame(f)
  return c.finish(frames[frames.length - 1].snapshot)
}

describe('M1 metrics: Boss (maxHealth ≥ 6 hearts = 12 points)', () => {
  it('opens a reign when the cap reaches 12, closes it on death (downed, killed by another) and at MatchEnded', () => {
    const m = run([
      frame(snap(100, [{ id: 1, maxHealth: 10 }, { id: 2 }, { id: 3, maxHealth: 12 }])),
      frame(snap(101, [{ id: 1, maxHealth: 12 }, { id: 2 }, { id: 3, maxHealth: 12 }])),
      frame(snap(301, [{ id: 1, maxHealth: 12, hp: 0 }, { id: 2 }, { id: 3, maxHealth: 14 }]), [died(301, 1, 2)]),
      frame(snap(400, [{ id: 1, hp: 6 }, { id: 2 }, { id: 3, maxHealth: 14 }]), [ended(400)]),
    ])
    expect(m.bossReigns).toEqual([
      { id: 1, fromTick: 101, toTick: 301, peakMaxHealth: 12, end: 'down', killer: 2 },
      { id: 3, fromTick: 100, toTick: 400, peakMaxHealth: 14, end: 'matchEnd', killer: null },
    ])
  })

  it('a Boss who dies by poison / self counts as downed but not as killed by another player', () => {
    const m = run([
      frame(snap(100, [{ id: 1, maxHealth: 16 }])),
      frame(snap(120, [{ id: 1, maxHealth: 16, hp: 0 }]), [died(120, 1, 1)]),
      frame(snap(121, [{ id: 1, hp: 0 }]), [ended(121)]),
    ])
    expect(m.bossReigns).toEqual([{ id: 1, fromTick: 100, toTick: 120, peakMaxHealth: 16, end: 'down', killer: 1 }])
    const s = summarizeM1([m])
    expect(s.bossDownRate).toBe(1)
    expect(s.bossKilledRate).toBe(0)
  })

  it('no Boss in a match → occurrence 0 %, duration / downed ratios N/A', () => {
    const m = run([frame(snap(100, [{ id: 1, maxHealth: 10 }]), [ended(100)])])
    expect(m.bossReigns).toEqual([])
    const s = summarizeM1([m])
    expect(s.bossMatchRate).toBe(0)
    expect(s.bossAvgSec).toBeNull()
    expect(s.bossDownRate).toBeNull()
  })
})

describe('M1 metrics: gold hearts', () => {
  it('issue = non-death spawns by source; handoff = a death-dropped gold heart picked by someone other than the dropper', () => {
    const G = PickupKind.GoldHeart
    const m = run([
      frame(snap(100, [{ id: 1 }]), [
        spawned(100, 50, G, 'crate'),
        spawned(100, 51, G, 'chest'),
        spawned(100, 52, G, 'supply'),
        spawned(100, 60, PickupKind.FirePlus, 'crate'),
      ]),
      frame(snap(110, [{ id: 1 }]), [taken(110, 50, G, 3)]),
      frame(snap(120, [{ id: 1 }]), [spawned(120, 70, G, 'death', 3), spawned(120, 71, G, 'death', 3)]),
      frame(snap(130, [{ id: 1 }]), [taken(130, 70, G, 4), taken(130, 71, G, 3), taken(130, 60, PickupKind.FirePlus, 4)]),
      frame(snap(140, [{ id: 1 }]), [ended(140)]),
    ])
    expect(m.goldHearts).toEqual({ issued: { brick: 0, crate: 1, chest: 1, supply: 1 }, dropped: 2, picked: 3, handoffs: 1 })
  })
})

describe('M1 metrics: resource boxes opened per tier', () => {
  it('tier comes from the previous frame; chain 0 = cleared by the ring (not opened); a crate not in the list counts as wood', () => {
    const boxes: Box[] = [
      { x: 5, y: 5, tier: 'iron' },
      { x: 13, y: 12, tier: 'gold' },
      { x: 20, y: 20, tier: 'gold' },
    ]
    const m = run([
      frame(snap(100, [{ id: 1 }], { boxes })),
      frame(snap(101, [{ id: 1 }], { boxes: [boxes[2]] }), [
        brick(101, 5, 5, BlockType.木箱, 7),
        brick(101, 13, 12, BlockType.木箱, 0),
        brick(101, 2, 2, BlockType.木箱, 3),
        brick(101, 4, 4, BlockType.积木, 3),
      ]),
      frame(snap(102, [{ id: 1 }]), [brick(102, 20, 20, BlockType.木箱, 9), ended(102)]),
    ])
    expect(m.boxesOpened).toEqual({ wood: 1, iron: 1, gold: 1 })
    expect(m.boxesCleared).toEqual({ wood: 0, iron: 0, gold: 1 })
  })
})

describe('M1 metrics: frenzy', () => {
  it('counts activations from frenzyUntilTick, kills while the killer is in frenzy, and frenzied players dying', () => {
    const m = run([
      frame(snap(300, [{ id: 5, frenzyUntilTick: 420 }, { id: 6 }, { id: 7 }])),
      frame(snap(350, [{ id: 5, frenzyUntilTick: 420 }, { id: 6, hp: 0 }, { id: 7 }]), [died(350, 6, 5)]),
      frame(snap(360, [{ id: 5, frenzyUntilTick: 420 }, { id: 6, hp: 0 }, { id: 7, hp: 0 }]), [died(360, 7, 7)]),
      frame(snap(430, [{ id: 5, frenzyUntilTick: 420 }, { id: 6 }, { id: 7, hp: 0 }]), [died(430, 7, 5)]),
      frame(snap(500, [{ id: 5, frenzyUntilTick: 620 }, { id: 6 }, { id: 7 }])),
      frame(snap(510, [{ id: 5, frenzyUntilTick: 620, hp: 0 }, { id: 6 }, { id: 7 }]), [died(510, 5, 6)]),
      frame(snap(520, [{ id: 5, hp: 0 }, { id: 6 }, { id: 7 }]), [ended(520)]),
    ])
    expect(m.frenzy).toEqual({ starts: 2, kills: 1, deaths: 1 })
  })
})

describe('M1 metrics: time spent per ring zone by match time', () => {
  it('counts alive players only, in Running / Endgame only, bucketed by 30 s of match time from StartTick', () => {
    const at = (sec: number): number => START + sec * HZ
    const people: P[] = [
      { id: 1, x: 13, y: 13 }, // core (d 0)
      { id: 2, x: 13 + 4, y: 13 }, // core (d 4)
      { id: 3, x: 13, y: 13 - 8 }, // mid (d 8)
      { id: 4, x: 1, y: 1 }, // outer (d 12)
      { id: 5, x: 1, y: 13, hp: 0 }, // dead: not counted
      { id: 6, x: 2, y: 13, eliminated: true }, // eliminated: not counted
    ]
    const m = run([
      frame(snap(START - 1, people, { phase: MatchPhase.Warmup })),
      frame(snap(at(0), people)),
      frame(snap(at(29), people)),
      frame(snap(at(30), people, { phase: MatchPhase.Endgame })),
      frame(snap(at(95), people), [ended(at(95))]),
      frame(snap(at(96), people, { phase: MatchPhase.Settlement })),
    ])
    expect(m.zoneTicks).toEqual([
      { outer: 2, mid: 2, core: 4 },
      { outer: 1, mid: 1, core: 2 },
      { outer: 0, mid: 0, core: 0 },
      { outer: 1, mid: 1, core: 2 },
    ])
    const s = summarizeM1([m])
    expect(s.zoneByBucket[0]).toEqual({ fromSec: 0, toSec: 30, playerSec: 8 / HZ, share: { outer: 0.25, mid: 0.25, core: 0.5 } })
    expect(s.zoneByBucket[2].share).toBeNull()
  })
})

describe('M1 metrics: highlight-card coverage (M1-4 probe)', () => {
  it('coverage = players with a card / players; no probe → N/A with the reason', () => {
    const frames = [frame(snap(100, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]), [ended(100)])]
    const seen: number[] = []
    const probe: HighlightProbeFactory = () => ({
      frame: (f) => seen.push(f.snapshot.Tick),
      cards: () =>
        new Map<U64, string | null>([
          [1, 'mostKills'],
          [2, 'longestChain'],
          [3, null],
        ]),
    })
    const m = run(frames, probe)
    expect(seen).toEqual([100])
    expect(m.highlight).toEqual({ players: 4, covered: 2 })
    expect(summarizeM1([m]).highlightCoverage).toBe(0.5)

    const none = run(frames)
    expect(none.highlight).toBeNull()
    const s = summarizeM1([none])
    expect(s.highlightCoverage).toBeNull()
    expect(formatM1(s)).toContain('高光卡覆盖率：N/A')
  })
})

describe('M1 report formatting', () => {
  it('prints every M1 report item, with N/A where a metric has no data', () => {
    const m = run([frame(snap(100, [{ id: 1 }]), [ended(100)])])
    const text = formatM1(summarizeM1([m]))
    for (const k of ['Boss', '出现局占比', '持续', '被击倒', '金心', '发行', '易手', '资源箱开启', '木', '铁', '金', '狂暴期间击杀', '高光卡覆盖率', '各圈停留'])
      expect(text).toContain(k)
    expect(text).toContain('N/A')
  })
})
