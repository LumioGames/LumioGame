import { describe, expect, it } from 'vitest'
import {
  BOT_PROFILES,
  BombKind,
  CHARACTER_ORDER,
  CHARACTERS,
  COMBOS,
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  PickupKind,
  SKILL_IDS,
  SKILLS,
  UNTIL_BLOCKED,
  candyPool,
  isPowerupKind,
  msToTicks,
  poisonPointsAt,
  protoConfig,
  skillParams,
  type SkillId,
  type SkillParams,
} from '../src/contract'
import { openChests } from '../src/sim/chest'
import { cell, makeWorld } from '../src/sim/__tests__/helpers'

/**
 * 策划案 ↔ 原型数值同步（第 4 轮，docs 设计 §3.8 + RESOLUTIONS）。这里钉住的每一个数都写在
 * docs/specs/bomber/design.md 与 ADR 0030 / 0031 / 0032 里；**改数值必须同一改动里同步 design.md §4 / §4.2 / §6.1 / §8 / §15**，
 * 否则这里红。注释逐条注明出处。
 */
const R = DEFAULT_RULES
const hz = DEFAULT_CONFIG.tickRateHz

describe('ADR 0031 · 7-min cap, 115 s final circle (design §4 / §4.1 / §4.2)', () => {
  it('match cap: prototype 420 s via protoConfig, contract default untouched', () => {
    // design §4「封顶 7 分钟」；RESOLUTIONS #18：契约 DEFAULT_CONFIG 仍是 360000，原型经 protoConfig() 用 ProtoRules.matchCapMs。
    expect(protoConfig().matchDurationMs).toBe(420_000)
    expect(R.matchCapMs).toBe(420_000)
    expect(DEFAULT_CONFIG.matchDurationMs).toBe(360_000)
    // ?match= 覆盖只改局时（design §15 原型工具；RESOLUTIONS #15）。
    expect(protoConfig(R, { matchDurationMs: 120_000 }).matchDurationMs).toBe(120_000)
  })

  it('final circle 115 s; regen stops 60 s before the time trigger; 10 s ring preview; resource trigger < 20 %', () => {
    // design §4.2 触发 / 时长：固定 115 秒，时间触发 = 5:05；ADR 0026 再生在距时间触发 60 秒（4:05）停止。
    expect(R.finalCircleMs).toBe(115_000)
    expect(R.regenStopBeforeFinalMs).toBe(60_000)
    expect(protoConfig().matchDurationMs - R.finalCircleMs).toBe(305_000) // 5:05
    expect(protoConfig().matchDurationMs - R.finalCircleMs - R.regenStopBeforeFinalMs).toBe(245_000) // 4:05
    // design §4.2 安全圈：每段前 10 秒画出下一圈。
    expect(R.ringPreviewMs).toBe(10_000)
    // design §4.2 触发：剩余可破坏砖 < 开局的 20%。
    expect(R.finalCircleResourcePermille).toBe(200)
  })

  it('ring stages: 13 → 9 → 7 → 5 → 3 → 1 at +10/35/55/75/95/110 s; clearing on the last three; chests except 1×1; poison doubles from 5×5', () => {
    // design §4.2 安全圈（19×19 档）。
    expect(R.ringStages.map((s) => s.size)).toEqual([13, 9, 7, 5, 3, 1])
    expect(R.ringStages.map((s) => s.atMs)).toEqual([10_000, 35_000, 55_000, 75_000, 95_000, 110_000])
    // design §4.2 末段清场：5×5 / 3×3 / 1×1 生效时清掉圈内积木与木箱。
    expect(R.ringStages.map((s) => s.clearInside)).toEqual([false, false, false, true, true, true])
    // design §4.2 强力宝箱：每段预告时落 1 个，1×1 段不落（共 5 个）。
    expect(R.ringStages.map((s) => s.chest)).toEqual([true, true, true, true, true, false])
    // design §4.2 毒圈：5×5 生效前每 1000 ms −1 点，5×5 生效起 −2 点。
    expect(R.ringStages.map((s) => s.poisonPoints)).toEqual([1, 1, 1, 2, 2, 2])
    expect(R.poisonIntervalMs).toBe(1000)
    expect(R.poisonPointsPerInterval).toBe(1)
    expect(poisonPointsAt(R, -1)).toBe(1)
    expect(poisonPointsAt(R, 3)).toBe(2)
    // 最后一段在局终前生效：+110 s 1×1，+115 s 局终（design §4.2）。
    expect(R.ringStages[R.ringStages.length - 1].atMs).toBeLessThan(R.finalCircleMs)
    expect(msToTicks(R.finalCircleMs, hz)).toBe(2300)
  })

  it('strong chest: 3 independent hits; loot = the three power-ups + a health pack + exactly one Lv1 skill candy', () => {
    // design §4.2 强力宝箱：3 次独立炸弹命中；喷出火力+ / 炸弹+ / 速度+ 各 1 + 血包 1 + 技能糖 1（Lv1，§8.2）。
    expect(R.chestHitsRequired).toBe(3)
    expect(R.chestLoot).toEqual(['FirePlus', 'BombPlus', 'SpeedPlus', 'HealthPack'])
    expect(R.chestSkillCandies).toBe(1)
    expect(R.skillCandyLevel).toBe(1)
    // 规则层实际开箱（sim/chest.ts openChests）：恰好一颗技能糖，其余是强化与血包。
    const w = makeWorld()
    w.chests.push({ id: w.nextId++, cell: cell(w, 9, 5), hitsRequired: 3, stageIndex: 0, bornTick: w.t, hitsLeft: 0, hitBy: [], opener: 0 })
    openChests(w)
    const kinds = w.pickups.map((p) => p.kind)
    expect(kinds.filter((k) => k === PickupKind.SkillCandy)).toHaveLength(1)
    expect(kinds.filter((k) => isPowerupKind(k))).toHaveLength(3)
    expect(kinds.filter((k) => k === PickupKind.HealthPack)).toHaveLength(1)
    expect(w.pickups.find((p) => p.kind === PickupKind.SkillCandy)?.level).toBe(1)
  })
})

describe('ADR 0030 · characters, skills, combos (design §8)', () => {
  it('four characters, each with exactly one exclusive skill in its slot; identical base stats', () => {
    // design §8.0 角色表：棉花兔 回春（被动）/ 泡泡鸭 泡泡（主动）/ 闪电猫 闪现（主动）/ 火焰熊 火焰光环（主动）。
    expect(CHARACTER_ORDER).toEqual(['rabbit', 'duck', 'cat', 'bear'])
    const table = CHARACTER_ORDER.map((c) => [c, CHARACTERS[c].animal, CHARACTERS[c].name, CHARACTERS[c].skill, SKILLS[CHARACTERS[c].skill].slot])
    expect(table).toEqual([
      ['rabbit', 'rabbit', '棉花兔', 'regen', 'passive'],
      ['duck', 'duck', '泡泡鸭', 'bubble', 'active'],
      ['cat', 'cat', '闪电猫', 'blink', 'active'],
      ['bear', 'bear', '火焰熊', 'fireAura', 'active'],
    ])
    expect(R.characters).toBe(CHARACTERS)
    // design §8.0「基础属性完全相同」：角色表没有任何属性字段，只差一个专属技能。
    for (const c of CHARACTER_ORDER) expect(Object.keys(CHARACTERS[c]).sort()).toEqual(['animal', 'botNames', 'id', 'name', 'skill', 'src', 'tagline'])
    // 专属技能互不相同；回春只属于棉花兔、不进池（design §8.2 / §8.4）。
    expect(new Set(CHARACTER_ORDER.map((c) => CHARACTERS[c].skill)).size).toBe(4)
    expect(SKILLS.regen.candyWeight).toBe(0)
  })

  it('three slots, base skills 3 levels, combos 1 level (design §8.1 / §8.3)', () => {
    expect(R.skillMaxLevel).toBe(3)
    for (const id of SKILL_IDS) expect(SKILLS[id].levels).toHaveLength(SKILLS[id].combo ? 1 : 3)
    const slots = Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].slot]))
    // design §8.4 表「槽」列。
    expect(slots).toEqual({
      regen: 'passive',
      bubble: 'active',
      blink: 'active',
      fireAura: 'active',
      kick: 'passive',
      freezeBomb: 'bomb',
      pierceBomb: 'bomb',
      fireDash: 'active',
      bounceBubble: 'active',
      glacierBomb: 'bomb',
    })
  })

  it('skill L1 / L2 / L3 values = design §8.4 table (RESOLUTIONS #8)', () => {
    const col = (id: SkillId, k: keyof SkillParams) => [1, 2, 3].map((lv) => skillParams(SKILLS, id, lv)[k])
    // 泡泡：持续 3 / 3.5 / 4 s，CD 18 / 15 / 12 s（design §8.4 ★ 泡泡）。
    expect(col('bubble', 'durationMs')).toEqual([3000, 3500, 4000])
    expect(col('bubble', 'cdMs')).toEqual([18_000, 15_000, 12_000])
    // 闪现：距离 3 / 3 / 4 格，CD 12 / 10 / 8 s（design §8.4 ★ 闪现）。
    expect(col('blink', 'rangeCells')).toEqual([3, 3, 4])
    expect(col('blink', 'cdMs')).toEqual([12_000, 10_000, 8000])
    // 火焰光环：持续 4 / 4.5 / 5 s，CD 20 / 17 / 14 s；每 1000 ms −2 点（−1 心 / 秒，design §8.4 ★ 火焰光环 / §12 留火）。
    expect(col('fireAura', 'durationMs')).toEqual([4000, 4500, 5000])
    expect(col('fireAura', 'cdMs')).toEqual([20_000, 17_000, 14_000])
    expect(R.burnIntervalMs).toBe(1000)
    expect(R.burnPointsPerInterval).toBe(2)
    // 回春：N = 10 / 8 / 6 s，每次回 1 心 = 2 点（design §8.4 ★ 回春 / §8.0）。
    expect(col('regen', 'intervalMs')).toEqual([10_000, 8000, 6000])
    expect(col('regen', 'points')).toEqual([2, 2, 2])
    // 踢弹：3 格 / 5 格 / 直到障碍，8 格 / 秒（design §8.4 ★ 踢弹）。
    expect(col('kick', 'rangeCells')).toEqual([3, 5, UNTIL_BLOCKED])
    expect(R.kickSpeedMilli).toBe(8000)
    // 冰冻弹：冻结 0.8 / 1.0 / 1.2 s，上限 1.2 s，之后 1 秒控制免疫；照常扣血（ADR 0030 Q1 裁定，design §8.4 ★ 冰冻弹）。
    expect(col('freezeBomb', 'freezeMs')).toEqual([800, 1000, 1200])
    expect(SKILLS.freezeBomb.bombKind).toBe(BombKind.Freeze)
    expect(R.freezeCapMs).toBe(1200)
    expect(R.freezeImmuneMs).toBe(1000)
    expect(R.freezeBombDamages).toBe(true)
    // 穿透弹：多穿 1 层 / 2 层 / 全线（design §8.4 ★ 穿透弹）。
    expect(col('pierceBomb', 'pierceLayers')).toEqual([1, 2, UNTIL_BLOCKED])
    expect(SKILLS.pierceBomb.bombKind).toBe(BombKind.Pierce)
    // 主动技能 CD 逐级不增（design §8.4「L1 → L3」）。
    for (const id of SKILL_IDS) {
      const cds = SKILLS[id].levels.map((l) => l.cdMs)
      for (let i = 1; i < cds.length; i++) expect(cds[i]).toBeLessThanOrEqual(cds[i - 1])
    }
    // 施放光环 / 火焰冲刺结束本人的重生保护（design §8.4 ★ 火焰光环、组合表 火焰冲刺；RESOLUTIONS #7）。
    expect(SKILL_IDS.filter((id) => SKILLS[id].endsProtection)).toEqual(['fireAura', 'fireDash'])
  })

  it('combo table: exactly three recipes with their slots and values (design §8.4 组合表)', () => {
    expect(COMBOS.map((c) => [c.a, c.b, c.result, SKILLS[c.result].slot])).toEqual([
      ['blink', 'fireAura', 'fireDash', 'active'],
      ['bubble', 'kick', 'bounceBubble', 'active'],
      ['freezeBomb', 'pierceBomb', 'glacierBomb', 'bomb'],
    ])
    expect(R.combos).toBe(COMBOS)
    for (const c of COMBOS) {
      expect(SKILLS[c.result].combo).toBe(true)
      expect(SKILLS[c.result].candyWeight).toBe(0)
    }
    // 火焰冲刺：距离 3 格；火墙 2 s；CD 12 s。
    expect(skillParams(SKILLS, 'fireDash', 1)).toMatchObject({ rangeCells: 3, durationMs: 2000, cdMs: 12_000 })
    // 弹射泡泡：持续 3 s；踢 5 格；CD 18 s。
    expect(skillParams(SKILLS, 'bounceBubble', 1)).toMatchObject({ durationMs: 3000, rangeCells: 5, cdMs: 18_000 })
    // 冰川弹：冻结 1 s；穿 1 层；契约 BombKind = 1（Freeze）。
    expect(skillParams(SKILLS, 'glacierBomb', 1)).toMatchObject({ freezeMs: 1000, pierceLayers: 1 })
    expect(SKILLS.glacierBomb.bombKind).toBe(BombKind.Freeze)
  })

  it('skill candy: six-skill pool with equal weights, no regen; crates half skill candy; death drops 50 %', () => {
    // design §8.2 技能糖池：闪现、火焰光环、泡泡、踢弹、冰冻弹、穿透弹，池内等权；回春不进池（RESOLUTIONS #2）。
    const pool = candyPool(SKILLS)
    expect([...pool].sort()).toEqual(['blink', 'bubble', 'fireAura', 'freezeBomb', 'kick', 'pierceBomb'])
    expect(pool).not.toContain('regen')
    expect(new Set(pool.map((id) => SKILLS[id].candyWeight))).toEqual(new Set([1]))
    // design §8.2 木箱：必掉 1 个，50% 技能糖（Lv1）（RESOLUTIONS #1）。
    expect(R.crateSkillCandyPermille).toBe(500)
    // design §8.2 死亡掉落：拾取的技能每个 50% 落地。
    expect(R.skillDeathDropPermille).toBe(500)
    // 技能糖不是强化、不计帽数（design §8 术语 / §9.5；ADR 0030 D5）。
    expect(isPowerupKind(PickupKind.SkillCandy)).toBe(false)
    expect(isPowerupKind(PickupKind.HealthPack)).toBe(false)
  })
})

describe('ADR 0032 · movement feel (design §6.1)', () => {
  it('corner assist 0.5 cell, 0.25 cell for repeated corners within 6 ticks; doll footprint 0.7 cell, reach 0.35 cell', () => {
    // design §6.1 规则 1：吸附阈值 0.5 格（连续转角 6 Tick 内降到 0.25 格）（RESOLUTIONS #3）。
    expect(R.cornerAssistMilli).toBe(500)
    expect(R.cornerAssistRepeatMilli).toBe(250)
    expect(R.assistRepeatWindowTicks).toBe(6)
    // design §6.1 规则 5：放弹输入缓冲 125 ms。
    expect(DEFAULT_CONFIG.inputBufferMs).toBe(125)
    // design §6.1 规则 7：脚圈直径 0.7 格、前伸 ≤ 0.35 格。
    expect(R.dollFootprintMilli).toBe(700)
    expect(R.dollReachMilli).toBe(350)
  })
})

describe('design §15 · Bot 难度分档（原型工具）', () => {
  it('normal: react 4–7 ticks, 15 % noise, no traps (user D9), at most 1 live attack bomb; the rest stays a tuning knob', () => {
    // design §15 normal（用户第 4 轮 D9）：反应 4–7 Tick、决策噪声 15%、不主动双弹围杀。
    expect(BOT_PROFILES.normal).toMatchObject({ reactMinTicks: 4, reactMaxTicks: 7, noisePermille: 150, trapPermille: 0, maxOwnLiveAttackBombs: 1 })
    // 「放弃进攻」与「判定半径缩放」是 W2 调参杠杆（推断待验证，design §15 的 10% / ×0.85 随调参同步），这里只钉方向：
    // normal 比 hard 更犹豫、判定更保守，但不至于不打。
    const n = BOT_PROFILES.normal
    expect(n.attackSkipPermille).toBeGreaterThan(BOT_PROFILES.hard.attackSkipPermille)
    expect(n.attackSkipPermille).toBeLessThan(500)
    expect(n.blastScalePermille).toBeLessThan(1000)
    expect(n.engageScalePermille).toBeLessThan(1000)
    expect(n.blastScalePermille).toBeGreaterThanOrEqual(BOT_PROFILES.easy.blastScalePermille)
  })

  it('easy: react 7–12 ticks, 30 % noise; player script: react 3–5, 5 % noise, no traps, 1 live attack bomb', () => {
    expect(BOT_PROFILES.easy).toMatchObject({ reactMinTicks: 7, reactMaxTicks: 12, noisePermille: 300 })
    expect(BOT_PROFILES.player).toMatchObject({ reactMinTicks: 3, reactMaxTicks: 5, noisePermille: 50, trapPermille: 0, maxOwnLiveAttackBombs: 1 })
  })

  it('hard = round-3 strength (legacy bot-brain constants: react 2–4, 5 % noise, 92 % trap, frenzy bypass, no caps)', () => {
    expect(BOT_PROFILES.hard).toMatchObject({
      reactMinTicks: 2,
      reactMaxTicks: 4,
      noisePermille: 50,
      trapPermille: 920,
      attackSkipPermille: 0,
      maxOwnLiveAttackBombs: 99,
      frenzyBypass: true,
      blastScalePermille: 1000,
      engageScalePermille: 1000,
      reactMode: 'ownCell',
    })
  })

  it('every tier uses skills (design §15：三档都会用技能与决赛圈对决战术)', () => {
    for (const k of ['easy', 'normal', 'hard'] as const) {
      expect(BOT_PROFILES[k].skillUsePermille).toBeGreaterThan(0)
      expect(BOT_PROFILES[k].showdownTradePermille).toBeGreaterThan(0)
    }
  })
})
