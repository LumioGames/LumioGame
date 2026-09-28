import { describe, expect, it } from 'vitest'
import { hatCountOf, maxHealthOf } from '../death-drops'
import { hashWorld } from '../hash'
import { makeBomb, newId, type World } from '../world'
import { cell, giveLevels, makeWorld, player, put, step } from './helpers'

/**
 * 方向 B · M1 新状态的接缝（原型扩展 NON-CONTRACT，ADR 0039 / 0040 / 0041）：金心 / 狂暴 / uncounted 炸弹 / 资源箱 / 中央补给
 * 都进 StateHash（全为缺省时整段不写，旧对局哈希不变）并发布到快照；uncounted 炸弹不计帽数。规则接线在各卡里测。
 */

function viewOf(f: ReturnType<typeof step>, id: number) {
  const p = f.snapshot.Players.find((q) => q.NetEntityIdRaw === id)
  if (!p) throw new Error(`no view ${id}`)
  return p
}

describe('uncounted bombs', () => {
  it('bombs flagged uncounted (future frenzy / cluster sub-bombs) are not hats and do not raise the cap', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    giveLevels(w, 1, 1, 2, 0)
    const counted = makeBomb({ id: newId(w), owner: 1, cell: cell(w, 5, 5), bornTick: w.t, fuseEndTick: w.t + 40, power: 2 })
    p.capacity--
    w.bombs.push(counted)
    expect(hatCountOf(w, p)).toBe(3)
    const extra = makeBomb({ id: newId(w), owner: 1, cell: cell(w, 7, 7), bornTick: w.t, fuseEndTick: w.t + 40, power: 2, uncounted: true })
    w.bombs.push(extra)
    expect(hatCountOf(w, p)).toBe(3)
    expect(maxHealthOf(w, p)).toBe(6)
    expect(step(w).snapshot.Bombs.find((b) => b.NetEntityIdRaw === extra.id)?.uncounted).toBe(true)
  })
})

describe('hash and snapshot cover the new fields', () => {
  it('goldHearts / frenzyUntilTick / frenzyLastPlaceTick / uncounted / resource boxes / supply all change the hash; defaults leave it as before', () => {
    const a = makeWorld()
    const b = makeWorld()
    expect(hashWorld(a)).toBe(hashWorld(b))
    player(b, 1).goldHearts = 1
    expect(hashWorld(b)).not.toBe(hashWorld(a))
    player(b, 1).goldHearts = 0
    expect(hashWorld(b)).toBe(hashWorld(a))
    player(b, 1).frenzyUntilTick = 99
    expect(hashWorld(b)).not.toBe(hashWorld(a))
    player(b, 1).frenzyUntilTick = 0
    // M1-2（ADR 0040）：狂暴期最近放弹 Tick 也进哈希。
    player(b, 1).frenzyLastPlaceTick = 5
    expect(hashWorld(b)).not.toBe(hashWorld(a))
    player(b, 1).frenzyLastPlaceTick = 0
    expect(hashWorld(b)).toBe(hashWorld(a))
    const bomb = makeBomb({ id: 500, owner: 1, cell: cell(b, 3, 3), bornTick: 0, fuseEndTick: 40, power: 2 })
    const c = makeWorld()
    b.bombs.push(bomb)
    c.bombs.push({ ...bomb, uncounted: true })
    expect(hashWorld(c)).not.toBe(hashWorld(b))
    const d = makeWorld()
    d.resourceBoxes = [{ cell: cell(d, 9, 9), tier: 'gold', hitsRequired: 2, hitsLeft: 2, hitBy: [] }]
    expect(hashWorld(d)).not.toBe(hashWorld(a))
    d.resourceBoxes[0].hitsLeft = 1
    const h1 = hashWorld(d)
    d.resourceBoxes[0].hitsLeft = 2
    expect(hashWorld(d)).not.toBe(h1)
    const e = makeWorld()
    e.supply = { cell: cell(e, 9, 9), announceTick: 1000, openTick: 1200, state: 'pending' }
    expect(hashWorld(e)).not.toBe(hashWorld(a))
  })

  it('snapshot: PlayerView cap / gold / frenzy, MatchMeta map tier + zones + supply, ResourceBoxes', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    p.goldHearts = 2
    p.frenzyUntilTick = 77
    w.resourceBoxes = [{ cell: cell(w, 9, 9), tier: 'gold', hitsRequired: 2, hitsLeft: 1, hitBy: [5] }]
    w.supply = { cell: cell(w, 9, 9), announceTick: 1000, openTick: 1200, state: 'announced' }
    const f = step(w)
    expect(viewOf(f, 1)).toMatchObject({ maxHealth: 10, goldHearts: 2, frenzyUntilTick: 77 })
    expect(f.snapshot.match.map).toEqual({ tier: 19, size: 19, zones: { coreMaxD: 2, midMaxD: 5 } })
    expect(f.snapshot.match.supply).toEqual({ Cell: { X: 9, Y: 9 }, announceTick: 1000, openTick: 1200, state: 'announced' })
    expect(f.snapshot.ResourceBoxes).toEqual([{ Cell: { X: 9, Y: 9 }, tier: 'gold', HitsLeft: 1, HitsRequired: 2 }])
    const g = step(makeWorld())
    expect(g.snapshot.match.supply).toBeNull()
    expect(g.snapshot.ResourceBoxes).toEqual([])
  })
})
