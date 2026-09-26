import { DeathCause } from '../contract'
import { fireZones } from './fire-zones'
import { isAlive, playerCell, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火焰冲刺火墙烧伤（design §12 留火口径，Cause = Burn(2)）。
 * 1. 先清掉过期火墙（t ≥ untilTick）。
 * 2. 按 fireZones 序（光环在前、按主人 id；火墙在后、按生成序）找玩家脚下格所在的第一个**别人的**火区
 *    （主人自己免疫；光环 = 熊脚下 3×3 含熊自己那格）。
 * 3. 接触即烧：−burnPointsPerInterval 点，之后同一受害者每 burnInterval 至多一次（burnReadyTick，按受害者计节拍；
 *    重叠火区也只烧一次，击杀记第一个火区的主人）。进出火区不会提前重烧。
 * 死人 / 出局、重生保护期、泡泡期内不烧（也不记节拍）。火墙主人死了照烧、照记主人。
 */
export function queueBurns(w: World): void {
  const t = w.t
  if (w.fireWalls.some((f) => t >= f.untilTick)) w.fireWalls = w.fireWalls.filter((f) => t < f.untilTick)
  const zones = fireZones(w)
  if (zones.length === 0) return
  const players = [...w.players].sort((a, b) => a.id - b.id)
  for (const p of players) {
    if (!isAlive(p) || t < p.burnReadyTick || t < p.protectedUntilTick || t < p.bubbleUntilTick) continue
    const c = playerCell(w, p)
    const z = zones.find((q) => q.owner !== p.id && q.cells.includes(c))
    if (!z) continue
    p.burnReadyTick = t + w.ticks.burnInterval
    w.effects.push({ target: p.id, points: w.rules.burnPointsPerInterval, bomb: 0, owner: z.owner, chainId: 0, cause: DeathCause.Burn, killer: z.owner })
  }
}
