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

  it('COMBO_FORM keys are exactly the combo results', () => {
    expect(Object.keys(COMBO_FORM).sort()).toEqual(COMBOS.map((c) => c.result).sort())
  })

  it('labels every slot', () => {
    for (const s of SKILL_SLOTS) expect(SLOT_LABEL[s].length).toBeGreaterThan(0)
  })
})
