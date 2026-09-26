import { Box3, Mesh, Vector3, type Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type AnimalId } from '../../contract'
import { dollGeometries } from '../geo/doll'
import {
  contactShadowSize,
  DOLL_MODEL_REACH,
  DOLL_SCALE_MAX,
  dollLayout,
  footRingQuad,
  localRingPulse,
  PODIUM_DOLL_SCALE,
  RING_OUTER_FRAC,
  shadowDrift,
  SUN_OFFSET,
} from '../logic/doll-fit'
import { createSharedMaterials } from '../materials'
import { DollFactory, type Doll } from '../world/dolls'

/**
 * 玩偶占地（ADR 0032，RESOLUTIONS #12）：用真网格的顶点在走路动画中逐帧采样（movement 蓝图的方法），
 * 而不是解析估算——改了 geo/doll.ts 的零件或 dolls.ts 的步幅，这里会直接报出超出多少。
 */

const ANIMALS: readonly AnimalId[] = ['duck', 'rabbit', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog']
const layout = dollLayout(DEFAULT_RULES)
const REACH = DEFAULT_RULES.dollReachMilli / 1000
/** 积木 / 木箱 / 铁皮的近侧面离格心约 0.44（geo/blocks.ts）。 */
const BLOCK_FACE = 0.44
/** 积木顶 0.8、木箱顶 0.86、铁皮顶 1.0：影子落到这些平面上。 */
const BLOCK_TOPS = [0.8, 0.86, 1.0]
const FPS = 60
const SPEED = 3.5
const FRAMES = 90
const WARM = 20
const Y = 5.5

const factory = new DollFactory(createSharedMaterials(), layout.scale)
const _v = new Vector3()

function shownInWorld(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/** 逐可见网格、逐顶点（世界坐标）回调。onlyCasters：只看投影的网格（身体、头）。 */
function eachVertex(doll: Doll, onlyCasters: boolean, visit: (v: Vector3) => void): void {
  doll.root.updateMatrixWorld(true)
  doll.root.traverse((o) => {
    if (!(o instanceof Mesh) || !shownInWorld(o)) return
    if (onlyCasters && !o.castShadow) return
    const pos = o.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) visit(_v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))
  })
}

interface WalkStats {
  forward: number
  backward: number
  side: number
  /** 影子落在方块顶面上、在身前的最远距离。 */
  shadowAhead: number
}

function walk(animal: AnimalId, dir: 1 | -1, heartStage: number, sun: { x: number; y: number; z: number } = SUN_OFFSET): WalkStats {
  const doll = factory.create(1, animal, 0)
  const s: WalkStats = { forward: -Infinity, backward: -Infinity, side: 0, shadowAhead: -Infinity }
  let x = 9.5
  let now = 0
  for (let f = 0; f < FRAMES; f++) {
    x += (dir * SPEED) / FPS
    now += 1000 / FPS
    doll.update(x, Y, now, 1 / FPS, heartStage, false)
    if (f < WARM || f % 3 !== 0) continue
    const cx = doll.x
    eachVertex(doll, false, (v) => {
      const ahead = (v.x - cx) * dir
      s.forward = Math.max(s.forward, ahead)
      s.backward = Math.max(s.backward, -ahead)
      s.side = Math.max(s.side, Math.abs(v.z - Y))
    })
    eachVertex(doll, true, (v) => {
      for (const top of BLOCK_TOPS) {
        if (v.y <= top) continue
        const d = shadowDrift(v.y - top, sun)
        s.shadowAhead = Math.max(s.shadowAhead, (v.x + d.x - cx) * dir)
      }
    })
  }
  doll.dispose()
  return s
}

describe('doll layout (pure)', () => {
  it('derives a play scale ≈ 1.2 from the rules and keeps the podium at 1.3', () => {
    expect(layout.scale).toBeLessThanOrEqual(DOLL_SCALE_MAX)
    expect(layout.scale).toBeGreaterThan(1.15)
    expect(layout.podiumScale).toBe(PODIUM_DOLL_SCALE)
    expect(PODIUM_DOLL_SCALE).toBe(1.3)
  })
  it('foot ring outer diameter equals the 0.7 footprint; the local pulse only shrinks it', () => {
    expect(footRingQuad(DEFAULT_RULES.dollFootprintMilli) * RING_OUTER_FRAC).toBeCloseTo(0.7, 9)
    expect(layout.ringOuter).toBeCloseTo(0.7, 9)
    expect(layout.ringQuad * RING_OUTER_FRAC).toBeCloseTo(layout.ringOuter, 9)
    for (let t = 0; t < 2000; t += 37) {
      const k = localRingPulse(t)
      expect(k).toBeGreaterThanOrEqual(0.94 - 1e-9)
      expect(k).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
  it('contact shadow scales with the footprint', () => {
    expect(contactShadowSize(700)).toBeCloseTo(0.84, 9)
    expect(layout.shadow).toBeCloseTo(0.84, 9)
  })
  it('the new sun throws shadows slightly +x and mostly away from the camera', () => {
    const d = shadowDrift(1)
    expect(d.x).toBeGreaterThan(0)
    expect(d.x).toBeLessThan(0.25)
    expect(d.z).toBeLessThan(0)
    expect(SUN_OFFSET).toEqual({ x: -3, y: 14, z: 7 })
  })
})

describe('doll footprint (vertex sampling over the walk animation)', () => {
  for (const animal of ANIMALS) {
    it(`${animal}: forward reach ≤ ${REACH}, sideways clears the block faces, feet centred`, () => {
      for (const stage of [3, 1]) {
        for (const dir of [1, -1] as const) {
          const s = walk(animal, dir, stage)
          expect(s.forward, `${animal} stage ${stage} dir ${dir} forward`).toBeLessThanOrEqual(REACH + 1e-3)
          // DOLL_MODEL_REACH（缩放推导用的模型外沿）必须是真的上界。
          expect(s.forward / layout.scale).toBeLessThanOrEqual(DOLL_MODEL_REACH)
          expect(s.backward, `${animal} stage ${stage} dir ${dir} backward`).toBeLessThanOrEqual(REACH + 1e-3)
          expect(s.side, `${animal} stage ${stage} dir ${dir} side`).toBeLessThan(BLOCK_FACE)
        }
      }
      // 站定时两只脚的包围盒中点落在逻辑位置上（接触阴影与脚圈都画在那里）。
      const doll = factory.create(2, animal, 0)
      doll.update(4.5, 7.5, 16, 1 / FPS, 3, false)
      doll.update(4.5, 7.5, 32, 1 / FPS, 3, false)
      doll.root.updateMatrixWorld(true)
      const foot = dollGeometries(animal).foot
      const box = new Box3()
      doll.root.traverse((o) => {
        if (o instanceof Mesh && o.geometry === foot) box.expandByObject(o)
      })
      const mid = box.getCenter(new Vector3())
      expect(Math.abs(mid.x - 4.5)).toBeLessThan(0.01)
      expect(Math.abs(mid.z - 7.5)).toBeLessThan(0.01)
      doll.dispose()
    })
  }

  it('walking ±x, head/body shadows on block tops never land beyond the block face ahead', () => {
    for (const animal of ANIMALS) {
      for (const dir of [1, -1] as const) {
        const s = walk(animal, dir, 3)
        expect(s.shadowAhead, `${animal} dir ${dir}`).toBeLessThan(BLOCK_FACE)
      }
    }
  })

  it('the old sun (−9, 12, +6) fails the same shadow check (the test bites)', () => {
    const old = { x: -9, y: 12, z: 6 }
    const worst = Math.max(...ANIMALS.map((a) => walk(a, 1, 3, old).shadowAhead))
    expect(worst).toBeGreaterThanOrEqual(BLOCK_FACE)
  })
})

describe('doll skill looks (frozen / combo glow / blink pop / podium scale)', () => {
  it('frozen: icy tint, no walk cycle; unfreezing restores the colour', () => {
    const d = factory.create(3, 'cat', 0)
    d.update(4.5, 4.5, 16, 1 / FPS, 3, false)
    d.update(4.6, 4.5, 32, 1 / FPS, 3, false, { frozen: true, glow: 0 })
    expect(d.mat.color.getHex()).toBe(0xcfefff)
    const feet: number[] = []
    d.root.traverse((o) => {
      if (o instanceof Mesh && o.geometry === dollGeometries('cat').foot) feet.push(o.position.z)
    })
    d.update(4.9, 4.5, 48, 1 / FPS, 3, false, { frozen: true, glow: 0 })
    const after: number[] = []
    d.root.traverse((o) => {
      if (o instanceof Mesh && o.geometry === dollGeometries('cat').foot) after.push(o.position.z)
    })
    expect(after).toEqual(feet)
    d.update(4.9, 4.5, 64, 1 / FPS, 3, false)
    expect(d.mat.color.getHex()).toBe(0xffffff)
    d.dispose()
  })
  it('combo glow lights the doll in the combo colour, a hit flash stays white', () => {
    const d = factory.create(4, 'bear', 0)
    d.update(4.5, 4.5, 16, 1 / FPS, 3, false, { frozen: false, glow: 0.14, glowColor: 0xff7a3d })
    expect(d.mat.emissiveIntensity).toBeCloseTo(0.14)
    expect(d.mat.emissive.getHex()).toBe(0xff7a3d)
    d.hit(20)
    d.update(4.5, 4.5, 30, 1 / FPS, 3, false, { frozen: false, glow: 0.14, glowColor: 0xff7a3d })
    expect(d.mat.emissive.getHex()).toBe(0xffffff)
    d.dispose()
  })
  it('blinkIn pops the doll (0.7 → 1.08 → 1) in place instead of dropping from the sky', () => {
    const d = factory.create(5, 'cat', 0)
    d.update(4.5, 4.5, 1000, 1 / FPS, 3, false)
    d.blinkIn(1000)
    d.update(4.5, 4.5, 1001, 1 / FPS, 3, false)
    expect(d.root.scale.y).toBeLessThan(layout.scale * 0.8)
    expect(d.root.position.y).toBeCloseTo(0)
    d.update(4.5, 4.5, 1300, 1 / FPS, 3, false)
    expect(d.root.scale.x).toBeCloseTo(layout.scale, 1)
    d.dispose()
  })
  it('the podium pose keeps the 1.3 scale', () => {
    const d = factory.create(6, 'duck', 0)
    d.pose(0, 1.2, 0, 0, 5000, 'wave', -1e9, 0)
    expect(d.root.scale.x).toBeCloseTo(PODIUM_DOLL_SCALE)
    d.dispose()
  })
})
