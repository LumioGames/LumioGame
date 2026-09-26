import { describe, expect, it } from 'vitest'
import { formatRows, formatSummary, runMatch, summarize, type MatchStats } from './harness/match-runner'
import { ACCEPT_ON, MATCH_TIMEOUT_MS } from './harness/stats-suite'

/**
 * 验收 E（ADR 0031，design §4.2；RESOLUTIONS #13 / 「Acceptance definitions」）：6 个固定种子，8 个普通档 Bot
 * （0 号位由自动驾驶按 normal 档驾驶）。慢，只在 BOMBER_ACCEPT=1 时跑：`pnpm accept`。
 * 种子固定为 1..6，永不更换；阈值不得放宽。
 */
const SEEDS = [1, 2, 3, 4, 5, 6] as const
const CAP_MS = 420_000

describe.runIf(ACCEPT_ON)('acceptance E: 6 seeded all-bot matches on normal', () => {
  const rows: MatchStats[] = []

  for (const seed of SEEDS)
    it(
      `seed ${seed}: ends within 7 min, reaches the final circle, 1×1 stays enterable, ranking holds`,
      () => {
        // runMatch 内部已校验名次不变量（违反即抛错）。
        const r = runMatch({ seed, ai: 'normal', local: 'normal' })
        rows.push(r)
        expect(r.lengthMs).toBeLessThanOrEqual(CAP_MS)
        expect(r.finalCircle).not.toBeNull()
        if (r.reached1x1) {
          expect(r.enterable1x1, r.enterBlocker ?? '').toBe(true)
          expect(r.centreViolations).toBe(0)
        }
        expect(r.chestFor1x1).toBe(false)
      },
      MATCH_TIMEOUT_MS,
    )

  it('aggregate: avg ≤ 7 min, sole survivor ≥ 85% (= 6/6), time-up median survivors ≤ 2, 1×1 enterable every match', () => {
    expect(rows.map((r) => r.seed).sort((a, b) => a - b)).toEqual([...SEEDS])
    const s = summarize('E · 6 种子 · normal', rows)
    console.log(`\n## 验收 E（6 种子）\n\n${formatSummary([s])}\n\n${formatRows(rows)}\n`)
    expect(s.avgLengthMin * 60_000).toBeLessThanOrEqual(CAP_MS)
    expect(s.soleSurvivorRate).toBeGreaterThanOrEqual(0.85)
    if (s.timeUpSurvivorsMedian !== null) expect(s.timeUpSurvivorsMedian).toBeLessThanOrEqual(2)
    expect(s.enterable1x1All).toBe(true)
  })
})
