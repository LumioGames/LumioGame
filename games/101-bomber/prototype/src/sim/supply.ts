import { BlockType, MatchPhase, PickupKind, type SkillId } from '../contract'
import { freeCellsNear, keyedRng, rollCandy, rollSpecialBomb } from './chest'
import { createPickup, type PickupOrigin } from './pickup'
import { cellOccupied, cellOfIdx, emit, type World } from './world'

/**
 * 原型扩展（NON-CONTRACT，ADR 0040，design §8.6）：中央大补给。只在 `map.centralSupply` 的档（27 档）：
 * 开局 StartTick + supplyAnnounceMs（0:50）全场预告（SupplyAnnounced，AtTick = 开启 Tick），+ supplyOpenMs（1:00）在核心中央
 * 广场开启（SupplyOpened），随后逐件 PickupSpawned（Source = 'supply'，FromCell = 中心）公开喷发 supplyLoot：
 * 糖果（火力 / 炸弹 / 速度按 pickupWeights）、血包、狂暴糖、特殊炸弹（ADR 0041 前 = Lv1 炸弹类技能糖）、金心。每局 1 次，
 * 不用 HP、不记归属；只在 Running / Endgame 推进（局在开启前结束就不开）。
 * 随机走每局一条的 'supply' 流（chest.ts keyedRng），旧流序列不变。
 */

/** 喷发先在中心沿路径这么多步内找空地（3 步覆盖 3×3 广场与其外一圈的连通空地；落点规则，不是调参数值）。 */
const SPRAY_RADIUS = 3

/** 开局排定本局的中央补给（startMatch 在 StartTick 定下之后调用）；本档没有中央补给 → null。 */
export function setupSupply(w: World): void {
  const map = w.rules.map
  if (!map.centralSupply || map.size !== w.size) {
    w.supply = null
    return
  }
  const mid = (w.size - 1) / 2
  const start = w.match.startTick
  w.supply = { cell: mid * w.size + mid, announceTick: start + w.ticks.supplyAnnounce, openTick: start + w.ticks.supplyOpen, state: 'pending' }
}

/** step.ts 在 VoxelCommit 相（宝箱开启之后）调用：到点预告、到点开启喷发。 */
export function advanceSupply(w: World): void {
  const sp = w.supply
  if (!sp || sp.state === 'opened') return
  const phase = w.match.phase
  if (phase !== MatchPhase.Running && phase !== MatchPhase.Endgame) return
  const t = w.t
  if (sp.state === 'pending' && t >= sp.announceTick) {
    sp.state = 'announced'
    emit(w, { type: 'SupplyAnnounced', presentationOnly: true, Cell: cellOfIdx(w, sp.cell), AtTick: sp.openTick, Tick: t })
  }
  if (sp.state === 'announced' && t >= sp.openTick) {
    sp.state = 'opened'
    emit(w, { type: 'SupplyOpened', presentationOnly: true, Cell: cellOfIdx(w, sp.cell), Tick: t })
    sprayLoot(w, sp.cell)
  }
}

/** 战利品清单（按 supplyLoot 的件数）→ 洗牌 → 逐件落在 {@link supplyCells} 给的格上。 */
function sprayLoot(w: World, center: number): void {
  const rng = keyedRng(w, 'supply', 0)
  const loot = w.rules.supplyLoot
  const items: { kind: PickupKind; skill?: SkillId }[] = []
  for (let i = 0; i < loot.candies; i++) items.push({ kind: rollCandy(w, rng, false) })
  for (let i = 0; i < loot.healthPacks; i++) items.push({ kind: PickupKind.HealthPack })
  for (let i = 0; i < loot.frenzy; i++) items.push({ kind: PickupKind.Frenzy })
  for (let i = 0; i < loot.specialBombs; i++) {
    const skill = rollSpecialBomb(w, rng)
    if (skill !== null) items.push({ kind: PickupKind.SkillCandy, skill })
  }
  for (let i = 0; i < loot.goldHearts; i++) items.push({ kind: PickupKind.GoldHeart })
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.NextInt(0, i + 1)
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  const cells = supplyCells(w, center, items.length)
  const origin: PickupOrigin = { source: 'supply', droppedBy: 0, fromCell: center }
  for (let k = 0; k < items.length && k < cells.length; k++) {
    const it = items[k]
    createPickup(w, cells[k], it.kind, origin, it.skill ? { skill: it.skill, level: w.rules.skillCandyLevel } : null)
  }
}

/**
 * 喷发落点（主 loop 批准的口径）：先取从中心沿可通行路径半径 SPRAY_RADIUS 内的空地（chest.ts freeCellsNear，广场与其相连的空地），
 * 不够 n 格再按「离中心近」补足全图其余空地（非水、砖层空、无弹 / 糖果 / 宝箱）——件数永远精确。两组各自按
 * 切比雪夫距离 → 曼哈顿距离 → 格下标排序，于是广场 3×3 最先填满。
 */
export function supplyCells(w: World, center: number, n: number): number[] {
  const size = w.size
  const cx = center % size
  const cy = Math.floor(center / size)
  const key = (c: number): [number, number, number] => {
    const dx = Math.abs((c % size) - cx)
    const dy = Math.abs(Math.floor(c / size) - cy)
    return [Math.max(dx, dy), dx + dy, c]
  }
  const byNear = (a: number, b: number): number => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  }
  const reach = freeCellsNear(w, center, SPRAY_RADIUS)
    .filter((c) => w.brick[c] === BlockType.Air)
    .sort(byNear)
  if (reach.length >= n) return reach.slice(0, n)
  const taken = new Set(reach)
  const rest: number[] = []
  for (let c = 0; c < size * size; c++)
    if (!taken.has(c) && w.brick[c] === BlockType.Air && w.ground[c] !== BlockType.水 && !cellOccupied(w, c)) rest.push(c)
  rest.sort(byNear)
  return [...reach, ...rest].slice(0, n)
}
