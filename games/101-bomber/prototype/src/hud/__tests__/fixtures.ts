import {
  BlockType,
  MatchPhase,
  type AnimalId,
  type BombView,
  type BomberEvent,
  type FinalCircleView,
  type FireZoneView,
  type MatchResultsView,
  type PickupView,
  type PlayerSkillsView,
  type PlayerView,
  type SkillId,
  type SkillSlotView,
  type U64,
  type WorldSnapshot,
  方向,
} from '../../contract'
import type { TickBatch } from '../timeline'

export const ME: U64 = 1
const ANIMALS: AnimalId[] = ['rabbit', 'duck', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog']
const NAMES = ['你', '小黄鸭', '豆豆熊', '灰灰猫', '呱呱蛙', '企鹅团子', '粉粉猪', '旺财']

export interface PlayerSpec {
  id: U64
  hats?: number
  hp?: number
  x?: number
  z?: number
  respawnAt?: number
  eliminated?: boolean
  /** 原型扩展（NON-CONTRACT，ADR 0030）：技能状态；缺省 = 快照没有 skills 字段。 */
  skills?: PlayerSkillsView
  eliminatedTick?: number
}

/** 技能状态夹具：未给的字段全 0 / 空槽。 */
export function skillsView(over: Partial<PlayerSkillsView> = {}): PlayerSkillsView {
  return {
    character: null,
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

export const held = (skill: SkillId, level = 1, bound = false): SkillSlotView => ({ skill, level, bound })

export function player(p: PlayerSpec): PlayerView {
  const i = (p.id - 1) % 8
  return {
    NetEntityIdRaw: p.id,
    LogicTransform: { WorldPosition: { x: p.x ?? 1.5, y: 1, z: p.z ?? 1.5 } },
    teleportTick: 0,
    BomberPlayerState: { HatCount: p.hats ?? 0, RespawnAtTick: p.respawnAt ?? 0, ProtectedUntilTick: 0 },
    玩家属性: { 血量当前: p.hp ?? 6, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
    meta: { name: NAMES[i], isBot: p.id !== ME, animal: ANIMALS[i], slot: i },
    eliminated: p.eliminated ?? false,
    ...(p.skills ? { skills: p.skills } : {}),
    ...(p.eliminatedTick !== undefined ? { eliminatedTick: p.eliminatedTick } : {}),
  }
}

export interface BombSpec {
  id: U64
  owner: U64
  X: number
  Y: number
  chain?: U64
  exploded?: number
  reach?: [number, number, number, number]
}

export function bomb(b: BombSpec): BombView {
  const [u, d, l, r] = b.reach ?? [0, 0, 0, 0]
  return {
    NetEntityIdRaw: b.id,
    LogicTransform: { WorldPosition: { x: b.X + 0.5, y: 1, z: b.Y + 0.5 } },
    teleportTick: 0,
    BomberBombState: {
      OwnerNetEntityIdRaw: b.owner,
      FuseEndTick: 100,
      Power: 2,
      ChainId: b.chain ?? 0,
      BombKind: 0,
      PierceLayers: 0,
      ExplodedAtTick: b.exploded ?? 0,
      DangerUntilTick: (b.exploded ?? 0) + 8,
      BurnUntilTick: 0,
      ReachUp: u,
      ReachDown: d,
      ReachLeft: l,
      ReachRight: r,
    },
  }
}

export interface SnapSpec {
  tick: number
  players?: PlayerSpec[]
  king?: U64
  phase?: (typeof MatchPhase)[keyof typeof MatchPhase]
  bombs?: BombSpec[]
  brick?: Uint8Array
  rev?: number
  matchIndex?: number
  phaseEndTick?: number
  resourceInitial?: number
  resourceRemaining?: number
  finalCircle?: FinalCircleView | null
  /** 原型扩展（NON-CONTRACT，ADR 0031）：结算名次表。 */
  results?: MatchResultsView | null
  fireZones?: FireZoneView[]
  pickups?: PickupView[]
}

/** 拾取物夹具（技能糖带 skill）。 */
export function pickup(id: U64, X: number, Y: number, kind: number, skill?: { id: SkillId; level: number }): PickupView {
  return {
    NetEntityIdRaw: id,
    LogicTransform: { WorldPosition: { x: X + 0.5, y: 1, z: Y + 0.5 } },
    teleportTick: 0,
    BomberPickupItem: { Kind: kind as PickupView['BomberPickupItem']['Kind'] },
    droppedBy: 0,
    protectedUntilTick: 0,
    ...(skill ? { skill } : {}),
  }
}

export const SIZE = 9

export function emptyBricks(): Uint8Array {
  return new Uint8Array(SIZE * SIZE).fill(BlockType.Air)
}

export function snap(s: SnapSpec): WorldSnapshot {
  return {
    Tick: s.tick,
    BomberMatchState: { MatchTick: s.tick, StartTick: 0, EndTick: 7200, Phase: s.phase ?? MatchPhase.Running, HatKingNetEntityIdRaw: s.king ?? 0 },
    Players: (s.players ?? [{ id: ME }]).map(player),
    Bombs: (s.bombs ?? []).map(bomb),
    HatPiles: [],
    Pickups: s.pickups ?? [],
    Chests: [],
    Terrain: { size: SIZE, ground: new Uint8Array(SIZE * SIZE).fill(BlockType.地面), brick: s.brick ?? emptyBricks(), rev: s.rev ?? 0 },
    match: {
      matchIndex: s.matchIndex ?? 1,
      phaseEndTick: s.phaseEndTick ?? 7200,
      tickRateHz: 20,
      resourceInitial: s.resourceInitial ?? 0,
      resourceRemaining: s.resourceRemaining ?? 0,
      finalCircle: s.finalCircle ?? null,
      ...(s.results !== undefined ? { results: s.results } : {}),
    },
    ...(s.fireZones ? { FireZones: s.fireZones } : {}),
  }
}

export function batch(tick: number, events: BomberEvent[], opts: { snapshot?: WorldSnapshot | null; before?: WorldSnapshot | null } = {}): TickBatch {
  return { tick, events, derivedBricks: [], snapshot: opts.snapshot ?? null, before: opts.before ?? null }
}

export const died = (tick: number, victim: U64, killer: U64, chain: U64, hatsLost?: number): BomberEvent => ({
  type: 'PlayerDied',
  VictimNetEntityIdRaw: victim,
  KillerNetEntityIdRaw: killer,
  ChainId: chain,
  Cause: 0,
  Cell: { X: 1, Y: 1 },
  Tick: tick,
  ...(hatsLost !== undefined ? { proto: { HatsLost: hatsLost, SourceBombNetEntityIdRaw: 0 } } : {}),
})

export const exploded = (tick: number, chain: U64, owner: U64): BomberEvent => ({
  type: 'BombExploded',
  ChainId: chain,
  SourceBombOwnerNetEntityIdRaw: owner,
  CellCount: 5,
  Tick: tick,
})
