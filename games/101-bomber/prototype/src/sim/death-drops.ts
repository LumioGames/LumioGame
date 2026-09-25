import { PickupKind } from '../contract'
import { freeCellsNear } from './chest'
import { createPickup, liveBombsOf } from './pickup'
import { cellOfIdx, emit, type SimPlayer, type World } from './world'

/**
 * 强化级数与死亡掉强化（design §8.5 / §9，ADR 0025 / 0028）。
 * 帽数不是独立资源：HatCount = 当前强化级数之和（火力 / 炸弹数 / 速度高出初始值的级数），血包不计。
 * 常规阶段死亡：每级按 deathPowerupDropPermille 掷一次；决赛圈死亡（出局）：全部级数掉落、不掷。
 * 掉出的级数从死者身上扣掉（最低保留初始值），在死亡格半径 3 内的空地各落一颗、谁捡归谁；格不够则余下作废（级数照扣）。
 */
const DROP_RADIUS = 3

export interface PowerupLevels {
  fire: number
  bomb: number
  speed: number
}

/** 当前强化级数。炸弹数 = 手上 + 场上未爆 − 待回手抵扣（design §8.5）；移速上限会截短最后一级，按向上取整计。 */
export function powerupLevels(w: World, p: SimPlayer): PowerupLevels {
  const cfg = w.cfg
  const step = w.rules.speedStepMilli
  const tier0 = cfg.speedTierToCellsPerSecond[0]
  return {
    fire: Math.max(0, p.power - cfg.initialBombPower),
    bomb: Math.max(0, p.capacity + liveBombsOf(w, p.id) - p.capacityDebt - cfg.initialBombCapacity),
    speed: step > 0 ? Math.max(0, Math.ceil((p.speed - tier0) / step)) : 0,
  }
}

/** 派生帽数（ADR 0028）：帽子只是强化数的表现，不单独存储。 */
export function hatCountOf(w: World, p: SimPlayer): number {
  const l = powerupLevels(w, p)
  return l.fire + l.bomb + l.speed
}

/** 身上每一级强化各一件（出局 / 退出时全部掉落），序：火力 → 炸弹 → 速度。 */
export function allPowerupKinds(w: World, p: SimPlayer): PickupKind[] {
  const l = powerupLevels(w, p)
  const kinds: PickupKind[] = []
  for (let i = 0; i < l.fire; i++) kinds.push(PickupKind.FirePlus)
  for (let i = 0; i < l.bomb; i++) kinds.push(PickupKind.BombPlus)
  for (let i = 0; i < l.speed; i++) kinds.push(PickupKind.SpeedPlus)
  return kinds
}

/** 死亡 Tick 是否已在决赛圈内（= 出局）。 */
export function deathEliminates(w: World, deathTick: number): boolean {
  const fc = w.finalCircle
  return fc !== null && deathTick >= fc.startTick
}

/**
 * 在死亡结算 Tick 决定要掉的强化（只定、不改人）：出局者全部掉落，否则逐级掷。
 * PlayerDied.proto.HatsLost 就是它的长度；真正扣属性与落地在下一 Tick 的死亡系统里（{@link dropPowerups}）。
 */
export function rollPowerupDrops(w: World, v: SimPlayer): PickupKind[] {
  if (deathEliminates(w, w.t)) return allPowerupKinds(w, v)
  const l = powerupLevels(w, v)
  const permille = w.rules.deathPowerupDropPermille
  const rng = w.rng.drop
  const kinds: PickupKind[] = []
  const roll = (levels: number, kind: PickupKind): void => {
    for (let i = 0; i < levels; i++) if (rng.NextInt(0, 1000) < permille) kinds.push(kind)
  }
  roll(l.fire, PickupKind.FirePlus)
  roll(l.bomb, PickupKind.BombPlus)
  roll(l.speed, PickupKind.SpeedPlus)
  return kinds
}

export function dropPowerups(w: World, v: SimPlayer, deathCell: number, kinds: readonly PickupKind[]): void {
  if (kinds.length === 0) return
  const cfg = w.cfg
  const step = w.rules.speedStepMilli
  const tier0 = cfg.speedTierToCellsPerSecond[0]
  const rng = w.rng.drop
  const firesLost = kinds.filter((k) => k === PickupKind.FirePlus).length
  const bombsLost = kinds.filter((k) => k === PickupKind.BombPlus).length
  const speedsLost = kinds.filter((k) => k === PickupKind.SpeedPlus).length

  v.power = Math.max(cfg.initialBombPower, v.power - firesLost)
  for (let i = 0; i < bombsLost; i++) {
    if (v.capacity > 0) v.capacity--
    else v.capacityDebt++
  }
  v.speed = Math.max(tier0, v.speed - speedsLost * step)

  const cells = freeCellsNear(w, deathCell, DROP_RADIUS)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rng.NextInt(0, i + 1)
    const tmp = cells[i]
    cells[i] = cells[j]
    cells[j] = tmp
  }
  const n = Math.min(kinds.length, cells.length)
  if (n === 0) return
  emit(w, { type: 'PowerupsDropped', presentationOnly: true, VictimNetEntityIdRaw: v.id, Kinds: kinds.slice(0, n), Cell: cellOfIdx(w, deathCell), Tick: w.t })
  for (let i = 0; i < n; i++) createPickup(w, cells[i], kinds[i], { source: 'death', droppedBy: v.id, fromCell: deathCell })
}
