import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, MatchPhase, type BomberEvent, type TickFrame } from '../src/contract'
import { LocalHost } from '../src/app/local-host'

/**
 * 整局联调：规则替身 + 7 个 Bot 走完整条宿主路径（与浏览器里完全相同的 LocalHost），
 * 只是时间由测试推进。验证「能连轴转、帽子守恒、Bot 真的在打」。
 */
const TICK_MS = 1000 / DEFAULT_CONFIG.tickRateHz

function runHost(seed: number, seconds: number, matchSec: number) {
  const config = { ...DEFAULT_CONFIG, matchDurationMs: matchSec * 1000 }
  const host = new LocalHost({ seed, config, rules: DEFAULT_RULES, botCount: 7 })
  const frames: TickFrame[] = []
  host.subscribe((f) => frames.push(f))
  let now = 0
  host.pump(now)
  const ticks = Math.round((seconds * 1000) / TICK_MS)
  for (let i = 0; i < ticks; i++) {
    now += TICK_MS
    host.pump(now)
  }
  return { host, frames }
}


describe('LocalHost + bots, full matches', () => {
  it('runs two 150 s matches back to back (60 s normal + 90 s final circle); hats track power-ups; real fights', () => {
    const { frames } = runHost(20260925, 3 + 150 + 16 + 3 + 150 + 5, 150)
    const events: BomberEvent[] = frames.flatMap((f) => f.events)

    // ADR 0028：帽子 = 强化数，没有帽堆；死者在死亡系统那一 Tick（下一帧）帽数恰好少 HatsLost，出局者归零。
    let matchStarts = 0
    const pending = new Map<number, { before: number; lost: number }>()
    let prev: TickFrame | null = null
    for (const f of frames) {
      expect(f.snapshot.HatPiles).toHaveLength(0)
      for (const [id, want] of pending) {
        const p = f.snapshot.Players.find((x) => x.NetEntityIdRaw === id)
        if (!p) continue
        if (p.eliminated) expect(p.BomberPlayerState.HatCount).toBe(0)
        else expect(p.BomberPlayerState.HatCount).toBe(want.before - want.lost)
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
    void prev

    const placed = events.filter((e) => e.type === 'BombPlaced')
    const deaths = events.filter((e) => e.type === 'PlayerDied')
    const bricks = events.filter((e) => e.type === 'BrickDestroyed')
    const selfBombDeaths = deaths.filter((e) => e.type === 'PlayerDied' && e.KillerNetEntityIdRaw === e.VictimNetEntityIdRaw && e.Cause === 0)

    expect(matchStarts).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.type === 'MatchEnded')).toBe(true)
    expect(placed.length).toBeGreaterThan(40)
    expect(bricks.length).toBeGreaterThan(20)
    expect(deaths.length).toBeGreaterThan(0)
    // Bot 不该主要死于自己的炸弹（放弹前逃生自检）。
    expect(selfBombDeaths.length).toBeLessThanOrEqual(Math.max(2, deaths.length * 0.4))

    // 每个死亡、未出局的玩家都在重生窗口内复活（决赛圈内死亡即出局，不再复活）。
    const last = frames[frames.length - 1].snapshot
    for (const p of last.Players) {
      if (p.玩家属性.血量当前 <= 0 && !p.eliminated) {
        expect(p.BomberPlayerState.RespawnAtTick).toBeGreaterThan(0)
        expect(p.BomberPlayerState.RespawnAtTick - last.Tick).toBeLessThanOrEqual(msTicks(DEFAULT_CONFIG.respawnMs) + 1)
      }
    }

    const phases = new Set(frames.map((f) => f.snapshot.BomberMatchState.Phase))
    expect(phases.has(MatchPhase.Running)).toBe(true)
    expect(phases.has(MatchPhase.Endgame)).toBe(true)
    expect(phases.has(MatchPhase.Settlement)).toBe(true)
    // 决赛圈（ADR 0025）：开始事件、安全圈收缩、出局者不再复活。
    expect(events.some((e) => e.type === 'FinalCircleStarted')).toBe(true)
    expect(events.some((e) => e.type === 'RingShrunk')).toBe(true)
    const eliminated = new Set(events.filter((e) => e.type === 'PlayerEliminated').map((e) => (e.type === 'PlayerEliminated' ? e.NetEntityIdRaw : 0)))
    for (const f of frames) {
      for (const e of f.events) {
        if (e.type === 'PlayerRespawned' && eliminated.has(e.NetEntityIdRaw) && f.snapshot.BomberMatchState.Phase === MatchPhase.Endgame) {
          const p = f.snapshot.Players.find((x) => x.NetEntityIdRaw === e.NetEntityIdRaw)
          expect(p?.eliminated).toBe(false)
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[metrics] bombs=${placed.length} bricks=${bricks.length} deaths=${deaths.length} selfBombDeaths=${selfBombDeaths.length} ` +
        `kills=${deaths.length - deaths.filter((e) => e.type === 'PlayerDied' && e.KillerNetEntityIdRaw === e.VictimNetEntityIdRaw).length}`,
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

function msTicks(ms: number): number {
  return Math.ceil((ms * DEFAULT_CONFIG.tickRateHz) / 1000)
}
