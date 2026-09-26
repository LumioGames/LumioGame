import { describe, expect, it } from 'vitest'
import { 方向 } from '../contract'
import { buildBoard } from './board'
import { buildDangerMap, conflicts, NEVER, restsAt, traceBlast } from './danger-map'
import { cellIdx, makeSnapshot, setCell, standardMap } from './test-fixtures'

const DANGER = 8

describe('danger map', () => {
  it('chained bomb inherits the smaller detonation tick and its cross uses it', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [
        { id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 110 },
        { id: 11, X: 3, Y: 1, owner: 1, fuseEndTick: 140 },
      ],
    })
    const board = buildBoard(snap)
    const dm = buildDangerMap(board, DANGER)
    expect(dm.det).toEqual([110, 110])
    // B 的右臂与下臂按继承来的 110 起爆
    expect(dm.from[cellIdx(5, 1)]).toBe(110)
    expect(dm.from[cellIdx(3, 3)]).toBe(110)
    expect(dm.until[cellIdx(5, 1)]).toBe(110 + DANGER)
    // 中心与 A 的臂
    expect(dm.from[cellIdx(1, 1)]).toBe(110)
    expect(dm.from[cellIdx(1, 3)]).toBe(110)
    expect(dm.from[cellIdx(1, 4)]).toBe(NEVER)
  })

  it('chain propagates transitively through several bombs', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [
        { id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 130 },
        { id: 11, X: 3, Y: 1, owner: 1, fuseEndTick: 150 },
        { id: 12, X: 5, Y: 1, owner: 1, fuseEndTick: 105 },
      ],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.det).toEqual([105, 105, 105])
    expect(dm.from[cellIdx(1, 3)]).toBe(105)
  })

  it('铁皮 stops the arm and is not covered', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [{ id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 120, power: 4 }],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.from[cellIdx(1, 0)]).toBe(NEVER)
    expect(dm.from[cellIdx(0, 1)]).toBe(NEVER)
    expect(dm.from[cellIdx(5, 1)]).toBe(120)
  })

  it('soft brick stops the arm, is not covered, and blocks the chain', () => {
    const map = setCell(standardMap(), 4, 1, 'b')
    const snap = makeSnapshot({
      map,
      tick: 100,
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [
        { id: 10, X: 3, Y: 1, owner: 1, fuseEndTick: 110 },
        { id: 11, X: 5, Y: 1, owner: 1, fuseEndTick: 150 },
      ],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.det).toEqual([110, 150])
    expect(dm.doomedAt[cellIdx(4, 1)]).toBe(110)
    // 砖格不算 A 的覆盖；砖被 A 炸掉后，B 在 150 起爆时火焰才穿过这一格
    expect(dm.from[cellIdx(4, 1)]).toBe(150)
    expect(dm.from[cellIdx(2, 1)]).toBe(110)
  })

  it('木箱 behaves like a destructible brick', () => {
    const map = setCell(standardMap(), 2, 1, 'c')
    const snap = makeSnapshot({
      map,
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [{ id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 120 }],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.from[cellIdx(2, 1)]).toBe(NEVER)
    expect(dm.from[cellIdx(3, 1)]).toBe(NEVER)
    expect(dm.doomedAt[cellIdx(2, 1)]).toBe(120)
  })

  it('water is covered and then stops the arm', () => {
    const map = setCell(standardMap(), 1, 14, '~')
    const snap = makeSnapshot({
      map,
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [{ id: 10, X: 1, Y: 13, owner: 1, fuseEndTick: 120, power: 3 }],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.from[cellIdx(1, 14)]).toBe(120)
    expect(dm.from[cellIdx(1, 15)]).toBe(NEVER)
    expect(dm.from[cellIdx(1, 10)]).toBe(120)
  })

  it('flames continue past a chained bomb', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      players: [{ id: 1, X: 9, Y: 9 }],
      bombs: [
        { id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 120, power: 4 },
        { id: 11, X: 2, Y: 1, owner: 1, fuseEndTick: 200, power: 1 },
      ],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.det).toEqual([120, 120])
    expect(dm.from[cellIdx(5, 1)]).toBe(120)
  })

  it('active flames use Reach* until DangerUntilTick', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 1, Y: 1 }],
      bombs: [{ id: 10, X: 9, Y: 9, owner: 1, fuseEndTick: 98, exploded: { at: 98, reach: [1, 0, 2, 0] } }],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER)
    expect(dm.from[cellIdx(9, 9)]).toBe(98)
    expect(dm.until[cellIdx(9, 9)]).toBe(106)
    expect(dm.from[cellIdx(9, 8)]).toBe(98)
    expect(dm.from[cellIdx(7, 9)]).toBe(98)
    expect(dm.from[cellIdx(9, 10)]).toBe(NEVER)
    expect(dm.from[cellIdx(10, 9)]).toBe(NEVER)
  })

  it('a virtual bomb can be chained earlier by an existing one', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      tick: 100,
      players: [{ id: 1, X: 3, Y: 1 }],
      bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 110 }],
    })
    const dm = buildDangerMap(buildBoard(snap), DANGER, { X: 3, Y: 1, power: 2, fuseEndTick: 143 })
    expect(dm.det).toEqual([110, 110])
    expect(dm.from[cellIdx(5, 1)]).toBe(110)
  })
})

/** 原型扩展（NON-CONTRACT，ADR 0030 / design §15）：穿透、隐藏弹、滑行弹、覆盖表、护体与烧伤。 */
describe('danger map, round 4', () => {
  it('traceBlast with pierce 1 covers the first brick and stops at the second (shared fixtures: tests/bot-sim-mirror)', () => {
    const board = buildBoard(makeSnapshot({ map: setCell(setCell(standardMap(), 3, 1, 'b'), 4, 1, 'b'), players: [] }))
    const bl = traceBlast(board, 1, 1, 4, { covered: [], bricks: [] }, undefined, 1)
    expect(bl.covered).toContain(cellIdx(3, 1))
    expect(bl.covered).not.toContain(cellIdx(4, 1))
    expect(bl.bricks).toEqual([cellIdx(3, 1), cellIdx(4, 1)])
  })

  it('a pierce bomb chains a bomb behind the pierced brick', () => {
    const map = setCell(standardMap(), 3, 1, 'b')
    const snap = makeSnapshot({
      map,
      players: [],
      bombs: [
        { id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 110, power: 3, pierce: 1 },
        { id: 11, X: 4, Y: 1, owner: 1, fuseEndTick: 150 },
      ],
    })
    expect(buildDangerMap(buildBoard(snap), DANGER).det).toEqual([110, 110])
    const plain = makeSnapshot({ map, players: [], bombs: [{ id: 10, X: 1, Y: 1, owner: 1, fuseEndTick: 110, power: 3 }, { id: 11, X: 4, Y: 1, owner: 1, fuseEndTick: 150 }] })
    expect(buildDangerMap(buildBoard(plain), DANGER).det).toEqual([110, 150])
  })

  it('hidden bombs: no danger, no chain, but they still occupy their cell', () => {
    const snap = makeSnapshot({
      map: standardMap(),
      players: [],
      bombs: [
        { id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 110 },
        { id: 11, X: 3, Y: 1, owner: 2, fuseEndTick: 150 },
      ],
    })
    const board = buildBoard(snap)
    board.pending[0].hidden = true
    const dm = buildDangerMap(board, DANGER)
    expect(dm.from[cellIdx(1, 2)]).toBe(NEVER)
    expect(dm.det[1]).toBe(150)
    expect(dm.cover[0]).toEqual([])
    expect(board.bombAt[cellIdx(1, 1)]).toBe(0)
  })

  it('a kicked bomb explodes at its predicted stop cell (stops before a brick)', () => {
    const map = setCell(standardMap(), 7, 1, 'b')
    const snap = makeSnapshot({
      map,
      tick: 100,
      players: [],
      bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 140, kick: { dir: 方向.右, progressMilli: 0, cellsLeft: 99 } }],
    })
    const board = buildBoard(snap)
    expect(board.pending[0].moving).toBe(true)
    expect(board.pending[0].blastCell).toBe(cellIdx(6, 1))
    const dm = buildDangerMap(board, DANGER)
    expect(dm.from[cellIdx(6, 1)]).toBe(140)
    expect(dm.from[cellIdx(1, 2)]).toBe(NEVER)
    expect(dm.cover[0]).toContain(cellIdx(4, 1))
  })

  it('a kicked bomb that will not reach far before its fuse stops early; one kicked into water is doused', () => {
    // 400 千分格 / Tick：5 Tick 只够 2 格。
    const short = buildBoard(makeSnapshot({ map: standardMap(), tick: 100, players: [], bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 105, kick: { dir: 方向.右, progressMilli: 0, cellsLeft: 99 } }] }))
    expect(short.pending[0].blastCell).toBe(cellIdx(3, 1))
    const wet = buildBoard(makeSnapshot({ map: setCell(standardMap(), 3, 1, '~'), tick: 100, players: [], bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 140, kick: { dir: 方向.右, progressMilli: 0, cellsLeft: 99 } }] }))
    expect(wet.pending[0].doused).toBe(true)
    expect(buildDangerMap(wet, DANGER).from[cellIdx(3, 1)]).toBe(NEVER)
  })

  it('cover lists match each blast; the virtual bomb is last', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), players: [], bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 140 }] }))
    const dm = buildDangerMap(board, DANGER, { X: 5, Y: 1, power: 1, fuseEndTick: 150 })
    expect(dm.cover).toHaveLength(2)
    expect([...dm.cover[1]].sort((a, b) => a - b)).toEqual([cellIdx(4, 1), cellIdx(5, 1), cellIdx(6, 1), cellIdx(5, 2)].sort((a, b) => a - b))
  })

  it('conflicts with immuneUntil ignores danger that ends inside the bubble', () => {
    const board = buildBoard(makeSnapshot({ map: standardMap(), players: [], bombs: [{ id: 10, X: 1, Y: 1, owner: 2, fuseEndTick: 110 }] }))
    const dm = buildDangerMap(board, DANGER)
    const c = cellIdx(1, 1)
    expect(conflicts(dm, c, 105, 125)).toBe(true)
    expect(conflicts(dm, c, 105, 125, 2, 130)).toBe(false)
    expect(conflicts(dm, c, 105, 125, 2, 115)).toBe(true)
  })

  it('burn zones of others count as danger for resting; own zones do not', () => {
    const zones = [{ owner: 2, source: 'aura' as const, cells: [{ X: 5, Y: 5 }], untilTick: 180 }]
    const theirs = buildBoard(makeSnapshot({ map: standardMap(), players: [], fireZones: zones }), { self: 1, burnPad: 1 })
    expect(theirs.burnUntil[cellIdx(5, 5)]).toBe(180)
    expect(theirs.burnUntil[cellIdx(6, 6)]).toBe(180)
    expect(theirs.burnUntil[cellIdx(7, 5)]).toBe(0)
    const dm = buildDangerMap(theirs, DANGER)
    expect(restsAt(dm, cellIdx(6, 5), 120)).toBe(false)
    expect(restsAt(dm, cellIdx(6, 5), 181)).toBe(true)
    const mine = buildBoard(makeSnapshot({ map: standardMap(), players: [], fireZones: zones }), { self: 2, burnPad: 1 })
    expect(mine.burnUntil[cellIdx(5, 5)]).toBe(0)
    const wall = buildBoard(makeSnapshot({ map: standardMap(), players: [], fireZones: [{ ...zones[0], source: 'firewall' }] }), { self: 1, burnPad: 1 })
    expect(wall.burnUntil[cellIdx(6, 5)]).toBe(0)
  })
})
