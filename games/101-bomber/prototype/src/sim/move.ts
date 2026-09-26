import { BlockType, 方向, type 移动技能输入 } from '../contract'
import { DIR_VEC } from '../shared/grid'
import { CELL_MILLI, HALF_MILLI, chestAt, currentSpeed, playerCell, unexplodedBombAt, type SimPlayer, type World } from './world'

/**
 * 移动技能（契约 §2.1 四向 + 停；design §6.1 手感规则）。位置是整数千分格，恒在某条通道上：
 * 横向偏移或纵向偏移至少一个为 0。转角修正把垂直偏移以同速推回通道中心；转角缓冲让提前按下的
 * 垂直方向保留 turnBufferTicks，期间沿原方向继续走、走到路口自动转。
 * 原型扩展（NON-CONTRACT，ADR 0032）：输入可带 `副方向`（更早按住的垂直键），主方向走不动时沿它滑动；
 * 吸附阈值 / 连续吸附阈值 / 连续窗口全部取自 ProtoRules。无新状态、不改哈希。
 */

/** 可通行 = 砖层为空（水可走）且无未爆炸弹、无宝箱；爆炸态炸弹不挡路。自己所在格从不检查（离格穿透由此而来）。 */
export function passableCell(w: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w.size || y >= w.size) return false
  const ci = y * w.size + x
  return w.brick[ci] === BlockType.Air && !unexplodedBombAt(w, ci) && !chestAt(w, ci)
}

interface Advance {
  mx: number
  my: number
  moved: boolean
  slid: boolean
}

const NO_MOVE: Advance = { mx: 0, my: 0, moved: false, slid: false }

function assistTolerance(w: World, p: SimPlayer): { tol: number; fresh: boolean } {
  if (p.lastAssistTick === w.t - 1) return { tol: p.assistTol, fresh: false }
  // design §6.1「连续转角只做轻度吸附」：上一次吸附后 assistRepeatWindowTicks 内再吸附用弱阈值（ADR 0032 移入配表）。
  const recent = w.t - p.lastAssistTick <= w.rules.assistRepeatWindowTicks
  return { tol: recent ? w.rules.cornerAssistRepeatMilli : w.rules.cornerAssistMilli, fresh: true }
}

/** 纯计算：按 dir 走 budget 千分格后的位置，不改玩家。 */
function tryAdvance(w: World, p: SimPlayer, dir: 方向, budget: number, danger: Uint8Array): Advance {
  if (dir === 方向.停 || budget <= 0) return NO_MOVE
  const { dx, dy } = DIR_VEC[dir]
  const horizontal = dx !== 0
  const sgn = horizontal ? dx : dy
  let mx = p.mx
  let my = p.my
  let slid = false

  const perp = horizontal ? my : mx
  const lane = Math.floor(perp / CELL_MILLI)
  const off = perp - (lane * CELL_MILLI + HALF_MILLI)
  if (off !== 0) {
    const { tol } = assistTolerance(w, p)
    if (Math.abs(off) > tol) return NO_MOVE
    const along = Math.floor((horizontal ? mx : my) / CELL_MILLI)
    const ax = horizontal ? along + sgn : lane
    const ay = horizontal ? lane : along + sgn
    if (!passableCell(w, ax, ay) || danger[ay * w.size + ax]) return NO_MOVE
    const s = Math.min(budget, Math.abs(off))
    const back = off > 0 ? -s : s
    if (horizontal) my += back
    else mx += back
    budget -= s
    slid = true
  }

  let a = horizontal ? mx : my
  const laneCell = horizontal ? Math.floor(my / CELL_MILLI) : Math.floor(mx / CELL_MILLI)
  while (budget > 0) {
    const c = Math.floor(a / CELL_MILLI)
    const center = c * CELL_MILLI + HALF_MILLI
    if ((center - a) * sgn > 0) {
      const d = Math.min(budget, Math.abs(center - a))
      a += sgn * d
      budget -= d
      continue
    }
    // 已在格心或越过格心：继续前进要求前方格可通行；否则停在原地（不往回推）。
    const nx = horizontal ? c + sgn : laneCell
    const ny = horizontal ? laneCell : c + sgn
    if (!passableCell(w, nx, ny)) break
    const d = Math.min(budget, Math.abs(center + sgn * CELL_MILLI - a))
    a += sgn * d
    budget -= d
  }
  if (horizontal) mx = a
  else my = a
  const moved = mx !== p.mx || my !== p.my
  return moved ? { mx, my, moved, slid } : NO_MOVE
}

/**
 * 本 Tick 的有效移速：当前账移速（麻痹中已乘 shockSlowPermille，原型扩展 NON-CONTRACT，ADR 0033）× 水中减速（相乘）。
 */
function effectiveSpeed(w: World, p: SimPlayer): number {
  const speed = currentSpeed(p, w.t)
  const onWater = w.ground[playerCell(w, p)] === BlockType.水
  return onWater ? Math.floor((speed * w.rules.waterSpeedPermille) / 1000) : speed
}

function isHorizontal(d: 方向): boolean {
  return d === 方向.左 || d === 方向.右
}

/** 两个方向互相垂直（任一为停都不算）。 */
function perpendicular(a: 方向, b: 方向): boolean {
  return a !== 方向.停 && b !== 方向.停 && isHorizontal(a) !== isHorizontal(b)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0032）：副方向只在与主方向垂直时有效；反向键从不拿来兜底
 * （那是掉头，不是沿墙滑动）；缺省 / 停 = 没有。
 */
export function sideDirection(primary: 方向, side: 方向 | undefined): 方向 {
  return side !== undefined && perpendicular(primary, side) ? side : 方向.停
}

/** 走完这一步后仍偏离 dir 所在通道的中心（吸附还没走完）。 */
function offLane(r: Advance, dir: 方向): boolean {
  const perp = isHorizontal(dir) ? r.my : r.mx
  return (perp - HALF_MILLI) % CELL_MILLI !== 0
}

type MoveSource = 'buffer' | 'primary' | 'side' | 'carry'

interface MoveChoice {
  dir: 方向
  r: Advance
  source: MoveSource | null
}

const NO_CHOICE: MoveChoice = { dir: 方向.停, r: NO_MOVE, source: null }

/**
 * 本 Tick 按序试走（ADR 0032）：缓冲转向 → 主方向（最新的键）→ 副方向（更早按住的垂直键）→ 缓冲接续；
 * 第一个真能走动的胜出。auto（副方向 / 接续）是规则层替玩家选的，同转角修正一样不把站在安全格的玩家带进危险格（design §6.1 规则 1）；
 * 已在危险格时不受此限（{@link entersDanger}）。
 * 接续只沿与缓冲转向垂直的上一方向走（反向不接续）。
 */
function chooseMove(w: World, p: SimPlayer, primary: 方向, side: 方向, buffered: 方向, budget: number, danger: Uint8Array): MoveChoice {
  const tried: 方向[] = []
  const attempt = (dir: 方向, source: MoveSource, auto: boolean): MoveChoice | null => {
    if (dir === 方向.停 || tried.includes(dir)) return null
    tried.push(dir)
    const r = tryAdvance(w, p, dir, budget, danger)
    if (!r.moved || (auto && entersDanger(w, p, r, danger))) return null
    return { dir, r, source }
  }
  const carry =
    buffered !== 方向.停 && (primary === p.pendingDir || primary === 方向.停) && perpendicular(p.lastDir, buffered) ? p.lastDir : 方向.停
  return (
    attempt(buffered, 'buffer', false) ??
    attempt(primary, 'primary', false) ??
    attempt(side, 'side', true) ??
    attempt(carry, 'carry', true) ??
    NO_CHOICE
  )
}

/**
 * `lastDir` 只记「上一 Tick 实际走动的方向」：本 Tick 没走动（停 / 被挡）就清成停，
 * 转角缓冲的「沿原方向继续走」因此只接续正在进行的移动，不会重放几秒前的旧方向。
 * 两键同按（ADR 0032）：最新的键能走就走它；走不动改走更早按住的垂直键（沿墙滑动），到第一个路口拐进去。
 * 缓冲转向一旦被采纳就把吸附走完（点按松手也不会停在半路）。
 */
export function applyMove(w: World, p: SimPlayer, input: 移动技能输入, danger: Uint8Array): void {
  if (input.按了转弯) {
    p.pendingDir = input.方向
    p.turnBuf = input.方向 === 方向.停 ? 0 : w.rules.turnBufferTicks
  }
  const hz = w.cfg.tickRateHz
  const speed = effectiveSpeed(w, p)
  const budget = Math.floor((p.moveAcc + speed) / hz)
  const buffered = p.turnBuf > 0 ? p.pendingDir : 方向.停
  const c = chooseMove(w, p, input.方向, sideDirection(input.方向, input.副方向), buffered, budget, danger)
  if (buffered !== 方向.停) {
    // 缓冲转向被采纳：吸附没走完就续 1 Tick，走上新通道才清零；否则照旧倒数。
    p.turnBuf = c.source === 'buffer' ? (offLane(c.r, c.dir) ? 1 : 0) : p.turnBuf - 1
  }
  if (c.source === null) {
    p.moveAcc = 0
    p.lastDir = 方向.停
    return
  }
  p.moveAcc += speed - budget * hz
  if (c.r.slid) {
    const { tol, fresh } = assistTolerance(w, p)
    if (fresh) p.assistTol = tol
    p.lastAssistTick = w.t
  }
  p.mx = c.r.mx
  p.my = c.r.my
  p.lastDir = c.dir
}

/**
 * 自动选择（副方向 / 接续）的危险过滤只保护**站在安全格**的玩家：已经站在危险格（炸弹臂上）时不受此限，
 * 否则按住第二个键反而会把人钉在臂上等炸（两个都走不通才停，ADR 0032 / design §6.1 规则 2）。
 */
function entersDanger(w: World, p: SimPlayer, r: Advance, danger: Uint8Array): boolean {
  const to = Math.floor(r.my / CELL_MILLI) * w.size + Math.floor(r.mx / CELL_MILLI)
  const here = playerCell(w, p)
  return to !== here && danger[to] === 1 && danger[here] === 0
}

/** 冻结 / 闪现等「本 Tick 不走」：清掉在途移动（缓冲转向、接续），下一 Tick 从静止起步（ADR 0030 / 0032）。 */
export function haltMove(p: SimPlayer): void {
  p.moveAcc = 0
  p.lastDir = 方向.停
  p.turnBuf = 0
}
