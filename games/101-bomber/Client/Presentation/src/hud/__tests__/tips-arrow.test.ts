import { describe, expect, it } from 'vitest'
import { edgeArrowPlacement } from '../edge-arrow'
import { DEFAULT_RULES } from '../../contract'
import { helpRuleLines, ruleCardLines, TIP_HATS_GOAL, TipId, TipProgress, TIPS, type TipStore } from '../tips'

function memStore(initial: number[] = []): TipStore & { saved: number[] } {
  const s = {
    saved: initial,
    load: () => s.saved,
    save: (d: readonly number[]) => {
      s.saved = [...d]
    },
  }
  return s
}

describe('TipProgress', () => {
  it('shows the three first-play tips in order and removes each once done', () => {
    const store = memStore()
    const t = new TipProgress(store)
    expect(t.current()?.text).toBe('放炸弹，炸开积木')
    expect(t.complete(TipId.Brick)).toBe(true)
    expect(t.complete(TipId.Brick)).toBe(false)
    expect(t.current()?.text).toBe(TIPS[1])
    t.complete(TipId.Hats)
    expect(t.current()?.text).toBe('捡糖，换特殊炸弹')
    t.complete(TipId.Candy)
    expect(t.current()).toBeNull()
    expect(store.saved).toEqual([0, 1, 2])
  })

  it('remembers completion across sessions via the store', () => {
    const t = new TipProgress(memStore([0, 1]))
    expect(t.current()?.text).toBe('追光柱，抢最多的帽子')
  })

  it('tip 3 keeps the design §13 wording and completes at TIP_HATS_GOAL hats', () => {
    expect(TIPS[TipId.Hats]).toBe('追光柱，抢最多的帽子')
    expect(TIP_HATS_GOAL).toBe(3)
  })
})

describe('rule card (ADR 0028 / 0031)', () => {
  it('says hats = power-ups (skills do not count), death drops half, and survivors win the 115 s final circle', () => {
    expect(ruleCardLines(DEFAULT_RULES.finalCircleMs / 1000)).toEqual([
      '吃一个强化糖，头顶多一顶帽子（帽子 = 强化数，技能不算）',
      '被炸死会掉一半强化，谁捡归谁',
      '决赛圈 115 秒：不能复活、圈外有毒，活到最后者赢',
    ])
    expect(ruleCardLines()[2]).toContain('115')
    for (const l of ruleCardLines()) expect(l).not.toMatch(/击杀|炸倒人都|帽子全掉|散落|帽子最多者赢|最后 \d+ 秒/)
  })

  it('help lines describe two chips, the 1×1 ring, 115 s and the survivor rule', () => {
    const lines = helpRuleLines(DEFAULT_RULES).join('\n')
    for (const s of ['棉花兔', '泡泡鸭', '闪电猫', '火焰熊', '特殊炸弹槽', '正中 1 格', '115 秒', '活到最后者赢']) expect(lines).toContain(s)
    expect(lines).not.toMatch(/Lv|升级|进化|三个技能槽|火焰冲刺|弹射泡泡|冰川弹/)
    expect(lines).not.toMatch(/90 秒|帽子最多者赢/)
  })

  it('help lists all five characters and bomb replacement', () => {
    const lines = helpRuleLines(DEFAULT_RULES)
    expect(lines[1]).toBe('五个角色各带一个专属技能：棉花兔（被动 回春）、泡泡鸭（Shift 泡泡）、闪电猫（Shift 闪现）、火焰熊（Shift 火焰光环）、飞腿袋鼠（Shift 飞踢）。')
    expect(lines[2]).toBe('只有一个特殊炸弹槽：踩到不同形态会替换当前炸弹；角色技能由所选角色决定。')
  })

  it('help explains the ADR 0033 bomb candies (from the pool) and the chest bomb-candy guarantee', () => {
    const lines = helpRuleLines(DEFAULT_RULES)
    const bombs = lines.find((l) => l.includes('中毒弹'))
    expect(bombs).toBe('特殊炸弹：冰冻弹冻住、穿透弹多穿砖、中毒弹持续掉血（吃血包或放泡泡能解毒）。')
    expect(lines.join('\n')).toContain('里面有强化、血包和一颗炸弹糖')
    expect(helpRuleLines({ ...DEFAULT_RULES, chestSkillCandyPool: 'all' }).join('\n')).toContain('里面有强化、血包和技能糖')
  })
})

describe('edgeArrowPlacement', () => {
  const W = 1280
  const H = 720

  it('hides the arrow when the king is well inside the viewport', () => {
    expect(edgeArrowPlacement({ x: 700, y: 300, onScreen: true, behind: false }, W, H).visible).toBe(false)
  })

  it('clamps an off-screen king to an ellipse 48 px inside the edge', () => {
    const p = edgeArrowPlacement({ x: 3000, y: 360, onScreen: false, behind: false }, W, H)
    expect(p.visible).toBe(true)
    expect(p.x).toBeCloseTo(W - 48)
    expect(p.y).toBeCloseTo(H / 2)
    expect(p.angle).toBeCloseTo(0)
  })

  it('shows for points beyond ±0.85 even if technically on screen, and for points behind the camera', () => {
    expect(edgeArrowPlacement({ x: 20, y: 360, onScreen: true, behind: false }, W, H).visible).toBe(true)
    const back = edgeArrowPlacement({ x: 640, y: 360, onScreen: false, behind: true }, W, H)
    expect(back.visible).toBe(true)
    expect(back.y).toBeCloseTo(H - 48)
  })
})
