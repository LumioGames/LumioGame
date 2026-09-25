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
  /** design §4.2（ADR 0025）：决赛圈 = Phase 2 Endgame，固定时长；资源先触发时局终同步提前。 */
  finalCircleMs: number
  /** design §4.2：剩余可破坏砖（积木 + 木箱）< 开局数量 × 该千分比时触发决赛圈。 */
  finalCircleResourcePermille: number
  /**
   * design §4.2：安全圈分段收缩。`atMs` 为相对决赛圈开始的生效时刻，`size` 为以棋盘中心为心的正方形边长（格）。
   * 每段在生效前 `ringPreviewMs` 预告。触发时安全圈 = 整个内场。
   */
  ringStages: readonly { atMs: number; size: number }[]
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
  /** design §6.1 转角修正：偏离通道中心 ≤ 该值（千分格）时自动吸附。 */
  cornerAssistMilli: number
  /** design §6.1「连续转角只做轻度吸附」：6 tick 内再次吸附时的阈值。 */
  cornerAssistRepeatMilli: number
  /** 契约 §2.1 `转角缓冲剩余帧`：提前按下的垂直方向保留的帧数。 */
  turnBufferTicks: number
  /** design §9.3：帽王光柱阈值 N（待验证）；纯表现阈值，帽王判定本身不看它。 */
  hatKingPillarMinHats: number
  /** design §5：≤12 人档，本原型固定 8 人（你 + 7 Bot）。 */
  playerCount: number
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
  finalCircleMs: 90000,
  finalCircleResourcePermille: 200,
  ringStages: [
    { atMs: 10000, size: 13 },
    { atMs: 40000, size: 9 },
    { atMs: 70000, size: 7 },
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
  cornerAssistMilli: 400,
  cornerAssistRepeatMilli: 200,
  turnBufferTicks: 6,
  hatKingPillarMinHats: 3,
  playerCount: 8,
}

/**
 * 毫秒 → Tick：向上取整（契约 §2.2 只规定经 `Ticks.FromMilliseconds` 换算、未规定取整方向；
 * 原型取向上取整，125 ms @20Hz = 3 tick，待 C# 落地时核对）。
 */
export function msToTicks(ms: number, tickRateHz: number): number {
  return Math.floor((ms * tickRateHz + 999) / 1000)
}
