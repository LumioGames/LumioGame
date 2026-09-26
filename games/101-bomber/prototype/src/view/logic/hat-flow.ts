import { HAT } from './hat-layout'
import { hash01 } from './rand'

/**
 * 帽子流向（design §9.2 / §9.6，ADR 0028：帽子 = 身上的强化数，只是表现）的纯逻辑。
 * 一切从快照里的 `BomberPlayerState.HatCount` 变化推出来：
 * - 活着时帽数 +N → N 顶帽子从头顶上方落到帽塔顶（吃强化，含死者掉出的、宝箱喷出的）；
 * - 死亡后帽数 −N → N 顶帽子从帽塔顶沿抛物线飞向掉出的强化所在格（格子不够时飞向死亡点附近随机格）；
 * - 活着时帽数减少（规则层口径变化等）只让帽塔变矮，不演飞帽。
 * `PickupSpawned(Source='death')` / `PickupView.droppedBy` 只用来找落点，缺席时退回附近随机格。
 */

export interface HatCountSample {
  id: number
  hats: number
  /** 血量 > 0 且未出局。 */
  alive: boolean
}

export type HatFlowKind = 'gain' | 'loss' | 'shrink'

export interface HatFlow {
  id: number
  kind: HatFlowKind
  /** 顶数（> 0）。 */
  count: number
}

/**
 * 把本帧每位玩家的帽数与上次见到的比较，更新 `last` 并返回变化；第一次见到的玩家只记录不出流向，
 * 快照里消失的玩家从 `last` 删掉。
 */
export function diffHatCounts(last: Map<number, number>, players: readonly HatCountSample[], out: HatFlow[] = []): HatFlow[] {
  out.length = 0
  const seen = new Set<number>()
  for (const p of players) {
    seen.add(p.id)
    const hats = Math.max(0, Math.floor(p.hats))
    const was = last.get(p.id)
    last.set(p.id, hats)
    if (was === undefined || was === hats) continue
    const d = hats - was
    if (d > 0) out.push({ id: p.id, kind: p.alive ? 'gain' : 'shrink', count: d })
    else out.push({ id: p.id, kind: p.alive ? 'shrink' : 'loss', count: -d })
  }
  for (const id of [...last.keys()]) if (!seen.has(id)) last.delete(id)
  return out
}

/** 塔上画几顶：真实帽数 − 还在往下落的 + 还没起飞的（死亡飞帽起飞前塔先别矮）。 */
export function towerCount(hatCount: number, inbound: number, heldBack: number): number {
  return Math.max(0, hatCount - inbound + heldBack)
}

export interface CellPoint {
  x: number
  z: number
}

/** 飞帽落点的格中心 key（去重用）。 */
export function cellKey(x: number, z: number): number {
  return Math.floor(x) * 4096 + Math.floor(z)
}

/**
 * 死亡飞帽的 n 个落点：先用规则层报的掉落格（事件 / 快照里死者掉出的强化，按给出顺序、按格去重），
 * 不够时在死亡点周围 1–2 格内确定性地挑格子（强化没地方掉、被吞掉的那几级，帽子照样飞走）。
 * 结果都是格中心；`size` > 0 时夹在棋盘内。
 */
export function hatLossTargets(n: number, known: readonly CellPoint[], fromX: number, fromZ: number, seed: number, size = 0): CellPoint[] {
  const out: CellPoint[] = []
  const used = new Set<number>()
  for (const c of known) {
    if (out.length >= n) break
    const k = cellKey(c.x, c.z)
    if (used.has(k)) continue
    used.add(k)
    out.push({ x: Math.floor(c.x) + 0.5, z: Math.floor(c.z) + 0.5 })
  }
  const cx = Math.floor(fromX)
  const cz = Math.floor(fromZ)
  for (let i = 0; out.length < n; i++) {
    const a = hash01(seed, i * 2 + 1) * Math.PI * 2
    const r = 1 + hash01(seed, i * 2 + 2) * 1.2
    let x = cx + Math.round(Math.cos(a) * r)
    let z = cz + Math.round(Math.sin(a) * r)
    if (x === cx && z === cz) x += 1
    if (size > 0) {
      x = Math.min(size - 1, Math.max(0, x))
      z = Math.min(size - 1, Math.max(0, z))
    }
    out.push({ x: x + 0.5, z: z + 0.5 })
  }
  return out
}

/** 吃强化落帽：从帽塔顶上方多高落下（格）。 */
export const HAT_DROP_HEIGHT = 1.2
/** 落帽时长（毫秒）。 */
export const HAT_DROP_MS = 300
/** 同一批多顶落帽的间隔（毫秒）。 */
export const HAT_DROP_GAP_MS = 90
/** 死亡飞帽时长（毫秒）：与强化从死者身上弹出的 350 ms 抛物线差不多同时落地。 */
export const HAT_LOSS_MS = 420
/** 多顶飞帽依次起飞的间隔（毫秒）。 */
export const HAT_LOSS_GAP_MS = 30
/** 死亡飞帽抛物线的额外顶点高度（格）。 */
export const HAT_LOSS_ARC = 1.4
/** 落地的飞帽离地高度（和糖果差不多高，落上去再「啵」掉）。 */
export const HAT_LOSS_LAND_Y = 0.35

/** 落帽在 u ∈ [0, 1] 时离落点的高度：自由落体（1.2·(1 − u²)），u = 1 正好落上塔顶。 */
export function dropOnHeight(u: number): number {
  const t = Math.min(1, Math.max(0, u))
  return HAT_DROP_HEIGHT * (1 - t * t)
}

/** 落帽的落点高度：塔顶（最上一顶帽子的底 = 塔高 − 帽高 + 间距）；空塔落在头顶。 */
export function dropLandingOffset(towerHeight: number): number {
  return towerHeight > 0 ? towerHeight - HAT.height + HAT.spacing : 0
}

/** 死亡飞帽 u ∈ [0, 1] 时的位置：起点 → 落点直线插值 + 抛物线抬高。 */
export function lossArc(
  u: number,
  fx: number,
  fy: number,
  fz: number,
  tx: number,
  tz: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const t = Math.min(1, Math.max(0, u))
  out.x = fx + (tx - fx) * t
  out.z = fz + (tz - fz) * t
  out.y = fy + (HAT_LOSS_LAND_Y - fy) * t + HAT_LOSS_ARC * 4 * t * (1 - t)
  return out
}
