import { describe, expect, it } from 'vitest'
import { BOT_PROFILES, DEFAULT_RULES, protoConfig } from '../src/contract'
import { runMatch } from './harness/match-runner'

/**
 * 常开冒烟（design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13）：一局 150 s 的短局，0 号位由验收 D 的
 * 「脚本普通玩家」（'player' 档）驾驶，对 7 个普通档 Bot。只验证整条链路跑得通、统计合理——胜率类指标在
 * BOMBER_STATS=1 的 stats-* 批次里。
 */
describe('acceptance smoke: player profile vs 7 normal bots (150 s match)', () => {
  it('completes with sane stats and a valid ranking', () => {
    const r = runMatch({ seed: 7, ai: 'normal', local: 'player', localCharacter: 'cat', config: protoConfig(DEFAULT_RULES, { matchDurationMs: 150_000 }) })
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
