import { MATERIALS } from '../contract'
import { FOUR_DIRS, DIR_VEC, idx, inBounds } from '../shared/grid'
import { NEVER, type Board, type PendingBomb } from './board'

export { NEVER }

export interface Blast {
  /** 覆盖格（含中心），与规则层写 Reach* 的口径一致。 */
  covered: number[]
  /** 挡住某条臂的可破坏砖（会被摧毁，但**不**算覆盖格）。 */
  bricks: number[]
  /** 挡住某条臂的宝箱格（每颗炸弹命中一次，不算覆盖格）。 */
  chests?: number[]
}

/**
 * 按真实爆炸规则铺十字（logic-design §4）：铁皮前停且不覆盖；积木 / 木箱摧毁后停、不覆盖；
 * 水覆盖后停；宝箱挡火且不覆盖；炸弹不挡火（连锁由调用方按覆盖格查）。
 * `passBrick(c)` 为 true 的可破坏砖视为已被**更早 Tick** 的爆炸清掉（帧末一批写，下一 Tick 才是空地）。
 * 原型扩展（NON-CONTRACT，ADR 0030）：`pierce` = 穿透层数，按 contract/skills.ts 文件头的唯一口径——
 * 本臂已穿透的砖数 < pierce 时该砖照样记进 bricks，同时覆盖该格并继续；否则停（镜像测试钉住 sim 口径）。
 */
export function traceBlast(
  board: Board,
  X: number,
  Y: number,
  power: number,
  out: Blast,
  passBrick?: (c: number) => boolean,
  pierce = 0,
): Blast {
  const size = board.size
  out.covered.push(idx(X, Y, size))
  for (const d of FOUR_DIRS) {
    const v = DIR_VEC[d]
    let pierced = 0
    for (let s = 1; s <= power; s++) {
      const x = X + v.dx * s
      const y = Y + v.dy * s
      if (!inBounds(x, y, size)) break
      const c = idx(x, y, size)
      const fire = MATERIALS[board.brick[c] as keyof typeof MATERIALS].fire
      if (fire === 'stopBefore') break
      if (board.chestAt[c] > 0) {
        out.chests?.push(c)
        break
      }
      if (fire === 'destroyThenStop' && !(passBrick?.(c) ?? false)) {
        out.bricks.push(c)
        if (pierced >= pierce) break
        pierced++
        out.covered.push(c)
        continue
      }
      out.covered.push(c)
      if (MATERIALS[board.ground[c] as keyof typeof MATERIALS].fire === 'coverThenStop') break
    }
  }
  return out
}

/** 放弹自检用的假想炸弹。 */
export interface VirtualBomb {
  X: number
  Y: number
  power: number
  fuseEndTick: number
  /** 原型扩展（NON-CONTRACT，ADR 0030）：穿透层数（缺省 0）。 */
  pierce?: number
}

export interface DangerMap {
  /** 每格最早进入危险的 Tick（NEVER = 不危险）。多个来源取 min。 */
  from: Int32Array
  /** 每格危险结束的 Tick（不含）。多个来源取 max——把两段窗口并成一段是有意的保守。 */
  until: Int32Array
  /** 每颗未爆炸弹连锁后的实际起爆 Tick，顺序同 board.pending，假想弹（若有）在末尾。 */
  det: number[]
  /** 可破坏砖将在哪个 Tick 被炸掉（NEVER = 不会）。 */
  doomedAt: Int32Array
  /** 同 Board.poisonAt：毒圈不进 from/until（穿过毒格只是慢慢掉血，不该像火一样封路），只影响「能不能待」。 */
  poison: Int32Array
  /** 原型扩展（NON-CONTRACT，ADR 0030）：同 Board.burnUntil（别人的光环 / 火墙烧到的 Tick，0 = 不着火）。 */
  burn: Int32Array
  /**
   * 原型扩展（NON-CONTRACT，ADR 0030）：每颗炸弹的覆盖格，顺序同 det（假想弹在末尾）；
   * 隐藏 / 会熄灭的弹为空。给「这颗弹打掉谁几点血」（showdown.ts hitPoints）用。
   */
  cover: readonly (readonly number[])[]
}

const MAX_PASSES = 4

/**
 * 连锁感知的危险图（logic-design §6）：炸弹 A 的覆盖格里有炸弹 B → B 的起爆取 min（Dijkstra 式松弛）；
 * 被更早起爆的炸弹炸开的砖，之后起爆的炸弹火焰可以穿过——两者互相依赖，迭代到不动点（上限 4 轮）。
 * 活动火焰按快照 Reach* 覆盖到 DangerUntilTick。
 */
export function buildDangerMap(board: Board, dangerTicks: number, virtual?: VirtualBomb): DangerMap {
  const n2 = board.size * board.size
  const bombs: PendingBomb[] = board.pending.slice()
  let chainAt = board.chainAt ?? board.bombAt
  if (virtual) {
    const cell = idx(virtual.X, virtual.Y, board.size)
    bombs.push({
      cell,
      X: virtual.X,
      Y: virtual.Y,
      power: virtual.power,
      fuseEndTick: virtual.fuseEndTick,
      id: 0,
      owner: 0,
      kind: 0,
      pierce: virtual.pierce ?? 0,
      blastCell: cell,
      blastX: virtual.X,
      blastY: virtual.Y,
      moving: false,
      doused: false,
      hidden: false,
    })
    chainAt = chainAt.slice()
    chainAt[cell] = bombs.length - 1
  }
  const n = bombs.length
  // 隐藏（还没看见）/ 会滑进水里熄灭的弹：不铺火、不连锁（仍在 bombAt 里挡路）。
  const live = bombs.map((b) => !b.hidden && !b.doused)
  // 快照里 FuseEndTick 已过而尚未爆炸只可能是同帧边界：按「下一 Tick 起爆」处理。
  const det = bombs.map((b) => Math.max(b.fuseEndTick, board.now))
  let doomed = new Int32Array(n2).fill(NEVER)
  const blasts: Blast[] = bombs.map(() => ({ covered: [], bricks: [] }))
  const done = new Uint8Array(n)

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const detBefore = det.slice()
    for (let i = 0; i < n; i++) {
      const bl = blasts[i]
      bl.covered.length = 0
      bl.bricks.length = 0
      if (!live[i]) continue
      const t = det[i]
      const b = bombs[i]
      traceBlast(board, b.blastX ?? b.X, b.blastY ?? b.Y, b.power, bl, (c) => doomed[c] < t, b.pierce ?? 0)
    }
    done.fill(0)
    for (let k = 0; k < n; k++) {
      let best = -1
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || det[i] < det[best])) best = i
      done[best] = 1
      for (const c of blasts[best].covered) {
        const j = chainAt[c]
        if (j >= 0 && j !== best && live[j] && det[j] > det[best]) det[j] = det[best]
      }
    }
    const next = new Int32Array(n2).fill(NEVER)
    for (let i = 0; i < n; i++) for (const c of blasts[i].bricks) if (det[i] < next[c]) next[c] = det[i]
    let changed = false
    for (let i = 0; i < n && !changed; i++) if (det[i] !== detBefore[i]) changed = true
    for (let c = 0; c < n2 && !changed; c++) if (next[c] !== doomed[c]) changed = true
    doomed = next
    if (!changed) break
  }

  const from = new Int32Array(n2).fill(NEVER)
  const until = new Int32Array(n2).fill(-1)
  for (let i = 0; i < n; i++) {
    const a = det[i]
    const b = det[i] + dangerTicks
    for (const c of blasts[i].covered) {
      if (a < from[c]) from[c] = a
      if (b > until[c]) until[c] = b
    }
  }
  for (const f of board.flames) {
    for (const c of f.cells) {
      if (f.from < from[c]) from[c] = f.from
      if (f.until > until[c]) until[c] = f.until
    }
  }
  const burn = board.burnUntil ?? new Int32Array(n2)
  return { from, until, det, doomedAt: doomed, poison: board.poisonAt, burn, cover: blasts.map((b) => b.covered) }
}

/** 永远不会着火（不看毒圈）。 */
export function isSafe(dm: DangerMap, c: number): boolean {
  return dm.from[c] === NEVER
}

/** 毒圈在 t 之后才会（或永不会）覆盖该格。 */
export function poisonFreeAfter(dm: DangerMap, c: number, t: number): boolean {
  return dm.poison[c] > t
}

/**
 * 在 t 时刻到达后能否一直待着：永不危险，或所有危险在 t 之前（留 2 Tick）已结束。
 * from/until 是合并后的窗口（until 取 max），所以窗口结束后不会再有危险。
 * 原型扩展（NON-CONTRACT，ADR 0030）：别人的光环 / 火墙在 t 时仍在烧也不能待。
 */
export function restsAt(dm: DangerMap, c: number, t: number): boolean {
  return (dm.from[c] === NEVER || dm.until[c] + 2 <= t) && (dm.burn === undefined || dm.burn[c] <= t)
}

/**
 * 在 [enter, leave) 占用格 c 是否与其危险窗重叠；两端各留 margin（默认 2）Tick 吸收位置 / 取整误差。
 * 原型扩展（NON-CONTRACT，ADR 0030）：`immuneUntil` ≥ 0 = 泡泡护体到该 Tick（不含），重叠部分都在护体内就不算冲突。
 */
export function conflicts(dm: DangerMap, c: number, enter: number, leave: number, margin = 2, immuneUntil = -1): boolean {
  if (!(enter - margin < dm.until[c] && leave + margin > dm.from[c])) return false
  return immuneUntil < 0 || Math.min(leave, dm.until[c]) + margin > immuneUntil
}
