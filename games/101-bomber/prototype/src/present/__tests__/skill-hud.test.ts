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

const model = (p: PlayerView | undefined, tick: number, touch = false) => skillHudModel(p, tick, R, DEFAULT_RULES, DEFAULT_CONFIG, touch)

describe('skillHudModel', () => {
  it('degrades to three empty chips, no regen ring and no button without the skills field', () => {
    const m = model(me(undefined), 10)
    expect(m.chips.map((c) => [c.slot, c.skill])).toEqual([
      ['bomb', null],
      ['active', null],
      ['passive', null],
    ])
    expect(m.regen.visible).toBe(false)
    expect(skillButtonView(m)).toBeNull()
    expect(model(undefined, 0).chips).toHaveLength(3)
  })

  it('cat blink: cooldown ring fraction and seconds, ready at cdUntil', () => {
    const cat = skills({ character: 'cat', slots: { bomb: null, active: slot('blink', 1, true), passive: null }, cdFromTick: 100, cdUntilTick: 340 })
    const m = model(me(cat), 220)
    const a = m.chips[1]
    expect([a.skill, a.name, a.bound, a.maxLevel, a.key]).toEqual(['blink', '闪现', true, 3, 'Shift'])
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
    const cat = skills({ slots: { bomb: null, active: slot('blink'), passive: null }, frozenUntilTick: 50 })
    const fm = model(me(cat), 40)
    expect(fm.frozen).toBe(true)
    expect(fm.chips[1].ready).toBe(false)
    expect(skillButtonView(fm)?.disabled).toBe(true)
    expect(model(me(cat, 0), 60).chips[1].ready).toBe(false)
    expect(model(me(cat, 6, true), 60).chips[1].ready).toBe(false)
  })

  it('duck bubble: effect fraction and bubbled flag', () => {
    const duck = skills({ character: 'duck', slots: { bomb: null, active: slot('bubble', 1, true), passive: null }, bubbleUntilTick: 160 })
    const m = model(me(duck), 130)
    expect(m.chips[1].effectFrac).toBeCloseTo(0.5)
    expect(m.bubbled).toBe(true)
    expect(skillButtonView(m)?.effect).toBe(true)
    expect(model(me(duck), 160).chips[1].effectFrac).toBe(0)
  })

  it('rabbit regen ring beside the hearts: progress and seconds left; hidden at full hp', () => {
    const rabbit = skills({ character: 'rabbit', slots: { bomb: null, active: null, passive: slot('regen', 1, true) }, regenFromTick: 100, regenNextTick: 300 })
    const m = model(me(rabbit, 4), 200)
    expect(m.regen.visible).toBe(true)
    expect(m.regen.frac).toBeCloseTo(0.5)
    expect(m.regen.secLeft).toBeCloseTo(5)
    expect(m.chips[2].key).toBe('自动')
    expect(model(me(rabbit, 6), 200).regen.visible).toBe(false)
    expect(model(me({ ...rabbit, regenNextTick: 0 }, 4), 200).regen.visible).toBe(false)
    expect(skillButtonView(m)).toBeNull()
  })

  it('a fire-dash combo chip is bound + combo with max level 1', () => {
    const bear = skills({ character: 'bear', slots: { bomb: null, active: slot('fireDash', 1, true), passive: null } })
    const c = model(me(bear), 0).chips[1]
    expect([c.skill, c.combo, c.bound, c.maxLevel]).toEqual(['fireDash', true, true, 1])
  })

  it('touch key hint is 副按钮; bomb slot hint is 放弹时', () => {
    const cat = skills({ slots: { bomb: slot('pierceBomb', 2), active: slot('blink'), passive: null } })
    const m = model(me(cat), 0, true)
    expect(m.chips[1].key).toBe('副按钮')
    expect(m.chips[0]).toMatchObject({ skill: 'pierceBomb', level: 2, key: '放弹时', ready: false, cdFrac: 0 })
  })
})
