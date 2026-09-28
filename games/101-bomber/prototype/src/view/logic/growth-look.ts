import type { PlayerView, ResourceBoxTier, ResourceBoxView, SupplyView } from '../../contract'

/**
 * 方向 B「成长爽局」的外观纯逻辑（ADR 0039 / 0040，design §5.0 / §8.5 / §8.6）：资源箱等级按格、狂暴红光、
 * 金心环绕、中央补给光柱。全部只读快照里的 NON-CONTRACT 可选字段，缺席时退化为「没有」（木箱 / 不狂暴 / 无补给）。
 * 表现取值，推断待验证。无 three 依赖，可在 node 下单测。
 */

/** 资源箱等级编码（地形按格存一份，0 = 木）。 */
export const TIER_CODE: Readonly<Record<ResourceBoxTier, number>> = { wood: 0, iron: 1, gold: 2 }

/** 快照资源箱 → 按格下标（Y·size + X）索引；缺席 = 空（砖层是木箱的格按木箱 1 / 1 处理）。 */
export function resourceBoxIndex(boxes: readonly ResourceBoxView[] | undefined, size: number): Map<number, ResourceBoxView> {
  const out = new Map<number, ResourceBoxView>()
  for (const b of boxes ?? []) out.set(b.Cell.Y * size + b.Cell.X, b)
  return out
}

export function tierCode(b: ResourceBoxView | undefined): number {
  return b ? TIER_CODE[b.tier] : TIER_CODE.wood
}

export interface HeadHeartBar {
  /** 亮着的整心数（向上取整）；−1 = 不显示。 */
  pips: number
  /** 格数 = 心数上限（整心）。 */
  pipMax: number
  /** 最上面几格是金心。 */
  pipGold: number
  boss: boolean
}

/**
 * 头顶心条（design §12 残血表现，ADR 0039）：Boss（上限 ≥ bossMinHearts 心）活着就常驻；其余玩家只在受击后 3 秒显示
 * （hitRecent）。格数 = 本人上限，最上面 goldHearts 格为金心。
 */
export function headHeartBar(hp: number, maxHp: number, perHeart: number, goldHearts: number, bossMinHearts: number, hitRecent: boolean): HeadHeartBar {
  const per = Math.max(1, perHeart)
  const pipMax = Math.max(1, Math.floor(maxHp / per))
  const boss = pipMax >= bossMinHearts
  const shown = hp > 0 && (boss || hitRecent)
  return { pips: shown ? Math.ceil(hp / per) : -1, pipMax, pipGold: Math.max(0, Math.min(pipMax, goldHearts)), boss }
}

/** 狂暴全身红光（ADR 0040）。 */
export const FRENZY_LOOK = {
  color: 0xff3b2f,
  glowMin: 0.35,
  glowMax: 0.6,
  pulseHz: 3,
} as const

export function frenzyActive(p: Pick<PlayerView, 'frenzyUntilTick'>, renderTick: number): boolean {
  const until = p.frenzyUntilTick ?? 0
  return until > 0 && renderTick < until
}

/** 红光强度：3 Hz 脉动（亮 / 暗，不熄灭，照顾光敏）。 */
export function frenzyGlow(nowMs: number): number {
  const k = 0.5 + 0.5 * Math.sin((nowMs / 1000) * Math.PI * 2 * FRENZY_LOOK.pulseHz)
  return FRENZY_LOOK.glowMin + (FRENZY_LOOK.glowMax - FRENZY_LOOK.glowMin) * k
}

/** 金心环绕（ADR 0039：玩偶身边环绕金心）：半径不超出 0.7 格脚印，腰部高度，慢转。 */
export const GOLD_ORBIT = {
  radius: 0.34,
  /** 离地高度（世界单位）。 */
  height: 0.62,
  /** 上下浮动幅度。 */
  bob: 0.05,
  /** 转速（圈 / 秒）。 */
  rev: 0.35,
  /** 心的大小。 */
  size: 0.42,
} as const

/** 第 i 颗（共 n 颗）金心相对玩偶脚底中心的位置。 */
export function goldOrbitPoint(i: number, n: number, nowMs: number): { x: number; y: number; z: number } {
  const t = nowMs / 1000
  const a = t * Math.PI * 2 * GOLD_ORBIT.rev + (i / Math.max(1, n)) * Math.PI * 2
  return {
    x: Math.cos(a) * GOLD_ORBIT.radius,
    y: GOLD_ORBIT.height + Math.sin(t * 3 + i * 2.1) * GOLD_ORBIT.bob,
    z: Math.sin(a) * GOLD_ORBIT.radius,
  }
}

export interface SupplyBeacon {
  /** 补给格中心（世界坐标）。 */
  x: number
  z: number
  /** 距开启的秒数（已开启为 0）。 */
  secLeft: number
  opened: boolean
}

/** 中央补给光柱：预告后亮起并倒计时，开启后留着光柱直到被抢完（由调用方决定何时收）；未预告 / 本档没有补给为 null。 */
export function supplyBeacon(s: SupplyView | null | undefined, renderTick: number, tickRateHz: number): SupplyBeacon | null {
  if (!s || s.state === 'pending') return null
  const opened = s.state === 'opened'
  return {
    x: s.Cell.X + 0.5,
    z: s.Cell.Y + 0.5,
    secLeft: opened ? 0 : Math.max(0, Math.ceil((s.openTick - renderTick) / tickRateHz - 1e-9)),
    opened,
  }
}
