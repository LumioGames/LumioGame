import { CHARACTER_ORDER, type ProtoRules, type SkillId } from '../contract'
import { SPECIAL_BOMB_IDS, visibleBomb } from '../present/favorite-bomb'

/**
 * 首次游玩提示（design §13）：只有三条，按序显示，完成对应动作后永久消失。
 * 第 3 条「追光柱，抢最多的帽子」在本人帽数（= 强化数，ADR 0028）第一次达到 {@link TIP_HATS_GOAL} 时完成：
 * 纯快照判定（HatCount），不依赖「捡到别人掉的强化」这类原型扩展字段。
 */
export const TIPS = ['放炸弹，炸开积木', '捡糖，换特殊炸弹', '追光柱，抢最多的帽子'] as const

export const TipId = { Brick: 0, Candy: 1, Hats: 2 } as const

/** 第 3 条提示完成所需的帽数。 */
export const TIP_HATS_GOAL = 3
export type TipId = (typeof TipId)[keyof typeof TipId]

export interface TipStore {
  load(): readonly number[]
  save(done: readonly number[]): void
}

const KEY = 'lumio-101-bomber-tips'

export function localTipStore(): TipStore {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(KEY)
        const v: unknown = raw ? JSON.parse(raw) : []
        return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
      } catch {
        // 隐私模式 / 存储被禁用：当作全新玩家，本次会话内照常推进。
        return []
      }
    },
    save(done) {
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(done))
      } catch {
        // 同上。
      }
    },
  }
}

export class TipProgress {
  private readonly done: Set<number>

  constructor(private readonly store: TipStore) {
    this.done = new Set(store.load())
  }

  /** @returns 是否是新完成的（用于播放完成动画）。 */
  complete(id: TipId): boolean {
    if (this.done.has(id)) return false
    this.done.add(id)
    this.store.save([...this.done].sort())
    return true
  }

  isDone(id: TipId): boolean {
    return this.done.has(id)
  }

  /** 当前该显示的提示：按序第一条未完成的；全部完成返回 null。 */
  current(): { id: TipId; text: string } | null {
    for (let i = 0; i < TIPS.length; i++) {
      if (!this.done.has(i)) return { id: i as TipId, text: TIPS[i] }
    }
    return null
  }
}

/**
 * 开局倒数期间的一句话规则卡（design §1 / §9.6，ADR 0025 / 0028 / 0031）：三短句，Running 开始时淡出。
 * 第 4 轮：技能不算帽子（D5）；决赛圈里活到最后者赢（D2）。
 */
export function ruleCardLines(finalCircleSeconds = 115): readonly string[] {
  return [
    '吃一个强化糖，头顶多一顶帽子（帽子 = 强化数，技能不算）',
    '被炸死会掉一半强化，谁捡归谁',
    `决赛圈 ${Math.round(finalCircleSeconds)} 秒：不能复活、圈外有毒，活到最后者赢`,
  ]
}

export type HelpRules = Pick<ProtoRules, 'characters' | 'skills' | 'finalCircleMs' | 'ringStages' | 'chestHitsRequired' | 'chestSkillCandyPool'>

/** 帮助卡里炸弹糖的一句话效果（表现文案；没列到的新炸弹只写名字）。中毒弹 / 麻痹弹 = 原型扩展（NON-CONTRACT，ADR 0033）。 */
const BOMB_EFFECT: Readonly<Partial<Record<SkillId, string>>> = {
  freezeBomb: '冻住',
  pierceBomb: '多穿砖',
  toxinBomb: '持续掉血（吃血包或放泡泡能解毒）',
  shockBomb: '让人走得极慢',
  fireBomb: '留下火焰',
  remoteBomb: '可以遥控引爆',
  splitBomb: '向外分裂',
}

/** 帮助卡的规则列表（design §8 / §12 / §4.2，ADR 0030 / 0031）：数值全部从规则表读，不写死。 */
export function helpRuleLines(rules: HelpRules): string[] {
  const chars = CHARACTER_ORDER.map((id) => {
    const c = rules.characters[id]
    const s = rules.skills[c.skill]
    return `${c.name}（${s.slot === 'active' ? 'Shift ' : '被动 '}${s.name}）`
  })
  const last = rules.ringStages.length ? rules.ringStages[rules.ringStages.length - 1].size : 1
  const bombPool = SPECIAL_BOMB_IDS.filter((id) => visibleBomb(id, rules) && rules.skills[id].candyWeight > 0)
  const bombs = bombPool.map((id) => `${rules.skills[id].name}${BOMB_EFFECT[id] ?? ''}`)
  const chestCandy = rules.chestSkillCandyPool === 'bomb' ? '一颗炸弹糖' : '技能糖'
  const count = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'][chars.length] ?? String(chars.length)
  return [
    '3 颗心；每颗炸弹 −1 心，连锁能一口气秒杀。',
    `${count}个角色各带一个专属技能：${chars.join('、')}。`,
    '只有一个特殊炸弹槽：踩到不同形态会替换当前炸弹；角色技能由所选角色决定。',
    ...(bombs.length ? [`特殊炸弹：${bombs.join('、')}。`] : []),
    '炸开积木会掉糖：火力、炸弹、速度、血包。头顶的帽子 = 强化数，血包和技能都不算。',
    '被炸死时强化每级一半概率掉出（决赛圈里全掉），掉在地上的谁捡归谁。',
    '水里会减速、放不了炸弹，泡久了会溺水。',
    `最后 ${Math.round(rules.finalCircleMs / 1000)} 秒（或积木快被炸光时）进入决赛圈：死了不再复活，圈外中毒，安全圈一路缩到正中 ${last} 格。`,
    `决赛圈里的金色宝箱要被炸 ${rules.chestHitsRequired} 次才开，里面有强化、血包和${chestCandy}。`,
    '活到最后者赢：只剩一人时立刻结束；时间到时存活者比帽子，并列同名次。',
  ]
}
