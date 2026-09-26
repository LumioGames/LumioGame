import { Group, InstancedMesh, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, 方向, type PlayerSkillsView, type SkillSlotView } from '../../contract'
import { dollLayout } from '../logic/doll-fit'
import { SKILL_FX } from '../logic/skill-fx'
import { createSharedMaterials } from '../materials'
import { DollFactory } from '../world/dolls'
import { FireCellLayer } from '../world/fire-cells'
import type { GroundMarks } from '../world/ground-marks'
import { SkillFxLayer } from '../world/skill-fx'

/**
 * 技能表现层（three 实例批）的几何守护：用真实例矩阵 × 真几何顶点采样，而不是解析估算。
 *   - 组合技项圈 / 小球收在 0.7 格脚印里（ADR 0032），泡泡横向停在最近墙面（0.52）之前；
 *   - 火焰光环的火苗随熊平移，不因世界坐标变化而逐帧重掷随机量。
 */

const mats = createSharedMaterials()
const layout = dollLayout(DEFAULT_RULES)
const factory = new DollFactory(mats, layout.scale)
const RATE = 20
/** 0.7 格脚印的半径（格）。 */
const FOOT_HALF = DEFAULT_RULES.dollFootprintMilli / 2000
/** 最近的墙面离格心（铁皮 0.96 宽，geo/blocks.ts）。 */
const NEAREST_WALL_FACE = 0.52
/** 最高的墙顶（铁皮 1.0）：比它高的东西不会与墙相交。 */
const WALL_TOP = 1.0

const noMarks = { ring() {}, glowAt() {}, dashedRing() {} } as unknown as GroundMarks

function slot(skill: SkillSlotView['skill']): SkillSlotView {
  return { skill, level: 1, bound: false }
}

function sk(over: Partial<PlayerSkillsView> = {}): PlayerSkillsView {
  return {
    character: 'duck',
    facing: 方向.右,
    slots: { active: null, passive: null, bomb: null },
    cdFromTick: 0,
    cdUntilTick: 0,
    bubbleUntilTick: 0,
    auraUntilTick: 0,
    frozenUntilTick: 0,
    regenFromTick: 0,
    regenNextTick: 0,
    blinkTick: 0,
    ...over,
  }
}

const _m = new Matrix4()
const _v = new Vector3()

/** 场景里每个可见实例的每个顶点（世界坐标）。 */
function eachInstanceVertex(root: Group, visit: (v: Vector3, mesh: InstancedMesh) => void): void {
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    if (!(o instanceof InstancedMesh) || !o.visible) return
    const pos = o.geometry.getAttribute('position')
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, _m)
      _m.premultiply(o.matrixWorld)
      for (let j = 0; j < pos.count; j++) visit(_v.fromBufferAttribute(pos, j).applyMatrix4(_m), o)
    }
  })
}

describe('combo form and bubble stay clear of the walls (ADR 0032)', () => {
  const X = 4.5
  const Z = 6.5

  /** 一个整圈（小球 0.5 Hz、项圈 0.25 Hz）逐帧采样的最大横向外沿（只看墙顶以下）。 */
  function maxReach(skills: PlayerSkillsView, renderTick: number): { reach: number; drawn: number } {
    const root = new Group()
    const fx = new SkillFxLayer(root, mats, DEFAULT_RULES.skills)
    const doll = factory.create(1, 'penguin', 0)
    let reach = 0
    let drawn = 0
    for (let f = 0; f < 240; f++) {
      const now = 1000 + f * (4000 / 240)
      doll.update(X, Z, now, 1 / 60, 3, false)
      fx.begin()
      fx.player(doll, skills, renderTick, RATE, now)
      fx.end(now, noMarks)
      eachInstanceVertex(root, (v) => {
        drawn++
        if (v.y >= WALL_TOP) return
        reach = Math.max(reach, Math.abs(v.x - X), Math.abs(v.z - Z))
      })
    }
    doll.dispose()
    return { reach, drawn }
  }

  for (const combo of ['fireDash', 'bounceBubble', 'glacierBomb'] as const) {
    it(`${combo}: collar ring and orbs stay within the 0.7 footprint`, () => {
      const slots =
        combo === 'glacierBomb'
          ? { active: null, passive: null, bomb: slot(combo) }
          : { active: slot(combo), passive: null, bomb: null }
      const { reach, drawn } = maxReach(sk({ slots }), 100)
      expect(drawn).toBeGreaterThan(0)
      expect(reach).toBeLessThanOrEqual(FOOT_HALF + 1e-6)
    })
  }

  it('bubble: horizontal edge stops before the nearest wall face', () => {
    // 刚施放：泡泡最大、正在脉动。
    const { reach, drawn } = maxReach(sk({ bubbleUntilTick: 100 + 3 * RATE }), 100)
    expect(drawn).toBeGreaterThan(0)
    expect(reach).toBeLessThan(NEAREST_WALL_FACE)
    expect(reach).toBeGreaterThan(SKILL_FX.bubbleWallClear - 0.05)
  })
})

describe('fire aura flames follow the bear smoothly', () => {
  function flameOffsets(ownerX: number, ownerZ: number, now: number): number[][] {
    const root = new Group()
    const layer = new FireCellLayer(root, mats)
    const cells = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ X: 4 + dx, Y: 6 + dy })
    layer.sync([{ owner: 3, source: 'aura', cells, untilTick: 1000 }])
    layer.update(now, 100, RATE, noMarks, () => ({ x: ownerX, z: ownerZ, cellX: 4, cellY: 6 }))
    const out: number[][] = []
    root.updateMatrixWorld(true)
    root.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _m)
        const p = new Vector3().setFromMatrixPosition(_m)
        const s = new Vector3().setFromMatrixScale(_m)
        out.push([p.x - ownerX, p.y, p.z - ownerZ, s.x, s.y])
      }
    })
    return out
  }

  it('walking within the cell only translates the flames (same jitter, size and phase)', () => {
    const ref = flameOffsets(4.5, 6.5, 5000)
    expect(ref.length).toBe(18)
    // 3.5 格/秒走一帧 ≈ 0.058 格；原实现按世界坐标取种子，每 1/7 格就重掷一次。
    for (const [dx, dz] of [
      [0.058, 0],
      [0.2, 0],
      [0, 0.13],
      [-0.31, 0.27],
    ]) {
      const moved = flameOffsets(4.5 + dx, 6.5 + dz, 5000)
      expect(moved.length).toBe(ref.length)
      for (let i = 0; i < ref.length; i++) for (let k = 0; k < 5; k++) expect(moved[i][k]).toBeCloseTo(ref[i][k], 5)
    }
  })

  it('flames still differ from each other (the key is per cell offset, not constant)', () => {
    const ref = flameOffsets(4.5, 6.5, 5000)
    const jitters = new Set(ref.filter((_, i) => i % 2 === 0).map((r) => (r[0] - Math.round(r[0])).toFixed(4)))
    expect(jitters.size).toBeGreaterThan(4)
  })
})

describe('toxin bubbles and shock arcs stay clear of the walls (ADR 0033)', () => {
  const X = 4.5
  const Z = 6.5

  /** 一整个绿泡周期 / 多个电弧时间桶逐帧采样：墙顶以下的最大横向外沿、实例数。 */
  function sample(skills: PlayerSkillsView): { reach: number; drawn: number; maxY: number } {
    const root = new Group()
    const fx = new SkillFxLayer(root, mats, DEFAULT_RULES.skills)
    const doll = factory.create(2, 'rabbit', 1)
    let reach = 0
    let drawn = 0
    let maxY = 0
    for (let f = 0; f < 180; f++) {
      const now = 2000 + f * 11
      doll.update(X, Z, now, 1 / 60, 3, false)
      fx.begin()
      fx.player(doll, skills, 100, RATE, now)
      fx.end(now, noMarks)
      eachInstanceVertex(root, (v) => {
        drawn++
        maxY = Math.max(maxY, v.y)
        if (v.y >= WALL_TOP) return
        reach = Math.max(reach, Math.abs(v.x - X), Math.abs(v.z - Z))
      })
    }
    doll.dispose()
    return { reach, drawn, maxY }
  }

  it('poisoned: green bubbles are drawn, rise above the head and stay within the 0.7 footprint', () => {
    const r = sample(sk({ toxinUntilTick: 200 }))
    expect(r.drawn).toBeGreaterThan(0)
    expect(r.reach).toBeLessThanOrEqual(FOOT_HALF + 1e-6)
    expect(r.maxY).toBeGreaterThan(WALL_TOP)
  })

  it('shocked: arcs are drawn and stay within the 0.7 footprint', () => {
    const r = sample(sk({ shockUntilTick: 200 }))
    expect(r.drawn).toBeGreaterThan(0)
    expect(r.reach).toBeLessThanOrEqual(FOOT_HALF + 1e-6)
  })

  it('expired or missing status draws nothing', () => {
    expect(sample(sk({ toxinUntilTick: 100, shockUntilTick: 50 })).drawn).toBe(0)
    expect(sample(sk()).drawn).toBe(0)
  })
})
