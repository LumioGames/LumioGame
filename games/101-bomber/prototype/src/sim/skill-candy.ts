import { bombCandyPool, candyPool, type SkillId } from '../contract'
import { resolveSkillPickup } from '../shared/skill-rules'
import { emit, type SimPickup, type SimPlayer, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能糖（design §8.2 / §8.3，D6 / D14 / D16）。
 * 随机全部走 rng.skill（drop / spawn / chest / regen 流序列不变）：
 * - 木箱（{@link rollCrateSkill}）：spawnDrops 先照旧在 rng.drop 上掷强化种类，再在 rng.skill 上掷 crateSkillCandyPermille，
 *   中了再掷糖的种类；积木从不掉技能糖。
 * - 决赛圈宝箱：每个额外喷 chestSkillCandies 颗（chest.ts），只掷种类；原型扩展（NON-CONTRACT，ADR 0033）：
 *   chestSkillCandyPool = 'bomb'（默认）时从炸弹类池（{@link chestCandyPool}）抽 = 保底炸弹糖。
 * 池内权重见 contract/skills.ts（ADR 0033：炸弹类 2、其余 1）。
 * 吃糖一律经 shared `resolveSkillPickup`（升级 / 装上 / 进化 / 拒收），与 Bot、HUD 同一口径。
 */

/** 按 candyWeight 在 pool（缺省 = 整个 candyPool）序上掷（rng.skill）；池空 → null（不消耗随机数）。 */
export function rollSkillCandy(w: World, pool: readonly SkillId[] = candyPool(w.rules.skills)): SkillId | null {
  let total = 0
  for (const id of pool) total += w.rules.skills[id].candyWeight
  if (total <= 0) return null
  let r = w.rng.skill.NextInt(0, total)
  for (const id of pool) {
    r -= w.rules.skills[id].candyWeight
    if (r < 0) return id
  }
  return pool[pool.length - 1]
}

/** 原型扩展（NON-CONTRACT，ADR 0033）：决赛圈宝箱技能糖的池——'bomb' = 炸弹类保底，'all' = 整个糖池。 */
export function chestCandyPool(w: World): readonly SkillId[] {
  return w.rules.chestSkillCandyPool === 'bomb' ? bombCandyPool(w.rules.skills) : candyPool(w.rules.skills)
}

/** 木箱：先掷 crateSkillCandyPermille（rng.skill），中了再掷种类；没中 / 池空 → null（掉强化）。 */
export function rollCrateSkill(w: World): SkillId | null {
  if (w.rng.skill.NextInt(0, 1000) >= w.rules.crateSkillCandyPermille) return null
  return rollSkillCandy(w)
}

/** 能不能吃这颗糖：拒收（满级 / 组合技不能升级 / 槽被占）→ false，糖留在地上、也不挡同格的别人。 */
export function canTakeSkill(w: World, p: SimPlayer, it: SimPickup): boolean {
  if (it.skill === null) return false
  return resolveSkillPickup(w.rules, p.slots, { skill: it.skill, level: it.level }).kind !== 'reject'
}

/**
 * 吃糖：升级（糖的等级不看）→ SkillGained('levelUp')；装进空槽（组合技糖 1 级、parts = null）→ SkillGained('equip')；
 * 进化 → 组合技落在它的槽里（bound = 任一半 bound，parts = [槽里原有的一半, 糖里的一半]），另一半原来的槽腾空 → SkillEvolved。
 * 冷却 / 泡泡 / 光环是玩家计时，不是技能计时：进化、升级都不动它们。帽数不变（D5）。
 */
export function takeSkillCandy(w: World, p: SimPlayer, it: SimPickup): void {
  if (it.skill === null) return
  const skill = it.skill
  const out = resolveSkillPickup(w.rules, p.slots, { skill, level: it.level })
  const t = w.t
  switch (out.kind) {
    case 'levelUp': {
      const held = p.slots[out.slot]!
      p.slots[out.slot] = { ...held, level: out.level }
      emit(w, { type: 'SkillGained', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: held.skill, Slot: out.slot, Level: out.level, How: 'levelUp', Tick: t })
      break
    }
    case 'equip':
      p.slots[out.slot] = { skill, level: out.level, bound: false, parts: null }
      emit(w, { type: 'SkillGained', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: skill, Slot: out.slot, Level: out.level, How: 'equip', Tick: t })
      break
    case 'evolve': {
      const parts = out.parts.map((q) => ({ skill: q.skill, level: q.level, bound: q.bound }))
      if (out.freed !== null) p.slots[out.freed] = null
      p.slots[out.slot] = { skill: out.combo, level: 1, bound: parts.some((q) => q.bound), parts }
      emit(w, {
        type: 'SkillEvolved',
        presentationOnly: true,
        PlayerNetEntityIdRaw: p.id,
        From: [parts[0].skill, parts[1].skill],
        Combo: out.combo,
        Slot: out.slot,
        FreedSlot: out.freed,
        Tick: t,
      })
      break
    }
    case 'reject':
      break
  }
}
