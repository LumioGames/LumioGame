import { describe, expect, it } from 'vitest'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES, DeathCause, type AbilityActivation } from '../../contract'
import { hashWorld } from '../hash'
import { createWorld } from '../match-phase'
import { stepWorld } from '../step'
import { chestAt, type World } from '../world'
import { SKILL, specs, Walker } from './helpers'

/**
 * 技能全开的长跑（原型扩展 NON-CONTRACT，ADR 0030）：8 个 auto 角色、木箱全掉技能糖、随机游走 + 每人每 29 Tick 按一次技能。
 * 同种子逐 Tick 哈希一致、换种子不同；每 Tick 查不变量。（Math.random / Date.now 的静态扫描在 tests/architecture.test.ts #19。）
 */

const TICKS = 2600

interface Soak {
  hashes: string[]
  activated: number
  kicked: number
  frozen: number
  evolved: number
  violations: string[]
}

function soak(seed: number): Soak {
  const w: World = createWorld({
    seed,
    config: { ...DEFAULT_CONFIG, matchDurationMs: 100_000 },
    rules: { ...DEFAULT_RULES, crateSkillCandyPermille: 1000 },
    players: specs(8, Array.from({ length: 8 }, () => 'auto' as const)),
  })
  const ids = w.players.map((p) => p.id)
  // 第一局开局给每人补齐空槽：非兔子的被动 = 踢弹 L3，炸弹槽按 id 交替冰冻弹 / 穿透弹（第二局 startMatch 照常清掉）。
  for (const p of w.players) {
    if (p.slots.passive === null) p.slots.passive = { skill: 'kick', level: 3, bound: false, parts: null }
    p.slots.bomb = { skill: p.id % 2 === 0 ? 'freezeBomb' : 'pierceBomb', level: 1, bound: false, parts: null }
  }
  const walker = new Walker(seed * 7 + 1, 0.08)
  const out: Soak = { hashes: [], activated: 0, kicked: 0, frozen: 0, evolved: 0, violations: [] }
  const bad = (m: string): void => {
    if (out.violations.length < 10) out.violations.push(`t=${w.t}: ${m}`)
  }
  for (let i = 0; i < TICKS; i++) {
    const next = w.t + 1
    const before = new Map(w.players.map((p) => [p.id, { mx: p.mx, my: p.my, frozen: next < p.frozenUntilTick }]))
    const inputs = walker.inputs(ids) as Map<number, AbilityActivation[]>
    for (const id of ids) if ((next + id) % 29 === 0) inputs.get(id)?.push(SKILL)
    const f = stepWorld(w, inputs)
    for (const e of f.events) {
      if (e.type === 'SkillActivated') out.activated++
      else if (e.type === 'BombKicked') out.kicked++
      else if (e.type === 'PlayerFrozen') out.frozen++
      else if (e.type === 'SkillEvolved') out.evolved++
      else if (e.type === 'DamageApplied' && e.proto?.Cause !== DeathCause.Poison) {
        const p = w.players.find((q) => q.id === e.VictimNetEntityIdRaw)
        if (p && p.bubbleUntilTick > e.Tick) bad(`damage cause ${e.proto?.Cause} to bubbled ${p.id}`)
      }
    }
    for (const p of w.players) {
      if (p.health < 0 || p.health > w.cfg.maxHealthPoints) bad(`health ${p.health}`)
      if (p.mx % 1000 !== 500 && p.my % 1000 !== 500) bad(`off-lane ${p.id} ${p.mx},${p.my}`)
      const b = before.get(p.id)!
      if (b.frozen && p.teleportTick !== w.t && (p.mx !== b.mx || p.my !== b.my)) bad(`frozen ${p.id} moved`)
      if (p.character !== null) {
        const ex = w.rules.characters[p.character].skill
        const slot = p.slots[w.rules.skills[ex].slot]
        if (!slot || (slot.skill !== ex && !slot.parts?.some((q) => q.skill === ex && q.bound))) bad(`exclusive ${ex} lost by ${p.id}`)
      }
    }
    const live = w.bombs.filter((b) => b.explodedAtTick === 0)
    for (const b of live) {
      if (w.brick[b.cell] !== BlockType.Air) bad(`bomb ${b.id} inside a brick`)
      if (chestAt(w, b.cell)) bad(`bomb ${b.id} on a chest`)
      if (live.some((o) => o !== b && o.cell === b.cell)) bad(`two live bombs on ${b.cell}`)
    }
    out.hashes.push(hashWorld(w))
  }
  return out
}

describe('skills soak', () => {
  it('same seed → identical hashes every tick; different seed differs; invariants hold', () => {
    const a = soak(3)
    const b = soak(3)
    expect(a.violations).toEqual([])
    expect(a.hashes).toEqual(b.hashes)
    expect(soak(4).hashes).not.toEqual(a.hashes)
    expect(a.activated).toBeGreaterThan(0)
    expect(a.kicked).toBeGreaterThan(0)
    expect(a.frozen).toBeGreaterThan(0)
    expect(new Set(a.hashes).size).toBeGreaterThan(TICKS - 50)
  })
})
