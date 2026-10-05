import { BlockType, MATERIALS } from '../../contract'
import type { TerrainView } from '../../contract'
import { inBounds } from '../../shared/grid'

/**
 * 本机「下一颗炸弹」的预计十字（plan：只给本人画，不给场上每颗炸弹画）。
 * 规则与 contract/materials.ts 的 `fire` 列一致（design §7.2）：
 *   stopBefore 不覆盖即停；destroyThenStop 摧毁后停、该格不计入臂长；coverThenStop 覆盖后停。
 * 每一步同时读砖层与地面层。途中的其他炸弹不阻断（连锁引爆，按 pass 处理）。
 * 原型扩展（NON-CONTRACT，ADR 0030）：穿透弹按 contract/skills.ts 文件头的唯一口径——本臂已穿透的砖数 < pierce 时，
 * 砖照样记为摧毁、**覆盖该格并计入臂长**、继续；否则停（= 今天的行为）。与规则层逐条对照见 tests/support/pierce-cases.ts。
 */
export interface FireCross {
  cx: number
  cy: number
  up: number
  down: number
  left: number
  right: number
  /** 会被摧毁的砖格下标（Y·size + X），含被穿透的。 */
  breaks: number[]
}

export function createFireCross(): FireCross {
  return { cx: 0, cy: 0, up: 0, down: 0, left: 0, right: 0, breaks: [] }
}

type TerrainLike = Pick<TerrainView, 'size' | 'ground' | 'brick'>

/** 沿一个方向传播，返回臂长；被摧毁的砖格推进 breaks。 */
function arm(
  t: TerrainLike,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  power: number,
  breaks: number[],
  blockers: ReadonlySet<number> | undefined,
  pierce: number,
): number {
  let reach = 0
  let pierced = 0
  for (let k = 1; k <= power; k++) {
    const x = cx + dx * k
    const y = cy + dy * k
    if (!inBounds(x, y, t.size)) break
    const i = y * t.size + x
    // 决赛圈强力宝箱（design §4.2）：火焰停在宝箱格，该格不计入臂长。
    const brick = MATERIALS[t.brick[i] as BlockType] ?? MATERIALS[BlockType.Air]
    if (brick.fire === 'stopBefore') break
    if (blockers?.has(i)) break
    if (brick.fire === 'destroyThenStop') {
      breaks.push(i)
      if (pierced >= pierce) break
      pierced++
      reach = k
      continue
    }
    const ground = MATERIALS[t.ground[i] as BlockType] ?? MATERIALS[BlockType.地面]
    if (ground.fire === 'stopBefore') break
    if (ground.fire === 'destroyThenStop') {
      breaks.push(i)
      break
    }
    reach = k
    if (brick.fire === 'coverThenStop' || ground.fire === 'coverThenStop') break
  }
  return reach
}

/**
 * blockers：额外挡火的格下标（宝箱）；火焰停在其前、不覆盖。
 * pierce：原型扩展（NON-CONTRACT，ADR 0030）每臂可穿透的砖层数（0 = 普通炸弹；99 = 整条线）。
 */
export function computeFireCross(
  t: TerrainLike,
  cx: number,
  cy: number,
  power: number,
  out: FireCross = createFireCross(),
  blockers?: ReadonlySet<number>,
  pierce = 0,
): FireCross {
  out.cx = cx
  out.cy = cy
  out.breaks.length = 0
  const p = Math.max(0, Math.floor(power))
  const layers = Math.max(0, Math.floor(pierce))
  out.up = arm(t, cx, cy, 0, -1, p, out.breaks, blockers, layers)
  out.down = arm(t, cx, cy, 0, 1, p, out.breaks, blockers, layers)
  out.left = arm(t, cx, cy, -1, 0, p, out.breaks, blockers, layers)
  out.right = arm(t, cx, cy, 1, 0, p, out.breaks, blockers, layers)
  return out
}

/** 逐格回调十字覆盖的所有格（中心 dist = 0，臂上 dist = 距中心格数）。 */
export function forEachCrossCell(
  cx: number,
  cy: number,
  up: number,
  down: number,
  left: number,
  right: number,
  visit: (x: number, y: number, dist: number, dirX: number, dirY: number) => void,
): void {
  visit(cx, cy, 0, 0, 0)
  for (let k = 1; k <= up; k++) visit(cx, cy - k, k, 0, -1)
  for (let k = 1; k <= down; k++) visit(cx, cy + k, k, 0, 1)
  for (let k = 1; k <= left; k++) visit(cx - k, cy, k, -1, 0)
  for (let k = 1; k <= right; k++) visit(cx + k, cy, k, 1, 0)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：泡泡里 / 冻住时放不了弹——与规则层 sim/place-bomb.ts `applyPlace` 同口径
 * （`t < bubbleUntilTick || t < frozenUntilTick`，区间右端不含）。skills 缺席 = 不受限。
 */
export function bombBlocked(sk: { bubbleUntilTick: number; frozenUntilTick: number } | undefined, tick: number): boolean {
  return !!sk && (tick < sk.bubbleUntilTick || tick < sk.frozenUntilTick)
}

/**
 * 预览前置条件：活着、手上有炸弹、所在格没有炸弹、不站在水上（水上放弹即熄灭）；
 * 原型扩展（NON-CONTRACT，ADR 0030）：泡泡里 / 冻住时放不了弹（blocked）。
 */
export function canPreviewBomb(opts: {
  alive: boolean
  bombsInHand: number
  cellHasBomb: boolean
  groundBlock: number
  blocked?: boolean
}): boolean {
  if (!opts.alive || opts.bombsInHand < 1 || opts.cellHasBomb || opts.blocked) return false
  const g = MATERIALS[opts.groundBlock as BlockType]
  return !g || g.ground !== 'water'
}
