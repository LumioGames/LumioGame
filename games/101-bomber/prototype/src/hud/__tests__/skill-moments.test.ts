import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../../contract'
import {
  blockedCandyText,
  burnSourceAt,
  burnSourceName,
  curedText,
  diffSkills,
  evolveBanner,
  poisonedText,
  shockedText,
  skillFailText,
  skillGainText,
  skillsDroppedText,
} from '../skill-moments'
import { held, skillsView, snap } from './fixtures'

const R = DEFAULT_RULES

describe('diffSkills (快照推技能变化)', () => {
  it('reports nothing when either side is missing', () => {
    expect(diffSkills(undefined, skillsView(), R)).toEqual([])
    expect(diffSkills(skillsView(), undefined, R)).toEqual([])
  })

  it('equip and level up', () => {
    const b = skillsView({ slots: { bomb: null, active: held('blink', 1, true), passive: null } })
    const a = skillsView({ slots: { bomb: held('pierceBomb'), active: held('blink', 2, true), passive: null } })
    expect(diffSkills(b, a, R)).toEqual([
      { kind: 'equip', skill: 'pierceBomb', slot: 'bomb', level: 1 },
      { kind: 'levelUp', skill: 'blink', slot: 'active', level: 2 },
    ])
  })

  it('in-place evolve takes `from` from the combo table', () => {
    const b = skillsView({ slots: { bomb: null, active: held('blink', 1, true), passive: null } })
    const a = skillsView({ slots: { bomb: null, active: held('fireDash', 1, true), passive: null } })
    expect(diffSkills(b, a, R)).toEqual([{ kind: 'evolve', combo: 'fireDash', from: ['blink', 'fireAura'], slot: 'active' }])
  })

  it('cross-slot evolve does not report the freed passive slot as lost', () => {
    const b = skillsView({ slots: { bomb: null, active: held('bubble', 1, true), passive: held('kick') } })
    const a = skillsView({ slots: { bomb: null, active: held('bounceBubble', 1, true), passive: null } })
    expect(diffSkills(b, a, R)).toEqual([{ kind: 'evolve', combo: 'bounceBubble', from: ['bubble', 'kick'], slot: 'active' }])
  })

  it('devolve and lost (death drops)', () => {
    const b = skillsView({ slots: { bomb: held('freezeBomb', 2), active: held('bounceBubble', 1, true), passive: null } })
    const a = skillsView({ slots: { bomb: null, active: held('bubble', 1, true), passive: null } })
    expect(diffSkills(b, a, R)).toEqual([
      { kind: 'lost', skill: 'freezeBomb', slot: 'bomb', level: 2 },
      { kind: 'devolve', combo: 'bounceBubble', to: 'bubble', slot: 'active' },
    ])
  })
})

describe('skill texts', () => {
  it('gain / level-up flash', () => {
    expect(skillGainText({ kind: 'equip', skill: 'blink', level: 1 }, R)).toBe('获得 闪现 Lv1')
    expect(skillGainText({ kind: 'levelUp', skill: 'blink', level: 2 }, R)).toBe('闪现 升到 Lv2')
    expect(skillGainText({ kind: 'equip', skill: 'glacierBomb', level: 1 }, R)).toBe('获得 冰川弹')
  })

  it('evolve banner', () => {
    expect(evolveBanner('fireDash', null, R)).toEqual({ title: '进化：火焰冲刺！', sub: '闪现 + 火焰光环' })
    expect(evolveBanner('fireDash', ['fireAura', 'blink'], R).sub).toBe('火焰光环 + 闪现')
  })

  it('the four fail reasons, with rabbit wording for noSkill', () => {
    expect(skillFailText('cooldown', 'blink', 3.24, 'cat', R)).toBe('闪现 冷却中 · 3.2 秒')
    expect(skillFailText('noSkill', null, 0, 'rabbit', R)).toBe('回春是被动技能，自动生效')
    expect(skillFailText('noSkill', null, 0, null, R)).toBe('还没有主动技能')
    expect(skillFailText('noLanding', 'blink', 0, 'cat', R)).toBe('前方没有落脚点')
    expect(skillFailText('frozen', 'blink', 0, 'cat', R)).toBe('被冻住了，放不了技能')
  })

  it('dropped skills line', () => {
    expect(skillsDroppedText([{ Skill: 'kick', Level: 2 }], { Combo: 'bounceBubble', To: 'bubble' }, R)).toBe('踢弹 Lv2 · 弹射泡泡 退回 泡泡')
    expect(skillsDroppedText([], null, R)).toBe('无')
  })

  it('blocked candy: slotTaken, maxLevel, comboNoLevels; null when it would be picked', () => {
    const slots = { bomb: held('pierceBomb', 3), active: held('blink', 1, true), passive: null }
    expect(blockedCandyText(slots, { skill: 'bubble', level: 1 }, R)).toBe('主动已有 闪现，捡不了 泡泡')
    expect(blockedCandyText(slots, { skill: 'pierceBomb', level: 1 }, R)).toBe('穿透弹 已经满级了')
    expect(blockedCandyText({ ...slots, active: held('fireDash', 1, true) }, { skill: 'fireDash', level: 1 }, R)).toBe('火焰冲刺 是组合技，不能再升级')
    expect(blockedCandyText(slots, { skill: 'kick', level: 1 }, R)).toBeNull()
    expect(blockedCandyText(slots, { skill: 'fireAura', level: 1 }, R)).toBeNull()
  })

  it('burnSourceAt finds the owner zone covering the cell', () => {
    const s = snap({
      tick: 1,
      fireZones: [
        { owner: 4, source: 'aura', cells: [{ X: 2, Y: 2 }], untilTick: 90 },
        { owner: 4, source: 'firewall', cells: [{ X: 5, Y: 5 }], untilTick: 90 },
      ],
    })
    expect(burnSourceAt(s, 4, { X: 2, Y: 2 })).toBe('aura')
    expect(burnSourceAt(s, 4, { X: 5, Y: 5 })).toBe('firewall')
    expect(burnSourceAt(s, 3, { X: 5, Y: 5 })).toBeNull()
    expect(burnSourceAt(null, 4, { X: 5, Y: 5 })).toBeNull()
    expect([burnSourceName('aura'), burnSourceName('firewall'), burnSourceName(null)]).toEqual(['火焰光环', '火墙', '火'])
  })
})

describe('ADR 0033 中毒弹 / 麻痹弹 texts (原型扩展 NON-CONTRACT)', () => {
  it('candy pickup / level-up / blocked texts use the table names 中毒弹 / 麻痹弹', () => {
    expect(skillGainText({ kind: 'equip', skill: 'toxinBomb', level: 1 }, R)).toBe('获得 中毒弹 Lv1')
    expect(skillGainText({ kind: 'levelUp', skill: 'shockBomb', level: 2 }, R)).toBe('麻痹弹 升到 Lv2')
    const slots = { bomb: held('freezeBomb'), active: null, passive: null }
    expect(blockedCandyText(slots, { skill: 'toxinBomb', level: 1 }, R)).toBe('炸弹槽已有 冰冻弹，捡不了 中毒弹')
    expect(skillsDroppedText([{ Skill: 'shockBomb', Level: 3 }], null, R)).toBe('麻痹弹 Lv3')
  })

  it('poisoned notice: thrower (or yourself), seconds, how to cure; generic without a source', () => {
    expect(poisonedText({ name: '豆豆熊' }, 3)).toBe('中了 豆豆熊 的中毒弹！掉血 3 秒 · 吃血包或放泡泡能解毒')
    expect(poisonedText('self', 4.5)).toBe('中了自己的中毒弹！掉血 4.5 秒 · 吃血包或放泡泡能解毒')
    expect(poisonedText(null, null)).toBe('中毒了！持续掉血 · 吃血包或放泡泡能解毒')
  })

  it('shocked notice and cure notices', () => {
    expect(shockedText({ name: '灰灰猫' }, 2)).toBe('中了 灰灰猫 的麻痹弹！走得很慢 2 秒')
    expect(shockedText('self', 2.5)).toBe('中了自己的麻痹弹！走得很慢 2.5 秒')
    expect(shockedText(null, null)).toBe('被麻痹了！走得很慢')
    expect([curedText('bubble'), curedText('healthPack'), curedText(null)]).toEqual(['泡泡解毒了', '血包解毒了', '解毒了'])
  })
})
