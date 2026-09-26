import { describe, expect, it } from 'vitest'
import { COMBOS, SKILL_IDS, SKILL_SLOTS } from '../../contract'
import { COMBO_FORM, SKILL_COLOR, SKILL_ICON, SLOT_LABEL, skillCss } from '../skill-style'

describe('skill-style (技能表现数据)', () => {
  it('every skill has an inline SVG icon (no emoji) and a colour', () => {
    for (const id of SKILL_IDS) {
      expect(SKILL_ICON[id].startsWith('<svg')).toBe(true)
      expect(SKILL_ICON[id]).toContain('currentColor')
      expect(SKILL_ICON[id]).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(SKILL_COLOR[id]).toBeGreaterThan(0)
      expect(skillCss(id)).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(skillCss('blink')).toBe('#ffd84d')
  })

  it('ADR 0033 bomb types: own icons (no placeholder) and colours distinct from every other skill', () => {
    const rgb = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
    const dist = (a: number, b: number): number => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))
    for (const id of ['toxinBomb', 'shockBomb'] as const) {
      expect(SKILL_ICON[id]).not.toBe(SKILL_ICON.freezeBomb)
      for (const other of SKILL_IDS) if (other !== id) expect(dist(SKILL_COLOR[id], SKILL_COLOR[other])).toBeGreaterThan(40)
    }
    expect(new Set(SKILL_IDS.map((id) => SKILL_ICON[id])).size).toBe(SKILL_IDS.length)
  })

  it('COMBO_FORM keys are exactly the combo results', () => {
    expect(Object.keys(COMBO_FORM).sort()).toEqual(COMBOS.map((c) => c.result).sort())
  })

  it('labels every slot', () => {
    for (const s of SKILL_SLOTS) expect(SLOT_LABEL[s].length).toBeGreaterThan(0)
  })
})
