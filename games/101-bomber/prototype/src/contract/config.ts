import type { CharacterDef, CharacterId, ComboDef, SkillDef, SkillId } from './skills'
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
   */
  regenIntervalMs: number
  regenTargetPermille: number
  regenOrbitsPerInterval: number
  regenStopBeforeFinalMs: number
  /**
   * design §4.2（ADR 0025）：决赛圈 = Phase 2 Endgame，固定时长；资源先触发时局终同步提前。
   * 原型扩展（NON-CONTRACT，ADR 0031）：90 s → 115 s（时间触发 = 7 分钟局的 5:05，D7；推断待验证）。
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
  /** design §5：≤12 人档，本原型固定 8 人（你 + 7 Bot）。 */
  playerCount: number
  /**
   * 原型扩展（NON-CONTRACT，ADR 0031）：局时上限 7 分钟。契约 `DEFAULT_CONFIG.matchDurationMs` 仍是 360000，
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
  regenStopBeforeFinalMs: 60000,
  finalCircleMs: 115000,
  finalCircleResourcePermille: 200,
  // ADR 0031（D7）：13 → 9 → 7 → 5 → 3 → 1；5×5 起清场、毒翻倍，1×1 不落宝箱。时刻推断待验证。
  ringStages: [
    { atMs: 10000, size: 13, chest: true, clearInside: false, poisonPoints: 1 },
    { atMs: 35000, size: 9, chest: true, clearInside: false, poisonPoints: 1 },
    { atMs: 55000, size: 7, chest: true, clearInside: false, poisonPoints: 1 },
    { atMs: 75000, size: 5, chest: true, clearInside: true, poisonPoints: 2 },
    { atMs: 95000, size: 3, chest: true, clearInside: true, poisonPoints: 2 },
    { atMs: 110000, size: 1, chest: false, clearInside: true, poisonPoints: 2 },
  ],
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
  matchCapMs: 420000,
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
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0031）：原型实际使用的局配置 = 契约默认值 + 7 分钟局时上限（matchCapMs）+ 覆盖项
 * （`?match=` 传 `over.matchDurationMs`）。契约 `DEFAULT_CONFIG` 本身不改。
 */
export function protoConfig(rules: Pick<ProtoRules, 'matchCapMs'> = DEFAULT_RULES, over: Partial<BomberConfig> = {}): BomberConfig {
  return { ...DEFAULT_CONFIG, matchDurationMs: rules.matchCapMs, ...over }
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
