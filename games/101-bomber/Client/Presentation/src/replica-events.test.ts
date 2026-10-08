import { describe, expect, it } from 'vitest'
import { projectOccurrences } from './replica-events'
import type { ReplicaFrame } from './replica-types'

const catalog = { characters: new Map(), skills: new Map([[3, 'blink' as const], [6, 'freezeBomb' as const]]),
  candySkills: new Set([6]) }
const identity = new Map<string, number>()
const projection = { catalog, tick: (value: string | null | undefined) => Number(value ?? 0),
  handle: (kind: string, id: string | null | undefined): number => {
    if (!id || id === '0') return 0
    const key = `${kind}:${id}`
    if (!identity.has(key)) identity.set(key, identity.size + 1)
    return identity.get(key)!
  } }
const frame = (events: unknown[], tick = '101') => ({ tick, match: { matchId: '90' },
  players: [], bombs: [], events: events.map(e => JSON.stringify(e)) } as unknown as ReplicaFrame)
const death = { version: 1, kind: 'death', matchId: '90', tick: '101', sequence: '9007199254740997',
  participantId: 'ffffffffffffffff0000000000000002', sourceParticipantId: 'ffffffffffffffff0000000000000001',
  x: 3, z: 4, cause: 'explosion', data: { chainId: '18446744073709551600' } }

describe('committed presentation occurrences', () => {
  it('projects formal region events with full old Life and interval after its body disappears', () => {
    const region = { ...death, kind: 'fire_region_born', entityId: 'ffffffffffffffff0000000000000009',
      lifeId: 'ffffffffffffffff0000000000000008', lifeGeneration: '18446744073709551599',
      data: { skillId: '4', skillLevel: '1', chainId: '18446744073709551600', mask: '0',
        fromTick: '18446744073709551000', untilTick: '18446744073709551020' } }
    const expired = { ...region, kind: 'fire_region_expired', sequence: '9007199254740998' }
    const current = frame([region, expired]); const projected = projectOccurrences(current, 0n, projection)
    expect(projected.events).toHaveLength(2)
    expect(projected.events[0]).toMatchObject({ type: 'FireRegionBorn', Region: region.entityId,
      Source: { Participant: region.participantId, Life: region.lifeId, LifeGeneration: region.lifeGeneration },
      MatchId: region.matchId, ChainId: region.data.chainId, Mask: 0,
      FromTick: region.data.fromTick, UntilTick: region.data.untilTick })
    expect(projected.events[1]).toMatchObject({ type: 'FireRegionExpired', Source: { Life: region.lifeId } })
    expect(projectOccurrences(current, projected.cursor, projection).events).toEqual([])
    expect(projectOccurrences(current, null, projection).events).toEqual([])
  })

  it('uses committed strong chest facts after the bound entity has disappeared', () => {
    const hit = { ...death, kind: 'chest_hit', entityId: 'ffffffffffffffff0000000000000004',
      data: { resourceTier: '0', remainingHits: '0', bombId: 'ffffffffffffffff0000000000000005', chainId: '18446744073709551600' } }
    const opened = { ...hit, kind: 'final_chest_opened', sequence: '9007199254740998',
      data: { ...hit.data, resourceTier: '0' } }
    const current = frame([hit, opened])
    const projected = projectOccurrences(current, 0n, projection)
    expect(projected.events).toEqual([
      { type: 'ChestHit', presentationOnly: true, Tick: 101,
        ChestNetEntityIdRaw: projection.handle('entity', hit.entityId), HitsLeft: 0,
        SourceBombOwnerNetEntityIdRaw: projection.handle('player', hit.sourceParticipantId),
        ChainId: projection.handle('chain', hit.data.chainId), occurrenceId: '90:101:9007199254740997' },
      { type: 'ChestOpened', presentationOnly: true, Tick: 101,
        ChestNetEntityIdRaw: projection.handle('entity', hit.entityId), Cell: { X: 3, Y: 4 },
        OpenerNetEntityIdRaw: projection.handle('player', hit.sourceParticipantId), occurrenceId: '90:101:9007199254740998' },
    ])
    expect(projectOccurrences(current, projected.cursor, projection).events).toEqual([])
    expect(projectOccurrences(current, null, projection).events).toEqual([])
  })
  it('does not label resource crates as strong chest cues', () => {
    const resource = { ...death, entityId: 'ffffffffffffffff0000000000000004',
      data: { resourceTier: '111003', remainingHits: '0' } }
    for (const kind of ['chest_hit', 'final_chest_opened', 'crate_opened'])
      expect(projectOccurrences(frame([{ ...resource, kind }]), 0n, projection).events).toEqual([])
  })
  it('projects the captured circle preview with full-width occurrence and tick identities', () => {
    const origin = 18446744073709550000n
    const tick = String(origin + 1n), effectiveTick = String(origin + 61n)
    const preview = { version: 1, kind: 'circle_preview', matchId: '18446744073709551599',
      tick, sequence: '18446744073709551614', data: { stageId: '104005', side: '7', effectiveTick } }
    const current = { ...frame([preview], tick), match: { matchId: preview.matchId },
      config: { mapSize: 19 } } as ReplicaFrame
    const p = { ...projection, catalog: { ...catalog, circleStages: new Map([[104005, 4]]) },
      tick: (value: string | null | undefined) => value ? Number(BigInt(value) - origin + 1n) : 0 }
    const result = projectOccurrences(current, 0n, p)
    expect(result.events).toEqual([{ type: 'RingShrinkAnnounced', presentationOnly: true,
      Tick: 2, StageIndex: 4, Next: { Min: 6, Max: 12 }, AtTick: 62,
      occurrenceId: `${preview.matchId}:${tick}:${preview.sequence}` }])
    expect(projectOccurrences(current, result.cursor, p).events).toEqual([])
    expect(projectOccurrences(current, null, p).events).toEqual([])
  })
  it('uses the event stage and side even after the latest replica has advanced past its preview', () => {
    const preview = { ...death, kind: 'circle_preview', data: { stageId: '104002', side: '13', effectiveTick: '161' } }
    const current = frame([preview])
    current.config = { mapSize: 19, tickRateHz: 20, groundLayer: 0, obstacleLayer: 1 }
    current.match!.finalCircle = { triggerTick: '1', triggerReason: 3, initialResourceCount: 100,
      remainingResourceCount: 1, currentStageId: 104003, nextStageId: 104004, currentSide: 9,
      nextSide: 7, nextAnnounceTick: '200', nextEffectiveTick: '260' }
    const p = { ...projection, catalog: { ...catalog, circleStages: new Map([[104002, 1], [104004, 3]]) } }
    expect(projectOccurrences(current, 0n, p).events[0]).toMatchObject({
      type: 'RingShrinkAnnounced', StageIndex: 1, Next: { Min: 3, Max: 15 }, AtTick: 161,
    })
  })
  it('does not invent a preview for an unknown stage or missing map projection', () => {
    const preview = { ...death, kind: 'circle_preview', data: { stageId: '104002', side: '13', effectiveTick: '161' } }
    const current = frame([preview])
    const p = { ...projection, catalog: { ...catalog, circleStages: new Map([[104002, 1]]) } }
    expect(projectOccurrences(current, 0n, p).events).toEqual([])
    current.config = { mapSize: 19, tickRateHz: 20, groundLayer: 0, obstacleLayer: 1 }
    expect(projectOccurrences(current, 0n, projection).events).toEqual([])
  })
  it('retains only the pickup cue for a settled health pack and does not label restores as regeneration', () => {
    const heal = { ...death, kind: 'heal_applied', entityId: 'ffffffffffffffff0000000000000003',
      data: { appliedPoints: '2', healthPointsBefore: '2', healthPointsLeft: '4', maximumHealth: '6',
        goldenHeartCount: '0', hatCount: '0', sourceLifeGeneration: '1' } }
    const pickup = { ...heal, kind: 'pickup_taken', sequence: '9007199254740998', data: { ...heal.data, pickupKind: '3' } }
    const restored = { ...heal, kind: 'health_restored', sequence: '9007199254740999', entityId: undefined }
    const current = frame([heal, pickup, restored])
    const live = projectOccurrences(current, 0n, projection)
    expect(live.events.map(event => event.type)).toEqual(['PickupTaken'])
    expect(live.events[0]).toMatchObject({ Kind: 3, PickerNetEntityIdRaw: projection.handle('player', heal.participantId) })
    expect(projectOccurrences(current, live.cursor, projection).events).toEqual([])
    expect(projectOccurrences(current, null, projection).events).toEqual([])
  })
  it('suppresses unknown and bound character candy notices but retains bomb and ordinary pickups', () => {
    const unknown = { ...death, kind: 'pickup_taken', data: { pickupKind: '4', skillId: '40003', skillLevel: '1' } }
    const ordinary = { ...unknown, sequence: '9007199254740998', data: { pickupKind: '3', skillId: '0', skillLevel: '0' } }
    const bound = { ...unknown, sequence: '9007199254740999', data: { pickupKind: '4', skillId: '3', skillLevel: '1' } }
    const bomb = { ...unknown, sequence: '90071992547409910', data: { pickupKind: '4', skillId: '6', skillLevel: '1' } }
    const result = projectOccurrences(frame([unknown, ordinary, bound, bomb]), 0n, projection)
    expect(result.events.map(event => event.type)).toEqual(['PickupTaken', 'PickupTaken'])
    expect(result.events[0]).toMatchObject({ Kind: 3 })
    expect(result.events[1]).toMatchObject({ Kind: 4, proto: { Skill: 'freezeBomb' } })
  })
  it('establishes a reconnect cursor without replaying retained kills', () => {
    const baseline = projectOccurrences(frame([death]), null, projection)
    expect(baseline.events).toEqual([])
    expect(baseline.cursor).toBe(9007199254740997n)
    const next = { ...death, sequence: '9007199254740998', tick: '102' }
    const live = projectOccurrences(frame([next, death], '102'), baseline.cursor, projection)
    expect(live.events).toHaveLength(1)
    expect(live.events[0]).toMatchObject({ type: 'PlayerDied', Tick: 102, Cell: { X: 3, Y: 4 },
      occurrenceId: '90:102:9007199254740998' })
    expect(projectOccurrences(frame([next, death], '102'), live.cursor, projection).events).toEqual([])
  })
  it('keeps match identities separate and defers future events until committed', () => {
    expect(projectOccurrences(frame([{ ...death, matchId: '89' }]), 0n, projection).events).toEqual([])
    expect(projectOccurrences(frame([death], '100'), 0n, projection)).toEqual({ cursor: 0n, events: [] })
    const live = projectOccurrences(frame([death]), 0n, projection).events[0]
    expect(live.type).toBe('PlayerDied')
    if (live.type !== 'PlayerDied') return
    expect(live.VictimNetEntityIdRaw).not.toBe(live.KillerNetEntityIdRaw)
    expect(live.ChainId).not.toBe(0)
  })
  it('uses captured cast origin and only the owner replica cooldown for teleport effects', () => {
    const event = { ...death, kind: 'skill_cast', data: { skillId: '3', skillLevel: '1', fromX: '1', fromZ: '4',
      untilTick: '0', cooldownUntilTick: '999' } }
    const ownFrame = frame([event])
    ownFrame.selfId = 'self-life'
    ownFrame.players = [{ id: 'self-life', participantId: event.participantId,
      skills: { cooldownUntilTick: '301' } }] as ReplicaFrame['players']
    expect(projectOccurrences(ownFrame, 0n, projection).events[0]).toMatchObject({
      type: 'SkillActivated', Skill: 'blink', Cell: { X: 1, Y: 4 }, ToCell: { X: 3, Y: 4 }, CdUntilTick: 301,
    })
    ownFrame.selfId = 'other-life'
    expect(projectOccurrences(ownFrame, 0n, projection).events[0]).toMatchObject({ CdUntilTick: 0 })
  })
  it.each([
    ['1', 1], ['2', 4], ['3', 2], ['4', 3],
  ])('projects kick direction %s and water effects once with separate kicker and owner handles', (direction, projected) => {
    const kick = { ...death, kind: 'bomb_kicked', entityId: 'bomb-1', data: { direction } }
    const extinguished = { ...death, kind: 'bomb_extinguished', sequence: '9007199254740998',
      participantId: death.sourceParticipantId, entityId: 'bomb-1', x: 5, z: 4, data: {} }
    const current = frame([kick, extinguished])
    const result = projectOccurrences(current, 0n, projection)
    expect(result.events[0]).toMatchObject({ type: 'BombKicked', Dir: projected, FromCell: { X: 3, Y: 4 },
      KickerNetEntityIdRaw: projection.handle('player', death.participantId), BombNetEntityIdRaw: projection.handle('entity', 'bomb-1') })
    expect(result.events[1]).toMatchObject({ type: 'BombExtinguished', Cell: { X: 5, Y: 4 },
      OwnerNetEntityIdRaw: projection.handle('player', death.sourceParticipantId) })
    expect(projectOccurrences(current, result.cursor, projection).events).toEqual([])
    expect(projectOccurrences(current, null, projection).events).toEqual([])
  })
})
