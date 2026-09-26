import { MatchPhase } from '../contract'
import { allPowerupKinds, deathEliminates, dropPowerups, hatCountOf } from './death-drops'
import { allSkillDrops, dropSkills } from './skill-drops'
import { aliveCount, emit, findPlayer, playerCell, resetAbilityFields, type PendingDeath, type SimPlayer, type World } from './world'

/**
 * 帽子系统（design §9，ADR 0028）+ 死亡系统。帽子不是独立资源：HatCount = 当前强化级数之和（{@link hatCountOf}），
 * 没有铸帽、没有帽堆、没有守恒账——帽数随强化的拾取 / 掉落自动涨落。这里只剩死亡结算、帽王判定与中途退出。
 */

/**
 * 决赛圈在死亡结算之后的同一 Tick 触发时，那个 Tick 的死者按出局处理：掉落改成全部级数，
 * 技能也改成全部可掉单位（原型扩展 NON-CONTRACT，ADR 0030 / D8）。
 * 死亡事件还没发布（仍在 w.out），HatsLost 一并改成实际掉落的强化数（技能不算帽子，D5）。
 */
export function promoteEliminations(w: World): void {
  for (let i = 0; i < w.pendingDeaths.length; i++) {
    const d = w.pendingDeaths[i]
    if (!deathEliminates(w, d.tick)) continue
    const v = findPlayer(w, d.victim)
    if (!v) continue
    const all = allPowerupKinds(w, v)
    const skills = allSkillDrops(v)
    if (all.length === d.dropKinds.length && skills.length === d.dropSkills.length) continue
    w.pendingDeaths[i] = { ...d, dropKinds: all, dropSkills: skills }
    for (const e of w.out)
      if (e.type === 'PlayerDied' && e.VictimNetEntityIdRaw === d.victim && e.Tick === d.tick && e.proto) e.proto.HatsLost = all.length
  }
}

/**
 * 死亡系统：处理上一帧提交相记下的死亡（契约 §2.2 晚一帧）。按死亡结算 Tick 定下的 dropKinds 扣强化并落地；
 * 决赛圈开始后（死亡 Tick ≥ 触发 Tick）的死者掉光全部强化（帽数归零）、不再复活，转为出局，
 * 同批出局者共享名次 = 批后存活数 + 1。
 */
export function processDeaths(w: World): void {
  if (w.pendingDeaths.length === 0) return
  const pend: readonly PendingDeath[] = w.pendingDeaths
  w.pendingDeaths = []
  const out: SimPlayer[] = []
  for (const d of pend) {
    const v = findPlayer(w, d.victim)
    if (!v) continue
    const cell = playerCell(w, v)
    const eliminated = deathEliminates(w, d.tick)
    let kinds = d.dropKinds
    let skills = d.dropSkills
    if (eliminated) {
      // 触发与死亡同 Tick 时死亡结算只掷了一半；出局一律全掉（强化与技能，ADR 0030 D8）。
      const all = allPowerupKinds(w, v)
      if (all.length !== kinds.length) kinds = all
      skills = allSkillDrops(v)
    }
    dropPowerups(w, v, cell, kinds)
    dropSkills(w, v, cell, skills)
    resetAbilityFields(v)
    if (eliminated) {
      v.eliminated = true
      // ADR 0031（RESOLUTIONS #4）：出局 Tick = 死亡 Tick，不是处理 Tick，名次才不会被晚一帧的处理合并。
      v.eliminatedTick = d.tick
      v.awaitingRespawn = false
      v.respawnAtTick = 0
      out.push(v)
    } else {
      v.respawnAtTick = d.tick + w.ticks.respawn
      v.awaitingRespawn = true
    }
  }
  if (out.length === 0) return
  const rank = aliveCount(w) + 1
  for (const v of out) emit(w, { type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: v.id, Rank: rank, Tick: w.t })
}

/**
 * 帽王（design §9.3，原型口径）：派生帽数最高且 ≥ 1 者；并列时现任在并列者中就不换，否则取 id 最小；
 * 全员 0 则无帽王。光柱阈值 N 只是表现阈值，不影响判定。
 */
export function evaluateHatKing(w: World): void {
  const hats = new Map<number, number>()
  let max = 0
  for (const p of w.players) {
    const h = hatCountOf(w, p)
    hats.set(p.id, h)
    if (h > max) max = h
  }
  let king = 0
  if (max >= 1) {
    if (hats.get(w.match.hatKing) === max) king = w.match.hatKing
    else for (const p of w.players) if (hats.get(p.id) === max && (king === 0 || p.id < king)) king = p.id
  }
  if (king === w.match.hatKing) return
  emit(w, { type: 'HatKingChanged', PreviousHatKingNetEntityIdRaw: w.match.hatKing, NewHatKingNetEntityIdRaw: king, Tick: w.t })
  w.match.hatKing = king
}

/**
 * 决赛圈内退出 = 出局（design §4.2，ADR 0031）：记为在退出 Tick 出局（已出局者保留原出局 Tick）；
 * 结算期退出按冻结的状态记，名次表不再变。其余阶段退出不进名次表。必须在掉落强化之前调用（帽数取退出前）。
 */
function recordDeparture(w: World, p: SimPlayer): void {
  const phase = w.match.phase
  if (phase !== MatchPhase.Endgame && phase !== MatchPhase.Settlement) return
  const index = w.match.index
  const keep = (w.departed ?? []).filter((d) => d.match === index)
  const eliminated = phase === MatchPhase.Endgame || p.eliminated
  const eliminatedTick = p.eliminated ? p.eliminatedTick : phase === MatchPhase.Endgame ? w.t : 0
  keep.push({ match: index, id: p.id, eliminated, eliminatedTick, hats: hatCountOf(w, p) })
  w.departed = keep
}

/**
 * 中途退出（design §4 中途进出）：身上强化全部掉落成道具（谁捡归谁），非专属技能也全部掉成技能糖
 * （原型扩展 NON-CONTRACT，ADR 0030 D8），然后移除玩家实体、重判帽王。
 */
export function removePlayerFromWorld(w: World, id: number): boolean {
  const p = findPlayer(w, id)
  if (!p) return false
  recordDeparture(w, p)
  const cell = playerCell(w, p)
  dropPowerups(w, p, cell, allPowerupKinds(w, p))
  dropSkills(w, p, cell, allSkillDrops(p))
  w.players = w.players.filter((q) => q !== p)
  evaluateHatKing(w)
  return true
}
