import { BlockType, DeathCause, type PlayerDied } from '../contract'
import { rollPowerupDrops } from './death-drops'
import { cellOfIdx, emit, findPlayer, isAlive, playerCell, type World } from './world'

/**
 * 伤害（契约 §2.3 瞬时 EffectType）：业务相只下单，提交相按单序在「结算中的基础账」上结算。
 * 让血量基础从 > 0 变 ≤ 0 的那张单是击杀单；对已 ≤ 0 的目标后续单一律 Rejected（不出事件）。
 * 死亡系统下一帧才读到（晚一帧），所以这里只记 pendingDeaths。
 */

/** 溺水（design §12）：站在水格里每 drown 个 Tick 扣 drownPointsPerInterval 点；离水清零；保护期不扣但照样计时。 */
export function queueDrowning(w: World): void {
  const t = w.t
  for (const p of w.players) {
    if (!isAlive(p)) {
      p.waterTicks = 0
      continue
    }
    if (w.ground[playerCell(w, p)] !== BlockType.水) {
      p.waterTicks = 0
      continue
    }
    p.waterTicks++
    if (p.waterTicks % w.ticks.drown !== 0 || t < p.protectedUntilTick) continue
    w.effects.push({
      target: p.id,
      points: w.cfg.drownPointsPerInterval,
      bomb: 0,
      owner: 0,
      chainId: 0,
      cause: DeathCause.Drown,
      killer: p.id,
    })
  }
}

export function settleEffects(w: World): void {
  if (w.effects.length === 0) return
  const t = w.t
  const queue = w.effects
  w.effects = []
  for (const e of queue) {
    const p = findPlayer(w, e.target)
    if (!p || p.health <= 0 || p.eliminated) continue
    const before = p.health
    p.health = Math.max(0, before - e.points)
    emit(w, {
      type: 'DamageApplied',
      VictimNetEntityIdRaw: p.id,
      SourceBombNetEntityIdRaw: e.bomb,
      SourceBombOwnerNetEntityIdRaw: e.owner,
      ChainId: e.chainId,
      HealthPointsLeft: p.health,
      Tick: t,
      proto: { Cause: e.cause, Points: e.points },
    })
    if (p.health > 0) continue
    // 帽数 = 强化数（ADR 0028）：掉几级强化就掉几顶帽；出局者全部掉落。
    const dropKinds = rollPowerupDrops(w, p)
    const ev: PlayerDied = {
      type: 'PlayerDied',
      VictimNetEntityIdRaw: p.id,
      KillerNetEntityIdRaw: e.killer,
      ChainId: e.chainId,
      Cause: e.cause,
      Cell: cellOfIdx(w, playerCell(w, p)),
      Tick: t,
      proto: { HatsLost: dropKinds.length, SourceBombNetEntityIdRaw: e.bomb },
    }
    emit(w, ev)
    // dropSkills：W0 桩为空，技能切片在这里掷技能掉落（D8）。
    w.pendingDeaths.push({ victim: p.id, killer: e.killer, tick: t, dropKinds, dropSkills: [] })
  }
}
