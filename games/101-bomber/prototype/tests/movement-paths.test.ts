import { describe, expect, it } from 'vitest'
import { BlockType, 方向, type ProtoRules } from '../src/contract'
import { InputState } from '../src/input/keyboard'
import { DIR_VEC } from '../src/shared/grid'
import { computeDangerCells } from '../src/sim/explosion'
import { makeWorld, put, setBrick, setGround, step } from '../src/sim/__tests__/helpers'
import type { SimPlayer, World } from '../src/sim/world'

/**
 * 手感验收（ADR 0032，第 4 轮工作项 C）：10 条固定按键脚本经真实 InputState 进规则替身，
 * 用一个**不依赖 move.ts** 的「卡住」判官逐 Tick 检查：
 *   卡住 = 位置没变，但按住的某个方向（最新按下的键 + 在它之下最近按下的垂直键）按规则（含吸附）本可以走。
 * 另断言：到达目标不超预算、P1–P4 四个朝向用时相同、通道不变式、没有来回抖动（迟按一次回吸除外）。
 */

const LOCAL = 2
const MILLI = 1000
const HALF = 500

/** 键码 → 方向（与 keyboard.ts 同一张物理键表，但判官自己维护按下顺序）。 */
const DIR_OF: Readonly<Record<string, 方向>> = {
  KeyW: 方向.上,
  ArrowUp: 方向.上,
  KeyS: 方向.下,
  ArrowDown: 方向.下,
  KeyA: 方向.左,
  ArrowLeft: 方向.左,
  KeyD: 方向.右,
  ArrowRight: 方向.右,
}

const horizontal = (d: 方向): boolean => d === 方向.左 || d === 方向.右

interface KeyEvent {
  /** Tick 序号（0 = 第一次 poll 之前），或按玩家当前位置判定（第一次为真时触发一次）。 */
  at: number | ((p: SimPlayer) => boolean)
  down?: readonly string[]
  up?: readonly string[]
}

interface PathCase {
  id: string
  scenario: string
  start: readonly [number, number]
  bricks?: readonly (readonly [number, number])[]
  water?: readonly (readonly [number, number])[]
  keys: readonly KeyEvent[]
  goal: readonly [number, number]
  budget: number
  /** 手算后钉住的到达 Tick（到达时已走过的 Tick 数）。 */
  reachedAt: number
  reversals: number
  forbidden?: readonly (readonly [number, number])[]
}

interface Trace {
  stuck: number
  stuckTicks: number[]
  reachedAt: number | null
  reversals: number
  laneBroken: number
  dangerSeen: number
  visited: Set<string>
  fired: { tick: number; mx: number; my: number }[]
}

// ---------- 独立判官 ----------

function open(w: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w.size || y >= w.size) return false
  const c = y * w.size + x
  if (w.brick[c] !== BlockType.Air) return false
  if (w.bombs.some((b) => b.cell === c && b.explodedAtTick === 0)) return false
  return !w.chests.some((ch) => ch.cell === c)
}

/** 下一 Tick 的吸附阈值：连续吸附沿用起始阈值；窗口内再吸附用弱阈值；否则正常阈值。 */
function snapTolerance(w: World, p: SimPlayer): number {
  const next = w.t + 1
  if (p.lastAssistTick === next - 1) return p.assistTol
  return next - p.lastAssistTick <= w.rules.assistRepeatWindowTicks ? w.rules.cornerAssistRepeatMilli : w.rules.cornerAssistMilli
}

/** 规则上 d 这一步能不能走动（不含危险格：本文件的场景在判定期内都没有危险格，另有断言守着）。 */
function reachable(w: World, p: SimPlayer, d: 方向): boolean {
  const { dx, dy } = DIR_VEC[d]
  const h = horizontal(d)
  const perp = h ? p.my : p.mx
  const lane = Math.floor(perp / MILLI)
  const off = perp - (lane * MILLI + HALF)
  const alongPos = h ? p.mx : p.my
  const along = Math.floor(alongPos / MILLI)
  const sgn = h ? dx : dy
  if (off !== 0) {
    if (Math.abs(off) > snapTolerance(w, p)) return false
    return h ? open(w, along + sgn, lane) : open(w, lane, along + sgn)
  }
  const centre = along * MILLI + HALF
  if ((centre - alongPos) * sgn > 0) return true
  return h ? open(w, along + sgn, lane) : open(w, lane, along + sgn)
}

/** 物理按键顺序 → 判官眼里「按住的有效方向」：最新键 + 其下最近按下的垂直键（反向键不算）。 */
function eligible(held: readonly string[]): 方向[] {
  if (held.length === 0) return []
  const top = DIR_OF[held[held.length - 1]]
  for (let i = held.length - 2; i >= 0; i--) {
    const d = DIR_OF[held[i]]
    if (horizontal(d) !== horizontal(top)) return [top, d]
  }
  return [top]
}

/** 下一 Tick 规则层看到的危险格（stepWorld 先 t++ 再算）。 */
function dangerNext(w: World): number {
  w.t++
  const d = computeDangerCells(w)
  w.t--
  return d.reduce((a, b) => a + b, 0)
}

// ---------- 驱动 ----------

function board(c: PathCase, rules: Partial<ProtoRules> = {}): { w: World; p: SimPlayer } {
  const w = makeWorld({ rules })
  put(w, 1, 15, 15)
  const p = put(w, LOCAL, c.start[0], c.start[1])
  for (const [x, y] of c.bricks ?? []) setBrick(w, x, y, BlockType.积木)
  for (const [x, y] of c.water ?? []) setGround(w, x, y, BlockType.水)
  return { w, p }
}

function drive(c: PathCase, rules: Partial<ProtoRules> = {}, maxTicks = c.budget): Trace {
  const { w, p } = board(c, rules)
  const input = new InputState()
  const held: string[] = []
  const pending = [...c.keys]
  const tr: Trace = { stuck: 0, stuckTicks: [], reachedAt: null, reversals: 0, laneBroken: 0, dangerSeen: 0, visited: new Set(), fired: [] }
  const lastSign = { x: 0, y: 0 }
  const gx = c.goal[0] * MILLI + HALF
  const gy = c.goal[1] * MILLI + HALF
  for (let tick = 0; tick < maxTicks; tick++) {
    let bomb = false
    for (let i = 0; i < pending.length; ) {
      const e = pending[i]
      if (typeof e.at === 'number' ? e.at !== tick : !e.at(p)) {
        i++
        continue
      }
      pending.splice(i, 1)
      tr.fired.push({ tick, mx: p.mx, my: p.my })
      for (const k of e.up ?? []) {
        input.keyUp(k)
        const j = held.indexOf(k)
        if (j >= 0) held.splice(j, 1)
      }
      for (const k of e.down ?? []) {
        input.keyDown(k, false)
        if (k === 'Space') bomb = true
        else {
          const j = held.indexOf(k)
          if (j >= 0) held.splice(j, 1)
          held.push(k)
        }
      }
    }
    if (bomb) input.keyUp('Space')
    tr.dangerSeen += dangerNext(w)
    const could = eligible(held).some((d) => reachable(w, p, d))
    const x0 = p.mx
    const y0 = p.my
    step(w, { [LOCAL]: input.poll() })
    if (p.mx === x0 && p.my === y0 && could) {
      tr.stuck++
      tr.stuckTicks.push(tick)
    }
    if ((p.mx - HALF) % MILLI !== 0 && (p.my - HALF) % MILLI !== 0) tr.laneBroken++
    for (const [axis, d] of [
      ['x', p.mx - x0],
      ['y', p.my - y0],
    ] as const) {
      const s = Math.sign(d)
      if (s === 0) continue
      if (lastSign[axis] !== 0 && s !== lastSign[axis]) tr.reversals++
      lastSign[axis] = s
    }
    tr.visited.add(`${Math.floor(p.mx / MILLI)},${Math.floor(p.my / MILLI)}`)
    if (p.mx === gx && p.my === gy) {
      tr.reachedAt = tick + 1
      break
    }
  }
  return tr
}

// ---------- 10 条路径 ----------

const D = 'KeyD'
const A = 'KeyA'
const W = 'KeyW'
const S = 'KeyS'

const PATHS: readonly PathCase[] = [
  {
    id: 'P1',
    scenario: 'along a wall, turn in: 右 → 上 (both held)',
    start: [1, 3],
    bricks: [[1, 2], [3, 2], [5, 2]],
    keys: [{ at: 0, down: [D] }, { at: 2, down: [W] }],
    goal: [7, 1],
    budget: 55,
    reachedAt: 46,
    reversals: 0,
  },
  {
    id: 'P2',
    scenario: 'along a wall, turn in: 左 → 下 (both held)',
    start: [17, 15],
    bricks: [[17, 16], [15, 16], [13, 16]],
    keys: [{ at: 0, down: [A] }, { at: 2, down: [S] }],
    goal: [11, 17],
    budget: 55,
    reachedAt: 46,
    reversals: 0,
  },
  {
    id: 'P3',
    scenario: 'along a wall, turn in: 下 → 左 (both held)',
    start: [3, 1],
    bricks: [[2, 1], [2, 3], [2, 5]],
    keys: [{ at: 0, down: [S] }, { at: 2, down: [A] }],
    goal: [1, 7],
    budget: 55,
    reachedAt: 46,
    reversals: 0,
  },
  {
    id: 'P4',
    scenario: 'along a wall, turn in: 上 → 右 (both held)',
    start: [15, 17],
    bricks: [[16, 17], [16, 15], [16, 13]],
    keys: [{ at: 0, down: [W] }, { at: 2, down: [D] }],
    goal: [17, 11],
    budget: 55,
    reachedAt: 46,
    reversals: 0,
  },
  {
    id: 'P5',
    scenario: 'late press at 0.45 cell, one key',
    start: [1, 1],
    bricks: [[3, 4]],
    keys: [{ at: 0, down: [D] }, { at: (p) => p.mx >= 3950, up: [D], down: [S] }],
    goal: [3, 3],
    budget: 35,
    reachedAt: 28,
    reversals: 1,
  },
  {
    id: 'P6',
    scenario: 'newest key blocked forever (H1)',
    start: [1, 1],
    keys: [{ at: 0, down: [D] }, { at: 1, down: [W] }],
    goal: [17, 1],
    budget: 100,
    reachedAt: 92,
    reversals: 0,
  },
  {
    id: 'P7',
    scenario: 'older key blocked at start; newest runs into a dead end, then the older key takes over',
    start: [1, 1],
    bricks: [[1, 2], [10, 1], [10, 3], [9, 4]],
    keys: [{ at: 0, down: [S] }, { at: 1, down: [D] }],
    goal: [9, 3],
    budget: 65,
    reachedAt: 59,
    reversals: 0,
    forbidden: [[3, 2], [5, 2], [7, 2]],
  },
  {
    id: 'P8',
    scenario: 'zig-zag stairs, both keys held',
    start: [1, 1],
    bricks: [[1, 2], [3, 4], [5, 6], [7, 8], [8, 7]],
    keys: [{ at: 0, down: [D] }, { at: 1, down: [S] }],
    goal: [7, 7],
    budget: 80,
    reachedAt: 69,
    reversals: 0,
  },
  {
    id: 'P9',
    scenario: 'place a bomb, walk off it, then turn',
    start: [3, 1],
    bricks: [[3, 2], [5, 4], [6, 3]],
    keys: [{ at: 0, down: ['Space'] }, { at: 1, down: [D] }, { at: 3, down: [S] }],
    goal: [5, 3],
    budget: 30,
    reachedAt: 24,
    reversals: 0,
  },
  {
    id: 'P10',
    scenario: 'late press at 0.485 cell on water',
    start: [1, 1],
    bricks: [[3, 4]],
    water: [[2, 1], [3, 1], [3, 2], [3, 3]],
    keys: [{ at: 0, down: [D] }, { at: (p) => p.mx >= 3900, up: [D], down: [S] }],
    goal: [3, 3],
    budget: 50,
    reachedAt: 40,
    reversals: 1,
  },
]

describe('movement paths (ADR 0032 acceptance)', () => {
  it.each(PATHS)('$id $scenario: no stuck tick, goal within budget', (c) => {
    const tr = drive(c)
    expect({ id: c.id, stuck: tr.stuckTicks, reachedAt: tr.reachedAt }).toEqual({ id: c.id, stuck: [], reachedAt: c.reachedAt })
    expect(tr.reachedAt).toBeLessThanOrEqual(c.budget)
    expect(tr.reversals).toBe(c.reversals)
    expect(tr.laneBroken).toBe(0)
    expect(tr.dangerSeen).toBe(0)
    for (const [x, y] of c.forbidden ?? []) expect(tr.visited.has(`${x},${y}`)).toBe(false)
  })

  it('P5 / P10 fire their late press at the intended offsets (0.45 and 0.485 cell)', () => {
    expect(drive(PATHS[4]).fired[1]).toMatchObject({ tick: 14, mx: 3950 })
    const p10 = drive(PATHS[9]).fired[1]
    expect(p10.mx - 3500).toBeGreaterThanOrEqual(450)
    expect(p10.mx - 3500).toBeLessThan(500)
  })

  it('four wall-slide turns take identical ticks (no direction is special)', () => {
    const ticks = PATHS.slice(0, 4).map((c) => drive(c).reachedAt)
    expect(new Set(ticks).size).toBe(1)
    expect(ticks[0]).not.toBeNull()
  })

  it('the oracle does flag a stall: with 副方向 dropped (round-3 input), P6 stalls under the wall', () => {
    // 判官自检：同一局面把第二个键从判官视角「按住」、但输入层只送最新键时，必须数出卡住的 Tick。
    const c = PATHS[5]
    const { w, p } = board(c)
    step(w, { [LOCAL]: [{ ability: '移动', 输入: { 方向: 方向.右, 按了转弯: true } }] })
    let stuck = 0
    for (let i = 0; i < 20; i++) {
      const could = eligible([D, W]).some((d) => reachable(w, p, d))
      const x0 = p.mx
      step(w, { [LOCAL]: [{ ability: '移动', 输入: { 方向: 方向.上, 按了转弯: i === 0 } }] })
      if (p.mx === x0 && could) stuck++
    }
    expect(stuck).toBeGreaterThan(0)
  })
})

// ---------- 随机模糊 ----------

/** 测试自带 xorshift32（规则层外，确定性）。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

const FUZZ_KEYS = Object.keys(DIR_OF)

function fuzz(seed: number, ticks: number): Trace {
  const r = rng(seed)
  const w = makeWorld()
  put(w, 1, 17, 17)
  const p = put(w, LOCAL, 9, 9)
  // 生成的棋盘：约 20% 的非柱格随机放积木（起点周围曼哈顿 2 格内留空），剩下的通道足够让人到处走。
  for (let y = 1; y < w.size - 1; y++)
    for (let x = 1; x < w.size - 1; x++) {
      if (x % 2 === 0 && y % 2 === 0) continue
      if (Math.abs(x - 9) + Math.abs(y - 9) <= 2) continue
      if (r() < 0.2) setBrick(w, x, y, BlockType.积木)
    }
  const input = new InputState()
  const held: string[] = []
  const tr: Trace = { stuck: 0, stuckTicks: [], reachedAt: null, reversals: 0, laneBroken: 0, dangerSeen: 0, visited: new Set(), fired: [] }
  let next = 0
  for (let t = 0; t < ticks; t++) {
    if (t === next) {
      next = t + 5 + Math.floor(r() * 16)
      const press = held.length === 0 || (held.length === 1 && r() < 0.5)
      if (press) {
        const free = FUZZ_KEYS.filter((k) => !held.includes(k))
        const k = free[Math.floor(r() * free.length)]
        input.keyDown(k, false)
        held.push(k)
      } else {
        const k = held.splice(Math.floor(r() * held.length), 1)[0]
        input.keyUp(k)
      }
      tr.fired.push({ tick: t, mx: p.mx, my: p.my })
    }
    const could = eligible(held).some((d) => reachable(w, p, d))
    const x0 = p.mx
    const y0 = p.my
    step(w, { [LOCAL]: input.poll() })
    if (p.mx === x0 && p.my === y0 && could) {
      tr.stuck++
      tr.stuckTicks.push(t)
    }
    if ((p.mx - HALF) % MILLI !== 0 && (p.my - HALF) % MILLI !== 0) tr.laneBroken++
    tr.visited.add(`${Math.floor(p.mx / MILLI)},${Math.floor(p.my / MILLI)}`)
  }
  return tr
}

describe('movement fuzz (ADR 0032)', () => {
  it.each([1, 2, 3, 4, 5])('seed %i: random 1–2 held keys on a generated board never stall', (seed) => {
    const tr = fuzz(seed, 1500)
    expect(tr.stuckTicks).toEqual([])
    expect(tr.laneBroken).toBe(0)
    // 真的走动过（棋盘没把人关死），模糊才有意义。
    expect(tr.visited.size).toBeGreaterThan(10)
  })
})
