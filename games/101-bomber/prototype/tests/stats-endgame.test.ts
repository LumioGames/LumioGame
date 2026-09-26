import { expect } from 'vitest'
import { defineStatsSuite, envSeeds } from './harness/stats-suite'

/**
 * 统计批次 E（BOMBER_STATS=1，`pnpm stats`）：20 个种子全员普通档（0 号位自动驾驶 normal 档），验收 E 的大样本口径：
 * 唯一存活 ≥ 85%、时间到的存活中位 ≤ 2、1×1 每局可进入、平均局长 ≤ 7 分钟（ADR 0031）。
 */
defineStatsSuite({
  name: 'E · 20 种子 · 全员 normal',
  ai: 'normal',
  local: 'normal',
  seeds: envSeeds(20),
  assert: (s) => {
    expect(s.avgLengthMin).toBeLessThanOrEqual(7)
    expect(s.soleSurvivorRate).toBeGreaterThanOrEqual(0.85)
    if (s.timeUpSurvivorsMedian !== null) expect(s.timeUpSurvivorsMedian).toBeLessThanOrEqual(2)
    expect(s.enterable1x1All).toBe(true)
  },
})
