import {
  MatchPhase,
  方向,
  type BomberEvent,
  type BombView,
  type ChestView,
  type FinalCircleView,
  type FireZoneView,
  type PickupView,
  type PlayerSkillsView,
  type PlayerView,
  type SkillSlotView,
  type TickFrame,
  type WorldSnapshot,
} from '../contract'
import { hatCountOf } from './death-drops'
import { rectView } from './final-circle'
import { fireZones } from './fire-zones'
import { phaseEndTick } from './match-phase'
import { simMatchResults } from './results'
import {
  aliveCount,
  CELL_MILLI,
  cellOfIdx,
  centerMilli,
  countResource,
  currentSpeed,
  pickupProtectedUntil,
  type SimPlayer,
  type SimSkillSlot,
  type World,
} from './world'

/**
 * 发布帧：纯数据、不可变。决赛圈状态触发后一直发布到下一局开局（结算期也在，供结算表标注存活 / 出局）（无 class、无 Map，地形数组逐帧拷贝）。千分格 → 米；
 * 游戏 (X, Y) → 引擎 (x = X, z = Y)，实体 y = 1（契约 §1.2）。
 */
function worldPos(cell: number, size: number): { x: number; y: number; z: number } {
  return { x: centerMilli(cell % size) / CELL_MILLI, y: 1, z: centerMilli(Math.floor(cell / size)) / CELL_MILLI }
}

function slotView(s: SimSkillSlot | null): SkillSlotView | null {
  return s ? { skill: s.skill, level: s.level, bound: s.bound } : null
}

/** 原型扩展（NON-CONTRACT，ADR 0030）：角色与技能视图（槽只给技能 / 等级 / 绑定，不给进化的两半）。 */
function skillsView(p: SimPlayer): PlayerSkillsView {
  return {
    character: p.character,
    facing: p.facing,
    slots: { bomb: slotView(p.slots.bomb), active: slotView(p.slots.active), passive: slotView(p.slots.passive) },
    cdFromTick: p.cdFromTick,
    cdUntilTick: p.cdUntilTick,
    bubbleUntilTick: p.bubbleUntilTick,
    auraUntilTick: p.auraUntilTick,
    frozenUntilTick: p.frozenUntilTick,
    regenFromTick: p.regenFromTick,
    regenNextTick: p.regenNextTick,
    blinkTick: p.blinkTick,
    toxinUntilTick: p.toxinUntilTick,
    shockUntilTick: p.shockUntilTick,
  }
}

export function buildFrame(w: World, events: readonly BomberEvent[]): TickFrame {
  const size = w.size
  const m = w.match
  const Players: PlayerView[] = w.players.map((p) => ({
    NetEntityIdRaw: p.id,
    LogicTransform: { WorldPosition: { x: p.mx / CELL_MILLI, y: 1, z: p.my / CELL_MILLI } },
    teleportTick: p.teleportTick,
    BomberPlayerState: { HatCount: hatCountOf(w, p), RespawnAtTick: p.respawnAtTick, ProtectedUntilTick: p.protectedUntilTick },
    // 当前账移速含麻痹修饰（ADR 0033）；基础账不变；水中减速不发布。
    玩家属性: { 血量当前: p.health, 火力当前: p.power, 移速当前: currentSpeed(p, w.t), 手上炸弹数当前: p.capacity },
    玩家属性基础: { 血量基础: p.health, 火力基础: p.power, 移速基础: p.speed, 手上炸弹数基础: p.capacity },
    meta: { name: p.name, isBot: p.spec.isBot, animal: p.animal, slot: p.spec.slot },
    eliminated: p.eliminated,
    skills: skillsView(p),
    eliminatedTick: p.eliminatedTick,
  }))
  const Bombs: BombView[] = w.bombs.map((b) => ({
    NetEntityIdRaw: b.id,
    LogicTransform: { WorldPosition: worldPos(b.cell, size) },
    teleportTick: b.bornTick,
    BomberBombState: {
      OwnerNetEntityIdRaw: b.owner,
      FuseEndTick: b.fuseEndTick,
      Power: b.power,
      ChainId: b.chainId,
      BombKind: b.kind,
      PierceLayers: b.pierceLayers,
      ExplodedAtTick: b.explodedAtTick,
      DangerUntilTick: b.dangerUntilTick,
      BurnUntilTick: b.burnUntilTick,
      ReachUp: b.reachUp,
      ReachDown: b.reachDown,
      ReachLeft: b.reachLeft,
      ReachRight: b.reachRight,
    },
    kick:
      b.kickDir !== 方向.停
        ? { dir: b.kickDir, progressMilli: b.kickAcc, cellsLeft: b.kickCellsLeft, speedMilli: w.rules.kickSpeedMilli }
        : null,
  }))
  const Pickups: PickupView[] = w.pickups.map((it) => ({
    NetEntityIdRaw: it.id,
    LogicTransform: { WorldPosition: worldPos(it.cell, size) },
    teleportTick: it.bornTick,
    BomberPickupItem: { Kind: it.kind },
    droppedBy: it.droppedBy,
    protectedUntilTick: pickupProtectedUntil(w, it),
    ...(it.skill !== null ? { skill: { id: it.skill, level: it.level } } : {}),
  }))
  const Chests: ChestView[] = w.chests.map((c) => ({
    NetEntityIdRaw: c.id,
    LogicTransform: { WorldPosition: worldPos(c.cell, size) },
    teleportTick: c.bornTick,
    chest: { HitsLeft: c.hitsLeft, HitsRequired: c.hitsRequired, StageIndex: c.stageIndex },
  }))
  const fc = w.finalCircle
  const finalCircle: FinalCircleView | null = fc
    ? {
        trigger: fc.trigger,
        startTick: fc.startTick,
        endTick: m.endTick,
        ring: rectView(fc.ring),
        nextRing: fc.nextRing ? rectView(fc.nextRing) : null,
        nextRingTick: fc.nextRingTick,
        stageIndex: fc.stageIndex,
        aliveCount: aliveCount(w),
      }
    : null
  const snapshot: WorldSnapshot = {
    Tick: w.t,
    BomberMatchState: {
      MatchTick: Math.max(0, w.t - m.startTick),
      StartTick: m.startTick,
      EndTick: m.endTick,
      Phase: m.phase,
      HatKingNetEntityIdRaw: m.hatKing,
    },
    Players,
    Bombs,
    // ADR 0028：没有帽堆，字段留着给契约 v2 形状，恒为空。
    HatPiles: [],
    Pickups,
    Chests,
    Terrain: { size, ground: w.ground.slice(), brick: w.brick.slice(), rev: w.rev },
    match: {
      matchIndex: m.index,
      phaseEndTick: phaseEndTick(w),
      tickRateHz: w.cfg.tickRateHz,
      resourceInitial: w.resourceInitial,
      resourceRemaining: countResource(w),
      finalCircle,
      results: m.phase === MatchPhase.Settlement ? simMatchResults(w) : null,
    },
    FireZones: fireZones(w).map(
      (z): FireZoneView => ({ owner: z.owner, source: z.source, cells: z.cells.map((c) => cellOfIdx(w, c)), untilTick: z.untilTick }),
    ),
  }
  return { snapshot, events }
}
