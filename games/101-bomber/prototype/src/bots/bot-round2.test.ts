import { describe, expect, it } from 'vitest'
import { 方向, MatchPhase, PickupKind, type AbilityActivation, type U64, type WorldSnapshot } from '../contract'
import { BotBrain, type BotBehaviour, type BotPersonality } from './bot-brain'
import { buildBoard, isOpen, NEVER } from './board'
import { evaluateBomb } from './bomb-gate'
import { buildDangerMap, traceBlast } from './danger-map'
import { searchPaths } from './path-search'
import {
  cellIdx,
  config,
  finalCircle,
  makeSnapshot,
  rules,
  runMini,
  setCell,
  standardMap,
  type SnapSpec,
} from './test-fixtures'

const brain = (personality: BotPersonality, self: U64, seed = 7): BotBrain =>
  new BotBrain({ self, seed, personality, config, rules })

const moveOf = (out: AbilityActivation[]): 方向 => {
  const m = out.find((a) => a.ability === '移动')
  if (!m || m.ability !== '移动') throw new Error('no move')
  return m.输入.方向
}
const bombs = (out: AbilityActivation[]): number => out.filter((a) => a.ability === '放弹').length

/** 一个全铁皮的 19×19，按坐标挖空。 */
function carved(open: [number, number][], extra: [number, number, string][] = []): string[] {
  let map = Array.from({ length: 19 }, () => '#'.repeat(19))
  for (const [x, y] of open) map = setCell(map, x, y, '.')
  for (const [x, y, ch] of extra) map = setCell(map, x, y, ch)
  return map
}

/** L 形出生口袋 (1,1)(2,1)(1,2)，两头被积木堵住；另有一块够不着的空地站着对手。 */
const pocket = (): string[] =>
  carved(
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [9, 9],
      [10, 9],
      [9, 10],
    ],
    [
      [3, 1, 'b'],
      [1, 3, 'b'],
    ],
  )

/** 记录每次决策（模式、是否放弹）的包装。 */
function recorded(b: BotBrain, self: U64): { decide(s: WorldSnapshot): AbilityActivation[]; log: { tick: number; mode: string; bomb: boolean; cell: string }[] } {
  const log: { tick: number; mode: string; bomb: boolean; cell: string }[] = []
  return {
    log,
    decide(s: WorldSnapshot): AbilityActivation[] {
      const out = b.decide(s)
      const me = s.Players.find((p) => p.NetEntityIdRaw === self)
      const cell = me ? `${Math.floor(me.LogicTransform.WorldPosition.x)},${Math.floor(me.LogicTransform.WorldPosition.z)}` : ''
      log.push({ tick: s.Tick, mode: b.debugState().mode, bomb: bombs(out) > 0, cell })
      return out
    },
  }
}

describe('review fixes', () => {
  it('a hunter boxed in its spawn pocket with an unreachable target bombs its way out instead of flip-flopping', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const spec: SnapSpec = { map: pocket(), tick: 100, players: [{ id: 2, X: 1, Y: 2 }, { id: 5, X: 9, Y: 9 }] }
      const run = runMini(spec, new Map([[2, brain('hunter', 2, seed)]]), 80, true)
      expect(run.placed.length, `seed ${seed}`).toBe(1)
      // 3 秒内开炸（修复前：在两个目标之间逐 Tick 抖 20–60 秒不放弹）。
      expect(run.placed[0].tick, `seed ${seed}`).toBeLessThanOrEqual(160)
    }
  })

  it('a bomb cancelled because the bot was still sliding is placed on the next tick, not replaced by a new goal', () => {
    let cancelled = 0
    for (let seed = 1; seed <= 12; seed++) {
      const spec: SnapSpec = { map: pocket(), tick: 100, players: [{ id: 2, X: 1, Y: 2 }] }
      const rec = recorded(brain('roamer', 2, seed), 2)
      const run = runMini(spec, new Map([[2, rec]]), 120, true)
      expect(run.placed.length, `seed ${seed}`).toBe(1)
      for (let i = 0; i + 1 < rec.log.length; i++) {
        const a = rec.log[i]
        if (a.mode !== 'bomb' || a.bomb) continue
        cancelled++
        const b = rec.log[i + 1]
        if (b.cell === a.cell) expect(b.bomb, `seed ${seed} tick ${a.tick}`).toBe(true)
      }
    }
    // 场景确实覆盖到了「到达时还在滑行」的取消路径。
    expect(cancelled).toBeGreaterThan(0)
  })

  it('a low-HP bot that has been standing in a pond wades to land instead of waiting to drown', () => {
    // (13,2)(13,3) 是水；上岸口 (13,1) 被积木堵住，只能再涉一格水到 (12,3)/(14,3)。
    const map = setCell(setCell(setCell(standardMap(), 13, 2, '~'), 13, 3, '~'), 13, 1, 'b')
    const spec: SnapSpec = { map, tick: 100, players: [{ id: 1, X: 13, Y: 2, offY: -320, hp: 2 }] }
    const b = brain('farmer', 1, 3)
    // 已在水里泡了 6 Tick：常规「不再挨溺水」预算按整格估起点时会把唯一的涉水路线剪掉。
    for (let k = 0; k < 6; k++) b.decide(makeSnapshot({ ...spec, tick: 100 + k }))
    const run = runMini({ ...spec, tick: 106 }, new Map([[1, b]]), 60)
    const cells = run.cells.get(1)!
    let wet = 6
    let maxWet = wet
    for (const c of cells) {
      wet = c === '13,2' || c === '13,3' ? wet + 1 : 0
      maxWet = Math.max(maxWet, wet)
    }
    // 2 点血 = 40 Tick 溺死；必须远早于此上岸。
    expect(maxWet).toBeLessThan(30)
    expect(['13,2', '13,3']).not.toContain(cells[cells.length - 1])
  })

  it('a hunter facing the king across a pond goes around to a cell whose blast reaches him', () => {
    let map = standardMap()
    for (const x of [1, 2, 3]) map = setCell(map, x, 3, '~')
    const spec: SnapSpec = {
      map,
      tick: 100,
      king: 3,
      players: [
        { id: 2, X: 1, Y: 4 },
        { id: 3, X: 1, Y: 2, hats: 4 },
      ],
    }
    const run = runMini(spec, new Map([[2, brain('hunter', 2, 11)]]), 240, true)
    expect(run.placed.length).toBe(1)
    const p = run.placed[0]
    const board = buildBoard(makeSnapshot(spec))
    const covered = traceBlast(board, p.X, p.Y, config.initialBombPower, { covered: [], bricks: [] }).covered
    expect(covered).toContain(cellIdx(1, 2))
  })

  it('a hunter does not park on an attack cell where the bomb gate fails', () => {
    // 站在 (2,1) 能炸到 (3,1) 的对手；退路 (1,2) 是水（自检只认陆路），(3,2)… 在别人的炸弹十字里：放了逃不掉。
    const map = carved(
      [
        [1, 1],
        [2, 1],
        [3, 1],
        [3, 2],
        [3, 3],
        [3, 4],
        [3, 5],
        [1, 3],
      ],
      [[1, 2, '~']],
    )
    const snap = (tick: number): WorldSnapshot =>
      makeSnapshot({
        map,
        tick,
        players: [{ id: 2, X: 2, Y: 1 }, { id: 3, X: 3, Y: 1 }],
        bombs: [{ id: 30, X: 3, Y: 3, owner: 9, fuseEndTick: 160 }],
      })
    const input = { X: 2, Y: 1, power: 2, placeTick: 101, fuseTicks: 42, dangerTicks: 8, tpcLand: 6, tpcWater: 9 }
    expect(evaluateBomb(buildBoard(snap(100)), input).ok).toBe(false)
    const b = brain('hunter', 2, 3)
    const goals: string[] = []
    for (let t = 100; t < 106; t++) {
      expect(bombs(b.decide(snap(t)))).toBe(0)
      const g = b.debugState().goal
      goals.push(g ? `${g.X},${g.Y}` : '-')
    }
    // 修复前：追击目标就是脚下这格，自检不过也原地等着。
    expect(goals.slice(2).every((g) => g !== '2,1')).toBe(true)
  })

  it('every personality spends time hunting, and hunting targets the hat king', () => {
    let map = standardMap()
    for (const [x, y] of [
      [5, 3],
      [7, 5],
      [3, 7],
      [11, 9],
    ])
      map = setCell(map, x, y, 'b')
    for (const p of ['farmer', 'hunter', 'collector', 'roamer'] as const) {
      const b = brain(p, 2, 21)
      const seen = new Set<BotBehaviour>()
      let targetedKing = false
      for (let t = 100; t < 3100; t++) {
        b.decide(
          makeSnapshot({
            map,
            tick: t,
            king: 4,
            players: [
              { id: 2, X: 1, Y: 1 },
              { id: 3, X: 17, Y: 1 },
              { id: 4, X: 15, Y: 15, hats: 5 },
            ],
          }),
        )
        const st = b.debugState()
        seen.add(st.behaviour)
        if (st.behaviour === 'hunt' && st.huntTarget === 4) targetedKing = true
      }
      expect(seen.has('hunt'), p).toBe(true)
      expect(seen.size, p).toBeGreaterThanOrEqual(2)
      expect(targetedKing, p).toBe(true)
    }
  })
})

describe('final circle', () => {
  it('board marks cells outside the ring as poisoned now and outside the announced ring from its tick', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 300,
      players: [{ id: 1, X: 9, Y: 9 }],
      finalCircle: finalCircle({ tick: 300, ring: 13, next: 9, nextTick: 500 }),
    })
    const board = buildBoard(snap)
    expect(board.poisonAt[cellIdx(1, 9)]).toBe(300)
    expect(board.poisonAt[cellIdx(3, 9)]).toBe(500)
    expect(board.poisonAt[cellIdx(4, 9)]).toBe(500)
    expect(board.poisonAt[cellIdx(5, 9)]).toBe(NEVER)
    expect(board.poisonAt[cellIdx(9, 9)]).toBe(NEVER)
  })

  it('a bot outside the ring heads back inside', () => {
    const b = brain('roamer', 1, 5)
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 300,
      players: [{ id: 1, X: 1, Y: 9 }],
      finalCircle: finalCircle({ tick: 300, ring: 13 }),
    }
    const run = runMini(spec, new Map([[1, b]]), 40)
    const [x, y] = run.cells.get(1)![39].split(',').map(Number)
    expect(x).toBeGreaterThanOrEqual(3)
    expect(y).toBeGreaterThanOrEqual(3)
    expect(y).toBeLessThanOrEqual(15)
  })

  it('once the next ring is announced the bot moves inside it early', () => {
    const b = brain('farmer', 1, 5)
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 300,
      players: [{ id: 1, X: 1, Y: 1 }],
      finalCircle: finalCircle({ tick: 300, next: 9, nextTick: 500 }),
    }
    const run = runMini(spec, new Map([[1, b]]), 120)
    const [x, y] = run.cells.get(1)![119].split(',').map(Number)
    expect(x).toBeGreaterThanOrEqual(5)
    expect(x).toBeLessThanOrEqual(13)
    expect(y).toBeGreaterThanOrEqual(5)
    expect(y).toBeLessThanOrEqual(13)
  })

  it('path search prefers routes that stay inside the ring and flags the ones that cannot', () => {
    const snap = makeSnapshot({ map: standardMap(), tick: 300, players: [{ id: 1, X: 3, Y: 3 }], finalCircle: finalCircle({ tick: 300, ring: 13 }) })
    const board = buildBoard(snap)
    const dm = buildDangerMap(board, 8)
    const f = searchPaths(board, dm, cellIdx(3, 3), board.now, { tpcLand: 6, tpcWater: 9, allowWater: false })
    expect(f.viaPoison[cellIdx(3, 9)]).toBe(0)
    expect(f.viaPoison[cellIdx(9, 3)]).toBe(0)
    expect(f.viaPoison[cellIdx(1, 1)]).toBe(1)
    expect(f.poisonTicks[cellIdx(1, 1)]).toBeGreaterThan(0)
    // 不穿毒可达的格子都排在必须穿毒的格子之前。
    const firstPoison = f.reached.findIndex((c) => f.viaPoison[c] === 1)
    expect(f.reached.slice(firstPoison).every((c) => f.viaPoison[c] === 1)).toBe(true)
  })

  it('the bomb gate rejects a bomb whose only escape is into the poison', () => {
    const map = carved([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
    ])
    const input = { X: 4, Y: 3, power: 2, placeTick: 301, fuseTicks: 42, dangerTicks: 8, tpcLand: 6, tpcWater: 9 }
    const plain = buildBoard(makeSnapshot({ map, tick: 300, players: [{ id: 1, X: 4, Y: 3 }] }))
    expect(evaluateBomb(plain, input).ok).toBe(true)
    const ringed = buildBoard(makeSnapshot({ map, tick: 300, players: [{ id: 1, X: 4, Y: 3 }], finalCircle: finalCircle({ tick: 300, ring: 13 }) }))
    expect(evaluateBomb(ringed, input).ok).toBe(false)
  })

  it('a chest blocks movement and fire, and farming goes for a cell whose cross hits it', () => {
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 300,
      players: [{ id: 1, X: 1, Y: 1 }],
      chests: [{ id: 50, X: 5, Y: 1 }],
      finalCircle: finalCircle({ tick: 300 }),
    }
    const board = buildBoard(makeSnapshot(spec))
    expect(isOpen(board, cellIdx(5, 1))).toBe(false)
    const bl = traceBlast(board, 3, 1, 4, { covered: [], bricks: [], chests: [] })
    expect(bl.chests).toEqual([cellIdx(5, 1)])
    expect(bl.covered).toContain(cellIdx(4, 1))
    expect(bl.covered).not.toContain(cellIdx(5, 1))
    expect(bl.covered).not.toContain(cellIdx(6, 1))

    const run = runMini(spec, new Map([[1, brain('farmer', 1, 9)]]), 60, true)
    expect(run.placed.length).toBe(1)
    const p = run.placed[0]
    const hits = traceBlast(board, p.X, p.Y, config.initialBombPower, { covered: [], bricks: [], chests: [] }).chests
    expect(hits).toContain(cellIdx(5, 1))
  })

  it('eliminated players are never targets', () => {
    const b = brain('hunter', 1, 4)
    for (let t = 300; t < 340; t++) {
      const out = b.decide(
        makeSnapshot({
          map: standardMap(),
          tick: t,
          king: 2,
          players: [
            { id: 1, X: 1, Y: 1 },
            { id: 2, X: 3, Y: 1, hats: 3, eliminated: true },
            { id: 3, X: 15, Y: 15 },
          ],
          finalCircle: finalCircle({ tick: t, alive: 2 }),
        }),
      )
      expect(bombs(out)).toBe(0)
      expect(b.debugState().huntTarget).not.toBe(2)
    }
  })

  it('with few players left a bot bombs an enemy standing in its cross', () => {
    const b = brain('farmer', 1, 4)
    let placed = 0
    for (let t = 300; t < 306 && placed === 0; t++) {
      placed += bombs(
        b.decide(
          makeSnapshot({
            map: standardMap(),
            tick: t,
            players: [
              { id: 1, X: 5, Y: 5 },
              { id: 2, X: 7, Y: 5 },
            ],
            finalCircle: finalCircle({ tick: t, alive: 2 }),
          }),
        ),
      )
    }
    expect(placed).toBe(1)
  })
})

describe('loot', () => {
  const pickupModes = (droppedBy: U64): string[] => {
    const b = brain('farmer', 1, 13)
    const modes: string[] = []
    for (let t = 100; t < 112; t++) {
      b.decide(
        makeSnapshot({
          map: standardMap(),
          tick: t,
          players: [{ id: 1, X: 1, Y: 1 }],
          pickups: [{ id: 40, X: 1, Y: 11, kind: PickupKind.FirePlus, droppedBy }],
        }),
      )
      modes.push(b.debugState().mode)
    }
    return modes
  }

  it('a power-up dropped by a dead player is worth a longer detour than a brick drop', () => {
    expect(pickupModes(7)).toContain('pickup')
    expect(pickupModes(0)).not.toContain('pickup')
  })

  const modesFor = (personality: BotPersonality, spec: Omit<SnapSpec, 'tick'>, ticks = 12): string[] => {
    const b = brain(personality, 1, 13)
    const modes: string[] = []
    for (let t = 100; t < 100 + ticks; t++) {
      b.decide(makeSnapshot({ ...spec, tick: t }))
      modes.push(b.debugState().mode)
    }
    return modes
  }

  it('snapshots never carry hat piles and a bot has no hat-pile mode (ADR 0028)', () => {
    const modes = modesFor('collector', { map: standardMap(), players: [{ id: 1, X: 1, Y: 1 }] }, 40)
    expect(makeSnapshot({ map: standardMap(), players: [{ id: 1, X: 1, Y: 1 }] }).HatPiles).toEqual([])
    expect(modes).not.toContain('hat')
  })

  it('a power-up is worth a longer walk than a health pack (hats = power-ups)', () => {
    // (1,1) → (1,10) = 9 步：超出普通糖果 7 步，但强化多追 2 步。
    const base = { map: standardMap(), players: [{ id: 1, X: 1, Y: 1, hp: 4 }] }
    expect(modesFor('farmer', { ...base, pickups: [{ id: 40, X: 1, Y: 10, kind: PickupKind.SpeedPlus }] })).toContain('pickup')
    expect(modesFor('farmer', { ...base, pickups: [{ id: 40, X: 1, Y: 10, kind: PickupKind.HealthPack }] })).not.toContain('pickup')
  })

  it('a power-up the bot is capped on is ignored', () => {
    const spec = { map: standardMap(), players: [{ id: 1, X: 1, Y: 1, power: rules.powerCap }], pickups: [{ id: 40, X: 1, Y: 5, kind: PickupKind.FirePlus }] }
    expect(modesFor('farmer', spec)).not.toContain('pickup')
  })

  it('a collector rushes across the map to a fresh death drop; a farmer does not', () => {
    // (1,1) → (15,9) = 22 步：只有 collector 为新鲜掉落改行去抢。
    const spec = { map: standardMap(), players: [{ id: 1, X: 1, Y: 1 }], pickups: [{ id: 41, X: 15, Y: 9, kind: PickupKind.BombPlus, droppedBy: 6 }] }
    expect(modesFor('collector', spec)).toContain('pickup')
    expect(modesFor('farmer', spec)).not.toContain('pickup')
    const b = brain('collector', 1, 13)
    for (let t = 100; t < 112; t++) b.decide(makeSnapshot({ ...spec, tick: t }))
    expect(b.debugState().behaviour).toBe('collect')
    expect(b.debugState().goal).toEqual({ X: 15, Y: 9 })
  })

  it('a death drop lying in a cross whose fuse is still long is grabbed before the fire; a brick drop is not', () => {
    const at = (fuseEndTick: number, droppedBy: U64) =>
      modesFor('farmer', {
        map: standardMap(),
        players: [{ id: 1, X: 1, Y: 1 }],
        bombs: [{ id: 30, X: 7, Y: 1, owner: 9, fuseEndTick }],
        pickups: [{ id: 42, X: 5, Y: 1, kind: PickupKind.FirePlus, droppedBy }],
      }, 4)
    expect(at(170, 6)).toContain('pickup')
    expect(at(170, 0), 'brick').not.toContain('pickup')
    // 火正好在到达前后烧到那格（既来不及抢完就走，也不是到达时已经烧完）：不抢。
    expect(at(135, 6), 'soon').not.toContain('pickup')
  })

  it('a stale death drop no longer triggers the collector rush', () => {
    // 同一件掉落已经在场上躺了 > 8 秒：collector 不再为它横穿全图（普通捡拾范围外）。
    const spec = { map: standardMap(), players: [{ id: 1, X: 1, Y: 1 }], pickups: [{ id: 41, X: 15, Y: 9, kind: PickupKind.BombPlus, droppedBy: 6 }] }
    const b = brain('collector', 1, 13)
    // 先在 t=100 看见一次（此时不在 Running，不做决策），300 Tick 后再开始决策。
    b.decide(makeSnapshot({ ...spec, tick: 100, phase: MatchPhase.Warmup }))
    const modes: string[] = []
    for (let t = 400; t < 412; t++) {
      b.decide(makeSnapshot({ ...spec, tick: t }))
      modes.push(b.debugState().mode)
    }
    expect(b.debugState().behaviour).not.toBe('collect')
    expect(modes).not.toContain('pickup')
  })
})

describe('hunt targets (hats = power-ups)', () => {
  const targetOf = (personality: BotPersonality, players: SnapSpec['players'], king = 0): U64 => {
    const b = brain(personality, 1, 21)
    const counts = new Map<U64, number>()
    for (let t = 100; t < 1600; t++) {
      b.decide(makeSnapshot({ map: standardMap(), tick: t, king, players }))
      const st = b.debugState()
      if (st.behaviour === 'hunt' && st.huntTarget !== 0) counts.set(st.huntTarget, (counts.get(st.huntTarget) ?? 0) + 1)
    }
    let best: U64 = 0
    let n = 0
    for (const [id, c] of counts) if (c > n) [best, n] = [id, c]
    return best
  }

  it('a hunter goes after the richest enemy rather than the nearest poor one', () => {
    const players = [
      { id: 1, X: 1, Y: 1 },
      { id: 2, X: 7, Y: 1 },
      { id: 3, X: 1, Y: 13, hats: 7 },
    ]
    expect(targetOf('hunter', players)).toBe(3)
  })

  it('the hat king outranks an equally rich non-king', () => {
    const players = [
      { id: 1, X: 9, Y: 9 },
      { id: 2, X: 9, Y: 3, hats: 5 },
      { id: 3, X: 9, Y: 15, hats: 5 },
    ]
    expect(targetOf('hunter', players, 3)).toBe(3)
  })
})
