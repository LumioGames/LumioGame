import { BlockType, MATERIALS } from '../../contract'
import type { TerrainView } from '../../contract'
import { inBounds } from '../../shared/grid'

/**
 * 本机「下一颗炸弹」的预计十字（plan：只给本人画，不给场上每颗炸弹画）。
 * 规则与 contract/materials.ts 的 `fire` 列一致（design §7.2）：
 *   stopBefore 不覆盖即停；destroyThenStop 摧毁后停、该格不计入臂长；coverThenStop 覆盖后停。
 * 每一步同时读砖层与地面层。途中的其他炸弹不阻断（连锁引爆，按 pass 处理）。
 */
export interface FireCross {
  cx: number
  cy: number
  up: number
  down: number
  left: number
  right: number
  /** 会被摧毁的砖格下标（Y·size + X），最多 4 个。 */
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
): number {
  let reach = 0
  for (let k = 1; k <= power; k++) {
    const x = cx + dx * k
    const y = cy + dy * k
    if (!inBounds(x, y, t.size)) break
    const i = y * t.size + x
    // 决赛圈强力宝箱（design §4.2）：火焰停在宝箱格，该格不计入臂长。
    if (blockers?.has(i)) break
    const brick = MATERIALS[t.brick[i] as BlockType] ?? MATERIALS[BlockType.Air]
    if (brick.fire === 'stopBefore') break
    if (brick.fire === 'destroyThenStop') {
      breaks.push(i)
      break
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

/** blockers：额外挡火的格下标（宝箱）；火焰停在其前、不覆盖。 */
export function computeFireCross(
  t: TerrainLike,
  cx: number,
  cy: number,
  power: number,
  out: FireCross = createFireCross(),
  blockers?: ReadonlySet<number>,
): FireCross {
  out.cx = cx
  out.cy = cy
  out.breaks.length = 0
  const p = Math.max(0, Math.floor(power))
  out.up = arm(t, cx, cy, 0, -1, p, out.breaks, blockers)
  out.down = arm(t, cx, cy, 0, 1, p, out.breaks, blockers)
  out.left = arm(t, cx, cy, -1, 0, p, out.breaks, blockers)
  out.right = arm(t, cx, cy, 1, 0, p, out.breaks, blockers)
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

/** 预览前置条件：活着、手上有炸弹、所在格没有炸弹、不站在水上（水上放弹即熄灭）。 */
export function canPreviewBomb(opts: {
  alive: boolean
  bombsInHand: number
  cellHasBomb: boolean
  groundBlock: number
}): boolean {
  if (!opts.alive || opts.bombsInHand < 1 || opts.cellHasBomb) return false
  const g = MATERIALS[opts.groundBlock as BlockType]
  return !g || g.ground !== 'water'
}
