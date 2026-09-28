import {
  CHARACTER_ORDER,
  DEFAULT_RULES,
  lineupFor,
  MAP_TIERS,
  parseBotDifficulty,
  parseCharacterId,
  parseMapTier,
  protoConfig,
  rulesForMap,
  type BomberConfig,
  type BotDifficulty,
  type CharacterId,
  type MapTierId,
  type ProtoRules,
  type SkillId,
} from '../contract'

/**
 * 页面 URL 参数（纯函数，可单测）。全部可选：
 *   ?seed=123       固定地图与 Bot 随机种子（默认随机）
 *   ?match=150      局时秒数（默认 = 4 分钟上限 ProtoRules.matchCapMs，ADR 0035；≤ 决赛圈时长时整局都是决赛圈）
 *   ?map=27         地图档 19 / 23 / 27（默认 27 = 16 人，ADR 0040；未知值 = 默认）
 *   ?bots=15        Bot 数量 0 – 该档默认人数 − 1（默认也是它：27 → 15、23 → 11、19 → 7）
 *   ?ai=normal      全员 Bot 难度 rookie / easy / normal / hard；不给 = ADR 0043 默认阵容（lineupFor，15 个 = 菜鸟 7 / 普通 6 / 困难 2）
 *   ?char=cat       本机角色（跳过选角界面；未知值 = 照常显示选角）
 *   ?dev=evolve,autopilot,fast   开发开关，只在 `import.meta.env.DEV` 下生效（pnpm build 里恒为空）
 */

/**
 * 原型扩展（NON-CONTRACT，开发工具）：evolve = 开局在脚下连放几颗技能糖，直接看进化；
 * autopilot = 本机由脚本玩家驾驶；fast = 4 倍速。
 */
export type DevFlag = 'evolve' | 'autopilot' | 'fast'
const DEV_FLAGS: readonly DevFlag[] = ['evolve', 'autopilot', 'fast']

export interface AppParams {
  seed: number | null
  /** 局时秒数；null = 默认。 */
  matchSec: number | null
  /** 原型扩展（NON-CONTRACT，ADR 0040）：地图档。 */
  map: MapTierId
  bots: number
  ai: BotDifficulty
  /** URL 里给了 `?ai=`：全员按 ai；否则用 ADR 0043 默认阵容（{@link appLineup}）。 */
  aiExplicit: boolean
  character: CharacterId | null
  dev: ReadonlySet<DevFlag>
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：页面默认地图档——原型默认 16 人 · 27×27。`DEFAULT_RULES` 仍是 19 档（旧测试的规则对象）。 */
export const DEFAULT_PAGE_MAP: MapTierId = 27
/** 某档的 Bot 上限 = 该档默认人数（= 出生候选数）− 你（19 → 7、23 → 11、27 → 15）。 */
export function maxBotsFor(map: MapTierId): number {
  return MAP_TIERS[map].defaultPlayers - 1
}
/** 最大档的 Bot 上限（ADR 0040：你 + 15 个 Bot）。 */
export const MAX_BOTS = maxBotsFor(27)
/** fast 开发开关的倍速。 */
export const DEV_FAST_SCALE = 4

function intParam(q: URLSearchParams, k: string): number | null {
  const v = q.get(k)
  if (v === null || v.trim() === '') return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** @param devEnabled 传 `import.meta.env.DEV`：false 时 `?dev=` 一律忽略。 */
export function parseAppParams(search: string, devEnabled: boolean): AppParams {
  const q = new URLSearchParams(search)
  const match = intParam(q, 'match')
  const dev = new Set<DevFlag>()
  if (devEnabled) {
    for (const s of (q.get('dev') ?? '').split(',')) {
      const f = s.trim().toLowerCase() as DevFlag
      if (DEV_FLAGS.includes(f)) dev.add(f)
    }
  }
  const map = parseMapTier(q.get('map'), DEFAULT_PAGE_MAP)
  const maxBots = maxBotsFor(map)
  const ai = q.get('ai')
  return {
    seed: intParam(q, 'seed'),
    matchSec: match !== null && match > 0 ? match : null,
    map,
    bots: Math.max(0, Math.min(maxBots, intParam(q, 'bots') ?? maxBots)),
    ai: parseBotDifficulty(ai),
    aiExplicit: ai !== null && ai.trim() !== '',
    character: parseCharacterId(q.get('char')),
    dev,
  }
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：本局规则 = `rulesForMap(DEFAULT_RULES, ?map, 你 + ?bots)`（段表、再生组数、人数、地图档随档走）。
 * `?map=19` 且 8 人时就是 `DEFAULT_RULES` 本身。
 */
export function appRules(p: Pick<AppParams, 'map' | 'bots'>): ProtoRules {
  return rulesForMap(DEFAULT_RULES, p.map, p.bots + 1)
}

/** 原型扩展（NON-CONTRACT，ADR 0043）：没给 `?ai=` 时的逐个 Bot 难度阵容（contract lineupFor）；给了 → null（全员 ai）。 */
export function appLineup(p: Pick<AppParams, 'bots' | 'aiExplicit'>): BotDifficulty[] | null {
  return p.aiExplicit ? null : lineupFor(p.bots)
}

/**
 * 本局配置：契约默认 + 4 分钟上限（protoConfig，ADR 0035），`?match=` 覆盖局时；
 * 原型扩展（ADR 0040）：rules 带 map 时 mapSize 跟档走（传 {@link appRules} 的结果）。
 */
export function appConfig(p: Pick<AppParams, 'matchSec'>, rules: Pick<ProtoRules, 'matchCapMs'> & Partial<Pick<ProtoRules, 'map'>> = DEFAULT_RULES): BomberConfig {
  return protoConfig(rules, p.matchSec !== null ? { matchDurationMs: p.matchSec * 1000 } : {})
}

/**
 * `?dev=evolve` 放哪几颗糖：含本角色专属技能的第一个配方 → 另一半（原地进化）；
 * 专属技能不在任何配方里（棉花兔）→ 第一个两半都不是专属技能的配方的两半。
 */
export function devEvolveCandies(rules: Pick<ProtoRules, 'characters' | 'combos' | 'skills'>, c: CharacterId): SkillId[] {
  const own = rules.characters[c].skill
  for (const row of rules.combos) {
    if (row.a === own) return [row.b]
    if (row.b === own) return [row.a]
  }
  const exclusive = new Set(CHARACTER_ORDER.map((id) => rules.characters[id].skill))
  const row = rules.combos.find((r) => !exclusive.has(r.a) && !exclusive.has(r.b))
  return row ? [row.a, row.b] : []
}
