import { BlockType, 方向, type 移动技能输入 } from '../contract'
import { DIR_VEC } from '../shared/grid'
import { kickOutcome, slideStop } from '../shared/skill-geometry'
import { passableCell, sideDirection } from './move'
import { kickRange } from './skills'
import { CELL_MILLI, HALF_MILLI, cellOfIdx, emit, findPlayer, gridProbe, playerCell, type SimBomb, type SimPlayer, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：踢弹（design §8.4 被动）/ 弹射泡泡（泡泡期内）。Bot 与表现层逐条镜像：
 *
 * **踢（{@link tryKick}，step.ts 在 applyMove 之前调用，每人每 Tick 至多踢一次）**
 * 1. 可踢距离 r = kickRange（被动踢弹 3 / 5 / 99；弹射泡泡只在 t < bubbleUntilTick 时为 5；取大）；r = 0 或方向为停 → 不踢。
 * 2. 先试主方向；主方向没踢成、且副方向与主方向垂直（move.ts `sideDirection`，反向键不算）、且主方向前方格不可通行
 *    （passableCell）时再试副方向。
 * 3. 朝 dir 踢要求：玩家在该方向的通道上（垂直坐标 % 1000 === 500）；已到或越过所在格格心（朝 dir）；
 *    相邻格 n 上有一颗**静止**（kickDir = 停）的未爆炸弹。
 * 4. 滑行终点 = shared `kickOutcome(gridProbe, n, dir, r)`：下一格界内、砖层为空、没有未爆弹 / 宝箱才前进，至多 r 格；
 *    **玩家从不挡**；进入的第一个水格即终点并熄灭。cells = 0（紧贴着就被挡）→ 踢不动、不出事件。
 * 5. 踢中即刻前推一格：cell = n + dir，kickCellsLeft = cells − 1，kickAcc = 0，kickedBy = 踢的人，
 *    kickDir = cells > 1 ? dir : 停；发 BombKicked(FromCell = n)。推进的这一格若是水 → 当场熄灭。
 *
 * **滑（{@link advanceKickedBombs}，死亡系统之后、爆炸之前）**：每 Tick kickAcc += ticks.kickMilliPerTick（8 格 / 秒 → 400），
 * 满 1000 前进一格（前方临时被挡 → 就地停）；进入水格即熄灭（BombExtinguished，炸弹数照爆炸一样回手，capacityDebt 先抵）；
 * 走完 kickCellsLeft 即停。引信照旧：到期时在当前格爆炸（爆炸时滑行字段清零，见 explosion.ts）。
 * 旧火焰不引爆滑行中的弹；糖果不挡；滑行中的弹不能再踢。
 */

/** 玩家推进方向（含副方向）相邻格的静止未爆炸弹被踢出。 */
export function tryKick(w: World, p: SimPlayer, input: 移动技能输入): void {
  const r = kickRange(w, p)
  if (r <= 0 || input.方向 === 方向.停) return
  if (kickToward(w, p, input.方向, r)) return
  const alt = sideDirection(input.方向, input.副方向)
  if (alt === 方向.停) return
  const cell = playerCell(w, p)
  const { dx, dy } = DIR_VEC[input.方向]
  if (passableCell(w, (cell % w.size) + dx, Math.floor(cell / w.size) + dy)) return
  kickToward(w, p, alt, r)
}

function kickToward(w: World, p: SimPlayer, dir: 方向, r: number): boolean {
  const { dx, dy } = DIR_VEC[dir]
  const horizontal = dx !== 0
  const perp = horizontal ? p.my : p.mx
  if (perp % CELL_MILLI !== HALF_MILLI) return false
  const along = horizontal ? p.mx : p.my
  const centre = Math.floor(along / CELL_MILLI) * CELL_MILLI + HALF_MILLI
  const sgn = horizontal ? dx : dy
  if ((along - centre) * sgn < 0) return false
  const cell = playerCell(w, p)
  const nx = (cell % w.size) + dx
  const ny = Math.floor(cell / w.size) + dy
  if (nx < 0 || ny < 0 || nx >= w.size || ny >= w.size) return false
  const n = ny * w.size + nx
  const b = w.bombs.find((o) => o.cell === n && o.explodedAtTick === 0)
  if (!b || b.kickDir !== 方向.停) return false
  const out = kickOutcome(gridProbe(w), n, dir, r)
  if (out.cells === 0) return false
  b.cell = n + dy * w.size + dx
  b.kickCellsLeft = out.cells - 1
  b.kickAcc = 0
  b.kickedBy = p.id
  b.kickDir = out.cells > 1 ? dir : 方向.停
  emit(w, { type: 'BombKicked', presentationOnly: true, BombNetEntityIdRaw: b.id, KickerNetEntityIdRaw: p.id, Dir: dir, FromCell: cellOfIdx(w, n), Tick: w.t })
  if (w.ground[b.cell] === BlockType.水) extinguish(w, b)
  return true
}

/** 滑行中的炸弹按 kickSpeedMilli 前进；前方不通（出界 / 砖 / 未爆炸弹 / 宝箱）即停；玩家不挡；进入的第一个水格熄灭。 */
export function advanceKickedBombs(w: World): void {
  const moving = w.bombs.filter((b) => b.kickDir !== 方向.停 && b.explodedAtTick === 0)
  for (const b of moving) {
    b.kickAcc += w.ticks.kickMilliPerTick
    let sank = false
    while (b.kickAcc >= CELL_MILLI && b.kickCellsLeft > 0) {
      const next = slideStop(gridProbe(w), b.cell, b.kickDir, 1)
      if (next === b.cell) {
        b.kickCellsLeft = 0
        break
      }
      b.cell = next
      b.kickAcc -= CELL_MILLI
      b.kickCellsLeft--
      if (w.ground[next] === BlockType.水) {
        extinguish(w, b)
        sank = true
        break
      }
    }
    if (!sank && b.kickCellsLeft === 0) {
      b.kickDir = 方向.停
      b.kickAcc = 0
    }
  }
}

/**
 * 踢进水里 = 拆弹（design §8.4，RESOLUTIONS #9）：炸弹实体移除、不爆炸；主人的炸弹数照爆炸回手一样归还
 * （先抵 capacityDebt，同 explosion.ts 的回手口径）；发 BombExtinguished（Cell = 熄灭格）。
 */
function extinguish(w: World, b: SimBomb): void {
  w.bombs = w.bombs.filter((o) => o !== b)
  b.kickDir = 方向.停
  b.kickCellsLeft = 0
  b.kickAcc = 0
  const owner = findPlayer(w, b.owner)
  if (owner) {
    if (owner.capacityDebt > 0) owner.capacityDebt--
    else owner.capacity++
  }
  emit(w, { type: 'BombExtinguished', presentationOnly: true, OwnerNetEntityIdRaw: b.owner, Cell: cellOfIdx(w, b.cell), Tick: w.t })
}
