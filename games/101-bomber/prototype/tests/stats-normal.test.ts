import { expect } from 'vitest'
import { defineStatsSuite, envSeeds } from './harness/stats-suite'

/**
 * 统计批次 D（BOMBER_STATS=1，`pnpm stats`）：「普通水平的脚本玩家」= 'player' 档（反应 3–5 Tick、噪声 5%、
 * 不设陷阱、1 颗进攻弹、farmer、按时进圈；调参前固定）对 7 个普通档 Bot，100 局（种子 1–100；ADR 0036 起由 30 局扩到 100 局），
 * 本机角色逐局轮换；前 3 名 ≥ 50%。
 */
defineStatsSuite({
  name: 'D · player vs 7 normal',
  ai: 'normal',
  local: 'player',
  rotate: true,
  seeds: envSeeds(100),
  assert: (s) => {
    expect(s.matches).toBeGreaterThanOrEqual(100)
    expect(s.localTop3Rate).toBeGreaterThanOrEqual(0.5)
  },
})
