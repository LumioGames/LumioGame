import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RULES } from '../../contract'
import { snap } from '../../hud/__tests__/fixtures'
import { PresentationFeed } from '../../present/feed'
import { projectOccurrences } from '../../replica-events'
import type { ReplicaFrame } from '../../replica-types'

const calls: string[] = []
vi.mock('../synth', () => ({ Synth: class {
  now(): number { return 0 }
  setMuted(): void {}
  setMusicEnabled(): void {}
  resume(): void {}
  setHiss(): void {}
  musicNote(): void {}
  dispose(): void {}
} }))
vi.mock('../sounds', async orig => {
  const real: Record<string, unknown> = await orig()
  return Object.fromEntries(Object.entries(real).map(([key, value]) =>
    [key, typeof value === 'function' ? () => void calls.push(key) : value]))
})
const { createAudio } = await import('../index')
const participant = 'ffffffffffffffff0000000000000001'
const projection = { catalog: { characters: new Map(), skills: new Map(), circleStages: new Map([[104002, 1]]) },
  tick: (value: string | null | undefined) => Number(value ?? 0),
  handle: (_kind: string, id: string | null | undefined) => id === participant ? 1 : id ? 2 : 0 }

function play(events: unknown[], baseline: boolean): void {
  const replica = { tick: '11', match: { matchId: '90' }, players: [], bombs: [], config: { mapSize: 19 },
    events: events.map(event => JSON.stringify(event)) } as unknown as ReplicaFrame
  const live = projectOccurrences(replica, baseline ? null : 0n, projection)
  const feed = new PresentationFeed(50)
  const audio = createAudio({ muted: false, music: false, rules: DEFAULT_RULES })
  audio.unlock()
  for (let tick = 10; tick <= 14; tick++) {
    const frame = { snapshot: snap({ tick, players: [{ id: 1 }] }), events: tick === 11 ? live.events : [] }
    feed.push(frame, (tick - 10) * 50 + 0.3)
    if (tick === 11) feed.push(frame, 52)
    for (let sub = 0; sub < 3; sub++) {
      const sample = feed.sample((tick - 10) * 50 + sub * 50 / 3)
      if (sample) audio.update(sample, 1)
    }
  }
  audio.dispose()
}

describe('committed journal through presentation feed and audio', () => {
  beforeEach(() => { calls.length = 0 })
  it.each([false, true])('strong chest hit/open cues play once and never from a baseline (baseline=%s)', baseline => {
    const hit = { version: 1, kind: 'chest_hit', matchId: '90', tick: '11', sequence: '9007199254740997',
      sourceParticipantId: participant, entityId: 'ffffffffffffffff0000000000000003', x: 3, z: 4,
      data: { resourceTier: '0', remainingHits: '0', chainId: '18446744073709551600' } }
    play([hit, { ...hit, kind: 'final_chest_opened', sequence: '9007199254740998' }], baseline)
    expect(calls.filter(name => name === 'chestHit')).toHaveLength(baseline ? 0 : 1)
    expect(calls.filter(name => name === 'chestOpen')).toHaveLength(baseline ? 0 : 1)
  })
  it('does not add the strong chest cue to a resource-crate occurrence', () => {
    play([{ version: 1, kind: 'crate_opened', matchId: '90', tick: '11', sequence: '9007199254740997',
      sourceParticipantId: participant, x: 3, z: 4, data: { resourceTier: '111003' } }], false)
    expect(calls.filter(name => name === 'chestHit' || name === 'chestOpen')).toHaveLength(0)
  })
  it('plays one circle warning for a committed preview, including duplicate frame delivery', () => {
    play([{ version: 1, kind: 'circle_preview', matchId: '90', tick: '11', sequence: '9007199254740997',
      data: { stageId: '104002', side: '13', effectiveTick: '71' } }], false)
    expect(calls.filter(name => name === 'ringWarn')).toHaveLength(1)
  })
  it.each([false, true])('health pack emits no regeneration or duplicate heal cue (baseline=%s)', baseline => {
    const heal = { version: 1, kind: 'heal_applied', matchId: '90', tick: '11', sequence: '9007199254740997',
      participantId: participant, entityId: 'ffffffffffffffff0000000000000002', x: 3, z: 4,
      data: { appliedPoints: '2', healthPointsBefore: '2', healthPointsLeft: '4', maximumHealth: '6',
        goldenHeartCount: '0', hatCount: '0', sourceLifeGeneration: '1' } }
    play([heal, { ...heal, kind: 'pickup_taken', sequence: '9007199254740998', data: { ...heal.data, pickupKind: '3' } }], baseline)
    expect(calls.filter(name => name === 'healthPack')).toHaveLength(baseline ? 0 : 1)
    expect(calls.filter(name => name === 'regenChime')).toHaveLength(0)
  })
  it('does not replay a circle warning from the reconnect baseline', () => {
    play([{ version: 1, kind: 'circle_preview', matchId: '90', tick: '11', sequence: '9007199254740997',
      data: { stageId: '104002', side: '13', effectiveTick: '71' } }], true)
    expect(calls.filter(name => name === 'ringWarn')).toHaveLength(0)
  })
})
