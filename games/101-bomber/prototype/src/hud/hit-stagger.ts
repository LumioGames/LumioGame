import { DeathCause, type BomberEvent, type U64 } from '../contract'
import { heartDelta } from './format'

/**
 * 连锁扣心的表现节奏（design §7.5 / ADR 0014「连锁可解释」）：同一 Tick 结算的多次命中，
 * HUD 的心、受击红晕、死亡回顾都按 view 的爆炸节奏逐颗落下——链内第 i 颗延迟 40·i ms，封顶 320 ms。
 * 链内顺序优先用 `BombExploded.proto.IndexInChain`；缺席时按本人受击的到达顺序排（至少保持逐颗节奏）。
 */
export const CHAIN_STEP_MS = 40
export const CHAIN_CAP_MS = 320
/** 最后一击落下后多久弹死亡回顾（与 view 的玩偶散架同口径）。 */
export const DEATH_AFTER_LAST_HIT_MS = 90

export function chainDelayMs(index: number): number {
  return Math.min(Math.max(0, index) * CHAIN_STEP_MS, CHAIN_CAP_MS)
}

export type HitCause = 'bomb' | 'drown' | 'poison' | 'burn'

export interface StaggeredHit {
  delayMs: number
  points: number
  /** 这一击落下后应显示的血量（半心点）。 */
  hpAfter: number
  owner: U64
  chainId: U64
  bomb: U64
  cause: HitCause
}

function causeOf(e: Extract<BomberEvent, { type: 'DamageApplied' }>): HitCause {
  const c = e.proto?.Cause
  if (c === DeathCause.Poison) return 'poison'
  if (c === DeathCause.Drown) return 'drown'
  if (c === DeathCause.Burn) return 'burn'
  if (c === undefined && e.SourceBombNetEntityIdRaw === 0) return 'drown'
  return 'bomb'
}

/**
 * 一个 Tick 批次的事件 → 本人受到的每一击，按表现顺序排好，带延迟与逐击血量。
 * @param hpBefore 本批之前本人的血量（未知时由事件反推）。
 */
export function staggerLocalHits(events: readonly BomberEvent[], localId: U64, hpBefore: number | null, pointsPerHeart: number): StaggeredHit[] {
  const hints = new Map<U64, number>()
  for (const e of events) if (e.type === 'BombExploded' && e.proto) hints.set(e.proto.BombNetEntityIdRaw, e.proto.IndexInChain)
  const perChain = new Map<U64, number>()
  let running = hpBefore
  const raw: (Omit<StaggeredHit, 'hpAfter'> & { seq: number; left: number })[] = []
  for (const e of events) {
    if (e.type !== 'DamageApplied' || e.VictimNetEntityIdRaw !== localId) continue
    const points = e.proto?.Points ?? (running !== null ? Math.max(0, running - e.HealthPointsLeft) : pointsPerHeart)
    running = e.HealthPointsLeft
    const cause = causeOf(e)
    let index = 0
    if (cause === 'bomb' && e.ChainId !== 0) {
      const k = perChain.get(e.ChainId) ?? 0
      perChain.set(e.ChainId, k + 1)
      index = hints.get(e.SourceBombNetEntityIdRaw) ?? k
    }
    raw.push({
      delayMs: cause === 'bomb' ? chainDelayMs(index) : 0,
      points,
      owner: e.SourceBombOwnerNetEntityIdRaw,
      chainId: e.ChainId,
      bomb: e.SourceBombNetEntityIdRaw,
      cause,
      seq: raw.length,
      left: e.HealthPointsLeft,
    })
  }
  if (raw.length === 0) return []
  const finalHp = Math.max(0, raw[raw.length - 1].left)
  const total = raw.reduce((a, h) => a + h.points, 0)
  const start = hpBefore ?? finalHp + total
  raw.sort((a, b) => a.delayMs - b.delayMs || a.seq - b.seq)
  let hp = start
  return raw.map(({ seq: _seq, left: _left, ...h }) => {
    hp -= h.points
    return { ...h, hpAfter: Math.max(finalHp, hp, 0) }
  })
}

/** 这一批里最后一击的延迟（没有命中时为 0）。 */
export function lastHitDelayMs(hits: readonly StaggeredHit[]): number {
  return hits.reduce((m, h) => Math.max(m, h.delayMs), 0)
}

/**
 * 心的显示值：有尚未落下的逐击时按时间表显示，全部落下后回到快照血量（快照才是真值）。
 */
export class HeartTrack {
  private steps: { at: number; hp: number }[] = []
  private base: number | null = null

  schedule(now: number, hpBefore: number, hits: readonly StaggeredHit[]): void {
    if (hits.length === 0) return
    if (this.steps.length === 0) this.base = hpBefore
    for (const h of hits) this.steps.push({ at: now + h.delayMs, hp: h.hpAfter })
    this.steps.sort((a, b) => a.at - b.at)
  }

  displayed(now: number, snapshotHp: number): number {
    if (this.steps.length === 0) return snapshotHp
    if (this.steps[this.steps.length - 1].at <= now) {
      this.clear()
      return snapshotHp
    }
    let shown = this.base ?? snapshotHp
    for (const s of this.steps) if (s.at <= now) shown = s.hp
    return shown
  }

  pending(now: number): boolean {
    return this.steps.some((s) => s.at > now)
  }

  clear(): void {
    this.steps = []
    this.base = null
  }
}

/**
 * 活着挨炸时的实时来源提示（design §9.6「伤害来源与连锁归属实时提示」）：
 * 「被 豆豆熊 的连锁 ×3 命中 −1 心」/「被 豆豆熊 的炸弹命中 −1 心」/「被你自己的炸弹命中 −1 心」。
 * 取本批扣血最多的一条链；溺水 / 毒圈有各自的常驻提示，这里不重复。
 */
export function hitHintText(
  hits: readonly StaggeredHit[],
  chainBombs: (chainId: U64) => number,
  nameOf: (id: U64) => string,
  localId: U64,
  pointsPerHeart: number,
): string | null {
  const groups = new Map<string, StaggeredHit[]>()
  for (const h of hits) {
    if (h.cause !== 'bomb') continue
    const key = h.chainId !== 0 ? `c${h.chainId}` : `b${h.bomb}`
    const g = groups.get(key)
    if (g) g.push(h)
    else groups.set(key, [h])
  }
  let best: StaggeredHit[] | null = null
  let bestPts = -1
  for (const g of groups.values()) {
    const pts = g.reduce((a, h) => a + h.points, 0)
    if (pts > bestPts) {
      best = g
      bestPts = pts
    }
  }
  if (!best) return null
  const owners = [...new Set(best.map((h) => h.owner))]
  const other = owners.find((o) => o !== localId)
  const src = other === undefined ? '你自己' : ` ${nameOf(other)}${owners.length > 1 ? ' 等人' : ''} `
  const n = best[0].chainId !== 0 ? Math.max(chainBombs(best[0].chainId), best.length) : 1
  const dmg = heartDelta(bestPts, pointsPerHeart)
  return n >= 2 ? `被${src}的连锁 ×${n} 命中 ${dmg}` : `被${src}的炸弹命中 ${dmg}`
}
