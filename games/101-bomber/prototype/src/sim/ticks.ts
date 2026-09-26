import type { BomberConfig, ProtoRules, SkillId } from '../contract'
import { msToTicks, SKILL_IDS } from '../contract'

/** 一个技能等级换算成 Tick 的参数（0 = 不用；interval 非 0 时 ≥ 1）。 */
export interface SkillTickRow {
  cd: number
  duration: number
  interval: number
  freeze: number
}

/** 配表毫秒 → Tick 的一次性换算（契约 §2.2：不在玩法里手写 `ms / 50`）。 */
export interface TickTable {
  fuse: number
  danger: number
  inputBuffer: number
  respawn: number
  protection: number
  drown: number
  match: number
  warmup: number
  /** 决赛圈固定时长；时间触发 = 距 EndTick ≤ 它。 */
  finalCircle: number
  ringPreview: number
  /** 安全圈各段相对决赛圈开始的生效 Tick、边长与三个标志（ADR 0031）。 */
  ringStages: readonly { at: number; size: number; chest: boolean; clearInside: boolean; poisonPoints: number }[]
  poison: number
  settlement: number
  regenInterval: number
  regenStopBeforeFinal: number
  deathDropProtect: number
  // ---- 原型扩展（NON-CONTRACT，ADR 0030）----
  burnInterval: number
  /** 原型扩展（NON-CONTRACT，ADR 0033）：中毒掉血间隔（≥ 1）。 */
  toxinInterval: number
  freezeCap: number
  freezeImmune: number
  /** 被踢炸弹每 Tick 前进的千分格（floor(kickSpeedMilli / tickRateHz)）。 */
  kickMilliPerTick: number
  /** 每个技能按等级（下标 = 等级 − 1）换算好的 Tick 参数。 */
  skills: Readonly<Record<SkillId, readonly SkillTickRow[]>>
}

export function tickTable(cfg: BomberConfig, rules: ProtoRules): TickTable {
  const hz = cfg.tickRateHz
  return {
    fuse: msToTicks(cfg.fuseMs, hz),
    danger: msToTicks(cfg.dangerWindowMs, hz),
    inputBuffer: msToTicks(cfg.inputBufferMs, hz),
    respawn: msToTicks(cfg.respawnMs, hz),
    protection: msToTicks(cfg.respawnProtectionMs, hz),
    drown: Math.max(1, msToTicks(cfg.drownIntervalMs, hz)),
    match: msToTicks(cfg.matchDurationMs, hz),
    warmup: msToTicks(rules.warmupMs, hz),
    finalCircle: msToTicks(rules.finalCircleMs, hz),
    ringPreview: msToTicks(rules.ringPreviewMs, hz),
    ringStages: rules.ringStages.map((s) => ({
      at: msToTicks(s.atMs, hz),
      size: s.size,
      chest: s.chest,
      clearInside: s.clearInside,
      poisonPoints: s.poisonPoints,
    })),
    poison: Math.max(1, msToTicks(rules.poisonIntervalMs, hz)),
    settlement: Math.max(1, msToTicks(rules.settlementMs, hz)),
    regenInterval: Math.max(1, msToTicks(rules.regenIntervalMs, hz)),
    regenStopBeforeFinal: msToTicks(rules.regenStopBeforeFinalMs, hz),
    deathDropProtect: msToTicks(rules.deathDropProtectMs, hz),
    burnInterval: Math.max(1, msToTicks(rules.burnIntervalMs, hz)),
    toxinInterval: Math.max(1, msToTicks(rules.toxinIntervalMs, hz)),
    freezeCap: msToTicks(rules.freezeCapMs, hz),
    freezeImmune: msToTicks(rules.freezeImmuneMs, hz),
    kickMilliPerTick: Math.floor(rules.kickSpeedMilli / hz),
    skills: skillTicks(rules, hz),
  }
}

function skillTicks(rules: ProtoRules, hz: number): Record<SkillId, SkillTickRow[]> {
  const out = {} as Record<SkillId, SkillTickRow[]>
  for (const id of SKILL_IDS)
    out[id] = rules.skills[id].levels.map((l) => ({
      cd: msToTicks(l.cdMs, hz),
      duration: msToTicks(l.durationMs, hz),
      interval: l.intervalMs > 0 ? Math.max(1, msToTicks(l.intervalMs, hz)) : 0,
      freeze: msToTicks(l.freezeMs, hz),
    }))
  return out
}
