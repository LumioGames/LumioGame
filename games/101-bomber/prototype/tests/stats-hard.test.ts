import { defineStatsSuite, envSeeds } from './harness/stats-suite'

/** 统计批次（BOMBER_STATS=1，只报告）：'player' 档对 7 个困难档 Bot（= 第 3 轮强度），本机角色逐局轮换。 */
defineStatsSuite({ name: 'hard · player vs 7 hard', ai: 'hard', local: 'player', rotate: true, seeds: envSeeds(30) })
