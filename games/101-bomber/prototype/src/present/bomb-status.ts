import type { PlayerView, U64, WorldSnapshot } from '../contract'

/**
 * 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹的中招状态——HUD（心变绿、「麻痹中」小标签）与音效兜底共用一份口径，
 * 纯函数、无 DOM。只读快照 `PlayerSkillsView.toxinUntilTick` / `shockUntilTick`（可选字段，缺席 = 0 = 没中招）。
 */

export interface BombStatus {
  poisoned: boolean
  shocked: boolean
  /** 剩余秒数（没中招为 0）。 */
  toxinSec: number
  shockSec: number
}

const NONE: BombStatus = { poisoned: false, shocked: false, toxinSec: 0, shockSec: 0 }

/**
 * @param tick 渲染 Tick（可为小数）；UntilTick 不含。
 * @param rate Tick / 秒。
 */
export function bombStatus(p: PlayerView | undefined, tick: number, rate: number): BombStatus {
  const sk = p?.skills
  if (!p || !sk || p.玩家属性.血量当前 <= 0 || p.eliminated) return NONE
  const toxin = sk.toxinUntilTick ?? 0
  const shock = sk.shockUntilTick ?? 0
  const poisoned = tick < toxin
  const shocked = tick < shock
  if (!poisoned && !shocked) return NONE
  return {
    poisoned,
    shocked,
    toxinSec: poisoned ? (toxin - tick) / rate : 0,
    shockSec: shocked ? (shock - tick) / rate : 0,
  }
}

const sec = (s: number): string => String(Math.round(s * 10) / 10)

export interface StatusChip {
  kind: 'toxin' | 'shock' | 'both'
  text: string
  /** 悬停说明（剩余秒数、怎么解）。 */
  title: string
}

/** 属性胶囊里心旁边的小标签：「麻痹中」/「中毒中」/「中毒 · 麻痹中」；没中招为 null。 */
export function statusChip(s: BombStatus): StatusChip | null {
  const toxin = `中毒中：持续掉血，还剩 ${sec(s.toxinSec)} 秒 · 吃血包或放泡泡能解毒`
  const shock = `麻痹中：移速变慢，还剩 ${sec(s.shockSec)} 秒`
  if (s.poisoned && s.shocked) return { kind: 'both', text: '中毒 · 麻痹中', title: `${toxin}\n${shock}` }
  if (s.shocked) return { kind: 'shock', text: '麻痹中', title: shock }
  if (s.poisoned) return { kind: 'toxin', text: '中毒中', title: toxin }
  return null
}

export type StatusCue = 'poisoned' | 'shocked' | 'cured'
export type StatusEventType = 'PlayerPoisoned' | 'PlayerShocked' | 'PlayerCured'

/**
 * 本人中招 / 解毒的快照兜底（数据源没有 PlayerPoisoned / PlayerShocked / PlayerCured 时）：
 * - 中毒 / 麻痹：UntilTick 比上一份快照大（首次命中与再次命中刷新都算，同事件口径）；
 * - 解毒：上一份的中毒终点还没到、这一份却清零，且人还活着（到期自然消失与死亡清除都不算）。
 * 每种事件见过一次（{@link noteEvent}，任何玩家的都算）后，那一种只认事件——不会事件、兜底各响一遍。
 * 第一份快照与换局只记基线。
 */
export class BombStatusWatch {
  private toxin: number | null = null
  private shock: number | null = null
  private matchIndex = -1
  private readonly saw = new Set<StatusEventType>()

  noteEvent(type: StatusEventType): void {
    this.saw.add(type)
  }

  check(snap: WorldSnapshot, localId: U64): StatusCue[] {
    if (snap.match.matchIndex !== this.matchIndex) {
      this.matchIndex = snap.match.matchIndex
      this.toxin = this.shock = null
    }
    const me = snap.Players.find((p) => p.NetEntityIdRaw === localId)
    const sk = me?.skills
    if (!me || !sk) return []
    const toxin = sk.toxinUntilTick ?? 0
    const shock = sk.shockUntilTick ?? 0
    const wasToxin = this.toxin
    const wasShock = this.shock
    this.toxin = toxin
    this.shock = shock
    const out: StatusCue[] = []
    if (wasToxin === null || wasShock === null) return out
    const alive = me.玩家属性.血量当前 > 0 && !me.eliminated
    if (!this.saw.has('PlayerPoisoned') && toxin > wasToxin && toxin > snap.Tick) out.push('poisoned')
    if (!this.saw.has('PlayerShocked') && shock > wasShock && shock > snap.Tick) out.push('shocked')
    if (!this.saw.has('PlayerCured') && alive && toxin === 0 && wasToxin > snap.Tick) out.push('cured')
    return out
  }
}
