import { skillParams } from '../contract'
import { skillTicks } from './skills'
import { emit, isAlive, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：棉花兔被动·回春（design §12 的角色例外，D3）。
 * step.ts 在伤害单结算之后、阶段机之前调用（结算期不调）。
 * - 被动槽是回春、活着、没满血：regenNextTick = 0 时从本 Tick 起算（[regenFromTick, regenNextTick)），到点回 points、
 *   之后每 interval 再回，满血即停（两个计时归零）。
 * - 任何扣血（炸弹 / 烧伤 / 溺水 / 毒）都在 effects.ts 把 regenNextTick 清零 → 本 Tick 这里重新起算。血包不重置计时。
 */
export function applyRecovery(w: World): void {
  const t = w.t
  const max = w.cfg.maxHealthPoints
  for (const p of w.players) {
    const s = p.slots.passive
    if (s?.skill !== 'regen' || !isAlive(p) || p.health >= max) {
      p.regenFromTick = 0
      p.regenNextTick = 0
      continue
    }
    const iv = skillTicks(w, 'regen', s.level).interval
    if (p.regenNextTick === 0) {
      p.regenFromTick = t
      p.regenNextTick = t + iv
      continue
    }
    if (t < p.regenNextTick) continue
    const before = p.health
    p.health = Math.min(max, before + skillParams(w.rules.skills, 'regen', s.level).points)
    emit(w, { type: 'PlayerHealed', presentationOnly: true, NetEntityIdRaw: p.id, Points: p.health - before, HealthPointsLeft: p.health, Source: 'regen', Tick: t })
    if (p.health >= max) {
      p.regenFromTick = 0
      p.regenNextTick = 0
    } else {
      p.regenFromTick = t
      p.regenNextTick = t + iv
    }
  }
}
