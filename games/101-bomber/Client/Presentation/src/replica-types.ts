/** Read-only JSON projected by the production C# replica. IDs never become JS numbers. */
export type ReplicaId = string
export type ReplicaTick = string

export interface ReplicaPose { id: ReplicaId; x: number; y: number; z: number }
export interface ReplicaAttributes { health: number; power: number; speed: number; availableBombs: number }
export interface ReplicaSkills {
  characterId: number
  bombSkillId: number; bombSkillLevel: number; bombSkillBound: boolean
  activeSkillId: number; activeSkillLevel: number; activeSkillBound: boolean
  passiveSkillId: number; passiveSkillLevel: number; passiveSkillBound: boolean
  cooldownFromTick?: ReplicaTick | null; cooldownUntilTick?: ReplicaTick | null
  bubbleUntilTick: ReplicaTick; auraUntilTick: ReplicaTick; frozenUntilTick: ReplicaTick
  toxinUntilTick: ReplicaTick; shockUntilTick: ReplicaTick; teleportSequence: ReplicaTick
}
export interface ReplicaPlayer extends ReplicaPose {
  name: string | null; participantId: ReplicaId; participantIndex: number
  lifePhase: number; lifeGeneration: ReplicaTick; facing: number; hatCount: number
  maximumHealth: number; goldenHeartCount: number
  respawnAtTick: ReplicaTick; protectedUntilTick: ReplicaTick; eliminatedTick: ReplicaTick
  attributes: ReplicaAttributes; baseAttributes?: ReplicaAttributes | null; skills: ReplicaSkills
}
export interface ReplicaParticipant {
  id: ReplicaId; slot: number; matchId: ReplicaTick; currentLife: ReplicaId | null
  lastLife: ReplicaId | null; lifePhase: number; deathTick: ReplicaTick
  respawnAtTick: ReplicaTick; eliminatedTick: ReplicaTick
}
export interface ReplicaBomb extends ReplicaPose {
  owner: ReplicaId | null; fuseEndTick: ReplicaTick; power: number; chainId: ReplicaTick
  bombKind: number; pierceLayers: number; phase: number; explodedAtTick: ReplicaTick
  dangerUntilTick: ReplicaTick; burnUntilTick: ReplicaTick
  reachUp: number; reachDown: number; reachLeft: number; reachRight: number
  kickDirection: number; kickRange: number; kickStartTick: ReplicaTick
}
export interface ReplicaPickup extends ReplicaPose {
  kind: number; skillId: number; skillLevel: number; droppedBy: ReplicaId | null
  protectedUntilTick: ReplicaTick; spawnTick: ReplicaTick; phase: number
}
export interface ReplicaChest extends ReplicaPose { requiredHits: number; remainingHits: number; resourceTier: number; phase: number }
export interface ReplicaFireZone extends ReplicaPose {
  owner: ReplicaId | null; sourceSkill: number; fromTick: ReplicaTick; untilTick: ReplicaTick
  direction: number; length: number; phase: number
  regionCoverage?: boolean; coverageMask?: number
  sourceLife?: ReplicaId | null; sourceGeneration?: ReplicaTick
  sourceMatchId?: ReplicaTick; sourceChainId?: ReplicaTick
}
export interface ReplicaCircle {
  triggerTick: ReplicaTick; triggerReason: number; initialResourceCount: number
  remainingResourceCount: number; currentStageId: number; nextStageId: number
  currentSide: number; nextSide: number; nextAnnounceTick: ReplicaTick; nextEffectiveTick: ReplicaTick
}
export interface ReplicaMatch {
  id: ReplicaId; matchId: ReplicaTick; matchIndex: ReplicaTick; phase: number
  startTick: ReplicaTick; endTick: ReplicaTick; phaseEndTick: ReplicaTick
  hatKing: ReplicaId | null; winner: ReplicaId | null; endReason: number; survivorCount: number
  finalCircle?: ReplicaCircle | null
}
export interface ReplicaResultRow {
  participant: ReplicaId; life: ReplicaId | null; slot: number; rank: number
  survived: boolean; finalHats: number; eliminatedTick: ReplicaTick; character: number
  kills: number; bombs: number; destroyedBlocks: number; pickups: number
  bestChain: number; peakHats: number; skillCasts: number; evolutions: number; hatKingTicks: ReplicaTick
  deaths: number; peakHealthPoints: number; bossKills: number; clutchEscapes: number
  goldenHeartPickups: number; specialBombHistory: number[]
}
export interface ReplicaResults {
  matchId: ReplicaTick; endTick: ReplicaTick; endReason: number
  winner: ReplicaId | null; rows: ReplicaResultRow[]
}
export interface ReplicaStatistics {
  participant: ReplicaId; kills: number; bombs: number; destroyedBlocks: number; pickups: number
  bestChain: number; peakHats: number; skillCasts: number; evolutions: number; hatKingTicks: ReplicaTick
  character: number; deaths: number; peakHealthPoints: number; bossKills: number; clutchEscapes: number
  goldenHeartPickups: number; specialBombHistory: number[]
}
export interface ReplicaConfig {
  mapSize: number; groundLayer: number; obstacleLayer: number; tickRateHz: number
  [key: string]: unknown
}
export interface ReplicaFrame {
  tick: ReplicaTick; selfId: ReplicaId | null; match: ReplicaMatch | null
  players: ReplicaPlayer[]; participants: ReplicaParticipant[]; bombs: ReplicaBomb[]
  pickups: ReplicaPickup[]; chests: ReplicaChest[]; fireZones: ReplicaFireZone[]
  results?: ReplicaResults | null; config: ReplicaConfig | null
  statistics?: ReplicaStatistics[]
  events?: string[]
}

export interface ReplicaOccurrence {
  version: number; kind: string; matchId: ReplicaTick; tick: ReplicaTick; sequence: ReplicaTick
  participantId?: ReplicaId; lifeId?: ReplicaId; sourceParticipantId?: ReplicaId; sourceLifeId?: ReplicaId
  lifeGeneration?: ReplicaTick
  entityId?: ReplicaId; x?: number; z?: number; cause?: string; data?: Record<string, string>
}
