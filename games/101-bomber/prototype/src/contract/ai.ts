import type { SourceNote } from './skills'

/**
 * **原型扩展（NON-CONTRACT，design §15 Bot 难度分档（原型工具））**：Bot 难度档与战术常量。
 * 这是原型的测试 / 体验工具，不是玩法规则：规则层（sim）不读它，只有 `src/bots` 与宿主读。
 * 全部「推断待验证」，除非注明 D9（用户第 4 轮给定的普通档数值）。
 */
export type BotDifficulty = 'easy' | 'normal' | 'hard'
/** 'player' = 验收 D 用的脚本「普通水平玩家」（比 normal 反应快、不设陷阱），不对外开放。 */
export type BotProfileId = BotDifficulty | 'player'

export interface BotProfile {
  /** 对别人造成的新危险的反应延迟区间（Tick，含两端）。 */
  reactMinTicks: number
  reactMaxTicks: number
  /** 非危险时每这么多 Tick 重想一次（按 id 错开）。 */
  thinkEveryTicks: number
  /** 思考时改走随机相邻安全格的概率（‰）。 */
  noisePermille: number
  /** 近处有对手时仍放弃这次进攻的概率（‰）；0 = 不掷。 */
  attackSkipPermille: number
  /** 能困死对手时放弹的概率（‰）；0 = 不设陷阱。 */
  trapPermille: number
  /** 自己场上未爆的进攻弹上限（炸砖的弹不算）。 */
  maxOwnLiveAttackBombs: number
  /** 决赛圈狂热期是否无视概率直接放弹 / 开打。 */
  frenzyBypass: boolean
  /** 放弹概率与近身开打概率的缩放（‰；1000 = 原值，不做浮点运算）。 */
  blastScalePermille: number
  engageScalePermille: number
  /** 满足施放条件时真的施放技能的概率（‰；1000 = 不掷）。 */
  skillUsePermille: number
  /**
   * 反应延迟口径。'ownCell' = 第 3 轮（仅自己脚下新变危险时等 react Tick，主随机流）；
   * 'perBomb' = 别人每颗炸弹第一次出现后 react Tick 内不进危险图（仍挡路），第二随机流。
   */
  reactMode: 'ownCell' | 'perBomb'
  /** 决赛圈摊牌期「以血换血」放弹概率（‰；1000 = 不掷）。 */
  showdownTradePermille: number
  src: SourceNote
}

/** 难度档（hard = 第 3 轮强度，常量逐一取自 bots/bot-brain.ts）。 */
export const BOT_PROFILES: Readonly<Record<BotProfileId, BotProfile>> = {
  hard: {
    reactMinTicks: 2,
    reactMaxTicks: 4,
    thinkEveryTicks: 2,
    noisePermille: 50,
    attackSkipPermille: 0,
    trapPermille: 920,
    maxOwnLiveAttackBombs: 99,
    frenzyBypass: true,
    blastScalePermille: 1000,
    engageScalePermille: 1000,
    skillUsePermille: 1000,
    reactMode: 'ownCell',
    showdownTradePermille: 1000,
    src: '已验证：= 第 3 轮 bot-brain.ts 常量（REACT 2–4、NOISE 5%、TRAP 92%、frenzy 直通）；技能 / 摊牌字段推断待验证',
  },
  normal: {
    reactMinTicks: 4,
    reactMaxTicks: 7,
    thinkEveryTicks: 2,
    noisePermille: 150,
    attackSkipPermille: 100,
    trapPermille: 0,
    maxOwnLiveAttackBombs: 1,
    frenzyBypass: false,
    blastScalePermille: 850,
    engageScalePermille: 850,
    skillUsePermille: 700,
    reactMode: 'perBomb',
    showdownTradePermille: 1000,
    src: '引用 用户第 4 轮 D9（反应 4–7 Tick、噪声 15%、不设陷阱）；其余推断待验证',
  },
  easy: {
    reactMinTicks: 7,
    reactMaxTicks: 12,
    thinkEveryTicks: 3,
    noisePermille: 300,
    attackSkipPermille: 350,
    trapPermille: 0,
    maxOwnLiveAttackBombs: 1,
    frenzyBypass: false,
    blastScalePermille: 600,
    engageScalePermille: 600,
    skillUsePermille: 400,
    reactMode: 'perBomb',
    showdownTradePermille: 600,
    src: '推断待验证：比普通档慢一档、更犹豫',
  },
  player: {
    reactMinTicks: 3,
    reactMaxTicks: 5,
    thinkEveryTicks: 2,
    noisePermille: 50,
    attackSkipPermille: 0,
    trapPermille: 0,
    maxOwnLiveAttackBombs: 1,
    frenzyBypass: false,
    blastScalePermille: 1000,
    engageScalePermille: 1000,
    skillUsePermille: 800,
    reactMode: 'perBomb',
    showdownTradePermille: 1000,
    src: '推断待验证：验收 D 的脚本普通玩家（调参前固定：反应 3–5、噪声 5%、不设陷阱、1 颗进攻弹）',
  },
}

export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal'

/** `?ai=` → 难度；未知或空 → 'normal'。 */
export function parseBotDifficulty(v: string | null): BotDifficulty {
  const s = v?.trim().toLowerCase()
  return s === 'easy' || s === 'normal' || s === 'hard' ? s : DEFAULT_BOT_DIFFICULTY
}

/** Bot 用技能与决赛圈摊牌的战术常量（所有难度共用）。 */
export interface BotTactics {
  /** 当前安全圈边长 ≤ 该值时进入摊牌期（= 毒翻倍的 5×5 起，D7）。 */
  showdownRingSide: number
  /** 摊牌期圈内格在 nextRingTick − 该值之前一直算「可歇」（晚进圈）。 */
  lateEntryTicks: number
  /** 非致命换血必须给自己留的血量（半心点）。 */
  tradeMinHpLeft: number
  /** 同血量换血门槛（调参杠杆；99 = 关）。 */
  tieTradeMinHp: number
  /** 摊牌期追击权重（今天狂热期 ×6）。 */
  showdownHuntScale: number
  /** 挑目标时每缺 1 点血折合的步数（今天 1.5）。 */
  showdownWeakWeight: number
  /** 自己脚下危险在这么多 Tick 内到来时施放防御技能。 */
  skillLeadTicks: number
  /** skillUse 掷失败后隔这么多 Tick 再掷。 */
  skillRetryTicks: number
  /** 光环施放距离（切比雪夫）。 */
  auraCastRange: number
  /** 摊牌期：auraCrowdSteps 步内 ≥ auraCrowdCount 个对手时施放光环。 */
  auraCrowdSteps: number
  auraCrowdCount: number
  /** 追击闪现：落点走路到不了或 ≥ 该步数才闪。 */
  blinkChaseMinSteps: number
  /** 对手光环区域外扩的格数（熊会动）。 */
  burnPadCells: number
  /** 为进化 / 升级 / 装备技能糖多走的步数（今天强化糖 +2）。 */
  candyBonusSteps: { evolve: number; levelUp: number; equip: number }
  /** 棉花兔不满血时（非摊牌期）降低追击的概率（‰）。 */
  rabbitHurtHuntPermille: number
  /** 决赛圈内任何掉血都去找血包的最远步数。 */
  healReachSteps: number
  src: SourceNote
}

export const BOT_TACTICS: BotTactics = {
  showdownRingSide: 7,
  lateEntryTicks: 20,
  tradeMinHpLeft: 2,
  tieTradeMinHp: 99,
  showdownHuntScale: 10,
  showdownWeakWeight: 3,
  skillLeadTicks: 4,
  skillRetryTicks: 10,
  auraCastRange: 1,
  auraCrowdSteps: 2,
  auraCrowdCount: 2,
  blinkChaseMinSteps: 4,
  burnPadCells: 1,
  candyBonusSteps: { evolve: 8, levelUp: 4, equip: 3 },
  rabbitHurtHuntPermille: 500,
  healReachSteps: 8,
  src: '推断待验证：第 4 轮 Bot 设计 §3.1（摊牌、技能施放、技能糖价值）；lateEntryTicks 40→20、showdownRingSide 5→7 = 验收 E 调参阶梯第 3–4 级（20 种子 19/20 → 40 种子 40/40 唯一存活）',
}
