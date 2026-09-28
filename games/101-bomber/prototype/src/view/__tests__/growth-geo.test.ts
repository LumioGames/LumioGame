import { Box3, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { PickupKind } from '../../contract'
import { crateGeometry, goldChestGeometry, ironBoxGeometry } from '../geo/blocks'
import { candyGeometry, orbitHeartGeometry } from '../geo/candy'

/**
 * 三种资源箱（ADR 0040，design §5.0）靠形状与材质区分，不只靠颜色：木箱是方正的 0.86 高木条箱；
 * 铁箱更矮、顶面收成斜角；金箱是长方的拱顶宝箱。都不出格（< 1 格；木箱正面小锁已到 0.99），灰度下轮廓也分得开。
 */
function size(g: BufferGeometry): Vector3 {
  g.computeBoundingBox()
  return (g.boundingBox as Box3).getSize(new Vector3())
}

describe('resource box silhouettes', () => {
  const wood = size(crateGeometry())
  const iron = size(ironBoxGeometry())
  const gold = size(goldChestGeometry())

  it('all three stay inside one cell', () => {
    for (const s of [wood, iron, gold]) {
      expect(s.x).toBeLessThan(1)
      expect(s.z).toBeLessThan(1)
    }
  })

  it('iron is lower than wood; gold is a wide, shallow chest (not a cube)', () => {
    expect(iron.y).toBeLessThan(wood.y - 0.03)
    expect(Math.abs(wood.x - wood.z)).toBeLessThan(0.03)
    expect(gold.x - gold.z).toBeGreaterThan(0.12)
    expect(Math.abs(gold.y - wood.y)).toBeGreaterThan(0.02)
  })

  it('iron has a chamfered top: the top face is narrower than the body', () => {
    const g = ironBoxGeometry()
    const pos = g.getAttribute('position')
    let topHalf = 0
    let bodyHalf = 0
    const h = size(g).y
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i))
      if (pos.getY(i) > h - 0.01) topHalf = Math.max(topHalf, x)
      if (pos.getY(i) < h * 0.5) bodyHalf = Math.max(bodyHalf, x)
    }
    expect(topHalf).toBeLessThan(bodyHalf - 0.05)
  })
})

describe('gold heart and frenzy candy', () => {
  it('have their own shapes (not the fallback mini bomb)', () => {
    const bomb = size(candyGeometry(PickupKind.BombPlus))
    const gold = size(candyGeometry(PickupKind.GoldHeart))
    const frenzy = size(candyGeometry(PickupKind.Frenzy))
    expect(gold.equals(bomb)).toBe(false)
    expect(frenzy.equals(bomb)).toBe(false)
    expect(frenzy.equals(gold)).toBe(false)
    for (const s of [gold, frenzy]) expect(Math.max(s.x, s.y, s.z)).toBeLessThan(0.45)
  })

  it('the orbiting heart is a small heart', () => {
    const s = size(orbitHeartGeometry())
    expect(Math.max(s.x, s.y)).toBeLessThan(0.35)
    expect(s.x).toBeGreaterThan(0.2)
  })
})
