import { describe, expect, it } from 'vitest'
import { 方向, PickupKind, type AbilityActivation, type WorldSnapshot } from '../contract'
import { BotBrain, type BotPersonality } from './bot-brain'
import { buildBoard } from './board'
import { hasEscapeAfterBomb } from './bomb-gate'
import { buildDangerMap, NEVER } from './danger-map'
import { cellIdx, config, makeSnapshot, rules, setCell, standardMap, type SnapSpec } from './test-fixtures'

const brain = (personality: BotPersonality, self = 1, seed = 7): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules })

const moveOf = (out: AbilityActivation[]): 方向 => {
  const m = out.find((a) => a.ability === '移动')
  if (!m || m.ability !== '移动') throw new Error('no move')
  return m.输入.方向
}
const turnOf = (out: AbilityActivation[]): boolean => {
  const m = out.find((a) => a.ability === '移动')
  return m !== undefined && m.ability === '移动' && m.输入.按了转弯
}
const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length

/** 反应延迟最多 4 Tick：同一局面连续决策到延迟结束，返回最后一次输出。 */
const settle = (b: BotBrain, snap: WorldSnapshot): AbilityActivation[] => {
  let out: AbilityActivation[] = []
  for (let k = 0; k <= 4; k++) out = b.decide({ ...snap, Tick: snap.Tick + k })
  return out
}

const gateInput = (X: number, Y: number) => ({
  X,
  Y,
  power: 2,
  placeTick: 101,
  fuseTicks: 42,
  dangerTicks: 8,
  tpcLand: 6,
  tpcWater: 9,
})

/** 一个全铁皮的 19×19，按坐标挖空。 */
function carved(open: [number, number][], extra: [number, number, string][] = []): string[] {
  let map = Array.from({ length: 19 }, () => '#'.repeat(19))
  for (const [x, y] of open) map = setCell(map, x, y, '.')
  for (const [x, y, ch] of extra) map = setCell(map, x, y, ch)
  return map
}

describe('escape', () => {
  // 角落 (1,1) 站在自己的炸弹上；右路 (2,1)(3,1) 被积木封死成死路，只能往下逃。
  const spec = (offX = 0): SnapSpec => ({
    map: setCell(setCell(standardMap(), 4, 1, 'b'), 3, 2, 'b'),
    tick: 100,
    players: [{ id: 1, X: 1, Y: 1, offX, bombs: 0 }],
    bombs: [{ id: 20, X: 1, Y: 1, owner: 1, fuseEndTick: 142 }],
  })

  it('a bot on a bomb cross heads toward a safe cell', () => {
    const b = brain('farmer')
    const snap = makeSnapshot(spec())
    const out = settle(b, snap)
    expect(moveOf(out)).toBe(方向.下)
    expect(b.debugState().lastDir).toBe(方向.下)
    expect(bombs(out)).toBe(0)
    // 引信还长：目标可以是普通目标，但必须是永不危险格（路径已按到达时刻校验）
    const st = b.debugState()
    expect(st.mode).not.toBe('wait')
    const dm = buildDangerMap(buildBoard(snap), 8)
    expect(st.goal).not.toBeNull()
    expect(dm.from[cellIdx(st.goal!.X, st.goal!.Y)]).toBe(NEVER)
  })

  it('imminent danger switches to pure escape toward the nearest safe cell', () => {
    const b = brain('farmer')
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1 }],
      bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 112 }],
    })
    const out = settle(b, snap)
    expect(b.debugState().mode).toBe('escape')
    expect(b.debugState().goal).toEqual({ X: 1, Y: 2 })
    expect(moveOf(out)).toBe(方向.下)
  })

  it('reacts to new danger from others only after a 2–4 tick delay', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1 }],
      bombs: [{ id: 20, X: 3, Y: 1, owner: 2, fuseEndTick: 130 }],
    })
    const b = brain('farmer')
    const modes: string[] = []
    for (let k = 0; k <= 4; k++) {
      b.decide({ ...snap, Tick: 100 + k })
      modes.push(b.debugState().mode)
    }
    // 第一次看到危险时不立刻逃（2–4 Tick 延迟），延迟结束后按危险处理（逃生或走向安全目标）
    expect(modes[0]).toBe('idle')
    expect(modes.slice(2)).not.toContain('idle')
  })

  it('first move after a press waits for the bomb to appear (rejected press stays buffered in the sim)', () => {
    const withExit = carved([[1, 1], [2, 1], [3, 1], [1, 2], [1, 3]], [[4, 1, 'b']])
    const b = brain('farmer')
    let t = 100
    let pressed = false
    for (; t < 110 && !pressed; t++) pressed = bombs(b.decide(makeSnapshot({ map: withExit, tick: t, players: [{ id: 1, X: 3, Y: 1 }] }))) > 0
    expect(pressed).toBe(true)
    // 快照里还没有自己的炸弹（被拒或尚未生效）：缓冲期内原地不动
    const out = b.decide(makeSnapshot({ map: withExit, tick: t, players: [{ id: 1, X: 3, Y: 1 }] }))
    expect(out).toEqual([{ ability: '移动', 输入: { 方向: 方向.停, 按了转弯: false } }])
  })

  it('does not step into a still-burning flame when standing at the cell edge', () => {
    // 人贴着 (1,1) 的下边（y 偏移 +475），(1,2) 正在烧到 105；按整格耗时估会以为 107 才进入（减 2 Tick 余量后恰好不冲突）。
    const b = brain('roamer', 1, 3)
    const map = setCell(setCell(standardMap(), 2, 1, 'b'), 1, 4, 'b')
    const snap = makeSnapshot({
      map,
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1, offY: 475 }],
      bombs: [{ id: 20, X: 1, Y: 3, owner: 2, fuseEndTick: 97, exploded: { at: 97, reach: [1, 0, 0, 0] } }],
      pickups: [{ id: 40, X: 1, Y: 3, kind: PickupKind.FirePlus }],
    })
    for (let t = 100; t < 104; t++) {
      const out = b.decide({ ...snap, Tick: t })
      expect(moveOf(out)).not.toBe(方向.下)
    }
  })

  it('recentres on the lane before turning when offset too far', () => {
    const b = brain('farmer')
    const out = settle(b, makeSnapshot(spec(300)))
    expect(moveOf(out)).toBe(方向.左)
  })

  it('escapes a chained cross even when its own cell bomb is far in the future', () => {
    // 自己不在炸弹上，但站在一颗会被连锁提前引爆的炸弹十字里。
    const b = brain('roamer')
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 7, Y: 3 }],
      bombs: [
        { id: 20, X: 5, Y: 1, owner: 2, fuseEndTick: 104 },
        { id: 21, X: 7, Y: 1, owner: 2, fuseEndTick: 300 },
      ],
    })
    settle(b, snap)
    expect(b.debugState().mode).toBe('escape')
  })
})

describe('bomb gate', () => {
  // 死胡同：(1,1)(2,1)(3,1) 一条横向通道，(4,1) 是积木。
  const deadEnd = carved([[1, 1], [2, 1], [3, 1]], [[4, 1, 'b']])
  // 同样的通道，但 (1,2)(1,3) 有一条出口，出口在炸弹十字外。
  const withExit = carved([[1, 1], [2, 1], [3, 1], [1, 2], [1, 3]], [[4, 1, 'b']])

  it('gate rejects a dead-end corridor and accepts one with an exit', () => {
    const trapped = buildBoard(makeSnapshot({ map: deadEnd, players: [{ id: 1, X: 3, Y: 1 }] }))
    expect(hasEscapeAfterBomb(trapped, gateInput(3, 1))).toBe(false)
    const open = buildBoard(makeSnapshot({ map: withExit, players: [{ id: 1, X: 3, Y: 1 }] }))
    expect(hasEscapeAfterBomb(open, gateInput(3, 1))).toBe(true)
  })

  it('farmer in a dead-end corridor never places', () => {
    const b = brain('farmer')
    for (let t = 100; t < 140; t++) {
      const out = b.decide(makeSnapshot({ map: deadEnd, tick: t, players: [{ id: 1, X: 3, Y: 1 }] }))
      expect(bombs(out)).toBe(0)
    }
  })

  it('farmer with an escape route places on arrival', () => {
    const b = brain('farmer')
    let placed = 0
    for (let t = 100; t < 108 && placed === 0; t++) {
      placed += bombs(b.decide(makeSnapshot({ map: withExit, tick: t, players: [{ id: 1, X: 3, Y: 1 }] })))
    }
    expect(placed).toBe(1)
  })

  it('never places in water', () => {
    const map = setCell(setCell(standardMap(), 3, 1, '~'), 4, 1, 'b')
    const board = buildBoard(makeSnapshot({ map, players: [{ id: 1, X: 3, Y: 1 }] }))
    expect(hasEscapeAfterBomb(board, gateInput(3, 1))).toBe(false)
    const b = brain('hunter')
    for (let t = 100; t < 120; t++) {
      const out = b.decide(
        makeSnapshot({ map, tick: t, players: [{ id: 1, X: 3, Y: 1 }, { id: 2, X: 1, Y: 1 }] }),
      )
      expect(bombs(out)).toBe(0)
    }
  })

  it('gate fails when the only exit is closed by an earlier chained explosion', () => {
    // 出口 (1,2)(1,3) 正被另一颗 5 Tick 后起爆的炸弹覆盖。
    const snap = makeSnapshot({
      map: withExit,
      tick: 100,
      players: [{ id: 1, X: 3, Y: 1 }],
      bombs: [{ id: 30, X: 1, Y: 3, owner: 2, fuseEndTick: 105, power: 2 }],
    })
    expect(hasEscapeAfterBomb(buildBoard(snap), gateInput(3, 1))).toBe(false)
  })

  it('no bombs while nothing in hand', () => {
    const b = brain('farmer')
    for (let t = 100; t < 110; t++) {
      const out = b.decide(makeSnapshot({ map: withExit, tick: t, players: [{ id: 1, X: 3, Y: 1, bombs: 0 }] }))
      expect(bombs(out)).toBe(0)
    }
  })
})

describe('goals', () => {
  it('walks toward a nearby useful pickup', () => {
    const b = brain('roamer')
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1 }],
      pickups: [{ id: 40, X: 4, Y: 1, kind: PickupKind.FirePlus }],
    })
    // 容忍 5% 决策噪声（种子 7 的第一次抽样恰好落在噪声里）：几次思考内必须选中糖果
    const modes: string[] = []
    for (let t = 100; t < 110; t++) {
      b.decide({ ...snap, Tick: t })
      modes.push(b.debugState().mode)
    }
    expect(modes).toContain('pickup')
    expect(b.debugState().goal).toEqual({ X: 4, Y: 1 })
  })

  it('stands still outside Running / dead', () => {
    const b = brain('hunter')
    const out = b.decide(makeSnapshot({ map: standardMap(), phase: 0, players: [{ id: 1, X: 1, Y: 1 }] }))
    expect(out).toEqual([{ ability: '移动', 输入: { 方向: 方向.停, 按了转弯: false } }])
  })
})

/** 一个挤满积木、炸弹、玩家的 19×19。 */
function busySnapshot(tick: number): WorldSnapshot {
  let map = standardMap()
  for (let y = 1; y < 18; y++) {
    for (let x = 1; x < 18; x++) {
      if (map[y][x] !== '.') continue
      const h = (x * 73856093) ^ (y * 19349663)
      const r = ((h >>> 0) % 100) / 100
      if (r < 0.45) map = setCell(map, x, y, 'b')
      else if (r < 0.48) map = setCell(map, x, y, 'c')
      else if (r < 0.5) map = setCell(map, x, y, '~')
    }
  }
  const spots: [number, number][] = [
    [1, 1], [17, 1], [1, 17], [17, 17], [9, 1], [1, 9], [17, 9], [9, 17],
  ]
  for (const [x, y] of spots) {
    map = setCell(map, x, y, '.')
    map = setCell(map, x + (x < 9 ? 1 : x > 9 ? -1 : 1), y, '.')
    map = setCell(map, x, y + (y < 9 ? 1 : -1), '.')
  }
  const players = spots.map(([X, Y], k) => ({ id: k + 1, X, Y, bombs: 2, power: 3 }))
  const bombsList = []
  let id = 100
  for (let y = 1; y < 18; y += 2) {
    for (let x = 3; x < 17; x += 4) {
      if (map[y][x] === '.') bombsList.push({ id: id++, X: x, Y: y, owner: 1 + (id % 8), fuseEndTick: tick + 5 + (id % 40), power: 3 })
    }
  }
  return makeSnapshot({
    map,
    tick,
    players,
    bombs: bombsList,
    pickups: [
      { id: 200, X: 9, Y: 9, kind: PickupKind.FirePlus, droppedBy: 4 },
      { id: 201, X: 5, Y: 5, kind: PickupKind.BombPlus },
    ],
    king: 3,
  })
}

describe('determinism', () => {
  it('same snapshot sequence + same seed → same outputs', () => {
    const personalities: BotPersonality[] = ['farmer', 'hunter', 'collector', 'roamer']
    for (const p of personalities) {
      const a = brain(p, 2, 1234)
      const b = brain(p, 2, 1234)
      for (let t = 100; t < 160; t++) {
        const snap = busySnapshot(t)
        expect(b.decide(snap)).toEqual(a.decide(snap))
        expect(b.debugState()).toEqual(a.debugState())
      }
    }
  })
})

describe('performance', () => {
  it('7 decides on a busy 19×19 snapshot take < 5 ms total', () => {
    const personalities: BotPersonality[] = ['farmer', 'hunter', 'collector', 'roamer', 'farmer', 'hunter', 'roamer']
    const brains = personalities.map((p, k) => brain(p, k + 2, 99 + k))
    const snaps = Array.from({ length: 40 }, (_, k) => busySnapshot(100 + k))
    // 预热 JIT
    for (const s of snaps) for (const br of brains) br.decide(s)
    const samples: number[] = []
    for (const s of snaps) {
      const t0 = performance.now()
      for (const br of brains) br.decide(s)
      samples.push(performance.now() - t0)
    }
    samples.sort((x, y) => x - y)
    const median = samples[samples.length >> 1]
    console.log(`7 decides: median ${median.toFixed(3)} ms, max ${samples[samples.length - 1].toFixed(3)} ms`)
    expect(median).toBeLessThan(5)
    expect(snaps[0].Bombs.length).toBeGreaterThan(10)
  })
})
