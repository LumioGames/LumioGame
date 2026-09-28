import { expect } from 'vitest'
import { defineStatsSuite, envMap, envSeeds } from './harness/stats-suite'

/** 新验收 D 的门槛（ADR 0043，design §15 Bot 分层行；推断待验证、不得在本工具里放宽）。 */
const D_TOP4_MIN = 0.5
const D_KD_MIN = 1.0
const D_MATCHES = 100

/**
 * 新验收 D（BOMBER_STATS=1，`pnpm stats`；ADR 0043，**卡门槛**）：普通水平脚本玩家（'player' 档：反应 3–5 Tick、噪声 5%、
 * 按时进圈，ADR 0036）对默认阵容（contract `lineupFor(15)` = 菜鸟 7 / 普通 6 / 困难 2，Bot 不围剿真人），16 人 · 27×27，
 * 种子 1–100，本机角色逐局轮换：**进前 4 ≥ 50%、K/D ≥ 1.0**（K/D = 本机击杀合计 / 本机死亡合计；击杀不含自杀，死亡含一切死因）；
 * 场均击杀与 M1 报告项只报告。
 */
defineStatsSuite({
  name: 'D · player vs 默认阵容',
  lineup: 'default',
  map: envMap(27),
  local: 'player',
  rotate: true,
  seeds: envSeeds(D_MATCHES),
  assert: (s) => {
    expect(s.matches).toBeGreaterThanOrEqual(D_MATCHES)
    expect(s.localTop4Rate).toBeGreaterThanOrEqual(D_TOP4_MIN)
    expect(s.localKD).toBeGreaterThanOrEqual(D_KD_MIN)
  },
})
