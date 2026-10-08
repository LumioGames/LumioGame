import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, 方向, type PlayerSkillsView, type PlayerView, type SkillSlotView } from '../../contract'
import { skillButtonView, skillHudModel } from '../skill-hud'

const R = 20

function skills(over: Partial<PlayerSkillsView> = {}): PlayerSkillsView {
  return {
    character: null,
    facing: 方向.下,
    slots: { bomb: null, active: null, passive: null },
    cdFromTick: 0,
    cdUntilTick: 0,
    bubbleUntilTick: 0,
    auraUntilTick: 0,
    frozenUntilTick: 0,
    regenFromTick: 0,
    regenNextTick: 0,
    blinkTick: 0,
    ...over,
  }
}

const slot = (skill: SkillSlotView['skill'], level = 1, bound = false): SkillSlotView => ({ skill, level, bound })

function me(sk: PlayerSkillsView | undefined, hp = 6, eliminated = false): PlayerView {
  return {
    NetEntityIdRaw: 1,
    LogicTransform: { WorldPosition: { x: 1.5, y: 1, z: 1.5 } },
    teleportTick: 0,
    BomberPlayerState: { HatCount: 0, RespawnAtTick: 0, ProtectedUntilTick: 0 },
    玩家属性: { 血量当前: hp, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
    meta: { name: '你', isBot: false, animal: 'cat', slot: 0 },
    eliminated,
    ...(sk ? { skills: sk } : {}),
  }
}

const model = (p: PlayerView | undefined, tick: number, touch = false, rules = DEFAULT_RULES) => skillHudModel(p, tick, R, rules, DEFAULT_CONFIG, touch)

describe('skillHudModel', () => {
  it('projects each exact bound character skill and only its matching favorite bomb', () => {
    const favorites = { rabbit: 'splitBomb', duck: 'freezeBomb', cat: 'remoteBomb', bear: 'fireBomb', kangaroo: 'pierceBomb' } as const
    for (const [character, bomb] of Object.entries(favorites) as [keyof typeof favorites, typeof favorites[keyof typeof favorites]][]) {
      const skill = DEFAULT_RULES.characters[character].skill
      const slotName = DEFAULT_RULES.skills[skill].slot
      const slots = { bomb: slot(bomb), active: null, passive: null }
      const current = skills({ character, slots: { ...slots, [slotName]: slot(skill, 3, true) } })
      const m = model(me(current), 0)
      expect(m.chips).toHaveLength(2)
      expect(m.chips[0].favorite).toBe(true)
      expect(m.chips[1]).toMatchObject({ skill, level: 1, slot: slotName })
      expect(skillButtonView(m) === null).toBe(slotName === 'passive')
      expect(model(me({ ...current, slots: { ...current.slots, bomb: slot('toxinBomb') } }), 0).chips[0].favorite).toBe(false)
      expect(model(me({ ...current, slots: { ...current.slots, [slotName]: null } }), 0).chips[1].skill).toBeNull()
    }
  })

  it('degrades to two chips with Standard bomb, no regen ring and no button without skills', () => {
    const m = model(me(undefined), 10)
    expect(m.chips.map((c) => [c.slot, c.skill])).toEqual([
      ['bomb', null],
      ['active', null],
    ])
    expect(m.regen.visible).toBe(false)
    expect(skillButtonView(m)).toBeNull()
    expect(m.chips[0].name).toBe('标准弹')
    expect(model(undefined, 0).chips).toHaveLength(2)
  })

  it('cat blink: cooldown ring fraction and seconds, ready at cdUntil', () => {
    const cat = skills({ character: 'cat', slots: { bomb: null, active: slot('blink', 1, true), passive: null }, cdFromTick: 100, cdUntilTick: 340 })
    const m = model(me(cat), 220)
    const a = m.chips[1]
    expect([a.skill, a.name, a.bound, a.maxLevel, a.key]).toEqual(['blink', '闪现', true, 1, 'Shift'])
    expect(a.cdFrac).toBeCloseTo(0.5)
    expect(a.cdSec).toBeCloseTo(6)
    expect(a.ready).toBe(false)
    expect(a.desc).toContain('3 格')
    const ready = model(me(cat), 340).chips[1]
    expect([ready.cdFrac, ready.ready]).toEqual([0, true])
    const b = skillButtonView(model(me(cat), 220))
    expect(b).toMatchObject({ skill: 'blink', label: '闪现', ready: false, disabled: false })
  })

  it('not ready while frozen, dead or eliminated', () => {
    const cat = skills({ character: 'cat', slots: { bomb: null, active: slot('blink', 1, true), passive: null }, frozenUntilTick: 50 })
    const fm = model(me(cat), 40)
    expect(fm.frozen).toBe(true)
    expect(fm.chips[1].ready).toBe(false)
    expect(skillButtonView(fm)?.disabled).toBe(true)
    expect(model(me(cat, 0), 60).chips[1].ready).toBe(false)
    expect(model(me(cat, 6, true), 60).chips[1].ready).toBe(false)
  })

  it('duck bubble: effect fraction and bubbled flag', () => {
    // 泡泡 L1 持续读配表（第 4 轮平衡后 3.5 s = 70 Tick，ADR 0034）；看的是还剩一半的那一刻。
    const dur = Math.ceil((DEFAULT_RULES.skills.bubble.levels[0].durationMs * R) / 1000)
    const until = 130 + dur / 2
    const duck = skills({ character: 'duck', slots: { bomb: null, active: slot('bubble', 1, true), passive: null }, bubbleUntilTick: until })
    const m = model(me(duck), 130)
    expect(m.chips[1].effectFrac).toBeCloseTo(0.5)
    expect(m.bubbled).toBe(true)
    expect(skillButtonView(m)?.effect).toBe(true)
    expect(model(me(duck), until).chips[1].effectFrac).toBe(0)
  })

  it('rabbit regen ring beside the hearts: progress and seconds left; hidden at full hp', () => {
    const rabbit = skills({ character: 'rabbit', slots: { bomb: null, active: null, passive: slot('regen', 1, true) }, regenFromTick: 100, regenNextTick: 300 })
    const m = model(me(rabbit, 4), 200)
    expect(m.regen.visible).toBe(true)
    expect(m.regen.frac).toBeCloseTo(0.5)
    expect(m.regen.secLeft).toBeCloseTo(5)
    expect(m.chips[1].key).toBe('自动')
    expect(m.chips[1].skill).toBe('regen')
    expect(model(me(rabbit, 6), 200).regen.visible).toBe(false)
    expect(model(me({ ...rabbit, regenNextTick: 0 }, 4), 200).regen.visible).toBe(false)
    expect(skillButtonView(m)).toBeNull()
  })

  it('a legacy combo identity cannot replace the bound character skill', () => {
    const bear = skills({ character: 'bear', slots: { bomb: null, active: slot('fireDash', 1, true), passive: null } })
    const c = model(me(bear), 0).chips[1]
    expect(c.skill).toBeNull()
    expect(skillButtonView(model(me(bear), 0))).toBeNull()
  })

  it('touch key hint is 副按钮; bomb slot hint is 放弹时', () => {
    const cat = skills({ character: 'cat', slots: { bomb: slot('pierceBomb', 2), active: slot('blink', 1, true), passive: null } })
    const m = model(me(cat), 0, true)
    expect(m.chips[1].key).toBe('副按钮')
    expect(m.chips[0]).toMatchObject({ skill: 'pierceBomb', level: 1, key: '放弹时', ready: false, cdFrac: 0 })
  })

  it('ADR 0033 bomb chips: exact describeSkill text with the toxin cadence and the slow percentage', () => {
    const toxin = model(me(skills({ slots: { bomb: slot('toxinBomb', 2), active: null, passive: null } })), 0).chips[0]
    expect([toxin.skill, toxin.name, toxin.key]).toEqual(['toxinBomb', '中毒弹', '放弹时'])
    expect(toxin.desc).toContain('每 2 秒 −0.5 心，可致死')
    const shock = model(me(skills({ slots: { bomb: slot('shockBomb', 3), active: null, passive: null } })), 0).chips[0]
    expect(shock.skill).toBeNull()
  })

  it('status: poisoned / shocked from the snapshot until-ticks (render tick), none when the fields are missing', () => {
    const sk = skills({ toxinUntilTick: 80, shockUntilTick: 50 })
    expect(model(me(sk), 40).status).toEqual({ poisoned: true, shocked: true, toxinSec: 2, shockSec: 0.5 })
    expect(model(me(sk), 60).status).toMatchObject({ poisoned: true, shocked: false })
    expect(model(me(skills()), 40).status).toMatchObject({ poisoned: false, shocked: false })
    expect(model(me(undefined), 40).status).toMatchObject({ poisoned: false, shocked: false })
  })
})
