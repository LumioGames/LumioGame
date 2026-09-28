import { expect } from 'vitest'
import { defineStatsSuite, envMap, envSeeds } from './harness/stats-suite'

/** 验收 E 的门槛（ADR 0043；不得在本工具里放宽）。4 分钟 = 现行局时封顶（ADR 0035），写死是为了封顶改了门槛不跟着松。 */
const E_SOLE_MIN = 0.85
const E_AVG_MAX_MIN = 4

/**
 * 统计批次 E（BOMBER_STATS=1，`pnpm stats`；ADR 0043 起为 16 人 · 27×27）：20 个种子全员普通档（0 号位自动驾驶 normal 档），
 * 验收 E 的大样本口径：唯一存活 ≥ 85%、平均局长 ≤ 4 分钟、1×1 每局可进入。
 * 时间到的存活中位只报告（ADR 0043 的 E 不含它）。
 */
defineStatsSuite({
  name: 'E · 20 种子 · 全员 normal',
  ai: 'normal',
  map: envMap(27),
  softTargets: 'none',
  local: 'normal',
  seeds: envSeeds(20),
  assert: (s) => {
    expect(s.avgLengthMin).toBeLessThanOrEqual(E_AVG_MAX_MIN)
    expect(s.soleSurvivorRate).toBeGreaterThanOrEqual(E_SOLE_MIN)
    expect(s.enterable1x1All).toBe(true)
  },
})
