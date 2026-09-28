import { describe, expect, it } from 'vitest'
import {
  BlockType,
  CHARACTER_ORDER,
  DEFAULT_RULES,
  MAP_TIERS,
  ZONE_BOX,
  centerDistance,
  protoConfig,
  ringZoneOf,
  rulesForMap,
  type MapTierId,
  type RingZone,
} from '../../contract'
import { generateMap, spawnZones, validateMap, type GeneratedMap } from '../mapgen'
import { createWorld, MAX_PLAYERS } from '../match-phase'
import { specs } from './helpers'

/**
 * 方向 B 地图档（ADR 0040，design §5 / §5.0 / §5.3）：27 档（原型默认 16 人）与 23 档的生成断言，独立于 validateMap 重写一遍。
 * 19 档保持旧地图逐格不变（mapgen.test.ts 的快照不改即通过）。
 */

const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const

function tier(size: MapTierId) {
  const rules = rulesForMap(DEFAULT_RULES, size)
  return { rules, cfg: protoConfig(rules), map: MAP_TIERS[size] }
}

function reach(m: GeneratedMap, from: number, ok: (c: number) => boolean): Set<number> {
  const S = m.size
  const seen = new Set([from])
  const q = [from]
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const x = c % S
    const y = Math.floor(c / S)
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      const n = ny * S + nx
      if (nx < 0 || ny < 0 || nx >= S || ny >= S || seen.has(n) || !ok(n)) continue
      seen.add(n)
      q.push(n)
    }
  }
  return seen
}

/** 一张档位地图的全部 ADR 0040 断言（density 按该档默认人数，design §5）。 */
function checkTierMap(size: MapTierId, seed: number): void {
  const { rules, cfg, map } = tier(size)
  const players = map.defaultPlayers
  const m = generateMap(seed, cfg, rules, players)
  const S = m.size
  const mid = (S - 1) / 2
  const half = (map.plazaSide - 1) / 2
  const inPlaza = (x: number, y: number) => map.plazaSide > 0 && Math.abs(x - mid) <= half && Math.abs(y - mid) <= half
  expect(S).toBe(size)
  expect(validateMap(m, cfg, rules, players), `seed ${seed}`).toEqual([])

  // 铁皮：外圈 + 偶数行列交点，核心广场内的铁柱去掉；四象限镜像。
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = y * S + x
      const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1
      const pillar = x % 2 === 0 && y % 2 === 0 && !inPlaza(x, y)
      expect(m.brick[c] === BlockType.铁皮, `wall ${x},${y}`).toBe(edge || pillar)
      expect(m.brick[y * S + (S - 1 - x)]).toBe(m.brick[c])
      expect(m.brick[(S - 1 - y) * S + x]).toBe(m.brick[c])
      expect(m.ground[(S - 1 - y) * S + (S - 1 - x)]).toBe(m.ground[c])
    }

  // 全图连通（软砖全清后）。
  const walk = (c: number) => m.brick[c] !== BlockType.铁皮
  const all = [...Array(S * S).keys()].filter(walk)
  expect(reach(m, all[0], walk).size).toBe(all.length)

  // 可放弹格 / 人 26–30、开局 ≥ 9（按档位默认人数）。
  const water = all.filter((c) => m.ground[c] === BlockType.水).length
  const perPlayer = (all.length - water) / players
  expect(perPlayer, `seed ${seed} density`).toBeGreaterThanOrEqual(26)
  expect(perPlayer, `seed ${seed} density`).toBeLessThanOrEqual(30)
  const open = all.filter((c) => m.brick[c] === BlockType.Air && m.ground[c] !== BlockType.水).length
  expect(open / players).toBeGreaterThanOrEqual(9)
  expect(water * 100).toBeLessThanOrEqual(5 * S * S)

  // 1×1 可进入：中心格不是铁皮、不是水、在连通图里；23 / 27 档核心 3×3 广场开局全空地。
  const center = mid * S + mid
  expect(walk(center)).toBe(true)
  expect(m.ground[center]).toBe(BlockType.地面)
  expect(reach(m, all[0], walk).has(center)).toBe(true)
  for (let y = mid - half; y <= mid + half; y++)
    for (let x = mid - half; x <= mid + half; x++) {
      if (map.plazaSide === 0) break
      expect(m.brick[y * S + x], `plaza ${x},${y}`).toBe(BlockType.Air)
      expect(m.ground[y * S + x]).toBe(BlockType.地面)
    }

  // 三圈三级资源箱：外 / 中 / 核心箱数精确、等级 = 所在圈、四象限镜像、砖层都是木箱。
  const count: Record<RingZone, number> = { outer: 0, mid: 0, core: 0 }
  const tierAt = new Map(m.boxes.map((b) => [b.cell, b.tier]))
  for (let c = 0; c < S * S; c++) {
    if (m.brick[c] !== BlockType.木箱) continue
    const zone = ringZoneOf(map.zones, centerDistance(S, c % S, Math.floor(c / S)))
    count[zone]++
    expect(tierAt.get(c), `box ${c % S},${Math.floor(c / S)}`).toBe(ZONE_BOX[zone])
  }
  expect(m.boxes).toHaveLength(tierAt.size)
  expect(count).toEqual({ outer: map.boxes.wood.count, mid: map.boxes.iron.count, core: map.boxes.gold.count })
  for (const b of m.boxes) expect(m.brick[b.cell]).toBe(BlockType.木箱)

  // 出生点：档位默认人数个，都在外圈，安全区干净，两两 ≥ spawnMinDistance（曼哈顿）。
  expect(m.spawns).toHaveLength(players)
  for (const z of m.spawns) {
    expect(ringZoneOf(map.zones, centerDistance(S, z.x, z.y))).toBe('outer')
    for (const c of z.cells) {
      expect(m.brick[c]).toBe(BlockType.Air)
      expect(m.ground[c]).toBe(BlockType.地面)
    }
  }
  for (let i = 0; i < m.spawns.length; i++)
    for (let j = i + 1; j < m.spawns.length; j++) {
      const a = m.spawns[i]
      const b = m.spawns[j]
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(DEFAULT_RULES.spawnMinDistance)
    }
}

describe('27×27 tier (ADR 0040, prototype default 16 players)', () => {
  it('seeds 1..100: density 26–30 / player, connected, 1×1 enterable, boxes 16 / 12 / 4 by ring, 16 outer spawns ≥ 6 apart', () => {
    for (let seed = 1; seed <= 100; seed++) checkTierMap(27, seed)
  })

  it('is deterministic per seed and the map does not depend on how many players join', () => {
    const { rules, cfg } = tier(27)
    const a = generateMap(7, cfg, rules, 16)
    const b = generateMap(7, cfg, rules, 16)
    const few = generateMap(7, cfg, { ...rules, playerCount: 4 }, 4)
    expect(Buffer.from(a.brick)).toEqual(Buffer.from(b.brick))
    expect(Buffer.from(few.brick)).toEqual(Buffer.from(a.brick))
    expect(Buffer.from(few.ground)).toEqual(Buffer.from(a.ground))
    expect(Buffer.from(generateMap(8, cfg, rules, 16).brick)).not.toEqual(Buffer.from(a.brick))
  })
})

describe('23×23 tier', () => {
  it('seeds 1..100 (page default since user 2026-09-28): 12 outer spawns, boxes 12 / 8 / 4 by ring, 3×3 plaza, all generator asserts', () => {
    for (let seed = 1; seed <= 100; seed++) checkTierMap(23, seed)
  })
})

describe('19×19 tier keeps the old map', () => {
  it('spawn candidates are the old 8 in the old order; no tiered boxes on the generated map', () => {
    const e = 17
    expect(spawnZones(19).map((z) => [z.x, z.y])).toEqual([
      [1, 1],
      [e, 1],
      [1, e],
      [e, e],
      [9, 1],
      [1, 9],
      [e, 9],
      [9, e],
    ])
    const m = generateMap(1, protoConfig(DEFAULT_RULES), DEFAULT_RULES, 8)
    expect(m.boxes).toEqual([])
  })

  it('27 / 23 spawn sets: 16 / 12 zones, the old 8 first', () => {
    expect(spawnZones(27)).toHaveLength(16)
    expect(spawnZones(23)).toHaveLength(12)
    expect(spawnZones(27).slice(0, 4).map((z) => [z.x, z.y])).toEqual([
      [1, 1],
      [25, 1],
      [1, 25],
      [25, 25],
    ])
  })
})

describe('createWorld on the 27 tier', () => {
  it('16 players fit (MAX_PLAYERS = 16), 17 are rejected; resource boxes are registered with their hits; the central supply is scheduled', () => {
    expect(MAX_PLAYERS).toBe(16)
    const { rules, cfg, map } = tier(27)
    const w = createWorld({ seed: 3, config: cfg, rules, players: specs(16, Array(16).fill('auto')) })
    expect(w.size).toBe(27)
    expect(w.resourceBoxes).toHaveLength(map.boxes.wood.count + map.boxes.iron.count + map.boxes.gold.count)
    for (const b of w.resourceBoxes ?? []) {
      expect(w.brick[b.cell]).toBe(BlockType.木箱)
      expect(b.hitsRequired).toBe(map.boxes[b.tier].hits)
      expect(b.hitsLeft).toBe(b.hitsRequired)
      expect(b.hitBy).toEqual([])
    }
    expect(w.resourceBoxes!.filter((b) => b.tier === 'gold').every((b) => b.hitsRequired === 2)).toBe(true)
    const mid = 13
    expect(w.supply).toEqual({
      cell: mid * 27 + mid,
      announceTick: w.match.startTick + w.ticks.supplyAnnounce,
      openTick: w.match.startTick + w.ticks.supplyOpen,
      state: 'pending',
    })
    expect(w.ticks.supplyAnnounce).toBe(1000)
    expect(w.ticks.supplyOpen).toBe(1200)
    const cells = new Set(w.players.map((p) => Math.floor(p.my / 1000) * 27 + Math.floor(p.mx / 1000)))
    expect(cells.size).toBe(16)
    expect(() => createWorld({ seed: 3, config: cfg, rules: { ...rules, playerCount: 17 }, players: specs(17) })).toThrow(/player count 17/)
  })

  it('roster: 16 auto players → 4 per character', () => {
    const { rules, cfg } = tier(27)
    const w = createWorld({ seed: 11, config: cfg, rules, players: specs(16, Array(16).fill('auto')) })
    for (const c of CHARACTER_ORDER) expect(w.players.filter((p) => p.character === c)).toHaveLength(4)
  })

  it('the 19 tier registers no resource boxes and schedules no supply', () => {
    const w = createWorld({ seed: 3, config: protoConfig(DEFAULT_RULES), rules: DEFAULT_RULES, players: specs(8) })
    expect(w.resourceBoxes).toEqual([])
    expect(w.supply).toBeNull()
  })
})
