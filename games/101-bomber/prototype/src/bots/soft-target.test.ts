import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, BOT_TACTICS, type BotProfile, type U64 } from '../contract'
import { nearestEnemyWithin, pickHuntTarget, softTargetVerdict } from './behaviors'
import { BotBrain } from './bot-brain'
import { ctxFor, config, makeSnapshot, rules, standardMap, type PlayerSpec, type SnapSpec } from './test-fixtures'

/**
 * 原型扩展（NON-CONTRACT，ADR 0043；design §15「Bot 分层」）：不围剿真人。真人（宿主传的 softTargets）作为目标 +6 步；
 * 只有离真人最近（格曼哈顿、id 定平局）的 2 个 Bot 能选他；真人是帽王或在 3 格内时例外。无状态：同一快照同一结论。
 */
const HUMAN: U64 = 1
/** 真人 (9,9)；Bot 2 在 2 格（3 格内例外），3 / 4 / 6 都在 4 格（id 定平局 → 3 入选），5 在 16 格。 */
const ring = (over: Partial<Record<number, Partial<PlayerSpec>>> = {}, extra: Partial<SnapSpec> = {}): SnapSpec => ({
  map: standardMap(),
  tick: 100,
  players: [
    { id: 1, X: 9, Y: 9 },
    { id: 2, X: 9, Y: 11 },
    { id: 3, X: 9, Y: 13 },
    { id: 4, X: 13, Y: 9 },
    { id: 5, X: 1, Y: 1 },
    { id: 6, X: 5, Y: 9 },
  ].map((p) => ({ ...p, ...(over[p.id] ?? {}) })),
  ...extra,
})
const verdict = (spec: SnapSpec, self: U64, soft: readonly U64[] = [HUMAN]) => softTargetVerdict(makeSnapshot(spec), self, soft, BOT_TACTICS)

describe('softTargetVerdict (stateless, same snapshot → same answer)', () => {
  it('only the nearest 2 bots may pick the human (+6); the rest are blocked; ties go to the lower id', () => {
    expect(verdict(ring(), 3).penalty.get(HUMAN)).toBe(6)
    expect(verdict(ring(), 3).blocked.has(HUMAN)).toBe(false)
    for (const self of [4, 5, 6]) {
      expect(verdict(ring(), self).blocked.has(HUMAN)).toBe(true)
      expect(verdict(ring(), self).penalty.has(HUMAN)).toBe(false)
    }
  })

  it('a bot within 3 cells is exempt (no limit, no penalty) — and still counts as one of the nearest two', () => {
    const v = verdict(ring(), 2)
    expect(v.blocked.has(HUMAN)).toBe(false)
    expect(v.penalty.has(HUMAN)).toBe(false)
    // Bot 2 占了一个名额：4 格那一档只有 id 最小的 3 能选。
    expect(verdict(ring(), 4).blocked.has(HUMAN)).toBe(true)
  })

  it('the hat king is fair game for everyone (no limit, no penalty)', () => {
    for (const self of [3, 4, 5, 6]) {
      const v = verdict(ring({}, { king: HUMAN }), self)
      expect(v.blocked.size + v.penalty.size).toBe(0)
    }
  })

  it('dead / eliminated bots do not take a slot; a dead or eliminated human is ignored', () => {
    // Bot 2 死了（重生倒计时）：名额给 3、4（同 4 格，id 小者优先）。
    expect(verdict(ring({ 2: { hp: 0 } }), 4).penalty.get(HUMAN)).toBe(6)
    expect(verdict(ring({ 2: { hp: 0 } }), 6).blocked.has(HUMAN)).toBe(true)
    expect(verdict(ring({ 2: { eliminated: true } }), 4).penalty.get(HUMAN)).toBe(6)
    for (const h of [{ hp: 0 }, { eliminated: true }]) {
      const v = verdict(ring({ 1: h }), 5)
      expect(v.blocked.size + v.penalty.size).toBe(0)
    }
  })

  it('every bot computes the same allocation: at most 2 bots outside 3 cells may pick the human', () => {
    const allowed = [2, 3, 4, 5, 6].filter((self) => !verdict(ring(), self).blocked.has(HUMAN))
    expect(allowed).toEqual([2, 3])
    const far = [2, 3, 4, 5, 6].filter((self) => verdict(ring(), self).penalty.has(HUMAN))
    expect(far.length).toBeLessThanOrEqual(BOT_TACTICS.softTargetHunters)
  })

  it('no soft targets (or being the soft target yourself) → nothing blocked, nothing penalised', () => {
    for (const soft of [[], undefined]) {
      const v = softTargetVerdict(makeSnapshot(ring()), 5, soft, BOT_TACTICS)
      expect(v.blocked.size + v.penalty.size).toBe(0)
    }
    const self = verdict(ring(), HUMAN)
    expect(self.blocked.size + self.penalty.size).toBe(0)
  })
})

describe('target scoring with the verdict', () => {
  // 自己 (1,9)，真人 (5,9) 路程 4，另一个 Bot 7 在 (1,17) 路程 8；两个 Bot 都是离真人最近的 2 个之一 → 真人 +6。
  const duel = (humanAt: [number, number], other: [number, number], extra: Partial<SnapSpec> = {}): SnapSpec => ({
    map: standardMap(),
    tick: 100,
    players: [
      { id: 10, X: 1, Y: 9 },
      { id: HUMAN, X: humanAt[0], Y: humanAt[1] },
      { id: 7, X: other[0], Y: other[1] },
    ],
    ...extra,
  })
  const pick = (spec: SnapSpec, soft: boolean): U64 | undefined => {
    const snap = makeSnapshot(spec)
    const ctx = ctxFor(spec, 10, soft ? { soft: softTargetVerdict(snap, 10, [HUMAN], BOT_TACTICS) } : {})
    return pickHuntTarget(ctx)?.NetEntityIdRaw
  }

  it('+6 steps flips a 4-vs-8 choice away from the human', () => {
    expect(pick(duel([5, 9], [1, 17]), false)).toBe(HUMAN)
    expect(pick(duel([5, 9], [1, 17]), true)).toBe(7)
  })

  it('the penalty alone does not forbid: a far-away alternative still loses to the human', () => {
    // 另一个对手路程 16：真人 4 + 6 = 10 仍更近。
    expect(pick(duel([5, 9], [17, 9]), true)).toBe(HUMAN)
  })

  it('within 3 cells: no penalty', () => {
    expect(pick(duel([3, 9], [1, 13]), true)).toBe(HUMAN)
  })

  it('near-by engage counts the penalty as extra steps and skips blocked humans', () => {
    const spec = duel([5, 9], [1, 17])
    const snap = makeSnapshot(spec)
    expect(nearestEnemyWithin(ctxFor(spec, 10), 6)?.NetEntityIdRaw).toBe(HUMAN)
    // 4 + 6 = 10 > 6：不再近身开打。
    expect(nearestEnemyWithin(ctxFor(spec, 10, { soft: softTargetVerdict(snap, 10, [HUMAN], BOT_TACTICS) }), 6)).toBeNull()
    expect(nearestEnemyWithin(ctxFor(spec, 10, { soft: { blocked: new Set([HUMAN]), penalty: new Map() } }), 6)).toBeNull()
  })
})

describe('in the brain (softTargets from the host)', () => {
  const huntTargets = (profile: BotProfile, self: U64, soft: boolean, spec: SnapSpec, seed: number): Set<U64> => {
    const b = new BotBrain({ self, seed, personality: 'hunter', config, rules, profile, ...(soft ? { softTargets: [HUMAN] } : {}) })
    const seen = new Set<U64>()
    for (let t = 100; t < 160; t++) {
      b.decide(makeSnapshot({ ...spec, tick: t }))
      const h = b.debugState().huntTarget
      if (h !== 0) seen.add(h)
    }
    return seen
  }

  it('a non-king human 3+ cells away is only ever hunted by the nearest 2 bots', () => {
    // 真人 (9,9)；Bot 3 (9,13) 与 4 (13,9) 是最近两个（4 格），6 (5,9) 同 4 格但 id 大、5 (1,1) 很远。
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 100,
      players: [
        { id: 1, X: 9, Y: 9 },
        { id: 3, X: 9, Y: 13 },
        { id: 4, X: 13, Y: 9 },
        { id: 5, X: 1, Y: 1 },
        { id: 6, X: 5, Y: 9 },
      ],
    }
    for (const profile of [BOT_PROFILES.rookie, BOT_PROFILES.normal, BOT_PROFILES.hard]) {
      let blockedEverWithout = false
      for (let seed = 1; seed <= 6; seed++) {
        for (const self of [5, 6]) {
          expect(huntTargets(profile, self, true, spec, seed).has(HUMAN)).toBe(false)
          if (huntTargets(profile, self, false, spec, seed).has(HUMAN)) blockedEverWithout = true
        }
      }
      // 规则确实起了作用：不传 softTargets 时这些 Bot 会追真人。（最近两个「能选但 +6」见上面的打分测试。）
      expect(blockedEverWithout).toBe(true)
    }
  })

  it('the hat king human is hunted by far bots too', () => {
    const spec: SnapSpec = {
      map: standardMap(),
      tick: 100,
      king: HUMAN,
      players: [
        { id: 1, X: 9, Y: 9, hats: 6 },
        { id: 3, X: 9, Y: 13 },
        { id: 4, X: 13, Y: 9 },
        { id: 6, X: 5, Y: 9 },
      ],
    }
    let any = false
    for (let seed = 1; seed <= 6; seed++) if (huntTargets(BOT_PROFILES.normal, 6, true, spec, seed).has(HUMAN)) any = true
    expect(any).toBe(true)
  })
})
