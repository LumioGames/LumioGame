import type { CharacterDef, CharacterId, ComboDef, SkillDef, SkillId, SourceNote } from './skills'
import { CHARACTERS, COMBOS, SKILLS } from './skills'

/**
 * 配表。`BomberConfig` 的键名与首轮默认值逐字照抄
 * `docs/specs/bomber/stage0-kernel-contract.md` §5（全部整数，时间为毫秒，速度为千分格/秒）。
 * 数值全部是 design.md §15 口径下的「推断待验证」。
 */
export interface BomberConfig {
  fuseMs: number
  dangerWindowMs: number
  initialBombPower: number
  initialBombCapacity: number
  /** 千分格/秒；Tier0 = 3500。 */
  speedTierToCellsPerSecond: readonly number[]
  respawnMs: number
  respawnProtectionMs: number
  hatPileExpireMs: number
  matchDurationMs: number
  inputBufferMs: number
  tickRateHz: number
  /** 半心点；6 点 = 3 颗心。 */
  maxHealthPoints: number
  healthPointsPerHeart: number
  drownIntervalMs: number
  drownPointsPerInterval: number
  dropRatePermille: number
  hatPileMinStacks: number
  hatPileMaxStacks: number
  mapSize: number
  coverReachCells: number
}

export const DEFAULT_CONFIG: BomberConfig = {
  fuseMs: 2100,
  dangerWindowMs: 400,
  initialBombPower: 2,
  initialBombCapacity: 1,
  speedTierToCellsPerSecond: [3500],
  respawnMs: 3000,
  respawnProtectionMs: 3000,
  hatPileExpireMs: 15000,
  matchDurationMs: 360000,
  inputBufferMs: 125,
  tickRateHz: 20,
  maxHealthPoints: 6,
  healthPointsPerHeart: 2,
  drownIntervalMs: 1000,
  drownPointsPerInterval: 1,
  dropRatePermille: 300,
  hatPileMinStacks: 3,
  hatPileMaxStacks: 6,
  mapSize: 19,
  coverReachCells: 10,
}

/**
 * **原型扩展（NON-CONTRACT）**：契约 §5 没有收录、但 design.md 已给出数值（或原型必须自定）的规则参数。
 * 每一项注明出处；将来要么提给契约配表，要么随 TS 替身一起删除。
 */
export interface ProtoRules {
  /** design §7.1：每颗炸弹 −1 心 = −2 点，与火力无关。 */
  bombDamagePoints: number
  /** design §10：火力上限。 */
  powerCap: number
  /** design §10：炸弹数上限（手上 + 场上在引信中的）。 */
  capacityCap: number
  /** design §8.5：速度+ 每颗 +0.35 格/秒 = 350 千分格/秒。 */
  speedStepMilli: number
  /** design §10：移速上限 6.0 格/秒。 */
  speedCapMilli: number
  /** design §8.5（Stage 1）：血包回 1 心 = 2 点。 */
  healthPackPoints: number
  /** design §5：软砖随机填充剩余空格的 65%。 */
  softBrickPermille: number
  /** design §5：出生 / 重生点距任一玩家与炸弹 ≥ 6 格（曼哈顿）。 */
  spawnMinDistance: number
  /** design §7.4 / §8.2：糖果池内权重（原型取值：火力 30 / 炸弹 30 / 速度 25 / 血包 15）。 */
  pickupWeights: Readonly<Record<PickupKindName, number>>
  /** design §5.1（Stage 2）：水方格移速 −30% → 乘 700‰。 */
  waterSpeedPermille: number
  /** design §5.3 断言 2（Stage 2）：每象限木箱数区间 [min, max]。 */
  cratesPerQuadrant: readonly [number, number]
  /** design §5.3 断言 2–3（Stage 2）：每象限池塘格数区间 [min, max]；总量 ≤ 5%。 */
  pondCellsPerQuadrant: readonly [number, number]
  /** 契约 Phase 0 Warmup：开局倒数（原型取值）。 */
  warmupMs: number
  /**
   * design §5 软砖再生（ADR 0026：19×19 档也做）：常规阶段每 regenIntervalMs 在无人区域补回至多
   * regenOrbitsPerInterval 组镜像积木，直到剩余量回到开局的 regenTargetPermille；
   * 距时间触发还剩 regenStopBeforeFinalMs 时停止再生，资源触发只在再生停止后生效。
   * 原型扩展（NON-CONTRACT，ADR 0035）：regenStopBeforeFinalMs 60 s → 20 s（用户 2026-09-27「约 2 分钟开圈」：
   * 4 分钟局里再生约 1:45 停，资源触发从 1:45 起可生效、时间触发 2:05，决赛圈约 1:45–2:05 开始；推断待验证）。
   */
  regenIntervalMs: number
  regenTargetPermille: number
  regenOrbitsPerInterval: number
  regenStopBeforeFinalMs: number
  /**
   * design §4.2（ADR 0025）：决赛圈 = Phase 2 Endgame，固定时长；资源先触发时局终同步提前。
   * 原型扩展（NON-CONTRACT，ADR 0031）：90 s → 115 s（D7；推断待验证）。时间触发 = 局时上限 − 115 s
   * （ADR 0035：4 分钟局的 2:05）。
   */
  finalCircleMs: number
  /** design §4.2：剩余可破坏砖（积木 + 木箱）< 开局数量 × 该千分比时触发决赛圈。 */
  finalCircleResourcePermille: number
  /**
   * design §4.2：安全圈分段收缩。`atMs` 为相对决赛圈开始的生效时刻，`size` 为以棋盘中心为心的正方形边长（格）。
   * 每段在生效前 `ringPreviewMs` 预告。触发时安全圈 = 整个内场。
   * 原型扩展（NON-CONTRACT，ADR 0031）：每段另带宝箱 / 清场 / 毒强度三个标志，见 {@link RingStage}。
   */
  ringStages: readonly RingStage[]
  ringPreviewMs: number
  /** design §4.2 / §12：圈外毒 —— 每 poisonIntervalMs 扣 poisonPointsPerInterval 点；重生保护不免疫。 */
  poisonIntervalMs: number
  poisonPointsPerInterval: number
  /** design §4.2：强力宝箱开启所需的独立炸弹命中数，以及开启后喷出的物品。 */
  chestHitsRequired: number
  chestLoot: readonly PickupKindName[]
  /** design §8.5（ADR 0025）：死亡时已吃强化每级掉落概率（千分比）。 */
  deathPowerupDropPermille: number
  /** design §7.4 / §8.5（ADR 0029）：死者掉出的强化落地后这段时间内不会被爆炸摧毁。 */
  deathDropProtectMs: number
  /** design §4.1 / §13：结算共约 16 秒 = 领奖台 podiumMs + 结算表，之后自动下一局。 */
  settlementMs: number
  /** design §13：结算前段的领奖台展示时长（纯表现，规则层不读）。 */
  podiumMs: number
  /**
   * design §6.1 转角修正：偏离通道中心 ≤ 该值（千分格）时自动吸附。
   * 原型扩展（NON-CONTRACT，ADR 0032）：400 → 500（用户第 4 轮 D10：半格内都能拐）。
   */
  cornerAssistMilli: number
  /**
   * design §6.1「连续转角只做轻度吸附」：assistRepeatWindowTicks 内再次吸附时的阈值。
   * 原型扩展（NON-CONTRACT，ADR 0032）：200 → 250（保持 2:1；推断待验证）。
   */
  cornerAssistRepeatMilli: number
  /** 原型扩展（NON-CONTRACT，ADR 0032）：「连续转角」的窗口 Tick 数（原 move.ts 常量 6；推断待验证）。 */
  assistRepeatWindowTicks: number
  /** 契约 §2.1 `转角缓冲剩余帧`：提前按下的垂直方向保留的帧数。 */
  turnBufferTicks: number
  /** design §9.3：帽王光柱阈值 N（待验证）；纯表现阈值，帽王判定本身不看它。 */
  hatKingPillarMinHats: number
  /**
   * 本局人数（你 + Bot）。DEFAULT_RULES = 19 档 8 人；原型扩展（NON-CONTRACT，ADR 0040）：页面按 `?map=` / `?bots=` 经
   * {@link rulesForMap} 写入（默认 27 档 16 人，app/params.ts）。
   */
  playerCount: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0031 → ADR 0035）：局时上限。ADR 0031 定 7 分钟（420000）；ADR 0035 改为 4 分钟（240000，
   * 用户 2026-09-27 试玩反馈「为啥不缩圈呢，时间太久了」→「约 2 分钟开圈」）。契约 `DEFAULT_CONFIG.matchDurationMs` 仍是 360000，
   * 由 {@link protoConfig} 覆盖（待契约修订）；推断待验证。
   */
  matchCapMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：四个角色（= skills.ts CHARACTERS）。 */
  characters: Readonly<Record<CharacterId, CharacterDef>>
  /** 原型扩展（NON-CONTRACT，ADR 0030）：技能表（= skills.ts SKILLS）。 */
  skills: Readonly<Record<SkillId, SkillDef>>
  /** 原型扩展（NON-CONTRACT，ADR 0030）：组合技配方（= skills.ts COMBOS）。 */
  combos: readonly ComboDef[]
  /** 原型扩展（NON-CONTRACT，ADR 0030）：基础技能最高等级（design §8.3）。 */
  skillMaxLevel: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：木箱 / 宝箱掉出的技能糖等级（design §8.2）。 */
  skillCandyLevel: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：木箱掉落中技能糖所占千分比（「一半是技能糖」，A/B 300 / 700；推断待验证）。 */
  crateSkillCandyPermille: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：每个决赛圈宝箱额外喷出的技能糖数（D14）。 */
  chestSkillCandies: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0033）：决赛圈宝箱喷出的技能糖从哪个池抽——'bomb' = 保底炸弹类（contract/skills.ts
   * bombCandyPool，冰冻 / 穿透 / 中毒 / 麻痹按权重）；'all' = 整个技能糖池（ADR 0030 原口径）。推断待验证。
   */
  chestSkillCandyPool: 'bomb' | 'all'
  /** 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹的中毒掉血间隔（推断待验证）。 */
  toxinIntervalMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：每次中毒掉的半心点（每秒 −0.5 心，可致死，Cause = Toxin；推断待验证）。 */
  toxinPointsPerInterval: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：常规阶段死亡时每个可掉技能单位的掉落千分比（D8，同 §8.2）。 */
  skillDeathDropPermille: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火墙的烧伤间隔（design §12 留火 1 秒）。 */
  burnIntervalMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：每次烧伤的半心点（design §12 留火 −1 心 / 秒，可致死，Cause = Burn）。 */
  burnPointsPerInterval: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：单次冻结上限（design §8.4 冰冻上限 1.2 秒）。 */
  freezeCapMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：每次冻结结束后的控制免疫（design §8.4「短暂控制免疫」；推断待验证）。 */
  freezeImmuneMs: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：冰冻弹 / 冰川弹照常扣血再冻住幸存者（第 4 轮 Q1 裁定，偏离 design §8.4「不扣心」）；
   * 同一颗弹的伤害不解冻，之后的伤害解冻。false = 回到 §8.4 口径。
   */
  freezeBombDamages: boolean
  /** 原型扩展（NON-CONTRACT，ADR 0030）：被踢炸弹的滑行速度（千分格 / 秒；推断待验证）。 */
  kickSpeedMilli: number
  /** 原型扩展（NON-CONTRACT，ADR 0032）：玩偶可视脚印 / 脚圈直径（千分格，D10；纯表现，规则层不读）。 */
  dollFootprintMilli: number
  /** 原型扩展（NON-CONTRACT，ADR 0032）：玩偶可向前探出格心的最大距离（千分格；纯表现，规则层不读）。 */
  dollReachMilli: number
  // ---- 方向 B · M1（ADR 0039 / 0040，design §5.0 / §8.5 / §8.6 / §12）。全部推断待验证（design §15）。----
  /** 原型扩展（NON-CONTRACT，ADR 0039）：每这么多顶帽子心数上限 +1 心（{@link maxHealthFor}）。 */
  heartsPerHats: number
  /** 原型扩展（NON-CONTRACT，ADR 0039）：帽子最多加的心数。 */
  maxHatHearts: number
  /** 原型扩展（NON-CONTRACT，ADR 0039）：金心最多颗数（= 最多加的心数）；满了金心拾不起、留在地上。 */
  maxGoldHearts: number
  /** 原型扩展（NON-CONTRACT，ADR 0039 / 0043）：心数上限 ≥ 该心数即 Boss（头顶常驻心条、被击倒全场播报；{@link isBoss}）。 */
  bossMinHearts: number
  /** 原型扩展（NON-CONTRACT，ADR 0039 / 0040）：金箱开出金心的概率（‰）。 */
  goldBoxGoldHeartPermille: number
  /** 原型扩展（NON-CONTRACT，ADR 0039，design §4.2）：决赛圈强力宝箱喷出金心的概率（‰）。 */
  powerChestGoldHeartPermille: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：三级资源箱开箱后的内容（金心另见 goldBoxGoldHeartPermille）。
   * 「糖果」按 pickupWeights 抽（含血包）；「特殊炸弹」在 ADR 0041 落地前 = 炸弹类技能糖（skills.ts bombCandyPool）。
   */
  boxLoot: Readonly<Record<ResourceBoxTier, BoxLoot>>
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.6）：中央大补给全场预告时刻（相对开局 BomberMatchState.StartTick）。 */
  supplyAnnounceMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.6）：中央大补给开启喷发时刻（相对开局）；每局 1 次，只在 map.centralSupply 的档。 */
  supplyOpenMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0039 / 0040，design §8.6）：中央大补给的战利品表（公开喷发，谁捡归谁）。 */
  supplyLoot: SupplyLoot
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.5）：狂暴持续时长（吃到狂暴糖即回满血并进入狂暴）。 */
  frenzyMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.5）：狂暴炸弹的引信（遥控弹也按它自爆）。 */
  frenzyFuseMs: number
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.5）：狂暴期间额外可放的炸弹数（取 6–8 的下限；不计炸弹数与帽数）。 */
  frenzyExtraBombs: number
  /** 原型扩展（NON-CONTRACT，ADR 0040，design §8.5）：狂暴期间两次放弹的最小间隔（Tick；5 Tick @20 Hz = 每秒 ≤ 4 颗）。 */
  frenzyMinIntervalTicks: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0040）：本局地图档（棋盘、三圈、资源箱、再生、段表、补给）。由 {@link rulesForMap} 选档；
   * {@link protoConfig} 据它写 `mapSize`。`DEFAULT_RULES.map` = 19 档（旧测试的规则对象）；页面默认 27 档见 app/params.ts DEFAULT_PAGE_MAP。
   */
  map: MapTierRules
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：一种资源箱开出的东西。
 */
export interface BoxLoot {
  /** 必出的糖果数（按 pickupWeights 抽，含血包）。 */
  candies: number
  /** 出 1 颗特殊炸弹的概率（‰；1000 = 必出，0 = 不出）。 */
  specialBombPermille: number
}

/** 原型扩展（NON-CONTRACT，ADR 0039 / 0040，design §8.6）：中央大补给战利品（各项件数）。 */
export interface SupplyLoot {
  /** 数值糖（火力+ / 炸弹+ / 速度+，按 pickupWeights 里这三项的权重抽；血包另列）。 */
  candies: number
  healthPacks: number
  frenzy: number
  /** 特殊炸弹（ADR 0041 落地前 = 炸弹类技能糖）。 */
  specialBombs: number
  goldHearts: number
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：地图档 = 棋盘边长（含外圈铁皮）。URL `?map=19|23|27`（{@link parseMapTier}）。 */
export type MapTierId = 19 | 23 | 27

/** 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：三圈——按到棋盘中心的切比雪夫距离 d 划分（{@link ringZoneOf}）。 */
export type RingZone = 'core' | 'mid' | 'outer'

/** 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：资源箱三级——外圈木箱 / 中圈铁箱 / 核心金箱（{@link ZONE_BOX}）。 */
export type ResourceBoxTier = 'wood' | 'iron' | 'gold'

/** 原型扩展（NON-CONTRACT，ADR 0040）：每圈长的资源箱等级。 */
export const ZONE_BOX: Readonly<Record<RingZone, ResourceBoxTier>> = { outer: 'wood', mid: 'iron', core: 'gold' }

/** 原型扩展（NON-CONTRACT，ADR 0040）：三圈半径（切比雪夫距离 d，格）。 */
export interface ZoneRadii {
  /** d ≤ coreMaxD 为核心。 */
  coreMaxD: number
  /** coreMaxD < d ≤ midMaxD 为中圈；d > midMaxD 为外圈。 */
  midMaxD: number
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §4.2 / §5 / §5.0 / §8.6）：一个地图档的全部布局参数（{@link MAP_TIERS}）。
 * 数量一律四象限镜像；除注明「引用」外全部推断待验证（design §15）。
 */
export interface MapTierRules {
  id: MapTierId
  /** 棋盘边长（含外圈铁皮）= `BomberConfig.mapSize`。 */
  size: number
  /** 该档默认人数（你 + Bot）。 */
  defaultPlayers: number
  zones: ZoneRadii
  /** 每级资源箱的数量（四象限镜像，外圈木 / 中圈铁 / 核心金）与开箱所需的独立炸弹命中数（同链多颗各算一次）。 */
  boxes: Readonly<Record<ResourceBoxTier, { count: number; hits: number }>>
  /** 各圈积木掉率（‰）；取代单一的契约 `dropRatePermille`（sim/pickup.ts spawnDrops 按积木所在圈取）。 */
  brickDropPermille: Readonly<Record<RingZone, number>>
  /** 每次再生补回的镜像组数（= 生效时的 `ProtoRules.regenOrbitsPerInterval`）。 */
  regenOrbitsPerInterval: number
  /** 再生的每一组有 1 / regenBoxOneIn 的机会长成当圈等级的资源箱（整数分母，确定性抽 NextInt(0, n) === 0）。 */
  regenBoxOneIn: number
  /** 决赛圈段表（= 生效时的 `ProtoRules.ringStages`）。 */
  ringStages: readonly RingStage[]
  /** 决赛圈强力宝箱总数（= ringStages 里 chest 为真的段数，tests/contract-tables 守一致）。 */
  powerChests: number
  /** 是否有中央大补给（ADR 0040：只在 27 档）。 */
  centralSupply: boolean
  /** 核心中央空地广场边长（中央大补给落点）；0 = 无广场。 */
  plazaSide: number
  src: SourceNote
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：安全圈一段。`chest` = 预告时落强力宝箱；`clearInside` = 生效时把新圈内的
 * 积木 / 木箱直接清空（保证 1×1 可进入）；`poisonPoints` = 该段生效后圈外每次毒伤的半心点。
 */
export interface RingStage {
  atMs: number
  size: number
  chest: boolean
  clearInside: boolean
  poisonPoints: number
}

export type PickupKindName = 'FirePlus' | 'BombPlus' | 'SpeedPlus' | 'HealthPack'

/** 决赛圈段标志的常见组合：5×5 起清场、毒翻倍（ADR 0031），1×1 不落宝箱。 */
const stage = (atMs: number, size: number): RingStage => ({
  atMs,
  size,
  chest: size > 1,
  clearInside: size <= 5,
  poisonPoints: size <= 5 ? 2 : 1,
})

/** 19×19 档段表（ADR 0031，D7）：13 → 9 → 7 → 5 → 3 → 1；时刻推断待验证。= DEFAULT_RULES.ringStages。 */
const RING_STAGES_19: readonly RingStage[] = [
  { atMs: 10000, size: 13, chest: true, clearInside: false, poisonPoints: 1 },
  { atMs: 35000, size: 9, chest: true, clearInside: false, poisonPoints: 1 },
  { atMs: 55000, size: 7, chest: true, clearInside: false, poisonPoints: 1 },
  { atMs: 75000, size: 5, chest: true, clearInside: true, poisonPoints: 2 },
  { atMs: 95000, size: 3, chest: true, clearInside: true, poisonPoints: 2 },
  { atMs: 110000, size: 1, chest: false, clearInside: true, poisonPoints: 2 },
]

/** 原型扩展（NON-CONTRACT，ADR 0040，design §4.2）：各档每级资源箱的开箱命中数（木 1 / 铁 1 / 金 2）。 */
const BOX_HITS = { wood: 1, iron: 1, gold: 2 } as const
/** 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：各圈积木掉率——外圈 25% / 中圈 35% / 核心 45%。 */
const ZONE_BRICK_DROP: Readonly<Record<RingZone, number>> = { outer: 250, mid: 350, core: 450 }

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §4.2 / §5 / §5.0 / §8.6）：三个地图档。
 * 27 档是 ADR 0040 的原型默认（16 人）；19 档是现行默认（8 人，段表不变）；23 档只在 `?map=23` 时用。
 * 19 / 23 档的箱数与 23 档的三圈半径设计稿没给：按 design §5.0「箱数按面积缩放」派生（内场面积比 289 / 441 : 625，
 * 取最接近的 4 的倍数且至少 4）、三圈取 19 与 27 两档的中值——推断待验证（按 design §5.0 面积缩放派生）。
 */
export const MAP_TIERS: Readonly<Record<MapTierId, MapTierRules>> = {
  19: {
    id: 19,
    size: 19,
    defaultPlayers: 8,
    zones: { coreMaxD: 2, midMaxD: 5 },
    boxes: { wood: { count: 8, hits: BOX_HITS.wood }, iron: { count: 4, hits: BOX_HITS.iron }, gold: { count: 4, hits: BOX_HITS.gold } },
    brickDropPermille: ZONE_BRICK_DROP,
    regenOrbitsPerInterval: 2,
    regenBoxOneIn: 6,
    ringStages: RING_STAGES_19,
    powerChests: 5,
    centralSupply: false,
    plazaSide: 0,
    src: '引用 ADR 0040：三圈 ≤2 / 3–5 / ≥6、掉率 25 / 35 / 45%、再生 2 组、约 1/6 长箱、段表不变（强力宝箱 5）；箱数 8 / 4 / 4 推断待验证（按 design §5.0 面积缩放派生）',
  },
  23: {
    id: 23,
    size: 23,
    defaultPlayers: 12,
    zones: { coreMaxD: 3, midMaxD: 6 },
    boxes: { wood: { count: 12, hits: BOX_HITS.wood }, iron: { count: 8, hits: BOX_HITS.iron }, gold: { count: 4, hits: BOX_HITS.gold } },
    brickDropPermille: ZONE_BRICK_DROP,
    regenOrbitsPerInterval: 3,
    regenBoxOneIn: 6,
    ringStages: [stage(10000, 15), stage(30000, 11), stage(50000, 7), stage(75000, 5), stage(95000, 3), stage(110000, 1)],
    powerChests: 5,
    centralSupply: false,
    plazaSide: 0,
    src: '引用 ADR 0040：段表 +10/30/50/75/95/110 s → 15/11/7/5/3/1、再生 3 组、约 1/6 长箱；三圈 ≤3 / 4–6 / ≥7、箱数 12 / 8 / 4、默认 12 人推断待验证（按 design §5.0 面积缩放派生）',
  },
  27: {
    id: 27,
    size: 27,
    defaultPlayers: 16,
    zones: { coreMaxD: 4, midMaxD: 8 },
    boxes: { wood: { count: 16, hits: BOX_HITS.wood }, iron: { count: 12, hits: BOX_HITS.iron }, gold: { count: 4, hits: BOX_HITS.gold } },
    brickDropPermille: ZONE_BRICK_DROP,
    regenOrbitsPerInterval: 4,
    regenBoxOneIn: 6,
    ringStages: [stage(10000, 19), stage(30000, 13), stage(45000, 9), stage(60000, 7), stage(75000, 5), stage(95000, 3), stage(110000, 1)],
    powerChests: 6,
    centralSupply: true,
    plazaSide: 3,
    src: '引用 ADR 0040：16 人、三圈 ≤4 / 5–8 / ≥9、木 16 / 铁 12 / 金 4、再生 4 组、约 1/6 长箱、段表 19/13/9/7/5/3/1、强力宝箱 6、中央 3×3 广场与大补给；数值推断待验证',
  },
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：`DEFAULT_RULES` 的档（19，旧测试的规则对象）与 {@link parseMapTier} 的缺省回退。
 * 页面默认是 27 档 16 人（ADR 0040），由 app/params.ts 的 DEFAULT_PAGE_MAP 传给 parseMapTier。
 */
export const DEFAULT_MAP_TIER: MapTierId = 19

export const DEFAULT_RULES: ProtoRules = {
  bombDamagePoints: 2,
  powerCap: 6,
  capacityCap: 6,
  speedStepMilli: 350,
  speedCapMilli: 6000,
  healthPackPoints: 2,
  softBrickPermille: 650,
  spawnMinDistance: 6,
  pickupWeights: { FirePlus: 30, BombPlus: 30, SpeedPlus: 25, HealthPack: 15 },
  waterSpeedPermille: 700,
  cratesPerQuadrant: [3, 4],
  pondCellsPerQuadrant: [3, 4],
  warmupMs: 3000,
  regenIntervalMs: 8000,
  regenTargetPermille: 600,
  regenOrbitsPerInterval: 2,
  // ADR 0035：60000 → 20000（再生约 1:45 停；推断待验证）。
  regenStopBeforeFinalMs: 20000,
  finalCircleMs: 115000,
  finalCircleResourcePermille: 200,
  // ADR 0031（D7）：13 → 9 → 7 → 5 → 3 → 1；5×5 起清场、毒翻倍，1×1 不落宝箱。时刻推断待验证。
  ringStages: RING_STAGES_19,
  ringPreviewMs: 10000,
  poisonIntervalMs: 1000,
  poisonPointsPerInterval: 1,
  chestHitsRequired: 3,
  chestLoot: ['FirePlus', 'BombPlus', 'SpeedPlus', 'HealthPack'],
  deathPowerupDropPermille: 500,
  deathDropProtectMs: 3000,
  settlementMs: 16000,
  podiumMs: 10000,
  cornerAssistMilli: 500,
  cornerAssistRepeatMilli: 250,
  assistRepeatWindowTicks: 6,
  turnBufferTicks: 6,
  hatKingPillarMinHats: 3,
  playerCount: 8,
  // ADR 0035：420000 → 240000（4 分钟封顶，时间触发 2:05；推断待验证）。
  matchCapMs: 240000,
  characters: CHARACTERS,
  skills: SKILLS,
  combos: COMBOS,
  skillMaxLevel: 3,
  skillCandyLevel: 1,
  crateSkillCandyPermille: 500,
  chestSkillCandies: 1,
  chestSkillCandyPool: 'bomb',
  toxinIntervalMs: 1000,
  toxinPointsPerInterval: 1,
  skillDeathDropPermille: 500,
  burnIntervalMs: 1000,
  burnPointsPerInterval: 2,
  freezeCapMs: 1200,
  freezeImmuneMs: 1000,
  freezeBombDamages: true,
  kickSpeedMilli: 8000,
  dollFootprintMilli: 700,
  dollReachMilli: 350,
  // 方向 B · M1（ADR 0039：帽子 +2 / 金心 +3、封顶 8 心、Boss ≥ 6 心；ADR 0040：三级箱、中央补给、狂暴糖）。推断待验证。
  heartsPerHats: 4,
  maxHatHearts: 2,
  maxGoldHearts: 3,
  bossMinHearts: 6,
  goldBoxGoldHeartPermille: 200,
  powerChestGoldHeartPermille: 200,
  boxLoot: {
    wood: { candies: 1, specialBombPermille: 0 },
    iron: { candies: 1, specialBombPermille: 500 },
    gold: { candies: 2, specialBombPermille: 1000 },
  },
  supplyAnnounceMs: 50000,
  supplyOpenMs: 60000,
  supplyLoot: { candies: 5, healthPacks: 2, frenzy: 1, specialBombs: 2, goldHearts: 1 },
  frenzyMs: 6000,
  frenzyFuseMs: 1200,
  frenzyExtraBombs: 6,
  frenzyMinIntervalTicks: 5,
  map: MAP_TIERS[DEFAULT_MAP_TIER],
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：按地图档取规则——段表、再生组数、人数与 `map` 换成该档的值，其余照 base。
 * `players` 缺省 = 该档默认人数。`rulesForMap(DEFAULT_RULES, 19, 8)` 与 `DEFAULT_RULES` 逐项相等（默认档不变）。
 * 宿主还要用 `protoConfig(rules)` 让 `mapSize` 跟上。
 */
export function rulesForMap(base: ProtoRules, size: MapTierId, players: number = MAP_TIERS[size].defaultPlayers): ProtoRules {
  const map = MAP_TIERS[size]
  return { ...base, map, ringStages: map.ringStages, regenOrbitsPerInterval: map.regenOrbitsPerInterval, playerCount: players }
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：`?map=` → 地图档；未知或空 → fallback（缺省 {@link DEFAULT_MAP_TIER}）。 */
export function parseMapTier(v: string | null, fallback: MapTierId = DEFAULT_MAP_TIER): MapTierId {
  const s = v?.trim()
  return s === '19' || s === '23' || s === '27' ? (Number(s) as MapTierId) : fallback
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：格 (x, y) 到棋盘中心的切比雪夫距离（边长为奇数，中心 = (size − 1) / 2）。 */
export function centerDistance(size: number, x: number, y: number): number {
  const c = (size - 1) / 2
  return Math.max(Math.abs(x - c), Math.abs(y - c))
}

/** 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：距离 d 落在哪一圈。 */
export function ringZoneOf(zones: ZoneRadii, d: number): RingZone {
  return d <= zones.coreMaxD ? 'core' : d <= zones.midMaxD ? 'mid' : 'outer'
}

type HeartRules = Pick<ProtoRules, 'heartsPerHats' | 'maxHatHearts' | 'maxGoldHearts'>
type HeartConfig = Pick<BomberConfig, 'maxHealthPoints' | 'healthPointsPerHeart'>

/**
 * 原型扩展（NON-CONTRACT，ADR 0039，design §12）：每人心数上限（半心点）=
 * maxHealthPoints + healthPointsPerHeart · (min(maxHatHearts, ⌊帽数 / heartsPerHats⌋) + min(maxGoldHearts, 金心数))，
 * 首轮默认 6 + 2·min(2, ⌊帽数/4⌋) + 2·min(3, 金心数) = 6–16 点（3–8 心）。纯函数：规则层、Bot、HUD 共用。
 */
export function maxHealthFor(cfg: HeartConfig, rules: HeartRules, hats: number, goldHearts: number): number {
  const hatHearts = rules.heartsPerHats > 0 ? Math.min(rules.maxHatHearts, Math.floor(Math.max(0, hats) / rules.heartsPerHats)) : 0
  const gold = Math.min(rules.maxGoldHearts, Math.max(0, goldHearts))
  return cfg.maxHealthPoints + cfg.healthPointsPerHeart * (hatHearts + gold)
}

/** 原型扩展（NON-CONTRACT，ADR 0039）：心数上限的封顶值（首轮 16 点 = 8 心）；HUD 按它预建心格。 */
export function maxHealthCeiling(cfg: HeartConfig, rules: Pick<ProtoRules, 'maxHatHearts' | 'maxGoldHearts'>): number {
  return cfg.maxHealthPoints + cfg.healthPointsPerHeart * (rules.maxHatHearts + rules.maxGoldHearts)
}

/** 原型扩展（NON-CONTRACT，ADR 0039 / 0043）：心数上限（半心点）≥ bossMinHearts 心即 Boss。 */
export function isBoss(cfg: Pick<BomberConfig, 'healthPointsPerHeart'>, rules: Pick<ProtoRules, 'bossMinHearts'>, maxHealth: number): boolean {
  return maxHealth >= rules.bossMinHearts * cfg.healthPointsPerHeart
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0039，design §4.2 / §12）：毒圈按受害者上限等比——每跳 ⌈段点数 × 当前上限 / maxHealthPoints⌉ 点
 * （整数运算）。3 心玩家与原口径一致（1 / 2 点），任何上限下满血约 6 秒 / 3 秒毒死。
 */
export function poisonPointsFor(cfg: Pick<BomberConfig, 'maxHealthPoints'>, stagePoints: number, maxHealth: number): number {
  const base = cfg.maxHealthPoints
  if (base <= 0) return stagePoints
  return Math.floor((stagePoints * maxHealth + base - 1) / base)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0031 / ADR 0035）：原型实际使用的局配置 = 契约默认值 + 局时上限（matchCapMs，4 分钟）+ 覆盖项
 * （`?match=` 传 `over.matchDurationMs`）。契约 `DEFAULT_CONFIG` 本身不改。
 * 方向 B（ADR 0040）：rules 带 `map` 时 `mapSize` = 该档边长（19 档 = 契约默认 19，不变）。
 */
export function protoConfig(
  rules: Pick<ProtoRules, 'matchCapMs'> & Partial<Pick<ProtoRules, 'map'>> = DEFAULT_RULES,
  over: Partial<BomberConfig> = {},
): BomberConfig {
  const map = rules.map ? { mapSize: rules.map.size } : {}
  return { ...DEFAULT_CONFIG, matchDurationMs: rules.matchCapMs, ...map, ...over }
}

/** 原型扩展（NON-CONTRACT，ADR 0031）：第 stageIndex 段生效后的圈外毒伤（半心点）；−1 = 仍是整个内场 → 基础值。 */
export function poisonPointsAt(rules: Pick<ProtoRules, 'ringStages' | 'poisonPointsPerInterval'>, stageIndex: number): number {
  if (stageIndex < 0 || rules.ringStages.length === 0) return rules.poisonPointsPerInterval
  return rules.ringStages[Math.min(stageIndex, rules.ringStages.length - 1)].poisonPoints
}

/**
 * 毫秒 → Tick：向上取整（契约 §2.2 只规定经 `Ticks.FromMilliseconds` 换算、未规定取整方向；
 * 原型取向上取整，125 ms @20Hz = 3 tick，待 C# 落地时核对）。
 */
export function msToTicks(ms: number, tickRateHz: number): number {
  return Math.floor((ms * tickRateHz + 999) / 1000)
}
