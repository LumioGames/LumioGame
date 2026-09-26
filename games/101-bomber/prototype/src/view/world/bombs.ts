import { Color, MeshStandardMaterial, type Object3D, type Quaternion, type Texture } from 'three'
import type { BombView } from '../../contract'
import { Batch, M, tqs, trs } from '../batch'
import { billboardQuad, bombBandGeometry, bombBodyGeometry, bombGlowGeometry, FUSE_BASE_Y, FUSE_TIP, fuseGeometry } from '../geo/bomb'
import { drillSpikeGeometry, frostShellGeometry } from '../geo/skill'
import { clamp01, easeOutBack, type XZ } from '../logic/interp'
import { bombStyle, kickedPos, lerpKicked, SKILL_FX, type BombStyle } from '../logic/skill-fx'
import { softQuadMaterial, type SharedMaterials } from '../materials'
import { slotColor } from '../palette'
import type { GroundMarks } from './ground-marks'

/**
 * 炸弹：主人色赤道带（看得出是谁的弹）+ 随引信缩短的引线 + 火花；呼吸频率 1.5 → 4 Hz；
 * 引爆前最后 0.4 s 平稳膨胀到 1.22 倍 + 红色辉光 + 地面红圈（不做频闪，照顾光敏）。
 * 「引爆前」按连锁感知的预计引爆时刻算（logic/detonation），不是只看自身引信。
 * 全部实例批，逐帧按快照重建。
 * 原型扩展（NON-CONTRACT，ADR 0030）：冰冻弹罩霜壳、穿透弹赤道一圈金钻刺、冰川弹两者都有（冰系危险光偏青）；
 * 被踢出的炸弹按 BombView.kick 的进度在两帧之间插值滑行，带一点小跳。
 */
interface BombVis {
  id: number
  x: number
  z: number
  slot: number
  fuseEnd: number
  /** 连锁感知的预计引爆 Tick（≤ fuseEnd）；危险脉冲按它算，被连锁带走的炸弹也会提前亮。 */
  detonate: number
  exploded: number
  born: number
  phase: number
  /** 表现上开始爆炸（隐藏弹体）的 viewNow；未排期为 +∞。 */
  hideAt: number
  stamp: number
  /** 上一帧与这一帧快照里的表现位置（被踢时 = 格心 + 滑行进度）。 */
  prev: XZ | null
  curr: XZ
  kicking: boolean
  style: BombStyle
}

const TAU = Math.PI * 2
/** 冰系炸弹的危险光（线性 RGB 系数）：青色而不是红色。 */
const FROST_GLOW = { r: 0.35, g: 0.85, b: 1.0 }
const FIRE_GLOW = { r: 1.0, g: 0.29, b: 0.17 }

export class BombLayer {
  private readonly body: Batch
  private readonly band: Batch
  private readonly fuse: Batch
  private readonly glow: Batch
  private readonly spark: Batch
  private readonly frost: Batch
  private readonly spikes: Batch
  private readonly pos: XZ = { x: 0, z: 0 }
  private readonly map = new Map<number, BombVis>()
  private stamp = 0
  private readonly c = new Color()
  private readonly spk = new Color(0xffe58a)

  constructor(
    scene: Object3D,
    mats: SharedMaterials,
    radial: Texture,
    private readonly fuseTicks: number,
    private readonly dangerTicks: number,
  ) {
    this.body = new Batch(bombBodyGeometry(), mats.bombShell, 64, { castShadow: true })
    this.band = new Batch(bombBandGeometry(), mats.solid, 64, { color: true, castShadow: false })
    this.fuse = new Batch(fuseGeometry(), mats.plastic, 64, { castShadow: false })
    this.glow = new Batch(bombGlowGeometry(), mats.glowAdd, 64, { color: true, renderOrder: 4 })
    this.spark = new Batch(billboardQuad(), softQuadMaterial(radial, true), 128, { tint: true, renderOrder: 5 })
    this.frost = new Batch(
      frostShellGeometry(),
      new MeshStandardMaterial({ color: 0xcff4ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false }),
      64,
      { renderOrder: 4 },
    )
    this.spikes = new Batch(drillSpikeGeometry(), mats.plastic, 64, { castShadow: false })
    scene.add(this.body.mesh, this.band.mesh, this.fuse.mesh, this.glow.mesh, this.spark.mesh, this.frost.mesh, this.spikes.mesh)
  }

  /** 新快照到达：按 id 增删。detonateAt：id → 连锁感知的预计引爆 Tick（缺省用自身引信）。 */
  sync(bombs: readonly BombView[], slotOf: (ownerId: number) => number, now: number, detonateAt?: ReadonlyMap<number, number>): void {
    const st = ++this.stamp
    for (const b of bombs) {
      const s = b.BomberBombState
      let v = this.map.get(b.NetEntityIdRaw)
      if (!v) {
        v = {
          id: b.NetEntityIdRaw,
          x: 0,
          z: 0,
          slot: 0,
          fuseEnd: 0,
          detonate: 0,
          exploded: 0,
          born: now,
          phase: 0,
          hideAt: Number.POSITIVE_INFINITY,
          stamp: st,
          prev: null,
          curr: { x: 0, z: 0 },
          kicking: false,
          style: 'standard',
        }
        this.map.set(v.id, v)
      } else {
        v.prev = v.prev ?? { x: 0, z: 0 }
        v.prev.x = v.curr.x
        v.prev.z = v.curr.z
      }
      v.x = b.LogicTransform.WorldPosition.x
      v.z = b.LogicTransform.WorldPosition.z
      kickedPos(v.x, v.z, b.kick, v.curr)
      v.kicking = !!b.kick
      v.style = bombStyle(s.BombKind, s.PierceLayers)
      v.slot = slotOf(s.OwnerNetEntityIdRaw)
      v.fuseEnd = s.FuseEndTick
      v.detonate = Math.min(s.FuseEndTick, detonateAt?.get(b.NetEntityIdRaw) ?? s.FuseEndTick)
      v.exploded = s.ExplodedAtTick
      v.stamp = st
    }
    for (const [id, v] of this.map) if (v.stamp !== st) this.map.delete(id)
  }

  /** 爆炸表现排期：到 at 时隐藏弹体。 */
  scheduleHide(id: number, at: number): void {
    const v = this.map.get(id)
    if (v) v.hideAt = Math.min(v.hideAt, at)
  }

  clear(): void {
    this.map.clear()
  }

  /** @param alpha 快照插值系数（被踢炸弹在两帧之间滑）。 */
  update(renderTick: number, now: number, dt: number, camQuat: Quaternion, marks: GroundMarks, alpha = 1): void {
    this.body.begin()
    this.band.begin()
    this.fuse.begin()
    this.glow.begin()
    this.spark.begin()
    this.frost.begin()
    this.spikes.begin()
    for (const v of this.map.values()) {
      if (now >= v.hideAt) continue
      const p = lerpKicked(v.prev, v.curr, alpha, this.pos)
      const bx = p.x
      const bz = p.z
      // 每滑过一格小跳一下：格心着地、格边最高（按表现位置算，跟着插值走）。
      const hop = v.kicking ? SKILL_FX.kickHop * Math.abs(Math.sin(Math.PI * (bx + bz - 1))) : 0
      const frosty = v.style === 'frost' || v.style === 'glacier'
      // 规则层已判爆炸、表现还没排上（极端掉帧）时也先藏起来，交给爆炸特效。
      if (v.exploded > 0 && renderTick >= v.exploded + 2) continue
      const remain = clamp01((v.fuseEnd - renderTick) / this.fuseTicks)
      const urgency = clamp01((v.detonate - renderTick) / this.fuseTicks)
      const freq = 1.5 + 2.5 * (1 - urgency)
      v.phase = (v.phase + TAU * freq * dt) % TAU
      const dangerStart = v.detonate - this.dangerTicks
      const k = clamp01((renderTick - dangerStart) / this.dangerTicks)
      const pop = now - v.born < 160 ? 0.6 + 0.4 * easeOutBack(clamp01((now - v.born) / 160)) : 1
      const s = pop * (1 + 0.22 * k) * (1 + 0.045 * Math.sin(v.phase) * (1 - k))
      const sq = 1 + 0.03 * Math.sin(v.phase) * (1 - k)
      trs(M, bx, hop, bz, 0, 0, 0, s, s / sq, s)
      this.body.push(M)
      const bi = this.band.push(M)
      this.band.color(bi, this.c.setHex(slotColor(v.slot)))
      if (frosty) this.frost.push(M)
      if (v.style === 'pierce' || v.style === 'glacier') this.spikes.push(M)
      if (k > 0) {
        const gi = this.glow.push(M)
        const g = frosty ? FROST_GLOW : FIRE_GLOW
        this.glow.color(gi, this.c.setRGB(g.r * k * 0.6, g.g * k * 0.6, g.b * k * 0.6))
        marks.ring(bx, bz, 1.05 + 0.1 * k, frosty ? 0x3db8da : 0xff4b2b, 0.6 * k)
      }
      // 引线随引信缩短
      const fs = 0.15 + 0.85 * remain
      const baseY = hop + (FUSE_BASE_Y * s) / sq
      this.fuse.push(trs(M, bx, baseY, bz, 0, 0, 0, s, s * fs, s))
      const tx = bx + FUSE_TIP.x * s
      const ty = baseY + FUSE_TIP.y * s * fs
      const tz = bz + FUSE_TIP.z * s
      const flick = 0.75 + 0.25 * Math.sin(now * 0.05 + v.id) + 0.15 * Math.sin(now * 0.13 + v.id * 3)
      const si = this.spark.push(tqs(M, tx, ty, tz, camQuat, 0.34 * flick, 0.34 * flick, 1))
      this.spark.tint(si, this.spk.r * 1.6, this.spk.g * 1.4, this.spk.b, 1)
      const si2 = this.spark.push(tqs(M, tx + Math.sin(now * 0.021 + v.id) * 0.05, ty + 0.05, tz, camQuat, 0.14, 0.14, 1))
      this.spark.tint(si2, 1.4, 1.2, 0.9, 0.9)
      marks.shadow(bx, bz, 0.75, hop)
    }
    this.body.end()
    this.band.end()
    this.fuse.end()
    this.glow.end()
    this.spark.end()
    this.frost.end()
    this.spikes.end()
  }
}
