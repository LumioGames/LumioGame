import { Color, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from 'three'
import type { BomberCell, PlayerSkillsView, ProtoRules } from '../../contract'
import { COMBO_FORM } from '../../present/skill-style'
import { Batch, M, trs } from '../batch'
import { DOLL } from '../geo/doll'
import { arcGeometry, bubbleGeometry, comboRingGeometry, iceBlockGeometry, orbGeometry, toxinBubbleGeometry } from '../geo/skill'
import { bubbleAlpha, comboOf, SKILL_FX } from '../logic/skill-fx'
import { dollStatus, shockArcs, STATUS_FX, toxinBubbles } from '../logic/status-fx'
import type { SharedMaterials } from '../materials'
import type { Doll } from './dolls'
import type { GroundMarks } from './ground-marks'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：玩偶身上的技能表现，**所有人都看得见**（D4 / B）：
 *   - 泡泡：半透明青色球，最后 0.6 s 闪；
 *   - 冻住：透明冰块罩住玩偶；
 *   - 组合技形态：脖子上一圈技能色项圈 + 沿项圈环绕的小球（火焰冲刺用火苗、其余用辉光），都收在 0.7 格脚印里；
 *   - 闪现拖尾：起点 → 落点一串渐隐的地面辉光；
 *   - 本机闪现落点预览：落点虚线圈 + 途经小光点（只给本人画）。
 * 原型扩展（NON-CONTRACT，ADR 0033）：中毒（skills.toxinUntilTick）身上冒绿泡；麻痹（skills.shockUntilTick）身上跳电黄电弧
 * （位置与节奏见 logic/status-fx；玩偶偏绿 / 步频放慢 / 打颤由 DollFx 驱动）。都收在 0.7 格脚印里。
 * 立即模式：每帧 begin → player()… → end()。
 */

interface Trail {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  start: number
  color: Color
}

const CAP = 16
const ORB_CAP = 48
const TRAIL_CAP = 16
const ORB_ORBIT_HZ = 0.5
const RING_SPIN_HZ = 0.25
/** 中毒绿泡 / 麻痹电弧的实例容量（CAP 名玩家 × 每人个数）。 */
const TOXIN_CAP = CAP * STATUS_FX.toxinBubbles
const ARC_CAP = CAP * STATUS_FX.shockArcs
const TOXIN_BUBBLE = [0x7ed957, 0xb8f07a] as const
const SHOCK_ARC = 0xffe23c

export class SkillFxLayer {
  private readonly bubbles: Batch
  private readonly ice: Batch
  private readonly rings: Batch
  private readonly flameOrbs: Batch
  private readonly glowOrbs: Batch
  private readonly toxin: Batch
  private readonly arcs: Batch
  private readonly trails: Trail[] = []
  private readonly c = new Color()

  constructor(
    parent: Object3D,
    mats: SharedMaterials,
    private readonly skills: ProtoRules['skills'],
  ) {
    this.bubbles = new Batch(
      bubbleGeometry(),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, transparent: true, opacity: SKILL_FX.bubbleAlpha, depthWrite: false }),
      CAP,
      { color: true, renderOrder: 4 },
    )
    this.ice = new Batch(
      iceBlockGeometry(),
      new MeshStandardMaterial({ color: 0xcff4ff, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
      CAP,
      { renderOrder: 4 },
    )
    this.rings = new Batch(comboRingGeometry(), mats.solid, CAP, { color: true })
    this.flameOrbs = new Batch(orbGeometry(), mats.flame, ORB_CAP, { color: true })
    this.glowOrbs = new Batch(orbGeometry(), mats.glowAdd, ORB_CAP, { color: true, renderOrder: 5 })
    this.toxin = new Batch(
      toxinBubbleGeometry(),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false, emissive: 0x2a6a1a, emissiveIntensity: 0.4 }),
      TOXIN_CAP,
      { color: true, renderOrder: 5 },
    )
    // 电弧用不受光的实色（不是叠加辉光）：叠加在白兔 / 米色地面上会糊成白色，看不出「电黄」。
    this.arcs = new Batch(arcGeometry(), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), ARC_CAP, { color: true, renderOrder: 5 })
    parent.add(this.bubbles.mesh, this.ice.mesh, this.rings.mesh, this.flameOrbs.mesh, this.glowOrbs.mesh, this.toxin.mesh, this.arcs.mesh)
  }

  clear(): void {
    this.trails.length = 0
  }

  warmup(on: boolean): void {
    for (const b of [this.bubbles, this.ice, this.rings, this.flameOrbs, this.glowOrbs, this.toxin, this.arcs]) {
      b.begin()
      if (on) b.push(trs(M, 0, -10, 0, 0, 0, 0, 0.01, 0.01, 0.01))
      b.end()
    }
  }

  begin(): void {
    this.bubbles.begin()
    this.ice.begin()
    this.rings.begin()
    this.flameOrbs.begin()
    this.glowOrbs.begin()
    this.toxin.begin()
    this.arcs.begin()
  }

  /** 一名玩家的技能外观（玩偶已按本帧位置更新过）。 */
  player(doll: Doll, sk: PlayerSkillsView | undefined, renderTick: number, rate: number, now: number): void {
    if (!sk || !doll.shown) return
    const x = doll.x
    const z = doll.z
    const base = doll.root.position.y
    const s = doll.scale
    const t = now / 1000
    const a = bubbleAlpha(sk.bubbleUntilTick, renderTick, rate)
    if (a > 0) {
      const k = a / SKILL_FX.bubbleAlpha
      const r = s * (0.94 + 0.06 * k) * (1 + 0.03 * Math.sin(t * 5 + doll.id))
      // 横向按最大半径等比收进墙前（仍随脉动呼吸），纵向不变：一个略高的蛋形泡泡。
      const rxz = r * Math.min(1, SKILL_FX.bubbleWallClear / (SKILL_FX.bubbleRadius * s * 1.03))
      const i = this.bubbles.push(trs(M, x, base + DOLL.height * s * 0.5, z, 0, t, 0, rxz, r * 1.08, rxz))
      this.bubbles.color(i, this.c.setHex(0x7fe3ff).multiplyScalar(0.55 + 0.45 * k))
    }
    const st = dollStatus(sk, renderTick)
    if (st.frozen) this.ice.push(trs(M, x, base, z, 0, doll.yaw, 0, s * 0.85, s * 0.85, s * 0.85))
    if (st.poisoned) {
      for (const b of toxinBubbles(t, doll.id)) {
        if (b.r <= 1e-4) continue
        const r = b.r * s
        const i = this.toxin.push(trs(M, x + b.dx * s, base + b.y * s, z + b.dz * s, 0, 0, 0, r, r, r))
        this.toxin.color(i, this.c.setHex(b.y > STATUS_FX.toxinBubbleStartY + STATUS_FX.toxinBubbleRise * 0.5 ? TOXIN_BUBBLE[1] : TOXIN_BUBBLE[0]))
      }
    }
    if (st.shocked) {
      for (const a of shockArcs(t, doll.id)) {
        // 弧段中心在半径 R 的圆上，局部 +X 沿切向（绕 Y 转 ang），再在切面内倾斜 tilt。
        const R = STATUS_FX.shockArcRadius * s
        const i = this.arcs.push(trs(M, x + Math.sin(a.ang) * R, base + a.y * s, z + Math.cos(a.ang) * R, 0, a.ang, a.tilt, a.len * s, s, s))
        this.arcs.color(i, this.c.setHex(SHOCK_ARC))
      }
    }
    const combo = comboOf(sk, this.skills)
    const form = combo ? COMBO_FORM[combo] : undefined
    if (form) {
      // 项圈与小球都收在 0.7 格脚印里（SKILL_FX.comboRingRadius 注释），走廊里不穿墙。
      const neck = base + SKILL_FX.comboNeckY * s
      const ri = this.rings.push(trs(M, x, neck, z, 0.12 * Math.sin(t * 2), t * Math.PI * 2 * RING_SPIN_HZ, 0, s, s, s))
      this.rings.color(ri, this.c.setHex(form.ring))
      const orbs = form.orbMat === 'flame' ? this.flameOrbs : this.glowOrbs
      const rad = SKILL_FX.comboOrbitRadius * s
      const os = SKILL_FX.comboOrbScale * s
      for (let k = 0; k < SKILL_FX.comboOrbs; k++) {
        const ang = t * Math.PI * 2 * ORB_ORBIT_HZ + (k / SKILL_FX.comboOrbs) * Math.PI * 2
        const oy = neck + 0.03 * s * Math.sin(t * 3 + k * 2)
        const oi = orbs.push(trs(M, x + Math.cos(ang) * rad, oy, z + Math.sin(ang) * rad, 0, 0, 0, os, os, os))
        orbs.color(oi, this.c.setHex(form.orb))
      }
    }
  }

  /** 闪现 / 冲刺拖尾（from → to，世界坐标）。 */
  trail(fromX: number, fromZ: number, toX: number, toZ: number, now: number, color: number): void {
    if (this.trails.length >= TRAIL_CAP) this.trails.shift()
    this.trails.push({ fromX, fromZ, toX, toZ, start: now, color: new Color(color) })
  }

  /** 本机闪现落点预览：落点虚线圈 + 途经小光点。 */
  landing(target: { landing: BomberCell; path: readonly BomberCell[] }, color: number, now: number, marks: GroundMarks): void {
    this.c.setHex(color)
    const lx = target.landing.X + 0.5
    const lz = target.landing.Y + 0.5
    marks.dashedRing(lx, lz, 0.8, color, 0.75, now * 0.002)
    for (let i = 1; i < target.path.length; i++) {
      const p = target.path[i]
      marks.glowAt(p.X + 0.5, p.Y + 0.5, 0.28, this.c.r, this.c.g, this.c.b, 0.35)
    }
  }

  end(now: number, marks: GroundMarks): void {
    let keep = 0
    for (const tr of this.trails) {
      const u = (now - tr.start) / SKILL_FX.trailMs
      if (u >= 1) continue
      this.trails[keep++] = tr
      if (u < 0) continue
      const len = Math.hypot(tr.toX - tr.fromX, tr.toZ - tr.fromZ)
      const n = Math.max(2, Math.ceil(len * SKILL_FX.trailGlowsPerCell))
      for (let i = 0; i <= n; i++) {
        const f = i / n
        // 越靠近落点越亮、消失越晚。
        const a = (1 - u) * (0.35 + 0.65 * f)
        marks.glowAt(tr.fromX + (tr.toX - tr.fromX) * f, tr.fromZ + (tr.toZ - tr.fromZ) * f, 0.5 + 0.3 * f, tr.color.r * 1.4, tr.color.g * 1.4, tr.color.b * 1.4, a)
      }
    }
    this.trails.length = keep
    this.bubbles.end()
    this.ice.end()
    this.rings.end()
    this.flameOrbs.end()
    this.glowOrbs.end()
    this.toxin.end()
    this.arcs.end()
  }
}
