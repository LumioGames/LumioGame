import { describe, expect, it } from 'vitest'
import { BlockType, bombCandyPool, PickupKind, type ResourceBoxTier } from '../../contract'
import { openChests } from '../chest'
import { clearRing, ringRect } from '../final-circle'
import { spawnDrops } from '../pickup'
import { addBrickWrite } from '../terrain-commit'
import type { SimResourceBox, World } from '../world'
import { addBomb, cell, evs, makeWorld, put, run, setBrick, step, tierOpts } from './helpers'

/**
 * 三圈三级资源（ADR 0040，design §5.0 / §4.2）：积木按圈掉率、木 / 铁 / 金箱内容、金箱 2 次独立命中、强力宝箱 20% 金心。
 * 27 档棋盘中心 (13,13)：(3,3) 外圈 d = 10、(7,7) 中圈 d = 6、(11,11) 核心 d = 2。
 */

function world27(over: Parameters<typeof tierOpts>[2] = {}): World {
  const w = makeWorld(tierOpts(27, 2, over))
  put(w, 1, 25, 25)
  put(w, 2, 25, 23)
  return w
}

function putBox(w: World, x: number, y: number, tier: ResourceBoxTier): SimResourceBox {
  const c = cell(w, x, y)
  setBrick(w, x, y, BlockType.木箱)
  const hits = w.rules.map.boxes[tier].hits
  const box: SimResourceBox = { cell: c, tier, hitsRequired: hits, hitsLeft: hits, hitBy: [] }
  ;(w.resourceBoxes ??= []).push(box)
  return box
}

/** 直接对一格下一张爆炸写单并跑掉落系统（每次推进 w.t，让按事件派生的随机流各不相同）；返回本次生成的拾取物种类。 */
function dropOnce(w: World, c: number, block: BlockType): PickupKind[] {
  w.t++
  w.pickups = []
  w.out = []
  w.batch.clear()
  addBrickWrite(w, c, block, 0, 0)
  spawnDrops(w)
  w.batch.clear()
  return w.pickups.map((p) => p.kind)
}

const CANDY = new Set<PickupKind>([PickupKind.FirePlus, PickupKind.BombPlus, PickupKind.SpeedPlus, PickupKind.HealthPack])

describe('soft-brick drop rate by ring (ADR 0040)', () => {
  it('≥ 5000 bricks per ring: 25 / 35 / 45 % within ±3 percentage points', () => {
    const w = world27()
    const N = 6000
    const rings = { outer: cell(w, 3, 3), mid: cell(w, 7, 7), core: cell(w, 11, 11) } as const
    for (const [zone, c] of Object.entries(rings) as [keyof typeof rings, number][]) {
      let drops = 0
      for (let i = 0; i < N; i++) drops += dropOnce(w, c, BlockType.积木).length
      const permille = (drops * 1000) / N
      expect(Math.abs(permille - w.rules.map.brickDropPermille[zone]), `${zone} ${permille}‰`).toBeLessThanOrEqual(30)
    }
  })

  it('the explosion pipeline reads the ring of each brick (only the mid ring drops when its rate is 100 %)', () => {
    const w = world27({ map: { ...tierOpts(27).rules!.map!, brickDropPermille: { outer: 0, mid: 1000, core: 0 } } })
    // 一颗大火力弹横扫第 13 行：x = 3 外圈、x = 7 中圈、x = 11 核心，各隔一格一块积木。
    for (const x of [3, 7, 11]) setBrick(w, x, 13, BlockType.积木)
    const b1 = addBomb(w, 1, 1, 13, 1, 2)
    const b2 = addBomb(w, 1, 5, 13, 1, 2)
    const b3 = addBomb(w, 1, 9, 13, 1, 2)
    const f = step(w)
    expect([b1, b2, b3].every((b) => b.explodedAtTick > 0)).toBe(true)
    expect(evs(f, 'BrickDestroyed')).toHaveLength(3)
    expect(evs(f, 'PickupSpawned').map((p) => p.Cell)).toEqual([{ X: 7, Y: 13 }])
  })
})

describe('resource box contents (ADR 0040, design §5.0; special bomb = Lv1 bomb-slot skill candy until ADR 0041)', () => {
  it('wood box: exactly one candy or health pack, never a skill candy or gold heart', () => {
    const w = world27()
    const c = putBox(w, 3, 3, 'wood').cell
    for (let i = 0; i < 2000; i++) {
      const kinds = dropOnce(w, c, BlockType.木箱)
      expect(kinds).toHaveLength(1)
      expect(CANDY.has(kinds[0])).toBe(true)
    }
  })

  it('iron box: one candy every time, 50 % a special bomb (±3 pp over 3000 boxes)', () => {
    const w = world27()
    const c = putBox(w, 7, 7, 'iron').cell
    let specials = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      const kinds = dropOnce(w, c, BlockType.木箱)
      expect(kinds.filter((k) => CANDY.has(k))).toHaveLength(1)
      const sp = w.pickups.filter((p) => p.kind === PickupKind.SkillCandy)
      expect(sp.length).toBeLessThanOrEqual(1)
      for (const p of sp) {
        expect(bombCandyPool(w.rules.skills)).toContain(p.skill)
        expect(p.level).toBe(w.rules.skillCandyLevel)
      }
      expect(kinds).not.toContain(PickupKind.GoldHeart)
      specials += sp.length
    }
    expect(Math.abs((specials * 1000) / N - 500)).toBeLessThanOrEqual(30)
  })

  it('gold box: two candies + one special bomb every time, 20 % a gold heart (±3 pp over 3000 boxes)', () => {
    const w = world27()
    const c = putBox(w, 11, 11, 'gold').cell
    let hearts = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      const kinds = dropOnce(w, c, BlockType.木箱)
      expect(kinds.filter((k) => CANDY.has(k))).toHaveLength(2)
      expect(kinds.filter((k) => k === PickupKind.SkillCandy)).toHaveLength(1)
      hearts += kinds.filter((k) => k === PickupKind.GoldHeart).length
    }
    expect(Math.abs((hearts * 1000) / N - 200)).toBeLessThanOrEqual(30)
  })

  it('an unregistered crate (old 19 map) keeps the old crate rule; a registered wood box on the 19 tier uses the wood table', () => {
    const w = makeWorld({ rules: { crateSkillCandyPermille: 1000 } })
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const kinds = dropOnce(w, cell(w, 3, 3), BlockType.木箱)
    expect(kinds).toEqual([PickupKind.SkillCandy])
    putBox(w, 5, 5, 'wood')
    const k2 = dropOnce(w, cell(w, 5, 5), BlockType.木箱)
    expect(k2).toHaveLength(1)
    expect(CANDY.has(k2[0])).toBe(true)
  })
})

describe('box hits through real explosions', () => {
  it('gold box needs two independent bomb hits: the first leaves it standing (arm stops, HitsLeft 1), the second opens it', () => {
    const w = world27({ goldBoxGoldHeartPermille: 1000 })
    const box = putBox(w, 11, 11, 'gold')
    const a = addBomb(w, 1, 11, 13, 1, 3)
    const f1 = step(w)
    expect(a.explodedAtTick).toBe(w.t)
    expect(a.reachUp).toBe(1)
    expect(a.covered).not.toContain(box.cell)
    expect(evs(f1, 'BrickDestroyed')).toHaveLength(0)
    expect(evs(f1, 'PickupSpawned')).toHaveLength(0)
    expect(w.brick[box.cell]).toBe(BlockType.木箱)
    expect(box).toMatchObject({ hitsLeft: 1, hitBy: [a.id] })
    expect(f1.snapshot.ResourceBoxes).toEqual([{ Cell: { X: 11, Y: 11 }, tier: 'gold', HitsLeft: 1, HitsRequired: 2 }])
    run(w, 20)
    const b = addBomb(w, 2, 9, 11, 1, 2)
    const f2 = step(w)
    expect(evs(f2, 'BrickDestroyed')).toMatchObject([{ Cell: { X: 11, Y: 11 }, Block: BlockType.木箱, OwnerNetEntityIdRaw: 2, ChainId: b.id }])
    const loot = evs(f2, 'PickupSpawned')
    expect(loot.every((p) => p.Source === 'crate' && p.FromCell.X === 11 && p.FromCell.Y === 11)).toBe(true)
    expect(loot.map((p) => p.Kind).sort()).toEqual(
      [PickupKind.GoldHeart, PickupKind.SkillCandy, ...loot.filter((p) => CANDY.has(p.Kind)).map((p) => p.Kind)].sort(),
    )
    expect(loot.filter((p) => CANDY.has(p.Kind))).toHaveLength(2)
    expect(new Set(loot.map((p) => `${p.Cell.X},${p.Cell.Y}`)).size).toBe(loot.length)
    expect(w.brick[box.cell]).toBe(BlockType.Air)
    expect(w.resourceBoxes).toEqual([])
    expect(f2.snapshot.ResourceBoxes).toEqual([])
  })

  it('two bombs of one chain count as two hits (the gold box opens in that tick); the same bomb never counts twice', () => {
    const w = world27({ goldBoxGoldHeartPermille: 0 })
    const box = putBox(w, 11, 11, 'gold')
    // A 的上臂打箱、右臂点燃 C，C 的上臂点燃 B，B 的左臂再打箱：同一条链上两颗不同的弹。
    const a = addBomb(w, 1, 11, 13, 1, 2)
    const c = addBomb(w, 1, 13, 13, 40, 2)
    const b = addBomb(w, 1, 13, 11, 40, 2)
    const f = step(w)
    expect([b.chainId, c.chainId]).toEqual([a.id, a.id])
    expect(evs(f, 'BrickDestroyed')).toMatchObject([{ Cell: { X: 11, Y: 11 } }])
    const loot = evs(f, 'PickupSpawned').map((p) => p.Kind)
    expect(loot).toHaveLength(3)
    expect(loot).not.toContain(PickupKind.GoldHeart)
    expect(box.hitBy.sort()).toEqual([a.id, b.id].sort())
  })

  it('wood and iron boxes open on the first hit and leave the registry', () => {
    const w = world27({ boxLoot: { ...tierOpts(27).rules!.boxLoot!, iron: { candies: 1, specialBombPermille: 1000 } } })
    putBox(w, 3, 5, 'wood')
    putBox(w, 7, 5, 'iron')
    addBomb(w, 1, 3, 7, 1, 2)
    addBomb(w, 1, 7, 3, 1, 2)
    const f = step(w)
    expect(evs(f, 'BrickDestroyed')).toHaveLength(2)
    const kinds = evs(f, 'PickupSpawned').map((p) => p.Kind)
    expect(kinds.filter((k) => k === PickupKind.SkillCandy)).toHaveLength(1)
    expect(kinds).toHaveLength(3)
    expect(w.resourceBoxes).toEqual([])
  })

  it('the 5×5 clearing stage removes boxes inside the ring from the registry too', () => {
    const w = world27()
    putBox(w, 11, 11, 'gold')
    putBox(w, 7, 7, 'iron')
    clearRing(w, ringRect(27, 5))
    expect(w.brick[cell(w, 11, 11)]).toBe(BlockType.Air)
    expect(w.resourceBoxes!.map((b) => b.cell)).toEqual([cell(w, 7, 7)])
  })
})

describe('final-circle power chest gold heart (ADR 0039, design §4.2)', () => {
  function openOne(w: World): PickupKind[] {
    w.t++
    w.pickups = []
    w.out = []
    w.chests = [{ id: w.nextId++, cell: cell(w, 13, 13), hitsRequired: 3, stageIndex: 0, bornTick: w.t, hitsLeft: 0, hitBy: [], opener: 1 }]
    openChests(w)
    return w.pickups.map((p) => p.kind)
  }

  it('loot = fire / bomb / speed / health pack + one special bomb, then a gold heart with its own probability', () => {
    const base = [PickupKind.FirePlus, PickupKind.BombPlus, PickupKind.SpeedPlus, PickupKind.HealthPack, PickupKind.SkillCandy]
    expect(openOne(world27({ powerChestGoldHeartPermille: 1000 }))).toEqual([...base, PickupKind.GoldHeart])
    expect(openOne(world27({ powerChestGoldHeartPermille: 0 }))).toEqual(base)
    const w = world27()
    let hearts = 0
    const N = 3000
    for (let i = 0; i < N; i++) hearts += openOne(w).filter((k) => k === PickupKind.GoldHeart).length
    expect(Math.abs((hearts * 1000) / N - 200)).toBeLessThanOrEqual(30)
  })

  it('the 27 tier schedules 6 power chests (1×1 stage drops none)', () => {
    const w = world27()
    expect(w.ticks.ringStages.filter((s) => s.chest)).toHaveLength(6)
    expect(w.ticks.ringStages.map((s) => s.size)).toEqual([19, 13, 9, 7, 5, 3, 1])
    expect(w.ticks.ringStages.map((s) => s.at)).toEqual([200, 600, 900, 1200, 1500, 1900, 2200])
  })
})
