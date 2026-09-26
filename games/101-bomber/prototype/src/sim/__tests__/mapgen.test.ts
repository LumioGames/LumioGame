import { describe, expect, it } from 'vitest'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES } from '../../contract'
import { generateMap, longestWaterRun, validateMap, type GeneratedMap } from '../mapgen'

/** 设计 §7 第 12 项（矩阵 6.1–6.7 / 6.9；design §5.3）。这里的检查独立于 validateMap 重写一遍。 */
const S = DEFAULT_CONFIG.mapSize

function render(m: GeneratedMap): string {
  const rows: string[] = []
  for (let y = 0; y < m.size; y++) {
    let r = ''
    for (let x = 0; x < m.size; x++) {
      const c = y * m.size + x
      r += m.ground[c] === BlockType.水 ? '~' : ({ [BlockType.Air]: '.', [BlockType.铁皮]: '#', [BlockType.积木]: 'o', [BlockType.木箱]: 'X' } as Record<number, string>)[m.brick[c]] ?? '?'
    }
    rows.push(r)
  }
  return rows.join('\n')
}

function reachable(m: GeneratedMap, from: number, ok: (c: number) => boolean): Set<number> {
  const seen = new Set([from])
  const q = [from]
  while (q.length) {
    const c = q.shift()!
    const x = c % S
    const y = Math.floor(c / S)
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const n = ny * S + nx
      if (nx < 0 || ny < 0 || nx >= S || ny >= S || seen.has(n) || !ok(n)) continue
      seen.add(n)
      q.push(n)
    }
  }
  return seen
}

describe('map generation', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('seed %i satisfies all generator asserts', (seed) => {
    const m = generateMap(seed, DEFAULT_CONFIG, DEFAULT_RULES, 8)
    expect(validateMap(m, DEFAULT_CONFIG, DEFAULT_RULES, 8)).toEqual([])

    // 6.5 镜像、外圈与铁皮柱。
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const c = y * S + x
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1
        expect(m.brick[c] === BlockType.铁皮).toBe(edge || (x % 2 === 0 && y % 2 === 0))
        expect(m.brick[y * S + (S - 1 - x)]).toBe(m.brick[c])
        expect(m.brick[(S - 1 - y) * S + x]).toBe(m.brick[c])
        expect(m.ground[(S - 1 - y) * S + (S - 1 - x)]).toBe(m.ground[c])
        // 6.7 地面层没有坑。
        expect(m.ground[c]).not.toBe(BlockType.Air)
      }

    // 6.2 软砖全清后连通。
    const walk = (c: number): boolean => m.brick[c] !== BlockType.铁皮
    const all = [...Array(S * S).keys()].filter(walk)
    expect(reachable(m, all[0], walk).size).toBe(all.length)
    expect(all.length).toBe(225)

    // 6.4 出生候选 ≥ 8、安全区干净、互距 ≥ 6。
    expect(m.spawns.length).toBeGreaterThanOrEqual(8)
    for (const z of m.spawns) {
      expect(z.cells.length).toBeGreaterThanOrEqual(3)
      for (const c of z.cells) {
        expect(m.brick[c]).toBe(BlockType.Air)
        expect(m.ground[c]).toBe(BlockType.地面)
      }
    }
    for (const a of m.spawns) for (const b of m.spawns) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(6)

    // 6.1 双密度按可放弹格统计（不计水）。
    const water = all.filter((c) => m.ground[c] === BlockType.水).length
    const perPlayer = (all.length - water) / 8
    expect(perPlayer).toBeGreaterThanOrEqual(26)
    expect(perPlayer).toBeLessThanOrEqual(30)
    const open = all.filter((c) => m.brick[c] === BlockType.Air && m.ground[c] !== BlockType.水).length
    expect(open / 8).toBeGreaterThanOrEqual(9)

    // 6.9 + Stage 2：水 ≤ 5%、最长跨度受限、每象限 3–4 格池塘与 3–4 个木箱。
    expect(water * 100).toBeLessThanOrEqual(5 * S * S)
    expect(longestWaterRun(S, m.ground)).toBeLessThanOrEqual(4)
    let qWater = 0
    let qCrates = 0
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        if (m.ground[y * S + x] === BlockType.水) qWater++
        if (m.brick[y * S + x] === BlockType.木箱) qCrates++
      }
    expect(qWater).toBeGreaterThanOrEqual(3)
    expect(qWater).toBeLessThanOrEqual(4)
    expect(qCrates).toBeGreaterThanOrEqual(3)
    expect(qCrates).toBeLessThanOrEqual(4)
  })

  it('is deterministic per seed and differs across seeds', () => {
    const a = generateMap(11, DEFAULT_CONFIG, DEFAULT_RULES, 8)
    const b = generateMap(11, DEFAULT_CONFIG, DEFAULT_RULES, 8)
    const c = generateMap(12, DEFAULT_CONFIG, DEFAULT_RULES, 8)
    expect(render(a)).toBe(render(b))
    expect(render(a)).not.toBe(render(c))
  })

  it('seed 1 layout snapshot (6.6 regression guard)', () => {
    expect(render(generateMap(1, DEFAULT_CONFIG, DEFAULT_RULES, 8))).toMatchSnapshot()
  })
})
