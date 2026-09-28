import { BlockType, bombCandyPool, PickupKind, type PickupKindName, type ResourceBoxTier, type SkillId } from '../contract'
import { createPickup, type PickupOrigin } from './pickup'
import { mixSeed, Sfc32 } from './rng'
import { chestCandyPool, rollSkillCandy } from './skill-candy'
import { cellOccupied, cellOfIdx, chestAt, emit, type SimBomb, type SimChest, type SimResourceBox, type World } from './world'

/**
 * 强力宝箱（design §4.2，引用 §8.6 小补给箱口径）：每颗独立炸弹命中一次（同链多颗各算一次），
 * HitsLeft 归零的宝箱在 VoxelCommit 相移除并喷出 chestLoot；不出帽子。
 *
 * 原型扩展（NON-CONTRACT，ADR 0040，design §5.0）：三级资源箱也在这里——砖层是木箱，等级与命中登记在 `w.resourceBoxes`。
 * 爆炸臂打到登记过的箱：同弹只算一次（hitBy），命中数没到 hitsRequired 时箱子不碎、臂停住；到了就和积木一样进写批，
 * 掉落系统按等级开箱（{@link spawnBoxLoot}），VoxelCommit 提交时从登记里删掉（{@link removeResourceBox}）。
 * 没登记的木箱（19 档旧地图）= 木箱 1 / 1、旧掉落口径（pickup.ts）。
 */

const KIND_BY_NAME: Readonly<Record<PickupKindName, PickupKind>> = {
  FirePlus: PickupKind.FirePlus,
  BombPlus: PickupKind.BombPlus,
  SpeedPlus: PickupKind.SpeedPlus,
  HealthPack: PickupKind.HealthPack,
}

/** 从 from 出发按可通行路径（砖层空、无宝箱）BFS，半径内非水且没有弹 / 糖果 / 宝箱的格，按距离序。 */
export function freeCellsNear(w: World, from: number, radius: number): number[] {
  const size = w.size
  const dist = new Map<number, number>([[from, 0]])
  const q = [from]
  const out: number[] = []
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const d = dist.get(c) ?? 0
    if (w.ground[c] !== BlockType.水 && !cellOccupied(w, c)) out.push(c)
    if (d >= radius) continue
    const x = c % size
    const y = Math.floor(c / size)
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const nc = ny * size + nx
      if (dist.has(nc) || w.brick[nc] !== BlockType.Air || chestAt(w, nc)) continue
      dist.set(nc, d + 1)
      q.push(nc)
    }
  }
  return out
}

/** 一颗炸弹的臂停在宝箱上：同弹只算一次，已归零的不再扣。 */
export function hitChest(w: World, chest: SimChest, b: SimBomb): void {
  if (chest.hitsLeft <= 0 || chest.hitBy.includes(b.id)) return
  chest.hitBy.push(b.id)
  chest.hitsLeft--
  if (chest.hitsLeft === 0) chest.opener = b.owner
  emit(w, {
    type: 'ChestHit',
    presentationOnly: true,
    ChestNetEntityIdRaw: chest.id,
    HitsLeft: chest.hitsLeft,
    SourceBombOwnerNetEntityIdRaw: b.owner,
    ChainId: b.chainId,
    Tick: w.t,
  })
}

/**
 * VoxelCommit 相：归零的宝箱移除，战利品落在宝箱格与半径 2 内最近的空地上（格不够则余下作废）。
 * 原型扩展（NON-CONTRACT，ADR 0030 / D14）：强化之后再喷 chestSkillCandies 颗技能糖（种类掷 rng.skill，skillCandyLevel 级），
 * 接着用同一张空地表的下一格。ADR 0033：糖从 chestSkillCandyPool 指定的池抽（默认炸弹类保底）；只动 rng.skill，drop 流不变。
 */
export function openChests(w: World): void {
  if (!w.chests.some((c) => c.hitsLeft <= 0)) return
  const opened = w.chests.filter((c) => c.hitsLeft <= 0)
  w.chests = w.chests.filter((c) => c.hitsLeft > 0)
  for (const chest of opened) {
    emit(w, {
      type: 'ChestOpened',
      presentationOnly: true,
      ChestNetEntityIdRaw: chest.id,
      Cell: cellOfIdx(w, chest.cell),
      OpenerNetEntityIdRaw: chest.opener,
      Tick: w.t,
    })
    const cells = freeCellsNear(w, chest.cell, 2)
    const loot = w.rules.chestLoot
    const origin = { source: 'chest', droppedBy: 0, fromCell: chest.cell } as const
    let k = 0
    for (; k < loot.length && k < cells.length; k++) createPickup(w, cells[k], KIND_BY_NAME[loot[k]], origin)
    for (let j = 0; j < w.rules.chestSkillCandies && k < cells.length; j++) {
      const skill = rollSkillCandy(w, chestCandyPool(w))
      if (skill === null) break
      createPickup(w, cells[k++], PickupKind.SkillCandy, origin, { skill, level: w.rules.skillCandyLevel })
    }
    // 原型扩展（NON-CONTRACT，ADR 0039，design §4.2）：再掷 powerChestGoldHeartPermille 喷一颗金心；走按宝箱派生的新随机流，
    // chest / skill 流的序列不变。
    if (k < cells.length && keyedRng(w, 'chestGoldHeart', chest.id).NextInt(0, 1000) < w.rules.powerChestGoldHeartPermille)
      createPickup(w, cells[k++], PickupKind.GoldHeart, origin)
  }
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：按事件派生的随机流——(本局种子, key) 经 mixSeed 混合、再按流名派生 Sfc32。
 * 方向 B 新增的随机（资源箱开箱、再生长箱、中央补给、强力宝箱金心）一律走它：不加 World 状态、旧的 drop / spawn / chest /
 * regen / skill / roster 流序列不变，同种子同事件可复现。key 取事件自身的整数身份（Tick、格、宝箱 id 等）。
 */
export function keyedRng(w: World, stream: string, key: number): Sfc32 {
  return new Sfc32(mixSeed(mixSeed(w.seed, w.match.index), key), stream)
}

/** 按权重在 pool 序上掷（rng 由调用方给）；池空 / 总权重 0 → null（不消耗随机数）。 */
function rollWeighted<T>(rng: Sfc32, pool: readonly T[], weight: (x: T) => number): T | null {
  let total = 0
  for (const x of pool) total += Math.max(0, weight(x))
  if (total <= 0) return null
  let r = rng.NextInt(0, total)
  for (const x of pool) {
    r -= Math.max(0, weight(x))
    if (r < 0) return x
  }
  return pool[pool.length - 1]
}

const CANDY_NAMES: readonly PickupKindName[] = ['FirePlus', 'BombPlus', 'SpeedPlus', 'HealthPack']
/** 中央补给的数值糖只含三项强化（血包另列，config.ts SupplyLoot）。 */
const POWERUP_NAMES: readonly PickupKindName[] = ['FirePlus', 'BombPlus', 'SpeedPlus']

/** 按 pickupWeights 掷一颗糖果；withHealth = false 时只在火力 / 炸弹 / 速度三项里掷。 */
export function rollCandy(w: World, rng: Sfc32, withHealth = true): PickupKind {
  const name = rollWeighted(rng, withHealth ? CANDY_NAMES : POWERUP_NAMES, (n) => w.rules.pickupWeights[n])
  return KIND_BY_NAME[name ?? 'FirePlus']
}

/** 「特殊炸弹」占位（ADR 0041 落地前 = Lv1 炸弹类技能糖，skills.ts bombCandyPool 按 candyWeight）；池空 → null。 */
export function rollSpecialBomb(w: World, rng: Sfc32): SkillId | null {
  return rollWeighted(rng, bombCandyPool(w.rules.skills), (id) => w.rules.skills[id].candyWeight)
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：格上登记的资源箱。 */
export function resourceBoxAt(w: World, cell: number): SimResourceBox | undefined {
  for (const b of w.resourceBoxes ?? []) if (b.cell === cell) return b
  return undefined
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040）：一颗炸弹的臂打到登记过的资源箱。同弹只算一次（同链多颗各算一次），已归零的不再扣。
 * 返回这一击之后箱子是否已碎（= 命中数用完：臂照积木口径摧毁它；否则箱子立着、臂停在它前面）。
 */
export function hitResourceBox(box: SimResourceBox, b: SimBomb): boolean {
  if (box.hitsLeft > 0 && !box.hitBy.includes(b.id)) {
    box.hitBy.push(b.id)
    box.hitsLeft--
  }
  return box.hitsLeft <= 0
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：登记一个资源箱（再生长箱用；砖层由调用方写木箱）。命中数取该档 boxes[等级].hits。 */
export function addResourceBox(w: World, cell: number, tier: ResourceBoxTier): void {
  const hits = Math.max(1, w.rules.map.boxes[tier].hits)
  ;(w.resourceBoxes ??= []).push({ cell, tier, hitsRequired: hits, hitsLeft: hits, hitBy: [] })
}

/** 原型扩展（NON-CONTRACT，ADR 0040）：箱子所在格的砖被清掉（爆炸提交 / 决赛圈清场）→ 从登记里删掉。 */
export function removeResourceBox(w: World, cell: number): void {
  if (w.resourceBoxes && w.resourceBoxes.some((b) => b.cell === cell)) w.resourceBoxes = w.resourceBoxes.filter((b) => b.cell !== cell)
}

/**
 * 原型扩展（NON-CONTRACT，ADR 0040 / 0039，design §5.0）：资源箱开箱喷出的东西，按价值排（格不够时先丢糖果）：
 * 金箱 goldBoxGoldHeartPermille 金心 → 特殊炸弹（specialBombPermille；1000 = 必出）→ boxLoot.candies 颗糖果（pickupWeights，含血包）。
 * 随机走按 (Tick, 格) 派生的 'box' 流（{@link keyedRng}）。落在箱格与半径 2 内最近的空地（{@link freeCellsNear}），格不够余下作废。
 */
export function spawnBoxLoot(w: World, box: SimResourceBox): void {
  const rng = keyedRng(w, 'box', w.t * w.size * w.size + box.cell)
  const loot = w.rules.boxLoot[box.tier]
  const items: { kind: PickupKind; skill?: SkillId }[] = []
  if (box.tier === 'gold' && rng.NextInt(0, 1000) < w.rules.goldBoxGoldHeartPermille) items.push({ kind: PickupKind.GoldHeart })
  if (rng.NextInt(0, 1000) < loot.specialBombPermille) {
    const skill = rollSpecialBomb(w, rng)
    if (skill !== null) items.push({ kind: PickupKind.SkillCandy, skill })
  }
  for (let i = 0; i < loot.candies; i++) items.push({ kind: rollCandy(w, rng) })
  const cells = freeCellsNear(w, box.cell, 2)
  const origin: PickupOrigin = { source: 'crate', droppedBy: 0, fromCell: box.cell }
  for (let k = 0; k < items.length && k < cells.length; k++) {
    const it = items[k]
    createPickup(w, cells[k], it.kind, origin, it.skill ? { skill: it.skill, level: w.rules.skillCandyLevel } : null)
  }
}
