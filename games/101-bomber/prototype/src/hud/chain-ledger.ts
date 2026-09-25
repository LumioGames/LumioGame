import type { U64 } from '../contract'

/**
 * 按 ChainId 累计一条爆炸链的规模，给「×N 连锁 / 拆迁 ×N / 最佳连锁 / 死亡回顾的连锁长度」共用。
 * 主口径来自契约事件 `BombExploded`（每颗一条）；原型扩展的 `ChainResolved` / `BrickDestroyed`
 * 存在时取较大值 / 优先采用，不存在时方块数退回地形 diff 推导（见 timeline.ts）。
 */
interface ChainEntry {
  bombs: number
  resolvedBombs: number
  owners: Set<U64>
  eventBricks: number
  derivedBricks: number
  resolvedBricks: number
  bricksByOwner: Map<U64, number>
  lastTick: U64
}

/** 只保留最近这么多条链，防止长局里无限增长。 */
const MAX_CHAINS = 256

export class ChainLedger {
  private readonly chains = new Map<U64, ChainEntry>()
  /** 一旦见过 `BrickDestroyed` 事件，就不再采用地形 diff 推导的方块，避免重复计数。 */
  sawBrickEvents = false

  private entry(chainId: U64, tick: U64): ChainEntry {
    let e = this.chains.get(chainId)
    if (!e) {
      e = { bombs: 0, resolvedBombs: 0, owners: new Set(), eventBricks: 0, derivedBricks: 0, resolvedBricks: 0, bricksByOwner: new Map(), lastTick: tick }
      this.chains.set(chainId, e)
      if (this.chains.size > MAX_CHAINS) {
        const oldest = this.chains.keys().next().value
        if (oldest !== undefined) this.chains.delete(oldest)
      }
    }
    e.lastTick = tick
    return e
  }

  addBomb(chainId: U64, owner: U64, tick: U64): void {
    if (chainId === 0) return
    const e = this.entry(chainId, tick)
    e.bombs++
    e.owners.add(owner)
  }

  addResolved(chainId: U64, bombCount: number, brickCount: number, owners: readonly U64[], tick: U64): void {
    if (chainId === 0) return
    const e = this.entry(chainId, tick)
    e.resolvedBombs = Math.max(e.resolvedBombs, bombCount)
    e.resolvedBricks = Math.max(e.resolvedBricks, brickCount)
    for (const o of owners) e.owners.add(o)
  }

  /** @returns 这块方块是否被计入（地形推导在已有事件口径时被丢弃）。 */
  addBrick(chainId: U64, owner: U64, tick: U64, source: 'event' | 'derived'): boolean {
    if (source === 'event') this.sawBrickEvents = true
    else if (this.sawBrickEvents) return false
    if (chainId === 0) return true
    const e = this.entry(chainId, tick)
    if (source === 'event') e.eventBricks++
    else e.derivedBricks++
    e.bricksByOwner.set(owner, (e.bricksByOwner.get(owner) ?? 0) + 1)
    return true
  }

  bombs(chainId: U64): number {
    const e = this.chains.get(chainId)
    return e ? Math.max(e.bombs, e.resolvedBombs) : 0
  }

  bricks(chainId: U64): number {
    const e = this.chains.get(chainId)
    if (!e) return 0
    return Math.max(e.resolvedBricks, e.eventBricks, this.sawBrickEvents ? 0 : e.derivedBricks)
  }

  /** 该链里有没有 `owner` 放的炸弹（或他炸掉的方块）。 */
  involves(chainId: U64, owner: U64): boolean {
    const e = this.chains.get(chainId)
    if (!e) return false
    return e.owners.has(owner) || (e.bricksByOwner.get(owner) ?? 0) > 0
  }

  clear(): void {
    this.chains.clear()
  }
}
