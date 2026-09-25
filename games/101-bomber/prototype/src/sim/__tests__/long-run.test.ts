import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES, isPowerupKind, MatchPhase } from '../../contract'
import { createWorld } from '../match-phase'
import { stepWorld } from '../step'
import { playerCell } from '../world'
import { hatCountOf } from '../death-drops'
import { evs, specs, Walker } from './helpers'

/**
 * 设计 §7 第 13 项（矩阵 7.4 / 7.5 精神）+ ADR 0025 / 0028：8 人随机游走连跑多局，每局都经过决赛圈与结算进入下一局，
 * 决赛圈前的死者按时复活、决赛圈内的死者出局且不再动。帽数 = 强化数：逐帧帽数变化只来自拾取强化（+1）与死亡掉落，
 * 「死亡扣掉的级数 == Σ HatsLost == 落地的死亡掉落 + 因没格子作废的」，且永远不出帽堆。
 */
describe('headless multi-match run', () => {
  it('reaches Endgame and Settlement repeatedly with conservation, timely respawns and eliminations', () => {
    const w = createWorld({ seed: 2026, config: DEFAULT_CONFIG, rules: DEFAULT_RULES, players: specs(8) })
    // 构造时的 MatchStarted 属于第 0 帧（LocalSim 在构造里发布），这里直接驱动 World，先清掉。
    w.out = []
    const walker = new Walker(77, 0.05)
    const ids = w.players.map((p) => p.id)
    const MATCHES = 3
    const perMatch = w.ticks.warmup + w.ticks.match + w.ticks.settlement + 1
    const diedAt = new Map<number, number>()
    let fcStart = -1
    let fcCount = 0
    let deaths = 0
    let respawns = 0
    let eliminations = 0
    let ended = 0
    let started = 0
    let endTick = Infinity
    let stepMs = 0
    let ticks = 0
    // 帽子账（ADR 0028）。
    const prevHats = new Map<number, number>(w.players.map((p) => [p.id, 0]))
    let removedOnDeath = 0
    let hatsLostDeclared = 0
    let deathPickups = 0
    let lostNoCell = 0
    let powerupPickups = 0
    let maxHats = 0
    while (started < MATCHES && ticks < perMatch * MATCHES + 100) {
      const t0 = performance.now()
      const f = stepWorld(w, walker.inputs(ids))
      stepMs += performance.now() - t0
      ticks++
      const t = f.snapshot.Tick
      expect(f.snapshot.HatPiles).toEqual([])
      for (const ty of ['HatMinted', 'HatPileSpawned', 'HatPilePicked', 'HatPileExpired'] as const) expect(evs(f, ty)).toHaveLength(0)
      for (const e of evs(f, 'PlayerDied')) hatsLostDeclared += e.proto!.HatsLost
      const spawnedBy = new Map<number, number>()
      // 技能糖不算帽子（D5）：只数死者掉出的强化。
      for (const e of evs(f, 'PickupSpawned'))
        if (e.Source === 'death' && isPowerupKind(e.Kind)) {
          deathPickups++
          spawnedBy.set(e.DroppedByNetEntityIdRaw, (spawnedBy.get(e.DroppedByNetEntityIdRaw) ?? 0) + 1)
        }
      for (const e of evs(f, 'PowerupsDropped')) expect(spawnedBy.get(e.VictimNetEntityIdRaw)).toBe(e.Kinds.length)
      const gained = new Map<number, number>()
      for (const e of evs(f, 'PickupTaken'))
        if (isPowerupKind(e.Kind)) {
          powerupPickups++
          gained.set(e.PickerNetEntityIdRaw, (gained.get(e.PickerNetEntityIdRaw) ?? 0) + 1)
        }
      const restarted = evs(f, 'MatchStarted').length > 0
      let removedNow = 0
      for (const p of f.snapshot.Players) {
        const h = p.BomberPlayerState.HatCount
        expect(h).toBe(hatCountOf(w, w.players.find((q) => q.id === p.NetEntityIdRaw)!))
        maxHats = Math.max(maxHats, h)
        if (!restarted) {
          const removed = (prevHats.get(p.NetEntityIdRaw) ?? 0) + (gained.get(p.NetEntityIdRaw) ?? 0) - h
          expect(removed).toBeGreaterThanOrEqual(0)
          removedNow += removed
          // 只有死亡掉落能让帽数下降。
          if (removed > 0) expect(evs(f, 'PowerupsDropped').some((e) => e.VictimNetEntityIdRaw === p.NetEntityIdRaw) || p.BomberPlayerState.RespawnAtTick > 0 || p.eliminated).toBe(true)
        } else expect(h).toBe(0)
        prevHats.set(p.NetEntityIdRaw, h)
      }
      removedOnDeath += removedNow
      if (!restarted) {
        let spawnedNow = 0
        for (const e of evs(f, 'PickupSpawned')) if (e.Source === 'death' && isPowerupKind(e.Kind)) spawnedNow++
        expect(removedNow).toBeGreaterThanOrEqual(spawnedNow)
        lostNoCell += removedNow - spawnedNow
      }
      for (const e of evs(f, 'FinalCircleStarted')) {
        fcStart = e.Tick
        fcCount++
        expect(e.EndTick).toBeLessThanOrEqual(e.Tick + w.ticks.finalCircle)
        expect(f.snapshot.BomberMatchState.Phase === MatchPhase.Endgame || evs(f, 'MatchEnded').length === 1).toBe(true)
      }
      for (const e of evs(f, 'PlayerDied')) {
        diedAt.set(e.VictimNetEntityIdRaw, t)
        deaths++
      }
      for (const e of evs(f, 'PlayerRespawned')) {
        const d = diedAt.get(e.NetEntityIdRaw) ?? -1
        expect(fcStart < 0 || d < fcStart).toBe(true)
        expect(e.Tick).toBe(d + w.ticks.respawn)
        if (fcStart >= 0) {
          const fc = f.snapshot.match.finalCircle!
          expect(e.Cell.X).toBeGreaterThanOrEqual(fc.ring.Min)
          expect(e.Cell.X).toBeLessThanOrEqual(fc.ring.Max)
          expect(e.Cell.Y).toBeGreaterThanOrEqual(fc.ring.Min)
          expect(e.Cell.Y).toBeLessThanOrEqual(fc.ring.Max)
        }
        diedAt.delete(e.NetEntityIdRaw)
        respawns++
      }
      for (const e of evs(f, 'PlayerEliminated')) {
        expect(fcStart).toBeGreaterThanOrEqual(0)
        expect((diedAt.get(e.NetEntityIdRaw) ?? -1) >= fcStart).toBe(true)
        diedAt.delete(e.NetEntityIdRaw)
        eliminations++
      }
      if (evs(f, 'MatchEnded').length) {
        ended++
        endTick = t
        expect(fcStart).toBeGreaterThanOrEqual(0)
        expect(t - fcStart).toBeLessThanOrEqual(w.ticks.finalCircle)
        const alive = f.snapshot.Players.filter((p) => !p.eliminated).length
        if (t - fcStart < w.ticks.finalCircle) expect(alive).toBeLessThanOrEqual(1)
      }
      if (evs(f, 'MatchStarted').length) {
        started++
        expect(t).toBe(endTick + w.ticks.settlement)
        diedAt.clear()
        fcStart = -1
        endTick = Infinity
        expect(w.players.every((p) => !p.eliminated && hatCountOf(w, p) === 0)).toBe(true)
        expect(w.chests).toHaveLength(0)
      }
      // 结算前死的人（决赛圈前）必须在 respawn Tick 数内回来。
      for (const d of diedAt.values()) if (t < endTick && (fcStart < 0 || d < fcStart)) expect(t - d).toBeLessThanOrEqual(w.ticks.respawn)
      const chestCells = new Set(w.chests.map((c) => c.cell))
      for (const p of w.players) {
        expect(p.health).toBeGreaterThanOrEqual(0)
        expect(p.health).toBeLessThanOrEqual(w.cfg.maxHealthPoints)
        expect((p.mx - 500) % 1000 === 0 || (p.my - 500) % 1000 === 0).toBe(true)
        if (p.eliminated) {
          expect(p.health).toBe(0)
          expect(hatCountOf(w, p)).toBe(0)
          expect(p.awaitingRespawn).toBe(false)
        } else if (p.health > 0) expect(chestCells.has(playerCell(w, p))).toBe(false)
      }
    }
    expect(started).toBe(MATCHES)
    expect(ended).toBe(MATCHES)
    expect(fcCount).toBe(MATCHES)
    expect(w.match.index).toBe(MATCHES)
    expect(w.match.phase).toBe(MatchPhase.Warmup)
    expect(deaths).toBeGreaterThan(30)
    expect(respawns).toBeGreaterThan(10)
    expect(eliminations).toBeGreaterThan(3)
    expect(stepMs / ticks).toBeLessThan(2)
    // Σ 死亡扣掉的级数 == Σ HatsLost == Σ 落地的死亡掉落 + Σ 没格子作废的。
    expect(removedOnDeath).toBe(hatsLostDeclared)
    expect(removedOnDeath).toBe(deathPickups + lostNoCell)
    expect(removedOnDeath).toBeGreaterThan(0)
    expect(lostNoCell).toBeLessThanOrEqual(Math.ceil(removedOnDeath * 0.1))
    expect(powerupPickups).toBeGreaterThan(removedOnDeath / 2)
    expect(maxHats).toBeGreaterThan(0)
  })
})
