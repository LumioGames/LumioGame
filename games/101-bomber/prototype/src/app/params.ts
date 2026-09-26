import {
  CHARACTER_ORDER,
  DEFAULT_RULES,
  parseBotDifficulty,
  parseCharacterId,
  protoConfig,
  type BomberConfig,
  type BotDifficulty,
  type CharacterId,
  type ProtoRules,
  type SkillId,
} from '../contract'

/**
 * 页面 URL 参数（纯函数，可单测）。全部可选：
 *   ?seed=123       固定地图与 Bot 随机种子（默认随机）
 *   ?match=150      局时秒数（默认 = 7 分钟上限 ProtoRules.matchCapMs，ADR 0031；≤ 决赛圈时长时整局都是决赛圈）
 *   ?bots=7         Bot 数量 0–7（默认 7）
 *   ?ai=normal      Bot 难度 easy / normal / hard（默认 normal，design §15 Bot 难度分档（原型工具））
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
  bots: number
  ai: BotDifficulty
  character: CharacterId | null
  dev: ReadonlySet<DevFlag>
}

/** 原型固定 8 人档：你 + 至多 7 个 Bot（design §5）。 */
export const MAX_BOTS = DEFAULT_RULES.playerCount - 1
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
  return {
    seed: intParam(q, 'seed'),
    matchSec: match !== null && match > 0 ? match : null,
    bots: Math.max(0, Math.min(MAX_BOTS, intParam(q, 'bots') ?? MAX_BOTS)),
    ai: parseBotDifficulty(q.get('ai')),
    character: parseCharacterId(q.get('char')),
    dev,
  }
}

/** 本局配置：契约默认 + 7 分钟上限（protoConfig），`?match=` 覆盖局时。 */
export function appConfig(p: Pick<AppParams, 'matchSec'>, rules: Pick<ProtoRules, 'matchCapMs'> = DEFAULT_RULES): BomberConfig {
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
