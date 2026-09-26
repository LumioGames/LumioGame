import { CHARACTER_ORDER, type CharacterId } from '../contract'
import { resetSkillsForMatch, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：每局开局的角色分配（startMatch 在摆位之前调用）。
 * 1. 先数固定选角；2. 'auto' 的玩家按槽序各取当前人数最少的角色，并列时用 rng.roster 抽（8 人 = 每角色 2 个）；
 * 3. pick = null → 无角色（旧夹具，行为与第 3 轮相同）；4. 定动物与名字：真人保留 spec.name，Bot 按同角色出现次序取
 *    botNames[k]（不够则「角色名 + 序号」），无角色沿用 spec；5. 按角色重置技能槽（专属 Lv1 绑定）。
 * rng.roster 每局由 mixSeed(seed, 局序号) 重播种，所以 Bot 的角色 / 名字每局重抽、同种子可复现。
 */
export function assignRoster(w: World): void {
  const count = new Map<CharacterId, number>(CHARACTER_ORDER.map((c) => [c, 0]))
  for (const p of w.players) if (p.pick !== null && p.pick !== 'auto') count.set(p.pick, (count.get(p.pick) ?? 0) + 1)
  const slotOrder = [...w.players].sort((a, b) => a.spec.slot - b.spec.slot)
  for (const p of slotOrder) {
    if (p.pick === null) {
      p.character = null
      continue
    }
    if (p.pick !== 'auto') {
      p.character = p.pick
      continue
    }
    let min = Infinity
    for (const c of CHARACTER_ORDER) min = Math.min(min, count.get(c) ?? 0)
    const ties = CHARACTER_ORDER.filter((c) => (count.get(c) ?? 0) === min)
    const c = ties[w.rng.roster.NextInt(0, ties.length)]
    count.set(c, (count.get(c) ?? 0) + 1)
    p.character = c
  }
  const seen = new Map<CharacterId, number>()
  for (const p of slotOrder) {
    if (p.character === null) {
      p.name = p.spec.name
      p.animal = p.spec.animal
    } else {
      const def = w.rules.characters[p.character]
      p.animal = def.animal
      if (!p.spec.isBot) p.name = p.spec.name
      else {
        const k = seen.get(p.character) ?? 0
        seen.set(p.character, k + 1)
        p.name = def.botNames[k] ?? `${def.name}${k + 1}`
      }
    }
    resetSkillsForMatch(p, w.rules)
  }
}
