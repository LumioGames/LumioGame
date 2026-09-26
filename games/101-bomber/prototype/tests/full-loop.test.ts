import { describe, expect, it } from 'vitest'
import {
  CHARACTERS,
  DEFAULT_RULES,
  MatchPhase,
  protoConfig,
  type BomberConfig,
  type CharacterId,
  type MatchEnded,
  type MatchResultsView,
  type RingShrunk,
  type TickFrame,
  type U64,
  type WorldSnapshot,
} from '../src/contract'
import { LocalHost, type LocalHostOptions } from '../src/app/local-host'
import { HudBrain, type SettlementResults } from '../src/hud/hud-brain'
import { HudTimeline } from '../src/hud/timeline'
import { rankFinal, type ElimRecord } from '../src/hud/ranking'
import { podiumModel } from '../src/hud/podium'
import { skillHudModel } from '../src/present/skill-hud'
import { podiumOrder, podiumSpots, rowsFromResults } from '../src/view/logic/podium'
import { destructibleInside, finalCellBlocker, gridOfSnapshot } from './support/final-cell'

/**
 * 端到端（第 4 轮 brief「选角 → 对局 → 决赛圈缩到 1×1 → 唯一存活或时间到 → 领奖台」，ADR 0030 / 0031）：
 * 与浏览器同一条 LocalHost 路径，每帧照 hud/index.ts 的接法喂 HudTimeline + HudBrain，局终再把
 * 规则层 match.results、HUD 结算 / 领奖台模型与 3D 领奖台站位三方对账。
 * 不存整局帧：逐帧检查、只留需要的几份快照。
 */

const RULES = DEFAULT_RULES

interface LoopRun {
  host: LocalHost
  first: WorldSnapshot
  /** MatchEnded 那一帧的快照与事件。 */
  endFrame: TickFrame
  ended: MatchEnded
  /** 首个 Settlement 快照（match.results 在此发布）。 */
  settleSnap: WorldSnapshot
  settlement: SettlementResults
  /** RingShrunk 生效帧：stage → 该帧快照。 */
  shrinks: Map<number, { ev: RingShrunk; snap: WorldSnapshot }>
  finalCircle: { trigger: 'resource' | 'time'; startTick: number; endTick: number } | null
  /** HUD 记下的出局 Tick（PlayerEliminated），供 results 缺席时的回退排名。 */
  elims: Map<U64, ElimRecord>
  chestSpawnStages: number[]
  diedTicks: number[]
  /** 每人最近一次 PlayerDied 的 Tick（= 出局者的 eliminatedTick，RESOLUTIONS #4）。 */
  lastDied: Map<U64, number>
}

function hostOf(o: Partial<LocalHostOptions> & { config: BomberConfig; seed: number; botCount: number }): LocalHost {
  return new LocalHost({ rules: RULES, ...o })
}

/** 逐 Tick 推进一整局（Warmup → Running → Endgame → Settlement 第一帧之后 podium 若干帧）。 */
function runLoop(host: LocalHost, maxTicks: number): LoopRun {
  const brain = new HudBrain({
    localId: host.localPlayerId,
    pillarMinHats: RULES.hatKingPillarMinHats,
    tickRateHz: host.config.tickRateHz,
    pointsPerHeart: host.config.healthPointsPerHeart,
    rules: RULES,
  })
  const timeline = new HudTimeline()
  let first: WorldSnapshot | null = null
  let endFrame: TickFrame | null = null
  let ended: MatchEnded | null = null
  let settleSnap: WorldSnapshot | null = null
  let settlement: SettlementResults | null = null
  let fc: LoopRun['finalCircle'] = null
  const shrinks = new Map<number, { ev: RingShrunk; snap: WorldSnapshot }>()
  const elims = new Map<U64, ElimRecord>()
  const chestSpawnStages: number[] = []
  const diedTicks: number[] = []
  const lastDied = new Map<U64, number>()
  const unsub = host.subscribe((f) => {
    const s = f.snapshot
    first ??= s
    for (const b of timeline.advance(s, s.Tick, f.events)) {
      for (const m of brain.consume(b)) if (m.kind === 'settlement') settlement = m.results
    }
    if (s.match.finalCircle && !fc) fc = { trigger: s.match.finalCircle.trigger, startTick: s.match.finalCircle.startTick, endTick: s.match.finalCircle.endTick }
    for (const e of f.events) {
      if (e.type === 'RingShrunk') shrinks.set(e.StageIndex, { ev: e, snap: s })
      if (e.type === 'ChestSpawned') chestSpawnStages.push(s.match.finalCircle?.stageIndex ?? -2)
      if (e.type === 'PlayerEliminated') elims.set(e.NetEntityIdRaw, { rank: e.Rank, tick: e.Tick })
      if (e.type === 'PlayerDied') {
        diedTicks.push(e.Tick)
        lastDied.set(e.VictimNetEntityIdRaw, e.Tick)
      }
      if (e.type === 'MatchEnded' && !ended) {
        ended = e
        endFrame = f
      }
    }
    if (s.BomberMatchState.Phase === MatchPhase.Settlement && !settleSnap) settleSnap = s
  })
  for (let i = 0; i < maxTicks && !(settleSnap && settlement); i++) host.stepTicks(1)
  unsub()
  if (!first || !ended || !endFrame || !settleSnap || !settlement) throw new Error(`match did not settle within ${maxTicks} ticks`)
  return { host, first, endFrame, ended, settleSnap, settlement, shrinks, finalCircle: fc, elims, chestSpawnStages, diedTicks, lastDied }
}

/** HUD 结算行、HUD 领奖台、3D 领奖台（results 直读与按快照重排两条路）都与 match.results 一致。 */
function expectPodiumAgrees(run: LoopRun, results: MatchResultsView): void {
  const snap = run.settleSnap
  const want = results.rows.map((r) => [r.id, r.rank, r.place])
  // HUD 结算（hud-brain → rankFinal，优先读 match.results）。
  expect(run.settlement.rows.map((r) => [r.id, r.rank, r.place])).toEqual(want)
  expect(run.settlement.reason).toBe(results.reason)
  expect(run.settlement.winnerId).toBe(results.winner)
  // HUD 回退路径：不给 results，只凭快照 + HUD 记下的 PlayerEliminated.Tick 重排，结果必须相同。
  const fallback = rankFinal(snap.Players, run.elims, true, snap.BomberMatchState.HatKingNetEntityIdRaw, run.host.localPlayerId, null)
  expect(fallback.map((r) => [r.id, r.rank, r.place])).toEqual(want)
  // HUD 领奖台：前三名按站位、冠军 = 名次 1（RESOLUTIONS #11）。
  const pm = podiumModel(run.settlement.rows, run.settlement.reason)
  expect(pm.plates.map((p) => p.rank)).toEqual(results.rows.slice(0, 3).map((r) => r.rank))
  expect(pm.plates[0].isWinner).toBe(true)
  for (const p of pm.plates) expect(p.isWinner).toBe(p.rank === 1)
  const localRow = results.rows.find((r) => r.id === run.host.localPlayerId)
  expect(pm.localRank).toBe(localRow?.rank ?? null)
  // 3D 领奖台：results 直读，与按快照 eliminatedTick 重排两条路都等于 results。
  const viewRows = rowsFromResults(results)
  expect(viewRows.map((r) => [r.id, r.rank, r.place])).toEqual(want)
  const reordered = podiumOrder(
    snap.Players.map((p) => ({ id: p.NetEntityIdRaw, hats: p.BomberPlayerState.HatCount, eliminated: p.eliminated, elimTick: p.eliminatedTick })),
  )
  expect(reordered.map((r) => [r.id, r.rank, r.place])).toEqual(want)
  const centre = podiumSpots(viewRows).find((s) => s.place === 1)
  expect(centre?.id).toBe(results.winner)
  expect(centre?.pose).toBe('cheer')
}

/** 清场段（5×5 / 3×3 / 1×1）生效帧：圈内无可破坏砖，1×1 中心可进入且没有宝箱（ADR 0031，design §4.2 末段清场）。 */
function expectClearedAt(run: LoopRun, stage: number): void {
  const hit = run.shrinks.get(stage)
  expect(hit, `RingShrunk stage ${stage}`).toBeDefined()
  if (!hit) return
  const g = gridOfSnapshot(hit.snap)
  expect(destructibleInside(g, hit.ev.Ring)).toEqual([])
  expect(finalCellBlocker(g)).toBeNull()
}

describe('full loop: pick → match → 1×1 → end → podium', () => {
  it('solo autopilot cat, 120 s match: ring reaches the 1×1 with clearing, time-up, local player on the podium', () => {
    // 120 s ≤ 115 s + 常规 5 s：几乎整局都是决赛圈（ADR 0031：?match ≤ 115 即全程决赛圈）；单人永远不会触发 lastSurvivor。
    const config = protoConfig(RULES, { matchDurationMs: 120_000 })
    const host = hostOf({ seed: 11, config, botCount: 0, localCharacter: 'cat', localAutopilot: { profile: 'player' } })
    const run = runLoop(host, 4000)
    const me = host.localPlayerId

    // 选角：本人是闪电猫，专属闪现 Lv1 绑定在主动槽（ADR 0030 / design §8.0）。
    const p0 = run.first.Players.find((p) => p.NetEntityIdRaw === me)
    expect(p0?.skills?.character).toBe('cat')
    expect(p0?.skills?.slots.active).toEqual({ skill: 'blink', level: 1, bound: true })
    const chip = skillHudModel(p0, run.first.Tick, config.tickRateHz, RULES, config, false).chips
    expect(chip.map((c) => c.skill)).toEqual([null, 'blink', null])

    // 决赛圈：时间触发，6 段全部生效，最后一段 = 棋盘中心 1×1（19×19 → (9,9)）。
    expect(run.finalCircle?.trigger).toBe('time')
    expect([...run.shrinks.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(run.shrinks.get(5)?.ev.Ring).toEqual({ Min: 9, Max: 9 })
    expect([...run.shrinks.values()].map((x) => x.ev.Ring.Max - x.ev.Ring.Min + 1)).toEqual(RULES.ringStages.map((s) => s.size))
    for (const stage of [3, 4, 5]) expectClearedAt(run, stage)
    // 宝箱：1×1 段不落（stageIndex 4 = 3×3 生效后预告 1×1 时不落），全程最多 5 个。
    expect(run.chestSpawnStages.every((s) => s < 4)).toBe(true)
    expect(run.chestSpawnStages.length).toBeLessThanOrEqual(RULES.ringStages.filter((s) => s.chest).length)
    for (const snap of [run.shrinks.get(5)?.snap, run.endFrame.snapshot]) {
      if (!snap) continue
      expect(gridOfSnapshot(snap).chestCells).not.toContain(9 * snap.Terrain.size + 9)
    }

    // 局终：时间到（单人），恰在决赛圈终点；本人活着、第 1 名。
    expect(run.ended.proto?.Reason).toBe('timeUp')
    expect(run.ended.Tick).toBe(run.finalCircle?.endTick)
    const results = run.settleSnap.match.results
    expect(results).toBeTruthy()
    if (!results) return
    expect(results.reason).toBe('timeUp')
    expect(results.winner).toBe(me)
    expect(results.rows).toHaveLength(1)
    expect(results.rows[0]).toMatchObject({ id: me, rank: 1, place: 1, survived: true, eliminatedTick: 0 })
    expect(run.ended.proto?.WinnerNetEntityIdRaw).toBe(me)
    expectPodiumAgrees(run, results)
    const pm = podiumModel(run.settlement.rows, run.settlement.reason)
    expect(pm.localOnStage).toBe(true)
    expect(pm.localLine).toBe('你拿到了第 1 名！')
  })

  it('8 players on normal AI, 130 s match: balanced roster, consistent end, podium agrees, character change applies next match', () => {
    const config = protoConfig(RULES, { matchDurationMs: 130_000 })
    // 本机由验收 D 的脚本普通玩家（'player' 档）驾驶，其余 7 个 normal Bot（design §15 Bot 难度分档（原型工具））。
    const host = hostOf({ seed: 1, config, botCount: 7, localCharacter: 'cat', ai: 'normal', localAutopilot: { profile: 'player' } })
    const run = runLoop(host, 4000)
    const me = host.localPlayerId

    // 开局：本人闪电猫；四个角色各 2 人（D15 均衡）；名字互不相同。
    const chars = (s: WorldSnapshot): Record<CharacterId, number> => {
      const n = { rabbit: 0, duck: 0, cat: 0, bear: 0 } as Record<CharacterId, number>
      for (const p of s.Players) if (p.skills?.character) n[p.skills.character]++
      return n
    }
    expect(run.first.Players).toHaveLength(8)
    expect(run.first.Players.find((p) => p.NetEntityIdRaw === me)?.skills?.character).toBe('cat')
    expect(chars(run.first)).toEqual({ rabbit: 2, duck: 2, cat: 2, bear: 2 })
    expect(new Set(run.first.Players.map((p) => p.meta.name)).size).toBe(8)
    for (const p of run.first.Players) {
      const c = p.skills?.character
      expect(c).toBeTruthy()
      if (!c) continue
      expect(p.meta.animal).toBe(CHARACTERS[c].animal)
      const slot = RULES.skills[CHARACTERS[c].skill].slot
      expect(p.skills?.slots[slot]).toMatchObject({ skill: CHARACTERS[c].skill, bound: true })
    }

    // 局终：结束原因与存活人数一致（ADR 0031 / design §4.2 结束与胜负）。
    const results = run.settleSnap.match.results
    expect(results).toBeTruthy()
    if (!results) return
    const survivors = run.endFrame.snapshot.Players.filter((p) => !p.eliminated).length
    expect(results.rows.filter((r) => r.survived)).toHaveLength(survivors)
    expect(run.ended.proto?.Reason).toBe(results.reason)
    expect(run.ended.proto?.WinnerNetEntityIdRaw).toBe(results.winner)
    if (results.reason === 'lastSurvivor') {
      expect(survivors).toBe(1)
      // 在致死的同一 Tick 结束，早于决赛圈终点。
      expect(run.diedTicks).toContain(run.ended.Tick)
      expect(run.ended.Tick).toBeLessThan(run.finalCircle?.endTick ?? Infinity)
    } else if (results.reason === 'timeUp') {
      expect(survivors).toBeGreaterThanOrEqual(2)
      expect(run.ended.Tick).toBe(run.finalCircle?.endTick)
    } else {
      expect(survivors).toBe(0)
    }
    expect(results.winner).toBe(results.rows[0].id)
    // 打到的清场段（5×5 起）照样清场、1×1 可进入。打到第几段随 Bot 调参变化，不钉（W2 实测种子 1：lastSurvivor 于 5×5 或 3×3 段）。
    for (const stage of run.shrinks.keys()) if (RULES.ringStages[stage].clearInside) expectClearedAt(run, stage)
    // eslint-disable-next-line no-console
    console.log(
      `[full-loop] reason=${results.reason} endTick=${run.ended.Tick} fc=${run.finalCircle?.trigger}@${run.finalCircle?.startTick}..${run.finalCircle?.endTick} ` +
        `stages=${[...run.shrinks.keys()].join(',')} survivors=${survivors} rows=${results.rows.map((r) => `${r.id}:${r.rank}${r.survived ? '*' : ''}/${r.hats}h`).join(' ')}`,
    )

    // 名次：存活者在前按帽数竞赛排名；出局者在后，出局越晚越前（同 Tick 并列）。
    const alive = results.rows.filter((r) => r.survived)
    const out = results.rows.filter((r) => !r.survived)
    expect(results.rows.slice(0, alive.length).every((r) => r.survived)).toBe(true)
    for (const r of alive) expect(r.rank).toBe(1 + alive.filter((q) => q.hats > r.hats).length)
    for (let i = 1; i < alive.length; i++) expect(alive[i - 1].hats).toBeGreaterThanOrEqual(alive[i].hats)
    for (let i = 1; i < out.length; i++) expect(out[i - 1].eliminatedTick).toBeGreaterThanOrEqual(out[i].eliminatedTick)
    for (const r of out) {
      expect(r.rank).toBe(alive.length + 1 + out.filter((q) => q.eliminatedTick > r.eliminatedTick).length)
      // eliminatedTick = 使其出局的那条 PlayerDied 的 Tick（RESOLUTIONS #4）；PlayerEliminated 只晚不早。
      expect(r.eliminatedTick).toBe(run.lastDied.get(r.id))
      expect(run.elims.get(r.id)?.tick).toBeGreaterThanOrEqual(r.eliminatedTick)
    }
    expect(results.rows.map((r) => r.place)).toEqual(results.rows.map((_, i) => i + 1))
    expectPodiumAgrees(run, results)

    // 换角色：本局不变，下一局 MatchStarted 那一帧起生效（ADR 0030 D15）。
    host.setLocalCharacter('bear')
    const meNow = (s: WorldSnapshot) => s.Players.find((p) => p.NetEntityIdRaw === me)?.skills?.character
    let latest: TickFrame | null = null
    let started: TickFrame | null = null
    const unsub = host.subscribe((f) => {
      latest = f
      if (!started && f.events.some((e) => e.type === 'MatchStarted')) started = f
    })
    expect(meNow((latest as TickFrame | null)?.snapshot ?? run.settleSnap)).toBe('cat')
    for (let i = 0; i < 1000 && !started; i++) {
      host.stepTicks(1)
      if (!started) expect(meNow((latest as unknown as TickFrame).snapshot)).toBe('cat')
    }
    unsub()
    const next = (started as TickFrame | null)?.snapshot
    expect(next).toBeTruthy()
    if (!next) return
    expect(next.match.matchIndex).toBe(run.settleSnap.match.matchIndex + 1)
    expect(meNow(next)).toBe('bear')
    const bear = next.Players.find((p) => p.NetEntityIdRaw === me)
    expect(bear?.meta.animal).toBe('bear')
    expect(bear?.skills?.slots.active).toEqual({ skill: 'fireAura', level: 1, bound: true })
    expect(chars(next)).toEqual({ rabbit: 2, duck: 2, cat: 2, bear: 2 })
    expect(new Set(next.Players.map((p) => p.meta.name)).size).toBe(8)
  })
})
