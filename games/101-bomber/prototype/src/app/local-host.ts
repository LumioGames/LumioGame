import type {
  AbilityActivation,
  AnimalId,
  BomberConfig,
  GameSource,
  ProtoRules,
  TickFrame,
  U64,
  移动技能输入,
} from '../contract'
import { 方向 } from '../contract'
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
  localAnimal?: AnimalId
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

export class LocalHost implements GameSource {
  readonly config: BomberConfig
  readonly rules: ProtoRules
  readonly localPlayerId: U64
  private readonly sim: LocalSim
  private readonly bots: { id: U64; brain: BotBrain }[] = []
  private readonly subs = new Set<(f: TickFrame) => void>()
  private latest: TickFrame
  private move: 移动技能输入 = { 方向: 方向.停, 按了转弯: false }
  /** 自上个 Tick 以来新按下的方向（带「按了转弯」到达）；短于一个 Tick 的点按靠它送达规则层。 */
  private tapDir: 方向 = 方向.停
  private bombLatched = false
  private acc = 0
  private lastNow = -1
  private paused = false
  private readonly tickMs: number

  constructor(opts: LocalHostOptions) {
    this.config = opts.config
    this.rules = opts.rules
    this.tickMs = 1000 / opts.config.tickRateHz
    const localAnimal = opts.localAnimal ?? 'rabbit'
    const others = ANIMALS.filter((a) => a !== localAnimal)
    const players: SimPlayerSpec[] = [{ name: '你', isBot: false, animal: localAnimal, slot: 0 }]
    for (let i = 0; i < opts.botCount; i++) {
      const animal = others[i % others.length]
      players.push({ name: NAMES[animal], isBot: true, animal, slot: i + 1 })
    }
    this.sim = new LocalSim({ seed: opts.seed, config: opts.config, rules: opts.rules, players })
    this.localPlayerId = this.sim.playerIdForSlot(0)
    for (let i = 0; i < opts.botCount; i++) {
      const id = this.sim.playerIdForSlot(i + 1)
      const brain = new BotBrain({
        self: id,
        seed: (opts.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
        personality: PERSONALITIES[i % PERSONALITIES.length],
        config: opts.config,
        rules: opts.rules,
      })
      this.bots.push({ id, brain })
    }
    this.latest = this.sim.current()
  }

  subscribe(cb: (frame: TickFrame) => void): () => void {
    this.subs.add(cb)
    cb(this.latest)
    return () => this.subs.delete(cb)
  }

  sendInput(a: AbilityActivation): void {
    // 暂停期间的输入一律丢弃，否则恢复后第一个 Tick 会凭空放下一颗暂停时按的炸弹。
    if (this.paused) return
    if (a.ability === '放弹') {
      this.bombLatched = true
      return
    }
    // 一个 Tick 内可能 poll 多次：「按了转弯」与新按下的方向都锁存到被 Tick 消费为止。
    if (a.输入.按了转弯 && a.输入.方向 !== 方向.停) this.tapDir = a.输入.方向
    this.move = { 方向: a.输入.方向, 按了转弯: this.move.按了转弯 || a.输入.按了转弯 }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.acc = 0
    this.bombLatched = false
    this.tapDir = 方向.停
    this.move = { 方向: 方向.停, 按了转弯: false }
  }

  isPaused(): boolean {
    return this.paused
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

  /** 调试 / 测试用：当前权威状态哈希。 */
  stateHash(): string {
    return this.sim.stateHash()
  }

  private stepOnce(): void {
    const inputs = new Map<U64, AbilityActivation[]>()
    // 点按在本 Tick 前已松开（当前方向为停）时，仍把点按的方向送进去一次。
    const move: 移动技能输入 =
      this.move.方向 === 方向.停 && this.tapDir !== 方向.停 ? { 方向: this.tapDir, 按了转弯: true } : this.move
    const local: AbilityActivation[] = [{ ability: '移动', 输入: move }]
    if (this.bombLatched) local.push({ ability: '放弹' })
    inputs.set(this.localPlayerId, local)
    this.bombLatched = false
    this.tapDir = 方向.停
    this.move = { 方向: this.move.方向, 按了转弯: false }
    const snap = this.latest.snapshot
    for (const b of this.bots) inputs.set(b.id, b.brain.decide(snap))
    this.latest = this.sim.step(inputs)
    for (const cb of this.subs) cb(this.latest)
  }
}
