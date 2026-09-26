import { describe, expect, it } from 'vitest'
import { BlockType, DeathCause, MatchPhase, protoConfig, type ProtoRules, type TickFrame } from '../../contract'
import { finalCircleTrigger, inRect, regenActive, ringRect, spawnChest } from '../final-circle'
import { survivorsAfterPending } from '../match-phase'
import { addBomb, cell, evs, giveLevels, hats, makeWorld, player, put, run, setBrick, startCircle, step } from './helpers'
import { newId, type SimChest, type World } from '../world'
import { removePlayerFromWorld } from '../hats'

/** design §4.2 / §12（ADR 0025 / 0031）：决赛圈触发、6 段安全圈、宝箱避让、清场、分段毒圈、出局、当 Tick 结束与名次。 */

/** 宝箱不喷战利品：站在中心的测试玩家不会捡到强化，帽数 / 名次保持摆好的样子。 */
const QUIET: Partial<ProtoRules> = { chestLoot: [], chestSkillCandies: 0 }

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

/** 直接摆一个满血宝箱（绕过预告落箱）。 */
function plantChest(w: World, x: number, y: number): SimChest {
  const hits = w.rules.chestHitsRequired
  const ch: SimChest = { id: newId(w), cell: cell(w, x, y), hitsRequired: hits, stageIndex: 0, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 }
  w.chests.push(ch)
  return ch
}

/** 一直 step 到 pred 命中的那一帧（含），返回途经的全部帧。 */
function runUntil(w: World, pred: (f: TickFrame) => boolean, limit = 5000): TickFrame[] {
  const out: TickFrame[] = []
  for (let i = 0; i < limit; i++) {
    const f = step(w)
    out.push(f)
    if (pred(f)) return out
  }
  throw new Error('runUntil: limit reached')
}

const shrunk = (i: number) => (f: TickFrame) => evs(f, 'RingShrunk').some((e) => e.StageIndex === i)

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

  it('time: fires when ticks left until EndTick ≤ 115 s and keeps EndTick; two stacked survivors end on time', () => {
    const w = makeWorld({ rules: QUIET })
    // 两人都站在最终 1×1 上：整个决赛圈都不中毒。
    put(w, 1, 9, 9)
    put(w, 2, 9, 9)
    const end = w.t + 2 + w.ticks.finalCircle
    w.match.endTick = end
    expect(evs(step(w), 'FinalCircleStarted')).toHaveLength(0)
    const f = step(w)
    expect(evs(f, 'FinalCircleStarted')).toMatchObject([{ Trigger: 'time', EndTick: end, Tick: end - w.ticks.finalCircle }])
    expect(w.match.endTick).toBe(end)
    // 固定时长走完即结算。
    const frames = run(w, w.ticks.finalCircle)
    const ended = evs(frames, 'MatchEnded')
    expect(ended).toEqual([{ type: 'MatchEnded', Tick: end, proto: { Reason: 'timeUp', WinnerNetEntityIdRaw: 1 } }])
    expect(w.match.phase).toBe(MatchPhase.Settlement)
  })

  it('7-minute defaults via protoConfig(): 8400-tick match, 2300-tick circle, regen stops at 4:05, time trigger at 5:05', () => {
    const w = makeWorld({ cfg: protoConfig() })
    expect(w.ticks.match).toBe(8400)
    expect(w.ticks.finalCircle).toBe(2300)
    expect(w.ticks.ringStages.map((s) => s.at)).toEqual([200, 700, 1100, 1500, 1900, 2200])
    const s = w.t
    w.match.startTick = s
    w.match.endTick = s + w.ticks.match
    w.t = s + 4899
    expect(regenActive(w)).toBe(true)
    w.t = s + 4900
    expect(regenActive(w)).toBe(false)
    w.t = s + 6099
    expect(finalCircleTrigger(w)).toBeNull()
    w.t = s + 6100
    expect(finalCircleTrigger(w)).toBe('time')
  })

  it('a match ≤ 115 s is final circle from its first Running tick; stages that cannot take effect are skipped', () => {
    const w = makeWorld({ cfg: { matchDurationMs: 60000 }, running: false, rules: QUIET })
    put(w, 1, 9, 9)
    put(w, 2, 9, 9)
    const start = w.match.startTick
    const frames = runUntil(w, (f) => evs(f, 'MatchEnded').length > 0)
    expect(evs(frames, 'FinalCircleStarted')).toMatchObject([{ Trigger: 'time', Tick: start, EndTick: start + 1200 }])
    expect(evs(frames, 'RingShrinkAnnounced').map((e) => e.StageIndex)).toEqual([0, 1, 2])
    expect(evs(frames, 'RingShrunk').map((e) => e.StageIndex)).toEqual([0, 1, 2])
    expect(evs(frames, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: start + 1200, proto: { Reason: 'timeUp', WinnerNetEntityIdRaw: 1 } }])
  })
})

describe('ring stages', () => {
  it('ring rect math: squares centred on (9, 9), down to the single centre cell', () => {
    expect(ringRect(19, 17)).toEqual({ min: 1, max: 17 })
    expect(ringRect(19, 13)).toEqual({ min: 3, max: 15 })
    expect(ringRect(19, 9)).toEqual({ min: 5, max: 13 })
    expect(ringRect(19, 7)).toEqual({ min: 6, max: 12 })
    expect(ringRect(19, 5)).toEqual({ min: 7, max: 11 })
    expect(ringRect(19, 3)).toEqual({ min: 8, max: 10 })
    expect(ringRect(19, 1)).toEqual({ min: 9, max: 9 })
  })

  it('announces 6 stages ringPreview before each applies; 5 chests (none for the 1×1); two stacked survivors time out and share rank 1', () => {
    const w = makeWorld({ rules: QUIET })
    put(w, 1, 9, 9)
    put(w, 2, 9, 9)
    w.match.endTick = w.t + 1 + w.ticks.finalCircle
    const frames = run(w, w.ticks.finalCircle + 1)
    const T = evs(frames, 'FinalCircleStarted')[0].Tick
    const ann = evs(frames, 'RingShrinkAnnounced')
    const shr = evs(frames, 'RingShrunk')
    const at = [200, 700, 1100, 1500, 1900, 2200]
    expect(ann.map((e) => [e.StageIndex, e.Tick - T, e.AtTick - T])).toEqual(at.map((a, i) => [i, a - w.ticks.ringPreview, a]))
    const rects = [
      { Min: 3, Max: 15 },
      { Min: 5, Max: 13 },
      { Min: 6, Max: 12 },
      { Min: 7, Max: 11 },
      { Min: 8, Max: 10 },
      { Min: 9, Max: 9 },
    ]
    expect(ann.map((e) => e.Next)).toEqual(rects)
    expect(shr.map((e) => [e.StageIndex, e.Tick - T, e.Ring])).toEqual(at.map((a, i) => [i, a, rects[i]]))
    const chests = evs(frames, 'ChestSpawned')
    expect(chests).toHaveLength(5)
    expect(chests.map((c) => c.Tick)).toEqual(ann.slice(0, 5).map((a) => a.Tick))
    chests.forEach((c, i) => {
      const n = ann[i].Next
      expect(c.Cell.X >= n.Min && c.Cell.X <= n.Max && c.Cell.Y >= n.Min && c.Cell.Y <= n.Max).toBe(true)
      expect(c.Cell.X === 9 && c.Cell.Y === 9).toBe(false)
    })
    // 预告期内快照带 nextRing / nextRingTick，生效后清空。
    const mid = frames.find((f) => f.snapshot.Tick === T + 650)!.snapshot.match.finalCircle!
    expect(mid).toMatchObject({ ring: { Min: 3, Max: 15 }, nextRing: { Min: 5, Max: 13 }, nextRingTick: T + 700, stageIndex: 0 })
    const after = frames.find((f) => f.snapshot.Tick === T + 750)!.snapshot.match.finalCircle!
    expect(after).toMatchObject({ ring: { Min: 5, Max: 13 }, nextRing: null, nextRingTick: 0, stageIndex: 1 })
    // 时间到：两人都活着、帽数相同 → 并列第 1，领奖台中央取 id 小者。
    const endFrame = frames.find((f) => evs(f, 'MatchEnded').length > 0)!
    expect(evs(endFrame, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: T + w.ticks.finalCircle, proto: { Reason: 'timeUp', WinnerNetEntityIdRaw: 1 } }])
    const res = endFrame.snapshot.match.results!
    expect(res.rows.map((r) => [r.id, r.rank, r.place, r.survived])).toEqual([
      [1, 1, 1, true],
      [2, 1, 2, true],
    ])
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

  it('chest keep-out: never on the centre cell; no chest on the centre cross inside the 5×5 until the 3×3 stage; none for the 1×1', () => {
    const w = makeWorld({ players: 2 })
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const onCross = (x: number, y: number): boolean => (x === 9 || y === 9) && Math.abs(x - 9) <= 2 && Math.abs(y - 9) <= 2
    for (const [index, side] of [
      [0, 13],
      [1, 9],
      [2, 7],
      [3, 5],
    ]) {
      const r = ringRect(w.size, side)
      const seen = new Set<number>()
      for (let i = 0; i < 500; i++) {
        w.chests = []
        spawnChest(w, r, index)
        expect(w.chests).toHaveLength(1)
        const c = w.chests[0].cell
        const x = c % w.size
        const y = Math.floor(c / w.size)
        expect(inRect(r, x, y)).toBe(true)
        expect(onCross(x, y)).toBe(false)
        seen.add(c)
      }
      expect(seen.size).toBeGreaterThan(5)
    }
    // 3×3：只剩中心十字的 4 条臂（4 个角是铁皮柱，中心禁放）。
    const arms = new Set([cell(w, 9, 8), cell(w, 8, 9), cell(w, 10, 9), cell(w, 9, 10)])
    const seen3 = new Set<number>()
    for (let i = 0; i < 500; i++) {
      w.chests = []
      spawnChest(w, ringRect(w.size, 3), 4)
      expect(w.chests).toHaveLength(1)
      expect(arms.has(w.chests[0].cell)).toBe(true)
      seen3.add(w.chests[0].cell)
    }
    expect(seen3.size).toBe(4)
    // 1×1：唯一的格就是中心 → 不落。
    w.chests = []
    const before = w.rng.chest.clone().NextInt(0, 1000)
    spawnChest(w, ringRect(w.size, 1), 5)
    expect(w.chests).toHaveLength(0)
    // 池为空不耗随机数。
    expect(w.rng.chest.clone().NextInt(0, 1000)).toBe(before)
  })

  it('clearInside: the 5×5 take-effect writes bricks / crates inside straight to Air (chain 0, owner 0, no candy) and leaves chests alone; 7×7 clears nothing', () => {
    const w = makeWorld({ players: 2 })
    put(w, 1, 9, 8)
    put(w, 2, 8, 9)
    const inside: [number, number, BlockType][] = [
      [7, 7, BlockType.积木],
      [9, 11, BlockType.木箱],
      [11, 10, BlockType.积木],
      [10, 9, BlockType.木箱],
      [7, 11, BlockType.积木],
    ]
    const outside: [number, number, BlockType][] = [
      [6, 9, BlockType.积木],
      [12, 7, BlockType.木箱],
    ]
    for (const [x, y, b] of [...inside, ...outside]) setBrick(w, x, y, b)
    const inChest = plantChest(w, 11, 11)
    const outChest = plantChest(w, 12, 11)
    w.match.endTick = w.t + 1 + w.ticks.finalCircle
    const upTo7 = runUntil(w, shrunk(2))
    const f7 = upTo7[upTo7.length - 1]
    expect(evs(f7, 'BrickDestroyed')).toHaveLength(0)
    expect(evs(f7, 'ChestOpened')).toHaveLength(0)
    const upTo5 = runUntil(w, shrunk(3))
    const f5 = upTo5[upTo5.length - 1]
    const prev = upTo5.length > 1 ? upTo5[upTo5.length - 2] : f7
    const T5 = f5.snapshot.Tick
    const destroyed = evs(f5, 'BrickDestroyed')
    expect(destroyed.map((e) => [e.Cell.X, e.Cell.Y, e.Block]).sort()).toEqual(inside.map(([x, y, b]) => [x, y, b]).sort())
    expect(destroyed.every((e) => e.ChainId === 0 && e.OwnerNetEntityIdRaw === 0 && e.Tick === T5)).toBe(true)
    for (const [x, y] of inside) expect(f5.snapshot.Terrain.brick[cell(w, x, y)]).toBe(BlockType.Air)
    for (const [x, y, b] of outside) expect(f5.snapshot.Terrain.brick[cell(w, x, y)]).toBe(b)
    expect(f5.snapshot.Terrain.rev).toBeGreaterThan(prev.snapshot.Terrain.rev)
    // 宝箱：清场只清砖（ADR 0031 / design §4.2），圈内圈外的宝箱都不动、不开、不喷战利品——只有 3 次独立炸弹命中才开。
    const r5 = ringRect(w.size, 5)
    expect(inRect(r5, 11, 11)).toBe(true)
    for (const f of upTo5) expect(evs(f, 'ChestOpened')).toHaveLength(0)
    for (const ch of [inChest, outChest]) {
      const live = w.chests.find((c) => c.id === ch.id)
      expect(live, `chest ${ch.id}`).toBeDefined()
      expect(live!.hitsLeft).toBe(live!.hitsRequired)
      expect(live!.opener).toBe(0)
    }
    expect(f5.snapshot.Terrain.brick[inChest.cell]).toBe(BlockType.Air)
    for (const f of upTo5) expect(evs(f, 'PickupSpawned').filter((e) => e.Source === 'chest')).toHaveLength(0)
    // 清场不掉糖。
    const next = step(w)
    for (const f of [f5, next]) expect(evs(f, 'PickupSpawned').filter((e) => e.Source === 'brick' || e.Source === 'crate')).toHaveLength(0)
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

  it('per stage: 1 point per second up to the 7×7, 2 points per second once the 5×5 has taken effect', () => {
    const hits = (stageIndex: number, side: number): { tick: number; points: number; left: number }[] => {
      const w = makeWorld({ players: 3 })
      put(w, 1, 9, 9)
      put(w, 3, 9, 10)
      put(w, 2, 1, 1)
      startCircle(w)
      w.finalCircle!.ring = ringRect(w.size, side)
      w.finalCircle!.stageIndex = stageIndex
      const first = w.t + 1
      return evs(run(w, 60), 'DamageApplied')
        .filter((d) => d.VictimNetEntityIdRaw === 2)
        .map((d) => ({ tick: d.Tick - first + 1, points: d.proto!.Points, left: d.HealthPointsLeft }))
    }
    expect(hits(2, 7)).toEqual([
      { tick: 20, points: 1, left: 5 },
      { tick: 40, points: 1, left: 4 },
      { tick: 60, points: 1, left: 3 },
    ])
    expect(hits(3, 5)).toEqual([
      { tick: 20, points: 2, left: 4 },
      { tick: 40, points: 2, left: 2 },
      { tick: 60, points: 2, left: 0 },
    ])
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
    // 倒计时中的人不算已出局：决赛圈刚开，本局不会因为「只剩两人在圈里」提前结束。
    expect(survivorsAfterPending(w)).toBe(3)
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

  it('ends on the killing tick when at most one player is left after pending deaths; simultaneous eliminations share a rank', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 2, 7, 9).health = 2
    put(w, 3, 11, 9).health = 2
    startCircle(w)
    addBomb(w, 1, 9, 9, 1, 2)
    const fd = step(w)
    const T = fd.snapshot.Tick
    expect(evs(fd, 'PlayerDied')).toHaveLength(2)
    // 本 Tick 的死亡在进入结算前结清：同 Tick 出局、同 Tick 结束，事件顺序 死亡 → 出局 → 局终。
    expect(evs(fd, 'PlayerEliminated').map((e) => [e.NetEntityIdRaw, e.Rank])).toEqual([
      [2, 2],
      [3, 2],
    ])
    expect(evs(fd, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: T, proto: { Reason: 'lastSurvivor', WinnerNetEntityIdRaw: 1 } }])
    const types = fd.events.map((e) => e.type)
    expect(types.lastIndexOf('PlayerDied')).toBeLessThan(types.indexOf('PlayerEliminated'))
    expect(types.lastIndexOf('PlayerEliminated')).toBeLessThan(types.indexOf('MatchEnded'))
    expect(fd.snapshot.BomberMatchState).toMatchObject({ Phase: MatchPhase.Settlement, EndTick: T })
    expect(fd.snapshot.match.phaseEndTick).toBe(T + w.ticks.settlement)
    expect(fd.snapshot.match.results!.rows.map((r) => [r.id, r.rank, r.place, r.eliminatedTick])).toEqual([
      [1, 1, 1, 0],
      [2, 2, 2, T],
      [3, 2, 3, T],
    ])
    // 击杀不铸帽；两个死者没有强化可掉。
    expect(hats(w, 1)).toBe(0)
    expect(evs(fd, 'HatMinted')).toHaveLength(0)
    // 结算期冻结：settlementMs 后自动下一局。
    const rest = run(w, w.ticks.settlement)
    expect(evs(rest, 'MatchEnded')).toHaveLength(0)
    expect(evs(rest, 'MatchStarted')).toHaveLength(1)
    expect(w.players.every((p) => !p.eliminated)).toBe(true)
    expect(w.finalCircle).toBeNull()
  })

  it('eliminations on consecutive ticks keep their order: later out ranks higher and matches PlayerEliminated.Rank', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 2, 7, 9).health = 2
    put(w, 3, 11, 9).health = 2
    startCircle(w)
    addBomb(w, 2, 7, 11, 1)
    addBomb(w, 3, 11, 11, 2)
    const f1 = step(w)
    const T1 = f1.snapshot.Tick
    expect(evs(f1, 'PlayerDied').map((e) => e.VictimNetEntityIdRaw)).toEqual([2])
    expect(evs(f1, 'MatchEnded')).toHaveLength(0)
    expect(w.match.phase).toBe(MatchPhase.Endgame)
    const f2 = step(w)
    expect(evs(f2, 'PlayerDied').map((e) => e.VictimNetEntityIdRaw)).toEqual([3])
    expect(evs(f2, 'PlayerEliminated').map((e) => [e.NetEntityIdRaw, e.Rank])).toEqual([
      [2, 3],
      [3, 2],
    ])
    expect(evs(f2, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: T1 + 1, proto: { Reason: 'lastSurvivor', WinnerNetEntityIdRaw: 1 } }])
    expect(player(w, 2).eliminatedTick).toBe(T1)
    expect(player(w, 3).eliminatedTick).toBe(T1 + 1)
    expect(f2.snapshot.match.results!.rows.map((r) => [r.id, r.rank, r.place])).toEqual([
      [1, 1, 1],
      [3, 2, 2],
      [2, 3, 3],
    ])
  })

  it('all down: the last batch dies on one tick → allDown, the batch shares rank 1, podium centre = lowest id', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 7, 9).health = 2
    put(w, 2, 11, 9).health = 2
    put(w, 3, 13, 9).health = 2
    startCircle(w)
    addBomb(w, 3, 13, 11, 1)
    addBomb(w, 1, 9, 9, 2)
    const f1 = step(w)
    expect(evs(f1, 'PlayerDied').map((e) => e.VictimNetEntityIdRaw)).toEqual([3])
    const f2 = step(w)
    expect(evs(f2, 'PlayerDied').map((e) => e.VictimNetEntityIdRaw).sort()).toEqual([1, 2])
    expect(evs(f2, 'MatchEnded')).toEqual([{ type: 'MatchEnded', Tick: f2.snapshot.Tick, proto: { Reason: 'allDown', WinnerNetEntityIdRaw: 1 } }])
    const res = f2.snapshot.match.results!
    expect(res.reason).toBe('allDown')
    expect(res.rows.map((r) => [r.id, r.rank, r.place, r.survived])).toEqual([
      [1, 1, 1, false],
      [2, 1, 2, false],
      [3, 3, 3, false],
    ])
  })

  it('time-up ranking: survivors by hats (ties share), then eliminated by death tick; results fixed through Settlement', () => {
    const w = makeWorld({ players: 5, rules: QUIET })
    for (const id of [1, 2, 3]) put(w, id, 9, 9)
    giveLevels(w, 1, 1, 1, 0)
    giveLevels(w, 2, 1, 1, 0)
    giveLevels(w, 3, 1, 0, 0)
    put(w, 4, 7, 9).health = 2
    put(w, 5, 11, 9).health = 2
    startCircle(w)
    addBomb(w, 4, 7, 11, 1)
    addBomb(w, 5, 11, 11, 2)
    const frames = runUntil(w, (f) => evs(f, 'MatchEnded').length > 0)
    const died = evs(frames, 'PlayerDied')
    expect(died.map((e) => e.VictimNetEntityIdRaw)).toEqual([4, 5])
    expect(died[1].Tick).toBe(died[0].Tick + 1)
    const endFrame = frames[frames.length - 1]
    expect(frames.slice(0, -1).every((f) => f.snapshot.match.results === null)).toBe(true)
    expect(evs(endFrame, 'MatchEnded')).toEqual([
      { type: 'MatchEnded', Tick: w.finalCircle!.startTick + w.ticks.finalCircle, proto: { Reason: 'timeUp', WinnerNetEntityIdRaw: 1 } },
    ])
    const res = endFrame.snapshot.match.results!
    expect(res.rows.map((r) => [r.id, r.rank, r.hats])).toEqual([
      [1, 1, 2],
      [2, 1, 2],
      [3, 3, 1],
      [5, 4, 0],
      [4, 5, 0],
    ])
    for (const f of run(w, w.ticks.settlement - 1)) expect(f.snapshot.match.results).toEqual(res)
  })

  it('solo (one player) does not end early just because the only player is alive', () => {
    const w = makeWorld({ players: 1 })
    put(w, 1, 9, 9)
    startCircle(w)
    expect(evs(run(w, 100), 'MatchEnded')).toHaveLength(0)
    expect(w.match.phase).toBe(MatchPhase.Endgame)
  })

  it('a two-player final circle ends at once when the other player leaves: the stayer wins, the leaver is ranked as eliminated', () => {
    const w = makeWorld({ players: 2, rules: QUIET })
    put(w, 1, 9, 9)
    put(w, 2, 9, 7)
    startCircle(w)
    expect(removePlayerFromWorld(w, 2)).toBe(true)
    const ended = evs(run(w, 2), 'MatchEnded')
    expect(ended).toHaveLength(1)
    expect(ended[0].proto?.Reason).toBe('lastSurvivor')
    expect(ended[0].proto?.WinnerNetEntityIdRaw).toBe(1)
  })
})
