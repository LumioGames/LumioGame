import type {
  BomberBombState,
  BomberHatPile,
  BomberMatchState,
  BomberPickupItem,
  BomberPlayerState,
  LogicTransform,
  玩家属性基础账,
  玩家属性当前账,
} from './components'
import type { RingRect } from './events'
import type { U64 } from './ids'

/**
 * 每个 Tick 的复制快照：Replica 的形状。本地 TS 替身与将来的引擎 Replica 适配器产出同一形状。
 * 快照是**纯数据**（无 class、无 Map），发布后不可变；表现层只读。
 */

export type AnimalId = 'duck' | 'rabbit' | 'bear' | 'cat' | 'frog' | 'penguin' | 'pig' | 'dog'

export interface EntityView {
  NetEntityIdRaw: U64
  LogicTransform: LogicTransform
  /** 该实体最近一次瞬移（重生 / 开局摆位）的 Tick；插值不得跨过它。 */
  teleportTick: U64
}

/** 原型扩展（NON-CONTRACT）：显示用元数据，引擎侧将来由账号 / 房间信息提供。 */
export interface PlayerMeta {
  name: string
  isBot: boolean
  animal: AnimalId
  /** 0–7，决定脚圈 / 炸弹色带颜色。 */
  slot: number
}

export interface PlayerView extends EntityView {
  BomberPlayerState: BomberPlayerState
  玩家属性: 玩家属性当前账
  /** 基础账是 Scope.Owner，只对本机玩家填写。 */
  玩家属性基础?: 玩家属性基础账
  meta: PlayerMeta
  /** 原型扩展（NON-CONTRACT，ADR 0025）：决赛圈内死亡即出局，本局不再复活、不参与任何交互。 */
  eliminated: boolean
}

export interface BombView extends EntityView {
  BomberBombState: BomberBombState
}

export interface HatPileView extends EntityView {
  BomberHatPile: BomberHatPile
}

export interface PickupView extends EntityView {
  BomberPickupItem: BomberPickupItem
  /** 原型扩展（NON-CONTRACT）：死者掉出的强化为死者 id，其余为 0（给死者颜色光圈用）。 */
  droppedBy: U64
  /** 原型扩展（NON-CONTRACT，ADR 0029）：在此 Tick 之前不会被爆炸摧毁（死者掉出的强化才有，其余为 0）。 */
  protectedUntilTick: U64
}

/** 原型扩展（NON-CONTRACT，design §4.2）：决赛圈强力宝箱，占格、挡路挡火，命中 HitsRequired 次开启。 */
export interface ChestView extends EntityView {
  chest: { HitsLeft: number; HitsRequired: number; StageIndex: number }
}

/**
 * 地形两层（契约 §6.1）。数组下标 = Y * size + X（游戏坐标）。
 * `ground` 为地面层（游戏 z = −1）：地面 / 水 / 冰；`brick` 为砖层（游戏 z = 0）：Air / 铁皮 / 积木 / 木箱 / …
 * 值为 `BlockType`。`rev` 单调递增，任何一次帧末写入都 +1（对应 Section revision 的简化）。
 */
export interface TerrainView {
  size: number
  ground: Uint8Array
  brick: Uint8Array
  rev: number
}

/** 原型扩展（NON-CONTRACT，design §4.2）：决赛圈状态。`BomberMatchState.Phase === Endgame` 时非空。 */
export interface FinalCircleView {
  trigger: 'resource' | 'time'
  startTick: U64
  endTick: U64
  /** 当前安全圈（闭区间，格）。圈外按 poisonIntervalMs 扣血。 */
  ring: RingRect
  /** 已预告、尚未生效的下一圈；没有则为 null。 */
  nextRing: RingRect | null
  /** 下一圈生效的 Tick；没有则为 0。 */
  nextRingTick: U64
  /** 已生效的最后一段序号（−1 = 仍是整个内场）。 */
  stageIndex: number
  /** 未出局的玩家数（含重生倒计时中的）。 */
  aliveCount: number
}

/** 原型扩展（NON-CONTRACT）：对局元数据。 */
export interface MatchMeta {
  matchIndex: number
  /** 当前阶段结束的 Tick（Warmup / Running / Endgame=决赛圈 / Settlement 各自的终点），给倒计时用。 */
  phaseEndTick: U64
  tickRateHz: number
  /** 本局开局时的可破坏砖数量（积木 + 木箱）与当前剩余，给「资源触发决赛圈」的 HUD 提示用。 */
  resourceInitial: number
  resourceRemaining: number
  finalCircle: FinalCircleView | null
}

export interface WorldSnapshot {
  Tick: U64
  BomberMatchState: BomberMatchState
  Players: readonly PlayerView[]
  Bombs: readonly BombView[]
  HatPiles: readonly HatPileView[]
  Pickups: readonly PickupView[]
  /** 原型扩展（NON-CONTRACT）：决赛圈强力宝箱。 */
  Chests: readonly ChestView[]
  Terrain: TerrainView
  match: MatchMeta
}
