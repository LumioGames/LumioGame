import { BombKind, skillParams, 方向, type SkillId } from '../contract'
import { blinkScan } from '../shared/skill-geometry'
import type { SkillTickRow } from './ticks'
import { cellOfIdx, centerMilli, emit, gridProbe, newId, playerCell, type SimPlayer, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能槽的规则层（design §8.1 / §8.4，D11–D13）。
 * - 主动槽（Shift / 副按钮）：泡泡 / 弹射泡泡、闪现 / 火焰冲刺、火焰光环；冷却从施放 Tick 起算，CD 跨死亡保留、开局清。
 * - 炸弹槽：放弹时决定炸弹种类 / 穿透层数 / 冻结时长（{@link bombLoadout}）。
 * - 被动槽：踢弹距离（{@link kickRange}，kick.ts 用）；回春在 recovery.ts。
 * 冻结门在 step.ts（冻结中按技能键发 SkillFailed 'frozen'，不会走到 {@link applySkill}）。
 */

/** 当前等级的 Tick 参数（等级夹到 [1, 表长]；组合技只有 1 级）。 */
export function skillTicks(w: World, id: SkillId, level: number): SkillTickRow {
  const rows = w.ticks.skills[id]
  const i = Math.max(1, Math.min(rows.length, Math.floor(level))) - 1
  return rows[i]
}

export interface BombLoadout {
  kind: BombKind
  pierceLayers: number
  freezeTicks: number
}

const STANDARD_LOADOUT: BombLoadout = { kind: BombKind.Standard, pierceLayers: 0, freezeTicks: 0 }

/** design §8.1 炸弹槽：放弹时生效。空槽 = 标准弹。冻结时长夹到 freezeCap（冰冻弹 / 冰川弹 = BombKind.Freeze）。 */
export function bombLoadout(w: World, p: SimPlayer): BombLoadout {
  const s = p.slots.bomb
  if (!s) return STANDARD_LOADOUT
  const kind = w.rules.skills[s.skill].bombKind ?? BombKind.Standard
  const pierceLayers = skillParams(w.rules.skills, s.skill, s.level).pierceLayers
  const freezeTicks = kind === BombKind.Freeze ? Math.min(skillTicks(w, s.skill, s.level).freeze, w.ticks.freezeCap) : 0
  return { kind, pierceLayers, freezeTicks }
}

/**
 * 可踢距离（格）：被动槽踢弹按等级（3 / 5 / 99 = 直到被挡）；弹射泡泡只在泡泡期内（t < bubbleUntilTick）按它的 rangeCells；
 * 两者取大；0 = 不能踢。
 */
export function kickRange(w: World, p: SimPlayer): number {
  let r = 0
  const passive = p.slots.passive
  if (passive?.skill === 'kick') r = skillParams(w.rules.skills, 'kick', passive.level).rangeCells
  const active = p.slots.active
  if (active?.skill === 'bounceBubble' && w.t < p.bubbleUntilTick) r = Math.max(r, skillParams(w.rules.skills, 'bounceBubble', active.level).rangeCells)
  return r
}

/**
 * 闪现落地：瞬移到落点格心，只清在途移动（缓冲转向 / 接续 / 累计量）。**不调用 resetAbilityFields**——
 * 溺水 / 毒圈计数、放弹缓冲与所有技能计时都保留；blinkTick === teleportTick 让表现层把这次瞬移认作闪现而不是重生。
 */
function blinkTo(w: World, p: SimPlayer, landing: number): void {
  p.mx = centerMilli(landing % w.size)
  p.my = centerMilli(Math.floor(landing / w.size))
  p.teleportTick = w.t
  p.blinkTick = w.t
  p.moveAcc = 0
  p.lastDir = 方向.停
  p.pendingDir = 方向.停
  p.turnBuf = 0
}

/**
 * 主动槽（Shift / 副按钮）。按序：空槽 → SkillFailed('noSkill')；冷却中 → SkillFailed('cooldown')；
 * 闪现 / 冲刺没有落点 → SkillFailed('noLanding')（不耗 CD、不动）。成功则：
 * - 泡泡 / 弹射泡泡：bubbleUntilTick = t + duration（[t, t+duration) 内不受炸弹 / 烧伤 / 冻结 / 溺水伤害、不能放弹；毒照扣）；
 * - 火焰光环：auraUntilTick = t + duration（零写入：不改地形、不引爆、不毁糖果；烧伤见 burn.ts）；
 * - 闪现：朝 facing 落到 blinkScan 的最远落点；
 * - 火焰冲刺：同闪现，另把 blinkScan.path（起点 + 途经的空格，不含落点）留成火墙，存续 [t, t+duration)。
 * SkillDef.endsProtection 的技能（光环 / 冲刺）施放即解除重生保护。CD = [t, t+cd)。
 */
export function applySkill(w: World, p: SimPlayer, pressed: boolean): void {
  if (!pressed) return
  const t = w.t
  const s = p.slots.active
  if (!s) {
    emit(w, { type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: null, Reason: 'noSkill', Tick: t })
    return
  }
  if (t < p.cdUntilTick) {
    emit(w, { type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: s.skill, Reason: 'cooldown', Tick: t })
    return
  }
  const tk = skillTicks(w, s.skill, s.level)
  const from = playerCell(w, p)
  let to = from
  let until = 0
  switch (s.skill) {
    case 'bubble':
    case 'bounceBubble':
      until = t + tk.duration
      p.bubbleUntilTick = until
      break
    case 'fireAura':
      until = t + tk.duration
      p.auraUntilTick = until
      break
    case 'blink':
    case 'fireDash': {
      const range = skillParams(w.rules.skills, s.skill, s.level).rangeCells
      const scan = blinkScan(gridProbe(w), from, p.facing, range)
      if (!scan) {
        emit(w, { type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: s.skill, Reason: 'noLanding', Tick: t })
        return
      }
      blinkTo(w, p, scan.landing)
      to = scan.landing
      if (s.skill === 'fireDash') {
        until = t + tk.duration
        w.fireWalls.push({ id: newId(w), owner: p.id, cells: scan.path, bornTick: t, untilTick: until })
      }
      break
    }
    default:
      // 主动槽只会装主动技能（表保证）；万一不是，按空槽处理、不耗 CD。
      emit(w, { type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: s.skill, Reason: 'noSkill', Tick: t })
      return
  }
  if (w.rules.skills[s.skill].endsProtection) p.protectedUntilTick = Math.min(p.protectedUntilTick, t)
  p.cdFromTick = t
  p.cdUntilTick = t + tk.cd
  emit(w, {
    type: 'SkillActivated',
    presentationOnly: true,
    PlayerNetEntityIdRaw: p.id,
    Skill: s.skill,
    Level: s.level,
    Cell: cellOfIdx(w, from),
    ToCell: cellOfIdx(w, to),
    UntilTick: until,
    CdUntilTick: p.cdUntilTick,
    Tick: t,
  })
}
