import { BlockType, BombKind, 方向 } from '../contract'
import type {
  AnimalId,
  BomberConfig,
  BomberEvent,
  CharacterId,
  CharacterPick,
  DeathCause,
  MatchPhase,
  PickupKind,
  ProtoRules,
  SkillId,
  SkillSlot,
} from '../contract'
import type { GridProbe } from '../shared/skill-geometry'
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
  // ---- 原型扩展（NON-CONTRACT，ADR 0030 / 0031）：角色与技能。全部进哈希（name / animal 除外，由角色派生）。----
  /** 选角：具体角色 / 'auto'（开局按均衡分配）/ null（无角色，旧夹具）。下一局 startMatch 生效。 */
  pick: CharacterPick | null
  /** 本局角色（开局由 roster.ts 定）。 */
  character: CharacterId | null
  /** 显示名 / 动物：由角色派生（每局重抽），不进哈希。 */
  name: string
  animal: AnimalId
  /** 面向：最近一次非停的移动输入（被挡也更新），闪现 / 冲刺朝它放。 */
  facing: 方向
  /** 三个技能槽；槽内对象不可变，整体替换。 */
  slots: Record<SkillSlot, SimSkillSlot | null>
  /** 主动技能冷却 [cdFromTick, cdUntilTick)：死亡不清，开局清。 */
  cdFromTick: number
  cdUntilTick: number
  /** 泡泡 / 光环 / 冻结 / 冻结后免疫：t < X 生效中；死亡、重生、开局清零。 */
  bubbleUntilTick: number
  auraUntilTick: number
  frozenUntilTick: number
  freezeImmuneUntilTick: number
  /** 连续站在别人火区里的 Tick 数；每满 burnInterval 烧一次（「每秒 −1 心」按暴露时长计），离开火区 / 受保护 / 泡泡中清零。 */
  burnTicks: number
  /** 回春计时 [regenFromTick, regenNextTick)；regenNextTick = 0 表示不在计时。 */
  regenFromTick: number
  regenNextTick: number
  /** 最近一次闪现 / 冲刺的 Tick（= teleportTick 时那次瞬移是闪现）。 */
  blinkTick: number
  /** 出局 Tick = 使其出局的死亡的 Tick（d.tick，RESOLUTIONS #4）；0 = 未出局。 */
  eliminatedTick: number
  // ---- 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹的状态。死亡、重生、开局清零（同冻结）；全部进哈希。----
  /** 中毒到此 Tick（不含）；0 = 没中毒。到期由 toxin.ts 清掉四个中毒字段。 */
  toxinUntilTick: number
  /** 中毒的击杀归属 = 最近一次命中的投弹者。 */
  toxinOwner: number
  /** 最近一次命中的中毒弹 id（DamageApplied / PlayerDied 的 SourceBomb；弹可能已销毁）。 */
  toxinBomb: number
  /** 下一次毒伤的 Tick；刷新持续时间不重置它（不叠加速率）。 */
  toxinNextTick: number
  /** 麻痹到此 Tick（不含）；0 = 没麻痹。 */
  shockUntilTick: number
  /** 麻痹期间的移速千分比（来自命中的麻痹弹）；没麻痹为 0。 */
  shockSlowPermille: number
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：技能槽里的一个技能（或组合技的一半）。 */
export interface SimSkillPart {
  readonly skill: SkillId
  readonly level: number
  /** 专属（或含专属的组合技）：不掉、不被替换。 */
  readonly bound: boolean
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：槽内容，不可变、整体替换。parts = 进化的两半（拾取组合技糖装上的为 null）。 */
export interface SimSkillSlot extends SimSkillPart {
  readonly parts: readonly SimSkillPart[] | null
}

/** 原型扩展（NON-CONTRACT，ADR 0030 / D8）：死亡结算 Tick 定下的一个技能掉落单位；keep = 掉落后槽里留下的。 */
export interface SimSkillDrop {
  readonly slot: SkillSlot
  readonly skill: SkillId
  readonly level: number
  readonly keep: SimSkillSlot | null
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：火焰冲刺留下的火墙，存续 [bornTick, untilTick)，主人死了也照烧、照记主人。 */
export interface SimFireWall {
  readonly id: number
  readonly owner: number
  readonly cells: readonly number[]
  readonly bornTick: number
  readonly untilTick: number
}

export interface SimBomb {
  readonly id: number
  readonly owner: number
  /** 被踢时会变（ADR 0030），其余时候不变。 */
  cell: number
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
  // ---- 原型扩展（NON-CONTRACT，ADR 0030）：炸弹槽技能与踢弹。----
  /** 契约 BombKind（冰冻弹 / 冰川弹 = Freeze，穿透弹 = Pierce；中毒弹 = Toxin、麻痹弹 = Shock 为 ADR 0033 扩值）。 */
  kind: BombKind
  /** 每臂多穿的砖层数（穿透规则见 contract/skills.ts 文件头）。 */
  pierceLayers: number
  /** 冻结 Tick 数（已夹到 freezeCap）；非冰冻弹为 0。 */
  freezeTicks: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：中毒持续 Tick 数；非中毒弹为 0。 */
  toxinTicks: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：麻痹持续 Tick 数；非麻痹弹为 0。 */
  shockTicks: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：麻痹移速千分比；非麻痹弹为 0。 */
  slowPermille: number
  /** 滑行方向；停 = 静止。 */
  kickDir: 方向
  /** 还要滑的格数。 */
  kickCellsLeft: number
  /** 朝下一格累计的千分格。 */
  kickAcc: number
  /** 最近一次踢它的玩家；0 = 没被踢过。 */
  kickedBy: number
}

export interface SimPickup {
  readonly id: number
  readonly cell: number
  readonly kind: PickupKind
  readonly bornTick: number
  /** 死者掉出的强化为死者 id，其余为 0。 */
  readonly droppedBy: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：kind = SkillCandy 时糖里的技能；其余 null。 */
  readonly skill: SkillId | null
  /** 原型扩展（NON-CONTRACT，ADR 0030）：技能糖等级；其余 0。 */
  readonly level: number
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
  /** 原型扩展（NON-CONTRACT，ADR 0030 / D8）：同一时刻定下的技能掉落（专属不掉；出局全掉）。 */
  readonly dropSkills: readonly SimSkillDrop[]
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0031 / design §4.2「掉线在决赛圈内等于出局」）：决赛圈或结算期中途退出的玩家，
 * 名次表仍要有他一行。match = 退出时的局序号（只算本局的）；Endgame 退出记为「退出 Tick 出局」（已出局者保留原出局 Tick），
 * Settlement 退出按退出前冻结的状态记。帽数取掉落之前的值。
 */
export interface SimDeparture {
  readonly match: number
  readonly id: number
  readonly eliminated: boolean
  readonly eliminatedTick: number
  readonly hats: number
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
  /** 原型扩展（NON-CONTRACT，ADR 0030）：场上的火焰冲刺火墙。 */
  fireWalls: SimFireWall[]
  nextId: number
  explodeSeq: number
  /** skill = 技能糖 / 技能掉落；roster = 每局角色分配（第 4 轮新增，旧流序列不变）。 */
  rng: { drop: Sfc32; spawn: Sfc32; chest: Sfc32; regen: Sfc32; skill: Sfc32; roster: Sfc32 }
  /** 本局开局时的可破坏砖数量（积木 + 木箱），资源触发决赛圈的分母。 */
  resourceInitial: number
  finalCircle: SimFinalCircle | null
  /** 本局决赛圈 / 结算期中途退出者（见 {@link SimDeparture}）；缺省 = 空，按需创建，只保留当前局的条目。 */
  departed?: SimDeparture[]
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

/**
 * 重置移动 / 放弹技能的普通字段（重生、开局摆位、死亡时）。泡泡 / 光环 / 冻结 / 烧伤节拍 / 回春计时 / 中毒 / 麻痹（ADR 0033）随之结束；
 * 冷却不清（CD 跨死亡保留，开局由 {@link resetSkillsForMatch} 清）。闪现不得调用它。
 */
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
  p.facing = 方向.下
  p.bubbleUntilTick = 0
  p.auraUntilTick = 0
  p.frozenUntilTick = 0
  p.freezeImmuneUntilTick = 0
  p.burnTicks = 0
  p.regenFromTick = 0
  p.regenNextTick = 0
  clearToxin(p)
  p.shockUntilTick = 0
  p.shockSlowPermille = 0
}

/** 原型扩展（NON-CONTRACT，ADR 0033）：解毒 / 到期——四个中毒字段归零。 */
export function clearToxin(p: SimPlayer): void {
  p.toxinUntilTick = 0
  p.toxinOwner = 0
  p.toxinBomb = 0
  p.toxinNextTick = 0
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

/** 炸弹构造（原型扩展字段缺省：标准弹、不穿透、不冻结、静止）。放弹与测试夹具都走它。 */
export function makeBomb(
  init: Pick<SimBomb, 'id' | 'owner' | 'cell' | 'bornTick' | 'fuseEndTick' | 'power'> &
    Partial<Pick<SimBomb, 'kind' | 'pierceLayers' | 'freezeTicks' | 'toxinTicks' | 'shockTicks' | 'slowPermille'>>,
): SimBomb {
  return {
    id: init.id,
    owner: init.owner,
    cell: init.cell,
    bornTick: init.bornTick,
    fuseEndTick: init.fuseEndTick,
    power: init.power,
    chainId: 0,
    explodedAtTick: 0,
    dangerUntilTick: 0,
    burnUntilTick: 0,
    reachUp: 0,
    reachDown: 0,
    reachLeft: 0,
    reachRight: 0,
    covered: [],
    hit: [],
    seq: 0,
    kind: init.kind ?? BombKind.Standard,
    pierceLayers: init.pierceLayers ?? 0,
    freezeTicks: init.freezeTicks ?? 0,
    toxinTicks: init.toxinTicks ?? 0,
    shockTicks: init.shockTicks ?? 0,
    slowPermille: init.slowPermille ?? 0,
    kickDir: 方向.停,
    kickCellsLeft: 0,
    kickAcc: 0,
    kickedBy: 0,
  }
}

/** 糖果构造（非技能糖 skill = null、level = 0）。 */
export function makePickup(
  init: Pick<SimPickup, 'id' | 'cell' | 'kind' | 'bornTick' | 'droppedBy'> & { skill?: SkillId | null; level?: number },
): SimPickup {
  const skill = init.skill ?? null
  return {
    id: init.id,
    cell: init.cell,
    kind: init.kind,
    bornTick: init.bornTick,
    droppedBy: init.droppedBy,
    skill,
    level: skill === null ? 0 : (init.level ?? 1),
  }
}

export function emptySlots(): Record<SkillSlot, SimSkillSlot | null> {
  return { bomb: null, active: null, passive: null }
}

/**
 * 开局：清空技能槽，专属技能以 Lv1、绑定装进它的槽；冷却 / 闪现 / 出局 Tick 归零（其余计时由 resetAbilityFields 清）。
 */
export function resetSkillsForMatch(p: SimPlayer, rules: Pick<ProtoRules, 'characters' | 'skills'>): void {
  p.slots = emptySlots()
  if (p.character !== null) {
    const skill = rules.characters[p.character].skill
    p.slots[rules.skills[skill].slot] = { skill, level: 1, bound: true, parts: null }
  }
  p.cdFromTick = 0
  p.cdUntilTick = 0
  p.blinkTick = 0
  p.eliminatedTick = 0
}

/** 技能几何的规则层探针（shared/skill-geometry.ts）：occupied = 未爆炸弹或宝箱。 */
export function gridProbe(w: World): GridProbe {
  return {
    size: w.size,
    brick: w.brick,
    ground: w.ground,
    occupied: (ci) => unexplodedBombAt(w, ci) || chestAt(w, ci) !== undefined,
  }
}

export function isBubbled(p: SimPlayer, t: number): boolean {
  return t < p.bubbleUntilTick
}

export function isFrozen(p: SimPlayer, t: number): boolean {
  return t < p.frozenUntilTick
}

/** 原型扩展（NON-CONTRACT，ADR 0033）：中毒中（t < toxinUntilTick）。 */
export function isPoisoned(p: SimPlayer, t: number): boolean {
  return t < p.toxinUntilTick
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：当前账移速 = 基础移速，麻痹中再乘 shockSlowPermille（向下取整）。
 * 快照 `玩家属性.移速当前` 发布它；水中减速不算在内（move.ts 移动时另乘，两者相乘）。
 */
export function currentSpeed(p: SimPlayer, t: number): number {
  return t < p.shockUntilTick ? Math.floor((p.speed * p.shockSlowPermille) / 1000) : p.speed
}
