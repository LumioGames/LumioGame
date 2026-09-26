import { BlockType, BombKind, DeathCause, 方向, type PlayerDied } from '../contract'
import { rollPowerupDrops } from './death-drops'
import { rollSkillDrops } from './skill-drops'
import { cellOfIdx, emit, findPlayer, isAlive, playerCell, type DamageEffect, type SimPlayer, type World } from './world'

/**
 * 伤害（契约 §2.3 瞬时 EffectType）：业务相只下单，提交相按单序在「结算中的基础账」上结算。
 * 让血量基础从 > 0 变 ≤ 0 的那张单是击杀单；对已 ≤ 0 的目标后续单一律 Rejected（不出事件）。
 * 死亡系统下一帧才读到（晚一帧），所以这里只记 pendingDeaths。
 */

/**
 * 溺水（design §12）：站在水格里每 drown 个 Tick 扣 drownPointsPerInterval 点；离水清零；
 * 保护期与泡泡期（原型扩展 NON-CONTRACT，ADR 0030：泡泡同重生保护，挡溺水不挡毒）不扣但照样计时。
 */
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
    if (p.waterTicks % w.ticks.drown !== 0 || t < p.protectedUntilTick || t < p.bubbleUntilTick) continue
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

/**
 * 按单序结算。**原型扩展（NON-CONTRACT，ADR 0030）**：
 * - points > 0 的单：扣血；目标若在冻结中（冻结始于更早的 Tick）立即解冻并给 freezeImmune 的控制免疫；
 *   回春计时清零（recovery.ts 本 Tick 重新起算）。死亡时另在同一时刻掷技能掉落（D8）。
 * - points = 0 的单是冰冻弹的**冻结单**（explosion.ts dangerPass 下）：全部伤害结算完之后才处理，只冻住幸存者，
 *   所以同一 Tick（含同一颗弹）的伤害不会解冻它。中毒弹 / 麻痹弹（ADR 0033）的状态单同样是 points = 0、同样只对幸存者生效，
 *   按炸弹的 kind 分派（{@link applyToxin} / {@link applyShock}）。
 */
export function settleEffects(w: World): void {
  if (w.effects.length === 0) return
  const t = w.t
  const queue = w.effects
  w.effects = []
  const statuses: DamageEffect[] = []
  for (const e of queue) {
    if (e.points === 0) {
      statuses.push(e)
      continue
    }
    const p = findPlayer(w, e.target)
    if (!p || p.health <= 0 || p.eliminated) continue
    const before = p.health
    p.health = Math.max(0, before - e.points)
    if (t < p.frozenUntilTick) {
      p.frozenUntilTick = t
      p.freezeImmuneUntilTick = t + w.ticks.freezeImmune
    }
    p.regenNextTick = 0
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
    // 帽数 = 强化数（ADR 0028）：掉几级强化就掉几顶帽；出局者全部掉落。技能掉落另算（D8），不算帽子（D5）。
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
    w.pendingDeaths.push({ victim: p.id, killer: e.killer, tick: t, dropKinds, dropSkills: rollSkillDrops(w, p) })
  }
  for (const e of statuses) {
    const p = findPlayer(w, e.target)
    const b = w.bombs.find((o) => o.id === e.bomb)
    if (!p || !b || p.health <= 0 || p.eliminated) continue
    if (b.kind === BombKind.Toxin) applyToxin(w, p, b.id, b.owner, b.toxinTicks)
    else if (b.kind === BombKind.Shock) applyShock(w, p, b.id, b.owner, b.shockTicks, b.slowPermille)
    else if (b.kind === BombKind.Freeze) applyFreeze(w, p, b.id, b.owner, b.freezeTicks)
  }
}

/**
 * 中毒（原型扩展 NON-CONTRACT，ADR 0033）：T 时命中 → toxinUntilTick = max(原值, T + 1 + toxinTicks)（正好覆盖 T+1 .. T+toxinTicks），
 * 击杀归属改记这颗弹的主人。没在中毒的从 T + toxinInterval 起掉血；已在中毒的只刷新持续、不动节拍（不叠加速率）。
 * 掉血本身在 toxin.ts queueToxin。
 */
function applyToxin(w: World, p: SimPlayer, bomb: number, owner: number, toxinTicks: number): void {
  if (toxinTicks <= 0) return
  const t = w.t
  if (t >= p.toxinUntilTick) p.toxinNextTick = t + w.ticks.toxinInterval
  p.toxinUntilTick = Math.max(p.toxinUntilTick, t + 1 + toxinTicks)
  p.toxinOwner = owner
  p.toxinBomb = bomb
  emit(w, { type: 'PlayerPoisoned', presentationOnly: true, VictimNetEntityIdRaw: p.id, SourceBombNetEntityIdRaw: bomb, SourceBombOwnerNetEntityIdRaw: owner, UntilTick: p.toxinUntilTick, Tick: t })
}

/**
 * 麻痹（原型扩展 NON-CONTRACT，ADR 0033）：T 时命中 → shockUntilTick = max(原值, T + 1 + shockTicks)，期间移速乘 slowPermille
 * （world.ts currentSpeed；move.ts 与快照都读它）。再次命中刷新持续，减速取这颗弹的千分比，不叠乘。
 */
function applyShock(w: World, p: SimPlayer, bomb: number, owner: number, shockTicks: number, slowPermille: number): void {
  if (shockTicks <= 0) return
  const t = w.t
  p.shockUntilTick = Math.max(p.shockUntilTick, t + 1 + shockTicks)
  p.shockSlowPermille = slowPermille
  emit(w, { type: 'PlayerShocked', presentationOnly: true, VictimNetEntityIdRaw: p.id, SourceBombNetEntityIdRaw: bomb, SourceBombOwnerNetEntityIdRaw: owner, UntilTick: p.shockUntilTick, Tick: t })
}

/**
 * 冻结（design §8.4 冰冻弹，ADR 0030）：不叠加、不刷新（冻结中再中无效）；每次冻结结束后 freezeImmune 内免疫（防连锁控死）。
 * 冻住 T 时 frozenUntilTick = T + 1 + min(freezeTicks, freezeCap)：正好吞掉 T+1 .. T+freezeTicks 这些 Tick 的输入；
 * 在途移动 / 转角缓冲 / 放弹缓冲一并清掉，冻住的人不会被缓冲带着走。
 */
function applyFreeze(w: World, p: SimPlayer, bomb: number, owner: number, freezeTicks: number): void {
  const t = w.t
  if (t < p.frozenUntilTick || t < p.freezeImmuneUntilTick) return
  const until = t + 1 + Math.min(freezeTicks, w.ticks.freezeCap)
  p.frozenUntilTick = until
  p.freezeImmuneUntilTick = until + w.ticks.freezeImmune
  p.turnBuf = 0
  p.pendingDir = 方向.停
  p.moveAcc = 0
  p.lastDir = 方向.停
  p.bombBufUntil = 0
  emit(w, { type: 'PlayerFrozen', presentationOnly: true, VictimNetEntityIdRaw: p.id, SourceBombNetEntityIdRaw: bomb, SourceBombOwnerNetEntityIdRaw: owner, UntilTick: until, Tick: t })
}
