/**
 * 连锁可解释（design §7.5 硬要求）：同一条链的所有炸弹在同一 Tick 到达，
 * 表现上按链内顺序每颗错开 40 ms（封顶 320 ms），读起来是「×N 连击」而不是一次莫名满血暴毙。
 *
 * 链内顺序优先用事件里的 `proto.IndexInChain`（原型扩展，可能缺席）；缺席时只凭快照推：
 * 引信自然到点的炸弹是根，再按「谁的十字盖到谁」做 BFS。
 */
export const CHAIN_STEP_MS = 40
export const CHAIN_CAP_MS = 320
/** 火焰由中心向外每格延迟。 */
export const CELL_GROW_MS = 12

export interface ChainBomb {
  id: number
  chainId: number
  x: number
  y: number
  up: number
  down: number
  left: number
  right: number
  fuseEndTick: number
  explodedAtTick: number
}

export function chainDelayMs(index: number): number {
  return Math.min(Math.max(0, index) * CHAIN_STEP_MS, CHAIN_CAP_MS)
}

/**
 * b 是否落在 a 的十字里。臂长外再放宽 1 格：规则层若把「遇炸弹」处理成停在炸弹前，
 * 被引爆的那颗恰在臂端外一格，排序仍应把它接在 a 后面。
 */
export function crossTouches(a: ChainBomb, b: ChainBomb): boolean {
  if (a.x === b.x) {
    const d = b.y - a.y
    if (d < 0) return -d <= a.up + 1
    if (d > 0) return d <= a.down + 1
    return true
  }
  if (a.y === b.y) {
    const d = b.x - a.x
    if (d < 0) return -d <= a.left + 1
    return d <= a.right + 1
  }
  return false
}

function manhattan(a: ChainBomb, b: ChainBomb): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * 一组同 ChainId、同 ExplodedAtTick 的炸弹 → 链内顺序（返回按顺序排列的 id）。
 * hints：id → IndexInChain；组内每颗都有提示时直接按提示排。
 */
export function orderChain(group: readonly ChainBomb[], hints?: ReadonlyMap<number, number>): number[] {
  if (group.length === 0) return []
  if (hints && group.every((b) => hints.has(b.id))) {
    return [...group].sort((a, b) => hints.get(a.id)! - hints.get(b.id)! || a.id - b.id).map((b) => b.id)
  }
  const byId = [...group].sort((a, b) => a.id - b.id)
  let roots = byId.filter((b) => b.fuseEndTick <= b.explodedAtTick)
  if (roots.length === 0) roots = [byId[0]]
  const visited = new Set<number>()
  const order: ChainBomb[] = []
  const queue: ChainBomb[] = []
  for (const r of roots) {
    visited.add(r.id)
    queue.push(r)
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    order.push(cur)
    const next = byId
      .filter((b) => !visited.has(b.id) && crossTouches(cur, b))
      .sort((a, b) => manhattan(cur, a) - manhattan(cur, b) || a.id - b.id)
    for (const b of next) {
      visited.add(b.id)
      queue.push(b)
    }
  }
  for (const b of byId) if (!visited.has(b.id)) order.push(b)
  return order.map((b) => b.id)
}

/**
 * 同一 Tick 爆炸的所有炸弹 → 每颗的表现延迟（毫秒）。按 (ChainId, ExplodedAtTick) 分组。
 * 返回 Map id → { delay, index, chainLength }。
 */
export interface ChainSlot {
  delayMs: number
  index: number
  chainLength: number
}

export function computeChainDelays(bombs: readonly ChainBomb[], hints?: ReadonlyMap<number, number>): Map<number, ChainSlot> {
  const groups = new Map<string, ChainBomb[]>()
  for (const b of bombs) {
    const key = `${b.chainId}:${b.explodedAtTick}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = []))
    g.push(b)
  }
  const out = new Map<number, ChainSlot>()
  for (const g of groups.values()) {
    const order = orderChain(g, hints)
    order.forEach((id, i) => out.set(id, { delayMs: chainDelayMs(i), index: i, chainLength: order.length }))
  }
  return out
}
