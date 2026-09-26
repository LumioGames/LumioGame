import { BlockType, PickupKind, type PickupKindName } from '../contract'
import { createPickup } from './pickup'
import { chestCandyPool, rollSkillCandy } from './skill-candy'
import { cellOccupied, cellOfIdx, chestAt, emit, type SimBomb, type SimChest, type World } from './world'

/**
 * 强力宝箱（design §4.2，引用 §8.6 小补给箱口径）：每颗独立炸弹命中一次（同链多颗各算一次），
 * HitsLeft 归零的宝箱在 VoxelCommit 相移除并喷出 chestLoot；不出帽子。
 */

const KIND_BY_NAME: Readonly<Record<PickupKindName, PickupKind>> = {
  FirePlus: PickupKind.FirePlus,
  BombPlus: PickupKind.BombPlus,
  SpeedPlus: PickupKind.SpeedPlus,
  HealthPack: PickupKind.HealthPack,
}

/** 从 from 出发按可通行路径（砖层空、无宝箱）BFS，半径内非水且没有弹 / 糖果 / 宝箱的格，按距离序。 */
export function freeCellsNear(w: World, from: number, radius: number): number[] {
  const size = w.size
  const dist = new Map<number, number>([[from, 0]])
  const q = [from]
  const out: number[] = []
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const d = dist.get(c) ?? 0
    if (w.ground[c] !== BlockType.水 && !cellOccupied(w, c)) out.push(c)
    if (d >= radius) continue
    const x = c % size
    const y = Math.floor(c / size)
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const nc = ny * size + nx
      if (dist.has(nc) || w.brick[nc] !== BlockType.Air || chestAt(w, nc)) continue
      dist.set(nc, d + 1)
      q.push(nc)
    }
  }
  return out
}

/** 一颗炸弹的臂停在宝箱上：同弹只算一次，已归零的不再扣。 */
export function hitChest(w: World, chest: SimChest, b: SimBomb): void {
  if (chest.hitsLeft <= 0 || chest.hitBy.includes(b.id)) return
  chest.hitBy.push(b.id)
  chest.hitsLeft--
  if (chest.hitsLeft === 0) chest.opener = b.owner
  emit(w, {
    type: 'ChestHit',
    presentationOnly: true,
    ChestNetEntityIdRaw: chest.id,
    HitsLeft: chest.hitsLeft,
    SourceBombOwnerNetEntityIdRaw: b.owner,
    ChainId: b.chainId,
    Tick: w.t,
  })
}

/**
 * VoxelCommit 相：归零的宝箱移除，战利品落在宝箱格与半径 2 内最近的空地上（格不够则余下作废）。
 * 原型扩展（NON-CONTRACT，ADR 0030 / D14）：强化之后再喷 chestSkillCandies 颗技能糖（种类掷 rng.skill，skillCandyLevel 级），
 * 接着用同一张空地表的下一格。ADR 0033：糖从 chestSkillCandyPool 指定的池抽（默认炸弹类保底）；只动 rng.skill，drop 流不变。
 */
export function openChests(w: World): void {
  if (!w.chests.some((c) => c.hitsLeft <= 0)) return
  const opened = w.chests.filter((c) => c.hitsLeft <= 0)
  w.chests = w.chests.filter((c) => c.hitsLeft > 0)
  for (const chest of opened) {
    emit(w, {
      type: 'ChestOpened',
      presentationOnly: true,
      ChestNetEntityIdRaw: chest.id,
      Cell: cellOfIdx(w, chest.cell),
      OpenerNetEntityIdRaw: chest.opener,
      Tick: w.t,
    })
    const cells = freeCellsNear(w, chest.cell, 2)
    const loot = w.rules.chestLoot
    const origin = { source: 'chest', droppedBy: 0, fromCell: chest.cell } as const
    let k = 0
    for (; k < loot.length && k < cells.length; k++) createPickup(w, cells[k], KIND_BY_NAME[loot[k]], origin)
    for (let j = 0; j < w.rules.chestSkillCandies && k < cells.length; j++) {
      const skill = rollSkillCandy(w, chestCandyPool(w))
      if (skill === null) break
      createPickup(w, cells[k++], PickupKind.SkillCandy, origin, { skill, level: w.rules.skillCandyLevel })
    }
  }
}
