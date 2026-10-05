import { Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  createHatStackLayout,
  dropLanding,
  HAT,
  HAT_STACK,
  hatLevelOffset,
  hatLevelScale,
  hatStackLayout,
  hatSwayLag,
  hatTilt,
  lossLaunch,
  lossScale,
  stackBadge,
  topHatOffset,
} from '../logic/hat-layout'
import type { SharedMaterials } from '../materials'
import { HatRenderer } from '../world/hat-stack'

/**
 * 帽塔封顶 4 顶 + ×N 数字牌（原型表现规格变更，取代 design §9.2 原「12 顶逐顶叠 / 压缩塔段」，
 * 旧的「压缩 37 顶 / 12 顶逐顶叠」断言由这里的新断言取代）。
 */
describe('hat stack layout (cap 4, shrinking levels)', () => {
  it('level scales and offsets follow 1.1·0.85^i and Σ 0.1248·s_k (spec table)', () => {
    const expected = [
      [1.1, 0, 0.176],
      [0.935, 0.1373, 0.2869],
      [0.7948, 0.254, 0.3811],
      [0.6755, 0.3532, 0.4612],
    ]
    for (let i = 0; i < 4; i++) {
      expect(hatLevelScale(i)).toBeCloseTo(expected[i][0], 3)
      expect(hatLevelOffset(i)).toBeCloseTo(expected[i][1], 3)
      expect(hatLevelOffset(i) + HAT.height * hatLevelScale(i)).toBeCloseTo(expected[i][2], 3)
    }
    // 虚拟第 4 层（落帽目标 / 飞帽之上）
    expect(hatLevelScale(4)).toBeCloseTo(0.5742, 3)
    expect(hatLevelOffset(4)).toBeCloseTo(0.4375, 3)
    // 闭式 = 逐层累加
    let acc = 0
    for (let i = 0; i < 8; i++) {
      expect(hatLevelOffset(i)).toBeCloseTo(acc, 9)
      acc += HAT.height * HAT_STACK.stepFrac * hatLevelScale(i)
    }
  })

  it('draws min(n, 4) hats; scales strictly decrease, offsets strictly increase', () => {
    const l = createHatStackLayout()
    for (let n = 0; n <= 60; n++) {
      for (const crowned of [false, true]) {
        hatStackLayout(n, crowned, l)
        expect(l.drawn).toBe(Math.min(n, 4))
        expect(l.overflow).toBe(Math.max(0, n - 4))
        expect(l.offsets[0] ?? 0).toBe(0)
        for (let i = 1; i < l.drawn; i++) {
          expect(l.scales[i]).toBeLessThan(l.scales[i - 1])
          expect(l.offsets[i]).toBeGreaterThan(l.offsets[i - 1])
        }
      }
    }
    expect(hatStackLayout(37).drawn).toBe(4)
    expect(hatStackLayout(12).drawn).toBe(4)
  })

  it('tower height is monotone non-decreasing, constant from 4 hats on, and ≤ 0.7 including the crown', () => {
    for (const crowned of [false, true]) {
      let last = 0
      const at4 = hatStackLayout(4, crowned).totalHeight
      for (let n = 0; n <= 80; n++) {
        const h = hatStackLayout(n, crowned).totalHeight
        expect(h).toBeGreaterThanOrEqual(last - 1e-9)
        expect(h).toBeLessThanOrEqual(0.7)
        if (n >= 4) expect(h).toBeCloseTo(at4, 9)
        last = h
      }
    }
    expect(hatStackLayout(0).totalHeight).toBe(0)
    expect(hatStackLayout(4).totalHeight).toBeCloseTo(0.4612, 3)
    // 12 顶帽王：只有 4 顶高 + 皇冠
    const king = hatStackLayout(12, true)
    expect(king.drawn).toBe(4)
    expect(king.overflow).toBe(8)
    expect(king.totalHeight).toBeGreaterThan(0.6)
    expect(king.totalHeight).toBeLessThan(0.7)
  })

  it('crown sits on the capped top (sunk ≤ 0.09·h·s_top), scaled within [0.8, 1]; on the head at 0.9 with no hats', () => {
    for (let n = 1; n <= 30; n++) {
      const l = hatStackLayout(n, true)
      const sTop = l.scales[l.drawn - 1]
      expect(l.crownY).toBeGreaterThanOrEqual(l.hatsTop - HAT_STACK.crownSinkFrac * HAT.height * sTop - 1e-9)
      expect(l.crownY).toBeLessThan(l.hatsTop)
      expect(l.crownScale).toBeGreaterThanOrEqual(HAT_STACK.crownScaleMin)
      expect(l.crownScale).toBeLessThanOrEqual(HAT_STACK.crownScaleMax)
      expect(l.totalHeight).toBeCloseTo(l.crownY + HAT_STACK.crownHeight * l.crownScale, 9)
    }
    expect(hatStackLayout(4, true).crownScale).toBe(0.8)
    expect(hatStackLayout(1, true).crownScale).toBe(1)
    const bare = hatStackLayout(0, true)
    expect(bare.crownY).toBe(0)
    expect(bare.crownScale).toBe(0.9)
    expect(bare.totalHeight).toBeCloseTo(0.2115, 6)
    // 不戴冠：塔高 = 帽顶
    const plain = hatStackLayout(3, false)
    expect(plain.crownScale).toBe(0)
    expect(plain.totalHeight).toBe(plain.hatsTop)
  })

  it('topHatOffset is the bottom of the highest drawn hat', () => {
    expect(topHatOffset(0)).toBe(0)
    for (let n = 1; n <= 12; n++) {
      const l = hatStackLayout(n)
      expect(topHatOffset(n)).toBeCloseTo(l.offsets[l.drawn - 1], 6)
    }
  })

  it('sway lag grows with level; tilt alternates ±4°', () => {
    const l = hatStackLayout(4)
    for (let i = 1; i < 4; i++) expect(hatSwayLag(i, l.offsets[i])).toBeGreaterThan(hatSwayLag(i - 1, l.offsets[i - 1]))
    expect(hatSwayLag(3, l.offsets[3])).toBeCloseTo(0.71, 2)
    expect(hatTilt(0)).toBeCloseTo((4 * Math.PI) / 180)
    expect(hatTilt(1)).toBeCloseTo((-4 * Math.PI) / 180)
  })
})

describe('×N stack badge', () => {
  it('hidden up to 4 hats, then ×N in three tiers', () => {
    for (let n = 0; n <= 4; n++) expect(stackBadge(n)).toEqual({ text: '', tier: 0 })
    expect(stackBadge(5)).toEqual({ text: '×5', tier: 1 })
    expect(stackBadge(9)).toEqual({ text: '×9', tier: 1 })
    expect(stackBadge(10)).toEqual({ text: '×10', tier: 2 })
    expect(stackBadge(19)).toEqual({ text: '×19', tier: 2 })
    expect(stackBadge(20)).toEqual({ text: '×20', tier: 3 })
    expect(stackBadge(99)).toEqual({ text: '×99', tier: 3 })
  })
})

describe('hat flight slots', () => {
  it('dropLanding: level n below the cap, the virtual 4th level from 4 hats on', () => {
    for (let n = 0; n < 4; n++) {
      const d = dropLanding(n)
      expect(d.offset).toBeCloseTo(hatLevelOffset(n), 9)
      expect(d.scale).toBeCloseTo(hatLevelScale(n), 9)
    }
    for (const n of [4, 5, 12, 40]) {
      const d = dropLanding(n)
      expect(d.offset).toBeCloseTo(hatLevelOffset(4), 9)
      expect(d.scale).toBeCloseTo(hatLevelScale(4), 9)
    }
  })

  it('lossLaunch: the overflow flies first from the top level, then level by level down to 0', () => {
    const top = hatLevelOffset(3)
    // 9 顶：前 5 顶从第 3 层，之后 3 → 2 → 1 → 0
    const levels = [3, 3, 3, 3, 3, 3, 2, 1, 0]
    for (let k = 0; k < 9; k++) {
      const s = lossLaunch(k, 9)
      expect(s.offset).toBeCloseTo(hatLevelOffset(levels[k]), 9)
      expect(s.scale).toBeCloseTo(hatLevelScale(levels[k]), 9)
    }
    for (let k = 0; k < 5; k++) expect(lossLaunch(k, 9).offset).toBeCloseTo(top, 9)
    // 3 顶：没有 overflow，从第 2 层往下
    expect([0, 1, 2].map((k) => lossLaunch(k, 3).offset)).toEqual([2, 1, 0].map((i) => hatLevelOffset(i)))
    // 越界的 k 停在第 0 层
    expect(lossLaunch(10, 3).offset).toBe(0)
    // 起飞层单调不升
    let last = Infinity
    for (let k = 0; k < 20; k++) {
      const o = lossLaunch(k, 20).offset
      expect(o).toBeLessThanOrEqual(last)
      last = o
    }
  })

  it('lossScale runs linearly from the launch scale to 0.75', () => {
    expect(lossScale(0, 1.1)).toBeCloseTo(1.1)
    expect(lossScale(0.5, 1.1)).toBeCloseTo(0.925)
    expect(lossScale(1, 0.6755)).toBeCloseTo(0.75)
    expect(lossScale(2, 1)).toBeCloseTo(0.75)
  })
})

describe('HatRenderer.tower', () => {
  const mats = { plastic: new MeshStandardMaterial(), gold: new MeshStandardMaterial() } as unknown as SharedMaterials
  const base = new Vector3(2, 1.1, 3)
  const q = new Quaternion()
  const crowns = (scene: Group) => scene.children.filter((c): c is Mesh => c instanceof Mesh && c.visible && !(c as { isInstancedMesh?: boolean }).isInstancedMesh)

  it('draws at most 4 hats, returns the layout height (crown included), scaled by unit', () => {
    const scene = new Group()
    const r = new HatRenderer(scene, mats)
    r.begin()
    const h = r.tower(12, base, q, 0, 0, true)
    r.end()
    expect(r.hats.count).toBe(4)
    expect(h).toBeCloseTo(hatStackLayout(12, true).totalHeight, 6)
    const c = crowns(scene)
    expect(c).toHaveLength(1)
    expect(c[0].scale.x).toBeCloseTo(0.8)
    expect(c[0].position.y).toBeCloseTo(base.y + hatStackLayout(12, true).crownY, 6)

    r.begin()
    const unit = 1.3 / 1.2
    const hp = r.tower(12, base, q, 0, 0, true, unit)
    r.end()
    expect(hp).toBeCloseTo(hatStackLayout(12, true).totalHeight * unit, 6)
    expect(crowns(scene)[0].scale.x).toBeCloseTo(0.8 * unit)

    // 顶层帽子的实例矩阵：位置 = 头顶 + 第 3 层 × unit，缩放 = s_3 × unit
    const m = new Matrix4()
    r.hats.mesh.getMatrixAt(3, m)
    const p = new Vector3()
    const s = new Vector3()
    m.decompose(p, new Quaternion(), s)
    expect(p.y).toBeCloseTo(base.y + hatLevelOffset(3) * unit, 5)
    expect(s.x).toBeCloseTo(hatLevelScale(3) * unit, 5)

    r.begin()
    expect(r.tower(0, base, q, 0, 0, false)).toBe(0)
    r.end()
    expect(r.hats.count).toBe(0)
    expect(crowns(scene)).toHaveLength(0)
  })
})
