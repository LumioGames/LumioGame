import { describe, expect, it } from 'vitest'
import { COMBOS, CHARACTERS, PickupKind, SKILLS } from '../../contract'
import { removePlayerFromWorld } from '../hats'
import { allSkillDrops } from '../skill-drops'
import { addBomb, evs, makeWorld, player, put, run, startCircle, step } from './helpers'
import { giveSkill } from './skill-helpers'

/** 死亡掉技能（原型扩展 NON-CONTRACT，ADR 0030 / D8）：专属不掉、组合技拆半、出局全掉；技能糖不算帽子（D5）。 */

const DASH_PARTS = (auraLevel = 1) => [
  { skill: 'blink' as const, level: 1, bound: true },
  { skill: 'fireAura' as const, level: auraLevel, bound: false },
]

function catVictim(permille: number) {
  const w = makeWorld({ picks: ['cat', null], rules: { skillDeathDropPermille: permille } })
  const v = put(w, 1, 9, 9)
  put(w, 2, 17, 17)
  v.health = 2
  return { w, v }
}

/** 2 号的弹炸死 1 号：死亡结算在第 1 步，掉落在第 2 步（晚一帧）。 */
function kill(w: ReturnType<typeof makeWorld>) {
  addBomb(w, 2, 9, 11, 1)
  const f1 = step(w)
  const f2 = step(w)
  return [f1, f2]
}

describe('skill death drops', () => {
  it("the cat's exclusive never drops; a picked kick L2 drops as an L2 candy within 3, with droppedBy and 3 s protection", () => {
    const { w, v } = catVictim(1000)
    giveSkill(w, 1, 'kick', 2)
    const frames = kill(w)
    const sd = evs(frames, 'SkillsDropped')
    expect(sd).toEqual([
      { type: 'SkillsDropped', presentationOnly: true, VictimNetEntityIdRaw: 1, Skills: [{ Skill: 'kick', Level: 2 }], Devolved: null, Cell: { X: 9, Y: 9 }, Tick: w.t },
    ])
    const sp = evs(frames, 'PickupSpawned').filter((e) => e.Kind === PickupKind.SkillCandy)
    expect(sp).toHaveLength(1)
    expect(sp[0]).toMatchObject({ Source: 'death', DroppedByNetEntityIdRaw: 1, Skill: 'kick', SkillLevel: 2, FromCell: { X: 9, Y: 9 } })
    expect(Math.abs(sp[0].Cell.X - 9) + Math.abs(sp[0].Cell.Y - 9)).toBeLessThanOrEqual(3)
    expect(v.slots).toEqual({ bomb: null, active: { skill: 'blink', level: 1, bound: true, parts: null }, passive: null })
    const candy = frames[1].snapshot.Pickups.find((p) => p.skill?.id === 'kick')
    expect(candy?.protectedUntilTick).toBe(w.t + w.ticks.deathDropProtect)
    // PlayerDied.HatsLost 与 PowerupsDropped 只算强化（D5）。
    expect(evs(frames, 'PlayerDied')[0].proto?.HatsLost).toBe(0)
    expect(evs(frames, 'PowerupsDropped')).toHaveLength(0)
  })

  it('at 0‰ nothing drops, but the roll is still drawn per unit on rng.skill', () => {
    const { w, v } = catVictim(0)
    giveSkill(w, 1, 'kick', 2)
    giveSkill(w, 1, 'freezeBomb', 1)
    const replay = w.rng.skill.clone()
    const frames = kill(w)
    expect(evs(frames, 'SkillsDropped')).toHaveLength(0)
    expect(v.slots.passive?.skill).toBe('kick')
    replay.NextInt(0, 1000)
    replay.NextInt(0, 1000)
    expect(w.rng.skill.state()).toEqual(replay.state())
  })

  it('devolve: fireDash (bound blink + picked fireAura L2) drops a fireAura L2 candy and becomes blink L1 bound', () => {
    const { w, v } = catVictim(1000)
    giveSkill(w, 1, 'fireDash', 1, true, DASH_PARTS(2))
    const frames = kill(w)
    expect(evs(frames, 'SkillsDropped')).toMatchObject([{ Skills: [{ Skill: 'fireAura', Level: 2 }], Devolved: { Combo: 'fireDash', To: 'blink' } }])
    expect(v.slots.active).toEqual({ skill: 'blink', level: 1, bound: true, parts: null })
  })

  it('two picked halves (glacier) drop as one glacierBomb candy; the slot empties', () => {
    const { w, v } = catVictim(1000)
    giveSkill(w, 1, 'glacierBomb', 1, false, [
      { skill: 'freezeBomb', level: 2, bound: false },
      { skill: 'pierceBomb', level: 1, bound: false },
    ])
    const frames = kill(w)
    expect(evs(frames, 'SkillsDropped')).toMatchObject([{ Skills: [{ Skill: 'glacierBomb', Level: 1 }], Devolved: null }])
    expect(v.slots.bomb).toBeNull()
  })

  it('a final-circle death (elimination) drops everything but the exclusive, without rolling', () => {
    const { w, v } = catVictim(0)
    giveSkill(w, 1, 'kick', 1)
    giveSkill(w, 1, 'pierceBomb', 3)
    startCircle(w)
    const before = w.rng.skill.state()
    const frames = kill(w)
    expect(v.eliminated).toBe(true)
    expect(evs(frames, 'SkillsDropped')).toMatchObject([
      {
        Skills: [
          { Skill: 'pierceBomb', Level: 3 },
          { Skill: 'kick', Level: 1 },
        ],
      },
    ])
    expect(v.slots.active?.skill).toBe('blink')
    expect(w.rng.skill.state()).toEqual(before)
  })

  it('promoteEliminations upgrades a same-tick death to drop everything', () => {
    const { w, v } = catVictim(0)
    giveSkill(w, 1, 'kick', 1)
    addBomb(w, 2, 9, 11, 1)
    step(w)
    expect(w.pendingDeaths[0].dropSkills).toEqual([])
    // 决赛圈在死亡结算之后的同一 Tick 触发（startTick = 死亡 Tick）。
    startCircle(w)
    expect(w.finalCircle?.startTick).toBe(w.pendingDeaths[0].tick)
    expect(w.pendingDeaths[0].dropSkills).toMatchObject([{ skill: 'kick' }])
    const f = step(w)
    expect(evs(f, 'SkillsDropped')).toMatchObject([{ Skills: [{ Skill: 'kick', Level: 1 }] }])
    expect(v.eliminated).toBe(true)
  })

  it('removePlayer drops every unbound skill', () => {
    const w = makeWorld({ picks: [null, 'duck'] })
    put(w, 1, 5, 5)
    put(w, 2, 9, 9)
    giveSkill(w, 2, 'kick', 2)
    giveSkill(w, 2, 'freezeBomb', 1)
    removePlayerFromWorld(w, 2)
    const f = step(w)
    expect(evs(f, 'SkillsDropped')).toMatchObject([
      {
        VictimNetEntityIdRaw: 2,
        Skills: [
          { Skill: 'freezeBomb', Level: 1 },
          { Skill: 'kick', Level: 2 },
        ],
      },
    ])
    expect(evs(f, 'PickupSpawned').filter((e) => e.Kind === PickupKind.SkillCandy && e.DroppedByNetEntityIdRaw === 2)).toHaveLength(2)
  })

  it('a death-dropped candy can be picked up by anyone', () => {
    const { w } = catVictim(1000)
    giveSkill(w, 1, 'kick', 1)
    kill(w)
    const candy = w.pickups.find((p) => p.kind === PickupKind.SkillCandy)!
    const q = put(w, 2, candy.cell % w.size, Math.floor(candy.cell / w.size))
    run(w, 1)
    expect(q.slots.passive?.skill).toBe('kick')
    expect(player(w, 1).slots.passive).toBeNull()
  })

  it('table invariant: a combo containing an exclusive skill lives in that exclusive skill’s slot', () => {
    for (const ch of Object.values(CHARACTERS))
      for (const c of COMBOS) if (c.a === ch.skill || c.b === ch.skill) expect(SKILLS[c.result].slot, `${ch.id}/${c.result}`).toBe(SKILLS[ch.skill].slot)
  })

  it('allSkillDrops: slot order, exclusive skipped', () => {
    const w = makeWorld({ picks: ['duck', null] })
    giveSkill(w, 1, 'kick', 3)
    giveSkill(w, 1, 'pierceBomb', 2)
    expect(allSkillDrops(player(w, 1)).map((d) => [d.slot, d.skill, d.level, d.keep])).toEqual([
      ['bomb', 'pierceBomb', 2, null],
      ['passive', 'kick', 3, null],
    ])
  })
})
