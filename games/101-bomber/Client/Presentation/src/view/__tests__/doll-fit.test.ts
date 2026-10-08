import { Box3, Mesh, Vector3, type Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type AnimalId } from '../../contract'
import { dollGeometries } from '../geo/doll'
import {
  bossHeightScale,
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
import { DollFactory, KICK_POSE, kickCurve, type Doll } from '../world/dolls'

/**
 * 玩偶占地（ADR 0032，RESOLUTIONS #12）：用真网格的顶点在走路动画中逐帧采样（movement 蓝图的方法），
 * 而不是解析估算——改了 geo/doll.ts 的零件或 dolls.ts 的步幅，这里会直接报出超出多少。
 */

const ANIMALS: readonly AnimalId[] = ['duck', 'rabbit', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog', 'kangaroo']
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

function walk(animal: AnimalId, dir: 1 | -1, heartStage: number, sun: { x: number; y: number; z: number } = SUN_OFFSET, height = 1): WalkStats {
  const doll = factory.create(1, animal, 0)
  doll.setHeight(height)
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

describe('飞踢姿势（飞腿袋鼠，用户 2026-09-28）：蹬腿也守 ADR 0032 的前伸 / 侧向 / 脚圈', () => {
  it('kickCurve goes 0 → 1 → 0', () => {
    expect(kickCurve(0)).toBe(0)
    expect(kickCurve(KICK_POSE.outFrac)).toBeCloseTo(1, 9)
    expect(kickCurve(1)).toBeCloseTo(0, 9)
    expect(kickCurve(-1)).toBe(0)
    for (let u = 0; u < 1; u += 0.05) {
      expect(kickCurve(u)).toBeGreaterThanOrEqual(0)
      expect(kickCurve(u)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    it(`kangaroo kicking toward yaw ${yaw.toFixed(2)}: forward / backward ≤ ${REACH}, side < block face, feet inside the 0.7 ring; turns to the kick`, () => {
      const dirX = Math.sin(yaw)
      const dirZ = Math.cos(yaw)
      let forward = -Infinity
      let backward = -Infinity
      let side = 0
      let lifted = 0
      let sunk = 0
      for (const stage of [3, 1]) {
        for (let k = 0; k <= 20; k++) {
          const d = factory.create(10 + k, 'kangaroo', 0)
          d.update(4.5, 7.5, 16, 1 / FPS, stage, false)
          d.update(4.5, 7.5, 32, 1 / FPS, stage, false)
          d.kickPose(k / 20, yaw)
          expect(d.yaw).toBe(yaw)
          eachVertex(d, false, (v) => {
            const ax = v.x - 4.5
            const az = v.z - 7.5
            const ahead = ax * dirX + az * dirZ
            forward = Math.max(forward, ahead)
            backward = Math.max(backward, -ahead)
            side = Math.max(side, Math.abs(ax * dirZ - az * dirX))
          })
          const foot = dollGeometries('kangaroo').foot
          const box = new Box3()
          d.root.traverse((o) => {
            if (o instanceof Mesh && o.geometry === foot) box.expandByObject(o)
          })
          const size = box.getSize(new Vector3())
          expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(layout.ringOuter)
          lifted = Math.max(lifted, box.getCenter(new Vector3()).y)
          sunk = Math.min(sunk, box.min.y)
          d.dispose()
        }
      }
      expect(forward).toBeLessThanOrEqual(REACH + 1e-3)
      expect(forward / layout.scale).toBeLessThanOrEqual(DOLL_MODEL_REACH)
      expect(backward).toBeLessThanOrEqual(REACH + 1e-3)
      expect(side).toBeLessThan(BLOCK_FACE)
      // 真的踢了：脚心抬离地面一截；脚跟也不比站着时（鞋底描边本就压进地面 ≈ 0.019）更往地里扎。
      expect(lifted).toBeGreaterThan(0.12)
      expect(sunk).toBeGreaterThan(-0.02 - 0.005)
    })
  }

  it('the next plain update clears the kick (feet back on the ground, no leftover tilt)', () => {
    const d = factory.create(40, 'kangaroo', 0)
    d.update(4.5, 7.5, 16, 1 / FPS, 3, false)
    d.kickPose(0.3, 0)
    d.update(4.5, 7.5, 32, 1 / FPS, 3, false)
    const feet: Mesh[] = []
    d.root.traverse((o) => {
      if (o instanceof Mesh && o.geometry === dollGeometries('kangaroo').foot) feet.push(o)
    })
    expect(feet).toHaveLength(2)
    for (const f of feet) {
      expect(f.rotation.x).toBe(0)
      expect(f.position.y).toBeCloseTo(0, 6)
    }
    d.dispose()
  })
})

describe('Boss 加高（ADR 0039 / 0043：只加高身体 / 头 / 帽，XZ 脚圈与前伸不变，守 ADR 0032）', () => {
  const lift = bossHeightScale(8 * 2, 2, DEFAULT_RULES.bossMinHearts)

  function feetBox(doll: Doll, animal: AnimalId): Box3 {
    doll.root.updateMatrixWorld(true)
    const foot = dollGeometries(animal).foot
    const box = new Box3()
    doll.root.traverse((o) => {
      if (o instanceof Mesh && o.geometry === foot) box.expandByObject(o)
    })
    return box
  }

  it('an 8-heart Boss is clearly taller', () => {
    expect(lift).toBeGreaterThan(1.25)
    const a = factory.create(7, 'bear', 0)
    const b = factory.create(8, 'bear', 0)
    b.setHeight(lift)
    for (const d of [a, b]) {
      d.update(4.5, 4.5, 16, 1 / FPS, 3, false)
      d.update(4.5, 4.5, 32, 1 / FPS, 3, false)
    }
    expect(b.headTop.y).toBeGreaterThan(a.headTop.y * 1.2)
    a.dispose()
    b.dispose()
  })

  for (const animal of ANIMALS) {
    it(`${animal} Boss: forward reach ≤ 0.35, feet inside the 0.7 foot ring, same XZ as a normal doll`, () => {
      for (const stage of [3, 1]) {
        for (const dir of [1, -1] as const) {
          const boss = walk(animal, dir, stage, SUN_OFFSET, lift)
          const normal = walk(animal, dir, stage)
          expect(boss.forward, `${animal} stage ${stage} dir ${dir} forward`).toBeLessThanOrEqual(REACH + 1e-3)
          expect(boss.backward).toBeLessThanOrEqual(REACH + 1e-3)
          expect(boss.side).toBeLessThan(BLOCK_FACE)
          expect(boss.forward).toBeCloseTo(normal.forward, 6)
          expect(boss.side).toBeCloseTo(normal.side, 6)
        }
      }
      const d = factory.create(9, animal, 0)
      d.setHeight(lift)
      d.update(4.5, 7.5, 16, 1 / FPS, 3, false)
      d.update(4.5, 7.5, 32, 1 / FPS, 3, false)
      const box = feetBox(d, animal)
      const size = box.getSize(new Vector3())
      // 两脚外沿都在脚圈（外沿直径 = 0.7 格）里；脚圈本身与非 Boss 同一大小。
      expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(layout.ringOuter)
      expect(layout.ringOuter).toBeCloseTo(0.7, 9)
      const mid = box.getCenter(new Vector3())
      expect(Math.abs(mid.x - 4.5)).toBeLessThan(0.01)
      expect(Math.abs(mid.z - 7.5)).toBeLessThan(0.01)
      d.dispose()
    })
  }
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
