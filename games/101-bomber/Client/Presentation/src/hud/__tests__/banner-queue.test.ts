import { describe, expect, it } from 'vitest'
import { queueBanner } from '../fx-layers'
import type { BannerTone } from '../hud-brain'

const item = (tone: BannerTone, title: string) => ({ tone, title })
const titles = (q: { title: string }[]): string[] => q.map((x) => x.title)

describe('queueBanner (本人连杀横幅要即时，ADR 0043)', () => {
  it('keeps arrival order for ordinary banners and drops the oldest past the cap', () => {
    const q: { tone: BannerTone; title: string }[] = []
    for (const t of ['a', 'b', 'c', 'd']) queueBanner(q, item('crown', t))
    expect(titles(q)).toEqual(['b', 'c', 'd'])
  })

  it('final jumps to the front; a streak goes right after it, ahead of crowns / falls', () => {
    const q = [item('crown', 'a'), item('fall', 'b')]
    queueBanner(q, item('final', 'F'))
    queueBanner(q, item('streak', 'S'))
    // 超过上限时挤掉最早的普通横幅（只留最新的）。
    expect(titles(q)).toEqual(['F', 'S', 'b'])
  })

  it('never lets later ordinary banners push a queued streak out', () => {
    const q: { tone: BannerTone; title: string }[] = []
    queueBanner(q, item('streak', '大杀特杀'))
    for (const t of ['a', 'b', 'c', 'd']) queueBanner(q, item('crown', t))
    expect(titles(q)).toEqual(['大杀特杀', 'c', 'd'])
  })

  it('two streaks keep their order', () => {
    const q = [item('crown', 'a')]
    queueBanner(q, item('streak', '双杀'))
    queueBanner(q, item('streak', '三杀'))
    expect(titles(q)).toEqual(['双杀', '三杀', 'a'])
  })
})
