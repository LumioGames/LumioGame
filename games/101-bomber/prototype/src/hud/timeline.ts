import { BlockType, MATERIALS, type BomberCell, type BomberEvent, type U64, type WorldSnapshot } from '../contract'
import { cellOf } from '../shared/grid'

/**
 * HUD 的时间线：把「按 renderTick 到期的事件」与「已渲染到的快照」合成**按 Tick 排序**的批次，
 * 每批先是该 Tick 的事件、后是该 Tick 结束时的快照，并附上「事件发生前」的快照（上一份已处理快照）。
 * 这样规则判定（倒台时帽王是谁、死前有几顶帽）只看数据，不依赖渲染帧率与快照跳帧。
 *
 * 另从地形 diff 推导被炸毁的方块（`DerivedBrick`），供没有 `BrickDestroyed` 表现事件的数据源
 * （引擎 Replica）使用；推导结果与同 Tick 的事件一起按 renderTick 释放。
 */

export interface DerivedBrick {
  Cell: BomberCell
  Block: BlockType
  /** 找不到对应炸弹时为 0。 */
  OwnerNetEntityIdRaw: U64
  ChainId: U64
  Tick: U64
}

export interface TickBatch {
  tick: U64
  events: readonly BomberEvent[]
  derivedBricks: readonly DerivedBrick[]
  /** 该 Tick 结束时的快照；跳帧时可能为 null（只有事件）。 */
  snapshot: WorldSnapshot | null
  /** 本批之前最后处理的快照（Tick < tick）；第一批为 null。 */
  before: WorldSnapshot | null
}

const DIRS = [
  { dx: 0, dy: -1, reach: 'ReachUp' },
  { dx: 0, dy: 1, reach: 'ReachDown' },
  { dx: -1, dy: 0, reach: 'ReachLeft' },
  { dx: 1, dy: 0, reach: 'ReachRight' },
] as const

/**
 * 找出 `prevBrick` → `snap.Terrain.brick` 中「可破坏方块 → Air」的格子，并归属到
 * 在 (sinceTick, snap.Tick] 内爆炸、十字臂正好延伸到该格的炸弹。
 * 契约口径：被摧毁的格子不计入 Reach，所以正常落在臂长 + 1；为容错也接受臂内的格子。
 */
export function attributeDestroyedBricks(prevBrick: Uint8Array, snap: WorldSnapshot, sinceTick: number): DerivedBrick[] {
  const t = snap.Terrain
  const size = t.size
  if (prevBrick.length !== t.brick.length) return []
  const exploded = snap.Bombs.filter((b) => {
    const at = b.BomberBombState.ExplodedAtTick
    return at !== 0 && at > sinceTick && at <= snap.Tick
  })
  exploded.sort((a, b) => a.BomberBombState.ExplodedAtTick - b.BomberBombState.ExplodedAtTick || a.NetEntityIdRaw - b.NetEntityIdRaw)
  const out: DerivedBrick[] = []
  for (let i = 0; i < t.brick.length; i++) {
    const was = prevBrick[i] as BlockType
    if (t.brick[i] !== BlockType.Air || was === BlockType.Air) continue
    if (!MATERIALS[was]?.destructible) continue
    const X = i % size
    const Y = Math.floor(i / size)
    let owner: U64 = 0
    let chain: U64 = 0
    for (const b of exploded) {
      const c = cellOf(b.LogicTransform.WorldPosition.x, b.LogicTransform.WorldPosition.z)
      const s = b.BomberBombState
      const hit = DIRS.some((d) => {
        const reach = s[d.reach]
        const k = d.dx !== 0 ? (X - c.X) * d.dx : (Y - c.Y) * d.dy
        const aligned = d.dx !== 0 ? Y === c.Y : X === c.X
        return aligned && k >= 1 && k <= reach + 1
      })
      if (hit) {
        owner = s.OwnerNetEntityIdRaw
        chain = s.ChainId
        break
      }
    }
    out.push({ Cell: { X, Y }, Block: was, OwnerNetEntityIdRaw: owner, ChainId: chain, Tick: snap.Tick })
  }
  return out
}

/** 已处理快照保留的份数；只需要覆盖一次跳帧内的「事件前」查询。 */
const HISTORY = 8

export class HudTimeline {
  private lastSeen: WorldSnapshot | null = null
  private lastBrick: Uint8Array | null = null
  private lastRev = -1
  private pendingSnaps: WorldSnapshot[] = []
  private pendingBricks: DerivedBrick[] = []
  private processed: WorldSnapshot[] = []

  /** 最近一份已处理（已渲染到）的快照。 */
  latestProcessed(): WorldSnapshot | null {
    return this.processed.length ? this.processed[this.processed.length - 1] : null
  }

  advance(curr: WorldSnapshot, renderTick: number, dueEvents: readonly BomberEvent[]): TickBatch[] {
    this.observe(curr)
    const eps = 1e-6
    const ticks = new Set<number>()
    const byTick = new Map<number, BomberEvent[]>()
    for (const e of dueEvents) {
      ticks.add(e.Tick)
      const list = byTick.get(e.Tick)
      if (list) list.push(e)
      else byTick.set(e.Tick, [e])
    }
    const snaps = new Map<number, WorldSnapshot>()
    let keep = 0
    for (const s of this.pendingSnaps) {
      if (s.Tick <= renderTick + eps) {
        snaps.set(s.Tick, s)
        ticks.add(s.Tick)
      } else this.pendingSnaps[keep++] = s
    }
    this.pendingSnaps.length = keep
    const bricks = new Map<number, DerivedBrick[]>()
    keep = 0
    for (const b of this.pendingBricks) {
      if (b.Tick <= renderTick + eps) {
        ticks.add(b.Tick)
        const list = bricks.get(b.Tick)
        if (list) list.push(b)
        else bricks.set(b.Tick, [b])
      } else this.pendingBricks[keep++] = b
    }
    this.pendingBricks.length = keep

    const out: TickBatch[] = []
    for (const tick of [...ticks].sort((a, b) => a - b)) {
      const snapshot = snaps.get(tick) ?? null
      out.push({
        tick,
        events: byTick.get(tick) ?? [],
        derivedBricks: bricks.get(tick) ?? [],
        snapshot,
        before: this.latestProcessed(),
      })
      if (snapshot) {
        this.processed.push(snapshot)
        if (this.processed.length > HISTORY) this.processed.shift()
      }
    }
    return out
  }

  private observe(curr: WorldSnapshot): void {
    const last = this.lastSeen
    if (last === curr) return
    if (last && curr.Tick <= last.Tick) {
      if (curr.Tick === last.Tick) return
      // 数据源重启（Tick 倒退）：旧的待处理内容全部作废。
      this.pendingSnaps = []
      this.pendingBricks = []
      this.processed = []
      this.lastBrick = null
    }
    const sameMatch = last !== null && last.match.matchIndex === curr.match.matchIndex
    if (sameMatch && this.lastBrick && curr.Terrain.rev !== this.lastRev) {
      for (const b of attributeDestroyedBricks(this.lastBrick, curr, last.Tick)) this.pendingBricks.push(b)
    }
    if (!this.lastBrick || curr.Terrain.rev !== this.lastRev || !sameMatch) {
      // 拷贝一份：不假设数据源每个 rev 都换新数组。
      this.lastBrick = curr.Terrain.brick.slice()
      this.lastRev = curr.Terrain.rev
    }
    this.pendingSnaps.push(curr)
    this.lastSeen = curr
  }
}
