import {
  BlockType,
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  MatchPhase,
  方向,
  type AbilityActivation,
  type AnimalId,
  type BomberConfig,
  type BomberEvent,
  type CharacterPick,
  type ProtoRules,
  type TickFrame,
} from '../../contract'
import { hatCountOf } from '../death-drops'
import type { SimPlayerSpec } from '../local-sim'
import { advanceRing, startFinalCircle } from '../final-circle'
import { createWorld } from '../match-phase'
import { stepWorld } from '../step'
import { centerMilli, countResource, findPlayer, makeBomb, type SimBomb, type SimPlayer, type World } from '../world'

/**
 * 测试夹具：直接驱动内部 World（不经 Bot）。`makeWorld` 默认清空积木 / 木箱 / 水，只留外圈与铁皮柱，
 * 并把对局推进到 Running（EndTick 远在天边，决赛圈不会被时间触发），方便逐格摆场景。
 */
const ANIMALS: readonly AnimalId[] = ['rabbit', 'duck', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog']

/**
 * n 个玩家规格。picks 给第 i 个玩家选角（原型扩展 ADR 0030）；缺省 / null = 无角色（第 3 轮行为，旧用例不受影响）。
 */
export function specs(n: number, picks?: readonly (CharacterPick | null | undefined)[]): SimPlayerSpec[] {
  return Array.from({ length: n }, (_, i) => {
    const s: SimPlayerSpec = { name: `P${i}`, isBot: i > 0, animal: ANIMALS[i % 8], slot: i }
    const pick = picks?.[i]
    if (pick) s.character = pick
    return s
  })
}

export interface WorldOpts {
  players?: number
  seed?: number
  cfg?: Partial<BomberConfig>
  rules?: Partial<ProtoRules>
  /** 默认 true：清掉积木 / 木箱 / 水。 */
  clear?: boolean
  /** 默认 true：直接进入 Running。 */
  running?: boolean
  /** 按玩家序选角（见 {@link specs}）；缺省全员无角色。 */
  picks?: readonly (CharacterPick | null | undefined)[]
}

export function makeWorld(opts: WorldOpts = {}): World {
  const n = opts.players ?? 2
  const w = createWorld({
    seed: opts.seed ?? 1,
    config: { ...DEFAULT_CONFIG, ...opts.cfg },
    rules: { ...DEFAULT_RULES, playerCount: n, ...opts.rules },
    players: specs(n, opts.picks),
  })
  w.out = []
  if (opts.clear !== false) {
    for (let c = 0; c < w.brick.length; c++) {
      if (w.brick[c] !== BlockType.铁皮) w.brick[c] = BlockType.Air
      w.ground[c] = BlockType.地面
    }
    // 清空后的场地不应立刻满足「资源耗尽」触发决赛圈。
    w.resourceInitial = countResource(w)
  }
  if (opts.running !== false) {
    w.match.phase = MatchPhase.Running
    w.match.startTick = w.t
    w.match.endTick = w.t + 1_000_000
  }
  return w
}

export function player(w: World, id: number): SimPlayer {
  const p = findPlayer(w, id)
  if (!p) throw new Error(`no player ${id}`)
  return p
}

export function put(w: World, id: number, x: number, y: number): SimPlayer {
  const p = player(w, id)
  p.mx = centerMilli(x)
  p.my = centerMilli(y)
  return p
}

export function cell(w: World, x: number, y: number): number {
  return y * w.size + x
}

export function setBrick(w: World, x: number, y: number, b: BlockType): void {
  w.brick[cell(w, x, y)] = b
}

export function setGround(w: World, x: number, y: number, g: BlockType): void {
  w.ground[cell(w, x, y)] = g
}

/**
 * 绕过放弹技能直接摆一颗弹：fuseIn 个 Tick 后到期（1 = 下一步就炸）。
 * 主人手上还有弹就像真放弹一样扣一颗（否则场上这颗会被算成一级炸弹+，派生帽数凭空 +1）；手上没有则视为场上已有的弹。
 */
export function addBomb(w: World, owner: number, x: number, y: number, fuseIn = 1, power = 2): SimBomb {
  const o = findPlayer(w, owner)
  if (o && o.capacity > 0) o.capacity--
  const b: SimBomb = makeBomb({ id: w.nextId++, owner, cell: cell(w, x, y), bornTick: w.t, fuseEndTick: w.t + fuseIn, power })
  w.bombs.push(b)
  return b
}

export const BOMB: AbilityActivation = { ability: '放弹' }

/** 移动输入；side = 副方向（原型扩展 ADR 0032），缺省不带该键。 */
export function mv(d: 方向, turn = false, side?: 方向): AbilityActivation {
  return side === undefined ? { ability: '移动', 输入: { 方向: d, 按了转弯: turn } } : { ability: '移动', 输入: { 方向: d, 按了转弯: turn, 副方向: side } }
}

/** 技能键（原型扩展 ADR 0030）。 */
export const SKILL: AbilityActivation = { ability: '技能' }

export function step(w: World, inputs: Record<number, AbilityActivation[]> = {}): TickFrame {
  const m = new Map<number, AbilityActivation[]>()
  for (const [k, v] of Object.entries(inputs)) m.set(Number(k), v)
  return stepWorld(w, m)
}

export function run(w: World, n: number, inputs: Record<number, AbilityActivation[]> = {}): TickFrame[] {
  const out: TickFrame[] = []
  for (let i = 0; i < n; i++) out.push(step(w, inputs))
  return out
}

export function evs<T extends BomberEvent['type']>(frames: TickFrame | readonly TickFrame[], type: T): Extract<BomberEvent, { type: T }>[] {
  const list = Array.isArray(frames) ? (frames as readonly TickFrame[]) : [frames as TickFrame]
  const out: Extract<BomberEvent, { type: T }>[] = []
  for (const f of list) for (const e of f.events) if (e.type === type) out.push(e as Extract<BomberEvent, { type: T }>)
  return out
}

/** 立即开启决赛圈（Tick 末阶段机才会自然触发；测试里直接调用，等价于本 Tick 触发）。 */
export function startCircle(w: World, trigger: 'resource' | 'time' = 'time'): void {
  startFinalCircle(w, trigger)
  advanceRing(w)
}

/** 派生帽数（ADR 0028：帽数 = 当前强化级数之和）。 */
export function hats(w: World, id: number): number {
  return hatCountOf(w, player(w, id))
}

/** 直接给玩家加强化级数（绕过拾取）；速度按整级加。 */
export function giveLevels(w: World, id: number, fire: number, bomb: number, speed: number): SimPlayer {
  const p = player(w, id)
  p.power = w.cfg.initialBombPower + fire
  p.capacity = w.cfg.initialBombCapacity + bomb
  p.speed = w.cfg.speedTierToCellsPerSecond[0] + speed * w.rules.speedStepMilli
  return p
}

/** 确定性随机游走输入（测试自带，不依赖 bots/）。 */
export class Walker {
  private s: number
  private readonly dirs = new Map<number, 方向>()

  constructor(
    seed: number,
    private readonly bombRate = 0.04,
  ) {
    this.s = seed >>> 0 || 0x9e3779b9
  }

  private next(): number {
    let x = this.s
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.s = x >>> 0
    return this.s / 4294967296
  }

  inputs(ids: readonly number[]): Map<number, AbilityActivation[]> {
    const all = [方向.停, 方向.上, 方向.下, 方向.左, 方向.右] as const
    const m = new Map<number, AbilityActivation[]>()
    for (const id of ids) {
      let d = this.dirs.get(id) ?? 方向.停
      let turn = false
      if (this.next() < 0.12) {
        d = all[Math.floor(this.next() * 5)]
        turn = true
      }
      this.dirs.set(id, d)
      const acts: AbilityActivation[] = [mv(d, turn)]
      if (this.next() < this.bombRate) acts.push(BOMB)
      m.set(id, acts)
    }
    return m
  }
}
