import type { TerrainView } from '../../contract'
import { computeFireCross, createFireCross } from './fire-preview'

/**
 * 连锁感知的引爆时刻（design §9.6「所有炸弹最后约 0.4 秒有清晰危险脉冲」）。
 * 被连锁引爆的炸弹自身 FuseEndTick 更晚，只按自身引信算脉冲的话它到爆都不会亮；
 * 这里按与火焰预览相同的传播规则（contract/materials 的 fire 列 + 宝箱挡火）把最早引爆时刻沿十字传递：
 *   effective(b) = min(b.fuseEnd, min{ effective(a) | a 的十字覆盖 b 且 b 在 effective(a) 之前已放下 })。
 * 地形只会少砖、炸弹不会移动、火焰越过被连锁的炸弹继续传播，所以「现在盖得到」到爆炸时仍盖得到；
 * 每帧（每个新快照）重算即可跟上新炸开的缺口。
 */
export interface DetonationBomb {
  id: number
  x: number
  y: number
  power: number
  fuseEndTick: number
}

type TerrainLike = Pick<TerrainView, 'size' | 'ground' | 'brick'>

/**
 * @param fuseTicks 引信总长（Tick）；给了就用 fuseEnd − fuseTicks 反推放下时刻，
 *   规则层同 Tick 刚放下的炸弹不会被同 Tick 的火焰引爆（bornTick < t）。
 * @returns id → 预计引爆 Tick（≤ 自身 FuseEndTick）
 */
export function effectiveDetonationTicks(
  bombs: readonly DetonationBomb[],
  terrain: TerrainLike,
  blockers?: ReadonlySet<number>,
  fuseTicks?: number,
): Map<number, number> {
  const n = bombs.length
  const out = new Map<number, number>()
  if (n === 0) return out
  const size = terrain.size
  const cellOf = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const c = bombs[i].y * size + bombs[i].x
    let list = cellOf.get(c)
    if (!list) cellOf.set(c, (list = []))
    list.push(i)
  }
  // 每颗炸弹十字覆盖到的其他炸弹（下标）。
  const cross = createFireCross()
  const reaches: number[][] = []
  for (let i = 0; i < n; i++) {
    const b = bombs[i]
    computeFireCross(terrain, b.x, b.y, b.power, cross, blockers)
    const hit: number[] = []
    const visit = (x: number, y: number): void => {
      const list = cellOf.get(y * size + x)
      if (list) for (const j of list) if (j !== i) hit.push(j)
    }
    visit(b.x, b.y)
    for (let k = 1; k <= cross.up; k++) visit(b.x, b.y - k)
    for (let k = 1; k <= cross.down; k++) visit(b.x, b.y + k)
    for (let k = 1; k <= cross.left; k++) visit(b.x - k, b.y)
    for (let k = 1; k <= cross.right; k++) visit(b.x + k, b.y)
    reaches.push(hit)
  }
  // Dijkstra（边权 0）：每次取当前最早的未定炸弹，向它盖到的炸弹传递。
  const t = bombs.map((b) => b.fuseEndTick)
  const done = new Uint8Array(n)
  for (let step = 0; step < n; step++) {
    let best = -1
    for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || t[i] < t[best])) best = i
    done[best] = 1
    for (const j of reaches[best]) {
      if (done[j] || t[best] >= t[j]) continue
      if (fuseTicks !== undefined && bombs[j].fuseEndTick - fuseTicks >= t[best]) continue
      t[j] = t[best]
    }
  }
  for (let i = 0; i < n; i++) out.set(bombs[i].id, t[i])
  return out
}
