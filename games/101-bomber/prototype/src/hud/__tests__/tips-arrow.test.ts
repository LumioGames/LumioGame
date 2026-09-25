import { describe, expect, it } from 'vitest'
import { edgeArrowPlacement } from '../edge-arrow'
import { ruleCardLines, TIP_HATS_GOAL, TipId, TipProgress, TIPS, type TipStore } from '../tips'

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
    expect(t.current()?.text).toBe('捡糖，让炸弹更强')
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

describe('rule card (ADR 0028)', () => {
  it('says hats = power-ups, death drops half, and the final circle has no respawn', () => {
    expect(ruleCardLines(90)).toEqual([
      '吃一个强化糖，头顶多一顶帽子（帽子 = 强化数）',
      '被炸死会掉一半强化，谁捡归谁',
      '最后 90 秒决赛圈：不能复活，圈外有毒',
    ])
    expect(ruleCardLines(60)[2]).toBe('最后 60 秒决赛圈：不能复活，圈外有毒')
    for (const l of ruleCardLines()) expect(l).not.toMatch(/击杀|炸倒人都|帽子全掉|散落/)
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
