import { msToTicks, type AnimalId, type MatchEndReason } from '../contract'
import type { FinalRow } from './ranking'

/**
 * 领奖台（design §13，ADR 0031）的纯逻辑：台上三块名牌、顶部「本局冠军」+ 结束原因、底部本人名次一句话，
 * 以及「领奖台 → 结算表」的切换时刻。DOM 在 podium-view.ts。
 * D2「活到最后者赢」：名次 1 的都是冠军（并列第 1 都戴冠），0 帽的唯一幸存者照样是冠军。
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
  /** 本局冠军：名次 1（并列第 1 都算，与帽数无关，RESOLUTIONS #11）。 */
  isWinner: boolean
  /** 活到了最后。 */
  survived: boolean
}

export interface PodiumHeadline {
  title: string
  sub: string
}

export interface PodiumModel {
  plates: PodiumPlate[]
  /** 本人名次一句话；本人不在名单里（纯观战）时为空串。 */
  localLine: string
  /** 本人是否站上领奖台。 */
  localOnStage: boolean
  localRank: number | null
  total: number
  headline: PodiumHeadline
}

const STEPS: readonly PodiumStep[] = ['first', 'second', 'third']

/** 领奖台标题 + 结束原因（唯一存活 / 时间到 / 同归于尽）；原因未知时只说规则。 */
export function podiumHeadline(reason: MatchEndReason | null): PodiumHeadline {
  const title = '本局冠军'
  switch (reason) {
    case 'lastSurvivor':
      return { title, sub: '唯一存活 · 活到最后者赢' }
    case 'timeUp':
      return { title, sub: '时间到 · 存活者里帽子最多' }
    case 'allDown':
      return { title, sub: '同归于尽 · 最后倒下的并列第一' }
    default:
      return { title, sub: '活到最后者赢' }
  }
}

/** 结束原因的短名：「唯一存活」/「时间到」/「同归于尽」。 */
export const END_REASON_LABEL: Readonly<Record<MatchEndReason, string>> = { lastSurvivor: '唯一存活', timeUp: '时间到', allDown: '同归于尽' }

/** 结算表标题下的规则行：「活到最后者赢 · 时间到时存活者比帽子，并列同名次 · 本局：唯一存活」。 */
export function resultsRuleLine(reason: MatchEndReason | null): string {
  const base = '活到最后者赢 · 时间到时存活者比帽子，并列同名次'
  return reason ? `${base} · 本局：${END_REASON_LABEL[reason]}` : base
}

/** 按 `rankFinal` 的站位顺序取前三行上台；名次 1 的都是冠军。 */
export function podiumModel(rows: readonly FinalRow[], reason: MatchEndReason | null = null): PodiumModel {
  const plates = rows.slice(0, 3).map(
    (r, i): PodiumPlate => ({
      step: STEPS[i],
      rank: r.rank,
      name: r.name,
      hats: r.hats,
      animal: r.animal,
      slot: r.slot,
      isLocal: r.isLocal,
      isWinner: r.rank === 1,
      survived: r.survived,
    }),
  )
  const idx = rows.findIndex((r) => r.isLocal)
  const me = idx >= 0 ? rows[idx] : undefined
  const onStage = idx >= 0 && idx < 3
  const tied = !!me && rows.some((r) => r !== me && r.rank === me.rank)
  const localLine = !me ? '' : onStage ? `你拿到了第 ${me.rank} 名！` : `你的名次：${tied ? '并列' : ''}第 ${me.rank} 名 / 共 ${rows.length} 人`
  return { plates, localLine, localOnStage: onStage, localRank: me?.rank ?? null, total: rows.length, headline: podiumHeadline(reason) }
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
