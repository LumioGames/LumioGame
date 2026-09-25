import { MATERIALS, type FinalCircleView, type RingRect, type U64, type WorldSnapshot } from '../contract'
import { cellOf, idx, inBounds } from '../shared/grid'

/** 「永不」的哨兵（危险 / 毒圈）。 */
export const NEVER = 0x7fffffff

/** 尚未爆炸的炸弹（Bot 视角）。 */
export interface PendingBomb {
  cell: number
  X: number
  Y: number
  power: number
  fuseEndTick: number
  id: U64
  owner: U64
}

/** 已爆炸、仍在危险窗内的火焰：覆盖格按快照里的 Reach* 还原。 */
export interface ActiveFlame {
  cells: number[]
  from: number
  until: number
}

/**
 * 每次决策从快照现算的只读棋盘。只含 Bot 需要的东西：地形两层、未爆炸弹占格、活动火焰、宝箱、毒圈。
 */
export interface Board {
  size: number
  /** 快照 Tick。 */
  tick: number
  /** 本次决策输出最早生效的 Tick（快照 Tick + 1：宿主拿上一帧快照决策，输入进下一个 Tick）。 */
  now: number
  brick: Uint8Array
  ground: Uint8Array
  /** 格 → pending 下标；−1 = 无未爆炸弹。 */
  bombAt: Int32Array
  pending: PendingBomb[]
  flames: ActiveFlame[]
  /** 格 → 宝箱剩余命中数；0 = 无宝箱。宝箱占格、挡路、挡火（火不覆盖宝箱格）。 */
  chestAt: Int32Array
  /** 格从哪个 Tick 起在毒圈里（NEVER = 不会）：当前圈外 = 快照 Tick，预告圈外 = 预告生效 Tick。 */
  poisonAt: Int32Array
  finalCircle: FinalCircleView | null
}

/** 与 Reach* 字段一一对应的臂方向（上 = 游戏 −Y）。 */
const ARMS: readonly { dx: number; dy: number; key: 'ReachUp' | 'ReachDown' | 'ReachLeft' | 'ReachRight' }[] = [
  { dx: 0, dy: -1, key: 'ReachUp' },
  { dx: 0, dy: 1, key: 'ReachDown' },
  { dx: -1, dy: 0, key: 'ReachLeft' },
  { dx: 1, dy: 0, key: 'ReachRight' },
]

const outside = (r: RingRect, X: number, Y: number): boolean => X < r.Min || X > r.Max || Y < r.Min || Y > r.Max

export function buildBoard(snap: WorldSnapshot): Board {
  const size = snap.Terrain.size
  const bombAt = new Int32Array(size * size).fill(-1)
  const pending: PendingBomb[] = []
  const flames: ActiveFlame[] = []
  const now = snap.Tick + 1
  for (const b of snap.Bombs) {
    const s = b.BomberBombState
    const c = cellOf(b.LogicTransform.WorldPosition.x, b.LogicTransform.WorldPosition.z)
    if (!inBounds(c.X, c.Y, size)) continue
    const ci = idx(c.X, c.Y, size)
    if (s.ExplodedAtTick === 0) {
      bombAt[ci] = pending.length
      pending.push({ cell: ci, X: c.X, Y: c.Y, power: s.Power, fuseEndTick: s.FuseEndTick, id: b.NetEntityIdRaw, owner: s.OwnerNetEntityIdRaw })
      continue
    }
    if (s.DangerUntilTick <= now) continue
    const cells = [ci]
    for (const a of ARMS) {
      const reach = s[a.key]
      for (let k = 1; k <= reach; k++) {
        const x = c.X + a.dx * k
        const y = c.Y + a.dy * k
        if (!inBounds(x, y, size)) break
        cells.push(idx(x, y, size))
      }
    }
    flames.push({ cells, from: s.ExplodedAtTick, until: s.DangerUntilTick })
  }
  const chestAt = new Int32Array(size * size)
  // 规则层在改契约的过渡期里快照可能还没有这些字段：缺省按「无宝箱 / 无决赛圈」处理。
  for (const ch of snap.Chests ?? []) {
    const c = cellOf(ch.LogicTransform.WorldPosition.x, ch.LogicTransform.WorldPosition.z)
    if (inBounds(c.X, c.Y, size)) chestAt[idx(c.X, c.Y, size)] = Math.max(1, ch.chest.HitsLeft)
  }
  const fc = snap.match?.finalCircle ?? null
  const poisonAt = new Int32Array(size * size).fill(NEVER)
  if (fc) {
    const next = fc.nextRing
    for (let Y = 0; Y < size; Y++) {
      for (let X = 0; X < size; X++) {
        if (outside(fc.ring, X, Y)) poisonAt[Y * size + X] = snap.Tick
        else if (next && outside(next, X, Y)) poisonAt[Y * size + X] = fc.nextRingTick
      }
    }
  }
  return {
    size,
    tick: snap.Tick,
    now,
    brick: snap.Terrain.brick,
    ground: snap.Terrain.ground,
    bombAt,
    pending,
    flames,
    chestAt,
    poisonAt,
    finalCircle: fc,
  }
}

export function isWater(b: Board, i: number): boolean {
  return MATERIALS[b.ground[i] as keyof typeof MATERIALS].ground === 'water'
}

/** 可通行：砖层为空、没有未爆炸弹、没有宝箱（爆炸中的炸弹不挡路）。 */
export function isOpen(b: Board, i: number): boolean {
  return MATERIALS[b.brick[i] as keyof typeof MATERIALS].passable && b.bombAt[i] < 0 && b.chestAt[i] === 0
}

export function isDestructibleBrick(b: Board, i: number): boolean {
  return MATERIALS[b.brick[i] as keyof typeof MATERIALS].fire === 'destroyThenStop'
}

/** Tick/格（小数，不取整）：移速是千分格/秒；水里乘 waterSpeedPermille。 */
export function ticksPerCell(speedMilli: number, hz: number, permille = 1000): number {
  const eff = Math.max(1, Math.floor((speedMilli * permille) / 1000))
  return (1000 * hz) / eff
}
