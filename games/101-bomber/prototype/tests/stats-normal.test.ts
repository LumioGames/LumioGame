import { defineStatsSuite, envSeeds } from './harness/stats-suite'

/**
 * 统计批次 · 旧 8 人 D（BOMBER_STATS=1，`pnpm stats`，**只报告、不卡门槛**——ADR 0043 起验收 D 改为 16 人 · 27×27，见 stats-d16）：
 * 「普通水平的脚本玩家」= 'player' 档（反应 3–5 Tick、噪声 5%、不设陷阱、1 颗进攻弹、farmer、按时进圈；调参前固定，ADR 0036）
 * 对 7 个普通档 Bot，8 人 19×19，100 局（种子 1–100），本机角色逐局轮换；原门槛「前 3 名 ≥ 50%」留作对照（官方 42%）。
 */
defineStatsSuite({
  name: '旧 D（只报告）· player vs 7 normal',
  ai: 'normal',
  local: 'player',
  rotate: true,
  seeds: envSeeds(100),
})
