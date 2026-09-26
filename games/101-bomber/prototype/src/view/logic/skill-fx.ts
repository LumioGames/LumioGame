import {
  BlockType,
  BombKind,
  skillParams,
  type BombView,
  type BomberCell,
  type PlayerSkillsView,
  type PlayerView,
  type ProtoRules,
  type SkillId,
  type WorldSnapshot,
} from '../../contract'
import { DIR_VEC } from '../../shared/grid'
import { blinkScan, type GridProbe } from '../../shared/skill-geometry'
import type { XZ } from './interp'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：角色技能表现的纯逻辑（无 three 依赖，node 下单测）。
 * 全部只读快照里的可选字段（PlayerView.skills / BombView.kick / FireZones），缺席时退化为「没有技能表现」。
 */

/** 表现取值（推断待验证）。 */
export const SKILL_FX = {
  /** 泡泡球半径（格）。 */
  bubbleRadius: 0.62,
  /** 泡泡最后这么多秒闪烁提示将破（亮 / 暗，不消失，照顾光敏）。 */
  bubbleFlickerSec: 0.6,
  bubbleAlpha: 0.32,
  bubbleFlickerHz: 6,
  /** 闪现拖尾存续（毫秒）与每格的辉光数。 */
  trailMs: 320,
  trailGlowsPerCell: 3,
  /** 火墙最后这么多秒淡出。 */
  fireFadeSec: 0.4,
  /** 火焰光环地圈直径（格）：3×3。 */
  auraRingDiameter: 3.0,
  /** 组合技腰间光环半径、环绕小球数。 */
  comboRingRadius: 0.42,
  comboOrbs: 3,
  /** 冰块尺寸（宽、高、深，格）。 */
  iceBlock: [0.8, 1.35, 0.8] as const,
  /** 被踢炸弹滑行时的小跳高度（格）。 */
  kickHop: 0.06,
  /** 两帧之间位移超过这么多格就不插值（换了一次踢 / 瞬移）。 */
  kickSnapCells: 1.5,
  /** 进化爆发的彩纸片数。 */
  evolveConfetti: 40,
  /** 本机闪现后镜头滑行时长（秒）。 */
  blinkGlide: 0.35,
} as const

export type BombStyle = 'standard' | 'frost' | 'pierce' | 'glacier'

/** 炸弹外观：冰冻 + 穿透 = 冰川弹；冰冻 = 霜壳；穿透 = 钻头。 */
export function bombStyle(kind: number, pierce: number): BombStyle {
  const frost = kind === BombKind.Freeze
  const drill = kind === BombKind.Pierce || pierce > 0
  if (frost && drill) return 'glacier'
  if (frost) return 'frost'
  if (drill) return 'pierce'
  return 'standard'
}

/** 被踢炸弹的表现位置：逻辑格心 + 朝滑行方向已走过的千分格。 */
export function kickedPos(x: number, z: number, kick: BombView['kick'] | undefined, out: XZ = { x: 0, z: 0 }): XZ {
  out.x = x
  out.z = z
  if (kick) {
    const v = DIR_VEC[kick.dir]
    const f = kick.progressMilli / 1000
    out.x += v.dx * f
    out.z += v.dy * f
  }
  return out
}

/** prev → curr 线性插值；没有 prev 或跳得太远（> kickSnapCells）直接取 curr。 */
export function lerpKicked(prev: XZ | null, curr: XZ, alpha: number, out: XZ): XZ {
  if (!prev || Math.abs(curr.x - prev.x) + Math.abs(curr.z - prev.z) > SKILL_FX.kickSnapCells) {
    out.x = curr.x
    out.z = curr.z
    return out
  }
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  out.x = prev.x + (curr.x - prev.x) * a
  out.z = prev.z + (curr.z - prev.z) * a
  return out
}

export type TeleportKind = 'none' | 'first' | 'respawn' | 'blink'

/**
 * 一次快照里玩家的位置跳变是什么：
 *   - 'blink'：闪现 / 冲刺（skills.blinkTick === teleportTick；字段缺席时退化为「活着 → 活着的瞬移只能是闪现」，
 *     开局摆位靠换局时清空 lastTp 排除；teleportTick 没动但 blinkTick 比 lastBlink 新也算）
 *     ——演拖尾 + 原地「啵」，**不**演重生的从天而降；
 *   - 'first' / 'respawn'：首次出现 / 复活 → 从上方落下；
 *   - 'none'：没有瞬移。
 */
export function teleportKind(
  lastTp: number | undefined,
  p: { teleportTick: number; blinkTick?: number; hp: number; eliminated: boolean },
  prevHp: number | undefined,
  lastBlink?: number,
): TeleportKind {
  const teleported = lastTp === undefined || p.teleportTick > lastTp
  const revived = prevHp !== undefined && prevHp <= 0 && p.hp > 0
  if (lastTp !== undefined && teleported && !revived) {
    if (p.blinkTick !== undefined && p.blinkTick === p.teleportTick) return 'blink'
    if (p.blinkTick === undefined && prevHp !== undefined && prevHp > 0 && p.hp > 0) return 'blink'
  }
  // 规则层闪现时若没推进 teleportTick：blinkTick 前进本身就说明这一帧是闪现。
  if (lastTp !== undefined && !teleported && !revived && p.hp > 0 && !p.eliminated) {
    if (lastBlink !== undefined && p.blinkTick !== undefined && p.blinkTick > lastBlink) return 'blink'
  }
  if (p.hp > 0 && !p.eliminated && (teleported || revived)) return lastTp === undefined ? 'first' : 'respawn'
  return 'none'
}

/** 光环格相对主人所在格的偏移（光环跟着插值后的熊画，不跳格）。 */
export function auraFlameOffsets(cells: readonly BomberCell[], owner: BomberCell): { dx: number; dy: number }[] {
  return cells.map((c) => ({ dx: c.X - owner.X, dy: c.Y - owner.Y }))
}

/** 火墙亮度：结束前 fireFadeSec 秒线性淡到 0。 */
export function fireFade(untilTick: number, renderTick: number, rate: number): number {
  const left = (untilTick - renderTick) / Math.max(1, rate)
  if (left <= 0) return 0
  return Math.min(1, left / SKILL_FX.fireFadeSec)
}

/** 身上的组合技（主动 → 炸弹 → 被动槽的顺序取第一个）；没有 → null。 */
export function comboOf(s: PlayerSkillsView | undefined, skills: ProtoRules['skills']): SkillId | null {
  if (!s) return null
  for (const slot of ['active', 'bomb', 'passive'] as const) {
    const v = s.slots[slot]
    if (v && skills[v.skill]?.combo) return v.skill
  }
  return null
}

function combosIn(s: PlayerSkillsView | undefined, skills: ProtoRules['skills']): SkillId[] {
  const out: SkillId[] = []
  if (!s) return out
  for (const slot of ['active', 'bomb', 'passive'] as const) {
    const v = s.slots[slot]
    if (v && skills[v.skill]?.combo) out.push(v.skill)
  }
  return out
}

/** 这一帧新长出来的组合技（进化爆发给所有人看）。 */
export function newCombos(prev: PlayerSkillsView | undefined, curr: PlayerSkillsView | undefined, skills: ProtoRules['skills']): SkillId[] {
  const before = combosIn(prev, skills)
  return combosIn(curr, skills).filter((c) => !before.includes(c))
}

/** 快照 → 技能几何探针（与规则层 gridProbe 同口径）：占格 = 未爆炸弹或宝箱。 */
export function snapshotProbe(snap: WorldSnapshot): GridProbe {
  const size = snap.Terrain.size
  const occ = new Set<number>()
  for (const b of snap.Bombs) {
    if (b.BomberBombState.ExplodedAtTick > 0) continue
    occ.add(Math.floor(b.LogicTransform.WorldPosition.z) * size + Math.floor(b.LogicTransform.WorldPosition.x))
  }
  for (const c of snap.Chests ?? []) occ.add(Math.floor(c.LogicTransform.WorldPosition.z) * size + Math.floor(c.LogicTransform.WorldPosition.x))
  return { size, brick: snap.Terrain.brick, ground: snap.Terrain.ground, occupied: (ci) => occ.has(ci) }
}

const BLINKERS: readonly SkillId[] = ['blink', 'fireDash']

/** 主动技能现在按得出来（有 CD 数据时看 CD；冻住、倒地、出局都不行）。 */
export function activeReady(p: PlayerView, tick: number): boolean {
  const s = p.skills
  if (!s || !s.slots.active) return false
  return tick >= s.cdUntilTick && tick >= s.frozenUntilTick && p.玩家属性.血量当前 > 0 && !p.eliminated
}

/** 本机闪现 / 冲刺的落点预览：主动槽是闪现类且就绪时，按与规则层同一个 blinkScan 算；否则 null。 */
export function blinkLanding(
  snap: WorldSnapshot,
  p: PlayerView,
  rules: Pick<ProtoRules, 'skills'>,
  probe: GridProbe = snapshotProbe(snap),
): { landing: BomberCell; path: BomberCell[] } | null {
  const s = p.skills
  const a = s?.slots.active
  if (!s || !a || !BLINKERS.includes(a.skill) || !activeReady(p, snap.Tick)) return null
  const size = snap.Terrain.size
  const from = Math.floor(p.LogicTransform.WorldPosition.z) * size + Math.floor(p.LogicTransform.WorldPosition.x)
  const r = blinkScan(probe, from, s.facing, skillParams(rules.skills, a.skill, a.level).rangeCells)
  if (!r) return null
  const cell = (ci: number): BomberCell => ({ X: ci % size, Y: Math.floor(ci / size) })
  return { landing: cell(r.landing), path: r.path.map(cell) }
}

/** 泡泡透明度：生效中为 bubbleAlpha，最后 bubbleFlickerSec 秒在 [0.45, 1] 倍之间闪；结束为 0。 */
export function bubbleAlpha(untilTick: number, renderTick: number, rate: number): number {
  const left = (untilTick - renderTick) / Math.max(1, rate)
  if (left <= 0) return 0
  if (left >= SKILL_FX.bubbleFlickerSec) return SKILL_FX.bubbleAlpha
  const k = 0.45 + 0.55 * Math.abs(Math.cos(left * Math.PI * SKILL_FX.bubbleFlickerHz))
  return SKILL_FX.bubbleAlpha * k
}

/** 砖层是不是空的（火墙 / 光环格的地面辉光只画在空地上）。 */
export function openCell(snap: Pick<WorldSnapshot, 'Terrain'>, c: BomberCell): boolean {
  const t = snap.Terrain
  if (c.X < 0 || c.Y < 0 || c.X >= t.size || c.Y >= t.size) return false
  return t.brick[c.Y * t.size + c.X] === BlockType.Air
}
