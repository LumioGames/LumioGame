import { Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { ChestView } from '../../contract'
import { CHEST, chestBodyGeometry, chestLidGeometry } from '../geo/chest'
import type { LabelLayer } from '../labels'
import { clamp01, easeOutBack } from '../logic/interp'
import { hash01 } from '../logic/rand'
import { SUNSHINE } from '../palette'
import type { GroundMarks } from './ground-marks'

/**
 * 决赛圈强力宝箱：从天而降落地、金色地面辉光 + 旋转金虚线圈（远处也找得到）、头顶 DOM 命中点；
 * 被命中时晃 + 盖子一跳 + 闪白；最后一击时盖子弹开、原地停一会儿再缩没（彩纸与金星由 runtime 喷）。
 * 只凭快照 diff：新 id = 落下，HitsLeft 变小 = 挨打，id 消失 = 开箱（换局清场时不演）。
 */
interface ChestVis {
  id: number
  x: number
  z: number
  hitsLeft: number
  hitsReq: number
  stamp: number
  spawnAt: number
  shakeAt: number
  openAt: number
  slot: ChestSlot
}

interface ChestSlot {
  root: Group
  lid: Group
  mat: MeshStandardMaterial
  used: boolean
}

const DROP_MS = 380
const SQUASH_MS = 200
const SHAKE_MS = 450
const LID_OPEN_MS = 280
const OPEN_HOLD_MS = 900
const OPEN_SHRINK_MS = 320
/** 同时在场的宝箱上限：决赛圈 5 段落箱（ADR 0031，1×1 不落）+ 余量；skills-fx.test 对 ringStages 守护。 */
export const CHEST_POOL = 6

export interface ChestDiff {
  spawned: { id: number; x: number; z: number }[]
  hit: { id: number; x: number; z: number; left: number }[]
  opened: { id: number; x: number; z: number }[]
}

export class ChestLayer {
  private readonly map = new Map<number, ChestVis>()
  private readonly slots: ChestSlot[] = []
  private stamp = 0
  private readonly flash = new Color(0xffffff)

  constructor(parent: Object3D) {
    const body = chestBodyGeometry()
    const lidGeo = chestLidGeometry()
    for (let i = 0; i < CHEST_POOL; i++) {
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.38, emissive: this.flash, emissiveIntensity: 0 })
      const root = new Group()
      const bodyMesh = new Mesh(body, mat)
      bodyMesh.castShadow = true
      bodyMesh.receiveShadow = true
      const lid = new Group()
      lid.position.set(0, CHEST.bodyH, -CHEST.depth / 2)
      const lidMesh = new Mesh(lidGeo, mat)
      lidMesh.castShadow = true
      lid.add(lidMesh)
      root.add(bodyMesh, lid)
      root.visible = false
      parent.add(root)
      this.slots.push({ root, lid, mat, used: false })
    }
  }

  /** 启动预热：让第一个宝箱可见一帧，编译材质。 */
  warmup(on: boolean): void {
    this.slots[0].root.visible = on
  }

  /** 宝箱所在格（挡火，给预览与连锁预测用）。 */
  blockers(out: Set<number>, size: number): Set<number> {
    out.clear()
    for (const v of this.map.values()) if (v.openAt === Number.POSITIVE_INFINITY) out.add(Math.floor(v.z) * size + Math.floor(v.x))
    return out
  }

  clear(): void {
    for (const v of this.map.values()) this.release(v)
    this.map.clear()
  }

  sync(chests: readonly ChestView[], now: number, silent: boolean, diff: ChestDiff): void {
    diff.spawned.length = 0
    diff.hit.length = 0
    diff.opened.length = 0
    const st = ++this.stamp
    for (const c of chests) {
      const x = c.LogicTransform.WorldPosition.x
      const z = c.LogicTransform.WorldPosition.z
      let v = this.map.get(c.NetEntityIdRaw)
      if (!v) {
        const slot = this.slots.find((s) => !s.used)
        if (!slot) continue
        slot.used = true
        v = {
          id: c.NetEntityIdRaw,
          x,
          z,
          hitsLeft: c.chest.HitsLeft,
          hitsReq: c.chest.HitsRequired,
          stamp: st,
          spawnAt: silent ? now - 10000 : now,
          shakeAt: -1e9,
          openAt: Number.POSITIVE_INFINITY,
          slot,
        }
        this.map.set(v.id, v)
        if (!silent) diff.spawned.push({ id: v.id, x, z })
      }
      if (c.chest.HitsLeft < v.hitsLeft && !silent) diff.hit.push({ id: v.id, x, z, left: c.chest.HitsLeft })
      v.x = x
      v.z = z
      v.hitsLeft = c.chest.HitsLeft
      v.hitsReq = c.chest.HitsRequired
      v.stamp = st
    }
    for (const v of this.map.values()) {
      if (v.stamp === st || v.openAt !== Number.POSITIVE_INFINITY) continue
      if (silent) {
        this.release(v)
        this.map.delete(v.id)
        continue
      }
      v.hitsLeft = 0
      v.openAt = Number.NEGATIVE_INFINITY
      diff.opened.push({ id: v.id, x: v.x, z: v.z })
    }
  }

  /** 表现排期：at 时晃一下。 */
  shake(id: number, at: number): void {
    const v = this.map.get(id)
    if (v) v.shakeAt = at
  }

  /** 表现排期：at 时开箱。 */
  open(id: number, at: number): void {
    const v = this.map.get(id)
    if (v && v.openAt === Number.NEGATIVE_INFINITY) v.openAt = at
  }

  update(now: number, marks: GroundMarks, labels: LabelLayer): void {
    const t = now / 1000
    for (const [id, v] of this.map) {
      const { root, lid, mat } = v.slot
      let y = 0
      let sy = 1
      let sxz = 1
      let rz = 0
      let lidRot = 0
      let emissive = 0
      let scale = 1
      const dropT = now - v.spawnAt
      if (dropT < 0) {
        root.visible = false
        continue
      }
      root.visible = true
      if (dropT < DROP_MS) {
        const u = dropT / DROP_MS
        y = 4 * (1 - u * u)
      } else if (dropT < DROP_MS + SQUASH_MS) {
        const s = Math.sin(Math.PI * ((dropT - DROP_MS) / SQUASH_MS))
        sy = 1 - 0.22 * s
        sxz = 1 + 0.12 * s
      } else {
        // 待机：轻微呼吸，每隔几秒盖子「偷看」一下。
        sy = 1 + 0.015 * Math.sin(t * 3 + id)
        const peek = (t + hash01(id, 1) * 3) % 3.2
        if (peek < 0.35) lidRot = -0.22 * Math.sin((peek / 0.35) * Math.PI)
      }
      const sh = now - v.shakeAt
      if (sh >= 0 && sh < SHAKE_MS) {
        const u = sh / SHAKE_MS
        rz = Math.sin(sh * 0.055) * 0.22 * (1 - u)
        const punch = 1 + 0.14 * (1 - u) * (1 - u)
        sy *= punch
        sxz *= punch
        lidRot = Math.min(lidRot, -0.45 * Math.sin(Math.min(1, u * 3) * Math.PI))
        emissive = u < 0.25 ? 0.7 * (1 - u / 0.25) : 0
      }
      let open = false
      if (Number.isFinite(v.openAt)) {
        const o = now - v.openAt
        if (o >= 0) {
          open = true
          lidRot = -1.95 * easeOutBack(clamp01(o / LID_OPEN_MS))
          emissive = Math.max(emissive, o < 160 ? 0.8 * (1 - o / 160) : 0)
          if (o > OPEN_HOLD_MS) {
            scale = 1 - clamp01((o - OPEN_HOLD_MS) / OPEN_SHRINK_MS)
            if (scale <= 0) {
              this.release(v)
              this.map.delete(id)
              continue
            }
          }
        }
      }
      root.position.set(v.x, y, v.z)
      root.rotation.set(0, 0, rz)
      root.scale.set(sxz * scale, sy * scale, sxz * scale)
      lid.rotation.x = lidRot
      mat.emissiveIntensity = emissive
      const glow = open ? 0.9 : 0.4 + 0.15 * Math.sin(t * 4 + id)
      marks.shadow(v.x, v.z, 1.05 * scale, y)
      marks.glowAt(v.x, v.z, 1.9 * scale, 0.9 * glow, 0.62 * glow, 0.12 * glow, 1)
      if (!open) marks.dashedRing(v.x, v.z, 1.45, SUNSHINE, 0.85, t * 0.8)
      labels.setChest(id, v.hitsLeft, v.hitsReq, v.x, 1.25 + y, v.z, !open && dropT >= DROP_MS)
    }
  }

  private release(v: ChestVis): void {
    v.slot.used = false
    v.slot.root.visible = false
  }
}
