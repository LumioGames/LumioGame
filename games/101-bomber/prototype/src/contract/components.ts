import type { U64 } from './ids'

/**
 * 组件面，字段名逐字照抄 C# 契约
 * `modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/Contracts/Components/*.cs`
 * 与 `docs/specs/bomber/stage0-kernel-contract.md` §1。时间一律 Tick，血量一律半心点。
 */

export const MatchPhase = { Warmup: 0, Running: 1, Endgame: 2, Settlement: 3 } as const
export type MatchPhase = (typeof MatchPhase)[keyof typeof MatchPhase]

export interface BomberMatchState {
  MatchTick: U64
  StartTick: U64
  EndTick: U64
  Phase: MatchPhase
  /** 0 = 无帽王。 */
  HatKingNetEntityIdRaw: U64
}

export interface BomberPlayerState {
  /**
   * ADR 0028：帽子不再是独立资源，HatCount = 当前强化级数之和（火力 / 炸弹数 / 速度高出初始值的级数），
   * 由规则层派生填写，表现层照旧按它画帽塔、排名、判帽王。
   */
  HatCount: number
  RespawnAtTick: U64
  ProtectedUntilTick: U64
}

/**
 * 0–4 为契约值。5 Toxin（中毒弹）/ 6 Shock（麻痹弹）是**原型扩展（NON-CONTRACT，ADR 0033）**：
 * 契约 BombKind 只到 4，扩值待契约修订；规则层按它在命中后下中毒 / 麻痹单。
 */
export const BombKind = { Standard: 0, Freeze: 1, Fire: 2, Pierce: 3, Split: 4, Toxin: 5, Shock: 6 } as const
export type BombKind = (typeof BombKind)[keyof typeof BombKind]

export interface BomberBombState {
  OwnerNetEntityIdRaw: U64
  FuseEndTick: U64
  Power: number
  ChainId: U64
  BombKind: BombKind
  PierceLayers: number
  /** 0 = 尚未爆炸。 */
  ExplodedAtTick: U64
  DangerUntilTick: U64
  BurnUntilTick: U64
  /** 传播算完后的实际臂长（已含地形阻断）；上 = 游戏 −Y。 */
  ReachUp: number
  ReachDown: number
  ReachLeft: number
  ReachRight: number
}

export interface BomberHatPile {
  Count: number
  ExpireAtTick: U64
}

/**
 * 0–2 为契约值；3 血包是**原型扩展**（design §8.5 Stage 1，契约 Kind 只到 2）。
 * 4 SkillCandy 是**原型扩展（NON-CONTRACT，ADR 0030）**：技能糖，具体技能与等级在 `PickupView.skill`。
 */
export const PickupKind = { FirePlus: 0, BombPlus: 1, SpeedPlus: 2, HealthPack: 3, SkillCandy: 4 } as const
export type PickupKind = (typeof PickupKind)[keyof typeof PickupKind]

/**
 * 原型扩展（NON-CONTRACT，ADR 0030 / 0028）：是不是强化（火力 / 炸弹 / 速度）。帽数 = 强化级数，
 * 血包与技能糖都不算帽子（D5）——凡是「除血包以外都是强化」的旧写法一律改用它。
 */
export function isPowerupKind(k: PickupKind): boolean {
  return k === PickupKind.FirePlus || k === PickupKind.BombPlus || k === PickupKind.SpeedPlus
}

export interface BomberPickupItem {
  Kind: PickupKind
}

/**
 * `玩家属性 : AttributeComponent` 的当前账（契约 §1.3，Scope.Aoi，所有人可见）。
 * 基础账（Scope.Owner）只对本机玩家可见，见 {@link 玩家属性基础账}。
 */
export interface 玩家属性当前账 {
  /** 半心点。 */
  血量当前: number
  /** 十字每臂格数。 */
  火力当前: number
  /**
   * 千分格/秒。原型扩展（NON-CONTRACT，ADR 0033）：麻痹中 = 移速基础 × 麻痹弹 slowPermille（修饰只进当前账）；
   * 水中减速不进这里（规则层移动时另乘）。
   */
  移速当前: number
  /** 同时在场上限中尚未放出的数量。 */
  手上炸弹数当前: number
}

export interface 玩家属性基础账 {
  血量基础: number
  火力基础: number
  移速基础: number
  手上炸弹数基础: number
}

/**
 * `LogicTransform`：位置唯一真值，米，Y 轴朝上、XZ 水平（契约 §1.2）。
 * 游戏 (X, Y, Z) → 引擎 (x = X, z = Y, y = Z + 1)；实体恒在游戏 Z = 0，即 y = 1。
 * 格子不存字段，一律由 `shared/grid.ts` 的 `cellOf` 推导（数学 floor）。
 */
export interface LogicTransform {
  WorldPosition: { x: number; y: number; z: number }
}

/**
 * 方块类型（契约 §6.1 九种方块）。地形分两层：地面层（游戏 z = −1）只会是 地面 / 水 / 冰，
 * 砖层（游戏 z = 0）只会是 Air / 铁皮 / 积木 / 木箱 / 木头 / 鞭炮。
 */
export const BlockType = { Air: 0, 铁皮: 1, 积木: 2, 木箱: 3, 木头: 4, 鞭炮: 5, 地面: 6, 水: 7, 冰: 8 } as const
export type BlockType = (typeof BlockType)[keyof typeof BlockType]
