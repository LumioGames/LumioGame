import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BlockType, 方向, type AbilityActivation } from '../src/contract'
import { InputState } from '../src/input/keyboard'
import { makeWorld, put, setBrick, setGround } from '../src/sim/__tests__/helpers'
import { stepWorld } from '../src/sim/step'
import type { SimPlayer, World } from '../src/sim/world'

type DirectionName = 'none' | 'up' | 'right' | 'down' | 'left'
type PhysicalEvent = {
  id: string
  beforeStep?: number
  predicate?: { axis: 'mx'; comparison: 'gte'; threshold: number; once: true }
  up?: string[]
  down?: string[]
}
type MovementCase = {
  id: string
  start: [number, number]
  goal: [number, number]
  bricks: [number, number][]
  water?: [number, number][]
  budget: number
  reachedAt: number
  sourceEvents: PhysicalEvent[]
}
type Sample = {
  stepIndex: number
  sourceTickBefore: number
  sourceTickAfter: number
  eventIds: string[]
  move: { kind: 'typed'; primary: DirectionName; secondary: DirectionName; turnPressed: boolean }
  actions: string[]
}
type Captured = {
  id: string
  start: [number, number]
  goal: [number, number]
  initialState: { prototypeTick: number; speedMilliPerSecond: number; positionMilli: [number, number];
    facing: DirectionName; lastDirection: DirectionName; pendingDirection: DirectionName;
    turnBuffer: number; moveAccumulator: number; matchPhase: number }
  sourceEvents: PhysicalEvent[]
  sourceCapture: { eventId: string; stepIndex: number; preStepMilli: [number, number]; priorFalseStep: number | null }[]
  map: { size: number; ground: string[]; obstacle: string[] }
  sampledControls: Sample[]
}

// Literal physical scripts from movement-paths.test.ts. Production InputState is the
// only sampler; predicates are evaluated once, before poll and stepWorld.
const cases: MovementCase[] = [
  { id: 'P1', start: [1, 3], goal: [7, 1], bricks: [[1, 2], [3, 2], [5, 2]], budget: 55, reachedAt: 46,
    sourceEvents: [{ id: 'right', beforeStep: 0, down: ['KeyD'] }, { id: 'up', beforeStep: 2, down: ['KeyW'] }] },
  { id: 'P2', start: [17, 15], goal: [11, 17], bricks: [[17, 16], [15, 16], [13, 16]], budget: 55, reachedAt: 46,
    sourceEvents: [{ id: 'left', beforeStep: 0, down: ['KeyA'] }, { id: 'down', beforeStep: 2, down: ['KeyS'] }] },
  { id: 'P3', start: [3, 1], goal: [1, 7], bricks: [[2, 1], [2, 3], [2, 5]], budget: 55, reachedAt: 46,
    sourceEvents: [{ id: 'down', beforeStep: 0, down: ['KeyS'] }, { id: 'left', beforeStep: 2, down: ['KeyA'] }] },
  { id: 'P4', start: [15, 17], goal: [17, 11], bricks: [[16, 17], [16, 15], [16, 13]], budget: 55, reachedAt: 46,
    sourceEvents: [{ id: 'up', beforeStep: 0, down: ['KeyW'] }, { id: 'right', beforeStep: 2, down: ['KeyD'] }] },
  { id: 'P5', start: [1, 1], goal: [3, 3], bricks: [[3, 4]], budget: 35, reachedAt: 28,
    sourceEvents: [{ id: 'right', beforeStep: 0, down: ['KeyD'] },
      { id: 'late-down', predicate: { axis: 'mx', comparison: 'gte', threshold: 3950, once: true }, up: ['KeyD'], down: ['KeyS'] }] },
  { id: 'P6', start: [1, 1], goal: [17, 1], bricks: [], budget: 100, reachedAt: 92,
    sourceEvents: [{ id: 'right', beforeStep: 0, down: ['KeyD'] }, { id: 'up', beforeStep: 1, down: ['KeyW'] }] },
  { id: 'P7', start: [1, 1], goal: [9, 3], bricks: [[1, 2], [10, 1], [10, 3], [9, 4]], budget: 65, reachedAt: 59,
    sourceEvents: [{ id: 'down', beforeStep: 0, down: ['KeyS'] }, { id: 'right', beforeStep: 1, down: ['KeyD'] }] },
  { id: 'P8', start: [1, 1], goal: [7, 7], bricks: [[1, 2], [3, 4], [5, 6], [7, 8], [8, 7]], budget: 80, reachedAt: 69,
    sourceEvents: [{ id: 'right', beforeStep: 0, down: ['KeyD'] }, { id: 'down', beforeStep: 1, down: ['KeyS'] }] },
  { id: 'P9', start: [3, 1], goal: [5, 3], bricks: [[3, 2], [5, 4], [6, 3]], budget: 30, reachedAt: 24,
    sourceEvents: [{ id: 'bomb', beforeStep: 0, down: ['Space'] }, { id: 'right', beforeStep: 1, down: ['KeyD'] },
      { id: 'down', beforeStep: 3, down: ['KeyS'] }] },
  { id: 'P10', start: [1, 1], goal: [3, 3], bricks: [[3, 4]], water: [[2, 1], [3, 1], [3, 2], [3, 3]], budget: 50, reachedAt: 40,
    sourceEvents: [{ id: 'right', beforeStep: 0, down: ['KeyD'] },
      { id: 'late-down', predicate: { axis: 'mx', comparison: 'gte', threshold: 3900, once: true }, up: ['KeyD'], down: ['KeyS'] }] },
]

const names: Record<number, DirectionName> = {
  [方向.停]: 'none', [方向.上]: 'up', [方向.右]: 'right', [方向.下]: 'down', [方向.左]: 'left',
}
const values: Record<DirectionName, 方向> = {
  none: 方向.停, up: 方向.上, right: 方向.右, down: 方向.下, left: 方向.左,
}
const fixture = new URL('../../Tools/Fixtures/movement-f1-inputs.json', import.meta.url)
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

function board(c: MovementCase): { world: World; player: SimPlayer } {
  const world = makeWorld()
  put(world, 1, 15, 15)
  const player = put(world, 2, ...c.start)
  for (const [x, z] of c.bricks) setBrick(world, x, z, BlockType.积木)
  for (const [x, z] of c.water ?? []) setGround(world, x, z, BlockType.水)
  return { world, player }
}

function capture(c: MovementCase): Captured {
  const { world, player } = board(c)
  const initialState = { prototypeTick: world.t, speedMilliPerSecond: player.speed,
    positionMilli: [player.mx, player.my] as [number, number], facing: names[player.facing],
    lastDirection: names[player.lastDir], pendingDirection: names[player.pendingDir],
    turnBuffer: player.turnBuf, moveAccumulator: player.moveAcc, matchPhase: world.match.phase }
  const initial = {
    size: world.size,
    ground: Array.from(world.ground, (block) => block === BlockType.水 ? 'water' : 'floor'),
    obstacle: Array.from(world.brick, (block, index) => block === BlockType.Air ? 'air' :
      block === BlockType.积木 ? 'softBrick' :
        index % world.size === 0 || index % world.size === world.size - 1 ||
        Math.floor(index / world.size) === 0 || Math.floor(index / world.size) === world.size - 1
          ? 'iron' : 'hardPillar'),
  }
  const input = new InputState()
  const pending = [...c.sourceEvents]
  const sourceCapture: Captured['sourceCapture'] = []
  const sampledControls: Sample[] = []
  for (let stepIndex = 0; stepIndex < c.budget; stepIndex++) {
    const eventIds: string[] = []
    for (let i = 0; i < pending.length;) {
      const event = pending[i]
      const fires = event.beforeStep === stepIndex ||
        (event.predicate?.axis === 'mx' && event.predicate.comparison === 'gte' && player.mx >= event.predicate.threshold)
      if (!fires) { i++; continue }
      pending.splice(i, 1)
      eventIds.push(event.id)
      sourceCapture.push({ eventId: event.id, stepIndex, preStepMilli: [player.mx, player.my],
        priorFalseStep: event.predicate ? stepIndex - 1 : null })
      for (const key of event.up ?? []) input.keyUp(key)
      for (const key of event.down ?? []) input.keyDown(key, false)
    }
    if (eventIds.includes('bomb')) input.keyUp('Space')
    const activations = input.poll()
    const move = activations.find((a): a is Extract<AbilityActivation, { ability: '移动' }> => a.ability === '移动')!
    const before = world.t
    stepWorld(world, new Map([[2, activations]]))
    sampledControls.push({
      stepIndex, sourceTickBefore: before, sourceTickAfter: world.t, eventIds,
      move: { kind: 'typed', primary: names[move.输入.方向],
        secondary: names[move.输入.副方向 ?? 方向.停], turnPressed: move.输入.按了转弯 },
      actions: activations.filter(a => a.ability !== '移动').map(a => a.ability === '放弹' ? 'bomb' : 'skill'),
    })
    if (player.mx === c.goal[0] * 1000 + 500 && player.my === c.goal[1] * 1000 + 500) break
  }
  expect(sampledControls.length, c.id).toBe(c.reachedAt)
  expect(pending, c.id).toEqual([])
  expect(initialState.speedMilliPerSecond, c.id).toBe(3500)
  expect(initial.ground).toHaveLength(361)
  expect(initial.obstacle).toHaveLength(361)
  return { id: c.id, start: c.start, goal: c.goal, initialState, sourceEvents: c.sourceEvents, sourceCapture,
    map: initial, sampledControls }
}

function replay(c: MovementCase, rows: readonly Sample[]): [number, number][] {
  const { world, player } = board(c)
  const positions: [number, number][] = []
  for (const row of rows) {
    const acts: AbilityActivation[] = row.move.kind === 'typed'
      ? [{ ability: '移动', 输入: { 方向: values[row.move.primary],
        副方向: values[row.move.secondary], 按了转弯: row.move.turnPressed } }] : []
    for (const action of row.actions) {
      if (action === 'bomb') acts.push({ ability: '放弹' })
      else if (action === 'skill') acts.push({ ability: '技能' })
      else throw new Error('Unknown fixture action ' + action)
    }
    stepWorld(world, new Map([[2, acts]]))
    positions.push([player.mx, player.my])
  }
  return positions
}

describe('movement F1 immutable prototype capture and replay', () => {
  it('keeps the ten historical physical scripts and all sampled controls frozen', () => {
    const captured = cases.map(capture)
    const candidate = { formatVersion: 1, provenance: {
      sourceGameBase: 'ff3e3be970352ce5d798f789ce20a54d2a00ceb5',
      sampler: 'prototype/src/input/keyboard.ts:InputState.poll',
      simulator: 'prototype/src/sim/step.ts:stepWorld',
      sourcePathTest: 'prototype/tests/movement-paths.test.ts',
      samplerSha256: digest(readFileSync(new URL('../src/input/keyboard.ts', import.meta.url), 'utf8')),
      simulatorSha256: digest(readFileSync(new URL('../src/sim/step.ts', import.meta.url), 'utf8')),
      sourcePathTestSha256: digest(readFileSync(new URL('./movement-paths.test.ts', import.meta.url), 'utf8')),
      serverConfigHashes: Object.fromEntries(['blocks', 'movement', 'game', 'attributes', 'speed_tiers'].map(name =>
        [name, digest(readFileSync(new URL('../../Server/Config/Tables/server/' + name + '.json', import.meta.url), 'utf8'))])),
    }, configRequirements: { tickRateHz: 20, tier0SpeedMilliPerSecond: 3500,
      movementRowId: 103001, gameRowId: 100001, movementSpeedAttributeRowId: 101006, tier0RowId: 102001,
      waterSpeedPermille: 700, cornerAssistMilli: 500, repeatAssistMilli: 250,
      repeatWindowTicks: 6, turnBufferTicks: 6,
      formalToleranceMetres: 0.00001, equalPolicyPrototypeToleranceMetres: 0.001,
      blockNames: { air: 0, floor: 1022, iron: 1023, hardPillar: 1024, softBrick: 1025, water: 1027 } },
      cases: captured }
    if (process.env.MOVEMENT_CAPTURE_PATH) {
      writeFileSync(process.env.MOVEMENT_CAPTURE_PATH, JSON.stringify(candidate, null, 2) + '\n')
    }
    const frozen = JSON.parse(readFileSync(fixture, 'utf8')) as typeof candidate
    expect(digest(JSON.stringify(candidate))).toBe(digest(JSON.stringify(frozen)))
    const replayed = cases.map((c, index) => ({ id: c.id,
      positionsMilli: replay(c, frozen.cases[index].sampledControls) }))
    if (process.env.MOVEMENT_REPLAY_PATH) {
      writeFileSync(process.env.MOVEMENT_REPLAY_PATH,
        JSON.stringify({ formatVersion: 1, fixtureSha256: digest(JSON.stringify(frozen)),
          replayed }, null, 2) + '\n')
    }
    for (const [index, c] of cases.entries()) {
      const actual = replayed[index].positionsMilli
      expect(actual.at(-1), c.id).toEqual([c.goal[0] * 1000 + 500, c.goal[1] * 1000 + 500])
    }
    expect(frozen.cases[4].sourceCapture.find(e => e.eventId === 'late-down'))
      .toMatchObject({ stepIndex: 14, preStepMilli: [3950, 1500] })
    expect(frozen.cases[9].sourceCapture.find(e => e.eventId === 'late-down'))
      .toMatchObject({ stepIndex: 19, preStepMilli: [3985, 1500], priorFalseStep: 18 })
  })
})
