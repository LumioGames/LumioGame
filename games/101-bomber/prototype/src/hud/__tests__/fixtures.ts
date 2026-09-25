import {
  BlockType,
  MatchPhase,
  type AnimalId,
  type BombView,
  type BomberEvent,
  type FinalCircleView,
  type PlayerView,
  type U64,
  type WorldSnapshot,
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
}

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
    Pickups: [],
    Chests: [],
    Terrain: { size: SIZE, ground: new Uint8Array(SIZE * SIZE).fill(BlockType.地面), brick: s.brick ?? emptyBricks(), rev: s.rev ?? 0 },
    match: {
      matchIndex: s.matchIndex ?? 1,
      phaseEndTick: s.phaseEndTick ?? 7200,
      tickRateHz: 20,
      resourceInitial: s.resourceInitial ?? 0,
      resourceRemaining: s.resourceRemaining ?? 0,
      finalCircle: s.finalCircle ?? null,
    },
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
