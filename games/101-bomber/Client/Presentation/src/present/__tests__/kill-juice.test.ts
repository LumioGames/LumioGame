import { describe, expect, it } from 'vitest'
import { DeathCause, type BomberEvent, type U64 } from '../../contract'
import { finalKillOf, KILL_JUICE, KillJuice, killPitchRatio, rapidLabel, settleHoldTicks, type KillInfo } from '../kill-juice'

const ME: U64 = 1
const HZ = 20
/** 8 秒窗口 = 160 Tick（20 Hz）。 */
const WINDOW = 160

const died = (tick: number, victim: U64, killer: U64, chain: U64 = 0, cause: number = DeathCause.Bomb): BomberEvent => ({
  type: 'PlayerDied',
  VictimNetEntityIdRaw: victim,
  KillerNetEntityIdRaw: killer,
  ChainId: chain,
  Cause: cause as DeathCause,
  Cell: { X: 1, Y: 1 },
  Tick: tick,
})
const exploded = (tick: number, chain: U64, owner: U64): BomberEvent => ({ type: 'BombExploded', ChainId: chain, SourceBombOwnerNetEntityIdRaw: owner, CellCount: 5, Tick: tick })
const resolved = (tick: number, chain: U64, bombs: number, owners: U64[]): BomberEvent => ({
  type: 'ChainResolved',
  presentationOnly: true,
  ChainId: chain,
  BombCount: bombs,
  BrickCount: 0,
  OwnerNetEntityIdRaws: owners,
  Tick: tick,
})
const ended = (tick: number): BomberEvent => ({ type: 'MatchEnded', Tick: tick })
const started = (tick: number, index: number): BomberEvent => ({ type: 'MatchStarted', presentationOnly: true, MatchIndex: index, Tick: tick })

const juice = (): KillJuice => new KillJuice({ localId: ME, tickRateHz: HZ })
/** 逐条喂击杀（每条自成一批，链各不相同），收集每一杀的结论。 */
function feedKills(j: KillJuice, kills: [tick: number, victim: U64, killer: U64, chain?: U64][]): KillInfo[] {
  return kills.flatMap(([t, v, k, c]) => j.consume([died(t, v, k, c ?? 1000 + t * 10 + v)]).kills)
}

describe('rapidLabel', () => {
  it('maps kills inside the 8 s window to 双杀 / 三杀 / 四杀 / 暴走', () => {
    expect(rapidLabel(1)).toBeNull()
    expect(rapidLabel(2)).toBe('双杀')
    expect(rapidLabel(3)).toBe('三杀')
    expect(rapidLabel(4)).toBe('四杀')
    expect(rapidLabel(5)).toBe('暴走')
    expect(rapidLabel(9)).toBe('暴走')
  })
})

describe('KillJuice · 8 秒窗口连杀', () => {
  it('announces 双杀 → 三杀 → 四杀 → 暴走 for kills each ≤ 8 s apart, then stays quiet at 暴走', () => {
    const ks = feedKills(juice(), [
      [0, 2, ME],
      [100, 3, ME],
      [200, 4, ME],
      [300, 5, ME],
      [400, 6, ME],
      [500, 7, ME],
    ])
    expect(ks.map((k) => k.rapid)).toEqual([1, 2, 3, 4, 5, 6])
    expect(ks.map((k) => k.rapidLabel)).toEqual([null, '双杀', '三杀', '四杀', '暴走', null])
  })

  it('counts a kill exactly 8 s after the previous one, resets one Tick later', () => {
    const j = juice()
    const ks = feedKills(j, [
      [0, 2, ME],
      [WINDOW, 3, ME],
      [2 * WINDOW + 1, 4, ME],
    ])
    expect(ks.map((k) => k.rapid)).toEqual([1, 2, 1])
    expect(ks.map((k) => k.rapidLabel)).toEqual([null, '双杀', null])
  })

  it('does not call a single chain multi-kill 双杀 (that is the 多杀 popup), but counts it toward the next label', () => {
    const j = juice()
    const same = j.consume([died(10, 2, ME, 77), died(10, 3, ME, 77)]).kills
    expect(same.map((k) => k.rapid)).toEqual([1, 2])
    expect(same.map((k) => k.rapidLabel)).toEqual([null, null])
    const next = j.consume([died(60, 4, ME, 78)]).kills
    expect(next[0].rapid).toBe(3)
    expect(next[0].rapidLabel).toBe('三杀')
  })

  it('tracks every killer separately and ignores suicides, drowning and zero killers', () => {
    const j = juice()
    const ks = j.consume([died(0, 2, 5, 1), died(0, ME, ME, 2), died(0, 3, 0, 0, DeathCause.Drown), died(1, 4, 5, 3), died(1, 6, 7, 4)]).kills
    expect(ks.map((k) => [k.killer, k.victim, k.rapid])).toEqual([
      [5, 2, 1],
      [5, 4, 2],
      [7, 6, 1],
    ])
    expect(ks[1].rapidLabel).toBe('双杀')
  })

  it('credits burn / toxin kills that have an owner (killer ≠ victim)', () => {
    const ks = juice().consume([died(3, 2, ME, 0, DeathCause.Burn), died(9, 3, ME, 0, DeathCause.Toxin)]).kills
    expect(ks.map((k) => k.rapid)).toEqual([1, 2])
    // 没有链的击杀各算一条「链」：两次不同的击杀照样是双杀。
    expect(ks[1].rapidLabel).toBe('双杀')
  })
})

describe('KillJuice · 不死连杀', () => {
  it('announces 大杀特杀 at 3, 主宰 at 5, 超神 at 8 kills without dying, however far apart', () => {
    const kills: [number, U64, U64][] = Array.from({ length: 9 }, (_, i) => [i * 400, 10 + i, ME])
    const ks = feedKills(juice(), kills)
    expect(ks.map((k) => k.spree)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(ks.map((k) => k.spreeLabel)).toEqual([null, null, '大杀特杀', null, '主宰', null, null, '超神', null])
    // 相隔 20 秒，没有一个 8 秒窗口连杀。
    expect(ks.every((k) => k.rapid === 1)).toBe(true)
  })

  it('resets the spree when the killer dies (any cause), not when someone else dies', () => {
    const j = juice()
    feedKills(j, [
      [0, 2, ME],
      [10, 3, ME],
    ])
    j.consume([died(20, 5, 6, 9)])
    expect(feedKills(j, [[30, 4, ME]])[0].spree).toBe(3)
    j.consume([died(40, ME, 0, 0, DeathCause.Poison)])
    const after = feedKills(j, [
      [50, 2, ME],
      [60, 3, ME],
      [70, 4, ME],
    ])
    expect(after.map((k) => k.spree)).toEqual([1, 2, 3])
    expect(after[2].spreeLabel).toBe('大杀特杀')
  })

  it('a kill landed on the same Tick the killer dies still counts, then the spree resets', () => {
    const j = juice()
    feedKills(j, [
      [0, 2, ME],
      [10, 3, ME],
    ])
    // 同 Tick：本人先被炸死的事件排在前面，本人的炸弹同 Tick 也炸死了别人。
    const mine = j.consume([died(20, ME, 5, 9), died(20, 4, ME, 8)]).kills.find((k) => k.killer === ME)
    expect(mine?.spree).toBe(3)
    expect(mine?.spreeLabel).toBe('大杀特杀')
    expect(feedKills(j, [[30, 6, ME]])[0].spree).toBe(1)
  })
})

describe('KillJuice · 击杀音音高', () => {
  it('climbs one step per kill inside the 8 s window, restarts after a gap, and is capped', () => {
    const ks = feedKills(juice(), [
      [0, 2, ME],
      [20, 3, ME],
      [40, 4, ME],
      [400, 5, ME],
      [420, 6, ME],
    ])
    expect(ks.map((k) => k.pitchStep)).toEqual([0, 1, 2, 0, 1])
    const many: [number, U64, U64][] = Array.from({ length: 20 }, (_, i) => [i * 10, 10 + i, ME])
    const capped = feedKills(juice(), many)
    expect(capped[capped.length - 1].pitchStep).toBe(KILL_JUICE.pitchMaxStep)
  })

  it('pitch ratio rises by the configured semitones per step', () => {
    expect(killPitchRatio(0)).toBe(1)
    expect(killPitchRatio(1)).toBeCloseTo(2 ** (KILL_JUICE.pitchSemitones / 12))
    expect(killPitchRatio(3)).toBeGreaterThan(killPitchRatio(2))
  })
})

describe('KillJuice · 首次 ×5 / ×8 连锁', () => {
  it('announces the first ×5 and the first ×8 chain that involves the local player, once per match', () => {
    const j = juice()
    const five = [exploded(5, 40, ME), exploded(5, 40, 2), exploded(5, 40, 3), exploded(5, 40, 4), exploded(5, 40, 5)]
    expect(j.consume(five).chainMilestones.map((m) => m.label)).toEqual(['首次 ×5 连锁！'])
    const again = [exploded(9, 41, ME), exploded(9, 41, ME), exploded(9, 41, 2), exploded(9, 41, 3), exploded(9, 41, 4), exploded(9, 41, 5)]
    expect(j.consume(again).chainMilestones).toEqual([])
    const eight = Array.from({ length: 8 }, (_, i) => exploded(12, 42, i === 0 ? ME : 2))
    expect(j.consume(eight).chainMilestones.map((m) => [m.bombs, m.label])).toEqual([[8, '首次 ×8 连锁！']])
  })

  it('grows a chain across batches and uses ChainResolved.BombCount when it is larger', () => {
    const j = juice()
    expect(j.consume([exploded(3, 50, ME), exploded(3, 50, 2), exploded(3, 50, 3)]).chainMilestones).toEqual([])
    expect(j.consume([exploded(4, 50, 4), exploded(4, 50, 5)]).chainMilestones.map((m) => m.bombs)).toEqual([5])
    const k = juice()
    expect(k.consume([exploded(3, 60, ME), resolved(3, 60, 6, [ME, 2])]).chainMilestones.map((m) => m.bombs)).toEqual([5])
  })

  it('a first chain that is already ×9 shows only the ×8 milestone and burns the ×5 one', () => {
    const j = juice()
    const nine = Array.from({ length: 9 }, (_, i) => exploded(7, 70, i < 2 ? ME : 3))
    expect(j.consume(nine).chainMilestones.map((m) => m.bombs)).toEqual([8])
    const five = Array.from({ length: 5 }, (_, i) => exploded(9, 71, i < 1 ? ME : 3))
    expect(j.consume(five).chainMilestones).toEqual([])
  })

  it('ignores chains without a local bomb and starts over on MatchStarted', () => {
    const j = juice()
    expect(j.consume(Array.from({ length: 6 }, () => exploded(3, 80, 2))).chainMilestones).toEqual([])
    j.consume(Array.from({ length: 5 }, (_, i) => exploded(4, 81, i ? 2 : ME)))
    j.consume([started(100, 2)])
    expect(j.consume(Array.from({ length: 5 }, (_, i) => exploded(104, 90, i ? 2 : ME))).chainMilestones.map((m) => m.bombs)).toEqual([5])
  })

  it('reset() clears windows, sprees and milestones', () => {
    const j = juice()
    feedKills(j, [
      [0, 2, ME],
      [10, 3, ME],
    ])
    j.reset()
    expect(feedKills(j, [[20, 4, ME]])[0]).toMatchObject({ rapid: 1, spree: 1, pitchStep: 0 })
  })
})

describe('finalKillOf · 整局最后一杀', () => {
  it('is the last real kill on the MatchEnded Tick', () => {
    expect(finalKillOf([died(30, 2, ME, 5), died(30, 3, 4, 6), ended(30)])).toEqual({ tick: 30, killer: 4, victim: 3 })
    expect(finalKillOf([died(30, 2, ME, 5)])).toBeNull()
  })

  it('is null when the match ended by poison / suicide / time-up, or the kill was earlier', () => {
    expect(finalKillOf([died(30, 2, 2, 0, DeathCause.Poison), ended(30)])).toBeNull()
    expect(finalKillOf([ended(30)])).toBeNull()
    expect(finalKillOf([died(29, 2, ME, 5), ended(30)])).toBeNull()
  })

  it('KillJuice.consume reports it too', () => {
    expect(juice().consume([died(30, 2, ME, 5), ended(30)]).finalKill).toEqual({ tick: 30, killer: ME, victim: 2 })
  })

  it('settle hold = slow-mo length in Ticks (0.6 s → 12 Ticks at 20 Hz)', () => {
    expect(KILL_JUICE.slowMoMs).toBe(600)
    expect(KILL_JUICE.slowMoScale).toBe(0.3)
    expect(settleHoldTicks(20)).toBe(12)
    expect(settleHoldTicks(30)).toBe(18)
  })
})

describe('KILL_JUICE defaults (design §3.1 / ADR 0043, 推断待验证)', () => {
  it('pins the numbers the design names', () => {
    expect(KILL_JUICE.rapidWindowMs).toBe(8000)
    expect(KILL_JUICE.spree.map((s) => [s.kills, s.label])).toEqual([
      [3, '大杀特杀'],
      [5, '主宰'],
      [8, '超神'],
    ])
    expect(KILL_JUICE.chainMilestones).toEqual([5, 8])
    expect(KILL_JUICE.hitstopMs).toBe(70)
    expect(KILL_JUICE.shake).toBe(0.15)
    expect(KILL_JUICE.bigDropHats).toBe(6)
  })
})
