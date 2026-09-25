import { BlockType, DeathCause, MatchPhase, type RingRect } from '../contract'
import { promoteEliminations } from './hats'
import {
  cellOfIdx,
  cellOccupied,
  countResource,
  emit,
  isAlive,
  newId,
  playerCell,
  type Rect,
  type SimChest,
  type World,
} from './world'

/**
 * 决赛圈（design §4.2 / §12，ADR 0025）：资源或时间先到先触发，固定时长、局终同步提前；
 * 安全圈以棋盘中心为心分段收缩，每段生效前预告并在下一圈内落一个强力宝箱；圈外中毒走伤害单队列。
 */

/** 以棋盘中心为心、边长 s 的正方形安全圈（闭区间，夹在内场 [1, size−2]）。 */
export function ringRect(size: number, s: number): Rect {
  const c = (size - 1) / 2
  const min = Math.max(1, Math.ceil(c - (s - 1) / 2))
  const max = Math.min(size - 2, min + s - 1)
  return { min, max }
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.min && x <= r.max && y >= r.min && y <= r.max
}

export function rectView(r: Rect): RingRect {
  return { Min: r.min, Max: r.max }
}

/**
 * 触发判定：距 EndTick ≤ 决赛圈时长 → 'time'；剩余可破坏砖 < 开局 × 千分比 → 'resource'，
 * 但资源触发只在软砖再生停止之后生效（ADR 0026），否则再生期内 8 个 Bot 半分钟就能把它提前点燃。
 */
export function finalCircleTrigger(w: World): 'resource' | 'time' | null {
  const left = w.match.endTick - w.t
  if (left <= w.ticks.finalCircle) return 'time'
  const init = w.resourceInitial
  if (!regenActive(w) && init > 0 && countResource(w) * 1000 < init * w.rules.finalCircleResourcePermille) return 'resource'
  return null
}

/** 软砖再生是否仍在进行：常规阶段、且距时间触发还多于 regenStopBeforeFinal。 */
export function regenActive(w: World): boolean {
  return w.match.phase === MatchPhase.Running && w.match.endTick - w.t > w.ticks.finalCircle + w.ticks.regenStopBeforeFinal
}

export function startFinalCircle(w: World, trigger: 'resource' | 'time'): void {
  const m = w.match
  const t = w.t
  m.phase = MatchPhase.Endgame
  m.endTick = Math.min(m.endTick, t + w.ticks.finalCircle)
  w.finalCircle = {
    trigger,
    startTick: t,
    ring: { min: 1, max: w.size - 2 },
    nextRing: null,
    nextRingTick: 0,
    stageIndex: -1,
    announced: 0,
  }
  emit(w, { type: 'FinalCircleStarted', presentationOnly: true, Trigger: trigger, EndTick: m.endTick, Tick: t })
  // 本 Tick 早先结算的死亡（死亡 Tick = 触发 Tick）也算出局：强化改为全部掉落。
  promoteEliminations(w)
}

/**
 * 每个 Endgame Tick（含触发当 Tick）推进安全圈：先让到期的预告圈生效，再预告下一段并落宝箱。
 * 上一段未生效前不预告下一段；生效时刻不早于 EndTick 的段整体跳过。
 */
export function advanceRing(w: World): void {
  const fc = w.finalCircle
  if (!fc) return
  const t = w.t
  const stages = w.ticks.ringStages
  for (;;) {
    if (fc.nextRing) {
      if (t < fc.nextRingTick) return
      fc.ring = fc.nextRing
      fc.stageIndex = fc.announced - 1
      fc.nextRing = null
      fc.nextRingTick = 0
      emit(w, { type: 'RingShrunk', presentationOnly: true, StageIndex: fc.stageIndex, Ring: rectView(fc.ring), Tick: t })
      continue
    }
    if (fc.announced >= stages.length) return
    const s = stages[fc.announced]
    const at = fc.startTick + s.at
    if (at >= w.match.endTick) {
      fc.announced = stages.length
      return
    }
    if (t < at - w.ticks.ringPreview) return
    const next = ringRect(w.size, s.size)
    const index = fc.announced
    fc.announced++
    fc.nextRing = next
    fc.nextRingTick = Math.max(at, t)
    emit(w, { type: 'RingShrinkAnnounced', presentationOnly: true, StageIndex: index, Next: rectView(next), AtTick: fc.nextRingTick, Tick: t })
    spawnChest(w, next, index)
  }
}

/** 圈外中毒（design §12）：离开安全圈起每 poison 个 Tick 扣一次；重生保护不免疫；Killer = 受害者。 */
export function queuePoison(w: World): void {
  const fc = w.finalCircle
  for (const p of w.players) {
    if (!fc || !isAlive(p)) {
      p.poisonTicks = 0
      continue
    }
    const c = playerCell(w, p)
    if (inRect(fc.ring, c % w.size, Math.floor(c / w.size))) {
      p.poisonTicks = 0
      continue
    }
    p.poisonTicks++
    if (p.poisonTicks % w.ticks.poison !== 0) continue
    w.effects.push({
      target: p.id,
      points: w.rules.poisonPointsPerInterval,
      bomb: 0,
      owner: 0,
      chainId: 0,
      cause: DeathCause.Poison,
      killer: p.id,
    })
  }
}

/**
 * 预告时在下一圈内随机空地落 1 个宝箱：砖层空、非水、无人 / 弹 / 糖果 / 宝箱；
 * 优先离所有活人 ≥ 2 格（曼哈顿），没有就放宽。一个空格都没有则本段不落。
 */
export function spawnChest(w: World, r: Rect, stageIndex: number): void {
  const size = w.size
  const people: number[] = []
  for (const p of w.players) if (!p.eliminated) people.push(playerCell(w, p))
  const near: number[] = []
  const far: number[] = []
  for (let y = r.min; y <= r.max; y++)
    for (let x = r.min; x <= r.max; x++) {
      const c = y * size + x
      if (w.brick[c] !== BlockType.Air || w.ground[c] === BlockType.水 || cellOccupied(w, c) || people.includes(c)) continue
      let d = Infinity
      for (const pc of people) d = Math.min(d, Math.abs((pc % size) - x) + Math.abs(Math.floor(pc / size) - y))
      ;(d >= 2 ? far : near).push(c)
    }
  const pool = far.length > 0 ? far : near
  if (pool.length === 0) return
  const cell = pool[w.rng.chest.NextInt(0, pool.length)]
  const hits = Math.max(1, w.rules.chestHitsRequired)
  const chest: SimChest = { id: newId(w), cell, hitsRequired: hits, stageIndex, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 }
  w.chests.push(chest)
  emit(w, { type: 'ChestSpawned', presentationOnly: true, ChestNetEntityIdRaw: chest.id, Cell: cellOfIdx(w, cell), Tick: w.t })
}
