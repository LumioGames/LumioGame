import { Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Texture, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BombKind, SKILL_IDS, type BombView } from '../../contract'
import { ExplosionFx } from '../fx/explosion'
import { skillCandyGeometry } from '../geo/skill'
import { BOMB_TONE, type BombTone } from '../logic/bomb-look'
import { createSharedMaterials } from '../materials'
import { BombLayer } from '../world/bombs'
import type { GroundMarks } from '../world/ground-marks'

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：炸弹 / 爆炸实例批按色调出图——
 * 真建 three 实例批（node 下不渲染），数每个批次的实例与实例色。
 */

const mats = createSharedMaterials()
const _m = new Matrix4()
const FUSE = 60
const DANGER = 8

interface MarkLog {
  rings: number[]
  glows: [number, number, number][]
}

function marksLog(): { marks: GroundMarks; log: MarkLog } {
  const log: MarkLog = { rings: [], glows: [] }
  const marks = {
    ring: (_x: number, _z: number, _d: number, hex: number) => log.rings.push(hex),
    glowAt: (_x: number, _z: number, _s: number, r: number, g: number, b: number) => log.glows.push([r, g, b]),
    dashedRing() {},
    shadow() {},
  } as unknown as GroundMarks
  return { marks, log }
}

/** 场景里可见（有实例）的实例批。 */
function meshes(root: Group): InstancedMesh[] {
  const out: InstancedMesh[] = []
  root.traverse((o) => {
    if (o instanceof InstancedMesh && o.visible && o.count > 0) out.push(o)
  })
  return out
}

function bomb(kind: number, pierce = 0): BombView {
  return {
    NetEntityIdRaw: 50,
    LogicTransform: { WorldPosition: { x: 3.5, y: 1, z: 4.5 } },
    BomberBombState: {
      OwnerNetEntityIdRaw: 1,
      Power: 2,
      FuseEndTick: 100,
      ExplodedAtTick: 0,
      DangerUntilTick: 0,
      ChainId: 0,
      BombKind: kind,
      PierceLayers: pierce,
      ReachUp: 0,
      ReachDown: 0,
      ReachLeft: 0,
      ReachRight: 0,
    },
  } as unknown as BombView
}

/** 画一颗炸弹（危险窗内），返回：可见批次数、各批次实例色、地面危险圈颜色。 */
function drawBomb(kind: number, pierce = 0): { root: Group; log: MarkLog; batches: InstancedMesh[] } {
  const root = new Group()
  const layer = new BombLayer(root, mats, new Texture(), FUSE, DANGER)
  layer.sync([bomb(kind, pierce)], () => 0, 0)
  const { marks, log } = marksLog()
  layer.update(97, 500, 1 / 60, new Quaternion(), marks)
  return { root, log, batches: meshes(root) }
}

describe('bomb layer draws each kind in its own tone (ADR 0033)', () => {
  it('standard: no shell, fire-red danger ring', () => {
    const std = drawBomb(BombKind.Standard)
    expect(std.log.rings).toEqual([BOMB_TONE.fire.ring])
  })

  for (const [kind, tone] of [
    [BombKind.Freeze, 'frost'],
    [BombKind.Toxin, 'toxin'],
    [BombKind.Shock, 'shock'],
  ] as [number, BombTone][]) {
    it(`${tone}: shell in the tone colour + tone danger ring; one more batch than standard`, () => {
      const std = drawBomb(BombKind.Standard)
      const r = drawBomb(kind)
      expect(r.log.rings).toEqual([BOMB_TONE[tone].ring])
      expect(r.batches.length).toBeGreaterThan(std.batches.length)
      const want = new Color(BOMB_TONE[tone].shell!)
      const shell = r.batches.find((m) => m.material instanceof MeshStandardMaterial && m.material.transparent && m.material.color.equals(want))
      expect(shell).toBeDefined()
      expect((shell!.material as MeshStandardMaterial).opacity).toBe(BOMB_TONE[tone].shellOpacity)
    })
  }

  it('toxin bombs bubble and shock bombs crackle (extra batches beyond the shell)', () => {
    const frost = drawBomb(BombKind.Freeze).batches.length
    expect(drawBomb(BombKind.Toxin).batches.length).toBe(frost + 1)
    expect(drawBomb(BombKind.Shock).batches.length).toBe(frost + 1)
  })

  it('the danger glow stays centred on the bomb (bubbles / arcs must not clobber the shared matrix)', () => {
    for (const kind of [BombKind.Standard, BombKind.Toxin, BombKind.Shock]) {
      const r = drawBomb(kind)
      // 危险辉光 = 叠加辉光材质里比弹体还高的那个几何（电弧也用叠加辉光，但是扁平的一条）。
      const glow = r.batches.filter((m) => {
        m.geometry.computeBoundingBox()
        const bb = m.geometry.boundingBox!
        return m.material === mats.glowAdd && bb.max.y - bb.min.y > 0.5
      })
      expect(glow, `kind ${kind}`).toHaveLength(1)
      expect(glow[0].count).toBe(1)
      glow[0].getMatrixAt(0, _m)
      const p = new Vector3().setFromMatrixPosition(_m)
      expect([p.x, p.z], `kind ${kind}`).toEqual([3.5, 4.5])
      expect(new Vector3().setFromMatrixScale(_m).x).toBeGreaterThan(0.9)
    }
  })

  it('pierce layers add drill spikes to any tone', () => {
    expect(drawBomb(BombKind.Toxin, 1).batches.length).toBe(drawBomb(BombKind.Toxin, 0).batches.length + 1)
  })
})

function drawBlast(tone: BombTone, at: number): { batches: InstancedMesh[]; log: MarkLog; fx: ExplosionFx } {
  const root = new Group()
  const fx = new ExplosionFx(root, mats)
  fx.start(4, 4, 1, 1, 1, 1, 0, 400, 1.3, tone)
  const { marks, log } = marksLog()
  fx.update(at, marks)
  return { batches: meshes(root), log, fx }
}

describe('explosion palettes (ADR 0033)', () => {
  it('fire uses the flame material; other tones use the neutral tinted batch', () => {
    const fire = drawBlast('fire', 100)
    expect(fire.batches.map((m) => m.material)).toContain(mats.flame)
    for (const t of ['frost', 'toxin', 'shock'] as const) expect(drawBlast(t, 100).batches.map((m) => m.material)).not.toContain(mats.flame)
  })

  it('ground glow follows the tone colour', () => {
    const toxin = drawBlast('toxin', 100).log.glows[0]
    expect(toxin[1]).toBeGreaterThan(Math.max(toxin[0], toxin[2]))
    const frost = drawBlast('frost', 100).log.glows[0]
    expect(frost[2]).toBeGreaterThan(frost[0])
  })

  it('shock adds electric sparks (an extra additive batch)', () => {
    const shock = drawBlast('shock', 100).batches
    expect(shock.length).toBe(drawBlast('frost', 100).batches.length + 1)
    expect(shock.map((m) => m.material)).toContain(mats.glowAdd)
  })

  it('toxin smoke lingers after the danger window; other tones are gone', () => {
    const after = 400 + 100 + BOMB_TONE.toxin.lingerMs / 3
    const toxin = drawBlast('toxin', after)
    expect(toxin.batches.length).toBeGreaterThan(0)
    expect(toxin.fx.active).toBe(1)
    // 余烟不再点地面光（危险窗已结束）。
    expect(toxin.log.glows).toHaveLength(0)
    for (const t of ['fire', 'frost', 'shock'] as const) {
      const r = drawBlast(t, after)
      expect(r.batches).toHaveLength(0)
      expect(r.fx.active).toBe(0)
    }
    expect(drawBlast('toxin', 400 + 100 + BOMB_TONE.toxin.lingerMs + 1).fx.active).toBe(0)
  })
})

describe('skill candy geometry covers every skill', () => {
  it('toxin / shock candies have their own emblem shapes', () => {
    const sizes = new Map(SKILL_IDS.map((id) => [id, skillCandyGeometry(id).getAttribute('position').count]))
    expect(sizes.get('toxinBomb')).not.toBe(sizes.get('shockBomb'))
    // 与冰冻 / 穿透 / 眨眼的糖不是同一个造型（顶点数不同）。
    for (const other of ['freezeBomb', 'pierceBomb', 'blink'] as const) {
      expect(sizes.get('toxinBomb')).not.toBe(sizes.get(other))
      expect(sizes.get('shockBomb')).not.toBe(sizes.get(other))
    }
  })
})
