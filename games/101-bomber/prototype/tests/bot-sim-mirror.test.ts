import { describe, expect, it } from 'vitest'
import { BlockType, BombKind, DeathCause, msToTicks, 方向, type WorldSnapshot } from '../src/contract'
import { buildBoard, gridProbe } from '../src/bots/board'
import { buildDangerMap, traceBlast } from '../src/bots/danger-map'
import { auraCells, blinkScan } from '../src/shared/skill-geometry'
import { addBomb, cell, evs, makeWorld, mv, put, run, setBrick, setGround, SKILL, step } from '../src/sim/__tests__/helpers'
import { addSkillBomb, face, giveSkill, putChest } from '../src/sim/__tests__/skill-helpers'
import type { World } from '../src/sim/world'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard, referenceCross } from './support/pierce-cases'

/**
 * Bot 世界模型 ↔ 规则层的镜像测试（原型扩展 NON-CONTRACT，ADR 0030；design_bots §4）：Bot 预测的穿透十字、
 * 被踢弹的停点（含踢进水里熄灭）、火区格子，必须与规则层实际结果一致——口径漂了 Bot 就会往火里走。
 */

/** 确定性 xorshift（测试自带）。 */
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

const sorted = (xs: Iterable<number>): number[] => [...xs].sort((a, b) => a - b)

/** 7×7 夹具贴到 19×19 场地中央（左上角 OFF,OFF），其余照旧（外圈 + 铁皮柱）。 */
const OFF = 6

function worldFromRows(rows: readonly string[]): World {
  const w = makeWorld({ players: 2 })
  put(w, 1, 1, 1)
  put(w, 2, 17, 17)
  const b = parsePierceBoard(rows)
  for (let y = 0; y < b.size; y++)
    for (let x = 0; x < b.size; x++) {
      const i = y * b.size + x
      setBrick(w, OFF + x, OFF + y, b.brick[i] as BlockType)
      setGround(w, OFF + x, OFF + y, b.ground[i] as BlockType)
      if (b.chests.includes(i)) putChest(w, OFF + x, OFF + y)
    }
  return w
}

/** 本 Tick 先发布快照（炸弹还在引信里），下一 Tick 爆炸：返回 Bot 视角的预测与规则层实际覆盖（都换回 7×7 下标）。 */
function explodeAndPredict(rows: readonly string[], power: number, pierce: number): { bot: number[]; trace: number[]; sim: number[] } {
  const w = worldFromRows(rows)
  const bomb = addSkillBomb(w, 1, OFF + PIERCE_BOMB.x, OFF + PIERCE_BOMB.y, 2, power, { kind: pierce > 0 ? BombKind.Pierce : BombKind.Standard, pierceLayers: pierce })
  const snap = step(w).snapshot
  const board = buildBoard(snap, { self: 2 })
  const dm = buildDangerMap(board, msToTicks(w.cfg.dangerWindowMs, w.cfg.tickRateHz))
  const j = board.pending.findIndex((p) => p.id === bomb.id)
  expect(j).toBeGreaterThanOrEqual(0)
  const trace = traceBlast(board, OFF + PIERCE_BOMB.x, OFF + PIERCE_BOMB.y, power, { covered: [], bricks: [] }, undefined, pierce).covered
  step(w)
  expect(bomb.explodedAtTick).toBeGreaterThan(0)
  const to7 = (c: number): number => (Math.floor(c / w.size) - OFF) * 7 + ((c % w.size) - OFF)
  return { bot: sorted(new Set(dm.cover[j].map(to7))), trace: sorted(new Set(trace.map(to7))), sim: sorted(new Set(bomb.covered.map(to7))) }
}

describe('bot ↔ sim mirror: pierce blast shape', () => {
  for (const c of PIERCE_CASES)
    it(c.name, () => {
      const { bot, trace, sim } = explodeAndPredict(c.rows, c.power, c.pierceLayers)
      const want = sorted(c.covered.map(([x, y]) => y * 7 + x))
      expect(sim).toEqual(want)
      expect(bot).toEqual(sim)
      expect(trace).toEqual(sim)
    })

  it('random 7×7 boards (seeded): bot cover == sim cover == reference cross', () => {
    const r = rng(0xb0b)
    const pick = '....bbcC~#'
    for (let n = 0; n < 150; n++) {
      const rows: string[] = []
      for (let y = 0; y < 7; y++) {
        let row = ''
        for (let x = 0; x < 7; x++) row += x === PIERCE_BOMB.x && y === PIERCE_BOMB.y ? '.' : pick[Math.floor(r() * pick.length)]
        rows.push(row)
      }
      const power = 1 + Math.floor(r() * 3)
      const pierce = [0, 1, 2, 99][Math.floor(r() * 4)]
      const { bot, trace, sim } = explodeAndPredict(rows, power, pierce)
      const ref = referenceCross(parsePierceBoard(rows), PIERCE_BOMB.x, PIERCE_BOMB.y, power, pierce)
      const label = `${rows.join('/')} power ${power} pierce ${pierce}`
      expect(sim, label).toEqual(sorted(new Set(ref.covered)))
      expect(bot, label).toEqual(sim)
      expect(trace, label).toEqual(sim)
    }
  })
})

type Block = 'none' | 'brick' | 'bomb' | 'chest' | 'water'

/**
 * 1 号（踢弹 level）在 (1,1)，2 号的弹在 (3,1)（引信很长），第 1 行 X=blockAt 放一个挡板；按住右直到踢出，
 * 之后每个 Tick 都用快照问 Bot「这颗弹会停在哪 / 会不会熄灭」，与规则层最终结果对照。
 */
function kickMirror(level: number, block: Block, blockAt: number): void {
  const w = makeWorld()
  put(w, 1, 1, 1)
  put(w, 2, 17, 17)
  giveSkill(w, 1, 'kick', level)
  const b = addBomb(w, 2, 3, 1, 400)
  if (block === 'brick') setBrick(w, blockAt, 1, BlockType.积木)
  else if (block === 'bomb') addBomb(w, 2, blockAt, 1, 400)
  else if (block === 'chest') putChest(w, blockAt, 1)
  else if (block === 'water') setGround(w, blockAt, 1, BlockType.水)
  let kicked = false
  const preds: { tick: number; stop: number; doused: boolean }[] = []
  let doused = false
  for (let i = 0; i < 120; i++) {
    const f = step(w, kicked ? {} : { 1: [mv(方向.右)] })
    if (!kicked && evs(f, 'BombKicked').length > 0) kicked = true
    if (evs(f, 'BombExtinguished').some((e) => e.OwnerNetEntityIdRaw === 2 && e.Cell.X === blockAt && e.Cell.Y === 1)) doused = true
    if (!kicked) continue
    const board = buildBoard(f.snapshot, { self: 2 })
    const p = board.pending.find((q) => q.id === b.id)
    if (!p) break
    preds.push({ tick: f.snapshot.Tick, stop: p.blastCell, doused: p.doused })
    if (!p.moving && preds.length > 1) break
  }
  const label = `kick L${level} ${block}@${blockAt}`
  expect(kicked, label).toBe(true)
  const finalCell = b.cell
  if (preds.length === 0) {
    // 踢出那一 Tick 就推进了第一格：那格是水 → 当场熄灭，快照里已没有这颗弹，Bot 无需预测。
    expect(doused, label).toBe(true)
    expect(finalCell, label).toBe(cell(w, blockAt, 1))
    return
  }
  if (doused) expect(finalCell, label).toBe(cell(w, blockAt, 1))
  for (const p of preds) {
    expect(p.doused, `${label} tick ${p.tick}`).toBe(doused)
    expect(p.stop, `${label} tick ${p.tick}`).toBe(finalCell)
  }
}

describe('bot ↔ sim mirror: kicked-bomb stop cell', () => {
  it('open lane, L1 / L2 / L3', () => {
    for (const lv of [1, 2, 3]) kickMirror(lv, 'none', 0)
  })
  it('stopped by a brick, a bomb or a chest at every distance', () => {
    for (const lv of [1, 3])
      for (const block of ['brick', 'bomb', 'chest'] as const) for (let x = 5; x <= 12; x++) if (x % 2 === 1 || block !== 'brick') kickMirror(lv, block, x)
  })
  it('kicked into water: extinguished on the first water cell', () => {
    for (const lv of [1, 2, 3]) for (let x = 4; x <= 10; x++) kickMirror(lv, 'water', x)
  })
})

/** 规则层实际会烧到的格：把 2 号挨个摆到 3×3 的每格上、各跑一个 Tick，看有没有 Burn 伤害。 */
function simBurnCells(setup: () => { w: World; cast: () => void }, candidates: readonly number[]): number[] {
  const out: number[] = []
  for (const c of candidates) {
    const { w, cast } = setup()
    const size = w.size
    put(w, 2, c % size, Math.floor(c / size))
    cast()
    // 烧伤按暴露时长计（满 burnInterval 才烧第一下），所以施放后再跑一个间隔。
    const frames = [step(w, { 1: [SKILL] }), ...run(w, w.ticks.burnInterval)]
    if (evs(frames, 'DamageApplied').some((e) => e.VictimNetEntityIdRaw === 2 && e.proto?.Cause === DeathCause.Burn)) out.push(c)
  }
  return sorted(out)
}

function zoneCells(snap: WorldSnapshot, viewer: number): number[] {
  const board = buildBoard(snap, { self: viewer, burnPad: 0 })
  const out: number[] = []
  for (let i = 0; i < board.burnUntil.length; i++) if (board.burnUntil[i] > snap.Tick) out.push(i)
  return out
}

describe('bot ↔ sim mirror: fire-zone cells', () => {
  it('bear aura: unpadded bot burn cells == shared auraCells == cells the sim actually burns (random bricks)', () => {
    const r = rng(0xa11a)
    for (let n = 0; n < 12; n++) {
      const bx = 3 + 2 * Math.floor(r() * 6) + 0
      const by = 5
      const bricks: number[] = []
      const build = () => {
        const w = makeWorld({ players: 2, picks: ['bear'] })
        put(w, 1, bx, by)
        put(w, 2, 17, 17)
        for (const c of bricks) w.brick[c] = BlockType.积木
        return w
      }
      const w0 = build()
      for (let y = by - 1; y <= by + 1; y++)
        for (let x = bx - 1; x <= bx + 1; x++) if ((x !== bx || y !== by) && w0.brick[cell(w0, x, y)] === BlockType.Air && r() < 0.3) bricks.push(cell(w0, x, y))
      const w = build()
      const snap = step(w, { 1: [SKILL] }).snapshot
      const bot = zoneCells(snap, 2)
      const shared = sorted(auraCells(gridProbe(buildBoard(snap)), cell(w, bx, by)))
      const around: number[] = []
      for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (w.brick[cell(w, x, y)] === BlockType.Air && (x !== bx || y !== by)) around.push(cell(w, x, y))
      const sim = simBurnCells(() => {
        const ww = build()
        return { w: ww, cast: () => undefined }
      }, around)
      const label = `bear (${bx},${by}) bricks ${bricks.join(',')}`
      expect(bot, label).toEqual(shared)
      // 熊自己脚下那格也在 zone 里（别人站上去同样挨烧），sim 探测只摆在周围 8 格。
      expect(bot.filter((c) => c !== cell(w, bx, by)), label).toEqual(sim)
      // 自己的光环不进自己的 burn 图。
      expect(zoneCells(snap, 1), label).toEqual([])
    }
  })

  it('fire-dash wall: bot burn cells == blinkScan path (landing excluded) == sim wall', () => {
    const r = rng(0xd45)
    for (let n = 0; n < 10; n++) {
      const w = makeWorld({ players: 3, picks: ['cat', null, null] })
      put(w, 1, 1, 5)
      put(w, 2, 17, 17)
      put(w, 3, 17, 15)
      giveSkill(w, 1, 'fireDash', 1, true, [
        { skill: 'blink', level: 1, bound: true },
        { skill: 'fireAura', level: 1, bound: false },
      ])
      face(w, 1, 方向.右)
      for (let x = 2; x <= 6; x++) if (r() < 0.35) setBrick(w, x, 5, BlockType.积木)
      const before = buildBoard(step(w).snapshot)
      const scan = blinkScan(gridProbe(before), cell(w, 1, 5), 方向.右, w.rules.skills.fireDash.levels[0].rangeCells)
      const snap = step(w, { 1: [SKILL] }).snapshot
      const label = `dash layout ${n}`
      if (!scan) {
        expect(snap.FireZones ?? [], label).toEqual([])
        continue
      }
      expect(sorted(w.fireWalls.flatMap((z) => z.cells)), label).toEqual(sorted(scan.path))
      expect(zoneCells(snap, 2), label).toEqual(sorted(scan.path))
    }
  })
})
