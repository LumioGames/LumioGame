import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES } from '../../contract'
import { AI_LABEL, characterLine, initialIndex, selectCards, selectKey, selectKeysHint, selectReduce, type SelectState } from '../select-model'

describe('select-model (选角界面)', () => {
  const cards = selectCards(DEFAULT_RULES, DEFAULT_CONFIG)

  it('five cards in CHARACTER_ORDER with names, skills and key hints (飞腿袋鼠 = 用户 2026-09-28)', () => {
    expect(cards.map((c) => [c.id, c.name, c.skill, c.kind, c.keyHint])).toEqual([
      ['rabbit', '棉花兔', 'regen', '被动', '自动生效'],
      ['duck', '泡泡鸭', 'bubble', '主动', 'Shift / 副按钮'],
      ['cat', '闪电猫', 'blink', '主动', 'Shift / 副按钮'],
      ['bear', '火焰熊', 'fireAura', '主动', 'Shift / 副按钮'],
      ['kangaroo', '飞腿袋鼠', 'flyKick', '主动', 'Shift / 副按钮'],
    ])
    expect(cards.map((c) => c.animal)).toEqual(['rabbit', 'duck', 'cat', 'bear', 'kangaroo'])
    // 袋鼠卡一句话 = 用户原话。
    expect(cards[4].tagline).toBe('按 Shift 把面前的炸弹一脚踢出去，一直滑到被挡住（冷却 4 秒）')
    expect(cards[4].skillName).toBe('飞踢')
  })

  it('descriptions carry the Lv1 numbers from the table', () => {
    // 第 4 轮平衡（D 验收，ADR 0034）后的 L1：回春 20 秒 / 半心；泡泡 3.5 秒 / CD 14 秒；闪现 3 格 / CD 10 秒；光环 5.5 秒 / CD 16 秒。
    expect(cards[0].desc).toContain('20 秒')
    expect(cards[0].desc).toContain('0.5 心')
    expect(cards[1].desc).toContain('3.5 秒')
    expect(cards[1].desc).toContain('14 秒')
    expect(cards[2].desc).toContain('3 格')
    expect(cards[2].desc).toContain('10 秒')
    expect(cards[3].desc).toContain('5.5 秒')
    expect(cards[3].desc).toContain('16 秒')
    // 飞踢 Lv1：冷却 4 秒、一直滑到被挡住。
    expect(cards[4].desc).toContain('冷却 4 秒')
    expect(cards[4].desc).toContain('一直滑到被挡住')
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

  it('key map: arrows / WASD / digits / Enter; Esc is left to the global pause key', () => {
    expect(selectKey('ArrowLeft')).toEqual({ t: 'move', d: -1 })
    expect(selectKey('KeyD')).toEqual({ t: 'move', d: 1 })
    expect(selectKey('Digit3')).toEqual({ t: 'pick', i: 2 })
    expect(selectKey('Numpad1')).toEqual({ t: 'pick', i: 0 })
    // 五选一：5 直选袋鼠；6 不映射。
    expect(selectKey('Digit5')).toEqual({ t: 'pick', i: 4 })
    expect(selectKey('Numpad5')).toEqual({ t: 'pick', i: 4 })
    expect(selectKey('Digit6')).toBeNull()
    expect(selectReduce({ index: 0, done: null }, { t: 'pick', i: 4 }, cards.length, 'start')).toEqual({ index: 4, done: null })
    expect(selectReduce({ index: 4, done: null }, { t: 'move', d: 1 }, cards.length, 'start').index).toBe(0)
    expect(selectKey('Enter')).toEqual({ t: 'confirm' })
    expect(selectKey('Space')).toEqual({ t: 'confirm' })
    // Esc 不被选角卡吃掉：全局暂停键把它当「继续游戏」（换角色卡随之关闭）。
    expect(selectKey('Escape')).toBeNull()
    expect(selectKey('KeyQ')).toBeNull()
  })

  it('footer key hint matches what Esc actually does (review #12)', () => {
    expect(selectKeysHint('start')).toBe('←→ 选择 · Enter 开始')
    expect(selectKeysHint('switch')).toBe('←→ 选择 · Enter 确定 · Esc 继续游戏')
    expect(selectKeysHint('switch')).not.toMatch(/Esc 返回/)
  })

  it('initial index from the remembered pick', () => {
    expect(initialIndex('bear')).toBe(3)
    expect(initialIndex('kangaroo')).toBe(4)
    expect(initialIndex('x')).toBe(0)
    expect(initialIndex(null)).toBe(0)
  })

  it('character line and AI labels', () => {
    expect(characterLine(cards[2])).toBe('你是 闪电猫 · Shift 闪现')
    expect(characterLine(cards[0])).toBe('你是 棉花兔 · 被动 回春')
    expect(characterLine(cards[4])).toBe('你是 飞腿袋鼠 · Shift 飞踢')
    expect(Object.keys(AI_LABEL).sort()).toEqual(['easy', 'hard', 'normal', 'rookie'])
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
