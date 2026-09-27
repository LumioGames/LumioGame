import { dropOnHeight, HAT_DROP_MS, HAT_LOSS_MS, lossArc } from '../logic/hat-flow'
import { lossScale } from '../logic/hat-layout'
import type { HatRenderer } from '../world/hat-stack'

/**
 * 表现帽的飞行（design §9.2 / §9.6，ADR 0028：帽子 = 强化数）：
 * - 落帽（drop）：吃到强化，1 顶帽子从落点上方 1.2 格处 0.3 s 落到第 min(n, 4) 层（目标位置与缩放每帧跟着人走），
 *   落上去帽塔才长高；塔已满 4 顶时落到虚拟第 4 层，落上即消失、×N 牌跳一下；
 * - 飞帽（loss）：死亡掉强化，掉了几级就有几顶帽子从帽塔（lossLaunch 给的层）沿抛物线飞向掉出的强化所在格，落地「啵」掉；
 *   飞行缩放从起飞层的缩放线性变到 0.75。
 *   起飞前（等玩偶散架）这几顶仍算在塔上。
 */
interface Flight {
  kind: 'drop' | 'loss'
  /** drop：落到谁头上；loss：从谁头上飞走。 */
  owner: number
  fx: number
  fy: number
  fz: number
  tx: number
  ty: number
  tz: number
  /** drop：目标层缩放（每帧解析）；loss：起飞层缩放。 */
  s: number
  start: number
  dur: number
  spin: number
  landed: boolean
}

const MAX = 64

/** 落帽目标：落点的当前世界位置 + 该层缩放（已乘 unit）；返回 false = 人不在了。 */
export interface DropTarget {
  x: number
  y: number
  z: number
  s: number
}
export type TargetResolver = (id: number, out: DropTarget) => boolean

export class HatFlyFx {
  private readonly flights: Flight[] = []
  private readonly tgt: DropTarget = { x: 0, y: 0, z: 0, s: 1 }
  private readonly pos = { x: 0, y: 0, z: 0 }

  /** 落帽：start 时刻起 0.3 s 落到 target 的帽塔顶。 */
  dropOn(target: number, start: number, spin: number): void {
    if (this.flights.length >= MAX) return
    this.flights.push({ kind: 'drop', owner: target, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, s: 1, start, dur: HAT_DROP_MS, spin, landed: false })
  }

  /** 飞帽：从 (fx, fy, fz)（起飞层的帽底）飞到地面格 (tx, tz)；s = 起飞层缩放（已乘 unit）。 */
  lose(owner: number, fx: number, fy: number, fz: number, tx: number, tz: number, start: number, spin: number, s = 1): void {
    if (this.flights.length >= MAX) return
    this.flights.push({ kind: 'loss', owner, fx, fy, fz, tx, ty: 0, tz, s, start, dur: HAT_LOSS_MS, spin, landed: false })
  }

  clear(): void {
    this.flights.length = 0
  }

  /**
   * onDropLanded(target)：落帽落上塔顶的那一帧回调一次（「+1」飘字）；
   * onLossLanded(x, z)：飞帽落地的那一帧回调一次（小棉花）。
   */
  update(
    now: number,
    hats: HatRenderer,
    resolve: TargetResolver,
    onDropLanded?: (target: number) => void,
    onLossLanded?: (x: number, z: number) => void,
  ): void {
    let keep = 0
    for (let i = 0; i < this.flights.length; i++) {
      const f = this.flights[i]
      const u = (now - f.start) / f.dur
      if (f.kind === 'drop' && u >= 0) {
        // 人没了（散架 / 离场）：这顶帽子不演了，帽塔直接按真实帽数画。
        if (!resolve(f.owner, this.tgt)) continue
        f.tx = this.tgt.x
        f.ty = this.tgt.y
        f.tz = this.tgt.z
        f.s = this.tgt.s
      }
      if (u >= 1) {
        if (!f.landed) {
          f.landed = true
          if (f.kind === 'drop') onDropLanded?.(f.owner)
          else onLossLanded?.(f.tx, f.tz)
        }
        continue
      }
      this.flights[keep++] = f
      if (u < 0) continue
      if (f.kind === 'drop') {
        // 自由落体，落定前转慢；略微缩小入场，落上去正好按目标层缩放接进帽塔。
        const r = f.spin * (1 - u) * (1 - u)
        hats.hat(f.tx, f.ty + dropOnHeight(u), f.tz, 0, r, 0, (0.85 + 0.15 * Math.min(1, u * 2)) * f.s)
      } else {
        const p = lossArc(u, f.fx, f.fy, f.fz, f.tx, f.tz, this.pos)
        const r = f.spin * u
        hats.hat(p.x, p.y, p.z, r, r * 0.7, r * 0.4, lossScale(u, f.s))
      }
    }
    this.flights.length = keep
  }

  /** 还在路上（含尚未开始）的落帽数：帽塔先不算它们。 */
  inbound(target: number): number {
    let n = 0
    for (const f of this.flights) if (f.kind === 'drop' && f.owner === target && !f.landed) n++
    return n
  }

  /** 还没起飞的飞帽数：起飞前帽塔仍算上它们。 */
  heldBack(owner: number, now: number): number {
    let n = 0
    for (const f of this.flights) if (f.kind === 'loss' && f.owner === owner && now < f.start) n++
    return n
  }
}
