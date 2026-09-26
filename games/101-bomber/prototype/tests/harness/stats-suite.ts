import { afterAll, describe, expect, it } from 'vitest'
import type { BotDifficulty, BotProfileId } from '../../src/contract'
import { formatRows, formatSummary, runMatch, summarize, type MatchStats, type StatsSummary } from './match-runner'

/**
 * 统计批次的公共壳（原型扩展 NON-CONTRACT，design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13）：
 * 只在 BOMBER_STATS=1 时跑；一局一个 it（各自有超时），最后一个 it 打印交付表并跑断言。
 */
export const STATS_ON = process.env.BOMBER_STATS === '1'
export const ACCEPT_ON = process.env.BOMBER_ACCEPT === '1'

/** 一局的超时：约 8400 Tick × 最多 ~10 ms。 */
export const MATCH_TIMEOUT_MS = 180_000

/**
 * 种子 base..base+n−1；环境变量 BOMBER_STATS_SEEDS 可覆盖（「1-30」或「1,2,5」）——只用于本地排查，
 * 交付数字一律用缺省种子（不换种子）。
 */
export function envSeeds(n: number, base = 1): number[] {
  const raw = process.env.BOMBER_STATS_SEEDS?.trim()
  if (raw) {
    const m = /^(\d+)-(\d+)$/.exec(raw)
    if (m) {
      const out: number[] = []
      for (let s = Number(m[1]); s <= Number(m[2]); s++) out.push(s)
      return out
    }
    return raw
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x))
  }
  return Array.from({ length: n }, (_, i) => base + i)
}

export interface StatsSuiteOptions {
  name: string
  /** 7 个 Bot 的难度。 */
  ai: BotDifficulty
  /** 本机自动驾驶档。 */
  local: BotProfileId
  seeds: readonly number[]
  /** 本机角色逐局轮换（CHARACTER_ORDER[seed % 4]）；否则 rabbit。 */
  rotate?: boolean
  /** 缺省 BOMBER_STATS=1。 */
  enabled?: boolean
  assert?: (s: StatsSummary, rows: readonly MatchStats[]) => void
}

/** 已跑完的批次（同一个进程里多个 suite 共用时按 label 区分）。 */
export const collected = new Map<string, MatchStats[]>()

export function defineStatsSuite(o: StatsSuiteOptions): void {
  const on = o.enabled ?? STATS_ON
  describe.runIf(on)(o.name, () => {
    const rows: MatchStats[] = []
    collected.set(o.name, rows)
    for (const seed of o.seeds) {
      it(
        `seed ${seed}`,
        () => {
          const r = runMatch({ seed, ai: o.ai, local: o.local, localCharacter: o.rotate ? 'rotate' : undefined })
          rows.push(r)
          expect(r.reason).toBeTruthy()
        },
        MATCH_TIMEOUT_MS,
      )
    }
    it('report', () => {
      expect(rows.length).toBe(o.seeds.length)
      const sum = summarize(o.name, rows)
      console.log(`\n## ${o.name}\n\n${formatSummary([sum])}\n\n${formatRows(rows)}\n`)
      o.assert?.(sum, rows)
    })
    afterAll(() => {
      collected.delete(o.name)
    })
  })
}
