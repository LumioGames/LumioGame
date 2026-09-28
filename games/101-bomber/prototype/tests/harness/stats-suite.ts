import { afterAll, describe, expect, it } from 'vitest'
import { parseMapTier, type BotDifficulty, type BotProfileId, type MapTierId } from '../../src/contract'
import type { HighlightProbeFactory } from './m1-metrics'
import { formatRows, formatSummary, lineupOf, rulesOf, runMatch, summarize, type MatchStats, type StatsSummary } from './match-runner'

/**
 * 统计批次的公共壳（原型扩展 NON-CONTRACT，design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13）：
 * 只在 BOMBER_STATS=1 时跑；一局一个 it（各自有超时），最后一个 it 打印交付表（含 M1 报告项）并跑断言。
 */
export const STATS_ON = process.env.BOMBER_STATS === '1'
export const ACCEPT_ON = process.env.BOMBER_ACCEPT === '1'

/**
 * 一局的超时。只是卡死探测（runMatch 自己另有 maxTicks 守卫）：8 人 19 档实测约 2 秒 / 局，
 * 16 人 · 27×27（ADR 0040 / 0043）Bot 与格子都翻倍，按 ≥ 4 倍估、再留足余量（原 180 s）。
 */
export const MATCH_TIMEOUT_MS = 600_000

/**
 * 高光卡接入点（ADR 0043；分配逻辑归 M1-4 `src/present/highlight-cards.ts`）：所有批次缺省用它。
 * null = 还没接上，报告里高光卡覆盖率打 N/A 并写明原因；接上后换成把 M1-4 的分配逻辑包成 {@link HighlightProbeFactory} 的工厂。
 */
export const HIGHLIGHT_PROBE: HighlightProbeFactory | null = null

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

/**
 * 方向 B 批次的地图档：缺省 `fallback`（新 D / E = 27）；环境变量 BOMBER_STATS_MAP=19|23|27 可覆盖——只用于本地排查
 * （例如规则层还不支持 16 人时先在 19 档跑通管线）。人数随档默认、阵容随人数，批次标题里写明实际的档与人数；交付数字一律用缺省档。
 */
export function envMap(fallback: MapTierId): MapTierId {
  return parseMapTier(process.env.BOMBER_STATS_MAP ?? null, fallback)
}

const TIER_NAME: Readonly<Record<BotDifficulty, string>> = { rookie: '菜鸟', easy: '简单', normal: '普通', hard: '困难' }

/** 「菜鸟 7 / 普通 6 / 困难 2 · 16 人 27×27」：阵容按出现顺序计数，外加档与人数。 */
export function describeRun(o: Pick<StatsSuiteOptions, 'ai' | 'lineup' | 'map' | 'players'>): string {
  const rules = rulesOf(o)
  const lineup = lineupOf(o, rules.playerCount - 1)
  const counts = new Map<BotDifficulty, number>()
  for (const d of lineup) counts.set(d, (counts.get(d) ?? 0) + 1)
  const who = [...counts].map(([d, k]) => `${TIER_NAME[d]} ${k}`).join(' / ')
  return `${who} · ${rules.playerCount} 人 ${rules.map.size}×${rules.map.size}`
}

export interface StatsSuiteOptions {
  name: string
  /** 全体 Bot 的难度（缺省 normal）。 */
  ai?: BotDifficulty
  /** 逐个 Bot 的难度，或 'default' = contract lineupFor（ADR 0043 默认阵容）。 */
  lineup?: readonly BotDifficulty[] | 'default'
  /** 地图档；缺省 = 旧的 19 档。 */
  map?: MapTierId
  /** 总人数；缺省 = 地图档默认。 */
  players?: number
  /** 本机自动驾驶档。 */
  local: BotProfileId
  seeds: readonly number[]
  /** 本机角色逐局轮换（CHARACTER_ORDER[seed % 4]）；否则 rabbit。 */
  rotate?: boolean
  /** 缺省 BOMBER_STATS=1。 */
  enabled?: boolean
  /** 缺省 {@link HIGHLIGHT_PROBE}。 */
  highlight?: HighlightProbeFactory | null
  assert?: (s: StatsSummary, rows: readonly MatchStats[]) => void
}

/** 已跑完的批次（同一个进程里多个 suite 共用时按 label 区分）。 */
export const collected = new Map<string, MatchStats[]>()

export function defineStatsSuite(o: StatsSuiteOptions): void {
  const on = o.enabled ?? STATS_ON
  const label = `${o.name}（${describeRun(o)}）`
  describe.runIf(on)(label, () => {
    const rows: MatchStats[] = []
    collected.set(o.name, rows)
    for (const seed of o.seeds) {
      it(
        `seed ${seed}`,
        () => {
          const r = runMatch({
            seed,
            ai: o.ai,
            lineup: o.lineup,
            map: o.map,
            players: o.players,
            local: o.local,
            localCharacter: o.rotate ? 'rotate' : undefined,
            highlight: o.highlight === undefined ? HIGHLIGHT_PROBE : o.highlight,
          })
          rows.push(r)
          expect(r.reason).toBeTruthy()
        },
        MATCH_TIMEOUT_MS,
      )
    }
    it('report', () => {
      expect(rows.length).toBe(o.seeds.length)
      const sum = summarize(label, rows)
      console.log(`\n## ${label}\n\n${formatSummary([sum])}\n\n${formatRows(rows)}\n`)
      o.assert?.(sum, rows)
    })
    afterAll(() => {
      collected.delete(o.name)
    })
  })
}
