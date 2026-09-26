import { defineStatsSuite, envSeeds } from './harness/stats-suite'

/** 统计批次（BOMBER_STATS=1，只报告）：'player' 档对 7 个简单档 Bot，本机角色逐局轮换。 */
defineStatsSuite({ name: 'easy · player vs 7 easy', ai: 'easy', local: 'player', rotate: true, seeds: envSeeds(30) })
