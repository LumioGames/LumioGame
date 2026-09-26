import { dropOnHeight, HAT_DROP_MS, HAT_LOSS_MS, lossArc } from '../logic/hat-flow'
import type { HatRenderer } from '../world/hat-stack'

/**
 * 表现帽的飞行（design §9.2 / §9.6，ADR 0028：帽子 = 强化数）：
 * - 落帽（drop）：吃到强化，1 顶帽子从帽塔顶上方 1.2 格处 0.3 s 落到塔顶（目标每帧跟着人走），落上去帽塔才长高；
 * - 飞帽（loss）：死亡掉强化，掉了几级就有几顶帽子从塔顶沿抛物线飞向掉出的强化所在格，落地「啵」掉。
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
  start: number
  dur: number
  spin: number
  landed: boolean
}

const MAX = 64

/** 帽塔顶（落点）的当前位置：头顶 + 塔高；返回 false = 人不在了。 */
export type TargetResolver = (id: number, out: { x: number; y: number; z: number }) => boolean

export class HatFlyFx {
  private readonly flights: Flight[] = []
  private readonly tgt = { x: 0, y: 0, z: 0 }
  private readonly pos = { x: 0, y: 0, z: 0 }

  /** 落帽：start 时刻起 0.3 s 落到 target 的帽塔顶。 */
  dropOn(target: number, start: number, spin: number): void {
    if (this.flights.length >= MAX) return
    this.flights.push({ kind: 'drop', owner: target, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, start, dur: HAT_DROP_MS, spin, landed: false })
  }

  /** 飞帽：从 (fx, fy, fz)（塔顶）飞到地面格 (tx, tz)。 */
  lose(owner: number, fx: number, fy: number, fz: number, tx: number, tz: number, start: number, spin: number): void {
    if (this.flights.length >= MAX) return
    this.flights.push({ kind: 'loss', owner, fx, fy, fz, tx, ty: 0, tz, start, dur: HAT_LOSS_MS, spin, landed: false })
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
        // 自由落体，落定前转慢；略微缩小入场，落上去正好 1:1 接进帽塔。
        const r = f.spin * (1 - u) * (1 - u)
        hats.hat(f.tx, f.ty + dropOnHeight(u), f.tz, 0, r, 0, 0.85 + 0.15 * Math.min(1, u * 2))
      } else {
        const p = lossArc(u, f.fx, f.fy, f.fz, f.tx, f.tz, this.pos)
        const r = f.spin * u
        hats.hat(p.x, p.y, p.z, r, r * 0.7, r * 0.4, 0.95 - 0.2 * u)
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
