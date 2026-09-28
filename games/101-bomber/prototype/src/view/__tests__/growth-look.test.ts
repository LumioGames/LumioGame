import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, type PlayerView, type ResourceBoxView, type SupplyView } from '../../contract'
import { SLOT_COLOR } from '../../hud/icons'
import { CAMERA, overviewDistanceFor } from '../logic/camera-math'
import { BOSS_LIFT, bossHeightScale } from '../logic/doll-fit'
import {
  FRENZY_LOOK,
  frenzyActive,
  frenzyGlow,
  GOLD_ORBIT,
  goldOrbitPoint,
  headHeartBar,
  resourceBoxIndex,
  supplyBeacon,
  tierCode,
  TIER_CODE,
} from '../logic/growth-look'
import { damageStage } from '../logic/interp'
import { SLOT_COLORS, slotColor } from '../palette'

const PER = DEFAULT_CONFIG.healthPointsPerHeart
const BOSS = DEFAULT_RULES.bossMinHearts

describe('Boss 加高（ADR 0039 / 0043：只加高，脚圈与前伸不变）', () => {
  it('non-Boss dolls keep height 1; Boss dolls grow with their heart cap, capped at 8 hearts', () => {
    for (const hearts of [3, 4, 5]) expect(bossHeightScale(hearts * PER, PER, BOSS)).toBe(1)
    const six = bossHeightScale(6 * PER, PER, BOSS)
    const seven = bossHeightScale(7 * PER, PER, BOSS)
    const eight = bossHeightScale(8 * PER, PER, BOSS)
    expect(six).toBeCloseTo(1 + BOSS_LIFT.base)
    expect(seven).toBeGreaterThan(six)
    expect(eight).toBeGreaterThan(seven)
    expect(bossHeightScale(12 * PER, PER, BOSS)).toBe(eight)
    expect(eight).toBeLessThanOrEqual(BOSS_LIFT.max)
  })
})

describe('他人破损三档按占上限比例（design §12 残血表现）', () => {
  it('matches the old whole-heart stages for a 3-heart cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((hp) => damageStage(hp, 6))).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
  it('scales to the cap: an 8-heart Boss on 3 hearts already shows cotton', () => {
    expect(damageStage(16, 16)).toBe(3)
    expect(damageStage(11, 16)).toBe(3)
    expect(damageStage(10, 16)).toBe(2)
    expect(damageStage(6, 16)).toBe(2)
    expect(damageStage(5, 16)).toBe(1)
    expect(damageStage(1, 16)).toBe(1)
    expect(damageStage(0, 16)).toBe(0)
    expect(damageStage(20, 16)).toBe(3)
  })
})

describe('头顶心条（ADR 0039：Boss 常驻，其余受击后 3 秒；格数 = 上限，金心格为金色）', () => {
  it('a 3-heart player shows 3 pips only right after a hit', () => {
    expect(headHeartBar(5, 6, PER, 0, BOSS, true)).toEqual({ pips: 3, pipMax: 3, pipGold: 0, boss: false })
    expect(headHeartBar(5, 6, PER, 0, BOSS, false).pips).toBe(-1)
  })
  it('a Boss always shows up to 8 pips with its gold hearts on top', () => {
    expect(headHeartBar(9, 16, PER, 3, BOSS, false)).toEqual({ pips: 5, pipMax: 8, pipGold: 3, boss: true })
    expect(headHeartBar(12, 12, PER, 1, BOSS, false)).toEqual({ pips: 6, pipMax: 6, pipGold: 1, boss: true })
    expect(headHeartBar(0, 16, PER, 3, BOSS, false).pips).toBe(-1)
  })
})

describe('俯瞰镜头距离随棋盘放大（27 档）', () => {
  it('keeps 19×19 at the old distance and grows with the board', () => {
    expect(overviewDistanceFor(19)).toBe(CAMERA.overviewDistance)
    expect(overviewDistanceFor(15)).toBe(CAMERA.overviewDistance)
    expect(overviewDistanceFor(23)).toBeGreaterThan(overviewDistanceFor(19))
    expect(overviewDistanceFor(27)).toBeCloseTo((CAMERA.overviewDistance * 27) / 19)
  })
})

describe('16 个玩家颜色槽', () => {
  it('has 16 distinct slot colours (the first 8 unchanged), no wrap-around before slot 16', () => {
    expect(SLOT_COLORS).toHaveLength(16)
    expect(new Set(SLOT_COLORS).size).toBe(16)
    expect(slotColor(8)).not.toBe(slotColor(0))
    expect(slotColor(16)).toBe(slotColor(0))
    expect(SLOT_COLORS.slice(0, 8)).toEqual([0x3db8da, 0xff7a3d, 0xffc93c, 0x6cc551, 0xb57bff, 0xff6fa8, 0xffffff, 0x2b2320])
  })
  it('the HUD mirrors the view colours slot by slot', () => {
    expect(SLOT_COLOR).toHaveLength(16)
    SLOT_COLORS.forEach((c, i) => expect(SLOT_COLOR[i].toLowerCase()).toBe(`#${c.toString(16).padStart(6, '0')}`))
  })
})

describe('资源箱等级（ADR 0040：木 / 铁 / 金按格给出）', () => {
  const box = (X: number, Y: number, tier: ResourceBoxView['tier'], left = 1, req = 1): ResourceBoxView => ({ Cell: { X, Y }, tier, HitsLeft: left, HitsRequired: req })
  it('indexes boxes by cell; crate cells missing from the list are wood', () => {
    const m = resourceBoxIndex([box(1, 2, 'iron'), box(3, 4, 'gold', 2, 2)], 9)
    expect(m.get(2 * 9 + 1)?.tier).toBe('iron')
    expect(m.get(4 * 9 + 3)?.HitsRequired).toBe(2)
    expect(tierCode(m.get(0))).toBe(TIER_CODE.wood)
    expect(tierCode(m.get(2 * 9 + 1))).toBe(TIER_CODE.iron)
    expect(tierCode(m.get(4 * 9 + 3))).toBe(TIER_CODE.gold)
    expect(resourceBoxIndex(undefined, 9).size).toBe(0)
  })
})

describe('狂暴（ADR 0040：全身红光）与金心环绕', () => {
  const p = (until?: number): Pick<PlayerView, 'frenzyUntilTick'> => (until === undefined ? {} : { frenzyUntilTick: until })
  it('is active strictly before frenzyUntilTick; missing field = never', () => {
    expect(frenzyActive(p(100), 99.5)).toBe(true)
    expect(frenzyActive(p(100), 100)).toBe(false)
    expect(frenzyActive(p(), 50)).toBe(false)
    expect(frenzyActive(p(0), 0)).toBe(false)
  })
  it('pulses a strong red glow', () => {
    for (let t = 0; t < 2000; t += 50) {
      const g = frenzyGlow(t)
      expect(g).toBeGreaterThanOrEqual(FRENZY_LOOK.glowMin - 1e-9)
      expect(g).toBeLessThanOrEqual(FRENZY_LOOK.glowMax + 1e-9)
    }
    expect(FRENZY_LOOK.color).toBe(0xff3b2f)
  })
  it('orbits gold hearts evenly around the doll inside the 0.7 footprint radius', () => {
    const pts = [0, 1, 2].map((i) => goldOrbitPoint(i, 3, 1234))
    for (const q of pts) expect(Math.hypot(q.x, q.z)).toBeCloseTo(GOLD_ORBIT.radius)
    expect(GOLD_ORBIT.radius).toBeLessThanOrEqual(0.35)
    const ang = pts.map((q) => Math.atan2(q.z, q.x))
    const gap = Math.abs(((ang[1] - ang[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    // 三颗等分：相邻两颗相隔 120°。
    expect(gap).toBeCloseTo((Math.PI * 2) / 3, 5)
  })
})

describe('中央补给光柱与预告（ADR 0040）', () => {
  const sup = (state: SupplyView['state']): SupplyView => ({ Cell: { X: 13, Y: 13 }, announceTick: 1000, openTick: 1200, state })
  it('shows the beacon with a countdown once announced, and a burst once opened', () => {
    expect(supplyBeacon(null, 900, 20)).toBeNull()
    expect(supplyBeacon(sup('pending'), 900, 20)).toBeNull()
    expect(supplyBeacon(sup('announced'), 1100, 20)).toEqual({ x: 13.5, z: 13.5, secLeft: 5, opened: false })
    expect(supplyBeacon(sup('opened'), 1210, 20)).toEqual({ x: 13.5, z: 13.5, secLeft: 0, opened: true })
  })
})
