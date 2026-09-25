import type {
  BomberEvent,
  BombView,
  ChestView,
  FinalCircleView,
  PickupView,
  PlayerView,
  TickFrame,
  WorldSnapshot,
} from '../contract'
import { hatCountOf } from './death-drops'
import { rectView } from './final-circle'
import { phaseEndTick } from './match-phase'
import { aliveCount, CELL_MILLI, centerMilli, countResource, pickupProtectedUntil, type World } from './world'

/**
 * 发布帧：纯数据、不可变。决赛圈状态触发后一直发布到下一局开局（结算期也在，供结算表标注存活 / 出局）（无 class、无 Map，地形数组逐帧拷贝）。千分格 → 米；
 * 游戏 (X, Y) → 引擎 (x = X, z = Y)，实体 y = 1（契约 §1.2）。
 */
function worldPos(cell: number, size: number): { x: number; y: number; z: number } {
  return { x: centerMilli(cell % size) / CELL_MILLI, y: 1, z: centerMilli(Math.floor(cell / size)) / CELL_MILLI }
}

export function buildFrame(w: World, events: readonly BomberEvent[]): TickFrame {
  const size = w.size
  const m = w.match
  const Players: PlayerView[] = w.players.map((p) => ({
    NetEntityIdRaw: p.id,
    LogicTransform: { WorldPosition: { x: p.mx / CELL_MILLI, y: 1, z: p.my / CELL_MILLI } },
    teleportTick: p.teleportTick,
    BomberPlayerState: { HatCount: hatCountOf(w, p), RespawnAtTick: p.respawnAtTick, ProtectedUntilTick: p.protectedUntilTick },
    玩家属性: { 血量当前: p.health, 火力当前: p.power, 移速当前: p.speed, 手上炸弹数当前: p.capacity },
    玩家属性基础: { 血量基础: p.health, 火力基础: p.power, 移速基础: p.speed, 手上炸弹数基础: p.capacity },
    meta: { name: p.spec.name, isBot: p.spec.isBot, animal: p.spec.animal, slot: p.spec.slot },
    eliminated: p.eliminated,
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
      BombKind: 0,
      PierceLayers: 0,
      ExplodedAtTick: b.explodedAtTick,
      DangerUntilTick: b.dangerUntilTick,
      BurnUntilTick: b.burnUntilTick,
      ReachUp: b.reachUp,
      ReachDown: b.reachDown,
      ReachLeft: b.reachLeft,
      ReachRight: b.reachRight,
    },
  }))
  const Pickups: PickupView[] = w.pickups.map((it) => ({
    NetEntityIdRaw: it.id,
    LogicTransform: { WorldPosition: worldPos(it.cell, size) },
    teleportTick: it.bornTick,
    BomberPickupItem: { Kind: it.kind },
    droppedBy: it.droppedBy,
    protectedUntilTick: pickupProtectedUntil(w, it),
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
    },
  }
  return { snapshot, events }
}
