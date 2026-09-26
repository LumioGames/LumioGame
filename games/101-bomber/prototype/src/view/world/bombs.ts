import { Color, MeshStandardMaterial, type Object3D, type Quaternion, type Texture } from 'three'
import type { BombView } from '../../contract'
import { Batch, M, tqs, trs } from '../batch'
import { billboardQuad, bombBandGeometry, bombBodyGeometry, bombGlowGeometry, FUSE_BASE_Y, FUSE_TIP, fuseGeometry } from '../geo/bomb'
import { BOMB_CENTER_Y, BOMB_R } from '../geo/bomb'
import { arcGeometry, drillSpikeGeometry, frostShellGeometry, toxinBubbleGeometry } from '../geo/skill'
import { BOMB_TONE, bombDrill, bombTone, type BombTone } from '../logic/bomb-look'
import { clamp01, easeOutBack, type XZ } from '../logic/interp'
import { hash01 } from '../logic/rand'
import { kickedPos, lerpKicked, SKILL_FX } from '../logic/skill-fx'
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
 * 原型扩展（NON-CONTRACT，ADR 0033）：色调按 logic/bomb-look——冰冻弹冰蓝壳、中毒弹毒绿壳 + 顶上冒绿泡、
 * 麻痹弹电黄壳 + 壳面跳电弧；引信火花、危险光与地面危险圈都随色调（钻刺与色调正交）。
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
  tone: BombTone
  drill: boolean
}

const TAU = Math.PI * 2
type ShellTone = Exclude<BombTone, 'fire'>
const SHELL_TONES: readonly ShellTone[] = ['frost', 'toxin', 'shock']
/** 中毒弹顶上的绿泡：每颗弹 2 颗，一个周期（秒）从壳面升起 0.35 格后破（表现取值，推断待验证）。 */
const TOXIN_PUFFS = 2
const TOXIN_PUFF_SEC = 0.9
/** 麻痹弹壳面电弧：每颗弹 2 段，每秒换位 12 次（小电弧跳位置，不整颗频闪）。 */
const SHOCK_ARCS = 2
const SHOCK_ARC_HZ = 12

export class BombLayer {
  private readonly body: Batch
  private readonly band: Batch
  private readonly fuse: Batch
  private readonly glow: Batch
  private readonly spark: Batch
  /** 色调外壳（冰冻 / 中毒 / 麻痹）：每种色调一个批次（不透明度与自发光各异）。 */
  private readonly shells: Readonly<Record<ShellTone, Batch>>
  private readonly spikes: Batch
  private readonly puffs: Batch
  private readonly arcs: Batch
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
    const shellGeo = frostShellGeometry()
    const shell = (t: ShellTone): Batch => {
      const p = BOMB_TONE[t]
      const color = p.shell ?? 0xffffff
      const m = new MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: p.shellOpacity, depthWrite: false })
      m.emissive.setHex(color)
      m.emissiveIntensity = p.shellGlow
      return new Batch(shellGeo, m, 64, { renderOrder: 4 })
    }
    this.shells = { frost: shell('frost'), toxin: shell('toxin'), shock: shell('shock') }
    this.spikes = new Batch(drillSpikeGeometry(), mats.plastic, 64, { castShadow: false })
    this.puffs = new Batch(
      toxinBubbleGeometry(),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false }),
      64 * TOXIN_PUFFS,
      { color: true, renderOrder: 5 },
    )
    this.arcs = new Batch(arcGeometry(), mats.glowAdd, 64 * SHOCK_ARCS, { color: true, renderOrder: 5 })
    scene.add(this.body.mesh, this.band.mesh, this.fuse.mesh, this.glow.mesh, this.spark.mesh, ...SHELL_TONES.map((t) => this.shells[t].mesh), this.spikes.mesh, this.puffs.mesh, this.arcs.mesh)
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
          tone: 'fire',
          drill: false,
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
      v.tone = bombTone(s.BombKind)
      v.drill = bombDrill(s.BombKind, s.PierceLayers ?? 0)
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
    for (const t of SHELL_TONES) this.shells[t].begin()
    this.spikes.begin()
    this.puffs.begin()
    this.arcs.begin()
    for (const v of this.map.values()) {
      if (now >= v.hideAt) continue
      const p = lerpKicked(v.prev, v.curr, alpha, this.pos)
      const bx = p.x
      const bz = p.z
      // 每滑过一格小跳一下：格心着地、格边最高（按表现位置算，跟着插值走）。
      const hop = v.kicking ? SKILL_FX.kickHop * Math.abs(Math.sin(Math.PI * (bx + bz - 1))) : 0
      const pal = BOMB_TONE[v.tone]
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
      if (v.tone !== 'fire') this.shells[v.tone].push(M)
      if (v.drill) this.spikes.push(M)
      if (k > 0) {
        const gi = this.glow.push(M)
        const g = pal.danger
        this.glow.color(gi, this.c.setRGB(g[0] * k * 0.6, g[1] * k * 0.6, g[2] * k * 0.6))
        marks.ring(bx, bz, 1.05 + 0.1 * k, pal.ring, 0.6 * k)
      }
      // 以下会覆写共享矩阵 M：弹体矩阵要用的都放在上面。
      if (v.tone === 'toxin') this.toxinPuffs(v, bx, hop, bz, s, now)
      else if (v.tone === 'shock') this.shockArcs(v, bx, hop, bz, s, now)
      // 引线随引信缩短
      const fs = 0.15 + 0.85 * remain
      const baseY = hop + (FUSE_BASE_Y * s) / sq
      this.fuse.push(trs(M, bx, baseY, bz, 0, 0, 0, s, s * fs, s))
      const tx = bx + FUSE_TIP.x * s
      const ty = baseY + FUSE_TIP.y * s * fs
      const tz = bz + FUSE_TIP.z * s
      const flick = 0.75 + 0.25 * Math.sin(now * 0.05 + v.id) + 0.15 * Math.sin(now * 0.13 + v.id * 3)
      const si = this.spark.push(tqs(M, tx, ty, tz, camQuat, 0.34 * flick, 0.34 * flick, 1))
      this.spk.setHex(pal.spark)
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
    for (const t of SHELL_TONES) this.shells[t].end()
    this.spikes.end()
    this.puffs.end()
    this.arcs.end()
  }

  /** 中毒弹：壳面冒绿泡，升 0.35 格后破（按 id 错相）。 */
  private toxinPuffs(v: BombVis, bx: number, hop: number, bz: number, s: number, now: number): void {
    const t = now / 1000
    for (let i = 0; i < TOXIN_PUFFS; i++) {
      const u = (t / TOXIN_PUFF_SEC + i / TOXIN_PUFFS + hash01(v.id, 5)) % 1
      const cycle = Math.floor(t / TOXIN_PUFF_SEC + i / TOXIN_PUFFS + hash01(v.id, 5))
      const a = hash01(v.id * 7 + i, cycle) * TAU
      const r = (u < 0.8 ? 0.035 + 0.035 * (u / 0.8) : 0.07 * (1 - (u - 0.8) / 0.2)) * s
      // 从壳面（帽口斜下方）冒出，往上飘。
      const off = (BOMB_R * 0.72 + 0.04 * u) * s
      const y = hop + (BOMB_CENTER_Y + BOMB_R * 0.8 + 0.35 * u) * s
      const pi = this.puffs.push(trs(M, bx + Math.cos(a) * off, y, bz + Math.sin(a) * off, 0, 0, 0, r, r, r))
      this.puffs.color(pi, this.c.setHex(u < 0.5 ? 0x9be15d : 0xc8ff8a))
    }
  }

  /** 麻痹弹：壳面跳两段电弧（切向摆放、随机倾斜，每 1 / SHOCK_ARC_HZ 秒换位）。 */
  private shockArcs(v: BombVis, bx: number, hop: number, bz: number, s: number, now: number): void {
    const bucket = Math.floor((now / 1000) * SHOCK_ARC_HZ)
    const R = (BOMB_R + 0.05) * s
    for (let i = 0; i < SHOCK_ARCS; i++) {
      const key = v.id * 13 + i
      const a = hash01(key, bucket) * TAU
      const y = hop + (BOMB_CENTER_Y + (hash01(key, bucket + 1e5) - 0.5) * BOMB_R) * s
      const tilt = (hash01(key, bucket + 2e5) - 0.5) * 1.6
      const len = (0.28 + 0.14 * hash01(key, bucket + 3e5)) * s
      // 局部 +X 沿切向：位置 (sin a, cos a) 的切向是 (cos a, −sin a) = 绕 Y 转 a。
      const ai = this.arcs.push(trs(M, bx + Math.sin(a) * R, y, bz + Math.cos(a) * R, 0, a, tilt, len, s, s))
      this.arcs.color(ai, this.c.setRGB(1.6, 1.45, 0.5))
    }
  }
}
