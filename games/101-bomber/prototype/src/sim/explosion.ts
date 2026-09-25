import { BlockType, MATERIALS } from '../contract'
import { hitChest } from './chest'
import { addBrickWrite } from './terrain-commit'
import { cellOfIdx, chestAt, emit, findPlayer, isAlive, pickupProtectedUntil, playerCell, type SimBomb, type SimChest, type World } from './world'

/**
 * 爆炸系统（契约 §2.2 / design §7.2 / §7.5）：帧初照片 → 到期炸弹入队、连锁同帧排空 → 十字传播写 Reach →
 * 软砖 / 木箱入写批 → 危险窗内按覆盖格下伤害单（同弹同人一次、同链同人累计 ≤ maxHealthPoints）。
 */

/** 与 ReachUp / ReachDown / ReachLeft / ReachRight 同序；上 = 游戏 −Y。 */
const ARMS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

/** 不引爆、不写砖的十字覆盖格（含中心），给危险格与重生避让用；规则同真实传播。 */
export function crossCells(w: World, cell: number, power: number): number[] {
  const size = w.size
  const x0 = cell % size
  const y0 = Math.floor(cell / size)
  const out = [cell]
  for (const [dx, dy] of ARMS)
    for (let s = 1; s <= power; s++) {
      const x = x0 + dx * s
      const y = y0 + dy * s
      if (x < 0 || y < 0 || x >= size || y >= size) break
      const c = y * size + x
      const fire = MATERIALS[w.brick[c] as BlockType].fire
      if (fire === 'stopBefore' || fire === 'destroyThenStop' || chestAt(w, c)) break
      out.push(c)
      if (MATERIALS[w.ground[c] as BlockType].fire === 'coverThenStop') break
    }
  return out
}

/** 火焰中的格 + 引信剩余 ≤ 危险窗的炸弹十字；转角修正不往这些格吸附（design §6.1 规则 1）。 */
export function computeDangerCells(w: World): Uint8Array {
  const d = new Uint8Array(w.size * w.size)
  for (const b of w.bombs) {
    if (b.explodedAtTick > 0) {
      if (w.t < b.dangerUntilTick) for (const c of b.covered) d[c] = 1
    } else if (b.fuseEndTick - w.t <= w.ticks.danger) {
      for (const c of crossCells(w, b.cell, b.power)) d[c] = 1
    }
  }
  return d
}

/** 当前处于火焰阶段的覆盖格。 */
export function flameCells(w: World): Uint8Array {
  const d = new Uint8Array(w.size * w.size)
  for (const b of w.bombs) if (b.explodedAtTick > 0 && w.t < b.dangerUntilTick) for (const c of b.covered) d[c] = 1
  return d
}

interface ChainAcc {
  bombCount: number
  brickCount: number
  owners: number[]
}

/** 一颗炸弹本 Tick 的传播结果；ChainId 要等整批连通分量算完才定，砖写单 / 宝箱命中因此先记下。 */
interface Blast {
  bomb: SimBomb
  bricks: { cell: number; block: BlockType }[]
  chests: SimChest[]
}

/**
 * 本 Tick 到期的炸弹与被火焰触及的炸弹一起引爆。ChainId 按「火焰相遇」的连通分量统一分配（分量内根弹的最小 id），
 * 与同 Tick 根弹在列表里的先后无关（design §7.2 / §7.5 逻辑瞬时）；事件与伤害单在分量定好后按引爆序发出。
 */
export function runExplosions(w: World): void {
  const t = w.t
  removeBurnedOut(w)

  const q: SimBomb[] = w.bombs.filter((b) => b.explodedAtTick === 0 && b.fuseEndTick <= t && b.bornTick < t)
  const rootCount = q.length
  const index = new Map<SimBomb, number>()
  q.forEach((b, i) => index.set(b, i))
  const parent = q.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }

  const size = w.size
  const blasts: Blast[] = []
  for (let i = 0; i < q.length; i++) {
    const b = q[i]
    b.explodedAtTick = t
    b.dangerUntilTick = t + w.ticks.danger
    b.burnUntilTick = b.dangerUntilTick
    b.seq = w.explodeSeq++
    const blast: Blast = { bomb: b, bricks: [], chests: [] }
    blasts.push(blast)

    const x0 = b.cell % size
    const y0 = Math.floor(b.cell / size)
    const covered = [b.cell]
    const reach = [0, 0, 0, 0]
    for (let a = 0; a < 4; a++) {
      const [dx, dy] = ARMS[a]
      for (let s = 1; s <= b.power; s++) {
        const x = x0 + dx * s
        const y = y0 + dy * s
        if (x < 0 || y < 0 || x >= size || y >= size) break
        const c = y * size + x
        const block = w.brick[c] as BlockType
        const fire = MATERIALS[block].fire
        if (fire === 'stopBefore') break
        if (fire === 'destroyThenStop') {
          blast.bricks.push({ cell: c, block })
          break
        }
        // 宝箱与软砖同口径：臂停在宝箱上、宝箱格不计入 Reach。
        const chest = chestAt(w, c)
        if (chest) {
          blast.chests.push(chest)
          break
        }
        reach[a] = s
        covered.push(c)
        // 火焰越过被连锁的炸弹继续推进；触及的炸弹（含本 Tick 已先引爆的根弹）并入同一分量。
        for (const o of w.bombs) {
          if (o.cell !== c || o.bornTick >= t) continue
          let j = index.get(o)
          if (j === undefined) {
            if (o.explodedAtTick !== 0) continue
            j = q.length
            index.set(o, j)
            parent.push(j)
            q.push(o)
          }
          union(i, j)
        }
        if (MATERIALS[w.ground[c] as BlockType].fire === 'coverThenStop') break
      }
    }
    b.reachUp = reach[0]
    b.reachDown = reach[1]
    b.reachLeft = reach[2]
    b.reachRight = reach[3]
    b.covered = covered
  }

  const chainOf = new Map<number, number>()
  for (let i = 0; i < rootCount; i++) {
    const r = find(i)
    const cur = chainOf.get(r)
    if (cur === undefined || q[i].id < cur) chainOf.set(r, q[i].id)
  }
  for (let i = 0; i < q.length; i++) q[i].chainId = chainOf.get(find(i)) ?? q[i].id

  const chains = new Map<number, ChainAcc>()
  for (const { bomb: b, bricks, chests } of blasts) {
    const owner = findPlayer(w, b.owner)
    if (owner) {
      if (owner.capacityDebt > 0) owner.capacityDebt--
      else owner.capacity++
    }
    let acc = chains.get(b.chainId)
    if (!acc) {
      acc = { bombCount: 0, brickCount: 0, owners: [] }
      chains.set(b.chainId, acc)
    }
    const indexInChain = acc.bombCount++
    if (!acc.owners.includes(b.owner)) acc.owners.push(b.owner)
    for (const br of bricks) if (addBrickWrite(w, br.cell, br.block, b.chainId, b.owner)) acc.brickCount++

    const hit = new Set(b.covered)
    const keep: typeof w.pickups = []
    for (const p of w.pickups) {
      // ADR 0029：死者掉出的强化落地后 deathDropProtect 内炸不掉，留给活人去抢。
      if (hit.has(p.cell) && t >= pickupProtectedUntil(w, p)) {
        emit(w, { type: 'PickupDestroyed', presentationOnly: true, PickupNetEntityIdRaw: p.id, Cell: cellOfIdx(w, p.cell), Tick: t })
      } else keep.push(p)
    }
    w.pickups = keep

    emit(w, {
      type: 'BombExploded',
      ChainId: b.chainId,
      SourceBombOwnerNetEntityIdRaw: b.owner,
      CellCount: 1 + b.reachUp + b.reachDown + b.reachLeft + b.reachRight,
      Tick: t,
      proto: { BombNetEntityIdRaw: b.id, Cell: cellOfIdx(w, b.cell), IndexInChain: indexInChain },
    })
    for (const chest of chests) hitChest(w, chest, b)
  }
  for (const [chainId, acc] of chains)
    emit(w, {
      type: 'ChainResolved',
      presentationOnly: true,
      ChainId: chainId,
      BombCount: acc.bombCount,
      BrickCount: acc.brickCount,
      OwnerNetEntityIdRaws: acc.owners,
      Tick: t,
    })

  dangerPass(w)
}

/** t ≥ BurnUntilTick 的爆炸态炸弹销毁；链上最后一颗没了就清掉该链的累计伤害账。 */
function removeBurnedOut(w: World): void {
  const t = w.t
  if (!w.bombs.some((b) => b.explodedAtTick > 0 && t >= b.burnUntilTick)) return
  w.bombs = w.bombs.filter((b) => !(b.explodedAtTick > 0 && t >= b.burnUntilTick))
  for (const chainId of [...w.chainDmg.keys()]) if (!w.bombs.some((b) => b.chainId === chainId)) w.chainDmg.delete(chainId)
}

/**
 * 「引爆时站在那里」与「火焰阶段内走进来」同一条规则：每个火焰阶段的炸弹对其覆盖格上的活人下单，
 * 同弹同人只一次（命中记忆在炸弹上），同链同人累计封顶。保护期内不受伤、也不记命中。
 */
function dangerPass(w: World): void {
  const t = w.t
  const active = w.bombs.filter((b) => b.explodedAtTick > 0 && t < b.dangerUntilTick).sort((a, b) => a.seq - b.seq)
  if (active.length === 0) return
  const alive = w.players.filter(isAlive).map((p) => ({ p, cell: playerCell(w, p) }))
  const dmgPts = w.rules.bombDamagePoints
  const cap = w.cfg.maxHealthPoints
  for (const b of active) {
    for (const c of b.covered)
      for (const { p, cell } of alive) {
        if (cell !== c) continue
        if (t < p.protectedUntilTick || b.hit.includes(p.id)) continue
        b.hit.push(p.id)
        let perChain = w.chainDmg.get(b.chainId)
        if (!perChain) {
          perChain = new Map()
          w.chainDmg.set(b.chainId, perChain)
        }
        const got = perChain.get(p.id) ?? 0
        const pts = Math.min(dmgPts, cap - got)
        if (pts <= 0) continue
        perChain.set(p.id, got + pts)
        w.effects.push({ target: p.id, points: pts, bomb: b.id, owner: b.owner, chainId: b.chainId, cause: 0, killer: b.owner })
      }
  }
}
