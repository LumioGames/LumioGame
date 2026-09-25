import { describe, expect, it } from 'vitest'
import { buildBoard } from './board'
import { buildDangerMap, NEVER } from './danger-map'
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
