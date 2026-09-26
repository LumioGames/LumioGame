import { BoxGeometry, Color, Group, IcosahedronGeometry, Mesh, Quaternion, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  BlockType,
  MatchPhase,
  msToTicks,
  skillParams,
  type BomberCell,
  type BomberEvent,
  type PickupView,
  type PlayerView,
  type SkillId,
  type WorldSnapshot,
} from '../contract'
import type { FeedSample } from '../present/feed'
import { COMBO_FORM, SKILL_COLOR } from '../present/skill-style'
import { cellOf } from '../shared/grid'
import { CameraRig } from './camera'
import { buildDecor } from './geo/decor'
import { ExplosionFx } from './fx/explosion'
import { HatFlyFx } from './fx/hat-fly'
import { ParticlePool } from './fx/particles'
import type { PodiumAnchor, ScreenPoint, ViewOptions } from './index'
import { LabelLayer, type FloatKind, type PlayerTagState } from './labels'
import { chainHitstopMs, chainShakeAmplitude, CAMERA } from './logic/camera-math'
import { CELL_GROW_MS, computeChainDelays, type ChainBomb } from './logic/chain-stagger'
import { effectiveDetonationTicks, type DetonationBomb } from './logic/detonation'
import { DOLL_FIT, dollLayout, localRingPulse, type DollLayout } from './logic/doll-fit'
import { bombBlocked, canPreviewBomb } from './logic/fire-preview'
import {
  diffHatCounts,
  dropLandingOffset,
  HAT_DROP_GAP_MS,
  HAT_LOSS_GAP_MS,
  hatLossTargets,
  towerCount,
  type CellPoint,
  type HatCountSample,
  type HatFlow,
} from './logic/hat-flow'
import { HAT } from './logic/hat-layout'
import { clamp01, easeInOutCubic, heartStage, interpolateXZ, type XZ } from './logic/interp'
import { PODIUM, podiumCameraPose, podiumOrder, podiumSpots, rowsFromResults, type CamPose, type PodiumSpot } from './logic/podium'
import { bombTone, type BombTone } from './logic/bomb-look'
import { hash01 } from './logic/rand'
import { finalCellOf } from './logic/ring'
import { blinkLanding, comboOf, SeenPlayers, SKILL_FX, teleportKind } from './logic/skill-fx'
import { chooseSpectateTarget, type SpectateCandidate } from './logic/spectate'
import { dollStatus, gaitRate, shockTremble, statusTint, STATUS_FX } from './logic/status-fx'
import { Timeline } from './logic/timeline'
import { createSharedMaterials, type SharedMaterials } from './materials'
import { ANIMAL_COLORS, LEAF, SKY, SOFT_BLOCK_COLORS, SUNSHINE, TANGERINE, slotColor } from './palette'
import { RendererHost } from './renderer'
import { createSceneRig, type SceneRig } from './scene'
import { dashedRingTexture, dashTexture, previewTexture, radialTexture, ringTexture, starTexture } from './textures'
import { BombLayer } from './world/bombs'
import { ChestLayer, type ChestDiff } from './world/chests'
import { Doll, DollFactory, type DollFx } from './world/dolls'
import { FireCellLayer, type FireOwner } from './world/fire-cells'
import { GroundMarks } from './world/ground-marks'
import { HatRenderer } from './world/hat-stack'
import { PickupLayer, type PickupOrigin } from './world/pickups'
import { PODIUM_ORDER, PodiumStage } from './world/podium'
import { BombPreview } from './world/preview'
import { RingFog } from './world/ring-fog'
import { SkillFxLayer } from './world/skill-fx'
import { Spotlight } from './world/spotlight'
import { TerrainView3D, type RemovedBrick } from './world/terrain'

/**
 * 视图运行时：每帧 ① 新快照到达时做 id / 地形 diff ② 处理到期事件（只当提示用）③ 按 renderTick 触发爆炸、
 * 砖块弹飞、受击、死亡、重生、宝箱 ④ 表现时间线 ⑤ 逐层重建实例批 ⑥ 镜头 ⑦ 标签 ⑧ 渲染。
 * 一切都能只凭快照 diff 推出来；`proto` / presentationOnly 事件缺席时表现退化但不出错
 * （决赛圈 / 出局 / 宝箱 / 死者掉落全看快照；帽子 = 强化数（ADR 0028），落帽 / 飞帽全看 HatCount 的变化，
 * PickupSpawned(Source='death') 与 PickupView.droppedBy 只用来找飞帽落点）。
 * 结算开头 podiumMs 内是领奖台仪式：对局实体整组隐藏（`world` 组），舞台 + 台上玩偶 + 电影镜头接管。
 * 原型扩展（NON-CONTRACT，ADR 0030 / 0031 / 0032）：角色技能（泡泡 / 冰块 / 组合技形态 / 闪现拖尾 / 火焰光环与火墙 /
 * 被踢炸弹 / 冰冻穿透弹 / 技能糖）、领奖台按 match.results（D2 活到最后者赢）、1×1 决赛圈正中辉光、玩偶脚印 0.7 格。
 * 这些都只读快照里的可选字段，缺席时退化为第 3 轮的表现。
 */

interface PendingBlast {
  id: number
  tick: number
  chainId: number
  owner: number
  cx: number
  cy: number
  up: number
  down: number
  left: number
  right: number
  fuseEnd: number
  dangerUntil: number
  /** 爆炸调色（ADR 0030 / 0033）：橙火 / 冰霜 / 毒绿 / 电黄。 */
  tone: BombTone
}

interface PendingHit {
  id: number
  tick: number
  died: boolean
}

interface HitRecord {
  victim: number
  bomb: number
  chain: number
  tick: number
}

interface DeathRecord {
  id: number
  x: number
  z: number
  tick: number
  burstAt: number
}

const FRAG_COLORS_CRATE = [0xc98f5a, 0x9e6a3c, 0xd49c66]
const CONFETTI_COLORS = [SUNSHINE, TANGERINE, SKY, LEAF, 0xff6fa8, 0xb57bff, 0xffffff]
const FLOAT_MS = 1100
const CINE_IN_SEC = 0.9
const CINE_OUT_SEC = 0.8
/** 1×1 决赛圈正中那格的金色脉动辉光（线性 RGB 由 SUNSHINE 换算）。 */
const FINAL_CELL_GLOW = new Color(SUNSHINE)
/** 回血飘字（原型扩展 NON-CONTRACT，ADR 0030）。 */
const HEAL_TEXT = (hearts: number): string => `+${hearts} 心`
/** 中招飘字（原型扩展 NON-CONTRACT，ADR 0033）。 */
const TOXIN_TEXT = '中毒'
const SHOCK_TEXT = '麻痹'

interface PodiumActor extends PodiumSpot {
  doll: Doll
  hats: number
  crowned: boolean
  isLocal: boolean
  landed: boolean
}

interface Ceremony {
  matchIndex: number
  startNow: number
  actors: PodiumActor[]
  /** 选角时的帽数 / 出局签名；结算头几个 Tick 里还有迟到的落账（最后一 Tick 的击杀），第一个人落位前变了就重排。 */
  sig: string
  nextConfetti: number
  popper: number
  rainSlot: number
}

function ceremonySignature(s: WorldSnapshot): string {
  let out = ''
  for (const p of s.Players) out += `${p.NetEntityIdRaw}:${p.BomberPlayerState.HatCount}:${p.eliminated ? 1 : 0};`
  return out
}

interface FloatText {
  key: number
  id: number
  kind: FloatKind
  text: string
  start: number
}

interface PendingChest {
  kind: 'hit' | 'open'
  id: number
  tick: number
  x: number
  z: number
}

/** 快照 HatCount 变化推出的帽子流向，等 renderTick 走到该 Tick 再演。 */
interface PendingHatFlow extends HatFlow {
  tick: number
}

export class ViewRuntime {
  private readonly host: RendererHost
  private readonly rig: SceneRig
  private readonly cam: CameraRig
  private readonly labels: LabelLayer
  private readonly mats: SharedMaterials
  private readonly terrain: TerrainView3D
  private readonly marks: GroundMarks
  private readonly hats: HatRenderer
  private readonly fly = new HatFlyFx()
  private readonly bombs: BombLayer
  private readonly pickups: PickupLayer
  private readonly spotlight: Spotlight
  private readonly preview: BombPreview
  private readonly blasts: ExplosionFx
  private readonly fragments: ParticlePool
  private readonly cotton: ParticlePool
  private readonly factory: DollFactory
  private readonly dolls = new Map<number, Doll>()
  private readonly timeline = new Timeline()
  /** 对局实体（领奖台期间整组隐藏）；地形、地面贴片、帽子批、棉花留在场景根上与舞台共用。 */
  private readonly world = new Group()
  private readonly fog: RingFog
  private readonly chests: ChestLayer
  private readonly podium: PodiumStage
  private readonly confetti: ParticlePool
  private readonly chestDiff: ChestDiff = { spawned: [], hit: [], opened: [] }
  private readonly chestCells = new Set<number>()
  private readonly detBombs: DetonationBomb[] = []
  private readonly fuseTicks: number
  /** 玩偶脚印（ADR 0032）：缩放、脚圈、接触阴影。 */
  private readonly layout: DollLayout
  private readonly fire: FireCellLayer
  private readonly skillFx: SkillFxLayer
  /** 每位玩家上次看到的 skills.blinkTick（闪现判定）。 */
  private readonly lastBlink = new Map<number, number>()
  /** 视图上次处理过的技能 / 逻辑位置（进化爆发与闪现起点对它 diff，被跳过的快照不丢）。 */
  private readonly seen = new SeenPlayers()
  /** 这一帧快照里刚闪现过的玩家：位置不跨闪现插值。 */
  private readonly blinkSnap = new Set<number>()
  /** 本机闪现落点预览（每个快照算一次）。 */
  private localLanding: { landing: BomberCell; path: BomberCell[] } | null = null
  private localLandingColor = 0xffffff

  private readonly size: number
  private readonly tickMs: number
  private readonly perHeart: number

  // 快照 diff 状态
  private lastCurr: WorldSnapshot | null = null
  private matchIndex = -1
  private readonly prevMap = new Map<number, PlayerView>()
  private readonly currMap = new Map<number, PlayerView>()
  private readonly lastHp = new Map<number, number>()
  private readonly lastTeleport = new Map<number, number>()
  private readonly removed: RemovedBrick[] = []
  /** 上次快照里每位玩家的帽数（= 强化数）。 */
  private readonly lastHats = new Map<number, number>()
  private readonly hatSamples: HatCountSample[] = []
  private readonly hatFlows: HatFlow[] = []
  /** 已见过的糖果 id（找「死者新掉出的强化」用）。 */
  private knownPickups = new Set<number>()
  /** 死者 → 掉出强化的格子（PickupSpawned(Source='death') 事件 + 快照 droppedBy 新糖果），飞帽落点。 */
  private readonly dropCells = new Map<number, CellPoint[]>()
  /** 每位玩家帽塔顶最近一次画出的位置（死亡飞帽的起点）。 */
  private readonly lastTop = new Map<number, { x: number; y: number; z: number }>()

  // 待触发（按 renderTick）
  private pendingBlasts: PendingBlast[] = []
  private pendingBricks: { idx: number; block: number; tick: number }[] = []
  private pendingHits: PendingHit[] = []
  private pendingRespawns: { id: number; tick: number }[] = []
  private readonly triggered = new Set<number>()
  private readonly bombDelay = new Map<number, number>()
  private readonly brickAt = new Map<number, number>()
  private readonly chainHints = new Map<number, number>()
  private hitRecords: HitRecord[] = []
  private deaths: DeathRecord[] = []
  private pendingChest: PendingChest[] = []
  private pendingHatFlows: PendingHatFlow[] = []
  /** 出局顺序：PlayerEliminated.Rank（有则用）+ 快照首见 Tick。 */
  private readonly elim = new Map<number, { tick: number }>()
  private floats: FloatText[] = []
  private floatSeq = 0
  private spectateId = 0
  private lastRenderTick = 0
  private ceremony: Ceremony | null = null
  private lastCeremonyMatch = -1
  private readonly cinePose: CamPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 }
  private cineOut = 0
  private readonly pop = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 }

  private lastViewNow = -1
  private realSec = 0
  private readonly pos: XZ = { x: 0, z: 0 }
  private readonly camQuat = new Quaternion()
  private readonly v3 = new Vector3()
  private readonly tag: PlayerTagState = { name: '', isLocal: false, hats: 0, king: false, pips: -1, visible: true }
  private readonly localTarget = { x: 0, z: 0, dx: 0, dz: 0 }
  private readonly towerH = new Map<number, number>()
  private kingX = 0
  private kingZ = 0

  constructor(private readonly opts: ViewOptions) {
    const { config } = opts
    this.size = config.mapSize
    this.tickMs = 1000 / config.tickRateHz
    this.perHeart = config.healthPointsPerHeart
    this.host = new RendererHost(opts.container)
    this.rig = createSceneRig(this.host.renderer, this.size / 2)
    this.cam = new CameraRig(this.size)
    this.cam.setAspect(this.host.width / this.host.height)
    this.labels = new LabelLayer(opts.labelRoot, this.cam.camera)
    this.mats = createSharedMaterials()
    const scene = this.rig.scene
    const world = this.world
    scene.add(world)
    const radial = radialTexture()
    const star = starTexture()
    this.fuseTicks = msToTicks(config.fuseMs, config.tickRateHz)
    this.terrain = new TerrainView3D(scene, this.mats, this.size)
    this.marks = new GroundMarks(radial, ringTexture(), dashedRingTexture())
    for (const m of this.marks.meshes) scene.add(m)
    this.hats = new HatRenderer(scene, this.mats)
    this.bombs = new BombLayer(world, this.mats, radial, this.fuseTicks, msToTicks(config.dangerWindowMs, config.tickRateHz))
    this.pickups = new PickupLayer(world, this.mats)
    this.spotlight = new Spotlight(world, radial)
    this.preview = new BombPreview(world, previewTexture())
    this.blasts = new ExplosionFx(world, this.mats)
    this.fragments = new ParticlePool(new RoundedBoxGeometry(1, 1, 1, 1, 0.18), this.mats.solid, 512, true)
    this.cotton = new ParticlePool(new IcosahedronGeometry(0.5, 1), this.mats.cotton, 400, false)
    world.add(this.fragments.batch.mesh)
    scene.add(this.cotton.batch.mesh)
    this.fog = new RingFog(world, this.size, dashTexture(), star)
    this.chests = new ChestLayer(world)
    const center = this.size / 2
    this.podium = new PodiumStage(scene, this.mats, radial, star, center, center)
    this.confetti = new ParticlePool(new BoxGeometry(1, 0.1, 0.62), this.mats.solid, 480, false)
    this.confetti.batch.mesh.renderOrder = PODIUM_ORDER
    this.confetti.floorAt = (x, z) => this.podium.floorAt(x, z)
    scene.add(this.confetti.batch.mesh)
    this.layout = dollLayout(opts.rules)
    this.factory = new DollFactory(this.mats, this.layout.scale)
    this.fire = new FireCellLayer(world, this.mats)
    this.skillFx = new SkillFxLayer(world, this.mats, opts.rules.skills)

    const decor = new Mesh(buildDecor(this.size / 2, this.size / 2 + 0.4, 101), this.mats.plastic)
    decor.castShadow = true
    decor.receiveShadow = true
    scene.add(decor)

    // 预热：毒雾、宝箱、领奖台（含压暗层与聚光锥）临时可见，开局前把着色器全编译掉，结算时不卡一下。
    this.fog.warmup(true)
    this.chests.warmup(true)
    this.podium.warmup(true)
    this.fire.warmup(true)
    this.skillFx.warmup(true)
    this.cam.update(0, 0, 0, this.size / 2, this.size / 2, 0, 0, 0)
    this.host.renderer.compile(scene, this.cam.camera)
    this.fog.warmup(false)
    this.chests.warmup(false)
    this.podium.warmup(false)
    this.fire.warmup(false)
    this.skillFx.warmup(false)
  }

  // ---------------------------------------------------------------- 公共面

  toggleOverview(): void {
    this.cam.toggleOverview()
  }

  resize(): void {
    this.host.resize()
    this.cam.setAspect(this.host.width / this.host.height)
  }

  project(x: number, y: number, z: number): ScreenPoint {
    const cam = this.cam.camera
    const v = this.v3.set(x, y, z).applyMatrix4(cam.matrixWorldInverse)
    const w = this.host.width
    const h = this.host.height
    if (v.z >= -1e-3) {
      // 在镜头背后：用相机空间里的方向把点推到屏幕外，边缘箭头据此指向。
      const len = Math.hypot(v.x, v.y) || 1
      const far = Math.max(w, h) * 2
      return { x: w / 2 + (v.x / len) * far, y: h / 2 - (v.y / len) * far, onScreen: false, behind: true }
    }
    v.applyMatrix4(cam.projectionMatrix)
    const sx = (v.x * 0.5 + 0.5) * w
    const sy = (-v.y * 0.5 + 0.5) * h
    return { x: sx, y: sy, onScreen: sx >= 0 && sx <= w && sy >= 0 && sy <= h, behind: false }
  }

  /** 领奖台上前三名的头顶锚点（帽塔之上，世界坐标），给 HUD 放名次牌；不在仪式中返回空数组。 */
  podiumAnchors(): PodiumAnchor[] {
    const c = this.ceremony
    if (!c) return []
    const out: PodiumAnchor[] = []
    for (const a of c.actors) {
      if (a.place > 3) continue
      const th = this.towerH.get(-a.id) ?? 0
      const p = a.doll.labelAnchor(this.v3, th)
      out.push({ place: a.place, id: a.id, x: p.x, y: p.y + 0.35, z: p.z, shown: a.doll.root.visible })
    }
    return out
  }

  dispose(): void {
    this.labels.dispose()
    this.endCeremony()
    for (const d of this.dolls.values()) d.dispose()
    this.dolls.clear()
    this.rig.dispose()
    this.host.dispose()
  }

  // ---------------------------------------------------------------- 每帧

  update(s: FeedSample, dtMs: number): void {
    const now = s.viewNow
    const dt = this.lastViewNow < 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.lastViewNow) / 1000))
    this.lastViewNow = now
    const realDt = Math.min(0.1, Math.max(0, dtMs / 1000))
    this.realSec += realDt
    this.host.monitor(dtMs)

    if (s.curr !== this.lastCurr) this.onFrame(s.prev, s.curr, now)
    this.onEvents(s.dueEvents, now)
    this.triggerDue(s.renderTick, now, s.curr)
    this.updateCeremonyState(s, now, realDt)
    this.timeline.run(now)

    const curr = s.curr
    const cam = this.cam.camera
    cam.getWorldQuaternion(this.camQuat)
    this.marks.begin()
    this.hats.begin()
    this.labels.begin(this.host.width, this.host.height)

    const ceremony = this.ceremony
    if (ceremony) {
      this.updateCeremony(ceremony, curr, now)
    } else {
      this.skillFx.begin()
      this.updateDolls(s, now, dt)
      this.skillFx.end(now, this.marks)
      this.bombs.update(s.renderTick, now, dt, this.camQuat, this.marks, s.alpha)
      this.fire.update(now, s.renderTick, curr.match.tickRateHz, this.marks, this.fireOwner)
      this.updateFinalCell(curr, now)
      this.pickups.update(now, 0, this.marks, s.renderTick, curr.match.tickRateHz)
      this.fly.update(now, this.hats, this.resolveTowerTop, this.onHatLanded, this.onHatLost)
      this.blasts.update(now, this.marks)
      this.chests.update(now, this.marks, this.labels)
      this.fog.update(now, dt, this.camQuat)
      this.updateKing(curr, now, dt)
      this.updatePreview(curr, now, dt)
      this.updateFloats(now)
    }
    this.fragments.update(dt * 1000)
    this.fragments.render()
    this.cotton.update(dt * 1000)
    this.cotton.render()
    this.confetti.update(dt * 1000)
    this.confetti.render()
    this.terrain.update(now, now / 1000)

    this.marks.end()
    this.hats.end()

    const t = this.localTarget
    this.cam.update(dt, realDt, this.realSec, t.x, t.z, t.dx, t.dz, this.opts.settings.shake)
    if (!ceremony) this.updateLabels(curr, now)
    this.labels.end()
    this.host.renderer.render(this.rig.scene, cam)
  }

  // ---------------------------------------------------------------- 快照 diff

  private onFrame(prev: WorldSnapshot, curr: WorldSnapshot, now: number): void {
    const first = this.lastCurr === null
    const newMatch = curr.match.matchIndex !== this.matchIndex
    this.lastCurr = curr
    if (newMatch) {
      this.matchIndex = curr.match.matchIndex
      this.resetMatch()
    }
    const silent = first || newMatch

    this.prevMap.clear()
    for (const p of prev.Players) this.prevMap.set(p.NetEntityIdRaw, p)
    this.currMap.clear()
    for (const p of curr.Players) this.currMap.set(p.NetEntityIdRaw, p)

    // 地形
    this.terrain.sync(curr.Terrain, silent, this.removed)
    for (const r of this.removed) this.pendingBricks.push({ idx: r.idx, block: r.block, tick: curr.Tick })

    // 决赛圈：毒雾 + 强力宝箱（全凭快照；ChestHit / ChestOpened 事件缺席也一样演）
    this.fog.sync(curr.match.finalCircle ?? null, now / 1000, silent)
    const diff = this.chestDiff
    this.chests.sync(curr.Chests ?? [], now, silent, diff)
    for (const c of diff.spawned) this.timeline.add(now + 380, () => this.puffCotton(c.x, 0.2, c.z, 10, 2.2, 0xfff3dc, 0.3))
    for (const c of diff.hit) this.pendingChest.push({ kind: 'hit', id: c.id, tick: curr.Tick, x: c.x, z: c.z })
    for (const c of diff.opened) this.pendingChest.push({ kind: 'open', id: c.id, tick: curr.Tick, x: c.x, z: c.z })
    this.chests.blockers(this.chestCells, this.size)

    // 炸弹 / 爆炸：危险脉冲按连锁感知的预计引爆时刻（被连锁带走的炸弹也提前亮）
    const det = this.detBombs
    det.length = 0
    for (const b of curr.Bombs) {
      const st = b.BomberBombState
      if (st.ExplodedAtTick > 0) continue
      const c = cellOf(b.LogicTransform.WorldPosition.x, b.LogicTransform.WorldPosition.z)
      det.push({ id: b.NetEntityIdRaw, x: c.X, y: c.Y, power: st.Power, fuseEndTick: st.FuseEndTick, pierce: st.PierceLayers ?? 0 })
    }
    const detonateAt = effectiveDetonationTicks(det, curr.Terrain, this.chestCells, this.fuseTicks)
    this.bombs.sync(curr.Bombs, (owner) => this.currMap.get(owner)?.meta.slot ?? 0, now, detonateAt)
    for (const b of curr.Bombs) {
      const st = b.BomberBombState
      if (st.ExplodedAtTick <= 0 || this.triggered.has(b.NetEntityIdRaw)) continue
      if (this.pendingBlasts.some((p) => p.id === b.NetEntityIdRaw)) continue
      const c = cellOf(b.LogicTransform.WorldPosition.x, b.LogicTransform.WorldPosition.z)
      this.pendingBlasts.push({
        id: b.NetEntityIdRaw,
        tick: st.ExplodedAtTick,
        chainId: st.ChainId,
        owner: st.OwnerNetEntityIdRaw,
        cx: c.X,
        cy: c.Y,
        up: st.ReachUp,
        down: st.ReachDown,
        left: st.ReachLeft,
        right: st.ReachRight,
        fuseEnd: st.FuseEndTick,
        dangerUntil: st.DangerUntilTick,
        tone: bombTone(st.BombKind),
      })
    }

    this.pickups.sync(curr.Pickups, now, silent ? undefined : this.pickupOrigin)
    // 死者新掉出的强化（快照 droppedBy）：死亡飞帽的落点。
    const known = new Set<number>()
    for (const pk of curr.Pickups) {
      known.add(pk.NetEntityIdRaw)
      const by = pk.droppedBy ?? 0
      if (silent || by === 0 || this.knownPickups.has(pk.NetEntityIdRaw)) continue
      this.addDropCell(by, pk.LogicTransform.WorldPosition.x, pk.LogicTransform.WorldPosition.z)
    }
    this.knownPickups = known
    // 会烧人的火（火焰光环 / 火墙）：快照 FireZones，缺席 = 没有火。
    this.fire.sync(curr.FireZones ?? [])
    this.blinkSnap.clear()

    // 玩家：受伤 / 死亡 / 瞬移
    for (const p of curr.Players) {
      const id = p.NetEntityIdRaw
      let doll = this.dolls.get(id)
      if (doll && doll.animal !== p.meta.animal) {
        doll.dispose()
        this.dolls.delete(id)
        doll = undefined
      }
      if (!doll) {
        doll = this.factory.create(id, p.meta.animal, p.meta.slot)
        doll.addTo(this.world)
        doll.teleport(p.LogicTransform.WorldPosition.x, p.LogicTransform.WorldPosition.z)
        this.dolls.set(id, doll)
      }
      const hp = p.玩家属性.血量当前
      const prevHp = this.lastHp.get(id)
      if (prevHp !== undefined && hp < prevHp) {
        const died = hp <= 0 && prevHp > 0
        this.pendingHits.push({ id, tick: curr.Tick, died })
        if (died) {
          this.deaths.push({ id, x: p.LogicTransform.WorldPosition.x, z: p.LogicTransform.WorldPosition.z, tick: curr.Tick, burstAt: Number.POSITIVE_INFINITY })
        }
      }
      if (prevHp === undefined && (hp <= 0 || p.eliminated)) doll.hide()
      // 回血（回春 / 血包）：头顶「+N 心」。
      if (!silent && prevHp !== undefined && prevHp > 0 && hp > prevHp) this.addFloat(id, 'heal', HEAL_TEXT(Math.round(((hp - prevHp) / this.perHeart) * 10) / 10))
      this.lastHp.set(id, hp)
      if (p.eliminated && !this.elim.has(id)) this.elim.set(id, { tick: p.eliminatedTick || curr.Tick })
      // 重生两种信号都认：teleportTick 前进（瞬移到出生点），或血量从 ≤0 回到 >0
      // （规则层若在死亡当帧就把人挪走、复活时不再瞬移，只看 teleportTick 会让玩偶一直藏着）。
      // 闪现（blinkTick === teleportTick，或 blinkTick 前进）不是重生：演拖尾 + 原地「啵」，不从天而降。
      const tp = this.lastTeleport.get(id)
      const teleported = tp === undefined || p.teleportTick > tp
      const bt = p.skills?.blinkTick
      const kind = teleportKind(tp, { teleportTick: p.teleportTick, blinkTick: bt, hp, eliminated: p.eliminated }, prevHp, this.lastBlink.get(id))
      if (teleported) this.lastTeleport.set(id, p.teleportTick)
      if (bt !== undefined) this.lastBlink.set(id, bt)
      if (kind === 'blink' && !silent) this.onBlink(id, doll, this.seen.from(id), p, now)
      // 决赛圈出局者不再复活：即使规则层把人挪回出生点，玩偶也不再上桌。
      else if (kind === 'first' || kind === 'respawn') {
        this.pendingRespawns.push({ id, tick: silent ? 0 : teleported ? p.teleportTick : curr.Tick })
      }
      // 进化：新长出的组合技给所有人看（彩纸 + 棉花 + 「进化！」）。
      if (!silent) for (const c of this.seen.combosSince(id, p.skills, this.opts.rules.skills)) this.timeline.add(now, () => this.evolveBurst(id, c))
      this.seen.record(p)
    }
    const local = this.currMap.get(this.opts.localPlayerId)
    this.localLanding = local ? blinkLanding(curr, local, this.opts.rules) : null
    const act = local?.skills?.slots.active
    this.localLandingColor = act ? SKILL_COLOR[act.skill] : 0xffffff
    for (const [id, d] of this.dolls) {
      if (!this.currMap.has(id)) {
        d.dispose()
        this.dolls.delete(id)
        this.lastHp.delete(id)
        this.lastTeleport.delete(id)
        this.lastBlink.delete(id)
        this.seen.delete(id)
      }
    }

    // 帽子 = 强化数（ADR 0028）：HatCount 的变化就是落帽 / 飞帽，等 renderTick 走到这一 Tick 再演。
    const samples = this.hatSamples
    samples.length = 0
    for (const p of curr.Players) {
      samples.push({ id: p.NetEntityIdRaw, hats: p.BomberPlayerState.HatCount, alive: p.玩家属性.血量当前 > 0 && !p.eliminated })
    }
    for (const f of diffHatCounts(this.lastHats, samples, this.hatFlows)) {
      if (!silent && f.kind !== 'shrink') this.pendingHatFlows.push({ ...f, tick: curr.Tick })
    }

    // 旧记录清理
    const horizon = curr.Tick - 3 * this.opts.config.tickRateHz
    if (this.hitRecords.length > 0) this.hitRecords = this.hitRecords.filter((r) => r.tick >= horizon)
    if (this.deaths.length > 0) this.deaths = this.deaths.filter((d) => d.tick >= horizon)
    if (this.dropCells.size > 64) this.dropCells.clear()
    if (this.bombDelay.size > 256) this.bombDelay.clear()
    if (this.triggered.size > 512) {
      const live = new Set(curr.Bombs.map((b) => b.NetEntityIdRaw))
      for (const id of this.triggered) if (!live.has(id)) this.triggered.delete(id)
    }
    if (this.chainHints.size > 512) this.chainHints.clear()
  }

  /** 新糖果从哪来：死者掉落 → 从死者身上沿抛物线弹出 + 死者颜色光环；宝箱喷出 → 从刚开的宝箱弹出。 */
  private readonly pickupOrigin = (p: PickupView): PickupOrigin | null => {
    const x = p.LogicTransform.WorldPosition.x
    const z = p.LogicTransform.WorldPosition.z
    const by = p.droppedBy ?? 0
    if (by !== 0) {
      const victim = this.currMap.get(by) ?? this.prevMap.get(by)
      let death: DeathRecord | undefined
      for (const d of this.deaths) if (d.id === by) death = d
      const fromX = death ? death.x : victim ? victim.LogicTransform.WorldPosition.x : x
      const fromZ = death ? death.z : victim ? victim.LogicTransform.WorldPosition.z : z
      const burst = death && Number.isFinite(death.burstAt) ? death.burstAt : this.lastViewNow + 150
      return { fromX, fromZ, delayMs: Math.max(0, burst - this.lastViewNow) + 40, halo: victim ? slotColor(victim.meta.slot) : 0xffffff }
    }
    for (const c of this.chestDiff.opened) {
      if (Math.abs(c.x - x) + Math.abs(c.z - z) <= 3.01) return { fromX: c.x, fromZ: c.z, delayMs: 60 + 180, halo: -1 }
    }
    return null
  }

  private resetMatch(): void {
    this.endCeremony()
    this.fog.clear()
    this.chests.clear()
    this.pendingChest = []
    this.pendingHatFlows = []
    this.dropCells.clear()
    this.lastTop.clear()
    this.elim.clear()
    this.floats = []
    this.spectateId = 0
    this.timeline.clear()
    this.pendingBlasts = []
    this.pendingBricks = []
    this.pendingHits = []
    this.pendingRespawns = []
    this.hitRecords = []
    this.deaths = []
    this.triggered.clear()
    this.bombDelay.clear()
    this.brickAt.clear()
    this.chainHints.clear()
    this.blasts.clear()
    this.fly.clear()
    this.fragments.clear()
    this.cotton.clear()
    this.bombs.clear()
    this.pickups.clear()
    this.terrain.reset()
    this.lastHp.clear()
    this.lastTeleport.clear()
    this.lastBlink.clear()
    this.seen.clear()
    this.blinkSnap.clear()
    this.localLanding = null
    this.fire.clear()
    this.skillFx.clear()
  }

  private addDropCell(victim: number, x: number, z: number): void {
    let list = this.dropCells.get(victim)
    if (!list) this.dropCells.set(victim, (list = []))
    if (list.length < 32) list.push({ x, z })
  }

  // ---------------------------------------------------------------- 事件（提示）

  private onEvents(events: readonly BomberEvent[], now: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'BombExploded':
          if (e.proto) this.chainHints.set(e.proto.BombNetEntityIdRaw, e.proto.IndexInChain)
          break
        case 'DamageApplied':
          this.hitRecords.push({ victim: e.VictimNetEntityIdRaw, bomb: e.SourceBombNetEntityIdRaw, chain: e.ChainId, tick: e.Tick })
          break
        case 'PickupSpawned':
          // 死者掉出的强化：飞帽落点（与快照 droppedBy 推出的同格会去重）。
          if (e.Source === 'death' && e.DroppedByNetEntityIdRaw !== 0) this.addDropCell(e.DroppedByNetEntityIdRaw, e.Cell.X + 0.5, e.Cell.Y + 0.5)
          break
        case 'PlayerEliminated':
          if (!this.elim.has(e.NetEntityIdRaw)) this.elim.set(e.NetEntityIdRaw, { tick: e.Tick })
          break
        case 'BombKicked':
          // 提示：踢出去的那一格扬一小团灰（滑行本身按快照 kick 插值）。
          this.puffCotton(e.FromCell.X + 0.5, 0.15, e.FromCell.Y + 0.5, 5, 1.4, 0xf3e6c8, 0.18)
          break
        case 'SkillActivated':
          if (e.Skill === 'fireAura' || e.Skill === 'fireDash') this.puffCotton(e.Cell.X + 0.5, 0.3, e.Cell.Y + 0.5, 8, 2.0, SKILL_COLOR[e.Skill], 0.2)
          break
        case 'PlayerPoisoned':
        case 'PlayerShocked': {
          // 中招（ADR 0033）：头顶「中毒」/「麻痹」+ 身上一小团毒绿 / 电黄烟（刷新时也演）。
          const toxin = e.type === 'PlayerPoisoned'
          const id = e.VictimNetEntityIdRaw
          this.addFloat(id, toxin ? 'toxin' : 'shock', toxin ? TOXIN_TEXT : SHOCK_TEXT)
          const d = this.dolls.get(id)
          if (d?.shown) this.puffCotton(d.x, 0.5, d.z, 6, 1.4, toxin ? SKILL_COLOR.toxinBomb : SKILL_COLOR.shockBomb, 0.16)
          break
        }
        case 'PlayerCured': {
          // 解毒（泡泡 / 血包）：身上散一圈白绿小团，绿泡随快照 toxinUntilTick 归零自然停。
          const d = this.dolls.get(e.NetEntityIdRaw)
          if (d?.shown) this.puffCotton(d.x, 0.6, d.z, 6, 1.6, STATUS_FX.toxinTint, 0.16)
          break
        }
        case 'BombExtinguished': {
          // 水上放弹即熄灭：一小团水汽
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2
            this.cotton.spawn({
              x: e.Cell.X + 0.5 + Math.sin(a) * 0.15,
              y: 0.1,
              z: e.Cell.Y + 0.5 + Math.cos(a) * 0.15,
              vx: Math.sin(a) * 0.5,
              vy: 1.4,
              vz: Math.cos(a) * 0.5,
              size: 0.22,
              lifeMs: 700,
              color: 0xdff4fb,
              gravity: 0.6,
              drag: 2.5,
              restitution: 0,
              growMs: 200,
            })
          }
          break
        }
        default:
          break
      }
    }
  }

  // ---------------------------------------------------------------- 按 renderTick 触发

  private triggerDue(renderTick: number, now: number, curr: WorldSnapshot): void {
    const rt = renderTick + 1e-6
    const localId = this.opts.localPlayerId

    // ① 爆炸：同一批到期的按 (ChainId, Tick) 分组排链内顺序，每颗错开 40 ms（封顶 320 ms）
    if (this.pendingBlasts.length > 0) {
      const due = this.pendingBlasts.filter((b) => b.tick <= rt)
      if (due.length > 0) {
        this.pendingBlasts = this.pendingBlasts.filter((b) => b.tick > rt)
        const chainInput: ChainBomb[] = due.map((b) => ({
          id: b.id,
          chainId: b.chainId,
          x: b.cx,
          y: b.cy,
          up: b.up,
          down: b.down,
          left: b.left,
          right: b.right,
          fuseEndTick: b.fuseEnd,
          explodedAtTick: b.tick,
        }))
        const slots = computeChainDelays(chainInput, this.chainHints)
        const chainSummary = new Map<string, { n: number; maxDelay: number; involved: boolean; x: number; z: number }>()
        for (const b of due) {
          const slot = slots.get(b.id)
          const delay = slot?.delayMs ?? 0
          const at = now + delay
          this.triggered.add(b.id)
          this.bombDelay.set(b.id, delay)
          this.bombs.scheduleHide(b.id, at)
          const durMs = Math.max(this.tickMs, (b.dangerUntil - b.tick) * this.tickMs)
          this.blasts.start(b.cx, b.cy, b.up, b.down, b.left, b.right, at, durMs, (b.id * 0.618) % 6.28, b.tone)
          this.markBrick(b.cx, b.cy - b.up - 1, at + (b.up + 1) * CELL_GROW_MS)
          this.markBrick(b.cx, b.cy + b.down + 1, at + (b.down + 1) * CELL_GROW_MS)
          this.markBrick(b.cx - b.left - 1, b.cy, at + (b.left + 1) * CELL_GROW_MS)
          this.markBrick(b.cx + b.right + 1, b.cy, at + (b.right + 1) * CELL_GROW_MS)
          const cx = b.cx + 0.5
          const cz = b.cy + 0.5
          this.timeline.add(at, () => this.puffCotton(cx, 0.45, cz, 6, 1.6, 0xffffff, 0.3))
          const key = `${b.chainId}:${b.tick}`
          let sum = chainSummary.get(key)
          if (!sum) chainSummary.set(key, (sum = { n: slot?.chainLength ?? 1, maxDelay: 0, involved: false, x: cx, z: cz }))
          sum.maxDelay = Math.max(sum.maxDelay, delay)
          if (b.owner === localId) sum.involved = true
          if (this.hitRecords.some((r) => r.victim === localId && r.chain === b.chainId)) sum.involved = true
        }
        const local = this.currMap.get(localId)
        const localHurtNow = this.pendingHits.some((h) => h.id === localId && h.tick <= rt)
        for (const sum of chainSummary.values()) {
          if (sum.n < 3) continue
          const involved = sum.involved || localHurtNow
          let near = false
          if (local) {
            const lx = local.LogicTransform.WorldPosition.x
            const lz = local.LogicTransform.WorldPosition.z
            near = Math.abs(lx - sum.x) + Math.abs(lz - sum.z) < 9
          }
          if (!involved && !near) continue
          const amp = chainShakeAmplitude(sum.n) * (involved ? 1 : 0.5)
          const stop = involved ? chainHitstopMs(sum.n) : 0
          this.timeline.add(now + sum.maxDelay, () => {
            this.cam.shake(amp)
            if (stop > 0) this.opts.requestHitstop(stop)
          })
        }
      }
    }

    // ② 砖块弹飞 + 碎片（拆迁 ≥ 12 格时每块 16 片）
    if (this.pendingBricks.length > 0) {
      const due = this.pendingBricks.filter((b) => b.tick <= rt)
      if (due.length > 0) {
        this.pendingBricks = this.pendingBricks.filter((b) => b.tick > rt)
        const big = due.length >= 12
        for (const b of due) {
          const at = this.brickAt.get(b.idx) ?? now
          this.brickAt.delete(b.idx)
          const idx = b.idx
          const block = b.block
          this.timeline.add(at, () => {
            const color = this.terrain.pop(idx, block, at)
            this.spawnFragments(idx, block, color, big ? 16 : 8)
          })
        }
      }
    }

    // ③ 受击闪白（按来源炸弹的连锁节奏错开）+ 死亡散架
    if (this.pendingHits.length > 0) {
      const due = this.pendingHits.filter((h) => h.tick <= rt)
      if (due.length > 0) {
        this.pendingHits = this.pendingHits.filter((h) => h.tick > rt)
        for (const h of due) {
          const doll = this.dolls.get(h.id)
          if (!doll) continue
          let maxDelay = 0
          let any = false
          for (const r of this.hitRecords) {
            if (r.victim !== h.id || r.tick !== h.tick) continue
            any = true
            const d = this.bombDelay.get(r.bomb) ?? 0
            maxDelay = Math.max(maxDelay, d)
            this.scheduleHit(doll, now + d)
          }
          if (!any) this.scheduleHit(doll, now)
          if (h.died) {
            const burstAt = now + maxDelay + 90
            for (const d of this.deaths) if (d.id === h.id && d.tick === h.tick) d.burstAt = burstAt
            this.timeline.add(burstAt, () => {
              const c = doll.bodyCenter(this.v3)
              const cx = c.x
              const cy = c.y
              const cz = c.z
              doll.burst(burstAt)
              this.puffCotton(cx, cy, cz, 24, 3.2, 0xffffff, 0.34)
              this.puffCotton(cx, cy, cz, 5, 2.2, ANIMAL_COLORS[doll.animal].body, 0.2)
            })
          }
        }
      }
    }

    // ④ 重生 / 开局摆位：从上方落下
    if (this.pendingRespawns.length > 0) {
      const due = this.pendingRespawns.filter((r) => r.tick <= rt)
      if (due.length > 0) {
        this.pendingRespawns = this.pendingRespawns.filter((r) => r.tick > rt)
        for (const r of due) {
          const doll = this.dolls.get(r.id)
          const p = curr.Players.find((q) => q.NetEntityIdRaw === r.id)
          if (!doll || !p || p.玩家属性.血量当前 <= 0 || p.eliminated) continue
          doll.teleport(p.LogicTransform.WorldPosition.x, p.LogicTransform.WorldPosition.z)
          doll.drop(now + (r.tick === 0 ? hash01(r.id, 2) * 300 : 0))
          if (r.id === localId) this.cam.glide(this.realSec + 1.0)
        }
      }
    }

    // ⑤ 帽子流向：吃强化落帽 / 死亡飞帽（快照 HatCount 变化推出）
    if (this.pendingHatFlows.length > 0) {
      const due = this.pendingHatFlows.filter((f) => f.tick <= rt)
      if (due.length > 0) {
        this.pendingHatFlows = this.pendingHatFlows.filter((f) => f.tick > rt)
        for (const f of due) {
          if (f.kind === 'gain') this.dropHats(f.id, f.count, now)
          else if (f.kind === 'loss') this.loseHats(f.id, f.count, now)
        }
      }
    }

    // ⑥ 强力宝箱：挨打晃一下 / 开箱喷彩纸（跟在同 Tick 爆炸的连锁节奏后面）
    if (this.pendingChest.length > 0) {
      const due = this.pendingChest.filter((c) => c.tick <= rt)
      if (due.length > 0) {
        this.pendingChest = this.pendingChest.filter((c) => c.tick > rt)
        for (const c of due) {
          const at = now + 60
          if (c.kind === 'hit') {
            this.chests.shake(c.id, at)
            this.timeline.add(at, () => this.puffCotton(c.x, 0.6, c.z, 5, 1.8, 0xfff3dc, 0.2))
          } else {
            this.chests.open(c.id, at)
            this.timeline.add(at, () => this.chestBurst(c.x, c.z))
          }
        }
      }
    }
  }

  /** 吃强化：count 顶帽子依次从帽塔顶上方落下（最多演 6 顶，其余直接算进塔里）。 */
  private dropHats(id: number, count: number, now: number): void {
    const doll = this.dolls.get(id)
    if (!doll || !doll.shown) return
    const n = Math.min(count, 6)
    for (let i = 0; i < n; i++) this.fly.dropOn(id, now + i * HAT_DROP_GAP_MS, 2.5 + hash01(id, this.floatSeq + i) * 3)
  }

  /**
   * 死亡掉强化：count 顶帽子等玩偶散架后从帽塔顶（从上往下一顶顶）飞向掉出的强化所在格；
   * 落点优先用 PickupSpawned(Source='death') / 快照 droppedBy，不够时飞向死亡点附近的格子（最多演 12 顶）。
   */
  private loseHats(id: number, count: number, now: number): void {
    let death: DeathRecord | undefined
    for (const d of this.deaths) if (d.id === id) death = d
    const top = this.lastTop.get(id)
    const p = this.currMap.get(id)
    const x = top?.x ?? death?.x ?? p?.LogicTransform.WorldPosition.x
    const z = top?.z ?? death?.z ?? p?.LogicTransform.WorldPosition.z
    if (x === undefined || z === undefined) return
    const y = top?.y ?? 1.3
    const n = Math.min(count, 12)
    const targets = hatLossTargets(n, this.dropCells.get(id) ?? [], death?.x ?? x, death?.z ?? z, id * 131 + this.lastRenderTick, this.size)
    this.dropCells.delete(id)
    const launch = Math.max(now, death && Number.isFinite(death.burstAt) ? death.burstAt : now + 120)
    for (let i = 0; i < n; i++) {
      const t = targets[i]
      const fy = Math.max(0.9, y - i * HAT.spacing)
      this.fly.lose(id, x, fy, z, t.x, t.z, launch + i * HAT_LOSS_GAP_MS, 6 + hash01(id, i + 17) * 8)
    }
  }

  /** 落帽的落点：头顶帽塔顶（跟着人走）。 */
  private readonly resolveTowerTop = (id: number, out: { x: number; y: number; z: number }): boolean => {
    const doll = this.dolls.get(id)
    if (!doll || !doll.shown) return false
    const th = this.towerH.get(id) ?? 0
    out.x = doll.headTop.x
    out.y = doll.headTop.y + dropLandingOffset(th)
    out.z = doll.headTop.z
    return true
  }

  /** 落帽落上塔顶：「+1」飘字 + 一小团金色棉花。 */
  private readonly onHatLanded = (id: number): void => {
    this.addFloat(id, 'hat', '+1')
    const doll = this.dolls.get(id)
    if (doll && doll.shown) {
      const th = this.towerH.get(id) ?? 0
      this.puffCotton(doll.headTop.x, doll.headTop.y + th, doll.headTop.z, 5, 1.2, SUNSHINE, 0.14)
    }
  }

  /** 飞帽落到掉出的强化上：「啵」一小团棉花。 */
  private readonly onHatLost = (x: number, z: number): void => {
    this.puffCotton(x, 0.35, z, 4, 1.0, 0xfff3dc, 0.16)
  }

  private chestBurst(x: number, z: number): void {
    this.confettiBurst(x, 0.7, z, 0, 1, 0, 46, 5.5, 1.1)
    this.puffCotton(x, 0.6, z, 10, 2.6, SUNSHINE, 0.2)
    this.puffCotton(x, 0.5, z, 8, 2.0, 0xffffff, 0.3)
    this.cam.shake(0.06)
  }

  /** 彩纸：从 (x, y, z) 沿 (dx, dy, dz) 喷出 n 片；spread = 横向散开。 */
  private confettiBurst(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    n: number,
    speed: number,
    spread: number,
    colors: readonly number[] = CONFETTI_COLORS,
  ): void {
    const seed = Math.floor(this.lastViewNow) + Math.floor(x * 97 + z * 31)
    for (let i = 0; i < n; i++) {
      const a = hash01(i, seed) * Math.PI * 2
      const r = hash01(i + 31, seed) * spread
      const sp = speed * (0.65 + hash01(i + 57, seed) * 0.6)
      this.confetti.spawn({
        x,
        y,
        z,
        vx: dx * sp + Math.cos(a) * r * 2,
        vy: dy * sp + hash01(i + 5, seed) * 1.5,
        vz: dz * sp + Math.sin(a) * r * 2,
        size: 0.13 + hash01(i + 9, seed) * 0.05,
        sy: 0.12,
        sz: 0.62,
        lifeMs: 2400 + hash01(i + 13, seed) * 1400,
        color: colors[i % colors.length],
        gravity: -3.4,
        drag: 1.7,
        restitution: 0,
        spin: 7 + hash01(i + 17, seed) * 7,
      })
    }
  }

  private markBrick(x: number, y: number, at: number): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const idx = y * this.size + x
    const prev = this.brickAt.get(idx)
    if (prev === undefined || at < prev) this.brickAt.set(idx, at)
  }

  private scheduleHit(doll: Doll, at: number): void {
    const localId = this.opts.localPlayerId
    this.timeline.add(at, () => {
      doll.hit(at)
      const c = doll.bodyCenter(this.v3)
      this.puffCotton(c.x, c.y + 0.1, c.z, 3, 1.4, 0xffffff, 0.2)
      if (doll.id === localId) this.cam.shake(CAMERA.selfHitShake)
    })
  }

  private puffCotton(x: number, y: number, z: number, n: number, speed: number, color: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(i, Math.floor(x * 7 + z * 13)) * 0.8
      const up = 0.4 + hash01(i, Math.floor(x * 3 + z)) * 0.8
      const sp = speed * (0.5 + hash01(i + 7, Math.floor(z * 5)) * 0.6)
      this.cotton.spawn({
        x,
        y,
        z,
        vx: Math.sin(a) * sp,
        vy: up * speed,
        vz: Math.cos(a) * sp,
        size: size * (0.7 + hash01(i, 3) * 0.6),
        lifeMs: 700 + hash01(i, 4) * 500,
        color,
        gravity: -3.5,
        drag: 3.2,
        restitution: 0,
        growMs: 90,
        spin: 3,
      })
    }
  }

  private spawnFragments(idx: number, block: number, color: number, n: number): void {
    const x = (idx % this.size) + 0.5
    const z = Math.floor(idx / this.size) + 0.5
    const crate = block === BlockType.木箱
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(idx, i) * 0.6
      const out = 1.5 + hash01(idx + i, 1) * 1.5
      const c = crate ? FRAG_COLORS_CRATE[i % 3] : i % 4 === 3 ? SOFT_BLOCK_COLORS[(idx + i) % 4] : color
      this.fragments.spawn({
        x: x + Math.sin(a) * 0.2,
        y: 0.45,
        z: z + Math.cos(a) * 0.2,
        vx: Math.sin(a) * out,
        vy: 4 + hash01(idx, i + 9) * 2,
        vz: Math.cos(a) * out,
        size: crate ? 0.2 : 0.17,
        sx: crate ? 1.6 : 1,
        sy: crate ? 0.35 : 1,
        sz: crate ? 0.5 : 1,
        lifeMs: 900,
        color: c,
        gravity: -18,
        restitution: 0.35,
        spin: 9,
      })
    }
    this.puffCotton(x, 0.4, z, 3, 1.2, 0xfff3dc, 0.24)
  }

  // ---------------------------------------------------------------- 逐帧层

  private updateDolls(s: FeedSample, now: number, dt: number): void {
    const { curr, prev, alpha, renderTick } = s
    this.lastRenderTick = renderTick
    const localId = this.opts.localPlayerId
    const kingId = curr.BomberMatchState.HatKingNetEntityIdRaw
    const pillarMin = this.opts.rules.hatKingPillarMinHats
    let localSeen = false
    for (const p of curr.Players) {
      const doll = this.dolls.get(p.NetEntityIdRaw)
      if (!doll) continue
      // 出局者散架演完就不再露面（死亡记录还在 = 散架还没演，先别藏）。
      if (p.eliminated && doll.visual === 'alive' && !this.deaths.some((d) => d.id === p.NetEntityIdRaw)) doll.hide()
      // 刚闪现过：不跨闪现插值（规则层没推进 teleportTick 时也不「滑」3 格）。
      const prevP = this.blinkSnap.has(p.NetEntityIdRaw) ? undefined : this.prevMap.get(p.NetEntityIdRaw)
      interpolateXZ(this.pos, prevP ? xz(prevP) : undefined, xz(p), p.teleportTick, prev.Tick, alpha)
      const inWater = this.terrain.groundAt(Math.floor(this.pos.x), Math.floor(this.pos.z)) === BlockType.水
      doll.groundY += ((inWater ? -0.1 : 0) - doll.groundY) * Math.min(1, dt * 10)
      const hp = p.玩家属性.血量当前
      const stage = heartStage(hp, this.perHeart)
      const prot = renderTick < p.BomberPlayerState.ProtectedUntilTick
      const sk = p.skills
      const combo = comboOf(sk, this.opts.rules.skills)
      const form = combo ? COMBO_FORM[combo] : undefined
      const st = dollStatus(sk, renderTick)
      this.dollFx.frozen = st.frozen
      this.dollFx.tint = statusTint(st)
      this.dollFx.gait = gaitRate(st)
      this.dollFx.tremble = st.shocked && !st.frozen ? shockTremble(now / 1000, p.NetEntityIdRaw) : 0
      this.dollFx.glow = form ? form.glow * (0.75 + 0.25 * Math.sin((now / 1000) * Math.PI * 2)) : 0
      this.dollFx.glowColor = form?.ring
      doll.update(this.pos.x, this.pos.z, now, dt, stage, prot, this.dollFx)
      this.skillFx.player(doll, sk, renderTick, curr.match.tickRateHz, now)

      const isLocal = p.NetEntityIdRaw === localId
      if (isLocal) {
        localSeen = true
        const t = this.localTarget
        t.x = doll.x
        t.z = doll.z
        const k = Math.min(1, doll.speed / 2)
        t.dx = doll.dirX * k
        t.dz = doll.dirZ * k
      }
      if (!doll.shown) continue
      // 脚印（ADR 0032）：接触阴影画在插值后的逻辑位置上；脚圈外沿 = 0.7 格，本机只往里呼吸。
      const L = this.layout
      this.marks.shadow(doll.x, doll.z, L.shadow, doll.airHeight)
      const color = slotColor(p.meta.slot)
      if (isLocal) {
        this.marks.ring(doll.x, doll.z, L.ringQuad * localRingPulse(now), color, DOLL_FIT.localRingAlpha)
        if (this.localLanding) this.skillFx.landing(this.localLanding, this.localLandingColor, now, this.marks)
      } else {
        this.marks.ring(doll.x, doll.z, L.ringQuad, color, DOLL_FIT.otherRingAlpha)
      }
      if (prot) this.marks.dashedRing(doll.x, doll.z, L.protectRing, 0xffffff, 0.9, now * 0.002)
    }
    if (!localSeen) {
      this.localTarget.dx = 0
      this.localTarget.dz = 0
    }
    this.updateSpectate(curr, kingId)
    // 帽塔（在玩偶矩阵更新之后）；落帽还在路上时先不长高，飞帽起飞前先不变矮。
    for (const p of curr.Players) {
      const doll = this.dolls.get(p.NetEntityIdRaw)
      if (!doll || !doll.shown) continue
      const id = p.NetEntityIdRaw
      const king = id === kingId && kingId !== 0
      const n = this.shownHats(p, renderTick, now)
      const crowned = king && n >= pillarMin
      const th = this.hats.tower(n, doll.headTop, doll.headQuat, doll.swayX, doll.swayZ, crowned)
      this.towerH.set(id, th)
      let top = this.lastTop.get(id)
      if (!top) this.lastTop.set(id, (top = { x: 0, y: 0, z: 0 }))
      top.x = doll.headTop.x
      top.y = doll.headTop.y + Math.max(0, th - HAT.height)
      top.z = doll.headTop.z
    }
  }

  /**
   * 画面上显示的帽数：跟渲染时钟对齐（渲染还没走到最新快照的 Tick 时用上一帧的值，免得先长高再被落帽「补」一次），
   * 扣掉还在往下落的落帽，加回还没起飞的死亡飞帽。
   */
  private shownHats(p: PlayerView, renderTick: number, now: number): number {
    const id = p.NetEntityIdRaw
    const src = renderTick + 1e-6 >= (this.lastCurr?.Tick ?? 0) ? p : (this.prevMap.get(id) ?? p)
    return towerCount(src.BomberPlayerState.HatCount, this.fly.inbound(id), this.fly.heldBack(id, now))
  }

  /** 本机决赛圈出局 → 观战：镜头跟帽王（或离镜头最近的存活者）；V 俯瞰照常切换。 */
  private updateSpectate(curr: WorldSnapshot, kingId: number): void {
    const localId = this.opts.localPlayerId
    const local = this.currMap.get(localId)
    if (!local || !local.eliminated || curr.BomberMatchState.Phase === MatchPhase.Settlement) {
      this.spectateId = 0
      return
    }
    const cands: SpectateCandidate[] = []
    for (const p of curr.Players) {
      const d = this.dolls.get(p.NetEntityIdRaw)
      cands.push({
        id: p.NetEntityIdRaw,
        x: d ? d.x : p.LogicTransform.WorldPosition.x,
        z: d ? d.z : p.LogicTransform.WorldPosition.z,
        followable: !p.eliminated && p.玩家属性.血量当前 > 0 && !!d && d.shown,
      })
    }
    const look = this.cam.lookTarget
    const id = chooseSpectateTarget(cands, kingId, localId, this.spectateId, look.x, look.z)
    if (id !== this.spectateId) {
      this.cam.glide(this.realSec + 0.9)
      this.spectateId = id
    }
    const d = id !== 0 ? this.dolls.get(id) : undefined
    if (!d) return
    const t = this.localTarget
    const k = Math.min(1, d.speed / 2)
    t.x = d.x
    t.z = d.z
    t.dx = d.dirX * k
    t.dz = d.dirZ * k
  }

  /** 「+N」飘字：跟着人头顶走，1.1 s 上浮淡出。 */
  private updateFloats(now: number): void {
    if (this.floats.length === 0) return
    let keep = 0
    for (const f of this.floats) {
      const u = (now - f.start) / FLOAT_MS
      if (u >= 1) continue
      this.floats[keep++] = f
      const doll = this.dolls.get(f.id)
      if (!doll || !doll.shown) continue
      const th = this.towerH.get(f.id) ?? 0
      const a = doll.labelAnchor(this.v3, th)
      this.labels.setFloat(f.key, f.kind, f.text, a.x, a.y + 0.45, a.z, u)
    }
    this.floats.length = keep
  }

  // ---------------------------------------------------------------- 领奖台（design §13）

  private updateCeremonyState(s: FeedSample, now: number, realDt: number): void {
    const curr = s.curr
    const ms = curr.BomberMatchState
    const settling = ms.Phase === MatchPhase.Settlement && s.renderTick + 1e-6 >= ms.EndTick
    if (this.ceremony && (!settling || this.ceremony.matchIndex !== curr.match.matchIndex)) this.endCeremony()
    if (!this.ceremony && settling && this.lastCeremonyMatch !== curr.match.matchIndex && curr.Players.length > 0) {
      this.beginCeremony(curr, s.renderTick, now)
    }
    const c = this.ceremony
    const pose = this.cinePose
    if (c) {
      const t = (now - c.startNow) / 1000
      podiumCameraPose(t, this.opts.rules.podiumMs / 1000, this.host.width / this.host.height, pose)
      const center = this.size / 2
      pose.px += center
      pose.pz += center
      pose.lx += center
      pose.lz += center
      this.cineOut = 1
      this.cam.setCinematic(pose, easeInOutCubic(clamp01(t / CINE_IN_SEC)))
    } else if (this.cineOut > 0) {
      // 回到对局镜头：从领奖台机位缓出。
      this.cineOut = Math.max(0, this.cineOut - realDt / CINE_OUT_SEC)
      this.cam.setCinematic(this.cineOut > 0 ? pose : null, easeInOutCubic(this.cineOut))
    }
  }

  private beginCeremony(curr: WorldSnapshot, renderTick: number, now: number): void {
    const t0 = Math.max(0, ((renderTick - curr.BomberMatchState.EndTick) * this.tickMs) / 1000)
    this.ceremony = { matchIndex: curr.match.matchIndex, startNow: now - t0 * 1000, actors: [], sig: '', nextConfetti: 0, popper: 0, rainSlot: -1 }
    this.castCeremony(this.ceremony, curr, t0)
    this.lastCeremonyMatch = curr.match.matchIndex
    // 对局实体整组隐藏；进行中的对局特效清掉，别飘到舞台上。
    this.world.visible = false
    this.cotton.clear()
    this.fragments.clear()
    this.confetti.clear()
    this.fly.clear()
    this.floats = []
  }

  /** 名次 → 台上站位与玩偶。 */
  private castCeremony(c: Ceremony, curr: WorldSnapshot, t: number): void {
    for (const a of c.actors) a.doll.dispose()
    c.actors = []
    c.sig = ceremonySignature(curr)
    const byId = new Map<number, PlayerView>()
    for (const p of curr.Players) byId.set(p.NetEntityIdRaw, p)
    // 名次（D2 活到最后者赢，ADR 0031）：规则层给了 match.results 就照它站位，否则按同一个 rankMatch 自己排。
    const results = curr.match.results
    const rows = results
      ? rowsFromResults(results)
      : podiumOrder(
          curr.Players.map((p) => ({
            id: p.NetEntityIdRaw,
            hats: p.BomberPlayerState.HatCount,
            eliminated: p.eliminated,
            elimTick: p.eliminatedTick || this.elim.get(p.NetEntityIdRaw)?.tick,
          })),
        )
    const localId = this.opts.localPlayerId
    for (const spot of podiumSpots(rows)) {
      const p = byId.get(spot.id)
      if (!p) continue
      const doll = this.factory.create(spot.id, p.meta.animal, p.meta.slot)
      doll.addTo(this.rig.scene)
      doll.setRenderOrder(PODIUM_ORDER)
      doll.root.visible = false
      const hats = p.BomberPlayerState.HatCount
      // 皇冠 = 名次第 1（并列第 1 都戴；0 顶帽的唯一幸存者也戴，ADR 0031）。
      c.actors.push({ ...spot, doll, hats, crowned: spot.rank === 1, isLocal: spot.id === localId, landed: t > spot.dropSec + 0.6 })
    }
  }

  private endCeremony(): void {
    const c = this.ceremony
    if (!c) return
    for (const a of c.actors) {
      a.doll.dispose()
      this.towerH.delete(-a.id)
    }
    this.ceremony = null
    this.podium.hide()
    this.world.visible = true
    this.confetti.clear()
  }

  private updateCeremony(c: Ceremony, curr: WorldSnapshot, now: number): void {
    const t = (now - c.startNow) / 1000
    if (t < PODIUM.rowDropSec - 0.05 && ceremonySignature(curr) !== c.sig) this.castCeremony(c, curr, t)
    const center = this.size / 2
    const winner = c.actors.find((a) => a.place === 1)
    const spot = winner ? clamp01((t - winner.dropSec - 0.25) / 0.5) : 0
    this.podium.update(
      { rise: t / PODIUM.riseSec, dim: clamp01(t / 0.8), spot, winnerX: winner?.x ?? 0, winnerY: winner?.y ?? 0, winnerZ: winner?.z ?? 0 },
      now,
      this.camQuat,
      this.marks,
    )
    const lift = this.podium.lift
    const localId = this.opts.localPlayerId
    for (const a of c.actors) {
      const x = center + a.x
      const y = a.y + lift
      const z = center + a.z
      const dropAt = c.startNow + a.dropSec * 1000
      // 台上的人微微转向舞台中线，台下一排正对镜头。
      const yaw = a.place === 2 ? 0.22 : a.place === 3 ? -0.22 : 0
      const glow = a.place === 1 ? spot * (0.05 + 0.03 * Math.sin(now * 0.006)) : 0
      const doll = a.doll
      doll.pose(x, y, z, yaw, now, a.pose, dropAt, glow)
      if (!doll.root.visible) continue
      if (!a.landed && now >= dropAt + 320) {
        a.landed = true
        this.puffCotton(x, y + 0.1, z, a.place <= 3 ? 12 : 6, 2.2, 0xfff3dc, a.place <= 3 ? 0.26 : 0.18)
        if (a.place === 1) {
          for (let i = 0; i < 4; i++) {
            this.podium.popper(i, this.pop)
            this.confettiBurst(this.pop.x, this.pop.y, this.pop.z, this.pop.dx, this.pop.dy, this.pop.dz, 40, 8, 0.5)
          }
          this.confettiBurst(x, y + 2.6, z, 0, 1, 0, 50, 3.5, 1.4)
          this.cam.shake(0.08)
          c.nextConfetti = now + 1700
        }
      }
      const airborne = doll.root.position.y - y
      this.marks.shadow(x, z, 0.9, airborne, 1, y + 0.012)
      if (a.isLocal) {
        const pulse = 1 + 0.05 * Math.sin((now / 1000) * Math.PI * 2)
        this.marks.ring(x, z, 1.02 * pulse, slotColor(0), 0.95, 0, y + 0.02)
      }
      const th = this.hats.tower(a.hats, doll.headTop, doll.headQuat, 0, 0, a.crowned)
      this.towerH.set(-a.id, th)
      if (a.isLocal) {
        const tag = this.tag
        tag.isLocal = true
        tag.name = '你'
        tag.hats = a.hats
        tag.king = a.crowned
        tag.pips = -1
        tag.visible = true
        const p = doll.labelAnchor(this.v3, th)
        this.labels.setPlayer(localId, tag, p.x, p.y, p.z)
      }
    }
    // 冠军落位后：四角礼花筒轮流喷，头顶一直飘一点彩纸雨。
    if (winner && winner.landed) {
      if (now >= c.nextConfetti) {
        this.podium.popper(c.popper++, this.pop)
        this.confettiBurst(this.pop.x, this.pop.y, this.pop.z, this.pop.dx, this.pop.dy, this.pop.dz, 30, 7.5, 0.45)
        c.nextConfetti = now + 1500
      }
      const slot = Math.floor(now / 110)
      if (slot !== c.rainSlot) {
        c.rainSlot = slot
        const rx = center + winner.x + (hash01(slot, 1) - 0.5) * 3.2
        const rz = center + winner.z + (hash01(slot, 2) - 0.5) * 2
        this.confettiBurst(rx, winner.y + lift + 4.5, rz, 0, -0.2, 0, 2, 1, 0.3)
      }
    }
  }

  private updateLabels(curr: WorldSnapshot, now: number): void {
    const localId = this.opts.localPlayerId
    const kingId = curr.BomberMatchState.HatKingNetEntityIdRaw
    for (const p of curr.Players) {
      const doll = this.dolls.get(p.NetEntityIdRaw)
      if (!doll) continue
      const tag = this.tag
      const alive = doll.shown
      tag.isLocal = p.NetEntityIdRaw === localId
      tag.name = tag.isLocal ? '你' : p.meta.name
      tag.hats = this.shownHats(p, this.lastRenderTick, now)
      tag.king = kingId !== 0 && p.NetEntityIdRaw === kingId
      tag.pips = now < doll.hitBarUntil && alive ? heartStage(p.玩家属性.血量当前, this.perHeart) : -1
      tag.visible = alive
      const th = this.towerH.get(p.NetEntityIdRaw) ?? 0
      const a = doll.labelAnchor(this.v3, th)
      this.labels.setPlayer(p.NetEntityIdRaw, tag, a.x, a.y, a.z)
    }
  }

  private updateKing(curr: WorldSnapshot, now: number, dt: number): void {
    const kingId = curr.BomberMatchState.HatKingNetEntityIdRaw
    let active = false
    let x = 0
    let z = 0
    if (kingId !== 0) {
      const p = this.currMap.get(kingId)
      const doll = this.dolls.get(kingId)
      if (p && doll && doll.visual === 'alive' && p.玩家属性.血量当前 > 0 && p.BomberPlayerState.HatCount >= this.opts.rules.hatKingPillarMinHats) {
        active = true
        x = doll.x
        z = doll.z
      }
    }
    if (active) {
      this.kingX = x
      this.kingZ = z
    }
    const endgame = curr.BomberMatchState.Phase === 2
    this.spotlight.update(active, this.kingX, this.kingZ, now, dt, endgame, this.camQuat, this.marks)
  }

  // ---------------------------------------------------------------- 技能（原型扩展 NON-CONTRACT，ADR 0030）

  /** 光环主人此刻的表现位置 + 逻辑格（火苗跟着插值后的熊走）。 */
  private readonly fireOwner = (id: number): FireOwner | null => {
    const doll = this.dolls.get(id)
    const p = this.currMap.get(id)
    if (!doll || !p || !doll.shown) return null
    return { x: doll.x, z: doll.z, cellX: Math.floor(p.LogicTransform.WorldPosition.x), cellY: Math.floor(p.LogicTransform.WorldPosition.z) }
  }

  private readonly dollFx: Required<Omit<DollFx, 'glowColor'>> & Pick<DollFx, 'glowColor'> = {
    frozen: false,
    glow: 0,
    glowColor: undefined,
    tint: 0xffffff,
    gait: 1,
    tremble: 0,
  }

  /** 闪现 / 冲刺：起点 → 落点拖尾 + 两头各一团棉花 + 原地「啵」；本机镜头短滑。不走重生的从天而降。 */
  private onBlink(id: number, doll: Doll, from: XZ | undefined, p: PlayerView, now: number): void {
    const toX = p.LogicTransform.WorldPosition.x
    const toZ = p.LogicTransform.WorldPosition.z
    const fromX = from ? from.x : doll.x
    const fromZ = from ? from.z : doll.z
    const skill: SkillId = p.skills?.slots.active?.skill ?? 'blink'
    const color = SKILL_COLOR[skill]
    this.blinkSnap.add(id)
    this.skillFx.trail(fromX, fromZ, toX, toZ, now, color)
    this.puffCotton(fromX, 0.4, fromZ, 6, 1.6, color, 0.2)
    this.puffCotton(toX, 0.4, toZ, 6, 1.6, 0xffffff, 0.22)
    doll.teleport(toX, toZ)
    doll.blinkIn(now)
    if (id === this.opts.localPlayerId) this.cam.glide(this.realSec + SKILL_FX.blinkGlide)
  }

  /** 进化爆发（所有人可见）：组合技配色的彩纸 + 棉花 + 头顶「进化！」。 */
  private evolveBurst(id: number, combo: SkillId): void {
    const doll = this.dolls.get(id)
    if (!doll || !doll.shown) return
    const form = COMBO_FORM[combo]
    const colors = form ? [form.ring, form.orb, 0xffffff] : CONFETTI_COLORS
    const top = doll.headTop
    this.confettiBurst(top.x, top.y + 0.3, top.z, 0, 1, 0, SKILL_FX.evolveConfetti, 4.5, 0.9, colors)
    this.puffCotton(doll.x, 0.5, doll.z, 10, 2.4, form?.ring ?? 0xffffff, 0.24)
    this.addFloat(id, 'evolve', '进化！')
  }

  private addFloat(id: number, kind: FloatKind, text: string): void {
    this.floats.push({ key: ++this.floatSeq, id, kind, text, start: this.lastViewNow })
  }

  /** 决赛圈缩到 1×1（D7）：正中那格金色脉动辉光，预告期就亮。 */
  private updateFinalCell(curr: WorldSnapshot, now: number): void {
    const c = finalCellOf(curr.match.finalCircle)
    if (!c) return
    const k = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 1.2)
    const g = FINAL_CELL_GLOW
    this.marks.glowAt(c.X + 0.5, c.Y + 0.5, 1.1 + 0.25 * k, g.r * 1.5, g.g * 1.5, g.b * 1.5, 0.35 + 0.35 * k)
    this.marks.dashedRing(c.X + 0.5, c.Y + 0.5, 1.15, SUNSHINE, 0.55 + 0.35 * k, -now * 0.0015)
  }

  private updatePreview(curr: WorldSnapshot, now: number, dt: number): void {
    const p = this.currMap.get(this.opts.localPlayerId)
    let show = false
    let cx = 0
    let cy = 0
    let power = 0
    let pierce = 0
    if (p) {
      // 契约 §1.2 所在格：数学 floor（与 shared/grid.cellOf 同义，这里内联免得每帧分配）
      cx = Math.floor(p.LogicTransform.WorldPosition.x)
      cy = Math.floor(p.LogicTransform.WorldPosition.z)
      power = p.玩家属性.火力当前
      const sk = p.skills
      const bombSlot = sk?.slots.bomb
      pierce = bombSlot ? skillParams(this.opts.rules.skills, bombSlot.skill, bombSlot.level).pierceLayers : 0
      let cellHasBomb = false
      for (const b of curr.Bombs) {
        if (Math.floor(b.LogicTransform.WorldPosition.x) === cx && Math.floor(b.LogicTransform.WorldPosition.z) === cy) {
          cellHasBomb = true
          break
        }
      }
      show =
        this.dolls.get(p.NetEntityIdRaw)?.visual === 'alive' &&
        canPreviewBomb({
          alive: p.玩家属性.血量当前 > 0,
          bombsInHand: p.玩家属性.手上炸弹数当前,
          cellHasBomb,
          groundBlock: curr.Terrain.ground[cy * curr.Terrain.size + cx] ?? BlockType.地面,
          // 泡泡里 / 冻住时放不了弹（原型扩展 NON-CONTRACT，ADR 0030）。
          blocked: bombBlocked(sk, curr.Tick),
        })
    }
    this.preview.update(show, curr.Terrain, cx, cy, power, now, dt, this.chestCells, pierce)
  }
}

function xz(p: PlayerView): XZ {
  return p.LogicTransform.WorldPosition
}
