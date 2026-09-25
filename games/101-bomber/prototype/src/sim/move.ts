import { BlockType, 方向, type 移动技能输入 } from '../contract'
import { DIR_VEC } from '../shared/grid'
import { CELL_MILLI, HALF_MILLI, chestAt, playerCell, unexplodedBombAt, type SimPlayer, type World } from './world'

/**
 * 移动技能（契约 §2.1 四向 + 停；design §6.1 手感规则）。位置是整数千分格，恒在某条通道上：
 * 横向偏移或纵向偏移至少一个为 0。转角修正把垂直偏移以同速推回通道中心；转角缓冲让提前按下的
 * 垂直方向保留 turnBufferTicks，期间沿原方向继续走、走到路口自动转。
 */

/** design §6.1「连续转角只做轻度吸附」：上一次吸附结束后这么多 Tick 内再吸附，用弱阈值。 */
const ASSIST_REPEAT_WINDOW = 6

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
  const recent = w.t - p.lastAssistTick <= ASSIST_REPEAT_WINDOW
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

function effectiveSpeed(w: World, p: SimPlayer): number {
  const onWater = w.ground[playerCell(w, p)] === BlockType.水
  return onWater ? Math.floor((p.speed * w.rules.waterSpeedPermille) / 1000) : p.speed
}

/**
 * `lastDir` 只记「上一 Tick 实际走动的方向」：本 Tick 没走动（停 / 被挡）就清成停，
 * 转角缓冲的「沿原方向继续走」因此只接续正在进行的移动，不会重放几秒前的旧方向。
 * 接续是替玩家做的决定，所以同转角修正一样不把人带进危险格（design §6.1 规则 1）。
 */
export function applyMove(w: World, p: SimPlayer, input: 移动技能输入, danger: Uint8Array): void {
  if (input.按了转弯) {
    p.pendingDir = input.方向
    p.turnBuf = input.方向 === 方向.停 ? 0 : w.rules.turnBufferTicks
  }
  const hz = w.cfg.tickRateHz
  const speed = effectiveSpeed(w, p)
  let dir = input.方向
  let continued = false
  if (p.turnBuf > 0) {
    const peek = Math.floor((p.moveAcc + speed) / hz)
    if (p.pendingDir !== 方向.停 && tryAdvance(w, p, p.pendingDir, peek, danger).moved) {
      dir = p.pendingDir
      p.turnBuf = 0
    } else {
      // 缓冲中：还拐不进去就沿上一方向继续走，走到路口再转。
      if (p.lastDir !== 方向.停 && (dir === p.pendingDir || dir === 方向.停)) {
        dir = p.lastDir
        continued = true
      }
      p.turnBuf--
    }
  }
  if (dir === 方向.停) {
    p.moveAcc = 0
    p.lastDir = 方向.停
    return
  }
  p.moveAcc += speed
  const step = Math.floor(p.moveAcc / hz)
  p.moveAcc -= step * hz
  const r = tryAdvance(w, p, dir, step, danger)
  if (!r.moved || (continued && entersDanger(w, p, r, danger))) {
    p.moveAcc = 0
    p.lastDir = 方向.停
    return
  }
  if (r.slid) {
    const { tol, fresh } = assistTolerance(w, p)
    if (fresh) p.assistTol = tol
    p.lastAssistTick = w.t
  }
  p.mx = r.mx
  p.my = r.my
  p.lastDir = dir
}

function entersDanger(w: World, p: SimPlayer, r: Advance, danger: Uint8Array): boolean {
  const to = Math.floor(r.my / CELL_MILLI) * w.size + Math.floor(r.mx / CELL_MILLI)
  return to !== playerCell(w, p) && danger[to] === 1
}
