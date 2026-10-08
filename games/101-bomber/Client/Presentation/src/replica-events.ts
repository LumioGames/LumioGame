import { DeathCause, PickupKind, type BomberEvent } from './contract'
import type { ReplicaCatalog } from './replica-adapter'
import type { ReplicaFrame, ReplicaOccurrence } from './replica-types'

interface Projection {
  handle(kind: string, id: string | null | undefined): number
  tick(value: string | null | undefined): number
  catalog: ReplicaCatalog
}

/** Baselines establish a cursor; reconnects never replay the retained kill feed. */
export function projectOccurrences(frame: ReplicaFrame, cursor: bigint | null, p: Projection): {
  cursor: bigint; events: BomberEvent[]
} {
  const rows: ReplicaOccurrence[] = (frame.events ?? []).map(text => JSON.parse(text) as ReplicaOccurrence)
    .filter(e => e.version === 1 && e.matchId === frame.match?.matchId && BigInt(e.tick) <= BigInt(frame.tick))
    .sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0)
  let next = cursor ?? 0n
  const events: BomberEvent[] = []
  for (const e of rows) {
    const sequence = BigInt(e.sequence)
    if (sequence <= next) continue
    next = sequence
    if (cursor === null) continue
    const event = project(e, frame, p)
    if (event) events.push({ ...event, occurrenceId: `${e.matchId}:${e.tick}:${e.sequence}` })
  }
  return { cursor: next, events }
}

function project(e: ReplicaOccurrence, frame: ReplicaFrame, p: Projection): BomberEvent | null {
  const d = e.data ?? {}
  const n = (key: string): number => {
    const value = Number(d[key] ?? 0)
    if (!Number.isSafeInteger(value)) throw new Error(`presentation_event_number_invalid:${key}`)
    return value
  }
  const Tick = p.tick(e.tick), Cell = { X: e.x ?? 0, Y: e.z ?? 0 }
  const actor = p.handle('player', e.participantId), source = p.handle('player', e.sourceParticipantId)
  const entity = p.handle('entity', e.entityId), chain = p.handle('chain', d.chainId)
  const cause = ({ explosion: DeathCause.Bomb, drown: DeathCause.Drown, fire: DeathCause.Burn,
    ring_poison: DeathCause.Poison, toxin: DeathCause.Toxin } as Record<string, number>)[e.cause ?? ''] ?? DeathCause.Bomb
  switch (e.kind) {
    case 'fire_region_born':
    case 'fire_region_expired': {
      if (!e.entityId || !e.participantId || !e.lifeId || !e.lifeGeneration || !d.fromTick || !d.untilTick ||
        !d.chainId || !d.mask || n('skillId') !== 4 || n('skillLevel') <= 0 || n('mask') < 0 || n('mask') > 511)
        throw new Error('fire_region_event_identity_invalid')
      return { type: e.kind === 'fire_region_born' ? 'FireRegionBorn' : 'FireRegionExpired', Tick,
        Region: e.entityId, Source: { Participant: e.participantId, Life: e.lifeId, LifeGeneration: e.lifeGeneration },
        MatchId: e.matchId, ChainId: d.chainId, SkillId: 4, SkillLevel: n('skillLevel'),
        Center: Cell, Mask: n('mask'), FromTick: d.fromTick, UntilTick: d.untilTick }
    }
    case 'match_started': return { type: 'MatchStarted', presentationOnly: true, Tick,
      MatchIndex: p.handle('match', e.matchId) }
    case 'bomb_placed': return { type: 'BombPlaced', Tick, Cell, OwnerNetEntityIdRaw: actor,
      FuseEndTick: p.tick(d.fuseEndTick), proto: { BombNetEntityIdRaw: entity } }
    case 'bomb_kicked': return { type: 'BombKicked', presentationOnly: true, Tick,
      BombNetEntityIdRaw: entity, KickerNetEntityIdRaw: actor, FromCell: Cell,
      Dir: ([0, 1, 4, 2, 3][n('direction')] ?? 0) as 0 | 1 | 2 | 3 | 4 }
    case 'bomb_extinguished': return { type: 'BombExtinguished', presentationOnly: true, Tick,
      OwnerNetEntityIdRaw: actor, Cell }
    case 'bomb_exploded': {
      const bomb = frame.bombs.find(b => b.id === e.entityId)
      const cells = d.cellCount ? n('cellCount') : bomb ? 1 + bomb.reachUp + bomb.reachDown + bomb.reachLeft + bomb.reachRight : 0
      return { type: 'BombExploded', Tick, ChainId: chain, SourceBombOwnerNetEntityIdRaw: actor, CellCount: cells,
        proto: { BombNetEntityIdRaw: entity, Cell, IndexInChain: n('indexInChain') } }
    }
    case 'damage_applied': return { type: 'DamageApplied', Tick, VictimNetEntityIdRaw: actor,
      SourceBombNetEntityIdRaw: entity, SourceBombOwnerNetEntityIdRaw: source, ChainId: chain,
      HealthPointsLeft: n('healthPointsLeft'), proto: { Cause: cause as DeathCause, Points: n('appliedPoints') } }
    case 'death': return { type: 'PlayerDied', Tick, VictimNetEntityIdRaw: actor,
      KillerNetEntityIdRaw: source || actor, Cause: cause as DeathCause, ChainId: chain, Cell }
    case 'respawn': return { type: 'PlayerRespawned', Tick, Cell, NetEntityIdRaw: actor }
    case 'pickup_taken': {
      const kind = n('pickupKind') as PickupKind
      const skillId = n('skillId')
      const skill = p.catalog.skills.get(skillId)
      const level = n('skillLevel')
      if (kind === PickupKind.SkillCandy && (!skill || level <= 0 || !p.catalog.candySkills?.has(skillId))) return null
      return { type: 'PickupTaken', Tick, PickerNetEntityIdRaw: actor,
        Kind: kind, proto: { PickupNetEntityIdRaw: entity, Cell, Skill: skill, SkillLevel: level } }
    }
    case 'hat_king_changed': return { type: 'HatKingChanged', Tick,
      PreviousHatKingNetEntityIdRaw: source, NewHatKingNetEntityIdRaw: actor }
    case 'chest_hit': return n('resourceTier') === 0 ? { type: 'ChestHit', presentationOnly: true, Tick,
      ChestNetEntityIdRaw: entity, HitsLeft: n('remainingHits'), SourceBombOwnerNetEntityIdRaw: source, ChainId: chain } : null
    case 'final_chest_opened': return n('resourceTier') === 0 ? { type: 'ChestOpened', presentationOnly: true, Tick,
      ChestNetEntityIdRaw: entity, Cell, OpenerNetEntityIdRaw: source } : null
    case 'skill_cast': {
      const Skill = p.catalog.skills.get(n('skillId'))
      if (!Skill) return null
      const player = frame.players.find(row => row.id === frame.selfId && row.participantId === e.participantId)
      return { type: 'SkillActivated', presentationOnly: true, Tick, PlayerNetEntityIdRaw: actor,
        Skill, Level: n('skillLevel'), Cell: { X: d.fromX === undefined ? Cell.X : n('fromX'), Y: d.fromZ === undefined ? Cell.Y : n('fromZ') },
        ToCell: Cell, UntilTick: p.tick(d.untilTick), CdUntilTick: p.tick(player?.skills.cooldownUntilTick) }
    }
    case 'final_circle_start': return { type: 'FinalCircleStarted', presentationOnly: true, Tick,
      Trigger: e.cause === 'resource' ? 'resource' : 'time', EndTick: p.tick(d.endTick) }
    case 'circle_preview': {
      const StageIndex = p.catalog.circleStages?.get(n('stageId')), size = frame.config?.mapSize
      if (StageIndex === undefined || size === undefined) return null
      const side = n('side')
      return { type: 'RingShrinkAnnounced', presentationOnly: true, Tick, StageIndex,
        Next: { Min: Math.floor((size - side) / 2), Max: Math.floor((size + side) / 2) - 1 },
        AtTick: p.tick(d.effectiveTick) }
    }
    case 'match_end': return { type: 'MatchEnded', Tick, proto: {
      Reason: e.cause === 'LastSurvivor' ? 'lastSurvivor' : e.cause === 'SimultaneousElimination' ? 'allDown' : 'timeUp',
      WinnerNetEntityIdRaw: actor } }
    default: return null
  }
}
