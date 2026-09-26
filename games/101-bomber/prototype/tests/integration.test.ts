import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  isPowerupKind,
  MatchPhase,
  protoConfig,
  type BomberEvent,
  type MatchEnded,
  type TickFrame,
  type U64,
} from '../src/contract'
import { LocalHost } from '../src/app/local-host'
import { destructibleInside, finalCellBlocker, gridOfSnapshot } from './support/final-cell'

/**
 * 整局联调：规则替身 + 7 个 Bot 走完整条宿主路径（与浏览器里完全相同的 LocalHost：缺省 normal 难度、
 * 本机棉花兔、Bot 每局均衡选角，ADR 0030 / design §15 Bot 难度分档（原型工具）），只是时间由测试推进。
 * 验证「能连轴转、帽子守恒、Bot 真的在打、决赛圈能打出结果」。
 */
const RULES = DEFAULT_RULES
const TICK_MS = 1000 / protoConfig(RULES).tickRateHz

function runHost(seed: number, seconds: number, matchSec: number) {
  const config = protoConfig(RULES, { matchDurationMs: matchSec * 1000 })
  const host = new LocalHost({ seed, config, rules: RULES, botCount: 7 })
  const frames: TickFrame[] = []
  host.subscribe((f) => frames.push(f))
  let now = 0
  host.pump(now)
  const ticks = Math.round((seconds * 1000) / TICK_MS)
  for (let i = 0; i < ticks; i++) {
    now += TICK_MS
    host.pump(now)
  }
  return { host, frames, config }
}

describe('LocalHost + bots, full matches', () => {
  it('runs two 150 s matches back to back (35 s normal + 115 s final circle); hats track power-ups; real fights; results are consistent', () => {
    // 150 s 局 = 常规 35 s + 决赛圈 115 s（ADR 0031）；局终可以提前（只剩 1 人），所以窗口至少装得下两整局。
    const { frames, config } = runHost(20260925, 3 + 150 + 16 + 3 + 150 + 5, 150)
    const events: BomberEvent[] = frames.flatMap((f) => f.events)

    // ADR 0028：帽子 = 强化数，没有帽堆。
    // 1) 死者在死亡系统那一 Tick（下一帧）帽数恰好少 HatsLost，出局者归零；
    // 2) 其余玩家逐帧的帽数变化 = 本帧拾取的强化数（isPowerupKind；技能糖与血包不是帽子，ADR 0030 D5）。
    let matchStarts = 0
    let powerupsTaken = 0
    let candiesTaken = 0
    const pending = new Map<number, { before: number; lost: number }>()
    let prev: TickFrame | null = null
    for (const f of frames) {
      expect(f.snapshot.HatPiles).toHaveLength(0)
      const reset = f.events.some((e) => e.type === 'MatchStarted') || (prev !== null && prev.snapshot.match.matchIndex !== f.snapshot.match.matchIndex)
      for (const [id, want] of pending) {
        const p = f.snapshot.Players.find((x) => x.NetEntityIdRaw === id)
        if (!p || reset) continue
        if (p.eliminated) expect(p.BomberPlayerState.HatCount).toBe(0)
        else expect(p.BomberPlayerState.HatCount).toBe(want.before - want.lost)
      }
      const gained = new Map<U64, number>()
      const died = new Set<U64>()
      for (const e of f.events) {
        if (e.type === 'PickupTaken') {
          if (isPowerupKind(e.Kind)) {
            powerupsTaken++
            gained.set(e.PickerNetEntityIdRaw, (gained.get(e.PickerNetEntityIdRaw) ?? 0) + 1)
          } else if (e.proto?.Skill) candiesTaken++
        }
        if (e.type === 'PlayerDied') died.add(e.VictimNetEntityIdRaw)
      }
      if (prev && !reset) {
        for (const p of f.snapshot.Players) {
          if (pending.has(p.NetEntityIdRaw) || died.has(p.NetEntityIdRaw)) continue
          const q = prev.snapshot.Players.find((x) => x.NetEntityIdRaw === p.NetEntityIdRaw)
          if (!q) continue
          expect(p.BomberPlayerState.HatCount - q.BomberPlayerState.HatCount, `hats of ${p.NetEntityIdRaw} at tick ${f.snapshot.Tick}`).toBe(
            gained.get(p.NetEntityIdRaw) ?? 0,
          )
        }
      }
      pending.clear()
      for (const e of f.events) {
        if (e.type === 'MatchStarted') matchStarts++
        if (e.type === 'PlayerDied' && f.snapshot.BomberMatchState.Phase !== MatchPhase.Settlement) {
          const p = f.snapshot.Players.find((x) => x.NetEntityIdRaw === e.VictimNetEntityIdRaw)
          if (p) pending.set(p.NetEntityIdRaw, { before: p.BomberPlayerState.HatCount, lost: e.proto?.HatsLost ?? 0 })
        }
      }
      for (const p of f.snapshot.Players) expect(p.BomberPlayerState.HatCount).toBeGreaterThanOrEqual(0)
      prev = f
    }

    const placed = events.filter((e) => e.type === 'BombPlaced')
    const deaths = events.filter((e) => e.type === 'PlayerDied')
    const bricks = events.filter((e) => e.type === 'BrickDestroyed')
    const selfBombDeaths = deaths.filter((e) => e.type === 'PlayerDied' && e.KillerNetEntityIdRaw === e.VictimNetEntityIdRaw && e.Cause === 0)
    const kills = deaths.filter((e) => e.type === 'PlayerDied' && e.KillerNetEntityIdRaw !== e.VictimNetEntityIdRaw).length
    const skillCasts = events.filter((e) => e.type === 'SkillActivated').length
    const ends = events.filter((e): e is MatchEnded => e.type === 'MatchEnded')

    // 两整局连轴转：两次开局、两次局终（局终只会比 150 s 早，不会晚）。
    expect(matchStarts).toBeGreaterThanOrEqual(2)
    expect(ends.length).toBeGreaterThanOrEqual(2)
    // Bot 真的在打（阈值同第 3 轮；normal 档 + 角色后实测见 [metrics]）。
    expect(placed.length).toBeGreaterThan(40)
    expect(bricks.length).toBeGreaterThan(20)
    expect(deaths.length).toBeGreaterThan(0)
    expect(kills).toBeGreaterThan(0)
    expect(powerupsTaken).toBeGreaterThan(0)
    // 第 4 轮：角色开局即带专属技能，Bot 会放主动技能（design §15：三档都会用技能）。
    expect(skillCasts).toBeGreaterThan(0)
    // Bot 不该主要死于自己的炸弹（放弹前逃生自检）。
    expect(selfBombDeaths.length).toBeLessThanOrEqual(Math.max(2, deaths.length * 0.4))

    // 每个死亡、未出局的玩家都在重生窗口内复活（决赛圈内死亡即出局，不再复活）。
    const last = frames[frames.length - 1].snapshot
    for (const p of last.Players) {
      if (p.玩家属性.血量当前 <= 0 && !p.eliminated) {
        expect(p.BomberPlayerState.RespawnAtTick).toBeGreaterThan(0)
        expect(p.BomberPlayerState.RespawnAtTick - last.Tick).toBeLessThanOrEqual(msTicks(config.respawnMs, config.tickRateHz) + 1)
      }
    }

    const phases = new Set(frames.map((f) => f.snapshot.BomberMatchState.Phase))
    expect(phases.has(MatchPhase.Running)).toBe(true)
    expect(phases.has(MatchPhase.Endgame)).toBe(true)
    expect(phases.has(MatchPhase.Settlement)).toBe(true)
    // 决赛圈（ADR 0025 / 0031）：开始事件、安全圈收缩、出局者不再复活。
    expect(events.some((e) => e.type === 'FinalCircleStarted')).toBe(true)
    expect(events.some((e) => e.type === 'RingShrunk')).toBe(true)
    const eliminatedIds = new Set<U64>()
    for (const f of frames) {
      for (const e of f.events) {
        if (e.type === 'MatchStarted') eliminatedIds.clear()
        if (e.type === 'PlayerEliminated') eliminatedIds.add(e.NetEntityIdRaw)
        if (e.type === 'PlayerRespawned' && f.snapshot.BomberMatchState.Phase === MatchPhase.Endgame) {
          expect(eliminatedIds.has(e.NetEntityIdRaw)).toBe(false)
        }
        // 末三段清场（ADR 0031，design §4.2）：生效帧新圈内没有积木 / 木箱，1×1 中心进得去。
        if (e.type === 'RingShrunk' && RULES.ringStages[e.StageIndex]?.clearInside) {
          const g = gridOfSnapshot(f.snapshot)
          expect(destructibleInside(g, e.Ring)).toEqual([])
          expect(finalCellBlocker(g)).toBeNull()
        }
      }
    }

    // 每次局终（ADR 0031）：MatchEnded.proto 与 Settlement 发布的 match.results 一致，原因与存活人数一致。
    const endLines: string[] = []
    for (const end of ends) {
      const at = frames.findIndex((f) => f.events.includes(end))
      const settle = frames.slice(at).find((f) => f.snapshot.BomberMatchState.Phase === MatchPhase.Settlement)?.snapshot
      const res = settle?.match.results
      expect(res).toBeTruthy()
      if (!settle || !res) continue
      expect(end.proto).toEqual({ Reason: res.reason, WinnerNetEntityIdRaw: res.winner })
      const survivors = settle.Players.filter((p) => !p.eliminated).length
      expect(res.rows.filter((r) => r.survived)).toHaveLength(survivors)
      expect(res.reason).toBe(survivors === 0 ? 'allDown' : survivors === 1 ? 'lastSurvivor' : 'timeUp')
      expect(res.winner).toBe(res.rows[0].id)
      expect(res.rows).toHaveLength(settle.Players.length)
      const fc = frames[at].snapshot.match.finalCircle
      if (res.reason === 'timeUp') expect(end.Tick).toBe(fc?.endTick)
      else expect(end.Tick).toBeLessThanOrEqual(fc?.endTick ?? Infinity)
      endLines.push(`${res.reason}@${end.Tick}(survivors=${survivors})`)
    }

    // eslint-disable-next-line no-console
    console.log(
      `[metrics] bombs=${placed.length} bricks=${bricks.length} deaths=${deaths.length} selfBombDeaths=${selfBombDeaths.length} kills=${kills} ` +
        `powerups=${powerupsTaken} candies=${candiesTaken} skillCasts=${skillCasts} ends=${endLines.join(' ')}`,
    )
  })

  it('is deterministic: same seed → same state hash, different seed → different', () => {
    const a = runHost(7, 40, 120)
    const b = runHost(7, 40, 120)
    const c = runHost(8, 40, 120)
    expect(a.host.stateHash()).toBe(b.host.stateHash())
    expect(a.host.stateHash()).not.toBe(c.host.stateHash())
  })
})

function msTicks(ms: number, rateHz: number): number {
  return Math.ceil((ms * rateHz) / 1000)
}
