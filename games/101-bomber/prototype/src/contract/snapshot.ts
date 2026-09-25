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
import type { BomberCell, MatchEndReason, RingRect } from './events'
import type { U64 } from './ids'
import type { 方向 } from './input'
import type { CharacterId, SkillId, SkillSlot } from './skills'

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

/** 原型扩展（NON-CONTRACT，ADR 0030）：一个技能槽里的技能。 */
export interface SkillSlotView {
  skill: SkillId
  level: number
  /** 专属技能（或含专属的组合技）：不掉落、不被替换。 */
  bound: boolean
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：角色与技能状态。时间一律 Tick；「直到」类字段为开区间终点（t < X 即生效中）。
 */
export interface PlayerSkillsView {
  /** 本局角色；null = 无角色（旧测试夹具）。 */
  character: CharacterId | null
  /** 规则层记的面向（最近一次非停的移动输入），闪现 / 冲刺朝它放。 */
  facing: 方向
  slots: Readonly<Record<SkillSlot, SkillSlotView | null>>
  /** 主动技能冷却区间 [cdFromTick, cdUntilTick)。 */
  cdFromTick: U64
  cdUntilTick: U64
  bubbleUntilTick: U64
  auraUntilTick: U64
  frozenUntilTick: U64
  /** 回春计时 [regenFromTick, regenNextTick)；regenNextTick = 0 表示不在计时。 */
  regenFromTick: U64
  regenNextTick: U64
  /** 最近一次闪现 / 冲刺的 Tick；= teleportTick 时那次瞬移是闪现，不是重生。 */
  blinkTick: U64
}

export interface PlayerView extends EntityView {
  BomberPlayerState: BomberPlayerState
  玩家属性: 玩家属性当前账
  /** 基础账是 Scope.Owner，只对本机玩家填写。 */
  玩家属性基础?: 玩家属性基础账
  meta: PlayerMeta
  /** 原型扩展（NON-CONTRACT，ADR 0025）：决赛圈内死亡即出局，本局不再复活、不参与任何交互。 */
  eliminated: boolean
  /** 原型扩展（NON-CONTRACT，ADR 0030）：角色与技能；规则替身总会填，缺省 = 无角色无技能（表现层须能降级）。 */
  skills?: PlayerSkillsView
  /** 原型扩展（NON-CONTRACT，ADR 0031）：= 使其出局的那条 PlayerDied 的 Tick；0 = 未出局。 */
  eliminatedTick?: U64
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：被踢出、正在滑行的炸弹。 */
export interface BombKickView {
  dir: 方向
  /** 已从当前格朝下一格走了多少（0–999 千分格）。 */
  progressMilli: number
  /** 还要滑的格数。 */
  cellsLeft: number
  /** 千分格 / 秒。 */
  speedMilli: number
}

export interface BombView extends EntityView {
  BomberBombState: BomberBombState
  /** 原型扩展（NON-CONTRACT，ADR 0030）：滑行中；LogicTransform 仍是逻辑格心（表现层自己按 progressMilli 插值）。 */
  kick?: BombKickView | null
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：Kind = SkillCandy 时糖里的技能与等级。 */
  skill?: { id: SkillId; level: number }
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：一片会烧人的火（火焰光环 / 火焰冲刺火墙），规则层按它结算烧伤。 */
export interface FireZoneView {
  owner: U64
  source: 'aura' | 'firewall'
  cells: readonly BomberCell[]
  /** 结束 Tick（不含）。 */
  untilTick: U64
}

/** 原型扩展（NON-CONTRACT，ADR 0031）：结算名次表一行（D2：活到最后者赢）。 */
export interface MatchRankRow {
  id: U64
  /** 竞赛名次（并列同名次：1, 1, 3）。 */
  rank: number
  /** 1..n 唯一站位；1–3 上领奖台（1 = 中央）。 */
  place: number
  survived: boolean
  hats: number
  /** 出局 Tick（= 使其出局的 PlayerDied 的 Tick）；存活为 0。 */
  eliminatedTick: U64
}

/** 原型扩展（NON-CONTRACT，ADR 0031）：一局的结果。 */
export interface MatchResultsView {
  reason: MatchEndReason
  /** 领奖台中央 = rows[0].id。 */
  winner: U64
  rows: readonly MatchRankRow[]
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
  /** 原型扩展（NON-CONTRACT，ADR 0031）：一局的结果，只在 Settlement 非空。 */
  results?: MatchResultsView | null
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：当前在烧的火（光环在前、火墙在后）。 */
  FireZones?: readonly FireZoneView[]
}
