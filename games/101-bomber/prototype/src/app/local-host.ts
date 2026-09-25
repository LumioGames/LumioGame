import type {
  AbilityActivation,
  AnimalId,
  BomberConfig,
  BotDifficulty,
  BotProfileId,
  CharacterId,
  GameSource,
  ProtoRules,
  SkillId,
  TickFrame,
  U64,
  移动技能输入,
} from '../contract'
import { BOT_PROFILES, CHARACTERS, DEFAULT_BOT_DIFFICULTY, 方向 } from '../contract'
import { BotBrain, type BotPersonality } from '../bots/bot-brain'
import { LocalSim, type SimPlayerSpec } from '../sim/local-sim'

/**
 * 本地宿主：固定 50 ms 步进 TS 规则替身，把本机输入与 Bot 输出喂回去，把帧发布给订阅者。
 * 这是全工程**唯一**允许 import `sim/` 的文件；将来换成引擎 Replica 适配器时只替换它。
 */
export interface LocalHostOptions {
  seed: number
  config: BomberConfig
  rules: ProtoRules
  botCount: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：本机角色；缺省 'rabbit'，null = 无角色（第 3 轮行为）。 */
  localCharacter?: CharacterId | null
  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：Bot 选角。'auto'（缺省）= 每局开局按均衡原则分配角色与名字；
   * 'none' = 第 3 轮的固定动物 / 名字、无角色无技能。
   */
  botCharacters?: 'auto' | 'none'
  /** 原型扩展（NON-CONTRACT，design §15 Bot 难度分档（原型工具））：Bot 难度；缺省 'normal'。 */
  ai?: BotDifficulty
  /** 测试 / 开发用：由一个 BotBrain 驾驶本机玩家（sendInput 被忽略）。 */
  localAutopilot?: { profile: BotProfileId; personality?: BotPersonality }
}

const ANIMALS: readonly AnimalId[] = ['rabbit', 'duck', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog']
const NAMES: Readonly<Record<AnimalId, string>> = {
  duck: '小黄鸭',
  rabbit: '棉花兔',
  bear: '豆豆熊',
  cat: '灰灰猫',
  frog: '呱呱蛙',
  penguin: '企鹅团子',
  pig: '粉粉猪',
  dog: '旺财',
}
const PERSONALITIES: readonly BotPersonality[] = ['farmer', 'hunter', 'collector', 'roamer', 'farmer', 'hunter', 'roamer']
/** 单次 rAF 最多补跑的 Tick 数；标签页切回来时不追历史。 */
const MAX_CATCH_UP = 5
/** 自动驾驶的种子扰动（与 Bot 的 i+1 扰动错开）。 */
const AUTOPILOT_SEED_SALT = 0x2545f491

export class LocalHost implements GameSource {
  readonly config: BomberConfig
  readonly rules: ProtoRules
  readonly localPlayerId: U64
  /** 原型扩展（NON-CONTRACT）：本局 Bot 难度（不是规则状态，不进快照；HUD 从这里读）。 */
  readonly ai: BotDifficulty
  private readonly sim: LocalSim
  private readonly bots: { id: U64; brain: BotBrain }[] = []
  private readonly autopilot: BotBrain | null
  private readonly subs = new Set<(f: TickFrame) => void>()
  private latest: TickFrame
  private move: 移动技能输入 = { 方向: 方向.停, 按了转弯: false }
  /** 自上个 Tick 以来新按下的方向（带「按了转弯」到达）；短于一个 Tick 的点按靠它送达规则层。 */
  private tapDir: 方向 = 方向.停
  private bombLatched = false
  /** 技能键同放弹键：锁存到被下一个 Tick 消费为止，每次锁存只送一次。 */
  private skillLatched = false
  private acc = 0
  private lastNow = -1
  private paused = false
  private readonly tickMs: number

  constructor(opts: LocalHostOptions) {
    this.config = opts.config
    this.rules = opts.rules
    this.ai = opts.ai ?? DEFAULT_BOT_DIFFICULTY
    this.tickMs = 1000 / opts.config.tickRateHz
    const localCharacter = opts.localCharacter === undefined ? 'rabbit' : opts.localCharacter
    const localAnimal: AnimalId = localCharacter ? CHARACTERS[localCharacter].animal : 'rabbit'
    const local: SimPlayerSpec = { name: '你', isBot: false, animal: localAnimal, slot: 0 }
    if (localCharacter) local.character = localCharacter
    const players: SimPlayerSpec[] = [local]
    const autoBots = (opts.botCharacters ?? 'auto') === 'auto'
    const others = ANIMALS.filter((a) => a !== localAnimal)
    for (let i = 0; i < opts.botCount; i++) {
      const animal = others[i % others.length]
      // 'auto'：名字 / 动物由规则层每局按角色重抽（sim/roster.ts），这里只是占位。
      const spec: SimPlayerSpec = { name: NAMES[animal], isBot: true, animal, slot: i + 1 }
      if (autoBots) spec.character = 'auto'
      players.push(spec)
    }
    this.sim = new LocalSim({ seed: opts.seed, config: opts.config, rules: opts.rules, players })
    this.localPlayerId = this.sim.playerIdForSlot(0)
    const profile = BOT_PROFILES[this.ai]
    for (let i = 0; i < opts.botCount; i++) {
      const id = this.sim.playerIdForSlot(i + 1)
      const brain = new BotBrain({
        self: id,
        seed: (opts.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
        personality: PERSONALITIES[i % PERSONALITIES.length],
        config: opts.config,
        rules: opts.rules,
        profile,
      })
      this.bots.push({ id, brain })
    }
    const ap = opts.localAutopilot
    this.autopilot = ap
      ? new BotBrain({
          self: this.localPlayerId,
          seed: (opts.seed ^ AUTOPILOT_SEED_SALT) >>> 0,
          personality: ap.personality ?? 'farmer',
          config: opts.config,
          rules: opts.rules,
          profile: BOT_PROFILES[ap.profile],
        })
      : null
    this.latest = this.sim.current()
  }

  subscribe(cb: (frame: TickFrame) => void): () => void {
    this.subs.add(cb)
    cb(this.latest)
    return () => this.subs.delete(cb)
  }

  sendInput(a: AbilityActivation): void {
    // 暂停期间的输入一律丢弃，否则恢复后第一个 Tick 会凭空放下一颗暂停时按的炸弹；自动驾驶时本机输入也不用。
    if (this.paused || this.autopilot) return
    switch (a.ability) {
      case '放弹':
        this.bombLatched = true
        return
      case '技能':
        this.skillLatched = true
        return
      case '移动': {
        // 一个 Tick 内可能 poll 多次：「按了转弯」与新按下的方向都锁存到被 Tick 消费为止；副方向取最新一次。
        if (a.输入.按了转弯 && a.输入.方向 !== 方向.停) this.tapDir = a.输入.方向
        const next: 移动技能输入 = { 方向: a.输入.方向, 按了转弯: this.move.按了转弯 || a.输入.按了转弯 }
        if (a.输入.副方向 !== undefined) next.副方向 = a.输入.副方向
        this.move = next
        return
      }
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.acc = 0
    this.bombLatched = false
    this.skillLatched = false
    this.tapDir = 方向.停
    this.move = { 方向: 方向.停, 按了转弯: false }
  }

  isPaused(): boolean {
    return this.paused
  }

  /** 原型扩展（NON-CONTRACT，ADR 0030）：「换角色」——下一局开局生效（D15），本局不变。 */
  setLocalCharacter(c: CharacterId): void {
    this.sim.setPick(0, c)
  }

  /**
   * 开发钩子（只在 import.meta.env.DEV 下调用）：接下来每个进行中的 Tick 在本机玩家脚下放一颗技能糖。
   * 糖是普通拾取物（进哈希），用来在浏览器里直接看进化。
   */
  devSpawnSkillCandies(skills: readonly SkillId[]): void {
    this.sim.devSpawnSkillCandies(this.localPlayerId, skills)
  }

  /** 每个 rAF 调用：按真实时间补跑固定步长 Tick。 */
  pump(now: number): void {
    if (this.lastNow < 0 || this.paused) {
      this.lastNow = now
      return
    }
    this.acc += Math.min(now - this.lastNow, 250)
    this.lastNow = now
    let n = 0
    while (this.acc >= this.tickMs && n < MAX_CATCH_UP) {
      this.stepOnce()
      this.acc -= this.tickMs
      n++
    }
    if (n === MAX_CATCH_UP) this.acc = 0
  }

  /** 测试 / 开发用：不看真实时间，立即推进 n 个 Tick（照常发布给订阅者）。 */
  stepTicks(n: number): void {
    for (let i = 0; i < n; i++) this.stepOnce()
  }

  /** 调试 / 测试用：当前权威状态哈希。 */
  stateHash(): string {
    return this.sim.stateHash()
  }

  private stepOnce(): void {
    const inputs = new Map<U64, AbilityActivation[]>()
    const snap = this.latest.snapshot
    if (this.autopilot) {
      inputs.set(this.localPlayerId, this.autopilot.decide(snap))
    } else {
      // 点按在本 Tick 前已松开（当前方向为停）时，仍把点按的方向送进去一次。
      const move: 移动技能输入 =
        this.move.方向 === 方向.停 && this.tapDir !== 方向.停 ? { 方向: this.tapDir, 按了转弯: true } : this.move
      const local: AbilityActivation[] = [{ ability: '移动', 输入: move }]
      if (this.bombLatched) local.push({ ability: '放弹' })
      if (this.skillLatched) local.push({ ability: '技能' })
      inputs.set(this.localPlayerId, local)
      this.bombLatched = false
      this.skillLatched = false
      this.tapDir = 方向.停
      this.move = { ...this.move, 按了转弯: false }
    }
    for (const b of this.bots) inputs.set(b.id, b.brain.decide(snap))
    this.latest = this.sim.step(inputs)
    for (const cb of this.subs) cb(this.latest)
  }
}
