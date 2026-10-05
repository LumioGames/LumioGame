import { MatchPhase, PickupKind, type BombKind, type BombView, type CharacterId, type FinalCircleView,
  type MatchEndReason, type PlayerView, type SkillId, type SkillSlotView,
  type TerrainView, type WorldSnapshot, type ResourceBoxTier, type ResourceBoxView } from './contract'
import type { ReplicaFrame, ReplicaId, ReplicaOccurrence, ReplicaPlayer, ReplicaSkills, ReplicaTick } from './replica-types'
import { decodeFireRegionCells } from './fire-region-coverage'
import { projectOccurrences } from './replica-events'
import type { BomberEvent } from './contract'

export interface ReplicaCatalog {
  characters: ReadonlyMap<number, CharacterId>
  skills: ReadonlyMap<number, SkillId>
  bombSkills?: ReadonlySet<number>
  characterSkills?: ReadonlySet<number>
  candySkills?: ReadonlySet<number>
  circleStages?: ReadonlyMap<number, number>
  resourceTiers?: ReadonlyMap<number, ResourceBoxTier>
}

/** Handles belong to this renderer, never to the wire or gameplay inputs. */
export class ReplicaPresentationAdapter {
  private readonly handles = new Map<string, number>()
  private readonly seen = new Map<string, { life: string; teleport: string; tick: number; player: PlayerView }>()
  private nextHandle = 1
  private identity = ''
  private origin = 0n
  private localParticipant: string | null = null
  private latestTick = -Infinity
  private eventCursor: bigint | null = null

  constructor(private readonly catalog: ReplicaCatalog) {}

  get localPlayerId(): number { return this.localParticipant ? this.handle('player', this.localParticipant) : 0 }
  get matchIdentity(): string { return this.identity }

  reset(): void {
    this.handles.clear()
    this.seen.clear()
    this.nextHandle = 1
    this.identity = ''
    this.origin = 0n
    this.localParticipant = null
    this.latestTick = -Infinity
    this.eventCursor = null
  }

  handle(kind: string, id: string | null | undefined): number {
    if (!id || /^0+$/.test(id)) return 0
    const key = `${kind}:${id}`
    const existing = this.handles.get(key)
    if (existing !== undefined) return existing
    const value = this.nextHandle++
    this.handles.set(key, value)
    return value
  }

  private tick(value: ReplicaTick | null | undefined): number {
    if (!value || value === '0') return 0
    const relative = BigInt(value) - this.origin + 1n
    const result = Number(relative)
    if (!Number.isSafeInteger(result)) throw new Error('presentation_tick_span_unsafe')
    return result
  }

  private slot(id: number, level: number, bound: boolean, kind: 'bomb' | 'character'): SkillSlotView | null {
    const allowed = kind === 'bomb' ? this.catalog.bombSkills : this.catalog.characterSkills
    if (allowed && !allowed.has(id)) return null
    const skill = this.catalog.skills.get(id)
    return skill && level > 0 ? { skill, level, bound } : null
  }

  events(frame: ReplicaFrame): BomberEvent[] {
    const projected = projectOccurrences(frame, this.eventCursor, {
      handle: (kind, id) => this.handle(kind, id), tick: value => this.tick(value), catalog: this.catalog,
    })
    this.eventCursor = projected.cursor
    return projected.events
  }

  private skills(row: ReplicaPlayer, teleportTick: number, activeCastTick: number): PlayerView['skills'] {
    const s: ReplicaSkills = row.skills
    return {
      character: this.catalog.characters.get(s.characterId) ?? null,
      facing: ([0, 1, 4, 2, 3][row.facing] ?? 0) as 0 | 1 | 2 | 3 | 4,
      slots: {
        bomb: this.slot(s.bombSkillId, s.bombSkillLevel, s.bombSkillBound, 'bomb'),
        active: this.slot(s.activeSkillId, s.activeSkillLevel, s.activeSkillBound, 'character'),
        passive: this.slot(s.passiveSkillId, s.passiveSkillLevel, s.passiveSkillBound, 'character'),
      },
      cdFromTick: this.tick(s.cooldownFromTick), cdUntilTick: this.tick(s.cooldownUntilTick),
      activeCastTick,
      bubbleUntilTick: this.tick(s.bubbleUntilTick), auraUntilTick: this.tick(s.auraUntilTick),
      frozenUntilTick: this.tick(s.frozenUntilTick), toxinUntilTick: this.tick(s.toxinUntilTick),
      shockUntilTick: this.tick(s.shockUntilTick),
      // Server-only regen timing is intentionally unavailable to the HUD.
      regenFromTick: 0, regenNextTick: 0, blinkTick: teleportTick,
    }
  }

  project(frame: ReplicaFrame, terrain: TerrainView): WorldSnapshot | null {
    const match = frame.match
    if (!match || !frame.config) return null
    const results = frame.results?.matchId === match.matchId ? frame.results : null
    const identity = `${match.id}:${match.matchId}`
    if (identity !== this.identity) {
      this.reset()
      this.identity = identity
      this.origin = BigInt(match.startTick !== '0' ? match.startTick : frame.tick)
    }
    const tick = this.tick(frame.tick)
    if (tick < this.latestTick) throw new Error('presentation_tick_regressed')
    this.latestTick = tick
    const self = frame.players.find(p => p.id === frame.selfId)
    if (self) this.localParticipant = self.participantId
    else if (frame.selfId) {
      const seat = frame.participants.find(p => (p.id === frame.selfId && p.matchId === match.matchId)
        || p.currentLife === frame.selfId || p.lastLife === frame.selfId)
      if (seat) this.localParticipant = seat.id
    }
    const byParticipant = new Map(frame.players.map(p => [p.participantId, p]))
    const casts = new Map<string, ReplicaOccurrence>()
    for (const text of frame.events ?? []) {
      const event = JSON.parse(text) as ReplicaOccurrence
      if (event.version !== 1 || event.kind !== 'skill_cast' || event.matchId !== match.matchId ||
        !event.participantId || !event.lifeId || !event.lifeGeneration || BigInt(event.tick) > BigInt(frame.tick)) continue
      const castLife = `${event.participantId}:${event.lifeId}:${event.lifeGeneration}`
      const prior = casts.get(castLife)
      if (!prior || BigInt(event.sequence) > BigInt(prior.sequence)) casts.set(castLife, event)
    }
    const players: PlayerView[] = []
    for (const seat of frame.participants) {
      if (seat.matchId !== match.matchId) continue
      const row = byParticipant.get(seat.id)
      const prior = this.seen.get(seat.id)
      if (!row && !prior && seat.lifePhase <= 1) continue
      if (!row) {
        // A late join can see a durable seat before any of its lives. Zero health
        // keeps the unknown pose off the board while retaining its HUD row.
        const result = results?.rows.find(r => r.participant === seat.id)
        const character = this.catalog.characters.get(result?.character
          ?? frame.statistics?.find(s => s.participant === seat.id)?.character ?? 0)
        const old: PlayerView = prior?.player ?? {
          NetEntityIdRaw: this.handle('player', seat.id),
          LogicTransform: { WorldPosition: { x: 0, y: 0, z: 0 } }, teleportTick: 0,
          BomberPlayerState: { HatCount: result?.finalHats ?? 0, RespawnAtTick: 0, ProtectedUntilTick: 0 },
          玩家属性: { 血量当前: 0, 火力当前: 0, 移速当前: 0, 手上炸弹数当前: 0 },
          meta: { name: `Player ${seat.slot + 1}`, isBot: false,
            animal: character ?? 'duck', slot: seat.slot },
          eliminated: seat.lifePhase === 3,
        }
        const retained: PlayerView = { ...old,
          meta: { ...old.meta, animal: character ?? old.meta.animal },
          BomberPlayerState: { ...old.BomberPlayerState, RespawnAtTick: this.tick(seat.respawnAtTick) },
          玩家属性: { ...old.玩家属性, 血量当前: seat.lifePhase <= 1 ? old.玩家属性.血量当前 : 0 },
          positionKnown: false,
          eliminated: seat.lifePhase === 3, eliminatedTick: this.tick(seat.eliminatedTick),
        }
        players.push(retained)
        if (prior) this.seen.set(seat.id, { ...prior, player: retained })
        continue
      }
      const currentLife = `${seat.id}:${row.id}:${row.lifeGeneration}`
      const changedLife = prior !== undefined && prior.life !== currentLife
      const changedTeleport = prior !== undefined && prior.teleport !== row.skills.teleportSequence
      const teleportTick = changedLife || changedTeleport || prior?.player.positionKnown === false ? tick : prior?.tick ?? 0
      const character = this.catalog.characters.get(row.skills.characterId)
      const cast = casts.get(currentLife)
      const sameSkill = prior?.player.skills?.slots.active?.skill === this.catalog.skills.get(row.skills.activeSkillId)
      const castTick = cast && cast.participantId === seat.id && Number(cast.data?.skillId) === row.skills.activeSkillId
        ? this.tick(cast.tick) : changedLife || !sameSkill ? 0 : prior?.player.skills?.activeCastTick ?? 0
      const player: PlayerView = {
        NetEntityIdRaw: this.handle('player', seat.id),
        LogicTransform: { WorldPosition: { x: row.x, y: row.y, z: row.z } }, teleportTick,
        BomberPlayerState: { HatCount: row.hatCount, RespawnAtTick: this.tick(row.respawnAtTick),
          ProtectedUntilTick: this.tick(row.protectedUntilTick) },
        maxHealth: row.maximumHealth, goldHearts: row.goldenHeartCount,
        玩家属性: { 血量当前: row.attributes.health, 火力当前: row.attributes.power,
          移速当前: row.attributes.speed, 手上炸弹数当前: row.attributes.availableBombs },
        ...(row.baseAttributes ? { 玩家属性基础: {
          血量基础: row.baseAttributes.health, 火力基础: row.baseAttributes.power,
          移速基础: row.baseAttributes.speed, 手上炸弹数基础: row.baseAttributes.availableBombs,
        } } : {}),
        meta: { name: row.name || `Player ${seat.slot + 1}`, isBot: false,
          animal: character ?? 'duck', slot: seat.slot },
        eliminated: row.lifePhase === 3, eliminatedTick: this.tick(row.eliminatedTick),
        skills: this.skills(row, changedLife ? 0 : changedTeleport ? teleportTick : prior?.player.skills?.blinkTick ?? 0, castTick),
      }
      this.seen.set(seat.id, { life: currentLife, teleport: row.skills.teleportSequence, tick: teleportTick, player })
      players.push(player)
    }
    const entity = (row: { id: ReplicaId; x: number; y: number; z: number }) => ({
      NetEntityIdRaw: this.handle('entity', row.id),
      LogicTransform: { WorldPosition: { x: row.x, y: row.y, z: row.z } }, teleportTick: 0,
    })
    const bombs: BombView[] = frame.bombs.filter(b => b.phase <= 2).map(b => ({
      ...entity(b),
      kicking: b.phase === 0 && b.kickDirection >= 1 && b.kickDirection <= 4,
      BomberBombState: { OwnerNetEntityIdRaw: this.handle('player', b.owner),
        FuseEndTick: this.tick(b.fuseEndTick), Power: b.power, ChainId: this.handle('chain', b.chainId),
        BombKind: b.bombKind as BombKind, PierceLayers: b.pierceLayers,
        ExplodedAtTick: this.tick(b.explodedAtTick), DangerUntilTick: this.tick(b.dangerUntilTick),
        BurnUntilTick: this.tick(b.burnUntilTick), ReachUp: b.reachUp, ReachDown: b.reachDown,
        ReachLeft: b.reachLeft, ReachRight: b.reachRight },
      // Kick motion already exists in LogicTransform; do not integrate it again here.
    }))
    const circle = match.finalCircle
    const ring = (side: number) => ({ Min: Math.floor((terrain.size - side) / 2), Max: Math.floor((terrain.size + side) / 2) - 1 })
    const finalCircle: FinalCircleView | null = circle && circle.triggerTick !== '0' && circle.currentSide > 0 ? {
      trigger: circle.triggerReason === 4 ? 'resource' : 'time', startTick: this.tick(circle.triggerTick),
      endTick: this.tick(match.endTick !== '0' ? match.endTick : match.phaseEndTick), ring: ring(circle.currentSide),
      nextRing: circle.nextSide > 0 && tick >= this.tick(circle.nextAnnounceTick) ? ring(circle.nextSide) : null,
      nextRingTick: this.tick(circle.nextEffectiveTick), stageIndex: this.catalog.circleStages?.get(circle.currentStageId) ?? -1,
      aliveCount: match.survivorCount,
    } : null
    const reason = (code: number): MatchEndReason => code === 1 ? 'lastSurvivor' : code === 2 ? 'allDown' : 'timeUp'
    const resourceBoxes: ResourceBoxView[] = frame.chests.filter(c => c.resourceTier !== 0).map(c => {
      const tier = this.catalog.resourceTiers?.get(c.resourceTier)
      if (!tier) throw new Error(`presentation_resource_tier_unknown:${c.resourceTier}`)
      return { Cell: { X: Math.floor(c.x), Y: Math.floor(c.z) }, tier,
        HitsLeft: c.remainingHits, HitsRequired: c.requiredHits }
    })
    return {
      Tick: tick, Terrain: terrain, Players: players, Bombs: bombs, HatPiles: [],
      ResourceBoxes: resourceBoxes,
      Pickups: frame.pickups.filter(p => p.phase === 0 && (p.kind !== PickupKind.SkillCandy
        || (p.skillLevel > 0 && this.catalog.candySkills?.has(p.skillId) === true
          && this.catalog.skills.has(p.skillId)))).map(p => ({ ...entity(p),
        BomberPickupItem: { Kind: p.kind as PickupKind }, droppedBy: this.handle('player', p.droppedBy),
        protectedUntilTick: this.tick(p.protectedUntilTick),
        ...(p.kind === PickupKind.SkillCandy ? { skill: { id: this.catalog.skills.get(p.skillId)!, level: p.skillLevel } } : {}),
      })),
      Chests: [...frame.chests.filter(c => c.resourceTier === 0 && c.remainingHits > 0).map(c => ({ ...entity(c),
        chest: { HitsLeft: c.remainingHits, HitsRequired: c.requiredHits,
          StageIndex: this.catalog.circleStages?.get(circle?.currentStageId ?? 0) ?? -1 } })),
        ...(terrain.chestCells ?? []).filter(cell => !frame.chests.some(c => Math.floor(c.x) === cell.X && Math.floor(c.z) === cell.Y))
          .map(cell => ({ NetEntityIdRaw: this.handle('chest-cell', `${cell.X},${cell.Y}`),
            LogicTransform: { WorldPosition: { x: cell.X + 0.5, y: 1, z: cell.Y + 0.5 } }, teleportTick: 0,
            chest: { HitsLeft: null, HitsRequired: null, StageIndex: this.catalog.circleStages?.get(circle?.currentStageId ?? 0) ?? -1 } })),
      ],
      FireZones: frame.fireZones.filter(z => this.tick(z.untilTick) > tick && (!z.regionCoverage || (z.phase === 1 && this.tick(z.fromTick) <= tick))).map(z => {
        const direction = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]][z.direction] ?? [0, 0]
        return { owner: this.handle('player', z.owner), source: z.regionCoverage ? 'fireRegion' as const : 'firewall' as const,
          cells: z.regionCoverage ? decodeFireRegionCells(Math.floor(z.x), Math.floor(z.z), z.coverageMask) :
            Array.from({ length: z.length }, (_, i) => ({ X: Math.floor(z.x) + i * direction[0], Y: Math.floor(z.z) + i * direction[1] })),
          untilTick: this.tick(z.untilTick),
          ...(z.regionCoverage ? { region: { id: z.id, life: z.sourceLife!, participant: z.owner!,
            generation: z.sourceGeneration!, match: z.sourceMatchId!, chain: z.sourceChainId!, mask: z.coverageMask!,
            fromTick: z.fromTick, untilTick: z.untilTick } } : {}) }
      }),
      statistics: (results?.rows ?? frame.statistics ?? []).map(s => ({
        id: this.handle('player', s.participant), kills: s.kills, bombs: s.bombs,
        destroyedBlocks: s.destroyedBlocks, pickups: s.pickups, bestChain: s.bestChain,
        peakHats: s.peakHats, skillCasts: s.skillCasts, evolutions: s.evolutions,
        hatKingTicks: Number(BigInt(s.hatKingTicks)),
        character: this.catalog.characters.get(s.character) ?? null,
        deaths: s.deaths, peakHealthPoints: s.peakHealthPoints, bossKills: s.bossKills,
        clutchEscapes: s.clutchEscapes, goldenHeartPickups: s.goldenHeartPickups,
        specialBombHistory: [...new Set(s.specialBombHistory.flatMap(id => {
          const skill = this.catalog.skills.get(id)
          return skill && this.catalog.bombSkills?.has(id) ? [skill] : []
        }))],
      })),
      BomberMatchState: { MatchTick: tick, StartTick: this.tick(match.startTick), EndTick: this.tick(match.endTick),
        Phase: match.phase < 2 ? MatchPhase.Warmup : match.phase === 2 ? MatchPhase.Running : match.phase === 3 ? MatchPhase.Endgame : MatchPhase.Settlement,
        HatKingNetEntityIdRaw: this.handle('player', match.hatKing) },
      match: { matchIndex: this.handle('match', match.matchId), phaseEndTick: this.tick(match.phaseEndTick),
        tickRateHz: frame.config.tickRateHz, resourceInitial: circle?.initialResourceCount ?? 0,
        resourceRemaining: circle?.remainingResourceCount ?? 0, finalCircle,
        results: results ? { reason: reason(results.endReason), winner: this.handle('player', results.winner),
          rows: [...results.rows].sort((a, b) => a.rank - b.rank || a.slot - b.slot).map((r, i) => ({
            id: this.handle('player', r.participant), rank: r.rank, place: i + 1, survived: r.survived,
            hats: r.finalHats, eliminatedTick: this.tick(r.eliminatedTick),
          })) } : null },
    }
  }
}

export function createReplicaAdapter(catalog: ReplicaCatalog): ReplicaPresentationAdapter {
  return new ReplicaPresentationAdapter(catalog)
}
