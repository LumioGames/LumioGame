import { BlockType } from '../contract'
import { bombLoadout } from './skills'
import { anyBombAt, cellOfIdx, chestAt, emit, makeBomb, newId, playerCell, type SimPlayer, type World } from './world'

/**
 * 放弹技能（契约 §2.1，准入五步中与玩法相关的两步）：③ 手上炸弹数基础 ≥ 1；⑤ 所在格没有炸弹。
 * 两者失败都不扣消耗、保留缓冲（design §6.1 规则 4：125 ms 内进入合法格自动放）。
 * 水方格上放下即熄灭（design §5.1）：不生成实体、不扣手上炸弹数，但保护照样解除。
 * 原型扩展（NON-CONTRACT，ADR 0030）：泡泡期 / 冻结中按键作废——不放、不留缓冲、不解除泡泡；
 * 炸弹槽技能决定这颗弹的种类 / 穿透层数 / 冻结时长（skills.ts bombLoadout）。
 *
 * 原型扩展（NON-CONTRACT，ADR 0040，design §8.5；口径经主 loop 裁定）：狂暴期间（t < frenzyUntilTick）
 * - 两次放弹间隔 ≥ frenzyMinIntervalTicks（5 Tick @20 Hz = 每秒 ≤ 4 颗），不够间隔的按键照常留缓冲；
 * - 先走独立的狂暴池：本人场上未爆的狂暴弹（uncounted）< frenzyExtraBombs（6）时放一颗狂暴弹——引信 frenzyFuse（1.2 s）、
 *   uncounted（不扣也不回手炸弹数、不计帽数，主人免疫）、形态照炸弹槽技能；爆了就补（同时在场 ≤ 6）；
 * - 池满时再放 = 普通炸弹（扣手上炸弹数、普通引信、主人不免疫），手上没弹则不放。
 */
export function applyPlace(w: World, p: SimPlayer, pressed: boolean): void {
  const t = w.t
  if (t < p.bubbleUntilTick || t < p.frozenUntilTick) {
    p.bombBufUntil = 0
    return
  }
  if (pressed) p.bombBufUntil = t + w.ticks.inputBuffer
  if (t >= p.bombBufUntil) return
  const frenzy = t < p.frenzyUntilTick
  if (frenzy && p.frenzyLastPlaceTick > 0 && t - p.frenzyLastPlaceTick < w.rules.frenzyMinIntervalTicks) return
  const extra = frenzy && liveFrenzyBombs(w, p.id) < w.rules.frenzyExtraBombs
  if (!extra && p.capacity < 1) return
  const cell = playerCell(w, p)
  if (anyBombAt(w, cell) || chestAt(w, cell)) return
  p.bombBufUntil = 0
  p.protectedUntilTick = Math.min(p.protectedUntilTick, t)
  if (frenzy) p.frenzyLastPlaceTick = t
  if (w.ground[cell] === BlockType.水) {
    emit(w, { type: 'BombExtinguished', presentationOnly: true, OwnerNetEntityIdRaw: p.id, Cell: cellOfIdx(w, cell), Tick: t })
    return
  }
  if (!extra) p.capacity--
  const id = newId(w)
  const fuseEndTick = t + (extra ? w.ticks.frenzyFuse : w.ticks.fuse)
  w.bombs.push(makeBomb({ id, owner: p.id, cell, bornTick: t, fuseEndTick, power: p.power, ...bombLoadout(w, p), uncounted: extra }))
  emit(w, {
    type: 'BombPlaced',
    OwnerNetEntityIdRaw: p.id,
    Cell: cellOfIdx(w, cell),
    FuseEndTick: fuseEndTick,
    Tick: t,
    proto: { BombNetEntityIdRaw: id },
  })
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：本人场上未爆的狂暴弹数（狂暴池的占用；爆了即释放）。 */
export function liveFrenzyBombs(w: World, owner: number): number {
  let n = 0
  for (const b of w.bombs) if (b.owner === owner && b.uncounted && b.explodedAtTick === 0) n++
  return n
}
