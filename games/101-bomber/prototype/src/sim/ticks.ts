import type { BomberConfig, ProtoRules } from '../contract'
import { msToTicks } from '../contract'

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
  /** 安全圈各段相对决赛圈开始的生效 Tick 与边长。 */
  ringStages: readonly { at: number; size: number }[]
  poison: number
  settlement: number
  regenInterval: number
  regenStopBeforeFinal: number
  deathDropProtect: number
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
    ringStages: rules.ringStages.map((s) => ({ at: msToTicks(s.atMs, hz), size: s.size })),
    poison: Math.max(1, msToTicks(rules.poisonIntervalMs, hz)),
    settlement: Math.max(1, msToTicks(rules.settlementMs, hz)),
    regenInterval: Math.max(1, msToTicks(rules.regenIntervalMs, hz)),
    regenStopBeforeFinal: msToTicks(rules.regenStopBeforeFinalMs, hz),
    deathDropProtect: msToTicks(rules.deathDropProtectMs, hz),
  }
}
