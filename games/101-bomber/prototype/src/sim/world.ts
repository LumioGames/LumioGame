import { BlockType } from '../contract'
import type { BomberConfig, BomberEvent, DeathCause, MatchPhase, PickupKind, ProtoRules, 方向 } from '../contract'
import type { SimPlayerSpec } from './local-sim'
import type { SpawnZone } from './mapgen'
import type { Sfc32 } from './rng'
import type { TickTable } from './ticks'

/**
 * 规则替身的权威状态。位置一律整数千分格（格心 = X·1000 + 500），发布快照时才换成米；
 * 地形下标 = Y·size + X。只有本目录可见，表现层只看 `snapshot.ts` 产出的纯数据帧。
 */
export const CELL_MILLI = 1000
export const HALF_MILLI = 500

export interface SimPlayer {
  readonly id: number
  readonly spec: SimPlayerSpec
  mx: number
  my: number
  teleportTick: number
  // 玩家属性基础账（无修饰量，当前账 = 基础账）。
  health: number
  power: number
  speed: number
  capacity: number
  // BomberPlayerState（HatCount 是派生值，见 death-drops.ts hatCountOf，ADR 0028）
  respawnAtTick: number
  protectedUntilTick: number
  /** 死亡系统已处理、等待 RespawnAtTick。 */
  awaitingRespawn: boolean
  // 移动 / 放弹技能的普通字段（契约 §2.1：两端各算各的，不上网）。
  moveAcc: number
  lastDir: 方向
  pendingDir: 方向
  /** 契约 `转角缓冲剩余帧`。 */
  turnBuf: number
  lastAssistTick: number
  assistTol: number
  /** 放弹缓冲：t < bombBufUntil 时每 Tick 重试。 */
  bombBufUntil: number
  /** 连续站在水里的 Tick 数，溺水按它整除间隔扣血。 */
  waterTicks: number
  /** 连续站在安全圈外的 Tick 数，毒圈按它整除间隔扣血（回到圈内清零）。 */
  poisonTicks: number
  /**
   * 死亡掉落的炸弹+ 级数里，手上已不够扣、要从场上炸弹回手时抵扣的数量（design §8.5：容量 = 手上 + 场上未爆）。
   */
  capacityDebt: number
  /** 决赛圈内死亡即出局：本局不再复活、不参与任何交互（ADR 0025）。 */
  eliminated: boolean
}

export interface SimBomb {
  readonly id: number
  readonly owner: number
  readonly cell: number
  readonly bornTick: number
  readonly fuseEndTick: number
  readonly power: number
  chainId: number
  explodedAtTick: number
  dangerUntilTick: number
  burnUntilTick: number
  reachUp: number
  reachDown: number
  reachLeft: number
  reachRight: number
  /** 爆炸覆盖格（含中心），爆炸时写入；不进快照。 */
  covered: number[]
  /** 同弹命中记忆：契约 v2 规定为炸弹实体的普通字段，随炸弹销毁。 */
  hit: number[]
  /** 爆炸先后序号，危险窗判定按它遍历。 */
  seq: number
}

export interface SimPickup {
  readonly id: number
  readonly cell: number
  readonly kind: PickupKind
  readonly bornTick: number
  /** 死者掉出的强化为死者 id，其余为 0。 */
  readonly droppedBy: number
}

/** 决赛圈强力宝箱（design §4.2）：占格、挡路挡火，HitsRequired 次独立炸弹命中后开启。 */
export interface SimChest {
  readonly id: number
  readonly cell: number
  readonly hitsRequired: number
  readonly stageIndex: number
  readonly bornTick: number
  hitsLeft: number
  /** 已命中过的炸弹 id（同弹只算一次）。 */
  hitBy: number[]
  /** 打出最后一击的炸弹主人；未开启为 0。 */
  opener: number
}

export interface Rect {
  min: number
  max: number
}

/** 决赛圈状态（design §4.2）。触发后到下一局开局前一直存在。 */
export interface SimFinalCircle {
  readonly trigger: 'resource' | 'time'
  readonly startTick: number
  ring: Rect
  nextRing: Rect | null
  nextRingTick: number
  /** 已生效的最后一段序号（−1 = 仍是整个内场）。 */
  stageIndex: number
  /** 已预告过的段数。 */
  announced: number
}

export interface BrickWrite {
  readonly cell: number
  readonly block: BlockType
  readonly chainId: number
  readonly owner: number
}

export interface DamageEffect {
  readonly target: number
  readonly points: number
  readonly bomb: number
  readonly owner: number
  readonly chainId: number
  readonly cause: DeathCause
  /** 跨零时记为击杀者：炸弹主人；溺水为受害者自己。 */
  readonly killer: number
}

export interface PendingDeath {
  readonly victim: number
  readonly killer: number
  readonly tick: number
  /** 死亡结算 Tick 定下的掉落强化（design §8.5）：常规阶段逐级掷、出局全部；帽数随之减少（ADR 0028）。 */
  readonly dropKinds: readonly PickupKind[]
}

export interface SimMatch {
  index: number
  startTick: number
  endTick: number
  phase: MatchPhase
  hatKing: number
}

export interface World {
  readonly cfg: BomberConfig
  readonly rules: ProtoRules
  readonly ticks: TickTable
  readonly seed: number
  readonly size: number
  t: number
  match: SimMatch
  ground: Uint8Array
  brick: Uint8Array
  rev: number
  spawns: readonly SpawnZone[]
  players: SimPlayer[]
  bombs: SimBomb[]
  pickups: SimPickup[]
  chests: SimChest[]
  nextId: number
  explodeSeq: number
  rng: { drop: Sfc32; spawn: Sfc32; chest: Sfc32; regen: Sfc32 }
  /** 本局开局时的可破坏砖数量（积木 + 木箱），资源触发决赛圈的分母。 */
  resourceInitial: number
  finalCircle: SimFinalCircle | null
  /** ChainId → (玩家 id → 本链已结算伤害)，链的最后一颗弹销毁时清掉。 */
  chainDmg: Map<number, Map<number, number>>
  pendingDeaths: PendingDeath[]
  /** 帧末地形写批，按格去重（同帧同格只下一条），插入序 = 提交序。 */
  batch: Map<number, BrickWrite>
  effects: DamageEffect[]
  /** 本 Tick 产生的事件（含两 Tick 之间 removePlayer 产生的），发布时清空。 */
  out: BomberEvent[]
}

export function newId(w: World): number {
  return w.nextId++
}

export function emit(w: World, e: BomberEvent): void {
  w.out.push(e)
}

export function cellX(w: World, ci: number): number {
  return ci % w.size
}

export function cellY(w: World, ci: number): number {
  return Math.floor(ci / w.size)
}

export function cellIdx(w: World, x: number, y: number): number {
  return y * w.size + x
}

export function cellOfIdx(w: World, ci: number): { X: number; Y: number } {
  return { X: ci % w.size, Y: Math.floor(ci / w.size) }
}

export function centerMilli(c: number): number {
  return c * CELL_MILLI + HALF_MILLI
}

/** 契约 §1.2 `所在格`（数学 floor；千分格恒为正，floor 与截断此处等价但仍写 floor）。 */
export function playerCell(w: World, p: SimPlayer): number {
  return Math.floor(p.my / CELL_MILLI) * w.size + Math.floor(p.mx / CELL_MILLI)
}

export function isAlive(p: SimPlayer): boolean {
  return p.health > 0 && !p.eliminated
}

export function findPlayer(w: World, id: number): SimPlayer | undefined {
  for (const p of w.players) if (p.id === id) return p
  return undefined
}

export function unexplodedBombAt(w: World, ci: number): boolean {
  for (const b of w.bombs) if (b.cell === ci && b.explodedAtTick === 0) return true
  return false
}

export function anyBombAt(w: World, ci: number): boolean {
  for (const b of w.bombs) if (b.cell === ci) return true
  return false
}

export function chestAt(w: World, ci: number): SimChest | undefined {
  for (const c of w.chests) if (c.cell === ci) return c
  return undefined
}

/** 格上已有炸弹 / 糖果 / 宝箱之一（掉落与喷出物品不叠放）。 */
export function cellOccupied(w: World, ci: number): boolean {
  if (anyBombAt(w, ci) || chestAt(w, ci)) return true
  for (const it of w.pickups) if (it.cell === ci) return true
  return false
}

/** 可破坏砖存量（积木 + 木箱，砖层）。 */
export function countResource(w: World): number {
  let n = 0
  for (let c = 0; c < w.brick.length; c++) if (w.brick[c] === BlockType.积木 || w.brick[c] === BlockType.木箱) n++
  return n
}

/** 未出局玩家数（含重生倒计时中的）。 */
export function aliveCount(w: World): number {
  let n = 0
  for (const p of w.players) if (!p.eliminated) n++
  return n
}

/** 重置移动 / 放弹技能的普通字段（重生、开局摆位、死亡时）。 */
export function resetAbilityFields(p: SimPlayer): void {
  p.moveAcc = 0
  p.lastDir = 0
  p.pendingDir = 0
  p.turnBuf = 0
  p.lastAssistTick = -1000
  p.assistTol = 0
  p.bombBufUntil = 0
  p.waterTicks = 0
  p.poisonTicks = 0
}

export function resetAttributes(p: SimPlayer, cfg: BomberConfig): void {
  p.health = cfg.maxHealthPoints
  p.power = cfg.initialBombPower
  p.speed = cfg.speedTierToCellsPerSecond[0]
  p.capacity = cfg.initialBombCapacity
}

/** ADR 0029：死者掉出的强化在落地后 deathDropProtect 内免疫爆炸；其余掉落物为 0（随时可被炸毁）。 */
export function pickupProtectedUntil(w: World, it: SimPickup): number {
  return it.droppedBy !== 0 ? it.bornTick + w.ticks.deathDropProtect : 0
}
