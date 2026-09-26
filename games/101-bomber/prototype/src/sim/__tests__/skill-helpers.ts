import { BombKind, PickupKind, type SkillId, type 方向 } from '../../contract'
import { createPickup } from '../pickup'
import { makeBomb, type SimBomb, type SimChest, type SimPickup, type SimSkillPart, type World } from '../world'
import { cell, player } from './helpers'

/**
 * 技能切片（原型扩展 NON-CONTRACT，ADR 0030）的测试夹具。技能键用 helpers.ts 的 `SKILL`，这里不重复定义。
 * 清空后的场地：铁皮在外圈与 (偶, 偶) 柱上。
 */

/** 把技能直接装进它的槽（SKILLS[skill].slot）；parts 非空时 = 进化出的组合技。 */
export function giveSkill(w: World, id: number, skill: SkillId, level = 1, bound = false, parts: readonly SimSkillPart[] | null = null): void {
  const p = player(w, id)
  p.slots[w.rules.skills[skill].slot] = { skill, level, bound, parts }
}

/** 地上放一颗技能糖（经 createPickup，照常出 PickupSpawned）；droppedBy ≠ 0 = 死者掉的（ADR 0029 保护）。 */
export function putCandy(w: World, x: number, y: number, skill: SkillId, level = 1, droppedBy = 0): SimPickup {
  const c = cell(w, x, y)
  return createPickup(w, c, PickupKind.SkillCandy, { source: droppedBy ? 'death' : 'crate', droppedBy, fromCell: c }, { skill, level })
}

export interface SkillBombOpts {
  kind?: BombKind
  pierceLayers?: number
  freezeTicks?: number
}

/** 绕过放弹摆一颗技能弹（经 makeBomb）；fuseIn 个 Tick 后到期。主人手上有弹就扣一颗（同 helpers.addBomb）。 */
export function addSkillBomb(w: World, owner: number, x: number, y: number, fuseIn: number, power: number, o: SkillBombOpts = {}): SimBomb {
  const p = w.players.find((q) => q.id === owner)
  if (p && p.capacity > 0) p.capacity--
  const b = makeBomb({ id: w.nextId++, owner, cell: cell(w, x, y), bornTick: w.t, fuseEndTick: w.t + fuseIn, power, ...o })
  w.bombs.push(b)
  return b
}

export function face(w: World, id: number, dir: 方向): void {
  player(w, id).facing = dir
}

export function putChest(w: World, x: number, y: number, hits = w.rules.chestHitsRequired): SimChest {
  const c: SimChest = { id: w.nextId++, cell: cell(w, x, y), hitsRequired: hits, stageIndex: 0, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 }
  w.chests.push(c)
  return c
}
