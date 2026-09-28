import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, lineupFor, protoConfig } from '../src/contract'
import { rulesOf, runMatch, summarize } from './harness/match-runner'
import { formatM1 } from './harness/m1-metrics'

/**
 * 常开冒烟（design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13）：一局 150 s 的短局，0 号位由验收 D 的
 * 「脚本普通玩家」（'player' 档）驾驶，对 7 个普通档 Bot。只验证整条链路跑得通、统计合理——胜率类指标在
 * BOMBER_STATS=1 的 stats-* 批次里。
 */
describe('acceptance smoke: player profile vs 7 normal bots (150 s match)', () => {
  it('completes with sane stats and a valid ranking', () => {
    const r = runMatch({ seed: 7, ai: 'normal', local: 'player', localCharacter: 'cat', config: protoConfig(rulesOf({}), { matchDurationMs: 150_000 }) })
    expect(r.ai).toBe('normal')
    expect(r.local).toBe('player')
    // 150 s 局：115 s 决赛圈从第 35 s 起；比赛不会超过局时。
    expect(r.finalCircle).not.toBeNull()
    expect(r.lengthMs).toBeGreaterThan(0)
    expect(r.lengthMs).toBeLessThanOrEqual(150_000)
    expect(['lastSurvivor', 'timeUp', 'allDown']).toContain(r.reason)
    // 自动驾驶真的在玩。
    expect(r.localMovedTicks).toBeGreaterThan(100)
    expect(r.localBombs).toBeGreaterThan(0)
    // Bot 会用技能（normal 档 skillUsePermille > 0）。
    expect(BOT_PROFILES.normal.skillUsePermille).toBeGreaterThan(0)
    expect(r.botSkillCasts).toBeGreaterThan(0)
    // 名次：8 行、本机有名次、存活数与结束原因一致（runMatch 内另有完整不变量校验）。
    expect(r.players).toHaveLength(8)
    expect(r.localRank).toBeGreaterThanOrEqual(1)
    expect(r.localRank).toBeLessThanOrEqual(8)
    expect(r.survivors).toBe(r.players.filter((p) => p.survived).length)
    if (r.reason === 'lastSurvivor') expect(r.survivors).toBe(1)
    if (r.reached1x1) expect(r.enterable1x1).toBe(true)
    expect(r.kills).toBeLessThanOrEqual(r.deaths)
  })
})

/**
 * 常开冒烟（ADR 0040 / 0043）：`runMatch({ map, lineup, softTargets })` 的接线与 M1 报告项在真局上有值。
 * 冻结基线的规则层只支持 ≤ 8 人（16 人 · 27×27 归 M1-2），所以这里用 19 档 8 人、默认阵容 lineupFor(7) 跑 150 s 短局；
 * 16 人 · 27×27 的整局在 BOMBER_ACCEPT / BOMBER_STATS 批次里。
 */
describe('acceptance smoke: runMatch with the default lineup and M1 report items (19 tier, 150 s match)', () => {
  it('passes lineupFor(bots) to the host, records map / players / soft targets, and derives M1 metrics from a real match', () => {
    const r = runMatch({
      seed: 11,
      map: 19,
      lineup: 'default',
      local: 'player',
      localCharacter: 'duck',
      config: protoConfig(rulesOf({ map: 19 }), { matchDurationMs: 150_000 }),
    })
    expect(r.map).toBe(19)
    expect(r.playerCount).toBe(8)
    expect(r.players).toHaveLength(8)
    expect(r.lineup).toEqual(lineupFor(7))
    expect(r.ai).toBe('mixed')
    const me = r.players.find((p) => p.isLocal)!
    expect(r.softTargets).toEqual([me.id])
    // 各圈停留：每档占比合计 1，且前几档有样本（活人一直在场上）。
    const s = summarize('smoke', [r])
    expect(s.m1.zoneByBucket.length).toBeGreaterThanOrEqual(4)
    for (const b of s.m1.zoneByBucket.slice(0, 4)) {
      expect(b.share).not.toBeNull()
      expect(b.share!.outer + b.share!.mid + b.share!.core).toBeCloseTo(1, 9)
    }
    // 本机 K/D 与前 4 从名次表推导。
    expect(s.localKills).toBe(me.kills)
    expect(s.localDeaths).toBe(me.deaths)
    expect(s.localTop4Rate).toBe(r.localRank <= 4 ? 1 : 0)
    // 高光卡探针没接上 → N/A；其余 M1 项照常输出（数据缺席时为 0 / N/A）。
    expect(r.m1.highlight).toBeNull()
    expect(formatM1(s.m1)).toContain('高光卡覆盖率：N/A')
  })

  it('rejects a lineup whose length is not the bot count, a config for another map tier, and soft targets the frozen host cannot express', () => {
    expect(() => runMatch({ seed: 1, map: 19, lineup: ['rookie'], local: 'normal' })).toThrow(/lineup has 1 entries for 7 bots/)
    expect(() => runMatch({ seed: 1, map: 27, local: 'normal', config: protoConfig(rulesOf({})) })).toThrow(/config.mapSize 19 != map tier 27/)
    expect(() => runMatch({ seed: 1, map: 19, softTargets: 'none', local: 'normal' })).toThrow(/softTargets 'none' is not supported/)
  })

  it('without map or rules the harness stays on the legacy 8-player 19 tier (whatever DEFAULT_RULES defaults to)', () => {
    const r = rulesOf({})
    expect(r.map.id).toBe(19)
    expect(r.playerCount).toBe(8)
    expect(rulesOf({ map: 27 }).playerCount).toBe(16)
  })
})
