import { msToTicks, type AnimalId } from '../contract'
import type { FinalRow } from './ranking'

/**
 * 领奖台（design §13）的纯逻辑：台上三块名牌、顶部「本局帽王」、底部本人名次一句话，
 * 以及「领奖台 → 结算表」的切换时刻。DOM 在 podium-view.ts。
 */

/** 台阶位置：1st 居中最高、2nd 在左、3rd 在右（与 view 的积木领奖台一致）。 */
export type PodiumStep = 'first' | 'second' | 'third'

export interface PodiumPlate {
  step: PodiumStep
  /** 竞赛名次（并列同名次，所以两块名牌可能都是「第 1 名」）。 */
  rank: number
  name: string
  hats: number
  animal: AnimalId
  slot: number
  isLocal: boolean
  /** 本局帽王（名次 1 且至少 1 顶帽；全员 0 帽时台上没有帽王）。 */
  isWinner: boolean
}

export interface PodiumModel {
  plates: PodiumPlate[]
  /** 本人名次一句话；本人不在名单里（纯观战）时为空串。 */
  localLine: string
  /** 本人是否站上领奖台。 */
  localOnStage: boolean
  localRank: number | null
  total: number
}

const STEPS: readonly PodiumStep[] = ['first', 'second', 'third']

/** 按 `rankFinal` 的展示顺序取前三行上台；并列第一（且有帽）的都算「本局帽王」。 */
export function podiumModel(rows: readonly FinalRow[]): PodiumModel {
  const plates = rows.slice(0, 3).map(
    (r, i): PodiumPlate => ({
      step: STEPS[i],
      rank: r.rank,
      name: r.name,
      hats: r.hats,
      animal: r.animal,
      slot: r.slot,
      isLocal: r.isLocal,
      isWinner: r.rank === 1 && r.hats > 0,
    }),
  )
  const idx = rows.findIndex((r) => r.isLocal)
  const me = idx >= 0 ? rows[idx] : undefined
  const onStage = idx >= 0 && idx < 3
  const tied = !!me && rows.some((r) => r !== me && r.rank === me.rank)
  const localLine = !me ? '' : onStage ? `你拿到了第 ${me.rank} 名！` : `你的名次：${tied ? '并列' : ''}第 ${me.rank} 名 / 共 ${rows.length} 人`
  return { plates, localLine, localOnStage: onStage, localRank: me?.rank ?? null, total: rows.length }
}

/** 名牌文案：「第 1 名 · 名字」（帽数单独用内联 SVG 帽子图标 + ×N 渲染，不用 emoji）。 */
export function plateTitle(p: PodiumPlate): string {
  const name = p.isLocal && p.name !== '你' ? `${p.name}（你）` : p.name
  return `第 ${p.rank} 名 · ${name}`
}

/** 领奖台结束、结算表出现的 Tick：MatchEnded.Tick + podiumMs（向上取整成 Tick）。 */
export function podiumEndTick(matchEndedTick: number, podiumMs: number, tickRateHz: number): number {
  return matchEndedTick + msToTicks(Math.max(0, podiumMs), tickRateHz)
}

/** 结算阶段此刻该显示什么。podiumMs = 0 时直接是结算表。 */
export function settlementScene(renderTick: number, matchEndedTick: number, podiumMs: number, tickRateHz: number): 'podium' | 'results' {
  return renderTick + 1e-6 < podiumEndTick(matchEndedTick, podiumMs, tickRateHz) ? 'podium' : 'results'
}
