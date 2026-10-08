import type { BomberCell } from '../contract/events'
import { 方向 } from '../contract/input'

/**
 * 纯数学的格子工具，所有模块可用（规则层、Bot、表现层）。
 * 世界坐标（米）↔ 游戏格：游戏 (X, Y) ↔ 引擎 (x = X, z = Y)，实体 y = 1（ADR 0019）。
 */

/** 契约 §1.2 `所在格`：必须用数学 floor，不得用截断（负坐标上 −0.3 会被截成 0）。 */
export function cellOf(worldX: number, worldZ: number): BomberCell {
  return { X: Math.floor(worldX), Y: Math.floor(worldZ) }
}

/** 契约 §1.2 `格心`：格中心的世界位置（米）。 */
export function cellCenter(X: number, Y: number): { x: number; y: number; z: number } {
  return { x: X + 0.5, y: 1, z: Y + 0.5 }
}

export function idx(X: number, Y: number, size: number): number {
  return Y * size + X
}

export function inBounds(X: number, Y: number, size: number): boolean {
  return X >= 0 && Y >= 0 && X < size && Y < size
}

/** 方向 → 游戏格位移；上 = −Y（ReachUp 同向）。 */
export const DIR_VEC: Readonly<Record<方向, { dx: number; dy: number }>> = {
  [方向.停]: { dx: 0, dy: 0 },
  [方向.上]: { dx: 0, dy: -1 },
  [方向.下]: { dx: 0, dy: 1 },
  [方向.左]: { dx: -1, dy: 0 },
  [方向.右]: { dx: 1, dy: 0 },
}

export const FOUR_DIRS: readonly 方向[] = [方向.上, 方向.下, 方向.左, 方向.右]

export function manhattan(a: BomberCell, b: BomberCell): number {
  return Math.abs(a.X - b.X) + Math.abs(a.Y - b.Y)
}

export function sameCell(a: BomberCell, b: BomberCell): boolean {
  return a.X === b.X && a.Y === b.Y
}
