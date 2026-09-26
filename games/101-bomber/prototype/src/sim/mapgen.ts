import type { BomberConfig, ProtoRules } from '../contract'
import { BlockType } from '../contract'
import { mixSeed, Sfc32 } from './rng'

/**
 * 19×19 地图生成（design §5 / §5.3，Stage 2 材质按用户决定提前放入）：外圈铁皮 + 偶数行列交点铁皮柱、
 * 四象限镜像的积木（65%）、每象限一个池塘与 3–4 个木箱、8 个出生候选（4 角 L 形 + 4 边中点 T 形）。
 * 断言不过就换种子重来，最多 32 次，全失败直接抛错（生成器 bug，不静默降级）。
 */
export interface SpawnZone {
  readonly x: number
  readonly y: number
  /** 安全区格下标（含出生格本身）。 */
  readonly cells: readonly number[]
}

export interface GeneratedMap {
  readonly size: number
  readonly ground: Uint8Array
  readonly brick: Uint8Array
  readonly spawns: readonly SpawnZone[]
  /** 通过断言的是第几次尝试（0 起）。 */
  readonly attempt: number
}

const MAX_ATTEMPTS = 32
/** design §5.3 断言 3「连片水域最长跨度有上限」：原型取 4 格（推断待验证）。 */
export const MAX_WATER_RUN = 4
const DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

export function isFixedWall(x: number, y: number, size: number): boolean {
  return x === 0 || y === 0 || x === size - 1 || y === size - 1 || (x % 2 === 0 && y % 2 === 0)
}

/** 四象限镜像轨道（去重），镜像轴 X = mid、Y = mid。 */
export function mirrorOrbit(x: number, y: number, size: number): number[] {
  const out: number[] = []
  for (const [mx, my] of [
    [x, y],
    [size - 1 - x, y],
    [x, size - 1 - y],
    [size - 1 - x, size - 1 - y],
  ] as const) {
    const c = my * size + mx
    if (!out.includes(c)) out.push(c)
  }
  return out
}

export function spawnZones(size: number): SpawnZone[] {
  const e = size - 2
  const mid = (size - 1) / 2
  const zone = (x: number, y: number, arms: readonly (readonly [number, number])[]): SpawnZone => ({
    x,
    y,
    cells: [y * size + x, ...arms.map(([dx, dy]) => (y + dy) * size + (x + dx))],
  })
  return [
    zone(1, 1, [[1, 0], [0, 1]]),
    zone(e, 1, [[-1, 0], [0, 1]]),
    zone(1, e, [[1, 0], [0, -1]]),
    zone(e, e, [[-1, 0], [0, -1]]),
    zone(mid, 1, [[-1, 0], [1, 0], [0, 1]]),
    zone(1, mid, [[0, -1], [0, 1], [1, 0]]),
    zone(e, mid, [[0, -1], [0, 1], [-1, 0]]),
    zone(mid, e, [[-1, 0], [1, 0], [0, -1]]),
  ]
}

export function generateMap(seed: number, cfg: BomberConfig, rules: ProtoRules, playerCount: number): GeneratedMap {
  const size = cfg.mapSize
  const mid = (size - 1) / 2
  if (size < 11 || size % 2 === 0 || mid % 2 === 0) throw new Error(`mapgen: unsupported mapSize ${size}`)
  const failures: string[] = []
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const rng = new Sfc32(mixSeed(seed, 0x5eed + k), 'map')
    const m = buildCandidate(rng, size, rules, k)
    const errs = validateMap(m, cfg, rules, playerCount)
    if (errs.length === 0) return m
    failures.push(`#${k}: ${errs[0]}`)
  }
  throw new Error(`mapgen: no valid map after ${MAX_ATTEMPTS} attempts (seed ${seed}): ${failures.slice(0, 4).join('; ')}`)
}

function buildCandidate(rng: Sfc32, size: number, rules: ProtoRules, attempt: number): GeneratedMap {
  const mid = (size - 1) / 2
  const n = size * size
  const brick = new Uint8Array(n)
  const ground = new Uint8Array(n).fill(BlockType.地面)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (isFixedWall(x, y, size)) brick[y * size + x] = BlockType.铁皮
  const spawns = spawnZones(size)
  const reserved = new Uint8Array(n)
  for (const z of spawns) for (const c of z.cells) reserved[c] = 1

  // 池塘 / 木箱只在象限内部 [1, mid−1]² 选，镜像后四份互不重叠。
  const inQuadrant = (c: number): boolean => {
    const x = c % size
    const y = Math.floor(c / size)
    return x >= 1 && y >= 1 && x <= mid - 1 && y <= mid - 1
  }
  const pondDomain: number[] = []
  for (let y = 1; y <= mid - 1; y++)
    for (let x = 1; x <= mid - 1; x++) {
      const c = y * size + x
      if (!isFixedWall(x, y, size) && !reserved[c]) pondDomain.push(c)
    }

  const [pMin, pMax] = rules.pondCellsPerQuadrant
  if (pMax > 0 && pondDomain.length > 0) {
    const target = rng.NextInt(pMin, pMax + 1)
    let pond: number[] = []
    for (let tries = 0; tries < 16 && pond.length < target; tries++) {
      pond = [pondDomain[rng.NextInt(0, pondDomain.length)]]
      while (pond.length < target) {
        const frontier: number[] = []
        for (const c of pond) {
          const x = c % size
          const y = Math.floor(c / size)
          for (const [dx, dy] of DIRS) {
            const nc = (y + dy) * size + (x + dx)
            if (pondDomain.includes(nc) && !pond.includes(nc) && !frontier.includes(nc)) frontier.push(nc)
          }
        }
        if (frontier.length === 0) break
        pond.push(frontier[rng.NextInt(0, frontier.length)])
      }
    }
    for (const c of pond) for (const o of mirrorOrbit(c % size, Math.floor(c / size), size)) ground[o] = BlockType.水
  }

  for (let y = 0; y <= mid; y++)
    for (let x = 0; x <= mid; x++) {
      if (isFixedWall(x, y, size)) continue
      const orbit = mirrorOrbit(x, y, size)
      if (orbit.some((c) => reserved[c] || ground[c] === BlockType.水)) continue
      if (rng.NextInt(0, 1000) < rules.softBrickPermille) for (const c of orbit) brick[c] = BlockType.积木
    }

  const [cMin, cMax] = rules.cratesPerQuadrant
  if (cMax > 0) {
    const want = rng.NextInt(cMin, cMax + 1)
    const soft: number[] = []
    for (let c = 0; c < n; c++) if (inQuadrant(c) && brick[c] === BlockType.积木) soft.push(c)
    for (let i = 0; i < want && soft.length > 0; i++) {
      const c = soft.splice(rng.NextInt(0, soft.length), 1)[0]
      for (const o of mirrorOrbit(c % size, Math.floor(c / size), size)) brick[o] = BlockType.木箱
    }
  }
  return { size, ground, brick, spawns, attempt }
}

/** 多源 BFS 距离；passable 为 false 的格不进队，未到达为 -1。 */
function bfs(size: number, sources: readonly number[], passable: (c: number) => boolean): Int32Array {
  const dist = new Int32Array(size * size).fill(-1)
  const q: number[] = []
  for (const s of sources) if (passable(s) && dist[s] < 0) {
    dist[s] = 0
    q.push(s)
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const x = c % size
    const y = Math.floor(c / size)
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const nc = ny * size + nx
      if (dist[nc] >= 0 || !passable(nc)) continue
      dist[nc] = dist[c] + 1
      q.push(nc)
    }
  }
  return dist
}

/** design §5.3 断言与矩阵 6.1–6.5 / 6.7 / 6.9；返回失败项（空 = 通过）。 */
export function validateMap(m: GeneratedMap, cfg: BomberConfig, rules: ProtoRules, playerCount: number): string[] {
  const errs: string[] = []
  const { size, ground, brick, spawns } = m
  const n = size * size
  const mid = (size - 1) / 2
  const walkable = (c: number): boolean => brick[c] !== BlockType.铁皮
  const land = (c: number): boolean => walkable(c) && ground[c] !== BlockType.水
  const open = (c: number): boolean => brick[c] === BlockType.Air

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = y * size + x
      if (isFixedWall(x, y, size) !== (brick[c] === BlockType.铁皮)) errs.push(`hard-brick layout broken at ${x},${y}`)
      if (ground[c] !== BlockType.地面 && ground[c] !== BlockType.水) errs.push(`ground layer not solid at ${x},${y}`)
      if (ground[c] === BlockType.水 && brick[c] !== BlockType.Air) errs.push(`brick above water at ${x},${y}`)
      for (const o of mirrorOrbit(x, y, size))
        if (brick[o] !== brick[c] || ground[o] !== ground[c]) {
          errs.push(`mirror symmetry broken at ${x},${y}`)
          break
        }
    }

  let walkCount = 0
  let landCount = 0
  let openBombable = 0
  let water = 0
  let firstWalk = -1
  let firstLand = -1
  for (let c = 0; c < n; c++) {
    if (!walkable(c)) continue
    walkCount++
    if (firstWalk < 0) firstWalk = c
    if (ground[c] === BlockType.水) water++
    else {
      landCount++
      if (firstLand < 0) firstLand = c
      if (open(c)) openBombable++
    }
  }
  const allReach = bfs(size, [firstWalk], walkable)
  const landReach = bfs(size, [firstLand], land)
  let reachedAll = 0
  let reachedLand = 0
  for (let c = 0; c < n; c++) {
    if (allReach[c] >= 0) reachedAll++
    if (landReach[c] >= 0) reachedLand++
  }
  if (reachedAll !== walkCount) errs.push('not connected with soft bricks cleared')
  if (reachedLand !== landCount) errs.push('a land cell is only reachable through water')

  if (spawns.length < Math.max(8, playerCount)) errs.push(`only ${spawns.length} spawn candidates`)
  for (const z of spawns)
    for (const c of z.cells)
      if (!(c >= 0 && c < n) || brick[c] !== BlockType.Air || ground[c] !== BlockType.地面) errs.push(`spawn zone ${z.x},${z.y} not clear`)
  for (let i = 0; i < spawns.length; i++)
    for (let j = i + 1; j < spawns.length; j++) {
      const d = Math.abs(spawns[i].x - spawns[j].x) + Math.abs(spawns[i].y - spawns[j].y)
      if (d < rules.spawnMinDistance) errs.push(`spawns ${i},${j} only ${d} apart`)
    }

  const perPlayer = landCount / playerCount
  if (playerCount === 8 ? perPlayer < 26 || perPlayer > 30 : perPlayer < 26) errs.push(`potential bombable per player ${perPlayer.toFixed(2)} out of band`)
  if (openBombable / playerCount < 9) errs.push(`initial open bombable per player ${(openBombable / playerCount).toFixed(2)} < 9`)

  const isCover = (c: number): boolean => {
    const x = c % size
    const y = Math.floor(c / size)
    return DIRS.some(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      return nx >= 0 && ny >= 0 && nx < size && ny < size && brick[ny * size + nx] === BlockType.铁皮
    })
  }
  const coverCleared: number[] = []
  const coverOpen: number[] = []
  for (let c = 0; c < n; c++) {
    if (!walkable(c) || !isCover(c)) continue
    coverCleared.push(c)
    if (open(c)) coverOpen.push(c)
  }
  const dCleared = bfs(size, coverCleared, walkable)
  for (let c = 0; c < n; c++)
    if (walkable(c) && (dCleared[c] < 0 || dCleared[c] > cfg.coverReachCells)) {
      errs.push(`cell ${c % size},${Math.floor(c / size)} too far from cover (cleared)`)
      break
    }
  // 带砖时只查出生点可达的开放区：被积木围死的孤格没人进得去，不构成断言对象。
  const dOpen = bfs(size, coverOpen, open)
  const fromSpawn = bfs(
    size,
    spawns.map((z) => z.cells[0]),
    open,
  )
  for (let c = 0; c < n; c++)
    if (fromSpawn[c] >= 0 && (dOpen[c] < 0 || dOpen[c] > cfg.coverReachCells)) {
      errs.push(`cell ${c % size},${Math.floor(c / size)} too far from cover (initial)`)
      break
    }

  if (water * 100 > 5 * n) errs.push(`water ${water} cells > 5%`)
  if (longestWaterRun(size, ground) > MAX_WATER_RUN) errs.push('water run too long')

  const [pMin, pMax] = rules.pondCellsPerQuadrant
  const [cMin, cMax] = rules.cratesPerQuadrant
  let qWater = 0
  let qCrates = 0
  for (let y = 0; y < mid; y++)
    for (let x = 0; x < mid; x++) {
      const c = y * size + x
      if (ground[c] === BlockType.水) qWater++
      if (brick[c] === BlockType.木箱) qCrates++
    }
  if (qWater < pMin || qWater > pMax) errs.push(`pond cells per quadrant ${qWater} not in [${pMin}, ${pMax}]`)
  if (qCrates < cMin || qCrates > cMax) errs.push(`crates per quadrant ${qCrates} not in [${cMin}, ${cMax}]`)
  return errs
}

export function longestWaterRun(size: number, ground: Uint8Array): number {
  let best = 0
  for (let y = 0; y < size; y++) {
    let runH = 0
    let runV = 0
    for (let x = 0; x < size; x++) {
      runH = ground[y * size + x] === BlockType.水 ? runH + 1 : 0
      runV = ground[x * size + y] === BlockType.水 ? runV + 1 : 0
      best = Math.max(best, runH, runV)
    }
  }
  return best
}
