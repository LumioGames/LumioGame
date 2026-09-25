import { describe, expect, it } from 'vitest'
import { BlockType, DeathCause, MatchPhase } from '../../contract'
import { ringRect } from '../final-circle'
import { addBomb, cell, evs, giveLevels, hats, makeWorld, player, put, run, setBrick, startCircle, step } from './helpers'
import type { World } from '../world'

/** design §4.2 / §12（ADR 0025）：决赛圈触发、安全圈分段、毒圈、出局、提前结束。 */

/** 在远离所有测试站位的格上摆 n 块积木（资源计数用）。 */
function bricks(w: World, n: number): number[] {
  const out: number[] = []
  for (let y = 1; y < w.size - 1 && out.length < n; y += 2)
    for (let x = 1; x < w.size - 1 && out.length < n; x += 2) {
      if (y < 13) continue
      setBrick(w, x, y, BlockType.积木)
      out.push(cell(w, x, y))
    }
  return out
}

describe('final circle trigger', () => {
  it('resource: fires on the tick the remaining bricks drop below 20% (after terrain commit) and pulls EndTick in', () => {
    // 资源触发只在软砖再生停止后生效（ADR 0026）：把局终放在「再生刚停、时间触发未到」的位置。
    const w = makeWorld()
    w.match.endTick = w.t + w.ticks.finalCircle + w.ticks.regenStopBeforeFinal - 20
    put(w, 1, 9, 9)
    put(w, 2, 11, 11)
    w.resourceInitial = 100
    const bs = bricks(w, 20)
    // 20 × 1000 = 100 × 200，不满足「<」。
    expect(evs(run(w, 3), 'FinalCircleStarted')).toHaveLength(0)
    const x = bs[0] % w.size
    const y = Math.floor(bs[0] / w.size)
    // 从正上方炸：只有这一块在十字里（左右是外圈 / 铁皮柱）。
    addBomb(w, 1, x, y - 1, 1, 1)
    const f = step(w)
    expect(evs(f, 'BrickDestroyed')).toHaveLength(1)
    const T = f.snapshot.Tick
    expect(evs(f, 'FinalCircleStarted')).toEqual([{ type: 'FinalCircleStarted', presentationOnly: true, Trigger: 'resource', EndTick: T + w.ticks.finalCircle, Tick: T }])
    expect(f.snapshot.BomberMatchState.Phase).toBe(MatchPhase.Endgame)
    expect(f.snapshot.BomberMatchState.EndTick).toBe(T + w.ticks.finalCircle)
    expect(f.snapshot.match.phaseEndTick).toBe(T + w.ticks.finalCircle)
    expect(f.snapshot.match).toMatchObject({ resourceInitial: 100, resourceRemaining: 19 })
    expect(f.snapshot.match.finalCircle).toMatchObject({ trigger: 'resource', startTick: T, endTick: T + w.ticks.finalCircle, ring: { Min: 1, Max: 17 }, stageIndex: -1, aliveCount: 2 })
  })

  it('resource: is ignored while soft-brick regen is still running', () => {
    const w = makeWorld()
    put(w, 1, 9, 9)
    put(w, 2, 11, 11)
    w.resourceInitial = 100
    bricks(w, 5)
    expect(evs(run(w, 5), 'FinalCircleStarted')).toHaveLength(0)
    expect(w.match.phase).toBe(MatchPhase.Running)
  })

  it('time: fires when ticks left until EndTick ≤ 90 s and keeps EndTick', () => {
    const w = makeWorld()
    put(w, 1, 9, 9)
    put(w, 2, 11, 11)
    const end = w.t + 2 + w.ticks.finalCircle
    w.match.endTick = end
    expect(evs(step(w), 'FinalCircleStarted')).toHaveLength(0)
    const f = step(w)
    expect(evs(f, 'FinalCircleStarted')).toMatchObject([{ Trigger: 'time', EndTick: end, Tick: end - w.ticks.finalCircle }])
    expect(w.match.endTick).toBe(end)
    // 固定时长走完即结算。
    const frames = run(w, w.ticks.finalCircle)
    const ended = evs(frames, 'MatchEnded')
    expect(ended).toEqual([{ type: 'MatchEnded', Tick: end }])
    expect(w.match.phase).toBe(MatchPhase.Settlement)
  })
})

describe('ring stages', () => {
  it('ring rect math: squares centred on (9, 9)', () => {
    expect(ringRect(19, 17)).toEqual({ min: 1, max: 17 })
    expect(ringRect(19, 13)).toEqual({ min: 3, max: 15 })
    expect(ringRect(19, 9)).toEqual({ min: 5, max: 13 })
    expect(ringRect(19, 7)).toEqual({ min: 6, max: 12 })
  })

  it('announces each stage ringPreview before it applies, then shrinks at T + atMs; a chest lands inside Next', () => {
    const w = makeWorld()
    put(w, 1, 9, 9)
    put(w, 2, 11, 11)
    w.match.endTick = w.t + 1 + w.ticks.finalCircle
    const frames = run(w, w.ticks.finalCircle + 1)
    const T = evs(frames, 'FinalCircleStarted')[0].Tick
    const ann = evs(frames, 'RingShrinkAnnounced')
    const shr = evs(frames, 'RingShrunk')
    const at = [200, 800, 1400]
    expect(ann.map((e) => [e.StageIndex, e.Tick - T, e.AtTick - T])).toEqual(at.map((a, i) => [i, a - w.ticks.ringPreview, a]))
    expect(ann.map((e) => e.Next)).toEqual([
      { Min: 3, Max: 15 },
      { Min: 5, Max: 13 },
      { Min: 6, Max: 12 },
    ])
    expect(shr.map((e) => [e.StageIndex, e.Tick - T, e.Ring.Min, e.Ring.Max])).toEqual([
      [0, 200, 3, 15],
      [1, 800, 5, 13],
      [2, 1400, 6, 12],
    ])
    const chests = evs(frames, 'ChestSpawned')
    expect(chests.map((c) => c.Tick)).toEqual(ann.map((a) => a.Tick))
    chests.forEach((c, i) => {
      const n = ann[i].Next
      expect(c.Cell.X >= n.Min && c.Cell.X <= n.Max && c.Cell.Y >= n.Min && c.Cell.Y <= n.Max).toBe(true)
    })
    // 预告期内快照带 nextRing / nextRingTick，生效后清空。
    const mid = frames.find((f) => f.snapshot.Tick === T + 700)!.snapshot.match.finalCircle!
    expect(mid).toMatchObject({ ring: { Min: 3, Max: 15 }, nextRing: { Min: 5, Max: 13 }, nextRingTick: T + 800, stageIndex: 0 })
    const after = frames.find((f) => f.snapshot.Tick === T + 900)!.snapshot.match.finalCircle!
    expect(after).toMatchObject({ ring: { Min: 5, Max: 13 }, nextRing: null, nextRingTick: 0, stageIndex: 1 })
  })

  it('stages that would apply at or after EndTick are skipped', () => {
    const w = makeWorld({ rules: { finalCircleMs: 30000 } })
    put(w, 1, 9, 9)
    put(w, 2, 11, 11)
    w.match.endTick = w.t + 1 + w.ticks.finalCircle
    const frames = run(w, w.ticks.finalCircle + 1)
    expect(evs(frames, 'RingShrinkAnnounced').map((e) => e.StageIndex)).toEqual([0])
    expect(evs(frames, 'RingShrunk').map((e) => e.StageIndex)).toEqual([0])
    expect(evs(frames, 'ChestSpawned')).toHaveLength(1)
    expect(evs(frames, 'MatchEnded')).toHaveLength(1)
  })
})

describe('poison', () => {
  it('outside the ring: −1 point every second since first outside, Cause 3, protection does not block, no hat minted', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 3, 11, 11)
    const v = put(w, 2, 1, 1)
    v.protectedUntilTick = w.t + 100_000
    giveLevels(w, 2, 1, 1, 0)
    startCircle(w)
    w.finalCircle!.ring = ringRect(w.size, 13)
    const first = w.t + 1
    const frames = []
    let died = false
    while (!died && w.t < first + 200) {
      const f = step(w)
      frames.push(f)
      died = evs(f, 'PlayerDied').length > 0
    }
    const dmg = evs(frames, 'DamageApplied')
    expect(dmg.map((d) => d.Tick - first + 1)).toEqual([20, 40, 60, 80, 100, 120])
    expect(dmg.every((d) => d.proto?.Cause === DeathCause.Poison && d.SourceBombNetEntityIdRaw === 0 && d.ChainId === 0 && d.VictimNetEntityIdRaw === 2)).toBe(true)
    expect(evs(frames, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 2, Cause: DeathCause.Poison, ChainId: 0 }])
    expect(evs(frames, 'PlayerDied')[0].proto?.HatsLost).toBe(2)
    const f = step(w)
    expect(evs(f, 'HatMinted')).toHaveLength(0)
    expect(evs(f, 'PickupSpawned').filter((e) => e.Source === 'death' && e.DroppedByNetEntityIdRaw === 2)).toHaveLength(2)
    expect(evs(f, 'PlayerEliminated')).toEqual([{ type: 'PlayerEliminated', presentationOnly: true, NetEntityIdRaw: 2, Rank: 3, Tick: f.snapshot.Tick }])
    expect(hats(w, 2)).toBe(0)
  })

  it('stepping back inside resets the poison timer', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 3, 11, 11)
    const v = put(w, 2, 1, 1)
    startCircle(w)
    w.finalCircle!.ring = ringRect(w.size, 13)
    expect(evs(run(w, 15), 'DamageApplied')).toHaveLength(0)
    put(w, 2, 3, 3)
    run(w, 5)
    expect(v.poisonTicks).toBe(0)
    put(w, 2, 1, 1)
    const frames = run(w, 20)
    const dmg = evs(frames, 'DamageApplied')
    expect(dmg).toHaveLength(1)
    expect(dmg[0].Tick).toBe(frames[19].snapshot.Tick)
  })
})

describe('elimination, respawn-once and early end', () => {
  it('a death after the trigger does not respawn: every power-up drops (0 hats), player is eliminated with Rank = alive after + 1', () => {
    const w = makeWorld({ players: 4 })
    put(w, 1, 9, 9)
    put(w, 3, 11, 11)
    put(w, 4, 13, 13)
    const v = put(w, 2, 7, 9)
    giveLevels(w, 2, 1, 1, 1)
    v.health = 2
    startCircle(w)
    addBomb(w, 1, 7, 11, 1)
    const fd = step(w)
    expect(evs(fd, 'PlayerDied')).toHaveLength(1)
    const f1 = step(w)
    expect(evs(f1, 'PlayerEliminated')).toMatchObject([{ NetEntityIdRaw: 2, Rank: 4 }])
    expect(evs(f1, 'HatMinted')).toHaveLength(0)
    expect(evs(f1, 'PowerupsDropped')).toMatchObject([{ VictimNetEntityIdRaw: 2, Cell: { X: 7, Y: 9 } }])
    expect(evs(f1, 'PowerupsDropped')[0].Kinds).toHaveLength(3)
    const pv = f1.snapshot.Players.find((p) => p.NetEntityIdRaw === 2)!
    expect(pv.eliminated).toBe(true)
    expect(pv.BomberPlayerState).toMatchObject({ HatCount: 0, RespawnAtTick: 0 })
    expect(f1.snapshot.match.finalCircle!.aliveCount).toBe(3)
    // 出局者不复活、不动、不放弹、不捡东西、不受伤。
    const later = run(w, w.ticks.respawn + 10, { 2: [{ ability: '放弹' }] })
    expect(evs(later, 'PlayerRespawned')).toHaveLength(0)
    expect(evs(later, 'BombPlaced')).toHaveLength(0)
    expect(evs(later, 'PickupTaken').filter((e) => e.PickerNetEntityIdRaw === 2)).toHaveLength(0)
    expect(v.eliminated).toBe(true)
    expect(v.health).toBe(0)
    expect(hats(w, 2)).toBe(0)
    expect(w.match.phase).toBe(MatchPhase.Endgame)
  })

  it('a player already counting down when the circle starts respawns once inside the ring, then is eliminated on the next death', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 3, 11, 11)
    const v = put(w, 2, 1, 1)
    v.health = 2
    // 击杀发生在 t0+1，决赛圈在 t0+2 触发。
    w.match.endTick = w.t + 2 + w.ticks.finalCircle
    addBomb(w, 1, 3, 1, 1)
    const fd = step(w)
    const died = evs(fd, 'PlayerDied')[0]
    const fs = step(w)
    expect(evs(fs, 'FinalCircleStarted')).toHaveLength(1)
    expect(died.Tick).toBeLessThan(fs.snapshot.Tick)
    expect(v.awaitingRespawn).toBe(true)
    w.finalCircle!.ring = ringRect(w.size, 7)
    let resp = evs(fs, 'PlayerRespawned')
    while (resp.length === 0 && w.t < died.Tick + w.ticks.respawn + 5) resp = evs(step(w), 'PlayerRespawned')
    expect(resp).toHaveLength(1)
    expect(resp[0].Tick).toBe(died.Tick + w.ticks.respawn)
    expect(resp[0].Cell.X).toBeGreaterThanOrEqual(6)
    expect(resp[0].Cell.X).toBeLessThanOrEqual(12)
    expect(resp[0].Cell.Y).toBeGreaterThanOrEqual(6)
    expect(resp[0].Cell.Y).toBeLessThanOrEqual(12)
    expect(v.eliminated).toBe(false)
    // 第二次死亡即出局。
    v.health = 1
    v.protectedUntilTick = 0
    w.finalCircle!.ring = { min: 1, max: 1 }
    const frames = run(w, 25)
    expect(evs(frames, 'PlayerEliminated')).toMatchObject([{ NetEntityIdRaw: 2, Rank: 3 }])
    expect(evs(run(w, w.ticks.respawn + 5), 'PlayerRespawned')).toHaveLength(0)
  })

  it('ends early when at most one non-eliminated player is left; simultaneous eliminations share a rank', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 2, 7, 9).health = 2
    put(w, 3, 11, 9).health = 2
    startCircle(w)
    addBomb(w, 1, 9, 9, 1, 2)
    const fd = step(w)
    expect(evs(fd, 'PlayerDied')).toHaveLength(2)
    // 本 Tick 已发布的死亡在进入结算前结清：同 Tick 出局、同 Tick 结束。
    expect(evs(fd, 'MatchEnded')).toHaveLength(0)
    const f = step(w)
    expect(evs(f, 'PlayerEliminated').map((e) => [e.NetEntityIdRaw, e.Rank])).toEqual([
      [2, 2],
      [3, 2],
    ])
    expect(evs(f, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: f.snapshot.Tick }])
    expect(f.snapshot.BomberMatchState).toMatchObject({ Phase: MatchPhase.Settlement, EndTick: f.snapshot.Tick })
    expect(f.snapshot.match.phaseEndTick).toBe(f.snapshot.Tick + w.ticks.settlement)
    // 击杀不铸帽；两个死者没有强化可掉。
    expect(hats(w, 1)).toBe(0)
    expect(evs(f, 'HatMinted')).toHaveLength(0)
    // 结算期冻结：settlementMs 后自动下一局。
    const rest = run(w, w.ticks.settlement)
    expect(evs(rest, 'MatchStarted')).toHaveLength(1)
    expect(w.players.every((p) => !p.eliminated)).toBe(true)
    expect(w.finalCircle).toBeNull()
  })

  it('solo (one player) does not end early just because the only player is alive', () => {
    const w = makeWorld({ players: 1 })
    put(w, 1, 9, 9)
    startCircle(w)
    expect(evs(run(w, 100), 'MatchEnded')).toHaveLength(0)
    expect(w.match.phase).toBe(MatchPhase.Endgame)
  })
})
