import { BombKind } from './components'
import type { BomberConfig, ProtoRules } from './config'
import type { AnimalId } from './snapshot'

/**
 * **原型扩展（NON-CONTRACT，ADR 0030）**：角色、技能、组合技与技能糖的数据表（design §8 / §12，第 4 轮）。
 * 契约 §1–§5 没有这些；规则层（sim）、Bot 与表现层都只读这里的表，数值一律带出处（`src`），
 * 除注明「用户」者外均为「推断待验证」。将来要么提给契约配表，要么随 TS 替身一起删除。
 *
 * **穿透规则（唯一口径，ADR 0030）**——`sim/explosion.ts` 的臂循环与 `crossCells`、Bot 的 `traceBlast`、
 * 表现层的 `computeFireCross` 必须逐条镜像（共享夹具 `tests/support/pierce-cases.ts`）。每条臂 s = 1..power：
 *   1. 出界或铁皮 → 停；
 *   2. 宝箱 → 命中宝箱后停（宝箱格不覆盖）；
 *   3. 软砖（`destroyThenStop`）→ 砖照样被摧毁；本臂已穿透的砖数 < `pierceLayers` 时计数 +1、**覆盖该格并计入 Reach**、继续；
 *      否则停，该格不覆盖（= 今天的行为）；
 *   4. 水地面 → 覆盖该格后停。
 * 所以穿透 1 级 = 每臂最多摧毁 2 块砖（「多穿 1 层」），99 = 火力范围内整条线。
 */

/** 数据行出处标签（design 数值来源规则）：编译期检查一次，`tests/contract-tables.test.ts` 再查一次。 */
export type SourceNote = `${'已验证' | '推断待验证' | '引用'}${string}`

/** 三个技能槽（design §8.1）：炸弹槽（放弹时生效）/ 主动槽（Shift / 副按钮）/ 被动槽（常驻）。 */
export type SkillSlot = 'bomb' | 'active' | 'passive'
export const SKILL_SLOTS: readonly SkillSlot[] = ['bomb', 'active', 'passive']

export type SkillId =
  | 'regen'
  | 'bubble'
  | 'blink'
  | 'fireAura'
  | 'kick'
  | 'freezeBomb'
  | 'pierceBomb'
  | 'fireDash'
  | 'bounceBubble'
  | 'glacierBomb'

/** 稳定顺序：code = 下标 + 1（哈希用）；也是技能糖池的掷骰顺序。 */
export const SKILL_IDS: readonly SkillId[] = [
  'regen',
  'bubble',
  'blink',
  'fireAura',
  'kick',
  'freezeBomb',
  'pierceBomb',
  'fireDash',
  'bounceBubble',
  'glacierBomb',
]

/** 踢弹「直到被挡」/ 穿透「整条线」的哨兵值（格 / 层）。 */
export const UNTIL_BLOCKED = 99

/** 单个等级的参数；0 = 该技能不用这一项。时间一律毫秒、距离一律格。 */
export interface SkillParams {
  /** 主动技能冷却。 */
  cdMs: number
  /** 泡泡 / 光环持续、火焰冲刺的火墙存续。 */
  durationMs: number
  /** 闪现 / 冲刺距离、踢弹滑行距离。 */
  rangeCells: number
  /** 回春的计时间隔。 */
  intervalMs: number
  /** 回春每次回的半心点。 */
  points: number
  /** 冰冻弹的冻结时长（规则层再夹到 freezeCapMs）。 */
  freezeMs: number
  /** 穿透弹每臂多穿的砖层数。 */
  pierceLayers: number
}

export interface SkillDef {
  id: SkillId
  name: string
  slot: SkillSlot
  /** 组合技：只能由两个基础技能进化得到（或拾取组合技糖），不能升级。 */
  combo: boolean
  /** 炸弹槽技能放出的炸弹种类（契约 BombKind）；其他槽没有。 */
  bombKind?: BombKind
  /** 技能糖池内权重；0 = 不在池内（专属被动 / 组合技）。 */
  candyWeight: number
  /** 施放即解除重生保护（同 design §12「放弹即解除」的类比；ADR 0030，推断待验证）。 */
  endsProtection: boolean
  /** 基础技能 3 级，组合技 1 级。下标 = 等级 − 1。 */
  levels: readonly SkillParams[]
  /** 说明模板：{cd}{dur}{range}{interval}{heal}{freeze}{layers}{burn}，由 {@link describeSkill} 填值。 */
  desc: string
  src: SourceNote
}

/** 组合技配方：a + b → result；result 所在槽 = SKILLS[result].slot（派生，不重复存）。 */
export interface ComboDef {
  a: SkillId
  b: SkillId
  result: SkillId
  src: SourceNote
}

export type CharacterId = 'rabbit' | 'duck' | 'cat' | 'bear'
/** 选角结果：具体角色，或 'auto' = 由规则层按均衡原则分配（Bot 用）。 */
export type CharacterPick = CharacterId | 'auto'
/** 选角界面与领奖台的顺序；code = 下标 + 1。 */
export const CHARACTER_ORDER: readonly CharacterId[] = ['rabbit', 'duck', 'cat', 'bear']

export interface CharacterDef {
  id: CharacterId
  animal: AnimalId
  name: string
  /** 专属技能：开局 Lv1、绑定（不掉、不被替换）。 */
  skill: SkillId
  tagline: string
  /** 同角色 Bot 按出现次序取名。 */
  botNames: readonly string[]
  src: SourceNote
}

const ZERO: SkillParams = { cdMs: 0, durationMs: 0, rangeCells: 0, intervalMs: 0, points: 0, freezeMs: 0, pierceLayers: 0 }
const lv = (p: Partial<SkillParams>): SkillParams => ({ ...ZERO, ...p })

/**
 * 技能表（ADR 0030，design §8.4 / §12）。L1 取自用户第 4 轮口述；L2 / L3 为推断待验证（CD 逐级缩短、效果逐级增强）。
 * 糖池 6 种等权（RESOLUTIONS #2）；回春只随棉花兔出生、不进池也不掉落，L2 / L3 因此实际不可达。
 */
export const SKILLS: Readonly<Record<SkillId, SkillDef>> = {
  regen: {
    id: 'regen',
    name: '回春',
    slot: 'passive',
    combo: false,
    candyWeight: 0,
    endsProtection: false,
    levels: [lv({ intervalMs: 10000, points: 2 }), lv({ intervalMs: 8000, points: 2 }), lv({ intervalMs: 6000, points: 2 })],
    desc: '受伤后 {interval} 秒没再挨打回 {heal} 心，之后每 {interval} 秒再回，满血为止',
    src: '推断待验证：L1 = 用户第 4 轮（10 秒，A/B 5 / 10 秒，上限满血）；L2 / L3 参照 §8.4 厚棉花去掉脱战等待',
  },
  bubble: {
    id: 'bubble',
    name: '泡泡',
    slot: 'active',
    combo: false,
    candyWeight: 1,
    endsProtection: false,
    levels: [lv({ durationMs: 3000, cdMs: 18000 }), lv({ durationMs: 3500, cdMs: 15000 }), lv({ durationMs: 4000, cdMs: 12000 })],
    desc: '吹个泡泡，{dur} 秒内不受伤、不能放弹（冷却 {cd} 秒）',
    src: '推断待验证：L1 = 用户第 4 轮（取代 §8.4 一次性护盾）；L2 / L3 推断',
  },
  blink: {
    id: 'blink',
    name: '闪现',
    slot: 'active',
    combo: false,
    candyWeight: 1,
    endsProtection: false,
    levels: [lv({ rangeCells: 3, cdMs: 12000 }), lv({ rangeCells: 3, cdMs: 10000 }), lv({ rangeCells: 4, cdMs: 8000 })],
    desc: '朝面向瞬移至多 {range}，越过砖块、炸弹和宝箱（冷却 {cd} 秒）',
    src: '推断待验证：L1 = 用户第 4 轮（取代 §8.4 冲刺）；L2 / L3 推断',
  },
  fireAura: {
    id: 'fireAura',
    name: '火焰光环',
    slot: 'active',
    combo: false,
    candyWeight: 1,
    endsProtection: true,
    levels: [lv({ durationMs: 4000, cdMs: 20000 }), lv({ durationMs: 4500, cdMs: 17000 }), lv({ durationMs: 5000, cdMs: 14000 })],
    desc: '点燃身边一圈 {dur} 秒，碰到的对手{burn}（冷却 {cd} 秒）',
    src: '推断待验证：L1 = 用户第 4 轮；伤害口径同 §12 留火；L2 / L3 推断',
  },
  kick: {
    id: 'kick',
    name: '踢弹',
    slot: 'passive',
    combo: false,
    candyWeight: 1,
    endsProtection: false,
    levels: [lv({ rangeCells: 3 }), lv({ rangeCells: 5 }), lv({ rangeCells: UNTIL_BLOCKED })],
    desc: '走向身前的炸弹把它踢出去，滑行 {range}；踢进水里就熄灭',
    src: '引用 design §8.4 踢弹（3 / 5 / 直到被挡）',
  },
  freezeBomb: {
    id: 'freezeBomb',
    name: '冰冻弹',
    slot: 'bomb',
    combo: false,
    bombKind: BombKind.Freeze,
    candyWeight: 1,
    endsProtection: false,
    levels: [lv({ freezeMs: 800 }), lv({ freezeMs: 1000 }), lv({ freezeMs: 1200 })],
    desc: '炸到的对手还会被冻住 {freeze} 秒',
    src: '引用 design §8.4 冰冻弹（0.8 / 1.0 / 1.2 秒）；照常伤害 = 第 4 轮 Q1 裁定（freezeBombDamages，推断待验证）',
  },
  pierceBomb: {
    id: 'pierceBomb',
    name: '穿透弹',
    slot: 'bomb',
    combo: false,
    bombKind: BombKind.Pierce,
    candyWeight: 1,
    endsProtection: false,
    levels: [lv({ pierceLayers: 1 }), lv({ pierceLayers: 2 }), lv({ pierceLayers: UNTIL_BLOCKED })],
    desc: '火焰多穿透 {layers}',
    src: '引用 design §8.4 穿透弹（1 / 2 / 整条线；原型提前实现）',
  },
  fireDash: {
    id: 'fireDash',
    name: '火焰冲刺',
    slot: 'active',
    combo: true,
    candyWeight: 0,
    endsProtection: true,
    levels: [lv({ rangeCells: 3, cdMs: 12000, durationMs: 2000 })],
    desc: '朝面向冲出至多 {range}，身后留下 {dur} 秒火墙（冷却 {cd} 秒）',
    src: '推断待验证：用户第 4 轮（闪现 + 火焰光环）',
  },
  bounceBubble: {
    id: 'bounceBubble',
    name: '弹射泡泡',
    slot: 'active',
    combo: true,
    candyWeight: 0,
    endsProtection: false,
    levels: [lv({ durationMs: 3000, cdMs: 18000, rangeCells: 5 })],
    desc: '吹泡泡 {dur} 秒不受伤，期间碰到的炸弹弹出 {range}（冷却 {cd} 秒）',
    src: '推断待验证：用户第 4 轮（泡泡 + 踢弹）',
  },
  glacierBomb: {
    id: 'glacierBomb',
    name: '冰川弹',
    slot: 'bomb',
    combo: true,
    bombKind: BombKind.Freeze,
    candyWeight: 0,
    endsProtection: false,
    levels: [lv({ freezeMs: 1000, pierceLayers: 1 })],
    desc: '火焰多穿透 {layers}，炸到的对手还会被冻住 {freeze} 秒',
    src: '推断待验证：用户第 4 轮（冰冻弹 + 穿透弹）',
  },
}

/** 组合技配方（ADR 0030 / D4：组合是数据，不是代码分支）。按表序匹配。 */
export const COMBOS: readonly ComboDef[] = [
  { a: 'blink', b: 'fireAura', result: 'fireDash', src: '引用 用户第 4 轮' },
  { a: 'bubble', b: 'kick', result: 'bounceBubble', src: '引用 用户第 4 轮' },
  { a: 'freezeBomb', b: 'pierceBomb', result: 'glacierBomb', src: '引用 用户第 4 轮' },
]

/** 四个可选角色（ADR 0030 取代 0014 的「无职业」）。 */
export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  rabbit: {
    id: 'rabbit',
    animal: 'rabbit',
    name: '棉花兔',
    skill: 'regen',
    tagline: '不挨打就慢慢回血',
    botNames: ['棉花兔', '软糖兔'],
    src: '引用 用户第 4 轮',
  },
  duck: {
    id: 'duck',
    animal: 'duck',
    name: '泡泡鸭',
    skill: 'bubble',
    tagline: '吹个泡泡，3 秒刀枪不入',
    botNames: ['泡泡鸭', '肥皂鸭'],
    src: '引用 用户第 4 轮',
  },
  cat: {
    id: 'cat',
    animal: 'cat',
    name: '闪电猫',
    skill: 'blink',
    tagline: '一道闪电闪出包围圈',
    botNames: ['闪电猫', '雷雷猫'],
    src: '引用 用户第 4 轮',
  },
  bear: {
    id: 'bear',
    animal: 'bear',
    name: '火焰熊',
    skill: 'fireAura',
    tagline: '点燃身边一圈',
    botNames: ['火焰熊', '炭炭熊'],
    src: '引用 用户第 4 轮',
  },
}

/** 哈希用技能码：0 = 无。 */
export function skillCode(id: SkillId | null): number {
  return id === null ? 0 : SKILL_IDS.indexOf(id) + 1
}

/** 哈希用角色码：CHARACTER_ORDER 下标 + 1；0 = 无角色。 */
export function characterCode(id: CharacterId | null): number {
  return id === null ? 0 : CHARACTER_ORDER.indexOf(id) + 1
}

/** 哈希用选角码：null 0、'auto' 9，否则同 {@link characterCode}。 */
export function pickCode(p: CharacterPick | null): number {
  if (p === null) return 0
  if (p === 'auto') return 9
  return characterCode(p)
}

/** 某技能某等级的参数；等级夹到 [1, levels.length]（组合技只有 1 级）。 */
export function skillParams(skills: ProtoRules['skills'], id: SkillId, level: number): SkillParams {
  const ls = skills[id].levels
  const i = Math.max(1, Math.min(ls.length, Math.floor(level))) - 1
  return ls[i]
}

/** x 与 y（无序）能进化成的配方；表序第一个匹配。 */
export function comboFor(combos: readonly ComboDef[], x: SkillId, y: SkillId): ComboDef | undefined {
  for (const c of combos) if ((c.a === x && c.b === y) || (c.a === y && c.b === x)) return c
  return undefined
}

/** 技能糖池：非组合技且 candyWeight > 0，按 SKILL_IDS 序。 */
export function candyPool(skills: ProtoRules['skills']): readonly SkillId[] {
  return SKILL_IDS.filter((id) => !skills[id].combo && skills[id].candyWeight > 0)
}

function secText(ms: number): string {
  return String(Math.round(ms / 100) / 10)
}

/** 按等级把说明模板填上数值（选角界面、技能条悬停、HUD 提示共用）。 */
export function describeSkill(
  rules: Pick<ProtoRules, 'skills' | 'burnPointsPerInterval' | 'burnIntervalMs'>,
  cfg: Pick<BomberConfig, 'healthPointsPerHeart'>,
  id: SkillId,
  level: number,
): string {
  const p = skillParams(rules.skills, id, level)
  const hearts = (points: number): string => String(Math.round((points / Math.max(1, cfg.healthPointsPerHeart)) * 10) / 10)
  const vals: Record<string, string> = {
    cd: secText(p.cdMs),
    dur: secText(p.durationMs),
    range: p.rangeCells >= UNTIL_BLOCKED ? '直到被挡' : `${p.rangeCells} 格`,
    interval: secText(p.intervalMs),
    heal: hearts(p.points),
    freeze: secText(p.freezeMs),
    layers: p.pierceLayers >= UNTIL_BLOCKED ? '整条线的砖' : `${p.pierceLayers} 层砖`,
    burn: `每 ${secText(rules.burnIntervalMs)} 秒 −${hearts(rules.burnPointsPerInterval)} 心`,
  }
  return rules.skills[id].desc.replace(/\{(\w+)\}/g, (m, k: string) => vals[k] ?? m)
}

/** URL / 存档里的角色名 → CharacterId；未知或空 → null（显示选角界面）。 */
export function parseCharacterId(v: string | null): CharacterId | null {
  if (v === null) return null
  const s = v.trim().toLowerCase()
  return (CHARACTER_ORDER as readonly string[]).includes(s) ? (s as CharacterId) : null
}
