import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { BlockType } from '../../contract'
import { packShore, shoreDistance, WATER_COLORS, WATER_FX, waterCornerMask, waterShoreMask, WaterTrail } from '../logic/water'
import { WATER_REFERENCE_COLORS } from '../palette'
import { framePlaneGeometry } from '../world/terrain'

/**
 * 水面（用户 2026-09-28 试玩反馈「地面的水材质太弱了，一坨绿色」「水还是很丑」）：一眼是水——玩具水池的高饱和清亮蓝
 * （不偏绿、不偏青），岸边泡沫、由浅到深且格缝处连续；玩家走进水 / 在水里走有水花与涟漪。
 */

function hsl(hex: number): { h: number; s: number; l: number } {
  const out = { h: 0, s: 0, l: 0 }
  new Color().setHex(hex).getHSL(out)
  return { h: out.h * 360, s: out.s, l: out.l }
}

describe('water colours', () => {
  it('shallow and deep are saturated blues (hue 205°–235°), not green or cyan', () => {
    for (const c of [WATER_COLORS.shallow, WATER_COLORS.deep]) {
      const { h, s } = hsl(c)
      expect(h).toBeGreaterThanOrEqual(205)
      expect(h).toBeLessThanOrEqual(235)
      expect(s).toBeGreaterThanOrEqual(0.6)
    }
  })
  it('deep is darker than shallow; foam is near-white', () => {
    expect(hsl(WATER_COLORS.deep).l).toBeLessThan(hsl(WATER_COLORS.shallow).l - 0.08)
    expect(hsl(WATER_COLORS.foam).l).toBeGreaterThan(0.9)
  })
  it('the doll palette test checks the very colours the shader uses', () => {
    expect(WATER_REFERENCE_COLORS.waterShallow).toBe(WATER_COLORS.shallow)
    expect(WATER_REFERENCE_COLORS.waterDeep).toBe(WATER_COLORS.deep)
  })
  it('is clearly apart from the old cyan water and the frost white of freeze bombs', () => {
    expect(hsl(WATER_COLORS.shallow).h - hsl(0x3db8da).h).toBeGreaterThan(15)
    expect(hsl(WATER_COLORS.shallow).l).toBeLessThan(hsl(0xcfefff).l - 0.2)
  })
})

describe('waterShoreMask', () => {
  const W = BlockType.水
  const G = BlockType.地面
  // 3×3：中心与右边是水。
  const ground = new Uint8Array([G, G, G, G, W, W, G, G, G])
  it('flags each side that borders land (−x, +x, −y, +y); the board edge counts as shore', () => {
    expect(waterShoreMask(ground, 3, 1, 1)).toEqual([1, 0, 1, 1])
    expect(waterShoreMask(ground, 3, 2, 1)).toEqual([0, 1, 1, 1])
  })
})

describe('shore distance (depth + foam) is seamless across water cells', () => {
  // 自测截图里 L 形水池的格缝上有一道亮线：每格只看四边是不是岸，拐角处相邻两格算出的「到岸距离」不一样。
  // 现在 aTint 同时带四边与四个斜角（packShore），shoreDistance 与 shader 同一算法。
  const W = BlockType.水
  const G = BlockType.地面
  // 5×4：一个 L 形 + 一个 2×2 的池子，拐角、内凹角都有。
  const ground = new Uint8Array([
    W, W, W, G, G,
    G, G, W, G, W,
    G, G, W, G, W,
    G, G, G, W, W,
  ])
  const size = 5
  const rows = ground.length / size
  const codeAt = (x: number, y: number) => packShore(waterShoreMask(ground, size, x, y), waterCornerMask(ground, size, x, y))
  it('flags the diagonal neighbours that are land (−x−y, +x−y, −x+y, +x+y)', () => {
    expect(waterCornerMask(ground, size, 2, 0)).toEqual([1, 1, 1, 1])
    expect(waterCornerMask(ground, size, 2, 1)).toEqual([0, 1, 1, 1])
    expect(waterCornerMask(ground, size, 4, 3)).toEqual([1, 1, 1, 1])
    expect(waterCornerMask(ground, size, 4, 2)).toEqual([1, 1, 0, 1])
  })
  it('two water cells sharing an edge agree on the distance all along that edge', () => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < size; x++) {
        if (ground[y * size + x] !== W) continue
        for (let k = 0; k <= 20; k++) {
          const t = k / 20
          if (x + 1 < size && ground[y * size + x + 1] === W) {
            expect(shoreDistance(codeAt(x, y), 1, t), `(${x},${y})|(${x + 1},${y}) at ${t}`).toBeCloseTo(shoreDistance(codeAt(x + 1, y), 0, t), 6)
          }
          if (y + 1 < rows && ground[(y + 1) * size + x] === W) {
            expect(shoreDistance(codeAt(x, y), t, 1), `(${x},${y})/(${x},${y + 1}) at ${t}`).toBeCloseTo(shoreDistance(codeAt(x, y + 1), t, 0), 6)
          }
        }
      }
    }
  })
  it('is 0 on the shore line, grows toward open water, and wraps round inside corners', () => {
    expect(shoreDistance(codeAt(2, 0), 0.5, 0)).toBe(0)
    expect(shoreDistance(codeAt(2, 1), 0.5, 0.5)).toBeCloseTo(0.5, 9)
    // (4,3) 的 −x−y 斜角 (3,2) 是岸（−x、−y 两边却都是水）：角点上距离为 0，往外是到角点的直线距离。
    expect(shoreDistance(codeAt(4, 3), 0, 0)).toBe(0)
    expect(shoreDistance(codeAt(4, 3), 0.3, 0.4)).toBeCloseTo(0.5, 9)
  })
})

describe('WaterTrail（水花与涟漪的节奏）', () => {
  it('splashes on entering water, then ripples every few tenths of a cell walked, and resets on leaving', () => {
    const t = new WaterTrail()
    expect(t.step(1, false, 2.5, 2.5)).toBeNull()
    expect(t.step(1, true, 3.5, 2.5)).toBe('enter')
    expect(t.step(1, true, 3.5 + WATER_FX.rippleEveryCells * 0.5, 2.5)).toBeNull()
    expect(t.step(1, true, 3.5 + WATER_FX.rippleEveryCells * 1.05, 2.5)).toBe('ripple')
    expect(t.step(1, true, 3.5 + WATER_FX.rippleEveryCells * 1.2, 2.5)).toBeNull()
    expect(t.step(1, false, 5.5, 2.5)).toBeNull()
    expect(t.step(1, true, 6.5, 2.5)).toBe('enter')
  })
  it('standing still in water makes no new ripples; players are tracked separately', () => {
    const t = new WaterTrail()
    t.step(1, true, 3.5, 2.5)
    for (let i = 0; i < 10; i++) expect(t.step(1, true, 3.5, 2.5)).toBeNull()
    expect(t.step(2, true, 7.5, 7.5)).toBe('enter')
  })
  it('a teleport (respawn / blink) into water is not a walk: big jumps start over as an entry', () => {
    const t = new WaterTrail()
    t.step(1, true, 3.5, 2.5)
    expect(t.step(1, true, 9.5, 9.5)).toBe('enter')
  })
})

describe('rug / table frame (root cause of the "green blob")', () => {
  // 原来地毯（#9ed3a0 绿毛毡，y −0.02）与桌面（y −0.05）整块铺在棋盘底下，比下沉的水面（y −0.15）高，
  // 软垫挖洞处看到的其实是绿地毯，水根本露不出来。现在地毯 / 桌面在棋盘范围挖空。
  it('covers the outer square but leaves the board area empty; UVs span 0..1', () => {
    const g = framePlaneGeometry(49, 23)
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv')
    const index = g.getIndex()
    const tri = index ? index.count / 3 : pos.count / 3
    expect(tri).toBeGreaterThan(0)
    let area = 0
    for (let t = 0; t < tri; t++) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k))
      const xs = ids.map((i) => pos.getX(i))
      const zs = ids.map((i) => pos.getZ(i))
      const cx = (xs[0] + xs[1] + xs[2]) / 3
      const cz = (zs[0] + zs[1] + zs[2]) / 3
      expect(Math.abs(cx) >= 11.5 - 1e-6 || Math.abs(cz) >= 11.5 - 1e-6, `triangle ${t} centroid inside the board`).toBe(true)
      for (const i of ids) expect(pos.getY(i)).toBeCloseTo(0, 9)
      area += Math.abs((xs[1] - xs[0]) * (zs[2] - zs[0]) - (xs[2] - xs[0]) * (zs[1] - zs[0])) / 2
    }
    expect(area).toBeCloseTo(49 * 49 - 23 * 23, 3)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < uv.count; i++) {
      lo = Math.min(lo, uv.getX(i), uv.getY(i))
      hi = Math.max(hi, uv.getX(i), uv.getY(i))
    }
    expect(lo).toBeCloseTo(0, 9)
    expect(hi).toBeCloseTo(1, 9)
  })
})
