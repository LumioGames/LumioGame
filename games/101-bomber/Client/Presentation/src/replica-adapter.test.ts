import { describe, expect, it } from 'vitest'
import { createReplicaAdapter } from './replica-adapter'
import { ReplicaTerrain } from './replica-terrain'
import { flyKickPhase } from './view/world/skill-fx'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES } from './contract'
import { skillHudModel } from './present/skill-hud'
import { HudBrain } from './hud/hud-brain'
import { batch } from './hud/__tests__/fixtures'
import type { ReplicaFrame, ReplicaPlayer } from './replica-types'

const participant = 'ffffffffffffffff0000000000000001'
const life = 'ffffffffffffffff0000000000000002'
const tick = '18446744073709550000'
const later = (delta: number) => String(BigInt(tick) + BigInt(delta))
function fixture(): ReplicaFrame {
  const player: ReplicaPlayer = { id: life, x: 3.5, y: 1, z: 4.5, name: 'Player A',
    participantId: participant, participantIndex: 0, lifePhase: 1, lifeGeneration: '1', facing: 2,
    hatCount: 5, maximumHealth: 6, goldenHeartCount: 0,
    respawnAtTick: '0', protectedUntilTick: '0', eliminatedTick: '0',
    attributes: { health: 4, power: 3, speed: 3850, availableBombs: 2 },
    skills: { characterId: 118003, bombSkillId: 0, bombSkillLevel: 0, bombSkillBound: false,
      activeSkillId: 3, activeSkillLevel: 1, activeSkillBound: true,
      passiveSkillId: 0, passiveSkillLevel: 0, passiveSkillBound: false,
      cooldownFromTick: tick, cooldownUntilTick: later(200), bubbleUntilTick: '0', auraUntilTick: '0',
      frozenUntilTick: '0', toxinUntilTick: '0', shockUntilTick: '0', teleportSequence: '0' } }
  return { tick, selfId: life, players: [player],
    participants: [{ id: participant, slot: 0, matchId: '42', currentLife: life, lastLife: null,
      lifePhase: 1, deathTick: '0', respawnAtTick: '0', eliminatedTick: '0' }],
    match: { id: 'ffffffffffffffff0000000000000000', matchId: '42', matchIndex: '9', phase: 2,
      startTick: tick, endTick: later(8400), phaseEndTick: later(6100), hatKing: participant,
      winner: null, endReason: 0, survivorCount: 8 },
    bombs: [], pickups: [], chests: [], fireZones: [], config: { mapSize: 19, tickRateHz: 20, groundLayer: 0, obstacleLayer: 1 } }
}
const terrain = { size: 19, ground: new Uint8Array(361).fill(6), brick: new Uint8Array(361), rev: 1 }
const adapter = () => createReplicaAdapter({ characters: new Map([[118003, 'cat']]), skills: new Map([[3, 'blink']]) })

describe('production replica presentation', () => {
  it.each([2, 3])('binds a fresh observing participant Self in life phase %i without inventing a live pose', lifePhase => {
    const a = adapter(), f = fixture()
    f.selfId = participant; f.players = []
    Object.assign(f.participants[0], { currentLife: null, lastLife: life, lifePhase })
    const out = a.project(f, terrain)!
    expect(out.Players).toHaveLength(1)
    expect(a.localPlayerId).toBe(out.Players[0].NetEntityIdRaw)
    expect(out.Players[0].positionKnown).toBe(false)
    expect(out.Players[0].玩家属性.血量当前).toBe(0)
    expect(out.Players[0].eliminated).toBe(lifePhase === 3)
  })

  it('does not bind a participant Self from another match', () => {
    const a = adapter(), f = fixture()
    f.selfId = participant; f.players = []
    Object.assign(f.participants[0], { matchId: '41', currentLife: null, lastLife: life, lifePhase: 3 })
    expect(a.project(f, terrain)!.Players).toEqual([])
    expect(a.localPlayerId).toBe(0)
  })

  it('decodes region masks including empty without guessing a line and preserves full original identity', () => {
    const a = adapter(), f = fixture()
    const id = 'ffffffffffffffff0000000000000009'
    f.fireZones = [{ id, x: 5.5, y: 1.5, z: 6.5, owner: participant,
      sourceSkill: 4, fromTick: tick, untilTick: later(20), direction: 0, length: 3, phase: 1,
      regionCoverage: true, coverageMask: 0, sourceLife: life, sourceGeneration: '18446744073709551599',
      sourceMatchId: '42', sourceChainId: '18446744073709551600' }]
    const empty = a.project(f, terrain)!.FireZones?.[0]
    if (!empty) throw new Error('Expected empty region projection')
    expect(empty.source).toBe('fireRegion'); expect(empty.cells).toEqual([])
    expect(empty.region).toEqual({ id, participant, life, generation: '18446744073709551599', match: '42',
      chain: '18446744073709551600', mask: 0, fromTick: tick, untilTick: later(20) })
    f.fireZones[0].coverageMask = 17
    const covered = a.project(f, terrain)!.FireZones?.[0]
    if (!covered) throw new Error('Expected covered region projection')
    expect(covered.cells).toEqual([{ X: 4, Y: 5 }, { X: 5, Y: 6 }])
    f.tick = later(20); expect(a.project(f, terrain)!.FireZones).toEqual([])
  })

  it('uses committed resource tiers for crate meshes without spending strong-chest slots', () => {
    const catalog = { characters: new Map([[118003, 'cat' as const]]), skills: new Map([[3, 'blink' as const]]),
      resourceTiers: new Map([[113005, 'wood' as const], [113006, 'iron' as const], [113007, 'gold' as const]]) }
    const a = createReplicaAdapter(catalog), f = fixture()
    f.chests = [0, 1, 2].map(x => ({ id: `resource-${x}`, x: x + 0.5, y: 1, z: 0.5,
      resourceTier: 113005 + x, remainingHits: 1, requiredHits: x === 2 ? 2 : 1, phase: 0 }))
    const t = new ReplicaTerrain(3, 0, 1, [{ blockType: 1022, name: 'floor' }, { blockType: 1028, name: 'chest' }])
    const grid = { readSurface: (box: { minY: number }) => ({ width: 3, depth: 3,
      states: new Uint8Array(9).fill(2), blockIds: new Uint32Array(9).fill((box.minY === 0 ? 1022 : 1028) << 8) }) }
    const unknown = t.read(grid)!
    const bound = t.read(grid, f.chests)!
    expect(bound.rev).toBeGreaterThan(unknown.rev)
    expect([...bound.brick.slice(0, 3)]).toEqual([BlockType.木箱, BlockType.木箱, BlockType.木箱])
    expect(bound.chestCells).toHaveLength(6)
    const snapshot = a.project(f, bound)!
    expect(snapshot.ResourceBoxes?.map(row => row.tier)).toEqual(['wood', 'iron', 'gold'])
    expect(snapshot.ResourceBoxes?.[2]).toMatchObject({ Cell: { X: 2, Y: 0 }, HitsLeft: 1, HitsRequired: 2 })
    expect(snapshot.Chests).toHaveLength(6)
    expect(snapshot.Chests.every(chest => chest.chest.HitsLeft === null)).toBe(true)
    expect(unknown.brick[0]).toBe(BlockType.Air)
    expect(t.read(grid, f.chests)).toBe(bound)
    const lost = t.read(grid)!
    expect(lost.rev).toBeGreaterThan(bound.rev)
    expect(lost.brick[0]).toBe(BlockType.Air)
    Object.assign(f.chests[0], { resourceTier: 999999 })
    expect(() => a.project(f, bound)).toThrow('presentation_resource_tier_unknown')
  })

  it('projects committed maximum health and golden hearts through death and a new life', () => {
    const a = adapter(), f = fixture()
    Object.assign(f.players[0], { maximumHealth: 14, goldenHeartCount: 3 })
    const first = a.project(f, terrain)!.Players[0]
    expect(first.maxHealth).toBe(14)
    expect(first.goldHearts).toBe(3)
    f.tick = later(1); f.players = []; f.participants[0].currentLife = null
    f.participants[0].lifePhase = 2
    const dead = a.project(f, terrain)!.Players[0]
    expect(dead.positionKnown).toBe(false)
    expect(dead.maxHealth).toBe(14)
    expect(dead.goldHearts).toBe(3)
    f.tick = later(2); f.players = fixture().players
    Object.assign(f.players[0], { id: 'ffffffffffffffff0000000000000032', maximumHealth: 6, goldenHeartCount: 0 })
    f.players[0].lifeGeneration = '2'; f.participants[0].currentLife = f.players[0].id
    f.participants[0].lifePhase = 1; f.selfId = f.players[0].id
    const respawned = a.project(f, terrain)!.Players[0]
    expect(respawned.maxHealth).toBe(6)
    expect(respawned.goldHearts).toBe(0)
  })

  it.each([[3, 'time'], [4, 'resource']] as const)('projects the authoritative circle trigger code %i', (triggerReason, trigger) => {
    const f = fixture()
    f.match!.phase = 3
    f.match!.finalCircle = { triggerTick: tick, triggerReason, initialResourceCount: 100, remainingResourceCount: 19,
      currentStageId: 1, nextStageId: 2, currentSide: 13, nextSide: 9,
      nextAnnounceTick: tick, nextEffectiveTick: later(60) }
    expect(adapter().project(f, terrain)!.match?.finalCircle?.trigger).toBe(trigger)
  })

  it('keeps an enabled zero-weight equipped bomb visible while excluding its candy', () => {
    const a = createReplicaAdapter({ characters: new Map([[118003, 'cat']]),
      skills: new Map([[3, 'blink'], [6, 'freezeBomb']]),
      bombSkills: new Set([6]), characterSkills: new Set([3]), candySkills: new Set() })
    const f = fixture()
    Object.assign(f.players[0].skills, { bombSkillId: 6, bombSkillLevel: 3 })
    f.pickups = [{ id: 'ffffffffffffffff0000000000000020', x: 2.5, y: 1, z: 2.5,
      kind: 4, skillId: 6, skillLevel: 1, droppedBy: null,
      protectedUntilTick: '0', spawnTick: tick, phase: 0 }]
    const out = a.project(f, terrain)!
    expect(out.Pickups).toEqual([])
    const rules = { ...DEFAULT_RULES, skills: { ...DEFAULT_RULES.skills,
      freezeBomb: { ...DEFAULT_RULES.skills.freezeBomb, candyWeight: 0 } } }
    const hud = skillHudModel(out.Players[0], out.Tick, 20, rules, DEFAULT_CONFIG, false)
    expect(hud.chips).toHaveLength(2)
    expect(hud.chips[0]).toMatchObject({ skill: 'freezeBomb', level: 1, favorite: false })
  })

  it('keeps unsupported bomb slots empty and omits unknown candy while retaining passive regen', () => {
    const a = createReplicaAdapter({ characters: new Map([[118003, 'cat']]),
      skills: new Map([[3, 'blink'], [1, 'regen'], [6, 'freezeBomb']]),
      bombSkills: new Set([6]), characterSkills: new Set([3, 1]), candySkills: new Set([6]) })
    const f = fixture()
    Object.assign(f.players[0].skills, { bombSkillId: 40003, bombSkillLevel: 1,
      passiveSkillId: 1, passiveSkillLevel: 1, passiveSkillBound: true })
    const pickup = { id: 'ffffffffffffffff0000000000000020', x: 2.5, y: 1, z: 2.5,
      kind: 4, skillId: 40003, skillLevel: 1, droppedBy: null,
      protectedUntilTick: '0', spawnTick: tick, phase: 0 }
    f.pickups = [pickup, { ...pickup, id: 'ffffffffffffffff0000000000000021', skillId: 6 },
      { ...pickup, id: 'ffffffffffffffff0000000000000022', skillId: 3 },
      { ...pickup, id: 'ffffffffffffffff0000000000000023', skillId: 1 },
      { ...pickup, id: 'ffffffffffffffff0000000000000024', kind: 3, skillId: 0 }]
    const out = a.project(f, terrain)!
    expect(out.Players[0].skills?.slots.bomb).toBeNull()
    expect(out.Players[0].skills?.slots.passive?.skill).toBe('regen')
    expect(out.Pickups.map(p => p.BomberPickupItem.Kind)).toEqual([4, 3])
    expect(out.Pickups[0].skill?.id).toBe('freezeBomb')
  })
  it('animates a remote kick from its public cast without exposing cooldown or replaying a previous life', () => {
    const a = createReplicaAdapter({ characters: new Map([[118005, 'kangaroo']]), skills: new Map([[13, 'flyKick']]) })
    const f = fixture()
    f.selfId = null
    Object.assign(f.players[0].skills, { characterId: 118005, activeSkillId: 13, cooldownFromTick: '0', cooldownUntilTick: '0' })
    f.events = [JSON.stringify({ version: 1, kind: 'skill_cast', matchId: '42', tick, sequence: '5',
      participantId: participant, lifeId: life, lifeGeneration: '1', data: { skillId: '13' } })]
    const first = a.project(f, terrain)!.Players[0].skills!
    expect(first.cdFromTick).toBe(0)
    expect(first.cdUntilTick).toBe(0)
    expect(first.activeCastTick).toBe(1)
    expect(flyKickPhase(first, 1, 20)).toBe(0)
    f.tick = later(1)
    expect(a.project(f, terrain)!.Players[0].skills!.activeCastTick).toBe(1)
    f.players[0].id = 'ffffffffffffffff0000000000000009'
    f.participants[0].currentLife = f.players[0].id
    const nextLife = a.project(f, terrain)!.Players[0].skills!
    expect(nextLife.activeCastTick).toBe(0)
    expect(flyKickPhase(nextLife, 2, 20)).toBe(-1)
  })
  it.each([true, false])('keys public casts and cached poses by exact generation (old journal retained: %s)', retainJournal => {
    const a = createReplicaAdapter({ characters: new Map([[118005, 'kangaroo']]), skills: new Map([[13, 'flyKick']]) })
    const f = fixture()
    f.selfId = null
    f.players[0].lifeGeneration = '9007199254740995'
    Object.assign(f.players[0].skills, { characterId: 118005, activeSkillId: 13, cooldownFromTick: '0', cooldownUntilTick: '0' })
    const occurrence = { version: 1, kind: 'skill_cast', matchId: '42', tick, sequence: '5',
      participantId: participant, lifeId: life, lifeGeneration: f.players[0].lifeGeneration, data: { skillId: '13' } }
    f.events = [JSON.stringify(occurrence)]
    expect(a.project(f, terrain)!.Players[0].skills!.activeCastTick).toBe(1)
    f.players[0].lifeGeneration = '9007199254740996'
    expect(Number(occurrence.lifeGeneration)).toBe(Number(f.players[0].lifeGeneration))
    if (!retainJournal) f.events = []
    f.tick = later(1)
    const respawned = a.project(f, terrain)!.Players[0]
    expect(respawned.skills!.activeCastTick).toBe(0)
    expect(respawned.teleportTick).toBe(2)
    expect(flyKickPhase(respawned.skills!, 2, 20)).toBe(-1)
    f.events = []
    expect(a.project(f, terrain)!.Players[0].skills!.activeCastTick).toBe(0)
    f.tick = later(2)
    f.events = [JSON.stringify({ ...occurrence, tick: f.tick, sequence: '6', lifeGeneration: f.players[0].lifeGeneration })]
    const cast = a.project(f, terrain)!.Players[0].skills!
    expect(cast.activeCastTick).toBe(3)
    expect(flyKickPhase(cast, 3, 20)).toBe(0)
    f.events = []
    expect(a.project(f, terrain)!.Players[0].skills!.activeCastTick).toBe(3)
  })
  it('uses dense identity handles and relative ticks without precision loss', () => {
    const a = adapter(), f = fixture()
    const out = a.project(f, terrain)!
    expect(out.Tick).toBe(1)
    expect(out.Players[0].skills?.cdUntilTick).toBe(201)
    expect(out.Players[0].skills?.facing).toBe(4)
    expect(a.localPlayerId).toBe(out.Players[0].NetEntityIdRaw)
    expect(a.handle('player', 'ffffffffffffffff0000000000000003')).not.toBe(a.localPlayerId)
    expect(out.BomberMatchState.HatKingNetEntityIdRaw).toBe(a.localPlayerId)
    expect(out.Players[0].玩家属性.血量当前).toBe(4)
  })
  it('retains a dead seat and follows its new life without interpolating across respawn', () => {
    const a = adapter(), f = fixture()
    const id = a.project(f, terrain)!.Players[0].NetEntityIdRaw
    const original = f.players[0]
    f.tick = later(1); f.players = []; f.participants[0].currentLife = null
    f.participants[0].lifePhase = 2; f.participants[0].respawnAtTick = later(61)
    const dead = a.project(f, terrain)!.Players[0]
    expect(dead.NetEntityIdRaw).toBe(id)
    expect(dead.玩家属性.血量当前).toBe(0)
    expect(dead.BomberPlayerState.RespawnAtTick).toBe(62)
    f.tick = later(61); f.players = [{ ...original, id: 'ffffffffffffffff0000000000000009', x: 14 }]
    f.selfId = f.players[0].id; f.participants[0].currentLife = f.selfId
    const respawned = a.project(f, terrain)!.Players[0]
    expect(respawned.NetEntityIdRaw).toBe(id)
    expect(a.localPlayerId).toBe(id)
    expect(respawned.teleportTick).toBe(62)
    expect(respawned.LogicTransform.WorldPosition.x).toBe(14)
  })
  it('does not reinterpret teleport sequence as an absolute tick', () => {
    const a = adapter(), f = fixture()
    a.project(f, terrain)
    f.tick = later(5); f.players[0].skills.teleportSequence = '1'
    expect(a.project(f, terrain)!.Players[0].skills?.blinkTick).toBe(6)
    f.tick = later(6)
    expect(a.project(f, terrain)!.Players[0].skills?.blinkTick).toBe(6)
  })
  it('keeps out-of-scope live players alive and retains late-joined eliminated seats', () => {
    const a = adapter(), f = fixture()
    const first = a.project(f, terrain)!.Players[0]
    f.tick = later(1); f.players = []
    const missing = a.project(f, terrain)!.Players[0]
    expect(missing.玩家属性.血量当前).toBe(first.玩家属性.血量当前)
    expect(missing.positionKnown).toBe(false)
    f.participants[0].lifePhase = 3; f.participants[0].eliminatedTick = later(1)
    const joined = adapter()
    const late = joined.project(f, terrain)!.Players[0]
    expect(late.eliminated).toBe(true)
    expect(late.玩家属性.血量当前).toBe(0)
    expect(late.positionKnown).toBe(false)
    expect(joined.localPlayerId).toBe(late.NetEntityIdRaw)
  })
  it('normalizes a waiting world with no match start without losing ulong precision', () => {
    const f = fixture(); f.match!.startTick = '0'
    expect(adapter().project(f, terrain)!.Tick).toBe(1)
  })
  it('projects authoritative statistics and gives retained results precedence', () => {
    const f = fixture(), a = adapter()
    const totals = { participant, kills: 5, bombs: 31, destroyedBlocks: 19, pickups: 8,
      bestChain: 4, peakHats: 11, skillCasts: 3, evolutions: 1, hatKingTicks: '900',
      character: 118003, deaths: 0, peakHealthPoints: 6, bossKills: 0, clutchEscapes: 0,
      goldenHeartPickups: 0, specialBombHistory: [] }
    f.statistics = [totals]
    expect(a.project(f, terrain)!.statistics![0]).toMatchObject({ kills: 5, bombs: 31, hatKingTicks: 900 })
    f.results = { matchId: '42', endTick: later(5), endReason: 1, winner: participant,
      rows: [{ ...totals, kills: 7, life, slot: 0, rank: 1, survived: true,
        finalHats: 11, eliminatedTick: '0', character: 118003 }] }
    expect(a.project(f, terrain)!.statistics![0]).toMatchObject({ kills: 7, character: 'cat' })
  })
  it('retains durable highlights and ordered M2 bomb history with no live entity or journal', () => {
    const a = createReplicaAdapter({ characters: new Map([[118003, 'cat'], [118005, 'kangaroo']]),
      skills: new Map([[3, 'blink'], [6, 'freezeBomb'], [7, 'pierceBomb'], [8, 'toxinBomb']]),
      bombSkills: new Set([6, 7, 8]) })
    const f = fixture()
    const totals = { participant, character: 118003, kills: 5, deaths: 4, bombs: 31, destroyedBlocks: 19,
      pickups: 8, bestChain: 4, peakHats: 11, skillCasts: 3, evolutions: 0, hatKingTicks: '900',
      peakHealthPoints: 18, bossKills: 2, clutchEscapes: 3, goldenHeartPickups: 6,
      specialBombHistory: [7, 6, 7, 3, 999999, 8] }
    f.statistics = [totals]
    expect(a.project(f, terrain)!.statistics![0]).toMatchObject({ deaths: 4, peakHealthPoints: 18,
      bossKills: 2, clutchEscapes: 3, goldenHeartPickups: 6, character: 'cat',
      specialBombHistory: ['pierceBomb', 'freezeBomb', 'toxinBomb'] })
    f.results = { matchId: '42', endTick: later(5), endReason: 1, winner: null,
      rows: [{ ...totals, deaths: 5, character: 118005, peakHealthPoints: 20, bossKills: 3,
        clutchEscapes: 4, goldenHeartPickups: 7, specialBombHistory: [8, 7], life, slot: 0, rank: 2,
        survived: false, finalHats: 0, eliminatedTick: later(2) }] }
    f.players = []; f.events = []; f.participants[0].currentLife = null
    f.participants[0].lastLife = life; f.participants[0].lifePhase = 3
    expect(a.project(f, terrain)!.Players[0].meta.animal).toBe('kangaroo')
    const late = createReplicaAdapter({ characters: new Map([[118005, 'kangaroo']]),
      skills: new Map([[7, 'pierceBomb'], [8, 'toxinBomb']]), bombSkills: new Set([7, 8]) })
    const projected = late.project(f, terrain)!
    expect(projected.statistics![0]).toMatchObject({ deaths: 5, character: 'kangaroo', peakHealthPoints: 20,
      bossKills: 3, clutchEscapes: 4, goldenHeartPickups: 7, specialBombHistory: ['toxinBomb', 'pierceBomb'] })
    expect(projected.Players[0].meta?.animal).toBe('kangaroo')
    expect(late.events(f)).toEqual([])
  })
  it('ignores another match results character when a durable live total outlives its life', () => {
    const a = createReplicaAdapter({ characters: new Map([[118003, 'cat'], [118005, 'kangaroo']]), skills: new Map() })
    const f = fixture()
    const totals = { participant, character: 118003, kills: 0, deaths: 1, bombs: 0, destroyedBlocks: 0,
      pickups: 0, bestChain: 0, peakHats: 0, skillCasts: 0, evolutions: 0, hatKingTicks: '0',
      peakHealthPoints: 6, bossKills: 0, clutchEscapes: 0, goldenHeartPickups: 0, specialBombHistory: [] }
    f.statistics = [totals]; f.players = []; f.participants[0].lifePhase = 3
    f.results = { matchId: '41', endTick: tick, endReason: 1, winner: null,
      rows: [{ ...totals, character: 118005, life, slot: 0, rank: 1, survived: false,
        finalHats: 0, eliminatedTick: tick }] }
    expect(a.project(f, terrain)!.Players[0].meta.animal).toBe('cat')
  })
  it('builds late-join settlement cards from results after all participant lives are gone', () => {
    const a = createReplicaAdapter({ characters: new Map([[118005, 'kangaroo']]),
      skills: new Map([[6, 'freezeBomb']]), bombSkills: new Set([6]) })
    const f = fixture(), other = 'ffffffffffffffff0000000000000003'
    f.tick = later(10); f.match!.phase = 4; f.players = []; f.events = []
    f.participants[0].currentLife = null; f.participants[0].lastLife = life; f.participants[0].lifePhase = 3
    f.participants.push({ ...f.participants[0], id: other, slot: 1, lastLife: null })
    const result = { participant, life, slot: 0, rank: 1, survived: false, finalHats: 0,
      eliminatedTick: later(5), character: 118005, kills: 0, deaths: 4, bombs: 10,
      destroyedBlocks: 0, pickups: 0, bestChain: 0, peakHats: 0, skillCasts: 0,
      evolutions: 0, hatKingTicks: '0', peakHealthPoints: 18, bossKills: 2,
      clutchEscapes: 0, goldenHeartPickups: 0, specialBombHistory: [6] }
    f.results = { matchId: '42', endTick: later(10), endReason: 2, winner: null,
      rows: [result, { ...result, participant: other, life: null, slot: 1, rank: 2,
        bossKills: 0, goldenHeartPickups: 3 }] }
    const projected = a.project(f, terrain)!
    const brain = new HudBrain({ localId: a.localPlayerId, pillarMinHats: 3, tickRateHz: 20, pointsPerHeart: 2 })
    const events = a.events(f)
    expect(events).toEqual([])
    const settled = brain.consume(batch(projected.Tick, events, { snapshot: projected }))
      .find(moment => moment.kind === 'settlement')
    if (settled?.kind !== 'settlement') throw new Error('missing late-join settlement')
    expect(settled.results.stats).toMatchObject({ deaths: 4, maxHearts: 9, character: 'kangaroo',
      skills: ['freezeBomb'], bombsPlaced: 10 })
    expect(settled.results.highlights).toEqual([
      expect.objectContaining({ id: a.localPlayerId, kind: 'bossHunter', value: 2 }),
      expect.objectContaining({ id: a.handle('player', other), kind: 'goldHearts', value: 3 }),
    ])
    expect(brain.consume(batch(projected.Tick, [], { snapshot: projected }))
      .some(moment => moment.kind === 'settlement')).toBe(false)
  })
  it('renders authoritative blast arms and suppresses extinguished bombs', () => {
    const a = adapter(), f = fixture()
    const bomb = { id: 'bomb', x: 3, y: 1, z: 4, owner: participant, power: 5, chainId: '9007199254740999',
      fuseEndTick: later(42), bombKind: 1, pierceLayers: 1, phase: 1, explodedAtTick: tick,
      dangerUntilTick: later(8), burnUntilTick: later(10), reachUp: 1, reachDown: 2, reachLeft: 0, reachRight: 4,
      kickDirection: 0, kickRange: 0, kickStartTick: '0' }
    f.bombs = [bomb, { ...bomb, id: 'extinguished', phase: 3 }]
    const result = a.project(f, terrain)!
    expect(result.Bombs).toHaveLength(1)
    expect(result.Bombs[0].BomberBombState.ReachRight).toBe(4)
    expect(result.Bombs[0].BomberBombState.OwnerNetEntityIdRaw).toBe(a.localPlayerId)
    expect(result.Bombs[0].kicking).toBe(false)
    f.bombs = [{ ...bomb, x: 3.9, phase: 0, kickDirection: 2, kickStartTick: tick }]
    const moving = a.project(f, terrain)!.Bombs[0]
    expect(moving.kicking).toBe(true)
    expect(moving.kick).toBeUndefined()
    expect(moving.LogicTransform.WorldPosition.x).toBe(3.9)
  })
  it('does not turn Pending voxel data into air or floor', () => {
    const t = new ReplicaTerrain(1, 0, 1, [{ blockType: 1022, name: 'floor' }, { blockType: 0, name: 'air' }])
    const pending = { width: 1, depth: 1, states: new Uint8Array([0]), blockIds: new Uint32Array([0]) }
    expect(t.read({ readSurface: () => pending })).toBeNull()
    const known = t.read({ readSurface: box => ({ ...pending, states: new Uint8Array([box.minY === 0 ? 2 : 1]),
      blockIds: new Uint32Array([box.minY === 0 ? 1022 << 8 : 0]) }) })!
    expect([...known.ground]).toEqual([6])
    expect([...known.brick]).toEqual([0])
    expect(t.read({ readSurface: () => pending })).toBeNull()
    expect(known.ground[0]).toBe(6)
  })
  it('renders a known chest voxel without inventing its entity binding or hit count', () => {
    const t = new ReplicaTerrain(1, 0, 1, [{ blockType: 1022, name: 'floor' }, { blockType: 1024, name: 'chest' }])
    const surface = t.read({ readSurface: box => ({ width: 1, depth: 1,
      states: new Uint8Array([2]), blockIds: new Uint32Array([(box.minY === 0 ? 1022 : 1024) << 8]) }) })!
    const a = adapter(), f = fixture()
    const result = a.project(f, surface)!
    expect(surface.brick[0]).toBe(0)
    expect(result.Chests[0]).toMatchObject({ LogicTransform: { WorldPosition: { x: 0.5, z: 0.5 } },
      chest: { HitsLeft: null, HitsRequired: null } })
    expect(result.Chests[0].NetEntityIdRaw).not.toBe(a.handle('entity', 'unbound-chest-id'))
    f.chests = [{ id: 'bound-chest', x: 0.5, y: 1, z: 0.5, remainingHits: 2, requiredHits: 3, resourceTier: 0, phase: 0 }]
    const known = a.project(f, surface)!.Chests
    expect(known).toHaveLength(1)
    expect(known[0].chest.HitsLeft).toBe(2)
  })
})
