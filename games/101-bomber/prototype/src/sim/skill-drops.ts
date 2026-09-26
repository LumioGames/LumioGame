import { PickupKind, SKILL_SLOTS, type SkillId } from '../contract'
import { freeCellsNear } from './chest'
import { DEATH_DROP_RADIUS, deathEliminates } from './death-drops'
import { createPickup } from './pickup'
import { cellOfIdx, emit, type SimPlayer, type SimSkillDrop, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030 / D8）：死亡掉技能。技能不是强化：不算帽子，HatsLost / PowerupsDropped 不含它们（D5）。
 * - 专属技能（bound）永远不掉。
 * - 专属 + 拾取的组合技：只掉拾取的那一半（按它的等级），槽里退化回专属（原等级、bound）；
 *   两半都是拾取的组合技（或拾取组合技糖装上的）整颗掉成 1 级组合技糖。
 * - 常规阶段死亡：每个可掉单位在 rng.skill 上各掷一次 skillDeathDropPermille（槽序 bomb → active → passive）；
 *   决赛圈死亡（出局）与中途退出：全部掉、不掷。
 * - 掉出的糖是 Source = 'death' 的拾取物（droppedBy = 死者），与强化共用 ADR 0029 的落地保护。
 */

/** 能掉的单位（槽序 bomb → active → passive），keep = 掉落后槽里留下的。 */
export function allSkillDrops(v: SimPlayer): SimSkillDrop[] {
  const out: SimSkillDrop[] = []
  for (const slot of SKILL_SLOTS) {
    const s = v.slots[slot]
    if (!s) continue
    if (s.parts) {
      const bound = s.parts.find((q) => q.bound)
      if (bound) {
        for (const q of s.parts)
          if (!q.bound) out.push({ slot, skill: q.skill, level: q.level, keep: { skill: bound.skill, level: bound.level, bound: true, parts: null } })
        continue
      }
      out.push({ slot, skill: s.skill, level: 1, keep: null })
      continue
    }
    if (s.bound) continue
    out.push({ slot, skill: s.skill, level: s.level, keep: null })
  }
  return out
}

/** 死亡结算 Tick 定（只定、不改人）：出局 → allSkillDrops（不掷）；否则每个单位 rng.skill.NextInt(0,1000) < skillDeathDropPermille。 */
export function rollSkillDrops(w: World, v: SimPlayer): SimSkillDrop[] {
  const all = allSkillDrops(v)
  if (deathEliminates(w, w.t)) return all
  const permille = w.rules.skillDeathDropPermille
  return all.filter(() => w.rng.skill.NextInt(0, 1000) < permille)
}

/**
 * 死亡系统 Tick 执行：slots[d.slot] = d.keep；在 freeCellsNear(死亡格, DEATH_DROP_RADIUS) 按距离序落糖
 * （排在同一死者的强化之后，不用随机）；格不够则余下作废（技能照样离身）。
 * drops 非空就发 SkillsDropped（Skills = 实际落地的糖），随后每颗糖一条 PickupSpawned(Source = 'death', Kind = SkillCandy)。
 */
export function dropSkills(w: World, v: SimPlayer, deathCell: number, drops: readonly SimSkillDrop[]): void {
  if (drops.length === 0) return
  let devolved: { Combo: SkillId; To: SkillId } | null = null
  for (const d of drops) {
    const held = v.slots[d.slot]
    if (d.keep && held && held.skill !== d.keep.skill && devolved === null) devolved = { Combo: held.skill, To: d.keep.skill }
    v.slots[d.slot] = d.keep
  }
  const cells = freeCellsNear(w, deathCell, DEATH_DROP_RADIUS)
  const n = Math.min(drops.length, cells.length)
  emit(w, {
    type: 'SkillsDropped',
    presentationOnly: true,
    VictimNetEntityIdRaw: v.id,
    Skills: drops.slice(0, n).map((d) => ({ Skill: d.skill, Level: d.level })),
    Devolved: devolved,
    Cell: cellOfIdx(w, deathCell),
    Tick: w.t,
  })
  for (let i = 0; i < n; i++)
    createPickup(w, cells[i], PickupKind.SkillCandy, { source: 'death', droppedBy: v.id, fromCell: deathCell }, { skill: drops[i].skill, level: drops[i].level })
}
