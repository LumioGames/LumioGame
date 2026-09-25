import type { AbilityActivation, BomberCell, BomberConfig, FinalCircleView, PlayerView, ProtoRules, U64, WorldSnapshot } from '../contract'
import { MatchPhase, msToTicks, 方向 } from '../contract'
import { cellOf, idx, inBounds } from '../shared/grid'
import {
  brickValue,
  cellIndexOf,
  enemiesInBlast,
  enemiesNear,
  enemyCanEscape,
  huntGoal,
  isActiveEnemy,
  isRestCell,
  nearestEnemyWithin,
  pickEscape,
  pickFarm,
  pickHuntTarget,
  pickInward,
  pickPickup,
  pickRandomNeighbor,
  pickRoamCell,
  reachesRest,
  STRICT_REST,
  type Goal,
  type ThinkContext,
} from './behaviors'
import { buildBoard, isDestructibleBrick, isOpen, isWater, ticksPerCell, type Board } from './board'
import { evaluateBomb, type BombEvaluation } from './bomb-gate'
import { BotRng } from './bot-rng'
import { buildDangerMap, conflicts, isSafe, type DangerMap } from './danger-map'
import { exitTicks, pathTo, searchPaths, type PathField } from './path-search'
import { steerToward } from './steering'

/**
 * Bot 大脑：像真实 Bot 客户端一样只读复制快照、只发技能输入（不得 import sim/）。
 * 四种行为（发育 farm / 追击 hunt / 捡拾 collect / 漫游 roam）按权重轮换；人格（personality）只是权重偏置，
 * 每个 Bot 都会追帽王 / 富人、抢死者掉出的强化、炸砖。帽子 = 强化数（ADR 0028），没有帽堆可捡。
 */
export type BotPersonality = 'farmer' | 'hunter' | 'collector' | 'roamer'

export interface BotOptions {
  self: U64
  seed: number
  personality: BotPersonality
  config: BomberConfig
  rules: ProtoRules
}

export type BotMode = 'idle' | 'escape' | 'noise' | 'pickup' | 'farm' | 'hunt' | 'roam' | 'wait' | 'bomb'

export type BotBehaviour = 'farm' | 'hunt' | 'collect' | 'roam'

/** 调试 / 测试用的只读状态。 */
export interface BotDebugState {
  mode: BotMode
  goal: BomberCell | null
  lastDir: 方向
  behaviour: BotBehaviour
  huntTarget: U64
}

interface Plan {
  mode: BotMode
  goal: number
  /** 起点（含）→ goal（含）。 */
  path: number[]
  allowWater: boolean
}

/** 反应延迟：非危险时每 2 Tick 重新思考一次（按 id 错开），危险时每 Tick。 */
const REACT_TICKS = 2
/** 决策噪声：思考时有 5% 概率改走一个随机相邻安全格，让 Bot 可被击败。 */
const NOISE = 0.05
/** 连续这么多 Tick 发了方向却原地不动，视为卡住。 */
const STUCK_TICKS = 4
/** 放弹自检失败的格子在这么多 Tick 内不再作为目标，免得原地反复尝试。 */
const BAD_BOMB_COOLDOWN = 20
/** 行为权重（人格偏置）；实际抽样时再按剩余砖量 / 决赛圈调整。 */
const WEIGHTS: Readonly<Record<BotPersonality, Readonly<Record<BotBehaviour, number>>>> = {
  farmer: { farm: 5, hunt: 3, collect: 1, roam: 1 },
  hunter: { farm: 2, hunt: 7, collect: 1, roam: 0.5 },
  collector: { farm: 3, hunt: 3, collect: 4, roam: 0.5 },
  roamer: { farm: 2, hunt: 4, collect: 1, roam: 3 },
}
/** 一段行为持续的 Tick 区间 [min, max)。 */
const STINT_MIN = 80
const STINT_MAX = 180
/** 追击目标够不着时改去炸砖开路的时长（滞回：期间不再切回追击，免得在两个目标之间逐 Tick 抖）。 */
const BLOCKED_FARM_TICKS = 80
/** 发育目标一经选定保持的最长 Tick（到达放弹 / 自检失败 / 失效即作废）。 */
const FARM_STICK_TICKS = 120
/** 近身开打：路程 ≤ 该步数的对手，按人格概率转入追击。每 ENGAGE_CHECK Tick 最多判一次。 */
const ENGAGE_STEPS = 6
const ENGAGE_CHECK = 30
const ENGAGE_CHANCE: Readonly<Record<BotPersonality, number>> = { hunter: 0.95, farmer: 0.55, collector: 0.55, roamer: 0.75 }
/** 这颗弹（连同场上已有的弹）能困死对手时放的概率；只是十字罩住对手时按行为取概率。 */
const TRAP_CHANCE = 0.92
const BLAST_CHANCE: Readonly<Record<BotBehaviour, number>> = { hunt: 0.85, farm: 0.4, collect: 0.4, roam: 0.5 }
/** 困杀判定看放弹格曼哈顿 火力 + 该值 以内的对手（离得更远的，这颗弹封不住他的路）。 */
const TRAP_SLACK = 3
/** 决赛圈存活 ≤ 该人数、或圈已缩到第二段起，全员打满攻击性。 */
const FEW_ALIVE = 5
const FRENZY_STAGE = 1
/** 到达漫游点时，若能炸到砖，放弹的概率。 */
const ROAM_BOMB_CHANCE = 0.5
/** 危险在「两格路程 + 该值」Tick 内到来时放弃普通目标、只找最近安全格。 */
const URGENT_SLACK = 6
/** 放弹自检的逃生路程每格按最多慢 1.5 Tick 估（占用区间两头放宽）：给转角吸附、反应延迟和对手临时补弹留余量。 */
const GATE_SLOW_PER_CELL = 1.5
/** 对别人造成的新危险的反应延迟区间（Tick，含两端）。 */
const REACT_MIN = 2
const REACT_MAX = 4
/** 无路可逃时尝试「原地等 d Tick 再走」的步长与上限。 */
const WAIT_STEP = 2
const MAX_WAIT = 40
/** 连续泡水的计划离下一次溺水扣血至少留这么多 Tick（路程估计本身已按每格慢 0.5 Tick 放宽）。 */
const WATER_MARGIN = 2
/** 毒圈在该 Tick 数内就要覆盖当前格时，视同身处毒圈：每 Tick 重想、不做噪声。 */
const POISON_SOON = 10
/** 放宽毒圈门槛时，至少还能待这么多 Tick 的格子才算可待。 */
const POISON_RELAXED = 40
/** 决赛圈放宽「永不着火」时，火至少还要这么多 Tick 才来。 */
const FIRE_SLACK = 30
/** 抢死者掉落时放宽「永不着火」：火至少还要这么多 Tick 才到该格（到达后有时间逃）。 */
const GRAB_SLACK = 24
/** 死者掉出的强化在第一次看见后这么多 Tick 内算「新鲜」：collector 人格会立刻转去抢。 */
const FRESH_TICKS = 160
/** collector 人格为新鲜掉落改行的最远路程（步）。 */
const FRESH_RUSH_STEPS = 24
/** 每顶帽子（= 一级强化）在追击目标打分里折合的步数：hunter 更看重富人。 */
const RICH_WEIGHT: Readonly<Record<BotPersonality, number>> = { hunter: 2, farmer: 1.2, collector: 1.2, roamer: 1.5 }

interface WaterBudget {
  maxWaterTicks: number
  startWaterTicks: number
}

export class BotBrain {
  private readonly self: U64
  private readonly personality: BotPersonality
  private readonly config: BomberConfig
  private readonly rules: ProtoRules
  private readonly rng: BotRng
  private readonly hz: number
  private readonly fuseTicks: number
  private readonly dangerTicks: number
  private readonly drownTicks: number
  /** 已连续在水里的 Tick（每次 decide 观察一次）。 */
  private waterTicks = 0
  /** 已连续在毒圈里的 Tick。 */
  private poisonTicks = 0
  private readonly bufferTicks: number
  /** 放弹按下后、规则层放弹缓冲仍可能生效的最后一个 Tick；−1 = 无待定按键。 */
  private pressUntil = -1
  private ownBombsAtPress = 0
  private lastPressTick = -1000
  private wasInDanger = false
  /** 新危险出现后要到这个 Tick 才开始反应（design：反应延迟 2–4 Tick，让 Bot 可被击败）。 */
  private reactAt = -1
  private lastDir: 方向 = 方向.停
  private plan: Plan | null = null
  private mode: BotMode = 'idle'
  private roamGoal = -1
  private forceThink = false
  private badBombCell = -1
  private badBombUntil = 0
  private lastMx = Number.NaN
  private lastMz = Number.NaN
  private stuck = 0
  private size = 0
  private behaviour: BotBehaviour = 'farm'
  /** 当前行为持续到的 Tick；0 = 尚未抽样。 */
  private behaviourUntil = 0
  private huntTarget: U64 = 0
  private farmGoal = -1
  private farmGoalUntil = 0
  private engageCheckAt = 0
  /**
   * 放弹意图被「人还在滑行」取消时记下的格子：下一次思考只要人还在这格、自检仍通过就放，
   * 不让到达即放（发育 / 漫游）因为一次取消就被新目标冲掉。
   */
  private bombIntent = -1
  private matchIndex = -1
  private bricksAtStart = 0
  /** 死者掉出的强化 id → 第一次看见的 Tick（插入序遍历，确定性）。 */
  private readonly dropSeen = new Map<U64, number>()
  /** 当前「新鲜」的死者掉落 id。 */
  private readonly freshDrops = new Set<U64>()

  constructor(opts: BotOptions) {
    this.self = opts.self
    this.personality = opts.personality
    this.config = opts.config
    this.rules = opts.rules
    this.rng = new BotRng(opts.seed)
    this.hz = opts.config.tickRateHz
    this.fuseTicks = msToTicks(opts.config.fuseMs, this.hz)
    this.dangerTicks = msToTicks(opts.config.dangerWindowMs, this.hz)
    this.drownTicks = msToTicks(opts.config.drownIntervalMs, this.hz)
    this.bufferTicks = msToTicks(opts.config.inputBufferMs, this.hz)
  }

  /** 每个 Tick 调用一次；返回本 Tick 要激活的技能（通常一条 移动，可能再加一条 放弹）。 */
  decide(snapshot: WorldSnapshot): AbilityActivation[] {
    this.observeDrops(snapshot)
    const me = snapshot.Players.find((p) => p.NetEntityIdRaw === this.self)
    const phase = snapshot.BomberMatchState.Phase
    if (!me || me.eliminated || me.玩家属性.血量当前 <= 0 || (phase !== MatchPhase.Running && phase !== MatchPhase.Endgame)) {
      this.plan = null
      this.roamGoal = -1
      this.farmGoal = -1
      this.bombIntent = -1
      this.mode = 'idle'
      this.stuck = 0
      this.waterTicks = 0
      this.poisonTicks = 0
      this.pressUntil = -1
      this.wasInDanger = false
      this.reactAt = -1
      if (phase !== MatchPhase.Running && phase !== MatchPhase.Endgame) this.behaviourUntil = 0
      return [this.move(方向.停)]
    }
    const board = buildBoard(snapshot)
    this.size = board.size
    this.observeMatch(snapshot, board)
    const pos = me.LogicTransform.WorldPosition
    const hereCell = cellOf(pos.x, pos.z)
    if (!inBounds(hereCell.X, hereCell.Y, board.size)) return [this.move(方向.停)]
    const here = idx(hereCell.X, hereCell.Y, board.size)
    const speed = me.玩家属性.移速当前
    const tpcLand = ticksPerCell(speed, this.hz)
    const tpcWater = ticksPerCell(speed, this.hz, this.rules.waterSpeedPermille)
    const dm = buildDangerMap(board, this.dangerTicks)
    const inDanger = !isSafe(dm, here)
    const inWater = isWater(board, here)
    const inPoison = dm.poison[here] <= board.now + POISON_SOON
    this.waterTicks = inWater ? this.waterTicks + 1 : 0
    this.poisonTicks = dm.poison[here] <= board.tick ? this.poisonTicks + 1 : 0
    if (this.bombIntent !== here) this.bombIntent = -1

    const mx = Math.round(pos.x * 1000)
    const mz = Math.round(pos.z * 1000)
    const stationary = mx === this.lastMx && mz === this.lastMz
    this.stuck = this.lastDir !== 方向.停 && stationary ? this.stuck + 1 : 0
    this.lastMx = mx
    this.lastMz = mz

    // 放弹被拒（例如同 Tick 别人先在这格放了）时，规则层会把按键缓冲 bufferTicks，
    // 人一挪窝缓冲就会在没做过自检的格子落弹：按键未兑现前原地不动，除非危险迫近。
    let ownBombs = 0
    for (const b of board.pending) if (b.owner === this.self) ownBombs++
    if (this.pressUntil >= 0 && (ownBombs > this.ownBombsAtPress || board.now > this.pressUntil)) this.pressUntil = -1
    if (this.pressUntil >= 0 && !(inDanger && dm.from[here] <= board.now + 2 * tpcLand + URGENT_SLACK)) {
      this.forceThink = true
      return [this.move(方向.停)]
    }

    if (inDanger && !this.wasInDanger) {
      // 自己刚放的弹不算「没看见」；别人造成的新危险要过 2–4 Tick 才反应。
      this.reactAt = board.now - this.lastPressTick <= this.bufferTicks + 1 ? -1 : board.now + this.rng.nextInt(REACT_MIN, REACT_MAX + 1)
    }
    this.wasInDanger = inDanger
    if (inDanger && board.now < this.reactAt) {
      const n = this.follow(board, dm, here, tpcLand, tpcWater, false)
      return [this.move(n >= 0 ? steerToward(pos, hereCell, this.cellXY(n)) : 方向.停)]
    }

    let next = this.follow(board, dm, here, tpcLand, tpcWater, true)
    const reactTick = (snapshot.Tick + this.self) % REACT_TICKS === 0
    let bomb = false
    if (inDanger || inWater || inPoison || this.forceThink || next === -2 || this.stuck >= STUCK_TICKS || reactTick) {
      this.forceThink = false
      bomb = this.think(snapshot, board, dm, me, here, tpcLand, tpcWater, inDanger, inWater, inPoison)
      // 刚算出的计划不再做冲突复核：BFS 已按到达时刻校验过，复核口径更严反而会让 Bot 在危险里原地停住。
      next = this.follow(board, dm, here, tpcLand, tpcWater, false)
    }

    if (bomb) {
      // 放弹落在「本 Tick 移动之后」的所在格，而规则层的转角缓冲可能让 停 继续沿旧方向跑：
      // 只有上一 Tick 已发 停 且位置确实没变（缓冲已耗尽）才放，否则先停稳、记下意图，下一 Tick 再想。
      this.forceThink = true
      this.plan = null
      if (this.lastDir !== 方向.停 || !stationary) {
        this.bombIntent = here
        return [this.move(方向.停)]
      }
      this.bombIntent = -1
      if (this.farmGoal === here) this.farmGoal = -1
      this.pressUntil = board.now + this.bufferTicks - 1
      this.ownBombsAtPress = ownBombs
      this.lastPressTick = board.now
      return [this.move(方向.停), { ability: '放弹' }]
    }
    if (next < 0) return [this.move(方向.停)]
    return [this.move(steerToward(pos, hereCell, this.cellXY(next)))]
  }

  debugState(): BotDebugState {
    return {
      mode: this.mode,
      goal: this.plan ? this.cellXY(this.plan.goal) : null,
      lastDir: this.lastDir,
      behaviour: this.behaviour,
      huntTarget: this.huntTarget,
    }
  }

  /** 新一局重置行为；记下开局砖量（快照没给 resourceInitial 时自己数）。 */
  private observeMatch(snap: WorldSnapshot, board: Board): void {
    const mi = snap.match?.matchIndex ?? 0
    if (mi === this.matchIndex) return
    this.matchIndex = mi
    this.behaviourUntil = 0
    this.huntTarget = 0
    this.farmGoal = -1
    this.bricksAtStart = snap.match?.resourceInitial || countBricks(board)
  }

  /** 记下每件死者掉落第一次出现的 Tick，并刷新「新鲜」集合；被捡走的掉落随之忘掉。 */
  private observeDrops(snap: WorldSnapshot): void {
    const live = new Set<U64>()
    for (const p of snap.Pickups) {
      if ((p.droppedBy ?? 0) === 0) continue
      live.add(p.NetEntityIdRaw)
      if (!this.dropSeen.has(p.NetEntityIdRaw)) this.dropSeen.set(p.NetEntityIdRaw, snap.Tick)
    }
    this.freshDrops.clear()
    for (const [id, t] of this.dropSeen) {
      if (!live.has(id)) this.dropSeen.delete(id)
      else if (snap.Tick - t <= FRESH_TICKS) this.freshDrops.add(id)
    }
  }

  /** 可待、路程 ≤ maxSteps 的新鲜死者掉落是否存在。 */
  private freshDropWithin(ctx: ThinkContext, maxSteps: number): boolean {
    if (this.freshDrops.size === 0) return false
    for (const p of ctx.snap.Pickups) {
      if (!this.freshDrops.has(p.NetEntityIdRaw)) continue
      const c = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
      if (c >= 0 && ctx.field.steps[c] >= 0 && ctx.field.steps[c] <= maxSteps && isRestCell(ctx, c)) return true
    }
    return false
  }

  /** 剩余可破坏砖比例（0–1）：砖越少，发育越不值钱、追击越值钱。 */
  private resourceRatio(snap: WorldSnapshot, board: Board): number {
    const init = snap.match?.resourceInitial || this.bricksAtStart
    if (init <= 0) return 0
    const left = snap.match?.resourceInitial ? snap.match.resourceRemaining : countBricks(board)
    return Math.max(0, Math.min(1, left / init))
  }

  /** 沿计划走：返回下一格；−1 = 已到达；−2 = 没有计划 / 计划失效（需要重想）。 */
  private follow(board: Board, dm: DangerMap, here: number, tpcLand: number, tpcWater: number, validate: boolean): number {
    const plan = this.plan
    if (!plan) return -2
    if (here === plan.goal) return -1
    const i = plan.path.indexOf(here)
    if (i < 0 || i + 1 >= plan.path.length) return -2
    const n = plan.path[i + 1]
    if (!isOpen(board, n)) return -2
    const water = isWater(board, n)
    if (water && !plan.allowWater) return -2
    if (validate && conflicts(dm, n, board.now, board.now + tpcLand + (water ? tpcWater : tpcLand))) return -2
    return n
  }

  /**
   * 连续泡水的计划上限（契约溺水：进水后每 drownInterval Tick 扣一次）。常规：不再挨下一次扣血
   * （已经躲不过的那一次除外）；`survive`：可以挨扣血，但不能泡到按当前血量溺死的那一次——
   * 常规预算内上不了岸时用它，免得人在水里原地等到淹死。
   */
  private waterBudget(hp: number, survive: boolean): WaterBudget {
    const d = this.drownTicks
    const per = Math.max(1, this.config.drownPointsPerInterval)
    const deathAt = (Math.floor(this.waterTicks / d) + Math.ceil(hp / per)) * d
    const nextHit = (Math.floor((this.waterTicks + WATER_MARGIN) / d) + 1) * d
    return { maxWaterTicks: (survive ? deathAt : Math.min(nextHit, deathAt)) - WATER_MARGIN, startWaterTicks: this.waterTicks }
  }

  /** 按当前血量，路线还能在毒圈里待多少 Tick 而不被毒死（留 1 点血、离下一跳留 4 Tick）。 */
  private poisonBudget(hp: number): number {
    const interval = msToTicks(this.rules.poisonIntervalMs, this.hz)
    const hits = Math.max(0, Math.floor((hp - 1) / Math.max(1, this.rules.poisonPointsPerInterval)))
    return Math.max(0, hits * interval + interval - 4 - (this.poisonTicks % interval))
  }

  /** 重新决策并写入 this.plan；返回 true 表示本 Tick 放弹（已过自检）。 */
  private think(
    snap: WorldSnapshot,
    board: Board,
    dm: DangerMap,
    me: PlayerView,
    here: number,
    tpcLand: number,
    tpcWater: number,
    inDanger: boolean,
    inWater: boolean,
    inPoison: boolean,
  ): boolean {
    const pos = me.LogicTransform.WorldPosition
    const startExit = exitTicks(pos, here % board.size, Math.floor(here / board.size), me.玩家属性.移速当前, this.hz, inWater ? this.rules.waterSpeedPermille : 1000)
    const water = this.waterBudget(me.玩家属性.血量当前, false)
    const waterSurvive = this.waterBudget(me.玩家属性.血量当前, true)
    // 普通目标只走陆路（人在水里时允许先涉水上岸）；只有逃生才可以借道水格。
    const field = searchPaths(board, dm, here, board.now, { tpcLand, tpcWater, allowWater: inWater, startExit, ...water })
    const ctx: ThinkContext = {
      snap,
      board,
      dm,
      field,
      me,
      self: this.self,
      here,
      config: this.config,
      rules: this.rules,
      rng: this.rng,
      restHorizon: STRICT_REST,
      fuseTicks: this.fuseTicks,
      poisonBudget: this.poisonBudget(me.玩家属性.血量当前),
    }
    const escape = (): void => {
      const landSlack = 2 * tpcLand + URGENT_SLACK + 1
      let wide = searchPaths(board, dm, here, board.now, { tpcLand, tpcWater, allowWater: true, startExit, ...water })
      let goal = pickEscape({ ...ctx, field: wide }, landSlack)
      if (!reachesRest(wide, dm, goal.cell) && inWater) {
        // 泡在水里：宁可再挨一次溺水，也要涉水到安全处。
        const wading = searchPaths(board, dm, here, board.now, { tpcLand, tpcWater, allowWater: true, startExit, ...waterSurvive })
        const g = pickEscape({ ...ctx, field: wading }, landSlack)
        if (g.cell !== here && reachesRest(wading, dm, g.cell)) {
          wide = wading
          goal = g
        }
      }
      if (!reachesRest(wide, dm, goal.cell)) {
        // 按常规余量无路可逃时，赌一条零余量的路线，也好过原地等炸。
        const tight = searchPaths(board, dm, here, board.now, { tpcLand, tpcWater, allowWater: true, startExit, ...water, margin: 0 })
        const g = pickEscape({ ...ctx, field: tight }, landSlack)
        if (g.cell !== here && reachesRest(tight, dm, g.cell)) {
          wide = tight
          goal = g
        }
      }
      if ((goal.cell === here || !reachesRest(wide, dm, goal.cell)) && this.canWaitOut(board, dm, here, tpcLand, tpcWater, startExit, waterSurvive, me.玩家属性.血量当前)) {
        // 出路要等别处的火灭了才通：原地等，每 Tick 重算，路线一通就走。
        this.setPlan('escape', { cell: here, bombOnArrival: false }, wide, true)
        return
      }
      this.setPlan('escape', goal, wide, true)
    }
    // 危险迫近才纯逃生；否则普通目标本身就是「永不危险格 + 按到达时刻校验过的路径」，等价于一条逃生路线，
    // 不必每次踩进远期十字就掉头（会在逃生与发育之间逐 Tick 来回抖）。
    if (inDanger && dm.from[here] <= board.now + 2 * tpcLand + URGENT_SLACK) {
      escape()
      return false
    }
    if (!inDanger && !inPoison && (this.stuck >= STUCK_TICKS || this.rng.nextDouble() < NOISE)) {
      this.stuck = 0
      const g = pickRandomNeighbor(ctx)
      if (g) {
        this.setPlan('noise', g, field, inWater)
        return false
      }
    }

    const size = board.size
    const X = here % size
    const Y = (here - X) / size
    // 已在别人十字里的格子不放：连锁会把自己的引信提前，逃生窗口被压短，对手再补一颗就封死。
    const canBomb = me.玩家属性.手上炸弹数当前 >= 1 && !inWater && !inDanger && board.bombAt[here] < 0
    let evaluation: BombEvaluation | null = null
    const evaluate = (): BombEvaluation => {
      evaluation ??= evaluateBomb(board, {
        X,
        Y,
        power: me.玩家属性.火力当前,
        placeTick: board.now,
        fuseTicks: this.fuseTicks,
        dangerTicks: this.dangerTicks,
        tpcLand,
        tpcWater,
        slowPerCell: GATE_SLOW_PER_CELL,
      })
      return evaluation
    }
    const gate = (): boolean => evaluate().ok

    if (canBomb && this.bombIntent === here && gate()) {
      this.mode = 'bomb'
      return true
    }
    this.bombIntent = -1

    this.updateBehaviour(snap, board)
    if (canBomb && this.shouldAttack(ctx, evaluate)) {
      this.mode = 'bomb'
      return true
    }

    let chosen = this.chooseAtAnyHorizon(ctx)
    if (chosen && chosen.mode === 'hunt' && chosen.goal.cell === here && canBomb && enemiesInBlast(ctx) > 0 && !gate()) {
      // 站在攻击位上、对手也在十字里，但放了逃不掉：换一个攻击位，别在这里干等。
      this.badBombCell = here
      this.badBombUntil = board.now + BAD_BOMB_COOLDOWN
      chosen = this.chooseAtAnyHorizon(ctx)
    }
    if (chosen && chosen.goal.cell === here && chosen.goal.bombOnArrival && canBomb) {
      if (gate()) {
        this.mode = 'bomb'
        return true
      }
      this.badBombCell = here
      this.badBombUntil = board.now + BAD_BOMB_COOLDOWN
      if (this.farmGoal === here) this.farmGoal = -1
      chosen = this.chooseAtAnyHorizon(ctx)
    }
    if (!chosen) {
      // 常规路线哪儿也去不了（被水 + 砖围在小角落里 / 泡在水里、常规预算上不了岸）：允许涉水出去，别原地干等。
      const wet = searchPaths(board, dm, here, board.now, { tpcLand, tpcWater, allowWater: true, startExit, ...(inWater ? waterSurvive : water) })
      const wade = this.chooseAtAnyHorizon({ ...ctx, field: wet })
      if (wade && wade.goal.cell !== here) {
        this.setPlan(wade.mode, wade.goal, wet, true)
        return false
      }
    }
    if (!chosen) {
      if (inDanger || inWater || inPoison) escape()
      else this.setPlan('wait', { cell: here, bombOnArrival: false }, field, false)
      return false
    }
    this.setPlan(chosen.mode, chosen.goal, field, inWater)
    return false
  }

  /**
   * 对人放弹：这颗弹（连同场上已有的弹）能困死附近某个对手 → 几乎必放；十字罩住对手 → 按行为概率放。
   * 放之前一律过自检。决赛圈人少时打满。
   */
  private shouldAttack(ctx: ThinkContext, evaluate: () => BombEvaluation): boolean {
    const near = enemiesNear(ctx, TRAP_SLACK)
    if (near.length === 0) return false
    const fc = ctx.board.finalCircle
    const frenzy = isFrenzy(fc)
    const inCross = enemiesInBlast(ctx)
    const ev = evaluate()
    if (!ev.ok) return false
    for (const p of near) {
      if (!enemyCanEscape(ev.board, ev.dm, p, ctx)) {
        if (frenzy || this.rng.nextDouble() < TRAP_CHANCE) return true
        break
      }
    }
    if (inCross === 0) return false
    return frenzy || this.rng.nextDouble() < BLAST_CHANCE[this.behaviour]
  }

  /** 行为到期时按人格权重 + 局势重新抽样。 */
  private updateBehaviour(snap: WorldSnapshot, board: Board): void {
    if (board.now < this.behaviourUntil) return
    const w = WEIGHTS[this.personality]
    const ratio = this.resourceRatio(snap, board)
    let farm = w.farm * (0.15 + ratio)
    let hunt = w.hunt * (1 + (1 - ratio) * 2)
    const collect = w.collect
    let roam = w.roam
    const fc = board.finalCircle
    if (fc) {
      hunt *= isFrenzy(fc) ? 6 : 2
      roam *= 0.3
      // 决赛圈里「发育」主要是打宝箱。
      farm = Math.max(farm, w.farm * 0.6)
    }
    const total = farm + hunt + collect + roam
    let r = this.rng.nextDouble() * total
    let pick: BotBehaviour = 'roam'
    for (const [b, v] of [
      ['farm', farm],
      ['hunt', hunt],
      ['collect', collect],
      ['roam', roam],
    ] as const) {
      if (r < v) {
        pick = b
        break
      }
      r -= v
    }
    this.setBehaviour(pick, this.rng.nextInt(STINT_MIN, STINT_MAX), board.now)
  }

  private setBehaviour(b: BotBehaviour, ticks: number, now: number): void {
    this.behaviour = b
    this.behaviourUntil = now + ticks
  }

  /**
   * 选普通目标：先只接受永不进毒圈、永不着火的格子（决赛圈预告了下一圈就提前往里走）；一个都没有时
   * 先放宽火（圈内暂时不着火也行），再放宽到「近期不进毒圈」，再没有才完全不看毒圈（被砖困在圈外，也得先把路炸开）。
   */
  private chooseAtAnyHorizon(ctx: ThinkContext): { mode: BotMode; goal: Goal } | null {
    const g = this.chooseGoal(ctx)
    const fc = ctx.board.finalCircle
    if (g || !fc) return g
    const lukewarm = this.chooseGoal({ ...ctx, fireSlack: FIRE_SLACK })
    if (lukewarm) return lukewarm
    const relaxed = this.chooseGoal({ ...ctx, restHorizon: ctx.board.now + POISON_RELAXED })
    if (relaxed) return relaxed
    const inward = pickInward(ctx, fc.nextRing ?? fc.ring)
    if (inward) return { mode: 'roam', goal: inward }
    const open = pickFarm({ ...ctx, restHorizon: -1 }, ctx.board.now < this.badBombUntil ? this.badBombCell : -1)
    return open ? { mode: 'farm', goal: open } : null
  }

  private chooseGoal(ctx: ThinkContext): { mode: BotMode; goal: Goal } | null {
    const now = ctx.board.now
    // 帽子 = 强化数（ADR 0028）：死者掉出的强化既是分也是实力，collector 看见新鲜掉落立刻改行去抢。
    if (this.personality === 'collector' && this.behaviour !== 'collect' && this.freshDropWithin(ctx, FRESH_RUSH_STEPS)) {
      this.setBehaviour('collect', this.rng.nextInt(60, 120), now)
    }
    const collecting = this.behaviour === 'collect'
    const pickup = pickPickup(ctx, collecting ? 16 : 7, collecting ? 10 : 8, this.freshDrops)
    if (pickup) return { mode: 'pickup', goal: pickup }
    // 死者掉落多半躺在还有引信的十字里，等「永不着火」就被烧光了：火至少还要 GRAB_SLACK Tick 才来就先抢，抢到再逃。
    if (ctx.fireSlack === undefined || ctx.fireSlack === null) {
      const grab = pickPickup({ ...ctx, fireSlack: GRAB_SLACK }, collecting ? 16 : 7, collecting ? 10 : 8, this.freshDrops, true)
      if (grab) return { mode: 'pickup', goal: grab }
    }
    const avoid = now < this.badBombUntil ? this.badBombCell : -1

    const fc = ctx.board.finalCircle
    const frenzy = isFrenzy(fc)
    if (this.behaviour !== 'hunt' && now >= this.engageCheckAt && ctx.me.玩家属性.手上炸弹数当前 >= 1) {
      this.engageCheckAt = now + ENGAGE_CHECK
      const near = nearestEnemyWithin(ctx, ENGAGE_STEPS)
      if (near && (frenzy || this.rng.nextDouble() < ENGAGE_CHANCE[this.personality])) {
        this.huntTarget = near.NetEntityIdRaw
        this.setBehaviour('hunt', this.rng.nextInt(60, 120), now)
      }
    }

    let huntFailed = false
    for (let attempt = 0; attempt < 3; attempt++) {
      switch (this.behaviour) {
        case 'hunt': {
          const target = huntFailed ? null : pickHuntTarget(ctx, this.huntTarget, RICH_WEIGHT[this.personality])
          this.huntTarget = target?.NetEntityIdRaw ?? 0
          const g = target ? huntGoal(ctx, target, avoid) : null
          if (g) return { mode: 'hunt', goal: g }
          // 目标够不着：一段时间内先炸砖开路（滞回，不再逐 Tick 切回追击）。
          huntFailed = true
          this.setBehaviour('farm', BLOCKED_FARM_TICKS, now)
          continue
        }
        case 'farm':
        case 'collect': {
          const g = this.farm(ctx, avoid)
          if (g) return { mode: 'farm', goal: g }
          if (!huntFailed && ctx.snap.Players.some((p) => isActiveEnemy(ctx, p))) {
            this.setBehaviour('hunt', this.rng.nextInt(STINT_MIN, STINT_MAX), now)
            continue
          }
          const r = this.roam(ctx, avoid)
          return r ? { mode: 'roam', goal: r } : null
        }
        case 'roam': {
          const r = this.roam(ctx, avoid)
          if (r) return { mode: 'roam', goal: r }
          const f = this.farm(ctx, avoid)
          return f ? { mode: 'farm', goal: f } : null
        }
      }
    }
    const r = this.roam(ctx, avoid)
    return r ? { mode: 'roam', goal: r } : null
  }

  /** 发育目标一经选定就保持（直到放过弹 / 自检失败 / 不再值得 / 超时），不被其他候选逐 Tick 抢走。 */
  private farm(ctx: ThinkContext, avoid: number): Goal | null {
    const now = ctx.board.now
    const g = this.farmGoal
    if (
      g >= 0 &&
      g !== avoid &&
      now < this.farmGoalUntil &&
      isRestCell(ctx, g) &&
      brickValue(ctx, g, ctx.me.玩家属性.火力当前) > 0
    ) {
      return { cell: g, bombOnArrival: true }
    }
    const pick = pickFarm(ctx, avoid)
    this.farmGoal = pick ? pick.cell : -1
    this.farmGoalUntil = now + FARM_STICK_TICKS
    return pick
  }

  /** 在起点原地等 d Tick 后再走，是否存在通往永不危险格的路线（起点本身在等待期间必须安全，泡水的不能等到溺水）。 */
  private canWaitOut(
    board: Board,
    dm: DangerMap,
    here: number,
    tpcLand: number,
    tpcWater: number,
    startExit: readonly number[],
    water: WaterBudget,
    hp: number,
  ): boolean {
    // 毒圈里干等：最多等到还剩 1 点血前的那一跳。
    const poisonTicks = msToTicks(this.rules.poisonIntervalMs, this.hz)
    const maxPoisonWait = Math.max(0, Math.floor((hp - 1) / Math.max(1, this.rules.poisonPointsPerInterval)) * poisonTicks - WAIT_STEP)
    const wet = isWater(board, here)
    for (let d = WAIT_STEP; d <= MAX_WAIT; d += WAIT_STEP) {
      const t = board.now + d
      if (conflicts(dm, here, board.now, t + tpcLand)) return false
      if (wet && water.startWaterTicks + d >= water.maxWaterTicks) return false
      if (dm.poison[here] <= t && d > maxPoisonWait) return false
      const f = searchPaths(board, dm, here, t, {
        tpcLand,
        tpcWater,
        allowWater: true,
        startExit,
        maxWaterTicks: water.maxWaterTicks,
        startWaterTicks: water.startWaterTicks + (wet ? d : 0),
      })
      for (const c of f.reached) if (c !== here && reachesRest(f, dm, c)) return true
    }
    return false
  }

  private roam(ctx: ThinkContext, avoid: number): Goal | null {
    if (this.roamGoal === ctx.here) {
      this.roamGoal = -1
      if (ctx.here !== avoid && brickValue(ctx, ctx.here, ctx.me.玩家属性.火力当前) > 0 && this.rng.nextDouble() < ROAM_BOMB_CHANCE) {
        return { cell: ctx.here, bombOnArrival: true }
      }
    }
    if (this.roamGoal >= 0 && isRestCell(ctx, this.roamGoal)) return { cell: this.roamGoal, bombOnArrival: false }
    // 这一档门槛下挑不到就返回 null，但不清掉旧目标：放宽一档后它可能仍然有效，免得每次思考换一个随机点。
    const pick = pickRoamCell(ctx)
    if (pick < 0) return null
    this.roamGoal = pick
    return { cell: pick, bombOnArrival: false }
  }

  private setPlan(mode: BotMode, goal: Goal, field: PathField, allowWater: boolean): void {
    const path = pathTo(field, goal.cell)
    this.mode = mode
    this.plan = { mode, goal: path.length > 0 ? goal.cell : field.start, path: path.length > 0 ? path : [field.start], allowWater }
  }

  private move(dir: 方向): AbilityActivation {
    // 停 不带「按了转弯」：规则层在转角缓冲期内收到 停 会沿用上一方向继续跑。
    const turn = dir !== this.lastDir && dir !== 方向.停
    this.lastDir = dir
    return { ability: '移动', 输入: { 方向: dir, 按了转弯: turn } }
  }

  private cellXY(c: number): BomberCell {
    const X = c % this.size
    return { X, Y: (c - X) / this.size }
  }
}

function isFrenzy(fc: FinalCircleView | null): boolean {
  return fc !== null && (fc.aliveCount <= FEW_ALIVE || fc.stageIndex >= FRENZY_STAGE)
}

function countBricks(board: Board): number {
  let n = 0
  for (let i = 0; i < board.brick.length; i++) if (isDestructibleBrick(board, i)) n++
  return n
}
