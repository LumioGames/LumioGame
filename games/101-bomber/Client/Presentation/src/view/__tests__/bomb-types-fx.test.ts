import { describe, expect, it } from 'vitest'
import { BombKind, DEFAULT_RULES, 方向, type PlayerSkillsView } from '../../contract'
import { SKILL_COLOR } from '../../present/skill-style'
import { BOMB_TONE, BOMB_TONES, blastLifeMs, bombDrill, bombTone, lingerSmoke, shockSparks, type BombTone } from '../logic/bomb-look'
import { bombStyle } from '../logic/skill-fx'
import { dollStatus, gaitRate, shockArcs, STATUS_FX, statusTint, toxinBubbles } from '../logic/status-fx'

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹（以及冰冻弹）表现的纯逻辑——
 * 炸弹种类 → 色调 / 爆炸调色、余烟与电火花的节奏、玩偶中毒绿泡 / 麻痹电弧 / 步频 / 色调。
 */

const FOOT_HALF = DEFAULT_RULES.dollFootprintMilli / 2000
const DOLL_SCALE = 1.2

/** 0xRRGGBB → [r, g, b]（0..255）。 */
function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

/** 主色相：r / g / b 里哪一路最大（黄 = r、g 都高而 b 低）。 */
function hue(hex: number): 'red' | 'green' | 'blue' | 'yellow' | 'orange' {
  const [r, g, b] = rgb(hex)
  if (r > g * 0.85 && g > r * 0.85 && b < Math.min(r, g) * 0.75) return 'yellow'
  if (b > r && b >= g) return 'blue'
  if (g > r && g > b) return 'green'
  if (r > g && g > b) return 'orange'
  return 'red'
}

describe('bomb tone (ADR 0033)', () => {
  it('maps every bomb kind to a tone: standard / fire / pierce / split = fire', () => {
    expect(bombTone(BombKind.Standard)).toBe('fire')
    expect(bombTone(BombKind.Pierce)).toBe('fire')
    expect(bombTone(BombKind.Fire)).toBe('fire')
    expect(bombTone(BombKind.Split)).toBe('fire')
    expect(bombTone(BombKind.Freeze)).toBe('frost')
    expect(bombTone(BombKind.Toxin)).toBe('toxin')
    expect(bombTone(BombKind.Shock)).toBe('shock')
    expect(bombTone(99)).toBe('fire')
  })

  it('drill spikes come from the pierce kind or any pierce layers, whatever the tone', () => {
    expect(bombDrill(BombKind.Standard, 0)).toBe(false)
    expect(bombDrill(BombKind.Pierce, 0)).toBe(true)
    expect(bombDrill(BombKind.Standard, 2)).toBe(true)
    expect(bombDrill(BombKind.Toxin, 1)).toBe(true)
    expect(bombDrill(BombKind.Shock, 0)).toBe(false)
  })

  it('bombStyle names the new looks (toxin / shock) and keeps the old four', () => {
    expect(bombStyle(BombKind.Toxin, 0)).toBe('toxin')
    expect(bombStyle(BombKind.Shock, 0)).toBe('shock')
    expect(bombStyle(BombKind.Freeze, 0)).toBe('frost')
    expect(bombStyle(BombKind.Freeze, 1)).toBe('glacier')
    expect(bombStyle(BombKind.Standard, 0)).toBe('standard')
    expect(bombStyle(BombKind.Pierce, 1)).toBe('pierce')
  })

  it('palettes read at a glance: fire orange, frost ice blue, toxin poison green, shock electric yellow', () => {
    const want: Record<BombTone, ReturnType<typeof hue>[]> = {
      fire: ['orange', 'yellow'],
      frost: ['blue'],
      toxin: ['green'],
      shock: ['yellow'],
    }
    for (const t of BOMB_TONES) {
      const p = BOMB_TONE[t]
      for (const c of [p.hot, p.rim, p.glow, p.ring]) expect(want[t], `${t} ${c.toString(16)}`).toContain(hue(c))
      // 危险光（线性系数）：主通道与色相一致。
      const [r, g, b] = p.danger
      if (t === 'frost') expect(b).toBeGreaterThan(r)
      if (t === 'toxin') expect(g).toBeGreaterThan(Math.max(r, b))
      if (t === 'shock') expect(Math.min(r, g)).toBeGreaterThan(b * 2)
      if (t === 'fire') expect(r).toBeGreaterThan(g)
    }
    expect(BOMB_TONE.fire.shell).toBeNull()
    for (const t of ['frost', 'toxin', 'shock'] as const) expect(BOMB_TONE[t].shell).not.toBeNull()
    // 冰冻弹「一眼冰蓝」：外壳是饱和的冰蓝，而不是近白。
    const [r, g, b] = rgb(BOMB_TONE.frost.shell!)
    expect(b - r).toBeGreaterThan(80)
    expect(g).toBeGreaterThan(r)
  })

  it('the four palettes are pairwise distinct', () => {
    const keys = BOMB_TONES.map((t) => `${BOMB_TONE[t].hot}:${BOMB_TONE[t].rim}:${BOMB_TONE[t].glow}`)
    expect(new Set(keys).size).toBe(BOMB_TONES.length)
  })

  it('bomb shells share their hue with the skill candy colour', () => {
    expect(hue(BOMB_TONE.toxin.shell!)).toBe(hue(SKILL_COLOR.toxinBomb))
    expect(hue(BOMB_TONE.shock.shell!)).toBe(hue(SKILL_COLOR.shockBomb))
    expect(hue(BOMB_TONE.frost.shell!)).toBe(hue(SKILL_COLOR.freezeBomb))
  })
})

describe('blast timing per tone', () => {
  it('only toxin lingers after the danger window; the rest end with the fade', () => {
    expect(BOMB_TONE.toxin.lingerMs).toBeGreaterThan(0)
    for (const t of ['fire', 'frost', 'shock'] as const) expect(BOMB_TONE[t].lingerMs).toBe(0)
    expect(blastLifeMs('toxin', 500)).toBe(500 + 100 + BOMB_TONE.toxin.lingerMs)
    expect(blastLifeMs('fire', 500)).toBe(600)
  })

  it('toxin smoke: hidden before the blast ends, rises and grows, then fades out by the linger end', () => {
    const L = BOMB_TONE.toxin.lingerMs
    expect(lingerSmoke(-50, L).alpha).toBe(0)
    const a = lingerSmoke(0, L)
    const m = lingerSmoke(L / 2, L)
    const z = lingerSmoke(L, L)
    expect(a.alpha).toBeGreaterThan(0.5)
    expect(m.rise).toBeGreaterThan(a.rise)
    expect(m.scale).toBeGreaterThan(a.scale)
    expect(m.alpha).toBeLessThan(a.alpha)
    expect(z.alpha).toBe(0)
    expect(lingerSmoke(L + 1, L).alpha).toBe(0)
    expect(lingerSmoke(100, 0).alpha).toBe(0)
  })

  it('shock sparks: only shock has them; deterministic per (cell, time bucket); re-rolled across buckets', () => {
    expect(BOMB_TONE.shock.sparksPerCell).toBeGreaterThan(0)
    for (const t of ['fire', 'frost', 'toxin'] as const) expect(BOMB_TONE[t].sparksPerCell).toBe(0)
    const a = shockSparks(3, 4, 1.7, 1000, 2)
    const b = shockSparks(3, 4, 1.7, 1010, 2)
    const c = shockSparks(3, 4, 1.7, 1200, 2)
    expect(a).toHaveLength(2)
    expect(b).toEqual(a)
    expect(c).not.toEqual(a)
    expect(shockSparks(5, 4, 1.7, 1000, 2)).not.toEqual(a)
    for (const s of [...a, ...c]) {
      // 电火花留在本格内、离地不高。
      expect(Math.abs(s.dx)).toBeLessThan(0.5)
      expect(Math.abs(s.dz)).toBeLessThan(0.5)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(1)
      expect(s.len).toBeGreaterThan(0.1)
    }
  })
})

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

describe('doll status fx (ADR 0033)', () => {
  it('reads toxinUntilTick / shockUntilTick (exclusive) and treats missing fields as 0', () => {
    expect(dollStatus(undefined, 100)).toEqual({ frozen: false, poisoned: false, shocked: false })
    expect(dollStatus(sk(), 100)).toEqual({ frozen: false, poisoned: false, shocked: false })
    expect(dollStatus(sk({ toxinUntilTick: 101 }), 100).poisoned).toBe(true)
    expect(dollStatus(sk({ toxinUntilTick: 100 }), 100).poisoned).toBe(false)
    expect(dollStatus(sk({ shockUntilTick: 150 }), 100).shocked).toBe(true)
    expect(dollStatus(sk({ shockUntilTick: 150 }), 150).shocked).toBe(false)
    expect(dollStatus(sk({ frozenUntilTick: 120 }), 100).frozen).toBe(true)
  })

  it('tint: frozen ice blue beats toxin green; otherwise white', () => {
    expect(statusTint({ frozen: false, poisoned: false, shocked: true })).toBe(0xffffff)
    expect(hue(statusTint({ frozen: false, poisoned: true, shocked: false }))).toBe('green')
    expect(statusTint({ frozen: true, poisoned: true, shocked: false })).toBe(STATUS_FX.frozenTint)
    // 「略微」：绿调不压暗玩偶（每通道 ≥ 0xb0）。
    for (const c of rgb(STATUS_FX.toxinTint)) expect(c).toBeGreaterThanOrEqual(0xb0)
  })

  it('shocked dolls step slower; frozen dolls do not step at all', () => {
    expect(gaitRate({ frozen: false, poisoned: false, shocked: false })).toBe(1)
    expect(gaitRate({ frozen: false, poisoned: true, shocked: false })).toBe(1)
    const s = gaitRate({ frozen: false, poisoned: false, shocked: true })
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
    expect(gaitRate({ frozen: true, poisoned: false, shocked: true })).toBe(0)
  })

  it('toxin bubbles rise within the footprint, grow and pop, and are stable per (id, time)', () => {
    const n = STATUS_FX.toxinBubbles
    let prevMaxY = -1
    let popped = 0
    for (let f = 0; f < 200; f++) {
      const t = 3 + f * 0.013
      const bs = toxinBubbles(t, 7)
      expect(bs).toHaveLength(n)
      expect(toxinBubbles(t, 7)).toEqual(bs)
      for (const b of bs) {
        const reach = (Math.hypot(b.dx, b.dz) + b.r) * DOLL_SCALE
        expect(reach).toBeLessThanOrEqual(FOOT_HALF)
        expect(b.y).toBeGreaterThanOrEqual(STATUS_FX.toxinBubbleStartY - 1e-9)
        expect(b.y).toBeLessThanOrEqual(STATUS_FX.toxinBubbleStartY + STATUS_FX.toxinBubbleRise + 1e-9)
        expect(b.r).toBeGreaterThanOrEqual(0)
        if (b.r < 1e-3) popped++
      }
      prevMaxY = Math.max(prevMaxY, ...bs.map((b) => b.y))
    }
    // 泡泡升到头顶以上（DOLL.height 1.08），破掉的时刻确实会出现。
    expect(prevMaxY).toBeGreaterThan(1.08)
    expect(popped).toBeGreaterThan(0)
    // 不同玩偶错开相位。
    expect(toxinBubbles(3, 7)).not.toEqual(toxinBubbles(3, 8))
  })

  it('shock arcs hug the body within the footprint and re-roll at shockArcHz', () => {
    const n = STATUS_FX.shockArcs
    const a = shockArcs(2.0, 5)
    expect(a).toHaveLength(n)
    expect(shockArcs(2.0 + 0.2 / STATUS_FX.shockArcHz, 5)).toEqual(a)
    expect(shockArcs(2.0 + 1.5 / STATUS_FX.shockArcHz, 5)).not.toEqual(a)
    for (let f = 0; f < 120; f++) {
      for (const arc of shockArcs(f * 0.037, 3)) {
        // 弧段中心在半径 R 的圆上，沿切向半长 len/2：最远 = hypot(R, len/2)。
        const reach = Math.hypot(STATUS_FX.shockArcRadius, arc.len / 2) * DOLL_SCALE
        expect(reach).toBeLessThanOrEqual(FOOT_HALF - 0.02)
        expect(arc.y).toBeGreaterThan(0.1)
        expect(arc.y).toBeLessThan(1.08)
        expect(Math.abs(arc.tilt)).toBeLessThanOrEqual(1.2)
      }
    }
  })
})
