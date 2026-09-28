import type { BomberConfig, MapTierRules, ProtoRules, ResourceBoxTier, ZoneRadii } from '../contract'
import { BlockType, centerDistance, ringZoneOf, ZONE_BOX } from '../contract'
import { mixSeed, Sfc32 } from './rng'

/**
 * 地图生成（design §5 / §5.0 / §5.3，Stage 2 材质按用户决定提前放入）：外圈铁皮 + 偶数行列交点铁皮柱、
 * 四象限镜像的积木（65%）、每象限一个池塘。断言不过就换种子重来，最多 32 次，全失败直接抛错（生成器 bug，不静默降级）。
 * - **19 档（旧地图，逐格不变）**：每象限 3–4 个木箱、8 个出生候选（4 角 L 形 + 4 边中点 T 形）；开局木箱不登记为分级资源箱
 *   （快照约定的「旧地图兼容：木箱 1 / 1」，掉落沿用旧木箱口径）。
 * - **23 / 27 档（原型扩展 NON-CONTRACT，ADR 0040）**：出生点 12 / 16 个（外圈，两两 ≥ spawnMinDistance）；27 档核心中央
 *   plazaSide × plazaSide 空地广场（去掉广场内的铁柱）；三圈三级资源箱按 `MapTierRules.boxes` 的数量四象限镜像布置
 *   （外圈木 / 中圈铁 / 核心金，砖层一律木箱，等级见 {@link GeneratedMap.boxes}）；密度按该档默认人数校验。
 */
export interface SpawnZone {
  readonly x: number
  readonly y: number
  /** 安全区格下标（含出生格本身）。 */
  readonly cells: readonly number[]
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：生成时布下的一个分级资源箱（砖层是木箱）。 */
export interface MapBox {
  readonly cell: number
  readonly tier: ResourceBoxTier
}

export interface GeneratedMap {
  readonly size: number
  readonly ground: Uint8Array
  readonly brick: Uint8Array
  readonly spawns: readonly SpawnZone[]
  /** 原型扩展（NON-CONTRACT，ADR 0040）：分级资源箱（按格下标升序）；19 档旧地图为空。 */
  readonly boxes: readonly MapBox[]
  /** 通过断言的是第几次尝试（0 起）。 */
  readonly attempt: number
}

const MAX_ATTEMPTS = 32
/** design §5.3 断言 3「连片水域最长跨度有上限」：原型取 4 格（推断待验证）。 */
export const MAX_WATER_RUN = 4
/** 原型扩展（NON-CONTRACT，ADR 0040）：保持旧地图（逐格不变、快照不改）的档位。 */
export const LEGACY_MAP_TIER = 19
const DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]
/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：23 / 27 档边上新增出生点的坐标（角在 1、离角 6 格 = spawnMinDistance；生成器模板，
 * 与旧 8 点的「角 + 边中点」同属固定布局，不进配置）。
 */
const SPAWN_EDGE_OFFSET = 7
/** 资源箱的布置顺序（核心 → 中圈 → 外圈，稀缺的先挑）。 */
const BOX_ORDER: readonly ResourceBoxTier[] = ['gold', 'iron', 'wood']

export function isFixedWall(x: number, y: number, size: number): boolean {
  return x === 0 || y === 0 || x === size - 1 || y === size - 1 || (x % 2 === 0 && y % 2 === 0)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：本局按分级布局生成的档（23 / 27）；19 档旧地图、或棋盘边长与规则里的档不一致（测试夹具）→ null。
 */
export function tieredLayout(size: number, rules: Pick<ProtoRules, 'map'>): MapTierRules | null {
  const m = rules.map
  return m && m.size === size && m.id !== LEGACY_MAP_TIER ? m : null
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §5.0 / §8.6）：核心中央广场的格下标（以棋盘中心为心、边长 plazaSide 的正方形）；
 * 该档没有广场、或棋盘边长与档不一致 → 空。广场开局全空地、去掉其中的铁柱，再生不长、中央大补给落在它中心。
 */
export function plazaCells(size: number, map: Pick<MapTierRules, 'size' | 'plazaSide'> | undefined): number[] {
  if (!map || map.size !== size || map.plazaSide <= 0) return []
  const mid = (size - 1) / 2
  const r = Math.floor(map.plazaSide / 2)
  const out: number[] = []
  for (let y = mid - r; y <= mid + r; y++) for (let x = mid - r; x <= mid + r; x++) out.push(y * size + x)
  return out
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：格所在的圈（按到棋盘中心的切比雪夫距离）。 */
export function cellZone(size: number, zones: ZoneRadii, cell: number) {
  return ringZoneOf(zones, centerDistance(size, cell % size, Math.floor(cell / size)))
}

/** 分级布局下的铁皮：外圈 + 偶数行列交点，广场内的铁柱去掉。 */
function tierWall(size: number, plaza: ReadonlySet<number>): (x: number, y: number) => boolean {
  return (x, y) => isFixedWall(x, y, size) && !plaza.has(y * size + x)
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

/**
 * 出生候选。19 档（及其它边长）= 旧的 8 个：4 角 L 形 + 4 边中点 T 形（顺序不变，快照测试靠它）。
 * 原型扩展（NON-CONTRACT，ADR 0040）：23 档 12 个 = 4 角 + 每边 x / y ∈ {7, size − 1 − 7}；27 档 16 个 = 旧 8 个 + 每边
 * x / y ∈ {7, size − 1 − 7}。全部在外圈边上（奇数坐标，T 形安全区的内侧臂落在奇数行 / 列，不碰铁柱），沿边间距 ≥ 6。
 */
export function spawnZones(size: number): SpawnZone[] {
  const e = size - 2
  const mid = (size - 1) / 2
  const zone = (x: number, y: number, arms: readonly (readonly [number, number])[]): SpawnZone => ({
    x,
    y,
    cells: [y * size + x, ...arms.map(([dx, dy]) => (y + dy) * size + (x + dx))],
  })
  const corners = [
    zone(1, 1, [[1, 0], [0, 1]]),
    zone(e, 1, [[-1, 0], [0, 1]]),
    zone(1, e, [[1, 0], [0, -1]]),
    zone(e, e, [[-1, 0], [0, -1]]),
  ]
  /** 四条边上坐标 k 处的 T 形出生点（上 / 左 / 右 / 下 各一，镜像成组）。 */
  const edges = (k: number): SpawnZone[] => [
    zone(k, 1, [[-1, 0], [1, 0], [0, 1]]),
    zone(1, k, [[0, -1], [0, 1], [1, 0]]),
    zone(e, k, [[0, -1], [0, 1], [-1, 0]]),
    zone(k, e, [[-1, 0], [1, 0], [0, -1]]),
  ]
  const extra = SPAWN_EDGE_OFFSET
  if (size === 23) return [...corners, ...edges(extra), ...edges(size - 1 - extra)]
  if (size === 27) return [...corners, ...edges(mid), ...edges(extra), ...edges(size - 1 - extra)]
  return [...corners, ...edges(mid)]
}

export function generateMap(seed: number, cfg: BomberConfig, rules: ProtoRules, playerCount: number): GeneratedMap {
  const size = cfg.mapSize
  const mid = (size - 1) / 2
  if (size < 11 || size % 2 === 0 || mid % 2 === 0) throw new Error(`mapgen: unsupported mapSize ${size}`)
  const tier = tieredLayout(size, rules)
  const failures: string[] = []
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const rng = new Sfc32(mixSeed(seed, 0x5eed + k), 'map')
    const m = tier ? buildTiered(rng, size, rules, tier, k) : buildCandidate(rng, size, rules, k)
    const errs = validateMap(m, cfg, rules, playerCount)
    if (errs.length === 0) return m
    failures.push(`#${k}: ${errs[0]}`)
  }
  throw new Error(`mapgen: no valid map after ${MAX_ATTEMPTS} attempts (seed ${seed}): ${failures.slice(0, 4).join('; ')}`)
}

/** 象限内部 [1, mid−1]² 里可以挖池塘的格（非铁皮、非保留格）；镜像后四份互不重叠。 */
function pondDomainOf(size: number, wall: (x: number, y: number) => boolean, reserved: Uint8Array): number[] {
  const mid = (size - 1) / 2
  const out: number[] = []
  for (let y = 1; y <= mid - 1; y++)
    for (let x = 1; x <= mid - 1; x++) {
      const c = y * size + x
      if (!wall(x, y) && !reserved[c]) out.push(c)
    }
  return out
}

/** 每象限一个连片池塘（pondCellsPerQuadrant 格），四象限镜像。 */
function growPonds(rng: Sfc32, size: number, rules: ProtoRules, pondDomain: readonly number[], ground: Uint8Array): void {
  const [pMin, pMax] = rules.pondCellsPerQuadrant
  if (pMax <= 0 || pondDomain.length === 0) return
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

/** 积木：按镜像轨道掷 softBrickPermille（跳过铁皮、保留格与水）。 */
function fillSoftBricks(rng: Sfc32, size: number, rules: ProtoRules, wall: (x: number, y: number) => boolean, reserved: Uint8Array, brick: Uint8Array, ground: Uint8Array): void {
  const mid = (size - 1) / 2
  for (let y = 0; y <= mid; y++)
    for (let x = 0; x <= mid; x++) {
      if (wall(x, y)) continue
      const orbit = mirrorOrbit(x, y, size)
      if (orbit.some((c) => reserved[c] || ground[c] === BlockType.水)) continue
      if (rng.NextInt(0, 1000) < rules.softBrickPermille) for (const c of orbit) brick[c] = BlockType.积木
    }
}

/** 19 档（旧地图）：逐格与方向 B 之前相同（快照测试不改即通过）；木箱不登记等级。 */
function buildCandidate(rng: Sfc32, size: number, rules: ProtoRules, attempt: number): GeneratedMap {
  const mid = (size - 1) / 2
  const n = size * size
  const brick = new Uint8Array(n)
  const ground = new Uint8Array(n).fill(BlockType.地面)
  const wall = (x: number, y: number): boolean => isFixedWall(x, y, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (wall(x, y)) brick[y * size + x] = BlockType.铁皮
  const spawns = spawnZones(size)
  const reserved = new Uint8Array(n)
  for (const z of spawns) for (const c of z.cells) reserved[c] = 1

  // 池塘 / 木箱只在象限内部 [1, mid−1]² 选，镜像后四份互不重叠。
  const inQuadrant = (c: number): boolean => {
    const x = c % size
    const y = Math.floor(c / size)
    return x >= 1 && y >= 1 && x <= mid - 1 && y <= mid - 1
  }
  growPonds(rng, size, rules, pondDomainOf(size, wall, reserved), ground)
  fillSoftBricks(rng, size, rules, wall, reserved, brick, ground)

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
  return { size, ground, brick, spawns, boxes: [], attempt }
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §5.0 / §5.3 断言 2）：23 / 27 档。铁皮（广场内的柱去掉）→ 保留出生安全区与广场 →
 * 池塘 → 积木 → 三级资源箱：每级 count / 4 个 / 象限，从「所在圈 = 该级的圈」的象限内部积木里随机挑，四象限镜像改成木箱。
 * 挑不够就留给断言判失败、换种子重来。
 */
function buildTiered(rng: Sfc32, size: number, rules: ProtoRules, tier: MapTierRules, attempt: number): GeneratedMap {
  const mid = (size - 1) / 2
  const n = size * size
  const brick = new Uint8Array(n)
  const ground = new Uint8Array(n).fill(BlockType.地面)
  const plaza = new Set(plazaCells(size, tier))
  const wall = tierWall(size, plaza)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (wall(x, y)) brick[y * size + x] = BlockType.铁皮
  const spawns = spawnZones(size)
  const reserved = new Uint8Array(n)
  for (const z of spawns) for (const c of z.cells) reserved[c] = 1
  for (const c of plaza) reserved[c] = 1

  growPonds(rng, size, rules, pondDomainOf(size, wall, reserved), ground)
  fillSoftBricks(rng, size, rules, wall, reserved, brick, ground)

  const boxes: MapBox[] = []
  for (const boxTier of BOX_ORDER) {
    const want = tier.boxes[boxTier].count
    if (want % 4 !== 0) throw new Error(`mapgen: ${boxTier} box count ${want} is not a multiple of 4 (mirrored quadrants)`)
    const soft: number[] = []
    for (let y = 1; y <= mid - 1; y++)
      for (let x = 1; x <= mid - 1; x++) {
        const c = y * size + x
        if (brick[c] === BlockType.积木 && ZONE_BOX[cellZone(size, tier.zones, c)] === boxTier) soft.push(c)
      }
    for (let i = 0; i < want / 4 && soft.length > 0; i++) {
      const c = soft.splice(rng.NextInt(0, soft.length), 1)[0]
      for (const o of mirrorOrbit(c % size, Math.floor(c / size), size)) {
        brick[o] = BlockType.木箱
        boxes.push({ cell: o, tier: boxTier })
      }
    }
  }
  boxes.sort((a, b) => a.cell - b.cell)
  return { size, ground, brick, spawns, boxes, attempt }
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

/**
 * design §5.3 断言与矩阵 6.1–6.5 / 6.7 / 6.9；返回失败项（空 = 通过）。
 * 原型扩展（NON-CONTRACT，ADR 0040）：23 / 27 档另查广场（开局全空地、广场内无铁柱）、1×1 中心格可进入、三级资源箱逐圈精确数量；
 * 密度按该档默认人数（地图只由种子与档决定，与本局实际人数无关）。19 档沿用旧口径（8 人时查区间，其余只查下限）。
 */
export function validateMap(m: GeneratedMap, cfg: BomberConfig, rules: ProtoRules, playerCount: number): string[] {
  const errs: string[] = []
  const { size, ground, brick, spawns } = m
  const n = size * size
  const mid = (size - 1) / 2
  const tier = tieredLayout(size, rules)
  const plaza = new Set(tier ? plazaCells(size, tier) : [])
  const wall = tierWall(size, plaza)
  const walkable = (c: number): boolean => brick[c] !== BlockType.铁皮
  const land = (c: number): boolean => walkable(c) && ground[c] !== BlockType.水
  const open = (c: number): boolean => brick[c] === BlockType.Air

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = y * size + x
      if (wall(x, y) !== (brick[c] === BlockType.铁皮)) errs.push(`hard-brick layout broken at ${x},${y}`)
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

  if (spawns.length < Math.max(tier ? tier.defaultPlayers : 8, playerCount)) errs.push(`only ${spawns.length} spawn candidates`)
  for (const z of spawns)
    for (const c of z.cells)
      if (!(c >= 0 && c < n) || brick[c] !== BlockType.Air || ground[c] !== BlockType.地面) errs.push(`spawn zone ${z.x},${z.y} not clear`)
  for (let i = 0; i < spawns.length; i++)
    for (let j = i + 1; j < spawns.length; j++) {
      const d = Math.abs(spawns[i].x - spawns[j].x) + Math.abs(spawns[i].y - spawns[j].y)
      if (d < rules.spawnMinDistance) errs.push(`spawns ${i},${j} only ${d} apart`)
    }

  // 分级档按该档默认人数查区间（ADR 0040：27 档 16 人）；19 档旧口径：8 人查区间，其余人数只查下限。
  const densityPlayers = tier ? tier.defaultPlayers : playerCount
  const band = tier !== null || playerCount === 8
  const perPlayer = landCount / densityPlayers
  if (band ? perPlayer < 26 || perPlayer > 30 : perPlayer < 26) errs.push(`potential bombable per player ${perPlayer.toFixed(2)} out of band`)
  if (openBombable / densityPlayers < 9) errs.push(`initial open bombable per player ${(openBombable / densityPlayers).toFixed(2)} < 9`)

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
  if (tier) validateTier(m, tier, plaza, errs)
  else if (qCrates < cMin || qCrates > cMax) errs.push(`crates per quadrant ${qCrates} not in [${cMin}, ${cMax}]`)
  return errs
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：广场全空地、中心 1×1 可进入（非铁皮、非水）、三级资源箱逐圈精确且登记一致。 */
function validateTier(m: GeneratedMap, tier: MapTierRules, plaza: ReadonlySet<number>, errs: string[]): void {
  const { size, ground, brick } = m
  const mid = (size - 1) / 2
  for (const c of plaza) if (brick[c] !== BlockType.Air || ground[c] !== BlockType.地面) errs.push(`plaza cell ${c % size},${Math.floor(c / size)} not open land`)
  const center = mid * size + mid
  if (brick[center] === BlockType.铁皮 || ground[center] !== BlockType.地面) errs.push('center 1×1 cell not enterable')
  const want = { outer: tier.boxes[ZONE_BOX.outer].count, mid: tier.boxes[ZONE_BOX.mid].count, core: tier.boxes[ZONE_BOX.core].count }
  const got = { outer: 0, mid: 0, core: 0 }
  for (let c = 0; c < size * size; c++) if (brick[c] === BlockType.木箱) got[cellZone(size, tier.zones, c)]++
  for (const z of ['outer', 'mid', 'core'] as const) if (got[z] !== want[z]) errs.push(`${z} ring has ${got[z]} boxes, want ${want[z]}`)
  const listed = new Set<number>()
  for (const b of m.boxes) {
    listed.add(b.cell)
    if (brick[b.cell] !== BlockType.木箱 || b.tier !== ZONE_BOX[cellZone(size, tier.zones, b.cell)]) errs.push(`box ${b.cell % size},${Math.floor(b.cell / size)} registry mismatch`)
  }
  if (listed.size !== got.outer + got.mid + got.core || listed.size !== m.boxes.length) errs.push('box registry does not match the brick layer')
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
