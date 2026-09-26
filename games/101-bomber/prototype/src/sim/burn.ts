import { DeathCause } from '../contract'
import { fireZones } from './fire-zones'
import { isAlive, playerCell, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：火焰光环 / 火焰冲刺火墙烧伤（design §12 留火口径，Cause = Burn(2)）。
 * 1. 先清掉过期火墙（t ≥ untilTick）。
 * 2. 按 fireZones 序（光环在前、按主人 id；火墙在后、按生成序）找玩家脚下格所在的第一个**别人的**火区
 *    （主人自己免疫；光环 = 熊脚下 3×3 含熊自己那格）。
 * 3. 「敌人每秒 −1 心」按暴露时长计：连续站在火里满 burnInterval 才烧第一下，之后每满一个间隔再烧
 *    （burnTicks；重叠火区也只算一份，击杀记第一个火区的主人）。离开火区、重生保护期、泡泡期内清零、不烧。
 *    第 4 轮实测（ADR 0030 原型实测）：接触即烧让光环占全部出局的一半以上、熊的胜率远超其他角色，故取暴露口径。
 * 死人 / 出局不烧。火墙主人死了照烧、照记主人。
 */
export function queueBurns(w: World): void {
  const t = w.t
  if (w.fireWalls.some((f) => t >= f.untilTick)) w.fireWalls = w.fireWalls.filter((f) => t < f.untilTick)
  const zones = fireZones(w)
  const players = [...w.players].sort((a, b) => a.id - b.id)
  for (const p of players) {
    if (!isAlive(p) || t < p.protectedUntilTick || t < p.bubbleUntilTick) {
      p.burnTicks = 0
      continue
    }
    const c = playerCell(w, p)
    const z = zones.find((q) => q.owner !== p.id && q.cells.includes(c))
    if (!z) {
      p.burnTicks = 0
      continue
    }
    p.burnTicks++
    if (p.burnTicks % w.ticks.burnInterval !== 0) continue
    w.effects.push({ target: p.id, points: w.rules.burnPointsPerInterval, bomb: 0, owner: z.owner, chainId: 0, cause: DeathCause.Burn, killer: z.owner })
  }
}
