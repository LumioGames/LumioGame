import { describe, expect, it, vi } from 'vitest'
import { BOT_PROFILES, DEFAULT_CONFIG, DEFAULT_RULES, lineupFor, protoConfig, type BotDifficulty, type TickFrame } from '../src/contract'
import type { BotOptions } from '../src/bots/bot-brain'
import { LocalHost, type LocalHostOptions } from '../src/app/local-host'

/**
 * 宿主 → Bot 的接线（原型扩展 NON-CONTRACT，ADR 0043）：逐个 Bot 的难度阵容（botLineup）与「不围剿」软目标（softTargets = 真人 id）。
 * Bot 大脑读不读它们归 M1-3；这里只守宿主传得对、缺省行为不变（全员 ai、19×19、8 人）。
 */
const seen = vi.hoisted(() => [] as BotOptions[])
vi.mock('../src/bots/bot-brain', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/bots/bot-brain')>()
  class RecordingBrain extends mod.BotBrain {
    constructor(opts: BotOptions) {
      seen.push(opts)
      super(opts)
    }
  }
  return { ...mod, BotBrain: RecordingBrain }
})

function host(over: Partial<LocalHostOptions> = {}): { h: LocalHost; frames: TickFrame[] } {
  seen.length = 0
  const h = new LocalHost({ seed: 5, config: protoConfig(DEFAULT_RULES), rules: DEFAULT_RULES, botCount: 7, ...over })
  const frames: TickFrame[] = []
  h.subscribe((f) => frames.push(f))
  return { h, frames }
}

describe('LocalHost bot lineup and soft targets (ADR 0043)', () => {
  it('default: every bot plays the ai tier, gets the human as soft target; the match is still 19×19 with 8 players', () => {
    const { h, frames } = host()
    expect(seen).toHaveLength(7)
    expect(seen.every((o) => o.profile === BOT_PROFILES.normal)).toBe(true)
    expect(seen.every((o) => o.softTargets?.length === 1 && o.softTargets[0] === h.localPlayerId)).toBe(true)
    const snap = frames[frames.length - 1].snapshot
    expect(snap.Terrain.size).toBe(19)
    expect(snap.Players).toHaveLength(8)
    expect(snap.match.map?.tier).toBe(19)
    expect(protoConfig(DEFAULT_RULES).mapSize).toBe(DEFAULT_CONFIG.mapSize)
  })

  it('botLineup overrides ai per bot in slot order; a wrong length is rejected', () => {
    const lineup: BotDifficulty[] = lineupFor(7)
    host({ ai: 'hard', botLineup: lineup })
    expect(seen.map((o) => o.profile)).toEqual(lineup.map((d) => BOT_PROFILES[d]))
    expect(() => host({ botLineup: lineupFor(6) })).toThrow(/botLineup/)
  })
})
