import { BlockType } from '../contract'
import { anyBombAt, cellOfIdx, chestAt, emit, newId, playerCell, type SimPlayer, type World } from './world'

/**
 * 放弹技能（契约 §2.1，准入五步中与玩法相关的两步）：③ 手上炸弹数基础 ≥ 1；⑤ 所在格没有炸弹。
 * 两者失败都不扣消耗、保留缓冲（design §6.1 规则 4：125 ms 内进入合法格自动放）。
 * 水方格上放下即熄灭（design §5.1）：不生成实体、不扣手上炸弹数，但保护照样解除。
 */
export function applyPlace(w: World, p: SimPlayer, pressed: boolean): void {
  const t = w.t
  if (pressed) p.bombBufUntil = t + w.ticks.inputBuffer
  if (t >= p.bombBufUntil) return
  if (p.capacity < 1) return
  const cell = playerCell(w, p)
  if (anyBombAt(w, cell) || chestAt(w, cell)) return
  p.bombBufUntil = 0
  p.protectedUntilTick = Math.min(p.protectedUntilTick, t)
  if (w.ground[cell] === BlockType.水) {
    emit(w, { type: 'BombExtinguished', presentationOnly: true, OwnerNetEntityIdRaw: p.id, Cell: cellOfIdx(w, cell), Tick: t })
    return
  }
  p.capacity--
  const id = newId(w)
  const fuseEndTick = t + w.ticks.fuse
  w.bombs.push({
    id,
    owner: p.id,
    cell,
    bornTick: t,
    fuseEndTick,
    power: p.power,
    chainId: 0,
    explodedAtTick: 0,
    dangerUntilTick: 0,
    burnUntilTick: 0,
    reachUp: 0,
    reachDown: 0,
    reachLeft: 0,
    reachRight: 0,
    covered: [],
    hit: [],
    seq: 0,
  })
  emit(w, {
    type: 'BombPlaced',
    OwnerNetEntityIdRaw: p.id,
    Cell: cellOfIdx(w, cell),
    FuseEndTick: fuseEndTick,
    Tick: t,
    proto: { BombNetEntityIdRaw: id },
  })
}
