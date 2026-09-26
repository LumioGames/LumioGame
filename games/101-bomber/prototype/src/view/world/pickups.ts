import { Color, MeshBasicMaterial, SphereGeometry, TorusGeometry, type Object3D } from 'three'
import { PickupKind, SKILL_IDS, type PickupView, type SkillId } from '../../contract'
import { SKILL_COLOR } from '../../present/skill-style'
import { Batch, M, trs } from '../batch'
import { candyGeometry, candyRingGeometry } from '../geo/candy'
import { levelPipGeometry, skillCandyGeometry } from '../geo/skill'
import { clamp01, easeOutBack } from '../logic/interp'
import type { SharedMaterials } from '../materials'
import type { GroundMarks } from './ground-marks'

/**
 * 糖果：悬浮 0.5 ±0.06、1.5 rad/s 自转，外面一圈面朝镜头的金环（参考图同款）；
 * 出现时弹出，消失时（被捡 / 被炸）缩没。每种糖果一个实例批。
 * 死者掉出的强化（PickupView.droppedBy ≠ 0，design §9.6）多一圈死者脚圈色的光环 + 同色地圈；
 * 死者掉落 / 宝箱喷出的糖果从来源格沿抛物线弹出（0.35 s），落地后才开始悬浮。
 * 保护期内（renderTick < protectedUntilTick，ADR 0029：炸不掉）罩一层淡金色泡泡，最后 0.8 s 闪烁提示即将失效。
 * 原型扩展（NON-CONTRACT，ADR 0030）：技能糖（Kind = SkillCandy）按 PickupView.skill 画各自的糖球 + 技能色光环
 * （代替金环，一眼分得出「帽子糖」和「技能糖」）+ 糖下 1–3 颗等级金豆；skill 缺席时退回普通糖果。
 */
interface PickupVis {
  id: number
  kind: number
  x: number
  z: number
  born: number
  /** 消失动画开始时刻；存活时为 +∞。 */
  dieAt: number
  stamp: number
  /** 弹出起点（无弹出时 = 自身位置）。 */
  fromX: number
  fromZ: number
  arc: boolean
  /** 死者脚圈色；−1 = 普通糖果。 */
  halo: number
  /** 免疫爆炸截止 Tick（0 = 无保护）。 */
  protUntil: number
  /** 技能糖里的技能与等级（其余糖果为 null / 0）。 */
  skill: SkillId | null
  level: number
}

/** 新糖果的来源：弹出起点、延迟（等死者散架 / 开箱）与光环色。 */
export interface PickupOrigin {
  fromX: number
  fromZ: number
  delayMs: number
  halo: number
}

const KINDS = [PickupKind.FirePlus, PickupKind.BombPlus, PickupKind.SpeedPlus, PickupKind.HealthPack] as const
const DIE_MS = 220
/** 每种技能糖同时在场的上限。 */
const SKILL_CANDY_CAP = 32
/** 等级金豆：糖心下方的距离与间距（格）。 */
const PIP_DROP = 0.24
const PIP_GAP = 0.1
export const PICKUP_ARC_MS = 350

export class PickupLayer {
  private readonly candies: Batch[]
  private readonly rings: Batch
  private readonly halos: Batch
  private readonly bubbles: Batch
  private readonly skillCandies = new Map<SkillId, Batch>()
  private readonly skillRings: Batch
  private readonly pips: Batch
  private readonly map = new Map<number, PickupVis>()
  private stamp = 0
  private readonly c = new Color()

  constructor(scene: Object3D, mats: SharedMaterials) {
    this.candies = KINDS.map((k) => new Batch(candyGeometry(k), mats.plastic, 64, { castShadow: true }))
    this.rings = new Batch(candyRingGeometry(), mats.gold, 128, {})
    this.halos = new Batch(new TorusGeometry(0.37, 0.04, 8, 40), mats.solid, 64, { color: true })
    this.bubbles = new Batch(
      new SphereGeometry(0.44, 20, 14),
      new MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.28, depthWrite: false }),
      64,
      {},
    )
    for (const b of this.candies) scene.add(b.mesh)
    scene.add(this.rings.mesh, this.halos.mesh, this.bubbles.mesh)
    for (const id of SKILL_IDS) {
      const b = new Batch(skillCandyGeometry(id), mats.plastic, SKILL_CANDY_CAP, { castShadow: true })
      this.skillCandies.set(id, b)
      scene.add(b.mesh)
    }
    this.skillRings = new Batch(candyRingGeometry(), mats.solid, 128, { color: true })
    this.pips = new Batch(levelPipGeometry(), mats.gold, 128, {})
    scene.add(this.skillRings.mesh, this.pips.mesh)
  }

  /** origin：新出现的糖果从哪来（死者掉落 / 宝箱喷出）；返回 null = 原地弹出。 */
  sync(pickups: readonly PickupView[], now: number, origin?: (p: PickupView) => PickupOrigin | null): void {
    const st = ++this.stamp
    for (const p of pickups) {
      let v = this.map.get(p.NetEntityIdRaw)
      const x = p.LogicTransform.WorldPosition.x
      const z = p.LogicTransform.WorldPosition.z
      if (!v || v.dieAt !== Number.POSITIVE_INFINITY) {
        const o = origin ? origin(p) : null
        v = {
          id: p.NetEntityIdRaw,
          kind: p.BomberPickupItem.Kind,
          x,
          z,
          born: now + (o ? o.delayMs : 0),
          dieAt: Number.POSITIVE_INFINITY,
          stamp: st,
          fromX: o ? o.fromX : x,
          fromZ: o ? o.fromZ : z,
          arc: !!o && (o.fromX !== x || o.fromZ !== z || o.delayMs > 0),
          halo: o ? o.halo : -1,
          protUntil: p.protectedUntilTick ?? 0,
          skill: null,
          level: 0,
        }
        this.map.set(v.id, v)
      }
      v.kind = p.BomberPickupItem.Kind
      v.skill = v.kind === PickupKind.SkillCandy && p.skill ? p.skill.id : null
      v.level = v.skill ? p.skill?.level ?? 1 : 0
      v.protUntil = p.protectedUntilTick ?? 0
      v.x = x
      v.z = z
      v.stamp = st
    }
    for (const v of this.map.values()) if (v.stamp !== st && v.dieAt === Number.POSITIVE_INFINITY) v.dieAt = now
  }

  clear(): void {
    this.map.clear()
  }

  update(now: number, camYaw: number, marks: GroundMarks, renderTick = 0, tickRateHz = 20): void {
    for (const b of this.candies) b.begin()
    for (const b of this.skillCandies.values()) b.begin()
    this.rings.begin()
    this.skillRings.begin()
    this.pips.begin()
    this.halos.begin()
    this.bubbles.begin()
    const rx = Math.cos(camYaw)
    const rz = -Math.sin(camYaw)
    const t = now / 1000
    for (const [id, v] of this.map) {
      let s = 1
      let px = v.x
      let pz = v.z
      let lift = 0
      if (now < v.born && now < v.dieAt) continue
      if (now >= v.dieAt) {
        const u = (now - v.dieAt) / DIE_MS
        if (u >= 1) {
          this.map.delete(id)
          continue
        }
        s = 1 - u
      } else if (v.arc && now - v.born < PICKUP_ARC_MS) {
        // 从来源格抛出：水平线性、竖直抛物线，途中略小。
        const u = (now - v.born) / PICKUP_ARC_MS
        px = v.fromX + (v.x - v.fromX) * u
        pz = v.fromZ + (v.z - v.fromZ) * u
        lift = 1.3 * 4 * u * (1 - u) + 0.4 * (1 - u)
        s = 0.7 + 0.3 * u
      } else {
        const since = now - v.born - (v.arc ? PICKUP_ARC_MS : 0)
        s = v.arc ? 1 + 0.18 * Math.sin(Math.PI * clamp01(since / 200)) : 0.2 + 0.8 * easeOutBack(clamp01(since / 260))
      }
      const bob = Math.sin(t * 2.4 + v.id) * 0.06
      const y = 0.5 + bob + lift + (now >= v.dieAt ? (now - v.dieAt) / DIE_MS * 0.4 : 0)
      const skillBatch = v.skill ? this.skillCandies.get(v.skill) : undefined
      if (skillBatch && v.skill) {
        // 技能糖：正面浮雕对着镜头轻轻左右摆（整圈自转会把剪影转到背面），外圈技能色光环。
        skillBatch.push(trs(M, px, y, pz, 0, camYaw + Math.sin(t * 1.5 + v.id) * 0.6, 0, s * 1.05, s * 1.05, s * 1.05))
        const ri = this.skillRings.push(trs(M, px, y, pz, -0.35, camYaw, 0, s, s, s))
        this.skillRings.color(ri, this.c.setHex(SKILL_COLOR[v.skill]))
        for (let k = 0; k < v.level; k++) {
          const off = (k - (v.level - 1) / 2) * PIP_GAP * s
          this.pips.push(trs(M, px + rx * off, y - PIP_DROP * s, pz + rz * off, 0, 0, 0, s, s, s))
        }
      } else {
        const batch = this.candies[v.kind] ?? this.candies[0]
        batch.push(trs(M, px, y, pz, 0, t * 1.5 + v.id, 0, s * 1.05, s * 1.05, s * 1.05))
        // 金环面朝镜头（绕 Y 对齐镜头朝向），向镜头仰起一点
        this.rings.push(trs(M, px, y, pz, -0.35, camYaw, 0, s, s, s))
      }
      if (v.halo >= 0) {
        const pulse = 1 + 0.06 * Math.sin(t * 5 + v.id)
        const hi = this.halos.push(trs(M, px, y, pz, -0.35, camYaw, 0, s * pulse, s * pulse, s * pulse))
        this.halos.color(hi, this.c.setHex(v.halo))
        marks.ring(px, pz, 0.95 * pulse, v.halo, 0.85 * s)
      }
      const left = (v.protUntil - renderTick) / tickRateHz
      if (left > 0 && now < v.dieAt) {
        // 最后 0.8 s 以 6 Hz 闪烁（亮 / 暗而非消失，照顾光敏）。
        const blink = left < 0.8 ? 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 6)) : 1
        const bs = s * (1 + 0.04 * Math.sin(t * 3 + v.id)) * blink
        this.bubbles.push(trs(M, px, y, pz, 0, 0, 0, bs, bs, bs))
      }
      marks.shadow(px, pz, 0.55, y - 0.25)
    }
    for (const b of this.candies) b.end()
    for (const b of this.skillCandies.values()) b.end()
    this.rings.end()
    this.skillRings.end()
    this.pips.end()
    this.halos.end()
    this.bubbles.end()
  }
}
