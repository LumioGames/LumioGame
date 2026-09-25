/**
 * 首次游玩提示（design §13）：只有三条，按序显示，完成对应动作后永久消失。
 * 第 3 条「追光柱，抢最多的帽子」在本人帽数（= 强化数，ADR 0028）第一次达到 {@link TIP_HATS_GOAL} 时完成：
 * 纯快照判定（HatCount），不依赖「捡到别人掉的强化」这类原型扩展字段。
 */
export const TIPS = ['放炸弹，炸开积木', '捡糖，让炸弹更强', '追光柱，抢最多的帽子'] as const

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

/** 开局倒数期间的一句话规则卡（design §1 / §9.6，ADR 0025 / 0028）：三短句，Running 开始时淡出。 */
export function ruleCardLines(finalCircleSeconds = 90): readonly string[] {
  return [
    '吃一个强化糖，头顶多一顶帽子（帽子 = 强化数）',
    '被炸死会掉一半强化，谁捡归谁',
    `最后 ${Math.round(finalCircleSeconds)} 秒决赛圈：不能复活，圈外有毒`,
  ]
}
