import {
  BlockType,
  BombKind,
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  MatchPhase,
  PickupKind,
  type AbilityActivation,
  type BombView,
  type ChestView,
  type FinalCircleView,
  type PickupView,
  type PlayerView,
  type U64,
  type WorldSnapshot,
} from '../contract'

/**
 * 手搭 WorldSnapshot（Bot 测试不能 import sim）。地图用字符画，每行一个游戏 Y：
 *   `#` 铁皮  `b` 积木  `c` 木箱  `~` 水（地面层）  `.` 空地
 */
export const config = DEFAULT_CONFIG
export const rules = DEFAULT_RULES

/** 标准 19×19：外圈铁皮 + 偶数行列交点铁皮柱，其余空地。 */
export function standardMap(size = 19): string[] {
  const rows: string[] = []
  for (let y = 0; y < size; y++) {
    let r = ''
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
      r += edge || (x % 2 === 0 && y % 2 === 0) ? '#' : '.'
    }
    rows.push(r)
  }
  return rows
}

/** 在字符画上改一格。 */
export function setCell(map: string[], X: number, Y: number, ch: string): string[] {
  const out = map.slice()
  out[Y] = out[Y].slice(0, X) + ch + out[Y].slice(X + 1)
  return out
}

export interface PlayerSpec {
  id: U64
  X: number
  Y: number
  /** 相对格心的偏移（千分格）。 */
  offX?: number
  offY?: number
  power?: number
  bombs?: number
  speed?: number
  hp?: number
  /** 快照里的 HatCount（规则层按强化级数派生，ADR 0028；这里直接给值）。 */
  hats?: number
  protectedUntil?: number
  eliminated?: boolean
}

export interface BombSpec {
  id: U64
  X: number
  Y: number
  owner: U64
  fuseEndTick: number
  power?: number
  /** 已爆炸：给出起爆 Tick 与四臂 Reach（上、下、左、右）。 */
  exploded?: { at: number; reach: [number, number, number, number] }
}

export interface SnapSpec {
  map: string[]
  tick?: number
  players: PlayerSpec[]
  bombs?: BombSpec[]
  pickups?: { id: U64; X: number; Y: number; kind: PickupKind; droppedBy?: U64; protectedUntilTick?: U64 }[]
  chests?: { id: U64; X: number; Y: number; hitsLeft?: number }[]
  king?: U64
  phase?: MatchPhase
  finalCircle?: FinalCircleView | null
  resource?: { initial: number; remaining: number }
}

const center = (X: number, Y: number, ox = 0, oy = 0): { x: number; y: number; z: number } => ({
  x: (X * 1000 + 500 + ox) / 1000,
  y: 1,
  z: (Y * 1000 + 500 + oy) / 1000,
})

export function makeSnapshot(s: SnapSpec): WorldSnapshot {
  const size = s.map.length
  const ground = new Uint8Array(size * size).fill(BlockType.地面)
  const brick = new Uint8Array(size * size).fill(BlockType.Air)
  for (let y = 0; y < size; y++) {
    if (s.map[y].length !== size) throw new Error(`row ${y} length ${s.map[y].length} != ${size}`)
    for (let x = 0; x < size; x++) {
      const ch = s.map[y][x]
      const i = y * size + x
      if (ch === '#') brick[i] = BlockType.铁皮
      else if (ch === 'b') brick[i] = BlockType.积木
      else if (ch === 'c') brick[i] = BlockType.木箱
      else if (ch === '~') ground[i] = BlockType.水
    }
  }
  const tick = s.tick ?? 100
  const players: PlayerView[] = s.players.map((p, k) => ({
    NetEntityIdRaw: p.id,
    LogicTransform: { WorldPosition: center(p.X, p.Y, p.offX, p.offY) },
    teleportTick: 0,
    BomberPlayerState: { HatCount: p.hats ?? 0, RespawnAtTick: 0, ProtectedUntilTick: p.protectedUntil ?? 0 },
    玩家属性: {
      血量当前: p.hp ?? config.maxHealthPoints,
      火力当前: p.power ?? config.initialBombPower,
      移速当前: p.speed ?? config.speedTierToCellsPerSecond[0],
      手上炸弹数当前: p.bombs ?? config.initialBombCapacity,
    },
    meta: { name: `p${p.id}`, isBot: true, animal: 'duck', slot: k },
    eliminated: p.eliminated ?? false,
  }))
  const bombs: BombView[] = (s.bombs ?? []).map((b) => ({
    NetEntityIdRaw: b.id,
    LogicTransform: { WorldPosition: center(b.X, b.Y) },
    teleportTick: 0,
    BomberBombState: {
      OwnerNetEntityIdRaw: b.owner,
      FuseEndTick: b.fuseEndTick,
      Power: b.power ?? 2,
      ChainId: 0,
      BombKind: BombKind.Standard,
      PierceLayers: 0,
      ExplodedAtTick: b.exploded?.at ?? 0,
      DangerUntilTick: b.exploded ? b.exploded.at + 8 : 0,
      BurnUntilTick: b.exploded ? b.exploded.at + 8 : 0,
      ReachUp: b.exploded?.reach[0] ?? 0,
      ReachDown: b.exploded?.reach[1] ?? 0,
      ReachLeft: b.exploded?.reach[2] ?? 0,
      ReachRight: b.exploded?.reach[3] ?? 0,
    },
  }))
  const pickups: PickupView[] = (s.pickups ?? []).map((p) => ({
    NetEntityIdRaw: p.id,
    LogicTransform: { WorldPosition: center(p.X, p.Y) },
    teleportTick: 0,
    BomberPickupItem: { Kind: p.kind },
    droppedBy: p.droppedBy ?? 0,
    protectedUntilTick: p.protectedUntilTick ?? 0,
  }))
  const chests: ChestView[] = (s.chests ?? []).map((c) => ({
    NetEntityIdRaw: c.id,
    LogicTransform: { WorldPosition: center(c.X, c.Y) },
    teleportTick: 0,
    chest: { HitsLeft: c.hitsLeft ?? rules.chestHitsRequired, HitsRequired: rules.chestHitsRequired, StageIndex: 0 },
  }))
  return {
    Tick: tick,
    BomberMatchState: {
      MatchTick: tick,
      StartTick: 0,
      EndTick: 7200,
      Phase: s.phase ?? MatchPhase.Running,
      HatKingNetEntityIdRaw: s.king ?? 0,
    },
    Players: players,
    Bombs: bombs,
    // ADR 0028：帽子 = 强化数，帽堆不再存在。
    HatPiles: [],
    Pickups: pickups,
    Chests: chests,
    Terrain: { size, ground, brick, rev: 1 },
    match: {
      matchIndex: 0,
      phaseEndTick: 7200,
      tickRateHz: config.tickRateHz,
      resourceInitial: s.resource?.initial ?? 0,
      resourceRemaining: s.resource?.remaining ?? 0,
      finalCircle: s.finalCircle ?? null,
    },
  }
}

export const cellIdx = (X: number, Y: number, size = 19): number => Y * size + X

/** 手搭决赛圈状态：ring / nextRing 为以棋盘中心为心的边长（格）。 */
export function finalCircle(opts: { tick?: number; ring?: number; next?: number; nextTick?: number; alive?: number; size?: number }): FinalCircleView {
  const size = opts.size ?? 19
  const c = (size - 1) / 2
  const rect = (s: number) => ({ Min: c - (s - 1) / 2, Max: c + (s - 1) / 2 })
  const tick = opts.tick ?? 100
  return {
    trigger: 'resource',
    startTick: tick - 50,
    endTick: tick + 1800,
    ring: opts.ring === undefined ? { Min: 1, Max: size - 2 } : rect(opts.ring),
    nextRing: opts.next === undefined ? null : rect(opts.next),
    nextRingTick: opts.next === undefined ? 0 : (opts.nextTick ?? tick + 200),
    stageIndex: opts.ring === undefined ? -1 : 0,
    aliveCount: opts.alive ?? 8,
  }
}

/**
 * 极简运动学替身（Bot 测试不能 import sim）：只做四向匀速移动、撞墙 / 砖 / 别人的炸弹停在格心、放弹占格。
 * 不做爆炸、转角吸附与输入缓冲——够验证「会不会原地来回抖、到达即放会不会被吞」这类决策问题。
 */
export interface MiniRun {
  placed: { id: U64; X: number; Y: number; tick: number }[]
  /** 每个 Tick 结束时各 Bot 所在格（"X,Y"）。 */
  cells: Map<U64, string[]>
}

export function runMini(
  spec: SnapSpec,
  brains: ReadonlyMap<U64, { decide(s: WorldSnapshot): AbilityActivation[] }>,
  ticks: number,
  stopAtFirstBomb = false,
): MiniRun {
  const size = spec.map.length
  const pos = new Map<U64, { mx: number; mz: number }>()
  for (const p of spec.players) pos.set(p.id, { mx: p.X * 1000 + 500 + (p.offX ?? 0), mz: p.Y * 1000 + 500 + (p.offY ?? 0) })
  const hand = new Map<U64, number>(spec.players.map((p) => [p.id, p.bombs ?? config.initialBombCapacity]))
  const bombs: BombSpec[] = (spec.bombs ?? []).slice()
  const out: MiniRun = { placed: [], cells: new Map() }
  const fuse = Math.floor((config.fuseMs * config.tickRateHz + 999) / 1000)
  const blocked = (X: number, Y: number, selfCell: string): boolean => {
    if (X < 0 || Y < 0 || X >= size || Y >= size) return true
    const ch = spec.map[Y][X]
    if (ch === '#' || ch === 'b' || ch === 'c') return true
    return `${X},${Y}` !== selfCell && bombs.some((b) => b.X === X && b.Y === Y)
  }
  let tick = spec.tick ?? 100
  for (let k = 0; k < ticks; k++) {
    const players = spec.players.map((p) => {
      const q = pos.get(p.id)!
      const X = Math.floor(q.mx / 1000)
      const Y = Math.floor(q.mz / 1000)
      return { ...p, X, Y, offX: q.mx - (X * 1000 + 500), offY: q.mz - (Y * 1000 + 500), bombs: hand.get(p.id) }
    })
    const snap = makeSnapshot({ ...spec, tick, players, bombs })
    for (const [id, brain] of brains) {
      const acts = brain.decide(snap)
      const q = pos.get(id)!
      const cx = Math.floor(q.mx / 1000)
      const cz = Math.floor(q.mz / 1000)
      const self = `${cx},${cz}`
      for (const a of acts) {
        if (a.ability !== '移动') continue
        const v = { 0: [0, 0], 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] }[a.输入.方向]
        const step = Math.floor((players.find((p) => p.id === id)?.speed ?? config.speedTierToCellsPerSecond[0]) / config.tickRateHz)
        const nx = q.mx + v[0] * step
        const nz = q.mz + v[1] * step
        const tx = Math.floor(nx / 1000)
        const tz = Math.floor(nz / 1000)
        if ((tx !== cx || tz !== cz) && blocked(tx, tz, self)) {
          q.mx = v[0] !== 0 ? cx * 1000 + 500 : q.mx
          q.mz = v[1] !== 0 ? cz * 1000 + 500 : q.mz
        } else {
          q.mx = nx
          q.mz = nz
        }
      }
      if (acts.some((a) => a.ability === '放弹') && (hand.get(id) ?? 0) > 0) {
        const X = Math.floor(q.mx / 1000)
        const Y = Math.floor(q.mz / 1000)
        if (!bombs.some((b) => b.X === X && b.Y === Y)) {
          bombs.push({ id: 1000 + out.placed.length, X, Y, owner: id, fuseEndTick: tick + 1 + fuse })
          hand.set(id, (hand.get(id) ?? 1) - 1)
          out.placed.push({ id, X, Y, tick: tick + 1 })
        }
      }
      const cells = out.cells.get(id) ?? []
      cells.push(`${Math.floor(q.mx / 1000)},${Math.floor(q.mz / 1000)}`)
      out.cells.set(id, cells)
    }
    tick++
    if (stopAtFirstBomb && out.placed.length > 0) break
  }
  return out
}
