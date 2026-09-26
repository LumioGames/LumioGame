import { 方向, type PlayerView } from '../contract'
import { DIR_VEC, FOUR_DIRS } from '../shared/grid'
import { blinkScan, kickOutcome } from '../shared/skill-geometry'
import { cellIndexOf, enemiesInCross, isActiveEnemy, protectedAtDetonation, type Goal, type ThinkContext } from './behaviors'
import { gridProbe, isWater, type Board } from './board'
import { buildDangerMap, isSafe, poisonFreeAfter, restsAt, traceBlast, type DangerMap } from './danger-map'
import { activeReady, hasKick, isBlinkSkill, paramsOf } from './skill-state'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：Bot 用技能的决策（只读快照：PlayerView.skills、FireZones、BombView.kick、
 * PierceLayers、PickupView.skill；几何一律走 shared/skill-geometry，与规则层同一口径）。
 * 每个函数只回答「该不该 / 往哪放」，按键与概率门（skillUsePermille）在 bot-brain。
 */

/** 闪现落点至少这么多 Tick 内不进毒圈才算能落。 */
const LAND_POISON_TICKS = 40

export interface SkillAim {
  dir: 方向
  landing: number
}

function neighbour(size: number, c: number, d: 方向): number {
  const v = DIR_VEC[d]
  const x = (c % size) + v.dx
  const y = Math.floor(c / size) + v.dy
  return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x
}

/** 落点能落：陆地、别人的火已灭、LAND_POISON_TICKS 内不进毒圈。 */
function landable(ctx: ThinkContext, dm: DangerMap, L: number): boolean {
  return !isWater(ctx.board, L) && dm.burn[L] <= ctx.board.now + 1 && poisonFreeAfter(dm, L, ctx.board.now + LAND_POISON_TICKS)
}

/** 自己的主动技能是闪现 / 冲刺且可用时的射程；否则 0。 */
function blinkRange(ctx: ThinkContext): number {
  const a = ctx.skills.active
  if (!a || !isBlinkSkill(a.id) || !activeReady(ctx.skills, ctx.board.now)) return 0
  return paramsOf(ctx.rules, a).rangeCells
}

/**
 * 逃生闪现：四个方向里挑落点最好的——永不着火 > 落地后火已灭 > 只是陆地且火来得最晚。按 FOUR_DIRS 序，同档取先者。
 */
export function pickBlinkEscape(ctx: ThinkContext, dm: DangerMap): SkillAim | null {
  const range = blinkRange(ctx)
  if (range <= 0) return null
  const probe = gridProbe(ctx.board)
  let best: SkillAim | null = null
  let bestTier = 3
  let bestSlack = -Infinity
  for (const d of FOUR_DIRS) {
    const r = blinkScan(probe, ctx.here, d, range)
    if (!r || !landable(ctx, dm, r.landing)) continue
    const L = r.landing
    const tier = isSafe(dm, L) ? 0 : restsAt(dm, L, ctx.board.now + 1) ? 1 : 2
    const slack = dm.from[L] - ctx.board.now
    if (tier < bestTier || (tier === bestTier && tier === 2 && slack > bestSlack)) {
      best = { dir: d, landing: L }
      bestTier = tier
      bestSlack = slack
    }
  }
  // 第 2 档（火只是来得晚）至少要比留在原地晚：否则闪了也白闪。
  if (best && bestTier === 2 && dm.from[best.landing] <= dm.from[ctx.here]) return null
  return best
}

/** 追击闪现：落点可待、从落点放弹能罩住对手，且走路到不了或至少 blinkChaseMinSteps 步。 */
export function pickBlinkChase(ctx: ThinkContext): SkillAim | null {
  const range = blinkRange(ctx)
  if (range <= 0) return null
  const probe = gridProbe(ctx.board)
  for (const d of FOUR_DIRS) {
    const r = blinkScan(probe, ctx.here, d, range)
    if (!r) continue
    const L = r.landing
    if (!isSafe(ctx.dm, L) || !landable(ctx, ctx.dm, L) || !poisonFreeAfter(ctx.dm, L, ctx.restHorizon)) continue
    const steps = ctx.field.steps[L]
    if (steps >= 0 && steps < ctx.tactics.blinkChaseMinSteps) continue
    if (enemiesInCross(ctx, L).length > 0) return { dir: d, landing: L }
  }
  return null
}

/** 火焰冲刺穿人：冲刺路径（火墙格，不含起点）上站着可烧的对手，落点永不着火且能落。 */
export function pickDashThrough(ctx: ThinkContext): SkillAim | null {
  const a = ctx.skills.active
  if (!a || a.id !== 'fireDash' || !activeReady(ctx.skills, ctx.board.now)) return null
  const range = paramsOf(ctx.rules, a).rangeCells
  const probe = gridProbe(ctx.board)
  const targets = new Set<number>()
  for (const e of burnableEnemies(ctx)) targets.add(e)
  if (targets.size === 0) return null
  for (const d of FOUR_DIRS) {
    const r = blinkScan(probe, ctx.here, d, range)
    if (!r || !isSafe(ctx.dm, r.landing) || !landable(ctx, ctx.dm, r.landing)) continue
    if (r.path.some((c, i) => i > 0 && targets.has(c))) return { dir: d, landing: r.landing }
  }
  return null
}

/** 火能烧到的对手格：活着、没出局、不在重生保护或泡泡里。 */
function burnableEnemies(ctx: ThinkContext): number[] {
  const out: number[] = []
  const now = ctx.board.now
  for (const p of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, p) || p.BomberPlayerState.ProtectedUntilTick > now || (p.skills?.bubbleUntilTick ?? 0) > now) continue
    const c = cellIndexOf(ctx.board, p.LogicTransform.WorldPosition)
    if (c >= 0) out.push(c)
  }
  return out
}

const cheb = (size: number, a: number, b: number): number =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)))

/** 火焰光环：身边（切比雪夫 ≤ auraCastRange）有可烧的对手；摊牌期里 auraCrowdSteps 步内 ≥ auraCrowdCount 个对手也放。 */
export function shouldCastAura(ctx: ThinkContext): boolean {
  const a = ctx.skills.active
  if (!a || a.id !== 'fireAura' || !activeReady(ctx.skills, ctx.board.now)) return false
  const size = ctx.board.size
  const cells = burnableEnemies(ctx)
  if (cells.some((c) => cheb(size, c, ctx.here) <= ctx.tactics.auraCastRange)) return true
  if (!ctx.showdown) return false
  let crowd = 0
  for (const c of cells) {
    const s = ctx.field.steps[c]
    if ((s >= 0 && s <= ctx.tactics.auraCrowdSteps) || cheb(size, c, ctx.here) <= ctx.tactics.auraCrowdSteps) crowd++
  }
  return crowd >= ctx.tactics.auraCrowdCount
}

/** 光环期间的追击点：可达、可待、离最近的可烧对手切比雪夫 ≤ 1 的格子里步数最少的。 */
export function auraChaseGoal(ctx: ThinkContext, isRest: (c: number) => boolean): Goal | null {
  if (ctx.skills.auraUntil <= ctx.board.now) return null
  const size = ctx.board.size
  const cells = burnableEnemies(ctx)
  if (cells.length === 0) return null
  let best = -1
  for (const c of ctx.field.reached) {
    if (!cells.some((e) => cheb(size, e, c) <= 1) || !isRest(c)) continue
    if (best < 0 || ctx.field.steps[c] < ctx.field.steps[best]) best = c
  }
  return best >= 0 ? { cell: best, bombOnArrival: false } : null
}

/** 被踢出的弹在 fuse 前实际能滑到哪（kickOutcome，再按剩余引信截短）。 */
function kickLanding(ctx: ThinkContext, bombCell: number, d: 方向, range: number, fuseEndTick: number): { stop: number; cells: number; water: boolean } {
  const hz = ctx.config.tickRateHz
  const per = Math.floor(ctx.rules.kickSpeedMilli / hz)
  const maxByFuse = Math.floor((per * Math.max(0, fuseEndTick - ctx.board.now + 1)) / 1000)
  return kickOutcome(gridProbe(ctx.board, bombCell), bombCell, d, Math.min(range, maxByFuse))
}

/** 把第 j 颗弹（在 n 格）踢向 d、停在 out.stop 之后的危险图（踢进水里 = 熄灭）。 */
function dangerAfterKick(ctx: ThinkContext, j: number, n: number, out: { stop: number; water: boolean }, dangerTicks: number): DangerMap {
  const size = ctx.board.size
  const b = ctx.board.pending[j]
  const moved = { ...b, blastCell: out.stop, blastX: out.stop % size, blastY: Math.floor(out.stop / size), doused: out.water, moving: true }
  const pending = ctx.board.pending.slice()
  pending[j] = moved
  const chainAt = ctx.board.chainAt.slice()
  if (chainAt[n] === j) chainAt[n] = -1
  if (!out.water) chainAt[out.stop] = j
  const board: Board = { ...ctx.board, pending, chainAt }
  return buildDangerMap(board, dangerTicks)
}

/**
 * 踢弹射击：身边一颗看得见、静止的弹，朝远离自己的方向踢出去，停点的十字（按该弹火力 / 穿透）罩住可炸的对手，
 * 且踢完之后自己脚下不再着火（所以身在这颗弹的十字里也能踢）。返回按住的方向（只发移动，规则层自己判踢）。
 */
export function pickKickShot(ctx: ThinkContext, dangerTicks: number): 方向 | null {
  const k = hasKick(ctx.rules, ctx.skills, ctx.board.now)
  if (!k) return null
  const size = ctx.board.size
  const targets: number[] = []
  for (const p of ctx.snap.Players) if (isActiveEnemy(ctx, p) && !protectedAtDetonation(ctx, p)) targets.push(cellIndexOf(ctx.board, p.LogicTransform.WorldPosition))
  if (targets.length === 0) return null
  for (const d of FOUR_DIRS) {
    const n = neighbour(size, ctx.here, d)
    if (n < 0) continue
    const j = ctx.board.bombAt[n]
    if (j < 0) continue
    const b = ctx.board.pending[j]
    if (b.hidden || b.moving) continue
    const out = kickLanding(ctx, n, d, k.range, b.fuseEndTick)
    if (out.cells === 0 || out.water) continue
    const bl = traceBlast(ctx.board, out.stop % size, Math.floor(out.stop / size), b.power, { covered: [], bricks: [] }, undefined, b.pierce)
    const cov = new Set(bl.covered)
    if (cov.has(ctx.here) || !targets.some((c) => cov.has(c))) continue
    if (isSafe(ctx.dm, ctx.here) || isSafe(dangerAfterKick(ctx, j, n, out, dangerTicks), ctx.here)) return d
  }
  return null
}

/**
 * 踢弹解围：身边一颗罩住自己的弹，踢走之后（按预测停点重算危险图）自己脚下不再着火。踢进水里熄灭同样算解围。
 */
export function pickKickClear(ctx: ThinkContext, dangerTicks: number): 方向 | null {
  const k = hasKick(ctx.rules, ctx.skills, ctx.board.now)
  if (!k) return null
  const size = ctx.board.size
  for (const d of FOUR_DIRS) {
    const n = neighbour(size, ctx.here, d)
    if (n < 0) continue
    const j = ctx.board.bombAt[n]
    if (j < 0) continue
    const b = ctx.board.pending[j]
    if (b.hidden || b.moving) continue
    const out = kickLanding(ctx, n, d, k.range, b.fuseEndTick)
    if (out.cells === 0) continue
    if (isSafe(dangerAfterKick(ctx, j, n, out, dangerTicks), ctx.here)) return d
  }
  return null
}
