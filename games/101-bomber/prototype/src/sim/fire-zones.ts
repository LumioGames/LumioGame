import { auraCells } from '../shared/skill-geometry'
import { gridProbe, isAlive, playerCell, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：当前在烧的火——烧伤结算（burn.ts）与快照（FireZones）的唯一来源。
 * 光环在前（活着且 t < auraUntilTick 的玩家，按 id 序，格 = 脚下 3×3），火墙在后（t < untilTick，按生成序）。
 * 死去的熊光环立刻消失；火墙主人死了照烧。
 */
export interface SimFireZone {
  owner: number
  source: 'aura' | 'firewall'
  cells: readonly number[]
  untilTick: number
}

export function fireZones(w: World): SimFireZone[] {
  const t = w.t
  const out: SimFireZone[] = []
  const players = [...w.players].sort((a, b) => a.id - b.id)
  let probe: ReturnType<typeof gridProbe> | null = null
  for (const p of players) {
    if (!isAlive(p) || t >= p.auraUntilTick) continue
    probe ??= gridProbe(w)
    out.push({ owner: p.id, source: 'aura', cells: auraCells(probe, playerCell(w, p)), untilTick: p.auraUntilTick })
  }
  for (const f of w.fireWalls) if (t < f.untilTick) out.push({ owner: f.owner, source: 'firewall', cells: f.cells, untilTick: f.untilTick })
  return out
}
