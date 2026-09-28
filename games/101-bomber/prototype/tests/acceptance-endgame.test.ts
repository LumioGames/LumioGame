import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, MAP_TIERS, type MapTierId } from '../src/contract'
import { formatRows, formatSummary, runMatch, summarize, type MatchStats } from './harness/match-runner'
import { ACCEPT_ON, HIGHLIGHT_PROBE, MATCH_TIMEOUT_MS, describeRun } from './harness/stats-suite'

/**
 * 验收 E（ADR 0043 起为 16 人 · 27×27；ADR 0031 / design §4.2；RESOLUTIONS #13 / 「Acceptance definitions」）：6 个固定种子，
 * 全员普通档（0 号位由自动驾驶按 normal 档驾驶）。慢，只在 BOMBER_ACCEPT=1 时跑：`pnpm accept`。
 * 门槛：唯一存活 ≥ 85%（6 局即 6/6）、平均局长 ≤ 4 分钟、1×1 每局可进入；另逐局守名次不变量与决赛圈、1×1 不落宝箱。
 * 种子固定为 1..6，永不更换；阈值不得放宽。时间到的存活中位与 M1 报告项只报告。
 */
const SEEDS = [1, 2, 3, 4, 5, 6] as const
const MAP: MapTierId = 27
/** ADR 0035：局时上限 4 分钟（原 ADR 0031 的 7 分钟）——逐局不得超过。 */
const CAP_MS = DEFAULT_RULES.matchCapMs
/** ADR 0043 验收 E：平均局长 ≤ 4 分钟、唯一存活 ≥ 85%（写死，封顶改了门槛也不跟着松）。 */
const E_AVG_MAX_MS = 240_000
const E_SOLE_MIN = 0.85
const LABEL = `E · 6 种子 · 全员 normal（${describeRun({ ai: 'normal', map: MAP })}）`

describe.runIf(ACCEPT_ON)(`acceptance E: 6 seeded all-normal matches, 16 players on 27×27`, () => {
  const rows: MatchStats[] = []

  for (const seed of SEEDS)
    it(
      `seed ${seed}: ends within the 4-min cap, reaches the final circle, 1×1 stays enterable, ranking holds`,
      () => {
        // runMatch 内部已校验名次不变量（违反即抛错）。
        const r = runMatch({ seed, ai: 'normal', map: MAP, local: 'normal', highlight: HIGHLIGHT_PROBE })
        rows.push(r)
        expect(r.players).toHaveLength(MAP_TIERS[MAP].defaultPlayers)
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

  it('aggregate: avg ≤ 4 min, sole survivor ≥ 85% (= 6/6), 1×1 enterable every match', () => {
    expect(rows.map((r) => r.seed).sort((a, b) => a - b)).toEqual([...SEEDS])
    const s = summarize(LABEL, rows)
    console.log(`\n## 验收 E（6 种子）\n\n${formatSummary([s])}\n\n${formatRows(rows)}\n`)
    expect(s.avgLengthMin * 60_000).toBeLessThanOrEqual(E_AVG_MAX_MS)
    expect(s.soleSurvivorRate).toBeGreaterThanOrEqual(E_SOLE_MIN)
    expect(s.enterable1x1All).toBe(true)
  })
})
