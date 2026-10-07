import { describe, expect, it } from 'vitest'
import {
  BOT_PROFILES,
  BombKind,
  CHARACTER_ORDER,
  CHARACTERS,
  COMBOS,
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  MAP_TIERS,
  PickupKind,
  SKILL_IDS,
  SKILLS,
  UNTIL_BLOCKED,
  bombCandyPool,
  candyPool,
  isBoss,
  isPowerupKind,
  lineupFor,
  maxHealthCeiling,
  maxHealthFor,
  msToTicks,
  poisonPointsAt,
  poisonPointsFor,
  protoConfig,
  skillParams,
  type SkillId,
  type SkillParams,
} from '../src/contract'
import { appRules, maxBotsFor, parseAppParams } from '../src/app/params'
import { openChests } from '../src/sim/chest'
import { spawnZones } from '../src/sim/mapgen'
import { MAX_PLAYERS } from '../src/sim/match-phase'
import { cell, makeWorld } from '../src/sim/__tests__/helpers'

/**
 * 策划案 ↔ 原型数值同步（第 4 轮，docs 设计 §3.8 + RESOLUTIONS）。这里钉住的每一个数都写在
 * docs/specs/bomber/design.md 与 ADR 0030 / 0031 / 0032 / 0033 里；**改数值必须同一改动里同步 design.md §4 / §4.2 / §6.1 / §8 / §12 / §15**，
 * 否则这里红。注释逐条注明出处。
 */
const R = DEFAULT_RULES
const hz = DEFAULT_CONFIG.tickRateHz

describe('ADR 0031 / ADR 0035 · 4-min cap, 115 s final circle (design §4 / §4.1 / §4.2)', () => {
  it('match cap: prototype 240 s via protoConfig, contract default untouched', () => {
    // ADR 0035（用户 2026-09-27「约 2 分钟开圈」）：封顶 7 分钟 → 4 分钟；RESOLUTIONS #18：契约 DEFAULT_CONFIG 仍是 360000，
    // 原型经 protoConfig() 用 ProtoRules.matchCapMs。
    expect(protoConfig().matchDurationMs).toBe(240_000)
    expect(R.matchCapMs).toBe(240_000)
    expect(DEFAULT_CONFIG.matchDurationMs).toBe(360_000)
    // ?match= 覆盖只改局时（design §15 原型工具；RESOLUTIONS #15）。
    expect(protoConfig(R, { matchDurationMs: 120_000 }).matchDurationMs).toBe(120_000)
  })

  it('final circle 115 s; regen stops 20 s before the time trigger; 10 s ring preview; resource trigger < 20 %', () => {
    // design §4.2 触发 / 时长：固定 115 秒，时间触发 = 2:05（ADR 0035）；ADR 0026 再生停止点 ADR 0035 改为距时间触发 20 秒（1:45）。
    expect(R.finalCircleMs).toBe(115_000)
    expect(R.regenStopBeforeFinalMs).toBe(20_000)
    expect(protoConfig().matchDurationMs - R.finalCircleMs).toBe(125_000) // 2:05
    expect(protoConfig().matchDurationMs - R.finalCircleMs - R.regenStopBeforeFinalMs).toBe(105_000) // 1:45
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

  it('strong chest: 3 independent hits; loot = the three power-ups + a health pack + exactly one Lv1 bomb-type skill candy', () => {
    // design §4.2 强力宝箱：3 次独立炸弹命中；喷出火力+ / 炸弹+ / 速度+ 各 1 + 血包 1 + 技能糖 1（Lv1，§8.2；ADR 0033 保底炸弹类）。
    expect(R.chestSkillCandyPool).toBe('bomb')
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
    expect(bombCandyPool(SKILLS)).toContain(w.pickups.find((p) => p.kind === PickupKind.SkillCandy)?.skill)
  })
})

describe('ADR 0030 · characters, skills, combos (design §8)', () => {
  it('five characters, each with exactly one exclusive skill in its slot; identical base stats', () => {
    // design §8.0 角色表：棉花兔 回春（被动）/ 泡泡鸭 泡泡（主动）/ 闪电猫 闪现（主动）/ 火焰熊 火焰光环（主动）；
    // 飞腿袋鼠 飞踢（主动）= 用户 2026-09-28 追加（设计文档由主 loop 同步）。
    expect(CHARACTER_ORDER).toEqual(['rabbit', 'duck', 'cat', 'bear', 'kangaroo'])
    const table = CHARACTER_ORDER.map((c) => [c, CHARACTERS[c].animal, CHARACTERS[c].name, CHARACTERS[c].skill, SKILLS[CHARACTERS[c].skill].slot])
    expect(table).toEqual([
      ['rabbit', 'rabbit', '棉花兔', 'regen', 'passive'],
      ['duck', 'duck', '泡泡鸭', 'bubble', 'active'],
      ['cat', 'cat', '闪电猫', 'blink', 'active'],
      ['bear', 'bear', '火焰熊', 'fireAura', 'active'],
      ['kangaroo', 'kangaroo', '飞腿袋鼠', 'flyKick', 'active'],
    ])
    expect(R.characters).toBe(CHARACTERS)
    // design §8.0「基础属性完全相同」：角色表没有任何属性字段，只差一个专属技能。
    for (const c of CHARACTER_ORDER) expect(Object.keys(CHARACTERS[c]).sort()).toEqual(['animal', 'botNames', 'id', 'name', 'skill', 'src', 'tagline'])
    // 专属技能互不相同；回春只属于棉花兔、飞踢只属于飞腿袋鼠，都不进池（design §8.2 / §8.4；用户 2026-09-28）。
    expect(new Set(CHARACTER_ORDER.map((c) => CHARACTERS[c].skill)).size).toBe(5)
    expect(SKILLS.regen.candyWeight).toBe(0)
    expect(SKILLS.flyKick.candyWeight).toBe(0)
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
      toxinBomb: 'bomb',
      shockBomb: 'bomb',
      flyKick: 'active',
    })
  })

  it('skill L1 / L2 / L3 values = design §8.4 table (RESOLUTIONS #8)', () => {
    const col = (id: SkillId, k: keyof SkillParams) => [1, 2, 3].map((lv) => skillParams(SKILLS, id, lv)[k])
    // 泡泡：持续 3.5 / 4 / 4.5 s，CD 14 / 12 / 10 s（design §8.4 ★ 泡泡；第 4 轮平衡（D 验收），ADR 0034）。
    expect(col('bubble', 'durationMs')).toEqual([3500, 4000, 4500])
    expect(col('bubble', 'cdMs')).toEqual([14_000, 12_000, 10_000])
    // 闪现：距离 3 / 3 / 4 格，CD 10 / 8 / 6 s（design §8.4 ★ 闪现；CD = ADR 0034）。
    expect(col('blink', 'rangeCells')).toEqual([3, 3, 4])
    expect(col('blink', 'cdMs')).toEqual([10_000, 8000, 6000])
    // 火焰光环：持续 5.5 / 6 / 6.5 s，CD 16 / 14 / 12 s（ADR 0034）；每 1000 ms −2 点（−1 心 / 秒，design §8.4 ★ 火焰光环 / §12 留火）。
    expect(col('fireAura', 'durationMs')).toEqual([5500, 6000, 6500])
    expect(col('fireAura', 'cdMs')).toEqual([16_000, 14_000, 12_000])
    expect(R.burnIntervalMs).toBe(1000)
    expect(R.burnPointsPerInterval).toBe(2)
    // 回春：N = 20 / 16 / 12 s，每次回半心 = 1 点（design §8.4 ★ 回春 / §8.0；ADR 0034）。
    expect(col('regen', 'intervalMs')).toEqual([20_000, 16_000, 12_000])
    expect(col('regen', 'points')).toEqual([1, 1, 1])
    // 踢弹：3 格 / 5 格 / 直到障碍，8 格 / 秒（design §8.4 ★ 踢弹）。
    expect(col('kick', 'rangeCells')).toEqual([3, 5, UNTIL_BLOCKED])
    expect(R.kickSpeedMilli).toBe(8000)
    // 飞踢（飞腿袋鼠，用户 2026-09-28）：一直滑到被挡住，滑速同踢弹；CD 4 / 3.5 / 3 s。
    expect(col('flyKick', 'rangeCells')).toEqual([UNTIL_BLOCKED, UNTIL_BLOCKED, UNTIL_BLOCKED])
    expect(col('flyKick', 'cdMs')).toEqual([4000, 3500, 3000])
    expect(SKILLS.flyKick.src).toMatch(/用户 2026-09-28/)
    // 冰冻弹：冻结 1.5 / 2.0 / 2.5 s，上限 2.5 s（用户 2026-09-28「冰冻僵直有点弱」，原 0.8 / 1.0 / 1.2），之后 1 秒控制免疫；照常扣血（ADR 0030 Q1 裁定）。
    expect(col('freezeBomb', 'freezeMs')).toEqual([1500, 2000, 2500])
    expect(SKILLS.freezeBomb.bombKind).toBe(BombKind.Freeze)
    expect(R.freezeCapMs).toBe(2500)
    expect(R.freezeImmuneMs).toBe(1000)
    expect(R.freezeBombDamages).toBe(true)
    // 穿透弹：多穿 1 层 / 2 层 / 全线（design §8.4 ★ 穿透弹）。
    expect(col('pierceBomb', 'pierceLayers')).toEqual([1, 2, UNTIL_BLOCKED])
    expect(SKILLS.pierceBomb.bombKind).toBe(BombKind.Pierce)
    // 中毒弹：直击照常 −1 心，中毒 3 / 4 / 5 s，每 2000 ms −1 点（用户 2026-09-28「中毒太强」两次削弱，原 1000 ms），可致死（design §8.4 ★ 中毒弹 / §12，ADR 0033）。
    expect(col('toxinBomb', 'durationMs')).toEqual([3000, 4000, 5000])
    expect(SKILLS.toxinBomb.bombKind).toBe(BombKind.Toxin)
    expect(R.toxinIntervalMs).toBe(2000)
    expect(R.toxinPointsPerInterval).toBe(1)
    // 麻痹弹：直击照常 −1 心，移速降到 30%，持续 2 / 2.5 / 3 s（design §8.4 ★ 麻痹弹，ADR 0033）。
    expect(col('shockBomb', 'durationMs')).toEqual([2000, 2500, 3000])
    expect(col('shockBomb', 'slowPermille')).toEqual([300, 300, 300])
    expect(SKILLS.shockBomb.bombKind).toBe(BombKind.Shock)
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
    // 冰川弹：冻结 2 s（随冰冻弹加强，用户 2026-09-28，原 1 s）；穿 1 层；契约 BombKind = 1（Freeze）。
    expect(skillParams(SKILLS, 'glacierBomb', 1)).toMatchObject({ freezeMs: 2000, pierceLayers: 1 })
    expect(SKILLS.glacierBomb.bombKind).toBe(BombKind.Freeze)
  })

  it('skill candy: eight-skill pool, ADR 0033 weights × 3 except kick (rare), no regen / flyKick; crates half skill candy; death drops 50 %', () => {
    // design §8.2 技能糖池：ADR 0033 修订 0030 的等权（炸弹类 2、其余 1）；用户 2026-09-28 拍板踢弹改罕见掉落——
    // 其余技能整体 ×3（炸弹类各 6、闪现 / 火焰光环 / 泡泡各 3），踢弹保持 1；回春 / 飞踢不进池。
    const pool = candyPool(SKILLS)
    expect([...pool].sort()).toEqual(['blink', 'bubble', 'fireAura', 'freezeBomb', 'kick', 'pierceBomb', 'shockBomb', 'toxinBomb'])
    expect(pool).not.toContain('regen')
    expect(pool).not.toContain('flyKick')
    expect(Object.fromEntries(pool.map((id) => [id, SKILLS[id].candyWeight]))).toEqual({
      bubble: 3,
      blink: 3,
      fireAura: 3,
      kick: 1,
      freezeBomb: 6,
      pierceBomb: 6,
      toxinBomb: 6,
      shockBomb: 6,
    })
    // 炸弹类 24 / 34 ≈ 70.6%（原 2/3）；踢弹 1 / 34 ≈ 3%。
    const total = pool.reduce((a, id) => a + SKILLS[id].candyWeight, 0)
    expect(bombCandyPool(SKILLS).reduce((a, id) => a + SKILLS[id].candyWeight, 0) / total).toBeCloseTo(24 / 34)
    expect(SKILLS.kick.candyWeight / total).toBeCloseTo(0.03, 2)
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

describe('ADR 0039 · hats give hearts, gold hearts, cap 8 hearts, poison scales with the cap (design §8.5 / §9.1 / §12 / §4.2)', () => {
  it('cap = 6 + 2·min(2, ⌊hats/4⌋) + 2·min(3, gold) half-heart points: every 4 hats +1 heart (max +2), gold +1 each (max +3), 8 hearts max', () => {
    // design §12「心数上限」/ ADR 0039：帽子每 4 顶 +1 心、最多 +2；金心每颗 +1 心、最多 +3；封顶 8 心（16 点）。
    expect(R).toMatchObject({ heartsPerHats: 4, maxHatHearts: 2, maxGoldHearts: 3 })
    expect(DEFAULT_CONFIG).toMatchObject({ maxHealthPoints: 6, healthPointsPerHeart: 2 })
    expect([0, 4, 8, 12].map((h) => maxHealthFor(DEFAULT_CONFIG, R, h, 0))).toEqual([6, 8, 10, 10])
    expect([0, 1, 2, 3].map((g) => maxHealthFor(DEFAULT_CONFIG, R, 12, g))).toEqual([10, 12, 14, 16])
    expect(maxHealthCeiling(DEFAULT_CONFIG, R)).toBe(16)
  })

  it('Boss = cap ≥ 6 hearts; gold heart sources: gold box 20 %, power chest 20 %, central supply exactly 1', () => {
    expect(R.bossMinHearts).toBe(6)
    expect(isBoss(DEFAULT_CONFIG, R, 12)).toBe(true)
    expect(isBoss(DEFAULT_CONFIG, R, 10)).toBe(false)
    expect(R.goldBoxGoldHeartPermille).toBe(200)
    expect(R.powerChestGoldHeartPermille).toBe(200)
    expect(R.supplyLoot.goldHearts).toBe(1)
    // 金心不是帽子（design §9.5）。
    expect(isPowerupKind(PickupKind.GoldHeart)).toBe(false)
  })

  it('poison: ⌈stage points × cap / 6⌉ per second — 3 hearts unchanged (1 / 2), any cap dies from full in ≈ 6 s / 3 s', () => {
    for (let cap = 6; cap <= 16; cap += 2) {
      const pre = poisonPointsFor(DEFAULT_CONFIG, 1, cap)
      const post = poisonPointsFor(DEFAULT_CONFIG, 2, cap)
      expect(Math.ceil(cap / pre)).toBeLessThanOrEqual(6)
      expect(Math.ceil(cap / post)).toBeLessThanOrEqual(3)
    }
    expect([poisonPointsFor(DEFAULT_CONFIG, 1, 6), poisonPointsFor(DEFAULT_CONFIG, 2, 6)]).toEqual([1, 2])
    expect([poisonPointsFor(DEFAULT_CONFIG, 1, 16), poisonPointsFor(DEFAULT_CONFIG, 2, 16)]).toEqual([3, 6])
  })
})

describe('ADR 0040 · 27×27 · 16 players, three rings / three box tiers, central supply, frenzy (design §4.2 / §5.0 / §8.5 / §8.6)', () => {
  it('page default = you + 11 bots on 23×23 (user 2026-09-28「人太多了有点乱」, revises ADR 0040); ?map=27 = you + 15 bots; 16 spawns on the 27 outer ring ≥ 6 apart', () => {
    const p = parseAppParams('', false)
    expect([p.map, p.bots]).toEqual([23, 11])
    expect(appRules(p)).toMatchObject({ playerCount: 12, map: { id: 23, size: 23 } })
    expect(appRules(parseAppParams('?map=27', false))).toMatchObject({ playerCount: 16, map: { id: 27, size: 27 } })
    expect([maxBotsFor(19), maxBotsFor(23), maxBotsFor(27)]).toEqual([7, 11, 15])
    expect(MAX_PLAYERS).toBe(16)
    const z = spawnZones(27)
    expect(z).toHaveLength(16)
    for (const a of z) for (const b of z) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(R.spawnMinDistance)
    expect(R.spawnMinDistance).toBe(6)
  })

  it('27 tier: 16 players, rings ≤ 4 / 5–8 / ≥ 9, wood 16 / iron 12 / gold 4 with 1 / 1 / 2 hits, brick drops 25 / 35 / 45 %, regen 4 groups, ≈ 1/6 boxes', () => {
    const t = MAP_TIERS[27]
    expect(t).toMatchObject({ size: 27, defaultPlayers: 16, zones: { coreMaxD: 4, midMaxD: 8 }, regenOrbitsPerInterval: 4, regenBoxOneIn: 6 })
    expect(t.boxes).toEqual({ wood: { count: 16, hits: 1 }, iron: { count: 12, hits: 1 }, gold: { count: 4, hits: 2 } })
    expect(t.brickDropPermille).toEqual({ outer: 250, mid: 350, core: 450 })
    // 19 档按比例保留三圈 ≤ 2 / 3–5 / ≥ 6，仍 2 组再生；23 档 3 组。
    expect(MAP_TIERS[19]).toMatchObject({ zones: { coreMaxD: 2, midMaxD: 5 }, regenOrbitsPerInterval: 2, defaultPlayers: 8 })
    expect(MAP_TIERS[23].regenOrbitsPerInterval).toBe(3)
  })

  it('final-circle stage tables: 27 → +10/30/45/60/75/95/110 s 19/13/9/7/5/3/1 (6 power chests); 23 → +10/30/50/75/95/110 s 15/11/7/5/3/1; 19 unchanged', () => {
    const table = (id: 19 | 23 | 27) => MAP_TIERS[id].ringStages.map((s) => [s.atMs / 1000, s.size])
    expect(table(27)).toEqual([
      [10, 19],
      [30, 13],
      [45, 9],
      [60, 7],
      [75, 5],
      [95, 3],
      [110, 1],
    ])
    expect(MAP_TIERS[27].powerChests).toBe(6)
    expect(table(23)).toEqual([
      [10, 15],
      [30, 11],
      [50, 7],
      [75, 5],
      [95, 3],
      [110, 1],
    ])
    expect(MAP_TIERS[19].ringStages).toEqual(R.ringStages)
    expect(MAP_TIERS[19].powerChests).toBe(5)
  })

  it('box loot: iron 50 % special bomb + 1 candy; gold 1 special bomb + 2 candies; wood 1 candy', () => {
    expect(R.boxLoot).toEqual({
      wood: { candies: 1, specialBombPermille: 0 },
      iron: { candies: 1, specialBombPermille: 500 },
      gold: { candies: 2, specialBombPermille: 1000 },
    })
  })

  it('central supply (23 and 27 tiers, 3×3 plaza; 23 added when the page default became 12 players · 23×23, user 2026-09-28): announce at 0:50, open at 1:00; loot 5 candies + 2 packs + 1 frenzy + 2 special bombs + 1 gold heart', () => {
    expect(R.supplyAnnounceMs).toBe(50_000)
    expect(R.supplyOpenMs).toBe(60_000)
    expect(R.supplyLoot).toEqual({ candies: 5, healthPacks: 2, frenzy: 1, specialBombs: 2, goldHearts: 1 })
    expect([MAP_TIERS[19].centralSupply, MAP_TIERS[23].centralSupply, MAP_TIERS[27].centralSupply]).toEqual([false, true, true])
    expect([MAP_TIERS[19].plazaSide, MAP_TIERS[23].plazaSide, MAP_TIERS[27].plazaSide]).toEqual([0, 3, 3])
  })

  it('frenzy: 6 s, 1.2 s fuse, 6 extra bombs, ≤ 4 bombs per second (5 ticks apart at 20 Hz)', () => {
    expect(R).toMatchObject({ frenzyMs: 6000, frenzyFuseMs: 1200, frenzyExtraBombs: 6, frenzyMinIntervalTicks: 5 })
    expect(hz / R.frenzyMinIntervalTicks).toBe(4)
    expect(isPowerupKind(PickupKind.Frenzy)).toBe(false)
  })
})

describe('ADR 0043 · rookie tier and the default lineup (design §15)', () => {
  it('rookie: react 10–16, think every 3, 30 % noise, 50 % attack skip, no skills, 0 escape margin, 25 % misread, 30 % greedy pickups', () => {
    expect(BOT_PROFILES.rookie).toMatchObject({
      reactMinTicks: 10,
      reactMaxTicks: 16,
      thinkEveryTicks: 3,
      noisePermille: 300,
      attackSkipPermille: 500,
      skillUsePermille: 0,
      escapeMarginTicks: 0,
      misperceivePermille: 250,
      greedyPickupPermille: 300,
    })
  })

  it('default lineup for 15 bots: rookie 7 / normal 6 / hard 2', () => {
    const l = lineupFor(15)
    expect(['rookie', 'normal', 'hard'].map((d) => l.filter((x) => x === d).length)).toEqual([7, 6, 2])
  })
})
