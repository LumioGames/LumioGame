import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES } from '../../contract'
import { AI_LABEL, characterLine, initialIndex, selectCards, selectKey, selectReduce, type SelectState } from '../select-model'

describe('select-model (选角界面)', () => {
  const cards = selectCards(DEFAULT_RULES, DEFAULT_CONFIG)

  it('four cards in CHARACTER_ORDER with names, skills and key hints', () => {
    expect(cards.map((c) => [c.id, c.name, c.skill, c.kind, c.keyHint])).toEqual([
      ['rabbit', '棉花兔', 'regen', '被动', '自动生效'],
      ['duck', '泡泡鸭', 'bubble', '主动', 'Shift / 副按钮'],
      ['cat', '闪电猫', 'blink', '主动', 'Shift / 副按钮'],
      ['bear', '火焰熊', 'fireAura', '主动', 'Shift / 副按钮'],
    ])
    expect(cards.map((c) => c.animal)).toEqual(['rabbit', 'duck', 'cat', 'bear'])
  })

  it('descriptions carry the Lv1 numbers from the table', () => {
    expect(cards[0].desc).toContain('10')
    expect(cards[1].desc).toContain('18')
    expect(cards[1].desc).toContain('3')
    expect(cards[2].desc).toContain('3 格')
    expect(cards[2].desc).toContain('12')
    expect(cards[3].desc).toContain('20')
    for (const c of cards) expect(c.desc).not.toMatch(/\{\w+\}/)
  })

  it('reducer: move wraps, pick selects without confirming, cancel only in switch mode', () => {
    const s0: SelectState = { index: 0, done: null }
    expect(selectReduce(s0, { t: 'move', d: -1 }, 4, 'start').index).toBe(3)
    expect(selectReduce({ index: 3, done: null }, { t: 'move', d: 1 }, 4, 'start').index).toBe(0)
    expect(selectReduce(s0, { t: 'pick', i: 2 }, 4, 'start')).toEqual({ index: 2, done: null })
    expect(selectReduce(s0, { t: 'pick', i: 9 }, 4, 'start')).toEqual(s0)
    expect(selectReduce(s0, { t: 'cancel' }, 4, 'start').done).toBeNull()
    expect(selectReduce(s0, { t: 'cancel' }, 4, 'switch').done).toBe('cancelled')
    const done = selectReduce(s0, { t: 'confirm' }, 4, 'start')
    expect(done.done).toBe('confirmed')
    expect(selectReduce(done, { t: 'move', d: 1 }, 4, 'start')).toBe(done)
  })

  it('key map: arrows / WASD / digits / Enter / Esc', () => {
    expect(selectKey('ArrowLeft', 'start')).toEqual({ t: 'move', d: -1 })
    expect(selectKey('KeyD', 'start')).toEqual({ t: 'move', d: 1 })
    expect(selectKey('Digit3', 'start')).toEqual({ t: 'pick', i: 2 })
    expect(selectKey('Numpad1', 'switch')).toEqual({ t: 'pick', i: 0 })
    expect(selectKey('Enter', 'start')).toEqual({ t: 'confirm' })
    expect(selectKey('Space', 'switch')).toEqual({ t: 'confirm' })
    expect(selectKey('Escape', 'start')).toBeNull()
    expect(selectKey('Escape', 'switch')).toEqual({ t: 'cancel' })
    expect(selectKey('KeyQ', 'start')).toBeNull()
  })

  it('initial index from the remembered pick', () => {
    expect(initialIndex('bear')).toBe(3)
    expect(initialIndex('x')).toBe(0)
    expect(initialIndex(null)).toBe(0)
  })

  it('character line and AI labels', () => {
    expect(characterLine(cards[2])).toBe('你是 闪电猫 · Shift 闪现')
    expect(characterLine(cards[0])).toBe('你是 棉花兔 · 被动 回春')
    expect(Object.keys(AI_LABEL).sort()).toEqual(['easy', 'hard', 'normal'])
    expect(AI_LABEL.normal).toBe('普通')
  })
})

describe('last character store', () => {
  it('round-trips through the store and survives a throwing store', async () => {
    const { loadLastCharacter, saveLastCharacter } = await import('../character-select')
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    expect(loadLastCharacter(store)).toBeNull()
    saveLastCharacter('bear', store)
    expect(loadLastCharacter(store)).toBe('bear')
    const bad = {
      getItem: (): string | null => {
        throw new Error('denied')
      },
      setItem: (): void => {
        throw new Error('denied')
      },
    }
    expect(loadLastCharacter(bad)).toBeNull()
    expect(() => saveLastCharacter('cat', bad)).not.toThrow()
  })
})
