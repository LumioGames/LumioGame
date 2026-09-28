import { BackSide, BufferGeometry, Color, Mesh, MeshBasicMaterial, MeshToonMaterial, Vector3, type Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type AnimalId } from '../../contract'
import { ANIMAL_COLOR } from '../../hud/icons'
import { DOLL, dollGeometries, headRadii } from '../geo/doll'
import { hatGeometry } from '../geo/hat'
import { hatLevelScale } from '../logic/hat-layout'
import { dollLayout } from '../logic/doll-fit'
import { DOLL_PROPORTIONS, FACE, headShare, OUTLINE_T, outlinePx, TOON_RAMP_STEPS } from '../logic/doll-look'
import { createSharedMaterials, DOLL_RIM_UNIFORMS } from '../materials'
import { ANIMAL_COLORS, chromaOf, deltaE76, EYE_INK, hexCss, labOf, TERRAIN_REFERENCE_COLORS } from '../palette'
import { toonRampTexture } from '../textures'
import { DollFactory, TAG_LIFT, type Doll } from '../world/dolls'

/**
 * 玩偶「长相」（程序化精修）：大头比例、大眼 + 高光、描边外壳、卡通光照、色板纪律、剪影区分度——
 * 全部用真几何 / 真材质实测，不做解析估算。占地预算的逐帧走路采样见 doll-fit.test。
 */

const ANIMALS: readonly AnimalId[] = ['duck', 'rabbit', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog', 'kangaroo']
const layout = dollLayout(DEFAULT_RULES)
const mats = createSharedMaterials()
const factory = new DollFactory(mats, layout.scale)

function shownInWorld(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/** 静止站姿（呼吸相位取 0、眨眼之前）：玩偶放在原点、朝 +z。 */
function restDoll(animal: AnimalId): Doll {
  const d = factory.create(1, animal, 0)
  // breathe = 1 + 0.02·sin(2π·1.2·t + id)：取 sin = 0 的时刻，模型尺寸不被呼吸放大。
  const now = (1000 * (Math.PI - d.id)) / (2 * Math.PI * 1.2)
  d.update(0, 0, now, 1 / 60, 3, false)
  d.root.updateMatrixWorld(true)
  return d
}

const _v = new Vector3()

const _c = new Color()
/** 顶点色（GeoBuilder 经 Color.setHex 写入，已是工作色彩空间）是否就是这个 hex。 */
function isHex(r: number, g: number, b: number, hex: number): boolean {
  _c.setHex(hex)
  return Math.abs(r - _c.r) < 1e-4 && Math.abs(g - _c.g) < 1e-4 && Math.abs(b - _c.b) < 1e-4
}

/** 头几何正视投影的占用（24×24 网格）：顶点所在格 + 三角形覆盖的格心。 */
const GRID = 24
const BOUNDS = { x0: -0.36, x1: 0.36, y0: -0.34, y1: 0.7 }
function silhouette(g: BufferGeometry): Uint8Array {
  const occ = new Uint8Array(GRID * GRID)
  const pos = g.getAttribute('position')
  const cw = (BOUNDS.x1 - BOUNDS.x0) / GRID
  const ch = (BOUNDS.y1 - BOUNDS.y0) / GRID
  const cell = (x: number, y: number) => {
    const i = Math.floor((x - BOUNDS.x0) / cw)
    const j = Math.floor((y - BOUNDS.y0) / ch)
    if (i >= 0 && i < GRID && j >= 0 && j < GRID) occ[j * GRID + i] = 1
  }
  for (let i = 0; i < pos.count; i++) cell(pos.getX(i), pos.getY(i))
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const ax = pos.getX(t)
    const ay = pos.getY(t)
    const bx = pos.getX(t + 1)
    const by = pos.getY(t + 1)
    const cx = pos.getX(t + 2)
    const cy = pos.getY(t + 2)
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if (Math.abs(d) < 1e-12) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - BOUNDS.x0) / cw))
    const i1 = Math.min(GRID - 1, Math.floor((Math.max(ax, bx, cx) - BOUNDS.x0) / cw))
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - BOUNDS.y0) / ch))
    const j1 = Math.min(GRID - 1, Math.floor((Math.max(ay, by, cy) - BOUNDS.y0) / ch))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = BOUNDS.x0 + (i + 0.5) * cw
        const py = BOUNDS.y0 + (j + 0.5) * ch
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) occ[j * GRID + i] = 1
      }
    }
  }
  return occ
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++
    if (a[i] || b[i]) union++
  }
  return inter / union
}

describe('doll proportions (chibi: big head)', () => {
  it('the base proportions put ≈ 58% of the height in the head', () => {
    expect(DOLL.height).toBeCloseTo(DOLL.headY + DOLL.headR[1], 9)
    expect(headShare(DOLL.headR[1])).toBeCloseTo(0.54 / 0.93, 6)
  })
  for (const animal of ANIMALS) {
    it(`${animal}: measured head share ≥ ${DOLL_PROPORTIONS.minHeadShare}`, () => {
      const g = dollGeometries(animal).head
      g.computeBoundingBox()
      // 头椭球是头几何里最低的部分（垂耳 / 鸭嘴 / 嘴都在它上面）：头底 = −ry。
      const ry = -g.boundingBox!.min.y
      expect(ry).toBeCloseTo(headRadii(animal)[1], 3)
      expect(headShare(ry, DOLL.headY)).toBeGreaterThanOrEqual(DOLL_PROPORTIONS.minHeadShare)
    })
  }
})

describe('doll faces (big eyes with a white glint, readable at game distance)', () => {
  for (const animal of ANIMALS) {
    it(`${animal}: each eye is ≥ 22% of the head width, has white glint vertices, blinks about its own centre`, () => {
      const g = dollGeometries(animal)
      const pos = g.eyes.getAttribute('position')
      const col = g.eyes.getAttribute('color')
      const headW = 2 * headRadii(animal)[0]
      for (const side of [-1, 1]) {
        let x0 = Infinity
        let x1 = -Infinity
        let glints = 0
        let y0 = Infinity
        let y1 = -Infinity
        for (let i = 0; i < pos.count; i++) {
          if (Math.sign(pos.getX(i)) !== side) continue
          if (isHex(col.getX(i), col.getY(i), col.getZ(i), EYE_INK)) {
            x0 = Math.min(x0, pos.getX(i))
            x1 = Math.max(x1, pos.getX(i))
            y0 = Math.min(y0, pos.getY(i))
            y1 = Math.max(y1, pos.getY(i))
          } else if (isHex(col.getX(i), col.getY(i), col.getZ(i), 0xffffff)) glints++
        }
        expect((x1 - x0) / headW, `${animal} eye ${side}`).toBeGreaterThanOrEqual(0.22)
        expect(glints, `${animal} eye ${side} glint`).toBeGreaterThan(0)
        // 竖椭圆（46° 俯看纵向压成 0.69 倍，屏幕上显得圆）
        expect(y1 - y0).toBeGreaterThan(x1 - x0)
        // eyes 几何以眼线为原点：眨眼（scale.y）绕眼睛中心，不往头心塌
        expect(Math.abs((y0 + y1) / 2)).toBeLessThan(0.01)
      }
      const d = restDoll(animal)
      let eyes: Mesh | undefined
      d.root.traverse((o) => {
        if (o instanceof Mesh && o.geometry === g.eyes) eyes = o
      })
      expect(eyes?.position.y).toBeCloseTo(g.eyeY, 9)
      expect(eyes?.material).toBe(mats.eyes)
      d.dispose()
    })
  }
  it('eyes are unlit (flash / frozen tint never reach them) and wide enough by spec', () => {
    expect(mats.eyes).toBeInstanceOf(MeshBasicMaterial)
    expect(mats.eyes.vertexColors).toBe(true)
    expect((2 * FACE.eyeR[0]) / (2 * DOLL.headR[0])).toBeGreaterThanOrEqual(0.22)
  })
})

describe('doll rest-pose budget (all visible vertices incl. outline shells)', () => {
  for (const animal of ANIMALS) {
    it(`${animal}: |z| ≤ ${DOLL_PROPORTIONS.restReachZ}, |x| ≤ ${DOLL_PROPORTIONS.restReachX} (model units)`, () => {
      const d = restDoll(animal)
      let zMax = 0
      let xMax = 0
      let shellVerts = 0
      d.root.traverse((o) => {
        if (!(o instanceof Mesh) || !shownInWorld(o)) return
        const pos = o.geometry.getAttribute('position')
        if (o.material === mats.dollOutline) shellVerts += pos.count
        for (let i = 0; i < pos.count; i++) {
          _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).divideScalar(d.scale)
          zMax = Math.max(zMax, Math.abs(_v.z))
          xMax = Math.max(xMax, Math.abs(_v.x))
        }
      })
      expect(shellVerts).toBeGreaterThan(0)
      expect(zMax, `${animal} z`).toBeLessThanOrEqual(DOLL_PROPORTIONS.restReachZ + 1e-6)
      expect(xMax, `${animal} x`).toBeLessThanOrEqual(DOLL_PROPORTIONS.restReachX + 1e-6)
      d.dispose()
    })
  }
})

describe('doll outline shells (inverted hull) and toon material', () => {
  for (const animal of ANIMALS) {
    it(`${animal}: body / head / both arms / both feet each carry one back-face shell child that casts no shadow`, () => {
      const d = restDoll(animal)
      const g = dollGeometries(animal)
      const shells: Mesh[] = []
      d.root.traverse((o) => {
        if (o instanceof Mesh && o.material instanceof MeshBasicMaterial && o.material.side === BackSide) shells.push(o)
      })
      expect(shells).toHaveLength(6)
      const owners = shells.map((s) => (s.parent as Mesh).geometry)
      expect(owners.filter((x) => x === g.body)).toHaveLength(1)
      expect(owners.filter((x) => x === g.head)).toHaveLength(1)
      expect(owners.filter((x) => x === g.arm)).toHaveLength(2)
      expect(owners.filter((x) => x === g.foot)).toHaveLength(2)
      for (const s of shells) {
        expect(s.material).toBe(mats.dollOutline)
        expect(s.castShadow).toBe(false)
        expect(s.receiveShadow).toBe(false)
        expect(s.parent).toBeInstanceOf(Mesh)
      }
      // 外壳真的比部件大一圈（厚度由外推量决定，测试实测而不是信常量）。
      const box = (geo: BufferGeometry) => {
        geo.computeBoundingBox()
        return geo.boundingBox!
      }
      // 身体椭球半径 rx 之外正好外推一层 OUTLINE_T.body（腰缝会凸出一点，所以不和 body 几何的包围盒比）。
      const grow = box(g.bodyShell).max.x - DOLL.bodyR[0]
      expect(grow).toBeGreaterThan(OUTLINE_T.body * 0.8)
      expect(grow).toBeLessThan(OUTLINE_T.body * 1.2)
      d.dispose()
    })
  }
  it('dolls use a toon material with the shared 3-step ramp and one shared rim program', () => {
    const a = restDoll('cat')
    const b = restDoll('bear')
    expect(a.mat).toBeInstanceOf(MeshToonMaterial)
    expect(a.mat.gradientMap).toBe(toonRampTexture())
    expect(b.mat.gradientMap).toBe(a.mat.gradientMap)
    const ramp = toonRampTexture().image.data as Uint8Array
    expect([ramp[0], ramp[4], ramp[8]]).toEqual([...TOON_RAMP_STEPS])
    expect(a.mat.customProgramCacheKey()).toBe('doll-toon-rim')
    expect(b.mat.customProgramCacheKey()).toBe(a.mat.customProgramCacheKey())
    // 边缘补光注入在 emissivemap 之后，uniform 是模块级共享的同一份。
    const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: 'void main(){\n#include <emissivemap_fragment>\n}', vertexShader: '' }
    a.mat.onBeforeCompile(shader as never, undefined as never)
    expect(shader.fragmentShader).toContain('uniform vec3 uRimColor;')
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += uRimColor * uRimK')
    expect(shader.fragmentShader.indexOf('#include <emissivemap_fragment>')).toBeLessThan(shader.fragmentShader.indexOf('rimF'))
    expect(shader.uniforms.uRimColor).toBe(DOLL_RIM_UNIFORMS.uRimColor)
    expect(shader.uniforms.uRimK).toBe(DOLL_RIM_UNIFORMS.uRimK)
    a.dispose()
    b.dispose()
  })
  it('the outline reads ≈ 2.4 px at 1080p on the play scale', () => {
    expect(outlinePx(OUTLINE_T.head, 1.2, 113)).toBeCloseTo(2.44, 2)
    expect(outlinePx(OUTLINE_T.head, layout.scale, 113)).toBeGreaterThan(2)
  })
  it('name tags hug the tower top', () => {
    expect(TAG_LIFT).toBeCloseTo(0.1, 9)
    const d = restDoll('duck')
    const p = d.labelAnchor(new Vector3(), 0.5)
    expect(p.y).toBeCloseTo(d.headTop.y + 0.5 + TAG_LIFT, 9)
    expect(d.labelAnchor(new Vector3(), 0.5, 0.3).y).toBeCloseTo(d.headTop.y + 0.8, 9)
    d.dispose()
  })
})

describe('doll palette discipline (CIELAB ΔE76 against the terrain)', () => {
  const terrain = Object.values(TERRAIN_REFERENCE_COLORS)
  const terrainChroma = Math.max(...terrain.map(chromaOf))
  it('Lab conversion sanity', () => {
    expect(labOf(0xffffff)[0]).toBeCloseTo(100, 1)
    expect(labOf(0x000000)[0]).toBeCloseTo(0, 6)
    expect(deltaE76(0x123456, 0x123456)).toBe(0)
    expect(terrainChroma).toBeCloseTo(42.9, 1)
  })
  for (const animal of ANIMALS) {
    it(`${animal}: body ΔE ≥ 20 from every terrain colour; saturated (or a lightness doll)`, () => {
      const body = ANIMAL_COLORS[animal].body
      for (const [name, t] of Object.entries(TERRAIN_REFERENCE_COLORS)) {
        expect(deltaE76(body, t), `${animal} vs ${name}`).toBeGreaterThanOrEqual(20)
      }
      const [L] = labOf(body)
      if (animal === 'rabbit' || animal === 'penguin') {
        // 明度型：靠明度跳出来，豁免彩度
        expect(L >= 88 || L <= 30, `${animal} L ${L}`).toBe(true)
      } else {
        expect(chromaOf(body)).toBeGreaterThanOrEqual(45)
        expect(chromaOf(body)).toBeGreaterThan(terrainChroma)
      }
    })
  }
  it('dolls stay ΔE ≥ 30 apart from each other', () => {
    for (let i = 0; i < ANIMALS.length; i++) {
      for (let j = i + 1; j < ANIMALS.length; j++) {
        const d = deltaE76(ANIMAL_COLORS[ANIMALS[i]].body, ANIMAL_COLORS[ANIMALS[j]].body)
        expect(d, `${ANIMALS[i]} vs ${ANIMALS[j]}`).toBeGreaterThanOrEqual(30)
      }
    }
  })
  it('HUD animal colours match the doll bodies', () => {
    for (const animal of ANIMALS) expect(ANIMAL_COLOR[animal]).toBe(hexCss(ANIMAL_COLORS[animal].body).toUpperCase())
  })
})

describe('the first hat sits on the head without cutting through the face', () => {
  // 第 0 层帽子（世界单位 1.1）换算到玩偶模型单位：÷ 场内缩放。帽檐 / 帽身半径与帽顶高都从真帽子几何实测。
  const k = hatLevelScale(0) / layout.scale
  const hp = hatGeometry().getAttribute('position')
  let brimR = 0
  let bodyR = 0
  let hatTop = 0
  for (let i = 0; i < hp.count; i++) {
    const r = Math.hypot(hp.getX(i), hp.getZ(i))
    const y = hp.getY(i)
    if (y < 0.05) brimR = Math.max(brimR, r)
    else bodyR = Math.max(bodyR, r)
    hatTop = Math.max(hatTop, y)
  }
  for (const animal of ANIMALS) {
    const g = dollGeometries(animal)
    it(`${animal}: no eye vertex is above the brim plane inside the brim (the brim never slices the eyes or their glints)`, () => {
      const p = g.eyes.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const r = Math.hypot(p.getX(i), p.getZ(i))
        if (r < brimR * k) expect(p.getY(i) + g.eyeY, `eye vertex ${i}`).toBeLessThan(g.headTop)
      }
    })
    // 兔耳从帽檐 / 帽身穿出来是有意的（兔子戴帽露耳，规格 §3），不在此列。
    if (animal === 'rabbit') continue
    it(`${animal}: nothing on the head (incl. outline shell) pokes out of the top of the first hat`, () => {
      for (const geo of [g.head, g.headShell]) {
        const p = geo.getAttribute('position')
        for (let i = 0; i < p.count; i++) {
          const r = Math.hypot(p.getX(i), p.getZ(i))
          if (r < bodyR * k) expect(p.getY(i), `vertex ${i}`).toBeLessThan(g.headTop + hatTop * k)
        }
      }
    })
  }
})

describe('species silhouettes (front projection of the head)', () => {
  const sil = new Map(ANIMALS.map((a) => [a, silhouette(dollGeometries(a).head)]))
  const pairs: { a: AnimalId; b: AnimalId; v: number }[] = []
  for (let i = 0; i < ANIMALS.length; i++) {
    for (let j = i + 1; j < ANIMALS.length; j++) pairs.push({ a: ANIMALS[i], b: ANIMALS[j], v: iou(sil.get(ANIMALS[i])!, sil.get(ANIMALS[j])!) })
  }
  /**
   * 阈值 = builder 实测的最大 IoU + 0.02（2026-09-27 实测：最大一对 penguin–dog 0.929，cat–pig 0.924，cat–bear 0.903）。
   * 这条测试的作用是「剪影不许再趋同」：以后改头部零件让任何两只更像，会在这里报出来。
   */
  const IOU_MAX = 0.95
  it(`every pair of species differs in head silhouette (IoU ≤ ${IOU_MAX})`, () => {
    for (const p of pairs) expect(p.v, `${p.a} vs ${p.b}`).toBeLessThanOrEqual(IOU_MAX)
  })
  it('cat and bear are told apart: pointed ears above the head vs round ears on its shoulders', () => {
    const c = sil.get('cat')!
    const b = sil.get('bear')!
    let diff = 0
    for (let i = 0; i < c.length; i++) if (c[i] !== b[i]) diff++
    // 实测 24 格不同（猫耳尖高出头顶两格、熊耳在头的斜上方外侧）。
    expect(diff).toBeGreaterThanOrEqual(20)
    expect(pairs.find((p) => p.a === 'bear' && p.b === 'cat')!.v).toBeLessThan(IOU_MAX)
  })
  it('the kangaroo (用户 2026-09-28) reads apart from the other four characters: V-splayed long ears vs rabbit / cat / bear / duck', () => {
    const k = sil.get('kangaroo')!
    // 2026-09-28 实测：与猫差 46 格（IoU 0.83）、兔 84、熊 62、鸭 68——都远低于 IOU_MAX；这里留余量钉住「一眼可分」。
    for (const other of ['rabbit', 'duck', 'cat', 'bear'] as const) {
      const o = sil.get(other)!
      let diff = 0
      for (let i = 0; i < k.length; i++) if (k[i] !== o[i]) diff++
      expect(diff, `kangaroo vs ${other}`).toBeGreaterThanOrEqual(40)
      expect(iou(k, o), `kangaroo vs ${other}`).toBeLessThanOrEqual(0.85)
    }
  })
})

describe('kangaroo body cues (用户 2026-09-28): thick tail behind, long feet, pouch — all inside the ADR 0032 budget', () => {
  const size = (g: BufferGeometry) => {
    g.computeBoundingBox()
    return g.boundingBox!
  }
  it('only the kangaroo has a tail that drags on the ground behind it (tripod stance), and it sticks out at least as far as any tail', () => {
    // 身体几何以身体中心为原点：地面在 y = −bodyY。「身后贴地」= 身体背面之后（z < −rz）还有离地 < 0.03 的顶点。
    const dragging = (a: AnimalId) => {
      const p = dollGeometries(a).body.getAttribute('position')
      for (let i = 0; i < p.count; i++) if (p.getZ(i) < -DOLL.bodyR[2] && p.getY(i) < -DOLL.bodyY + 0.03) return true
      return false
    }
    for (const a of ANIMALS) expect(dragging(a), a).toBe(a === 'kangaroo')
    const back = (a: AnimalId) => -size(dollGeometries(a).body).min.z
    for (const a of ANIMALS) expect(back('kangaroo'), a).toBeGreaterThanOrEqual(back(a) - 0.015)
  })
  it('the feet are ≥ 20% longer than the other animals’ (the foot that does the fly kick)', () => {
    const len = (a: AnimalId) => {
      const b = size(dollGeometries(a).foot)
      return b.max.z - b.min.z
    }
    for (const a of ANIMALS) if (a !== 'kangaroo') expect(len('kangaroo'), a).toBeGreaterThan(len(a) * 1.2)
  })
  it('the pouch rim and the foot tips carry the mint mark colour', () => {
    const g = dollGeometries('kangaroo')
    const has = (geo: BufferGeometry, hex: number) => {
      const col = geo.getAttribute('color')
      for (let i = 0; i < col.count; i++) if (isHex(col.getX(i), col.getY(i), col.getZ(i), hex)) return true
      return false
    }
    expect(has(g.body, ANIMAL_COLORS.kangaroo.mark)).toBe(true)
    expect(has(g.foot, ANIMAL_COLORS.kangaroo.mark)).toBe(true)
  })
})
