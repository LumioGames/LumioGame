import type { BlockType, PickupKind } from './components'
import type { U64 } from './ids'

/**
 * 事件面。前 11 个是服务器权威事件，字段名逐字照抄
 * `modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/Contracts/Events/BomberEvents.cs`
 * （契约 §3）；`type` 是 TS 联合类型的判别字段。
 *
 * `proto` 里的字段是**原型扩展（NON-CONTRACT）**：表现层可以用来做得更好，但**不得依赖**——
 * 换成引擎 Replica 后它们可能不存在，表现层必须能从快照 diff 推出同样的东西。
 * `presentationOnly: true` 的事件同理（契约 §3 没有它们）。
 */

/** 玩法格坐标（契约 §1.2）：由 LogicTransform 推导，不是组件字段。 */
export interface BomberCell {
  X: number
  Y: number
}

/**
 * PlayerDied.Cause：0 = 爆炸、1 = 溺水、2 = 燃烧（Stage 5，原型不产生）；
 * 3 = 毒圈是**原型扩展**（design §12 / ADR 0025，契约 v2 只到 2，扩值待契约修订）。
 */
export const DeathCause = { Bomb: 0, Drown: 1, Burn: 2, Poison: 3 } as const
export type DeathCause = (typeof DeathCause)[keyof typeof DeathCause]

export interface BombPlaced {
  type: 'BombPlaced'
  OwnerNetEntityIdRaw: U64
  Cell: BomberCell
  FuseEndTick: U64
  Tick: U64
  proto?: { BombNetEntityIdRaw: U64 }
}

export interface BombExploded {
  type: 'BombExploded'
  ChainId: U64
  SourceBombOwnerNetEntityIdRaw: U64
  /** 覆盖格数 = 1（中心）+ ΣReach。 */
  CellCount: number
  Tick: U64
  proto?: { BombNetEntityIdRaw: U64; Cell: BomberCell; IndexInChain: number }
}

/** 每次扣血恰好一条；同一颗炸弹对同一玩家只出现一次（§7.5）。HealthPointsLeft 为半心点。 */
export interface DamageApplied {
  type: 'DamageApplied'
  VictimNetEntityIdRaw: U64
  /** 溺水等非炸弹伤害为 0。 */
  SourceBombNetEntityIdRaw: U64
  SourceBombOwnerNetEntityIdRaw: U64
  ChainId: U64
  HealthPointsLeft: number
  Tick: U64
  proto?: { Cause: DeathCause; Points: number }
}

/** 自杀与溺死时 KillerNetEntityIdRaw == VictimNetEntityIdRaw（§9.1）。 */
export interface PlayerDied {
  type: 'PlayerDied'
  VictimNetEntityIdRaw: U64
  KillerNetEntityIdRaw: U64
  ChainId: U64
  Cause: DeathCause
  Cell: BomberCell
  Tick: U64
  proto?: { HatsLost: number; SourceBombNetEntityIdRaw: U64 }
}

export interface PlayerRespawned {
  type: 'PlayerRespawned'
  NetEntityIdRaw: U64
  Cell: BomberCell
  Tick: U64
}

export interface HatPileSpawned {
  type: 'HatPileSpawned'
  Cell: BomberCell
  Count: number
  ExpireAtTick: U64
  Tick: U64
  proto?: { PileNetEntityIdRaw: U64; FromCell: BomberCell; VictimNetEntityIdRaw: U64 }
}

export interface HatPilePicked {
  type: 'HatPilePicked'
  PickerNetEntityIdRaw: U64
  Count: number
  Tick: U64
  proto?: { PileNetEntityIdRaw: U64; Cell: BomberCell }
}

export interface HatPileExpired {
  type: 'HatPileExpired'
  Count: number
  Tick: U64
  proto?: { PileNetEntityIdRaw: U64; Cell: BomberCell }
}

export interface PickupTaken {
  type: 'PickupTaken'
  PickerNetEntityIdRaw: U64
  Kind: PickupKind
  Tick: U64
  proto?: { PickupNetEntityIdRaw: U64; Cell: BomberCell }
}

/** NewHatKingNetEntityIdRaw == 0 表示当前无帽王（§9.3）。 */
export interface HatKingChanged {
  type: 'HatKingChanged'
  PreviousHatKingNetEntityIdRaw: U64
  NewHatKingNetEntityIdRaw: U64
  Tick: U64
}

export interface MatchEnded {
  type: 'MatchEnded'
  Tick: U64
}

// ---- 以下为原型表现事件（NON-CONTRACT，presentationOnly）----

export interface BrickDestroyed {
  type: 'BrickDestroyed'
  presentationOnly: true
  Cell: BomberCell
  Block: BlockType
  ChainId: U64
  OwnerNetEntityIdRaw: U64
  Tick: U64
}

export interface PickupSpawned {
  type: 'PickupSpawned'
  presentationOnly: true
  PickupNetEntityIdRaw: U64
  Cell: BomberCell
  Kind: PickupKind
  Tick: U64
  /** 来源：砖块掉落 / 木箱必掉 / 死者掉出的强化 / 强力宝箱喷出。 */
  Source: 'brick' | 'crate' | 'death' | 'chest'
  /** Source = 'death' 时为死者；否则 0。 */
  DroppedByNetEntityIdRaw: U64
  /** 喷出起点（死亡格 / 宝箱格）；砖块掉落时等于 Cell。 */
  FromCell: BomberCell
}

export interface PickupDestroyed {
  type: 'PickupDestroyed'
  presentationOnly: true
  PickupNetEntityIdRaw: U64
  Cell: BomberCell
  Tick: U64
}

/** 在水方格上放弹：放下即熄灭（design §5.1），不消耗手上炸弹数。 */
export interface BombExtinguished {
  type: 'BombExtinguished'
  presentationOnly: true
  OwnerNetEntityIdRaw: U64
  Cell: BomberCell
  Tick: U64
}

/** 一条爆炸链在本 Tick 结算完毕后的汇总（给「×N 连锁 / 多杀 / 拆迁」弹字用）。 */
export interface ChainResolved {
  type: 'ChainResolved'
  presentationOnly: true
  ChainId: U64
  BombCount: number
  BrickCount: number
  OwnerNetEntityIdRaws: readonly U64[]
  Tick: U64
}

export interface MatchStarted {
  type: 'MatchStarted'
  presentationOnly: true
  MatchIndex: number
  Tick: U64
}

/** 软砖再生（design §5，ADR 0026）：本 Tick 帧末补回的积木格。表现层也可以从地形 diff 推出。 */
export interface BricksRegrown {
  type: 'BricksRegrown'
  presentationOnly: true
  Cells: readonly BomberCell[]
  Tick: U64
}

/**
 * 已停用（ADR 0028：没有独立的帽子资源，不再铸帽）。类型保留只为兼容旧表现代码，规则层不再产生。
 */
export interface HatMinted {
  type: 'HatMinted'
  presentationOnly: true
  KillerNetEntityIdRaw: U64
  VictimNetEntityIdRaw: U64
  /** 飞帽起点：击杀为死者死亡格，吃强化为强化所在格。 */
  FromCell: BomberCell
  /** 本次铸造的顶数（击杀恒为 1）。 */
  Count: number
  HatCountAfter: number
  Tick: U64
}

/** 死者掉出的强化（design §8.5，ADR 0025）。Kinds 与随后的 PickupSpawned(Source='death') 一一对应。 */
export interface PowerupsDropped {
  type: 'PowerupsDropped'
  presentationOnly: true
  VictimNetEntityIdRaw: U64
  Kinds: readonly PickupKind[]
  Cell: BomberCell
  Tick: U64
}

/** 安全圈：以格为单位的闭区间正方形，X、Y ∈ [Min, Max] 为安全区。 */
export interface RingRect {
  Min: number
  Max: number
}

/** 决赛圈开始（design §4.2）。 */
export interface FinalCircleStarted {
  type: 'FinalCircleStarted'
  presentationOnly: true
  Trigger: 'resource' | 'time'
  EndTick: U64
  Tick: U64
}

/** 下一段安全圈预告（生效前 ringPreviewMs）。 */
export interface RingShrinkAnnounced {
  type: 'RingShrinkAnnounced'
  presentationOnly: true
  StageIndex: number
  Next: RingRect
  AtTick: U64
  Tick: U64
}

/** 安全圈收缩生效。 */
export interface RingShrunk {
  type: 'RingShrunk'
  presentationOnly: true
  StageIndex: number
  Ring: RingRect
  Tick: U64
}

/** 决赛圈内死亡即出局（不再复活）。Rank 为出局时的名次（剩余存活人数 + 1）。 */
export interface PlayerEliminated {
  type: 'PlayerEliminated'
  presentationOnly: true
  NetEntityIdRaw: U64
  Rank: number
  Tick: U64
}

export interface ChestSpawned {
  type: 'ChestSpawned'
  presentationOnly: true
  ChestNetEntityIdRaw: U64
  Cell: BomberCell
  Tick: U64
}

/** 强力宝箱被一颗炸弹命中（同链多颗各算一次）。 */
export interface ChestHit {
  type: 'ChestHit'
  presentationOnly: true
  ChestNetEntityIdRaw: U64
  HitsLeft: number
  SourceBombOwnerNetEntityIdRaw: U64
  ChainId: U64
  Tick: U64
}

export interface ChestOpened {
  type: 'ChestOpened'
  presentationOnly: true
  ChestNetEntityIdRaw: U64
  Cell: BomberCell
  /** 打出最后一击的炸弹主人。 */
  OpenerNetEntityIdRaw: U64
  Tick: U64
}

export type ContractEvent =
  | BombPlaced
  | BombExploded
  | DamageApplied
  | PlayerDied
  | PlayerRespawned
  | HatPileSpawned
  | HatPilePicked
  | HatPileExpired
  | PickupTaken
  | HatKingChanged
  | MatchEnded

export type PresentationEvent =
  | BrickDestroyed
  | PickupSpawned
  | PickupDestroyed
  | BombExtinguished
  | ChainResolved
  | MatchStarted
  | HatMinted
  | BricksRegrown
  | PowerupsDropped
  | FinalCircleStarted
  | RingShrinkAnnounced
  | RingShrunk
  | PlayerEliminated
  | ChestSpawned
  | ChestHit
  | ChestOpened

export type BomberEvent = ContractEvent | PresentationEvent
export type BomberEventType = BomberEvent['type']
