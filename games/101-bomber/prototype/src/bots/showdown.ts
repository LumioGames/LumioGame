import { poisonPointsAt, type BomberConfig, type BotTactics, type FinalCircleView, type ProtoRules, type RingRect, type U64 } from '../contract'
import { cellIndexOf, enemyCanEscape, isActiveEnemy, protectedAtDetonation, type ThinkContext } from './behaviors'
import type { BombEvaluation } from './bomb-gate'
import type { DangerMap } from './danger-map'

/**
 * 原型扩展（NON-CONTRACT，ADR 0031；design §15 Bot 难度分档（原型工具））：决赛圈「摊牌期」战术。
 * 5×5 生效起（毒翻倍，D7）所有难度都用：晚进圈（圈外格待到下一次收缩前 lateEntryTicks）、
 * 以血换血（自己也吃这颗弹，但结果严格领先或直接打死对手才放）、先打最弱的、每段毒伤按段读。
 */

export const ringSide = (r: RingRect): number => r.Max - r.Min + 1

/** 当前安全圈边长 ≤ showdownRingSide 即摊牌期。 */
export function isShowdown(fc: FinalCircleView | null, t: Pick<BotTactics, 'showdownRingSide'>): boolean {
  return fc !== null && ringSide(fc.ring) <= t.showdownRingSide
}

/** 圈外每跳毒伤（半心点）：当前段与已预告的下一段取大（缩圈前就按更痛的算）；不在决赛圈 = 基础值。 */
export function poisonRate(rules: Pick<ProtoRules, 'ringStages' | 'poisonPointsPerInterval'>, fc: FinalCircleView | null): number {
  if (!fc) return rules.poisonPointsPerInterval
  const cur = poisonPointsAt(rules, fc.stageIndex)
  return fc.nextRing ? Math.max(cur, poisonPointsAt(rules, fc.stageIndex + 1)) : cur
}

/**
 * 晚进圈的「可待」门槛：摊牌期且已预告下一圈时 = now + lateEntryTicks（下一圈外的格子在收缩前 lateEntryTicks
 * 之前都算可待，留着逃生空间继续打）；否则 null（= 只接受永不进毒圈的格子）。
 */
export function lateEntryHorizon(fc: FinalCircleView | null, t: Pick<BotTactics, 'showdownRingSide' | 'lateEntryTicks'>, now: number): number | null {
  if (!fc || !fc.nextRing || !isShowdown(fc, t)) return null
  return now + t.lateEntryTicks
}

/** 站在格 c 的人会被危险图里的炸弹（含假想弹）一共打掉几点血：每颗罩住 c 的弹 bombDamagePoints，封顶满血。 */
export function hitPoints(dm: DangerMap, c: number, cfg: Pick<BomberConfig, 'maxHealthPoints'>, rules: Pick<ProtoRules, 'bombDamagePoints'>): number {
  let n = 0
  for (const cov of dm.cover) if (cov.includes(c)) n++
  return Math.min(cfg.maxHealthPoints, n * rules.bombDamagePoints)
}

export interface TradeVerdict {
  ok: boolean
  /** 自己吃的点数（泡泡护体 = 0）。 */
  selfPoints: number
  victims: readonly U64[]
}

/**
 * 以血换血（在放弹自检没过时才问）：这颗弹放下后自己逃不掉，但
 * - 自己吃完至少还剩 1 点（泡泡护体则不掉血），且
 * - 十字里有逃不掉（含现成技能、毒圈感知）的对手，吃完之后要么倒下，要么血量严格低于自己
 *   （非致命换血还要求自己剩 ≥ tradeMinHpLeft；同血换血只在自己剩 ≥ tieTradeMinHp 时，缺省关）。
 * 换血总是让自己活着，所以不会造成「全员倒下」。
 */
export function evaluateTrade(ctx: ThinkContext, ev: BombEvaluation, shielded: boolean): TradeVerdict {
  const no: TradeVerdict = { ok: false, selfPoints: 0, victims: [] }
  const selfPoints = shielded ? 0 : hitPoints(ev.dm, ctx.here, ctx.config, ctx.rules)
  const me = ctx.me.玩家属性.血量当前 - selfPoints
  if (me < 1) return { ...no, selfPoints }
  const mine = ev.dm.cover[ev.dm.cover.length - 1] ?? []
  const victims: U64[] = []
  let ok = false
  for (const e of ctx.snap.Players) {
    if (!isActiveEnemy(ctx, e) || protectedAtDetonation(ctx, e)) continue
    const c = cellIndexOf(ctx.board, e.LogicTransform.WorldPosition)
    if (c < 0 || !mine.includes(c)) continue
    if (enemyCanEscape(ev.board, ev.dm, e, ctx, true)) continue
    const v = e.玩家属性.血量当前 - hitPoints(ev.dm, c, ctx.config, ctx.rules)
    if (v <= 0 || (v < me && me >= ctx.tactics.tradeMinHpLeft) || (v === me && me >= ctx.tactics.tieTradeMinHp)) {
      ok = true
      victims.push(e.NetEntityIdRaw)
    }
  }
  return { ok, selfPoints, victims }
}
