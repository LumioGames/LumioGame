import { describe, expect, it } from 'vitest'
import { lossLine, lossPopupText } from '../format'
import { HatLossResolver, LOSS_RESOLVE_TICKS } from '../hat-loss'
import { snap } from './fixtures'

describe('HatLossResolver (ADR 0028: hats lost = power-ups dropped)', () => {
  it('uses proto.HatsLost immediately and ignores the later PowerupsDropped', () => {
    const r = new HatLossResolver()
    expect(r.onDied(2, 10, 3, 6)).toEqual({ victim: 2, tick: 10, lost: 3 })
    expect(r.isPending(2)).toBe(false)
    expect(r.onDropped(2, 5)).toBeNull()
  })

  it('without proto, PowerupsDropped decides (Kinds.length)', () => {
    const r = new HatLossResolver()
    expect(r.onDied(2, 10, undefined, 6)).toBeNull()
    expect(r.isPending(2)).toBe(true)
    expect(r.onDropped(2, 4)).toEqual({ victim: 2, tick: 10, lost: 4 })
    expect(r.onSnapshot(snap({ tick: 11, players: [{ id: 2, hats: 2 }] }))).toEqual([])
  })

  it('without any presentation data, the HatCount diff decides; unchanged after the window means 0', () => {
    const r = new HatLossResolver()
    r.onDied(2, 10, undefined, 6)
    r.onDied(3, 10, undefined, 1)
    // 死亡当 Tick 帽数还没变（规则层晚一 Tick 扣强化）
    expect(r.onSnapshot(snap({ tick: 10, players: [{ id: 2, hats: 6 }, { id: 3, hats: 1 }] }))).toEqual([])
    expect(r.onSnapshot(snap({ tick: 11, players: [{ id: 2, hats: 3 }, { id: 3, hats: 1 }] }))).toEqual([{ victim: 2, tick: 10, lost: 3 }])
    expect(r.onSnapshot(snap({ tick: 10 + LOSS_RESOLVE_TICKS, players: [{ id: 3, hats: 1 }] }))).toEqual([{ victim: 3, tick: 10, lost: 0 }])
  })

  it('treats a victim missing from the snapshot as 0 and forgets everything on clear()', () => {
    const r = new HatLossResolver()
    r.onDied(4, 10, undefined, 2)
    expect(r.onSnapshot(snap({ tick: 11, players: [{ id: 1 }] }))).toEqual([{ victim: 4, tick: 10, lost: 0 }])
    r.onDied(5, 12, undefined, 2)
    r.clear()
    expect(r.onDropped(5, 2)).toBeNull()
  })
})

describe('loss wording', () => {
  it('popup: 掉了 N 个强化（−N 帽）', () => {
    expect(lossPopupText(3)).toBe('掉了 3 个强化（−3 帽）')
  })

  it('recap line combines the drop list and the hat delta, whichever arrives first', () => {
    expect(lossLine(null, null)).toBe('…')
    expect(lossLine(null, 2)).toBe('2 个强化（−2 帽）')
    expect(lossLine('火力 ×1、速度 ×1', null)).toBe('火力 ×1、速度 ×1')
    expect(lossLine('火力 ×1、速度 ×1', 2)).toBe('火力 ×1、速度 ×1（−2 帽）')
    expect(lossLine(null, 0)).toBe('无')
    expect(lossLine('无', null)).toBe('无')
  })
})
