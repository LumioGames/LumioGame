import { BlockType, MATERIALS } from '../../src/contract'

/**
 * 穿透规则的共享夹具（唯一口径见 src/contract/skills.ts 文件头）：规则层 explosion.ts、Bot traceBlast、
 * 表现层 computeFireCross 都拿这些用例对照，免得三份实现各走各的。
 *
 * 棋盘 7×7，炸弹恒在中心 (3,3)。图例：'.' 空地 · '#' 铁皮 · 'b' 积木 · 'c' 木箱 · 'C' 宝箱（砖层空）· '~' 水（砖层空）。
 * 期望值是手算的；{@link referenceCross} 是按规则直译的参考实现，本文件自己的用例（contract-tables.test.ts）验证两者一致。
 */
export interface PierceBoard {
  size: number
  brick: Uint8Array
  ground: Uint8Array
  /** 宝箱格下标。 */
  chests: readonly number[]
}

export interface PierceCase {
  name: string
  rows: readonly string[]
  power: number
  pierceLayers: number
  /** 覆盖格（含中心），[x, y]，顺序不限。 */
  covered: readonly (readonly [number, number])[]
  /** [上, 下, 左, 右]（上 = −Y）。 */
  reach: readonly [number, number, number, number]
  /** 被摧毁的砖格（含被穿透的），[x, y]，顺序不限。 */
  bricks: readonly (readonly [number, number])[]
  /** 被命中的宝箱格。 */
  chestsHit: readonly (readonly [number, number])[]
}

export const PIERCE_BOMB = { x: 3, y: 3 } as const

export function parsePierceBoard(rows: readonly string[]): PierceBoard {
  const size = rows.length
  const brick = new Uint8Array(size * size)
  const ground = new Uint8Array(size * size).fill(BlockType.地面)
  const chests: number[] = []
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`pierce board row ${y} is ${row.length} wide, expected ${size}`)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const ch = row[x]
      if (ch === '#') brick[i] = BlockType.铁皮
      else if (ch === 'b') brick[i] = BlockType.积木
      else if (ch === 'c') brick[i] = BlockType.木箱
      else if (ch === '~') ground[i] = BlockType.水
      else if (ch === 'C') chests.push(i)
      else if (ch !== '.') throw new Error(`pierce board: unknown '${ch}'`)
    }
  })
  return { size, brick, ground, chests }
}

const ARMS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

/** 按唯一口径直译的参考十字（不引爆、不写砖）。 */
export function referenceCross(
  b: PierceBoard,
  x0: number,
  y0: number,
  power: number,
  pierceLayers: number,
): { covered: number[]; reach: [number, number, number, number]; bricks: number[]; chestsHit: number[] } {
  const size = b.size
  const covered = [y0 * size + x0]
  const reach: [number, number, number, number] = [0, 0, 0, 0]
  const bricks: number[] = []
  const chestsHit: number[] = []
  for (let a = 0; a < 4; a++) {
    const [dx, dy] = ARMS[a]
    let pierced = 0
    for (let s = 1; s <= power; s++) {
      const x = x0 + dx * s
      const y = y0 + dy * s
      if (x < 0 || y < 0 || x >= size || y >= size) break
      const c = y * size + x
      const fire = MATERIALS[b.brick[c] as BlockType].fire
      if (fire === 'stopBefore') break
      if (b.chests.includes(c)) {
        chestsHit.push(c)
        break
      }
      if (fire === 'destroyThenStop') {
        bricks.push(c)
        if (pierced >= pierceLayers) break
        pierced++
        reach[a] = s
        covered.push(c)
        continue
      }
      reach[a] = s
      covered.push(c)
      if (MATERIALS[b.ground[c] as BlockType].fire === 'coverThenStop') break
    }
  }
  return { covered, reach, bricks, chestsHit }
}

const OPEN = '.......'

export const PIERCE_CASES: readonly PierceCase[] = [
  {
    name: 'standard bomb: a brick is destroyed and stops the arm, not covered',
    rows: [OPEN, OPEN, OPEN, '.....b.', OPEN, OPEN, OPEN],
    power: 3,
    pierceLayers: 0,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 4],
      [3, 5],
      [3, 6],
      [2, 3],
      [1, 3],
      [0, 3],
      [4, 3],
    ],
    reach: [3, 3, 3, 1],
    bricks: [[5, 3]],
    chestsHit: [],
  },
  {
    name: 'pierce 1: first brick covered and in Reach, second destroyed and stops',
    rows: [OPEN, OPEN, OPEN, '....bc.', OPEN, OPEN, OPEN],
    power: 3,
    pierceLayers: 1,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 4],
      [3, 5],
      [3, 6],
      [2, 3],
      [1, 3],
      [0, 3],
      [4, 3],
    ],
    reach: [3, 3, 3, 1],
    bricks: [
      [4, 3],
      [5, 3],
    ],
    chestsHit: [],
  },
  {
    name: 'pierce 2 with three bricks: two covered, third destroyed and stops',
    rows: ['...b...', '...b...', '...b...', OPEN, OPEN, OPEN, OPEN],
    power: 3,
    pierceLayers: 2,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 4],
      [3, 5],
      [3, 6],
      [2, 3],
      [1, 3],
      [0, 3],
      [4, 3],
      [5, 3],
      [6, 3],
    ],
    reach: [2, 3, 3, 3],
    bricks: [
      [3, 2],
      [3, 1],
      [3, 0],
    ],
    chestsHit: [],
  },
  {
    name: 'pierce 99: the whole line within power, limited by power',
    rows: [OPEN, OPEN, OPEN, 'bb.....', OPEN, OPEN, OPEN],
    power: 2,
    pierceLayers: 99,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 4],
      [3, 5],
      [2, 3],
      [1, 3],
      [4, 3],
      [5, 3],
    ],
    reach: [2, 2, 2, 2],
    bricks: [[1, 3]],
    chestsHit: [],
  },
  {
    name: 'iron stops every bomb, pierce or not',
    rows: [OPEN, OPEN, OPEN, '....#b.', OPEN, OPEN, OPEN],
    power: 3,
    pierceLayers: 99,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 4],
      [3, 5],
      [3, 6],
      [2, 3],
      [1, 3],
      [0, 3],
    ],
    reach: [3, 3, 3, 0],
    bricks: [],
    chestsHit: [],
  },
  {
    name: 'a chest behind a pierced brick is hit and stops the arm, chest cell not covered',
    rows: [OPEN, OPEN, OPEN, '....bC.', OPEN, OPEN, OPEN],
    power: 3,
    pierceLayers: 1,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 4],
      [3, 5],
      [3, 6],
      [2, 3],
      [1, 3],
      [0, 3],
      [4, 3],
    ],
    reach: [3, 3, 3, 1],
    bricks: [[4, 3]],
    chestsHit: [[5, 3]],
  },
  {
    name: 'water is covered, then the arm stops',
    rows: [OPEN, OPEN, OPEN, OPEN, '...~...', OPEN, OPEN],
    power: 3,
    pierceLayers: 1,
    covered: [
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 4],
      [2, 3],
      [1, 3],
      [0, 3],
      [4, 3],
      [5, 3],
      [6, 3],
    ],
    reach: [3, 1, 3, 3],
    bricks: [],
    chestsHit: [],
  },
]
