import { BlockType, MATERIALS, PickupKind, type PickupKindName, type SkillId } from '../contract'
import { canTakeSkill, rollCrateSkill, takeSkillCandy } from './skill-candy'
import {
  CELL_MILLI,
  HALF_MILLI,
  cellOfIdx,
  clearToxin,
  emit,
  isAlive,
  isPoisoned,
  makePickup,
  newId,
  playerCell,
  type SimPickup,
  type SimPlayer,
  type World,
} from './world'

/**
 * 掉落系统（design §7.4）与拾取系统（design §8.5 / §9.1，矩阵 4.4 / 5.x）。吃到强化帽数自动 +1（派生值，ADR 0028）。
 * 拾取竞争：站在同一格的活人里离格心最近者得，再比 id；恰好一人成功。达上限者不参与，物品留地。
 */

const KIND_ORDER: readonly (readonly [PickupKindName, PickupKind])[] = [
  ['FirePlus', PickupKind.FirePlus],
  ['BombPlus', PickupKind.BombPlus],
  ['SpeedPlus', PickupKind.SpeedPlus],
  ['HealthPack', PickupKind.HealthPack],
]

export interface PickupOrigin {
  source: 'brick' | 'crate' | 'death' | 'chest'
  /** Source = 'death' 时为死者，其余 0。 */
  droppedBy: number
  /** 喷出起点格；砖块掉落为物品所在格。 */
  fromCell: number
}

/** skill：Kind = SkillCandy 时糖里的技能与等级（原型扩展 NON-CONTRACT，ADR 0030）。 */
export function createPickup(
  w: World,
  cell: number,
  kind: PickupKind,
  origin?: PickupOrigin,
  skill?: { skill: SkillId; level: number } | null,
): SimPickup {
  const o = origin ?? { source: 'brick', droppedBy: 0, fromCell: cell }
  const it = makePickup({ id: newId(w), cell, kind, bornTick: w.t, droppedBy: o.droppedBy, skill: skill?.skill ?? null, level: skill?.level })
  w.pickups.push(it)
  emit(w, {
    type: 'PickupSpawned',
    presentationOnly: true,
    PickupNetEntityIdRaw: it.id,
    Cell: cellOfIdx(w, cell),
    Kind: kind,
    Tick: w.t,
    Source: o.source,
    DroppedByNetEntityIdRaw: o.droppedBy,
    FromCell: cellOfIdx(w, o.fromCell),
    ...(it.skill !== null ? { Skill: it.skill, SkillLevel: it.level } : {}),
  })
  return it
}

function rollKind(w: World): PickupKind {
  const weights = w.rules.pickupWeights
  let total = 0
  for (const [name] of KIND_ORDER) total += Math.max(0, weights[name])
  let r = w.rng.drop.NextInt(0, total)
  for (const [name, kind] of KIND_ORDER) {
    r -= Math.max(0, weights[name])
    if (r < 0) return kind
  }
  return PickupKind.FirePlus
}

/**
 * 本 Tick 写批里的爆炸砖（此时写批里只有爆炸下的单）按材质掉落：积木掷 dropRatePermille，木箱必掉。
 * 原型扩展（NON-CONTRACT，ADR 0030）：木箱照旧先在 rng.drop 上掷强化种类（drop 流序列不变），再在 rng.skill 上掷
 * crateSkillCandyPermille，中了就改掉一颗 skillCandyLevel 级技能糖；积木从不掉技能糖。
 */
export function spawnDrops(w: World): void {
  for (const wr of w.batch.values()) {
    const drop = MATERIALS[wr.block].drop
    if (drop === 'none') continue
    if (drop === 'roll' && w.rng.drop.NextInt(0, 1000) >= w.cfg.dropRatePermille) continue
    const crate = wr.block === BlockType.木箱
    const kind = rollKind(w)
    const origin: PickupOrigin = { source: crate ? 'crate' : 'brick', droppedBy: 0, fromCell: wr.cell }
    const skill = crate ? rollCrateSkill(w) : null
    if (skill !== null) createPickup(w, wr.cell, PickupKind.SkillCandy, origin, { skill, level: w.rules.skillCandyLevel })
    else createPickup(w, wr.cell, kind, origin)
  }
}

export function liveBombsOf(w: World, id: number): number {
  let n = 0
  for (const b of w.bombs) if (b.owner === id && b.explodedAtTick === 0) n++
  return n
}

/** 上限判定在准入里（契约 §2.3）：达上限 → 不下 Effect、物品留地（矩阵 5.3）。技能糖拒收同理（skill-candy.ts）。 */
function canTake(w: World, p: SimPlayer, it: SimPickup): boolean {
  switch (it.kind) {
    case PickupKind.FirePlus:
      return p.power < w.rules.powerCap
    case PickupKind.BombPlus:
      return p.capacity + liveBombsOf(w, p.id) - p.capacityDebt < w.rules.capacityCap
    case PickupKind.SpeedPlus:
      return p.speed < w.rules.speedCapMilli
    case PickupKind.HealthPack:
      // 原型扩展（NON-CONTRACT，ADR 0033）：中毒时满血也能吃（为了解毒）。
      return p.health < w.cfg.maxHealthPoints || isPoisoned(p, w.t)
    case PickupKind.SkillCandy:
      return canTakeSkill(w, p, it)
  }
}

function applyPickup(w: World, p: SimPlayer, it: SimPickup): void {
  switch (it.kind) {
    case PickupKind.FirePlus:
      p.power = Math.min(w.rules.powerCap, p.power + 1)
      break
    case PickupKind.BombPlus:
      p.capacity++
      break
    case PickupKind.SpeedPlus:
      p.speed = Math.min(w.rules.speedCapMilli, p.speed + w.rules.speedStepMilli)
      break
    case PickupKind.HealthPack:
      p.health = Math.min(w.cfg.maxHealthPoints, p.health + w.rules.healthPackPoints)
      // 原型扩展（NON-CONTRACT，ADR 0033）：血包解中毒弹的毒（PickupTaken 之后发 PlayerCured）。
      if (isPoisoned(p, w.t)) {
        clearToxin(p)
        emit(w, { type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: p.id, Reason: 'healthPack', Tick: w.t })
      }
      break
    case PickupKind.SkillCandy:
      takeSkillCandy(w, p, it)
      break
  }
}

function contestWinner(w: World, cell: number, eligible: (p: SimPlayer) => boolean): SimPlayer | undefined {
  const cx = (cell % w.size) * CELL_MILLI + HALF_MILLI
  const cy = Math.floor(cell / w.size) * CELL_MILLI + HALF_MILLI
  let best: SimPlayer | undefined
  let bestD = Infinity
  for (const p of w.players) {
    if (!isAlive(p) || playerCell(w, p) !== cell || !eligible(p)) continue
    const d = (p.mx - cx) * (p.mx - cx) + (p.my - cy) * (p.my - cy)
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  return best
}

export function processPickups(w: World): void {
  const t = w.t
  if (w.pickups.length > 0) {
    const keep: SimPickup[] = []
    for (const it of w.pickups) {
      // 刚在本 Tick 由写批生成的掉落物还压在砖格下，自然没人站在上面。
      const winner = w.brick[it.cell] === BlockType.Air ? contestWinner(w, it.cell, (p) => canTake(w, p, it)) : undefined
      if (!winner) {
        keep.push(it)
        continue
      }
      // PickupTaken 先发，技能糖随后的 SkillGained / SkillEvolved 排在它后面。
      emit(w, {
        type: 'PickupTaken',
        PickerNetEntityIdRaw: winner.id,
        Kind: it.kind,
        Tick: t,
        proto: {
          PickupNetEntityIdRaw: it.id,
          Cell: cellOfIdx(w, it.cell),
          ...(it.skill !== null ? { Skill: it.skill, SkillLevel: it.level } : {}),
        },
      })
      applyPickup(w, winner, it)
    }
    w.pickups = keep
  }
}
