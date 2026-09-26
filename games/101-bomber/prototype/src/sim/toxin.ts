import { DeathCause } from '../contract'
import { clearToxin, isAlive, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹的持续掉血（排在 step.ts 的 queueBurns 之后）。按玩家序：
 * 1. 死人 / 出局跳过（死亡由 resetAbilityFields 清毒）；没中毒（toxinUntilTick = 0）跳过；
 * 2. 到期（t ≥ toxinUntilTick）→ 清掉四个中毒字段；
 * 3. 到点（t ≥ toxinNextTick）→ 节拍 += toxinInterval，下一张伤害单：−toxinPointsPerInterval 点、Cause = Toxin、
 *    击杀者 = toxinOwner（投弹者；自己的弹毒死自己 = 自杀）、SourceBomb = toxinBomb（弹可能已销毁）、ChainId 0（不进同链封顶账）。
 *    泡泡期内不掉（节拍照走）。任何掉血都会让回春重新计时（effects.ts），毒伤也不例外。
 */
export function queueToxin(w: World): void {
  const t = w.t
  for (const p of w.players) {
    if (!isAlive(p) || p.toxinUntilTick === 0) continue
    if (t >= p.toxinUntilTick) {
      clearToxin(p)
      continue
    }
    if (t < p.toxinNextTick) continue
    p.toxinNextTick += w.ticks.toxinInterval
    if (t < p.bubbleUntilTick) continue
    w.effects.push({
      target: p.id,
      points: w.rules.toxinPointsPerInterval,
      bomb: p.toxinBomb,
      owner: p.toxinOwner,
      chainId: 0,
      cause: DeathCause.Toxin,
      killer: p.toxinOwner,
    })
  }
}
