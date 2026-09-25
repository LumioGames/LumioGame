import { Color, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import type { AnimalId } from '../../contract'
import { DOLL, dollGeometries, patchGeometry, tuftGeometry } from '../geo/doll'
import { approachAngle, clamp01 } from '../logic/interp'
import { hash01 } from '../logic/rand'
import type { SharedMaterials } from '../materials'

/** 参考图里角色约占一格宽、比方块高；玩偶模型按 1.08 格高建，整体放大到约 1.4 格高。 */
const DOLL_SCALE = 1.3

/**
 * 一只玩偶的表现状态机：走路（颠 + 挤压拉伸 + 摆臂迈脚）、转身、眨眼、受击闪白 + 晃、
 * 受伤三档（完好 / 缝补贴片 / 冒棉花 + 歪头）、保护期闪烁、死亡散架（零件四散、落地弹一次）、
 * 重生「重新摆上桌」（从 2.5 格高落下 + 落地压扁）。
 */

const TAU = Math.PI * 2
const DROP_MS = 320
const SQUASH_MS = 180
const FLASH_MS = 80
const WOBBLE_MS = 350
const BURST_HIDE_MS = 1200
const GRAVITY = -18

const _v = new Vector3()

interface PartRest {
  obj: Object3D
  px: number
  py: number
  pz: number
  rx: number
  ry: number
  rz: number
  /** 落地时零件中心离地高度。 */
  radius: number
}

export type DollVisual = 'alive' | 'burst' | 'hidden'
export type PodiumPoseKind = 'cheer' | 'wave' | 'clap' | 'droop'

export class Doll {
  readonly root = new Group()
  readonly mat: MeshStandardMaterial
  private readonly bodyPivot = new Group()
  private readonly headPivot = new Group()
  private readonly body: Mesh
  private readonly head: Mesh
  private readonly eyes: Mesh
  private readonly armL = new Group()
  private readonly armR = new Group()
  private readonly footL: Mesh
  private readonly footR: Mesh
  private readonly patch: Mesh
  private readonly tufts: Mesh
  private readonly parts: PartRest[] = []
  private readonly burstVel = new Float32Array(6 * 6)
  private readonly headTopLocal: number

  // 位置 / 运动
  x = 0
  z = 0
  private lastX = NaN
  private lastZ = NaN
  private lastVX = 0
  private lastVZ = 0
  yaw = 0
  dirX = 0
  dirZ = 1
  speed = 0
  private walkPhase = 0
  /** 地面高度偏移（水里下沉）。 */
  groundY = 0

  // 表现状态
  visual: DollVisual = 'alive'
  private flashAt = -1e9
  private wobbleAt = -1e9
  private dropAt = -1e9
  private burstAt = -1e9
  private blinkAt: number
  /** 名牌上小血条显示到何时（viewNow 毫秒）。 */
  hitBarUntil = -1e9
  hp = 6
  protectedPulse = 0

  // 帽塔摇摆（世界空间弹簧）
  swayX = 0
  swayZ = 0
  private swayVX = 0
  private swayVZ = 0

  readonly headTop = new Vector3()
  readonly headQuat = new Quaternion()

  constructor(
    readonly id: number,
    readonly animal: AnimalId,
    readonly slot: number,
    mats: SharedMaterials,
    shared: { patch: ReturnType<typeof patchGeometry>; tufts: ReturnType<typeof tuftGeometry> },
  ) {
    const g = dollGeometries(animal)
    this.mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, emissive: new Color(0xffffff), emissiveIntensity: 0 })
    this.body = new Mesh(g.body, this.mat)
    this.body.position.y = g.bodyY
    this.head = new Mesh(g.head, this.mat)
    this.eyes = new Mesh(g.eyes, mats.eyes)
    const armMeshL = new Mesh(g.arm, this.mat)
    const armMeshR = new Mesh(g.arm, this.mat)
    this.footL = new Mesh(g.foot, this.mat)
    this.footR = new Mesh(g.foot, this.mat)
    this.patch = new Mesh(shared.patch, this.mat)
    this.tufts = new Mesh(shared.tufts, mats.cotton)
    this.patch.visible = false
    this.tufts.visible = false

    this.headPivot.position.set(0, DOLL.headY, 0)
    this.headPivot.add(this.head, this.eyes)
    this.armL.position.set(-DOLL.shoulderX, DOLL.shoulderY, 0)
    this.armR.position.set(DOLL.shoulderX, DOLL.shoulderY, 0)
    this.armL.rotation.z = -0.38
    this.armR.rotation.z = 0.38
    this.armL.add(armMeshL)
    this.armR.add(armMeshR)
    this.footL.position.set(-DOLL.footX, 0, 0.02)
    this.footR.position.set(DOLL.footX, 0, 0.02)
    this.bodyPivot.add(this.body, this.headPivot, this.armL, this.armR, this.patch, this.tufts)
    this.root.add(this.bodyPivot, this.footL, this.footR)
    // 只让身体和头投影：小零件的影子看不出来，却各占一次阴影 pass 的 draw call。
    this.body.castShadow = true
    this.head.castShadow = true
    this.headTopLocal = g.headTop

    const rest = (obj: Object3D, radius: number) =>
      this.parts.push({ obj, px: obj.position.x, py: obj.position.y, pz: obj.position.z, rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z, radius })
    rest(this.body, 0.22)
    rest(this.headPivot, 0.24)
    rest(this.armL, 0.08)
    rest(this.armR, 0.08)
    rest(this.footL, 0.02)
    rest(this.footR, 0.02)

    this.blinkAt = 1500 + hash01(id, 3) * 3000
  }

  addTo(scene: Object3D): void {
    scene.add(this.root)
  }

  setRenderOrder(order: number): void {
    this.root.traverse((o) => {
      o.renderOrder = order
    })
  }

  dispose(): void {
    this.root.removeFromParent()
    this.mat.dispose()
  }

  /** 瞬移（开局 / 重生）：重置插值记忆，避免从旧位置「滑」过来。 */
  teleport(x: number, z: number): void {
    this.x = x
    this.z = z
    this.lastX = x
    this.lastZ = z
    this.lastVX = 0
    this.lastVZ = 0
    this.speed = 0
    this.swayX = this.swayZ = this.swayVX = this.swayVZ = 0
  }

  hit(now: number): void {
    this.flashAt = now
    this.wobbleAt = now
    this.hitBarUntil = now + 3000
  }

  /** 死亡：零件四散。seed 决定方向，保证同一次死亡每帧一致。 */
  burst(now: number): void {
    if (this.visual !== 'alive') return
    this.visual = 'burst'
    this.burstAt = now
    this.bodyPivot.position.set(0, 0, 0)
    this.bodyPivot.scale.set(1, 1, 1)
    this.root.rotation.z = 0
    this.root.scale.setScalar(DOLL_SCALE)
    this.patch.visible = false
    this.tufts.visible = false
    for (let i = 0; i < this.parts.length; i++) {
      const a = hash01(this.id * 31 + i, Math.floor(now)) * TAU
      const out = 1.5 + hash01(this.id * 17 + i, 2) * 1.5
      const o = i * 6
      this.burstVel[o] = Math.sin(a) * out
      this.burstVel[o + 1] = 4 + hash01(i, this.id) * 2 + (i === 1 ? 1.5 : 0)
      this.burstVel[o + 2] = Math.cos(a) * out
      this.burstVel[o + 3] = (hash01(i, 7) - 0.5) * 14
      this.burstVel[o + 4] = (hash01(i, 8) - 0.5) * 14
      this.burstVel[o + 5] = (hash01(i, 9) - 0.5) * 14
    }
  }

  /** 重生：零件复位，从上方落下。 */
  drop(now: number): void {
    this.resetParts()
    this.visual = 'alive'
    this.root.visible = true
    this.dropAt = now
  }

  hide(): void {
    this.visual = 'hidden'
    this.root.visible = false
  }

  private resetParts(): void {
    for (const p of this.parts) {
      p.obj.position.set(p.px, p.py, p.pz)
      p.obj.rotation.set(p.rx, p.ry, p.rz)
      p.obj.scale.set(1, 1, 1)
    }
    this.bodyPivot.position.set(0, 0, 0)
    this.bodyPivot.rotation.set(0, 0, 0)
    this.bodyPivot.scale.set(1, 1, 1)
    this.root.scale.setScalar(DOLL_SCALE)
    this.root.rotation.set(0, this.yaw, 0)
  }

  /** 活着且已经上桌（开局错开落下前不算）。 */
  get shown(): boolean {
    return this.visual === 'alive' && this.root.visible
  }

  /** 离地高度（重生下落中），给接触阴影缩放。 */
  get airHeight(): number {
    return this.root.position.y - this.groundY
  }

  /**
   * @param x,z 本帧插值位置
   * @param now viewNow（毫秒）
   * @param dt 表现时钟步长（秒；定帧时为 0）
   */
  update(x: number, z: number, now: number, dt: number, heartStage: number, protectedNow: boolean): void {
    if (this.visual === 'burst') {
      this.updateBurst(now, dt)
      return
    }
    if (this.visual === 'hidden') return
    // 开局摆位时各玩偶错开落下：轮到之前先不露面，免得先站在地上再被「提起来」。
    this.root.visible = now >= this.dropAt

    // 速度与朝向
    if (Number.isNaN(this.lastX)) this.teleport(x, z)
    const dx = x - this.lastX
    const dz = z - this.lastZ
    this.lastX = x
    this.lastZ = z
    this.x = x
    this.z = z
    const d = Math.hypot(dx, dz)
    if (dt > 0) {
      const inst = d / dt
      this.speed += (inst - this.speed) * Math.min(1, dt * 12)
      if (d > 1e-4) {
        this.dirX = dx / d
        this.dirZ = dz / d
        if (inst > 0.3) this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), 18, dt)
      } else if (this.speed < 0.05) {
        this.dirX *= 0.9
        this.dirZ *= 0.9
      }
      // 帽塔弹簧：加速度的反向惯性。20 Hz 快照插值在帧边界会有一帧 d = 0 的空档，
      // 直接对逐帧速度求导会出尖峰，所以先把速度平滑一下再求导。
      const kv = Math.min(1, dt * 14)
      const vx = this.lastVX + (dx / dt - this.lastVX) * kv
      const vz = this.lastVZ + (dz / dt - this.lastVZ) * kv
      const ax = (vx - this.lastVX) / dt
      const az = (vz - this.lastVZ) / dt
      this.lastVX = vx
      this.lastVZ = vz
      const k = 70
      const c = 9
      this.swayVX += (-k * this.swayX - c * this.swayVX - ax * 0.35) * dt
      this.swayVZ += (-k * this.swayZ - c * this.swayVZ - az * 0.35) * dt
      this.swayX = Math.max(-0.3, Math.min(0.3, this.swayX + this.swayVX * dt))
      this.swayZ = Math.max(-0.3, Math.min(0.3, this.swayZ + this.swayVZ * dt))
    }
    this.walkPhase += TAU * d
    const w = clamp01(this.speed / 1.2)
    const t = now / 1000
    const phi = this.walkPhase

    // 身体：颠、挤压拉伸、呼吸
    const bob = Math.abs(Math.sin(phi)) * 0.06 * w
    const squash = 1 - 0.06 * Math.cos(2 * phi) * w
    const breathe = 1 + 0.02 * Math.sin(TAU * 1.2 * t + this.id) * (1 - w)
    const sy = squash * breathe
    const sxz = 1 / Math.sqrt(sy)
    this.bodyPivot.position.y = bob
    this.bodyPivot.scale.set(sxz, sy, sxz)

    // 手脚
    const swing = Math.sin(phi) * w
    this.footL.position.z = 0.02 + swing * 0.08
    this.footR.position.z = 0.02 - swing * 0.08
    this.footL.position.y = Math.max(0, Math.cos(phi)) * 0.04 * w
    this.footR.position.y = Math.max(0, -Math.cos(phi)) * 0.04 * w
    const armSwing = (25 * Math.PI) / 180
    this.armL.rotation.x = -swing * armSwing
    this.armR.rotation.x = swing * armSwing

    // 眨眼
    if (now >= this.blinkAt) {
      const k = now - this.blinkAt
      if (k < 110) this.eyes.scale.y = 0.12
      else {
        this.eyes.scale.y = 1
        this.blinkAt = now + 2500 + hash01(this.id, Math.floor(now)) * 2500
      }
    }

    // 受伤三档
    this.patch.visible = heartStage > 0 && heartStage <= 2
    this.tufts.visible = heartStage === 1
    this.headPivot.rotation.z = heartStage === 1 ? 0.18 : 0

    // 受击晃 + 闪白 + 保护期闪烁（4 Hz）
    const wob = now - this.wobbleAt
    const wobble = wob >= 0 && wob < WOBBLE_MS ? Math.sin(wob * 0.038) * 0.22 * (1 - wob / WOBBLE_MS) : 0
    const fl = now - this.flashAt
    const flash = fl >= 0 && fl < FLASH_MS ? 0.9 * (1 - fl / FLASH_MS) : 0
    this.protectedPulse = protectedNow ? 0.5 + 0.5 * Math.sin(TAU * 4 * t) : 0
    this.mat.emissiveIntensity = Math.max(flash, this.protectedPulse * 0.55)

    // 重生下落 + 落地压扁
    let y = this.groundY
    let rsY = 1
    let rsXZ = 1
    const dropT = now - this.dropAt
    if (dropT >= 0 && dropT < DROP_MS) {
      const u = dropT / DROP_MS
      y += 2.5 * (1 - u * u)
      rsY = 1.08
      rsXZ = 0.95
    } else if (dropT >= DROP_MS && dropT < DROP_MS + SQUASH_MS) {
      const u = (dropT - DROP_MS) / SQUASH_MS
      const s = Math.sin(Math.PI * u)
      rsY = 1 - 0.25 * s
      rsXZ = 1 + 0.12 * s
    }
    this.root.position.set(x, y, z)
    this.root.rotation.set(0, this.yaw, wobble)
    this.root.scale.set(rsXZ * DOLL_SCALE, rsY * DOLL_SCALE, rsXZ * DOLL_SCALE)

    this.root.updateMatrixWorld(true)
    this.headTop.set(0, this.headTopLocal, 0)
    this.headPivot.localToWorld(this.headTop)
    this.headPivot.getWorldQuaternion(this.headQuat)
  }

  /**
   * 领奖台姿势（design §13；不走对局状态机，给领奖台专用的玩偶实例用）：
   * cheer 原地跳跃欢呼（双手高举，每第 4 跳转一圈）、wave 右手挥动、clap 双手身前拍、droop 出局垂头。
   * dropAt 起从 2.5 格高落到 baseY，之前不露面。
   */
  pose(x: number, baseY: number, z: number, yaw: number, now: number, kind: PodiumPoseKind, dropAt: number, glow: number): void {
    if (this.visual !== 'alive') this.visual = 'alive'
    this.root.visible = now >= dropAt
    this.patch.visible = kind === 'droop'
    this.tufts.visible = false
    const t = now / 1000 + hash01(this.id, 9) * 3
    let y = baseY
    let sy = 1
    let sxz = 1
    let spin = 0
    let lean = 0
    let headX = 0
    let headZ = 0
    let armLx = 0
    let armLz = -0.38
    let armRx = 0
    let armRz = 0.38
    let bob = 0
    switch (kind) {
      case 'cheer': {
        const period = 0.85
        const cyc = t / period
        const p = cyc - Math.floor(cyc)
        const air = p < 0.62 ? Math.sin((p / 0.62) * Math.PI) : 0
        y += 0.5 * air
        if (p >= 0.62) {
          const s = Math.sin(((p - 0.62) / 0.38) * Math.PI)
          sy = 1 - 0.16 * s
          sxz = 1 + 0.08 * s
        } else {
          sy = 1 + 0.06 * air
          sxz = 1 - 0.03 * air
        }
        if (Math.floor(cyc) % 4 === 3 && p < 0.62) spin = (p / 0.62) * Math.PI * 2
        const wig = Math.sin(t * Math.PI * 6) * 0.22
        armLz = -2.55 + wig
        armRz = 2.55 + wig
        headX = -0.18 * air
        break
      }
      case 'wave': {
        armRz = 2.35 + 0.42 * Math.sin(t * Math.PI * 4.2)
        armRx = -0.2
        armLz = -0.3
        lean = 0.06 * Math.sin(t * Math.PI * 1.4)
        headZ = -lean * 1.5
        bob = 0.03 * Math.abs(Math.sin(t * Math.PI * 1.4))
        break
      }
      case 'clap': {
        const c = Math.sin(t * Math.PI * 5)
        armLx = -1.25
        armRx = -1.25
        armLz = 0.55 + 0.4 * c
        armRz = -(0.55 + 0.4 * c)
        bob = 0.035 * Math.max(0, -c)
        headX = -0.08
        break
      }
      case 'droop': {
        headX = 0.5
        armLz = -0.12
        armRz = 0.12
        armLx = 0.1
        armRx = 0.1
        sy = 0.94
        lean = 0.04 * Math.sin(t * 1.3)
        break
      }
    }
    // 落下 + 落地压扁（与重生同一套）
    const dropT = now - dropAt
    if (dropT >= 0 && dropT < DROP_MS) {
      const u = dropT / DROP_MS
      y += 2.5 * (1 - u * u)
      sy = 1.08
      sxz = 0.95
    } else if (dropT >= DROP_MS && dropT < DROP_MS + SQUASH_MS) {
      const s = Math.sin(Math.PI * ((dropT - DROP_MS) / SQUASH_MS))
      sy = 1 - 0.25 * s
      sxz = 1 + 0.12 * s
    }
    this.x = x
    this.z = z
    this.yaw = yaw
    this.bodyPivot.position.set(0, bob, 0)
    this.bodyPivot.scale.set(1, 1, 1)
    this.bodyPivot.rotation.set(0, 0, lean)
    this.headPivot.rotation.set(headX, 0, headZ)
    this.armL.rotation.set(armLx, 0, armLz)
    this.armR.rotation.set(armRx, 0, armRz)
    this.footL.position.set(-DOLL.footX, 0, 0.02)
    this.footR.position.set(DOLL.footX, 0, 0.02)
    this.eyes.scale.y = kind === 'cheer' ? 0.45 : kind === 'droop' ? 0.6 : 1
    this.mat.emissiveIntensity = glow
    this.root.position.set(x, y, z)
    this.root.rotation.set(0, yaw + spin, 0)
    this.root.scale.set(sxz * DOLL_SCALE, sy * DOLL_SCALE, sxz * DOLL_SCALE)
    this.root.updateMatrixWorld(true)
    this.headTop.set(0, this.headTopLocal, 0)
    this.headPivot.localToWorld(this.headTop)
    this.headPivot.getWorldQuaternion(this.headQuat)
  }

  private updateBurst(now: number, dt: number): void {
    const t = now - this.burstAt
    if (t >= BURST_HIDE_MS) {
      this.hide()
      return
    }
    const shrink = t > 850 ? Math.max(0, 1 - (t - 850) / (BURST_HIDE_MS - 850)) : 1
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]
      const o = i * 6
      const v = this.burstVel
      const pos = p.obj.position
      if (dt > 0) {
        v[o + 1] += GRAVITY * dt
        pos.x += v[o] * dt
        pos.y += v[o + 1] * dt
        pos.z += v[o + 2] * dt
        const floor = p.radius
        if (pos.y < floor) {
          pos.y = floor
          if (v[o + 1] < 0) {
            // 第一次落地弹一下（0.35），之后贴地滑停
            if (v[o + 1] < -2) v[o + 1] = -v[o + 1] * 0.35
            else v[o + 1] = 0
            v[o] *= 0.55
            v[o + 2] *= 0.55
            v[o + 3] *= 0.5
            v[o + 4] *= 0.5
            v[o + 5] *= 0.5
          }
        }
        p.obj.rotation.x += v[o + 3] * dt
        p.obj.rotation.y += v[o + 4] * dt
        p.obj.rotation.z += v[o + 5] * dt
      }
      p.obj.scale.setScalar(Math.max(0.001, shrink))
    }
    this.mat.emissiveIntensity = 0
    this.root.updateMatrixWorld(true)
  }

  /** 世界空间里身体中心（棉花从这里喷）。 */
  bodyCenter(out: Vector3): Vector3 {
    return out.set(this.x, this.groundY + 0.45, this.z)
  }

  /** 头顶世界位置的只读快照（名牌锚点用）。 */
  labelAnchor(out: Vector3, towerHeight: number): Vector3 {
    _v.copy(this.headTop)
    return out.set(_v.x, _v.y + towerHeight + 0.18, _v.z)
  }
}

export class DollFactory {
  private readonly patch = patchGeometry()
  private readonly tufts = tuftGeometry()

  constructor(private readonly mats: SharedMaterials) {}

  create(id: number, animal: AnimalId, slot: number): Doll {
    return new Doll(id, animal, slot, this.mats, { patch: this.patch, tufts: this.tufts })
  }
}
