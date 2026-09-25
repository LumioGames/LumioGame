import { BlockType, PickupKind, type BomberConfig, type PlayerView, type ProtoRules, type RingRect, type U64, type WorldSnapshot } from '../contract'
import { cellOf, FOUR_DIRS, DIR_VEC, idx, inBounds } from '../shared/grid'
import type { BotRng } from './bot-rng'
import { isOpen, isWater, ticksPerCell, type Board } from './board'
import { isSafe, poisonFreeAfter, restsAt, traceBlast, NEVER, type DangerMap } from './danger-map'
import { exitTicks, searchPaths, type PathField } from './path-search'

/** 一次思考的只读上下文。 */
export interface ThinkContext {
  snap: WorldSnapshot
  board: Board
  dm: DangerMap
  field: PathField
  me: PlayerView
  self: U64
  here: number
  config: BomberConfig
  rules: ProtoRules
  rng: BotRng
  /** 可待格的毒圈门槛：毒圈要晚于该 Tick 才到（NEVER − 1 = 只接受永不进毒圈的格子）。 */
  restHorizon: number
  /** 炸弹引信（Tick）：判断对手的重生保护在起爆时是否已过。 */
  fuseTicks: number
  /**
   * null = 可待格必须永不着火；给数值时放宽为「到达时火已灭，或火还要至少这么多 Tick 才来」
   * （决赛圈小圈里到处是引信中的炸弹，死守「永不着火」只会把人逼到圈外挨毒）。
   */
  fireSlack?: number | null
  /** 放宽毒圈门槛（允许穿毒）时，路线在毒圈里最多能待的 Tick（按当前血量算，不能走到毒死）。缺省不限。 */
  poisonBudget?: number
}

export interface Goal {
  cell: number
  /** 到达后尝试放弹（仍要过放弹自检）。 */
  bombOnArrival: boolean
}

/** 只接受永不进毒圈的格子。 */
export const STRICT_REST = NEVER - 1
/** 宝箱每次命中的发育价值（开箱必出 4 件，比一块积木值钱得多）。 */
const CHEST_HIT_VALUE = 2.5
/** 追击时考虑的攻击位最远步数；更远就先靠近。 */
const ATTACK_MAX_STEPS = 16

/**
 * 可以作为「停下来待着」的普通目标：可达、永不着火、陆地、毒圈在门槛之后（「火灭了再去」只留给逃生）；
 * 严格门槛下路线也不许穿毒圈（BFS 是按步数的，最短路可能贴着圈外走）。
 */
export function isRestCell(ctx: ThinkContext, c: number): boolean {
  return (
    ctx.field.steps[c] >= 0 &&
    calmEnough(ctx, c) &&
    !isWater(ctx.board, c) &&
    poisonFreeAfter(ctx.dm, c, ctx.restHorizon) &&
    (ctx.field.viaPoison[c] === 0 || (ctx.restHorizon < STRICT_REST && ctx.field.poisonTicks[c] <= (ctx.poisonBudget ?? Infinity)))
  )
}

function calmEnough(ctx: ThinkContext, c: number): boolean {
  if (isSafe(ctx.dm, c)) return true
  const slack = ctx.fireSlack
  if (slack === null || slack === undefined) return false
  return restsAt(ctx.dm, c, ctx.field.enter[c]) || ctx.dm.from[c] > ctx.field.enterLate[c] + slack
}

/** 从 field 的起点出发，c 是否可达且到达后不再着火（不论水陆、不看毒圈）。 */
export function reachesRest(field: PathField, dm: DangerMap, c: number): boolean {
  return field.steps[c] >= 0 && restsAt(dm, c, field.enter[c])
}

/** 活着、没出局的对手。 */
export function isActiveEnemy(ctx: ThinkContext, p: PlayerView): boolean {
  return p.NetEntityIdRaw !== ctx.self && p.玩家属性.血量当前 > 0 && !p.eliminated
}

/** 起爆时仍在重生保护里（炸了也白炸）。 */
export function protectedAtDetonation(ctx: ThinkContext, p: PlayerView): boolean {
  return p.BomberPlayerState.ProtectedUntilTick > ctx.board.now + ctx.fuseTicks
}

/**
 * 逃生：最近的永不着火格，先陆地后水，且到达后短期内不进毒圈；都没有时同样顺序但不看毒圈（毒是慢慢掉血，火是一下一心）。
 * 再没有时，先找「危险还远」（余量 ≥ landSlack）的陆地格——泡在水里干等会溺死，上岸重置溺水计时、危险临近再回水里；
 * 再不行才挑危险来得最晚的可达格。
 */
export function pickEscape(ctx: ThinkContext, landSlack = Infinity): Goal {
  const { field, dm, board } = ctx
  let water = -1
  for (const poisonAware of [true, false]) {
    for (const c of field.reached) {
      if (c === field.start || !restsAt(dm, c, field.enter[c])) continue
      if (poisonAware && !poisonFreeAfter(dm, c, field.enter[c] + 40)) continue
      if (!isWater(board, c)) return { cell: c, bombOnArrival: false }
      if (water < 0) water = c
    }
    if (water >= 0) return { cell: water, bombOnArrival: false }
  }
  let land = -1
  let landBest = -NEVER
  for (const c of field.reached) {
    if (isWater(board, c)) continue
    const slack = dm.from[c] - field.enterLate[c]
    if (slack >= landSlack && slack > landBest) {
      landBest = slack
      land = c
    }
  }
  if (land >= 0) return { cell: land, bombOnArrival: false }
  let best = field.start
  let bestSlack = -NEVER
  for (const c of field.reached) {
    const slack = dm.from[c] - field.enterLate[c]
    if (slack > bestSlack) {
      bestSlack = slack
      best = c
    }
  }
  return { cell: best, bombOnArrival: false }
}

/** 强化（火力 / 炸弹 / 速度）既是实力也是帽子（ADR 0028：帽数 = 强化数），比血包多追这么多步。 */
const POWERUP_BONUS = 2

/**
 * 糖果：只捡没到上限的（到上限规则层不让捡，跑过去白费）。强化糖多追 POWERUP_BONUS 步；死者掉出的强化
 * （droppedBy ≠ 0）是别人抢的对象，追的距离再多 droppedBonus 步、同距离时优先；`fresh` 里的（刚掉出来的）再优先一点。
 * `droppedOnly` 只看死者掉落（给「火来之前抢了就走」用）。
 */
export function pickPickup(ctx: ThinkContext, maxSteps: number, droppedBonus = 8, fresh?: ReadonlySet<U64>, droppedOnly = false): Goal | null {
  const a = ctx.me.玩家属性
  let ownLive = 0
  for (const b of ctx.board.pending) if (b.owner === ctx.self) ownLive++
  const useful = (k: PickupKind): boolean => {
    switch (k) {
      case PickupKind.FirePlus:
        return a.火力当前 < ctx.rules.powerCap
      case PickupKind.BombPlus:
        return a.手上炸弹数当前 + ownLive < ctx.rules.capacityCap
      case PickupKind.SpeedPlus:
        return a.移速当前 < ctx.rules.speedCapMilli
      case PickupKind.HealthPack:
        return a.血量当前 < ctx.config.maxHealthPoints
      case PickupKind.SkillCandy:
        // W0 桩：Bot 切片接入 resolveSkillPickup 判断值不值得捡；在此之前不去捡技能糖。
        return false
    }
  }
  let best: Goal | null = null
  let bestScore = Infinity
  for (const p of ctx.snap.Pickups) {
    const c = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
    if (c < 0 || !isRestCell(ctx, c) || !useful(p.BomberPickupItem.Kind)) continue
    const d = ctx.field.steps[c]
    const powerup = p.BomberPickupItem.Kind !== PickupKind.HealthPack
    const dropped = (p.droppedBy ?? 0) !== 0
    if (droppedOnly && !dropped) continue
    const isFresh = dropped && fresh !== undefined && fresh.has(p.NetEntityIdRaw)
    const needHeal = !powerup && a.血量当前 <= ctx.rules.bombDamagePoints
    const reach = maxSteps + (powerup ? POWERUP_BONUS : 0) + (dropped ? droppedBonus : 0) + (needHeal ? 8 : 0)
    if (d > reach) continue
    const score = d - (dropped ? 3 : 0) - (isFresh ? 2 : 0) - (powerup ? 1 : 0)
    if (score < bestScore) {
      bestScore = score
      best = { cell: c, bombOnArrival: false }
    }
  }
  return best
}

/** 从格 c 放一颗火力 power 的炸弹能炸到的、还没被别的炸弹预定的可破坏砖（木箱必掉，权重 1.5），加上宝箱命中。 */
export function brickValue(ctx: ThinkContext, c: number, power: number): number {
  const size = ctx.board.size
  const X = c % size
  const bl = traceBlast(ctx.board, X, (c - X) / size, power, { covered: [], bricks: [], chests: [] })
  let v = 0
  for (const b of bl.bricks) {
    if (ctx.dm.doomedAt[b] !== NEVER) continue
    v += ctx.board.brick[b] === BlockType.木箱 ? 1.5 : 1
  }
  // 宝箱每颗炸弹各算一次命中，别人已经在炸也照样值钱。
  v += (bl.chests?.length ?? 0) * CHEST_HIT_VALUE
  return v
}

/** 发育：到能炸最多砖 / 宝箱的格子放弹，价值 / (d + 3)。`avoid` 是最近放弹自检失败的格子。 */
export function pickFarm(ctx: ThinkContext, avoid: number): Goal | null {
  const power = ctx.me.玩家属性.火力当前
  let best: Goal | null = null
  let bestScore = 0
  for (const c of ctx.field.reached) {
    if (c === avoid || !isRestCell(ctx, c)) continue
    const v = brickValue(ctx, c, power)
    if (v <= 0) continue
    const score = v / (ctx.field.steps[c] + 3)
    if (score > bestScore) {
      bestScore = score
      best = { cell: c, bombOnArrival: true }
    }
  }
  return best
}

/** 追击时帽数加分的上限（步）：再富也不值得横穿整张图。 */
const RICH_CAP = 14

/**
 * 追击目标：可达步数越近越好；帽王、帽多（帽数 = 强化数，打死他掉的强化最多）、残血、上一次的目标（防抖）加分，
 * 起爆时仍受保护的扣分。所有 Bot 都会追帽王与富人（不只 hunter），强化才会流动。
 * `richWeight` 是每顶帽子折合的步数（hunter 人格更高）；帽子加分封顶 RICH_CAP 步。
 */
export function pickHuntTarget(ctx: ThinkContext, prefer: U64 = 0, richWeight = 1.2): PlayerView | null {
  const king = ctx.snap.BomberMatchState.HatKingNetEntityIdRaw
  const hereX = ctx.here % ctx.board.size
  const hereY = (ctx.here - hereX) / ctx.board.size
  const maxHp = ctx.config.maxHealthPoints
  let best: PlayerView | null = null
  let bestScore = Infinity
  for (const p of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, p)) continue
    const c = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
    if (c < 0) continue
    const X = c % ctx.board.size
    const Y = (c - X) / ctx.board.size
    const steps = ctx.field.steps[c]
    let score = steps >= 0 ? steps : 2 * (Math.abs(X - hereX) + Math.abs(Y - hereY)) + 10
    if (p.NetEntityIdRaw === king) score -= 10
    score -= Math.min(RICH_CAP, richWeight * p.BomberPlayerState.HatCount)
    score -= (maxHp - p.玩家属性.血量当前) * 1.5
    if (protectedAtDetonation(ctx, p)) score += 12
    if (p.NetEntityIdRaw === prefer) score -= 3
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

/**
 * 追击：先找一个可待、放弹十字能罩住目标当前格的攻击位（最近者），到了之后由放弹决策判断要不要放；
 * 没有攻击位就往离目标路程更近的可待格靠。两者都没有（目标被砖 / 水 / 炸弹隔开，已经站在最近处）返回 null，
 * 由调用方改去炸砖开路——**不**原地停着等。
 */
export function huntGoal(ctx: ThinkContext, target: PlayerView, avoid: number): Goal | null {
  const t = cellIndexOf(ctx.board, target.LogicTransform.WorldPosition)
  if (t < 0) return null
  const size = ctx.board.size
  const power = ctx.me.玩家属性.火力当前
  let best = -1
  let bestScore = Infinity
  for (const c of ctx.field.reached) {
    const steps = ctx.field.steps[c]
    if (steps > ATTACK_MAX_STEPS || c === avoid || !isRestCell(ctx, c)) continue
    const X = c % size
    const Y = (c - X) / size
    const tx = t % size
    const ty = (t - tx) / size
    if (X !== tx && Y !== ty) continue
    if (Math.abs(X - tx) + Math.abs(Y - ty) > power) continue
    if (!traceBlast(ctx.board, X, Y, power, { covered: [], bricks: [] }).covered.includes(t)) continue
    const score = steps + (c === t ? 1 : 0)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  if (best >= 0) return { cell: best, bombOnArrival: false }

  const distT = distanceFrom(ctx.board, t)
  const hereD = distT[ctx.here]
  let approach = -1
  let approachD = hereD < 0 ? Infinity : hereD
  let approachSteps = Infinity
  for (const c of ctx.field.reached) {
    const d = distT[c]
    if (d < 0 || !isRestCell(ctx, c)) continue
    const steps = ctx.field.steps[c]
    if (d < approachD || (d === approachD && approach >= 0 && steps < approachSteps)) {
      approachD = d
      approachSteps = steps
      approach = c
    }
  }
  return approach >= 0 && approach !== ctx.here ? { cell: approach, bombOnArrival: false } : null
}

/** 从格 t 出发的 BFS 路程（只看地形 / 炸弹 / 宝箱挡路，水格可走）；−1 = 不连通。 */
function distanceFrom(board: Board, t: number): Int32Array {
  const size = board.size
  const d = new Int32Array(size * size).fill(-1)
  const q = [t]
  d[t] = 0
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const cx = c % size
    const cy = (c - cx) / size
    for (const dir of FOUR_DIRS) {
      const v = DIR_VEC[dir]
      const x = cx + v.dx
      const y = cy + v.dy
      if (!inBounds(x, y, size)) continue
      const n = y * size + x
      if (d[n] >= 0 || !isOpen(board, n)) continue
      d[n] = d[c] + 1
      q.push(n)
    }
  }
  return d
}

/** 离自己路程最近的对手（步数 ≤ maxSteps），用于「近身就开打」。 */
export function nearestEnemyWithin(ctx: ThinkContext, maxSteps: number): PlayerView | null {
  let best: PlayerView | null = null
  let bestD = maxSteps + 1
  for (const p of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, p) || protectedAtDetonation(ctx, p)) continue
    const c = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
    if (c < 0) continue
    const d = ctx.field.steps[c]
    if (d >= 0 && d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** 当前格放弹能炸到的、起爆时没有保护的对手数。 */
export function enemiesInBlast(ctx: ThinkContext): number {
  return enemiesInCross(ctx, ctx.here).length
}

/** 从格 c 放弹十字覆盖到的、起爆时没有保护的对手。 */
export function enemiesInCross(ctx: ThinkContext, c: number): PlayerView[] {
  const size = ctx.board.size
  const X = c % size
  const bl = traceBlast(ctx.board, X, (c - X) / size, ctx.me.玩家属性.火力当前, { covered: [], bricks: [] })
  const covered = new Set(bl.covered)
  const out: PlayerView[] = []
  for (const p of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, p) || protectedAtDetonation(ctx, p)) continue
    const pc = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
    if (pc >= 0 && covered.has(pc)) out.push(p)
  }
  return out
}

/** 放弹十字附近（曼哈顿 ≤ power + slack）的、起爆时没有保护的对手：困杀判定的候选。 */
export function enemiesNear(ctx: ThinkContext, slack: number): PlayerView[] {
  const size = ctx.board.size
  const hx = ctx.here % size
  const hy = (ctx.here - hx) / size
  const reach = ctx.me.玩家属性.火力当前 + slack
  const out: PlayerView[] = []
  for (const p of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, p) || protectedAtDetonation(ctx, p)) continue
    const c = cellOf(p.LogicTransform.WorldPosition.x, p.LogicTransform.WorldPosition.z)
    if (Math.abs(c.X - hx) + Math.abs(c.Y - hy) <= reach) out.push(p)
  }
  return out
}

/**
 * 对手在给定棋盘 / 危险图下是否还逃得掉：按对手的真实移速、零余量、不带慢速估计（往乐观里估对手），
 * 能走到一个到达后不再着火的格子就算逃得掉。给「这颗弹 + 场上已有的弹能不能把他困死」用。
 */
export function enemyCanEscape(board: Board, dm: DangerMap, enemy: PlayerView, ctx: ThinkContext): boolean {
  const p = enemy.LogicTransform.WorldPosition
  const cell = cellOf(p.x, p.z)
  if (!inBounds(cell.X, cell.Y, board.size)) return true
  const start = idx(cell.X, cell.Y, board.size)
  const hz = ctx.config.tickRateHz
  const speed = enemy.玩家属性.移速当前
  const wet = isWater(board, start)
  const f = searchPaths(board, dm, start, board.now, {
    tpcLand: ticksPerCell(speed, hz),
    tpcWater: ticksPerCell(speed, hz, ctx.rules.waterSpeedPermille),
    slowPerCell: 0,
    margin: 0,
    allowWater: true,
    startExit: exitTicks(p, cell.X, cell.Y, speed, hz, wet ? ctx.rules.waterSpeedPermille : 1000),
  })
  for (const c of f.reached) if (restsAt(dm, c, f.enter[c])) return true
  return false
}

/** 格到安全圈的格数（圈内 = 0）。 */
export function ringDistance(r: RingRect, c: number, size: number): number {
  const X = c % size
  const Y = (c - X) / size
  return Math.max(0, r.Min - X, X - r.Max) + Math.max(0, r.Min - Y, Y - r.Max)
}

/** 圈里「暂时能待」：到达时火已灭，或火还要这么多 Tick 才来——比在圈外挨毒强，火来了再躲。 */
const INSIDE_SLACK = 30

/**
 * 进圈：圈内没有永不着火的格子可去时（到处是引信中的炸弹），先去圈内暂时能待的最近格；
 * 再没有就走到离圈最近、不着火的陆地格；已经是最近的就返回 null。
 */
export function pickInward(ctx: ThinkContext, ring: RingRect): Goal | null {
  const size = ctx.board.size
  const { field, dm } = ctx
  let inside = -1
  for (const c of field.reached) {
    if (c === ctx.here || isWater(ctx.board, c) || ringDistance(ring, c, size) > 0) continue
    if (!restsAt(dm, c, field.enter[c]) && dm.from[c] < field.enterLate[c] + INSIDE_SLACK) continue
    if (inside < 0 || field.steps[c] < field.steps[inside]) inside = c
  }
  if (inside >= 0 && ringDistance(ring, ctx.here, size) > 0) return { cell: inside, bombOnArrival: false }
  let best = -1
  let bestScore = ringDistance(ring, ctx.here, size) * 100
  for (const c of ctx.field.reached) {
    if (!isSafe(ctx.dm, c) || isWater(ctx.board, c)) continue
    const score = ringDistance(ring, c, size) * 100 + ctx.field.steps[c]
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best >= 0 && best !== ctx.here ? { cell: best, bombOnArrival: false } : null
}

/** 漫游：随机挑一个至少 2 步外的可待格。 */
export function pickRoamCell(ctx: ThinkContext): number {
  const cands: number[] = []
  for (const c of ctx.field.reached) if (ctx.field.steps[c] >= 2 && isRestCell(ctx, c)) cands.push(c)
  if (cands.length === 0) return -1
  return cands[ctx.rng.nextInt(0, cands.length)]
}

/** 决策噪声 / 卡住时：随机一个相邻的可待格。 */
export function pickRandomNeighbor(ctx: ThinkContext): Goal | null {
  const cands: number[] = []
  for (const c of ctx.field.reached) if (ctx.field.steps[c] === 1 && isRestCell(ctx, c)) cands.push(c)
  if (cands.length === 0) return null
  return { cell: cands[ctx.rng.nextInt(0, cands.length)], bombOnArrival: false }
}

export function cellIndexOf(board: Board, p: { x: number; z: number }): number {
  const c = cellOf(p.x, p.z)
  return inBounds(c.X, c.Y, board.size) ? idx(c.X, c.Y, board.size) : -1
}
