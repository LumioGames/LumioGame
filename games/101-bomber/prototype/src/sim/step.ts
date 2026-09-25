import { MatchPhase, 方向, type AbilityActivation, type TickFrame, type U64, type 移动技能输入 } from '../contract'
import { openChests } from './chest'
import { settleEffects, queueDrowning } from './effects'
import { computeDangerCells, runExplosions } from './explosion'
import { queuePoison } from './final-circle'
import { evaluateHatKing, processDeaths } from './hats'
import { advanceMatchPhase } from './match-phase'
import { applyMove } from './move'
import { spawnDrops, processPickups } from './pickup'
import { applyPlace } from './place-bomb'
import { processRespawns } from './respawn'
import { regenBricks } from './regen'
import { buildFrame } from './snapshot'
import { commitTerrain } from './terrain-commit'
import { isAlive, type World } from './world'

/**
 * 固定 20 Hz Tick 管线，镜像引擎 13 相中与玩法相关的顺序（契约 §2.2）：
 * ApplyInputs（技能）→ ProcessorPlan（死亡 → 爆炸 / 连锁 / 危险窗 → 溺水 / 毒圈 → 掉落 → 拾取 → 重生 →
 * 帽王）→ VoxelCommit（帧末一批写 + 软砖再生 + 宝箱开启）→ CommandBufferCommit（伤害单结算）→ 阶段机 → 发布帧。
 * 系统开关取 Tick 开始时的阶段：Warmup / Settlement 不收输入，Settlement 冻结全部玩法系统（名次定格）；
 * 走到 EndTick 的那个 Tick 照常结算，阶段机在进入结算前把本 Tick 的死亡结清。
 */
export function stepWorld(w: World, inputs: ReadonlyMap<U64, readonly AbilityActivation[]>): TickFrame {
  w.t++
  const phase = w.match.phase
  if (phase === MatchPhase.Running || phase === MatchPhase.Endgame) applyInputs(w, inputs)
  if (phase !== MatchPhase.Settlement) {
    processDeaths(w)
    runExplosions(w)
    queueDrowning(w)
    queuePoison(w)
    spawnDrops(w)
    processPickups(w)
    processRespawns(w)
    evaluateHatKing(w)
  }
  commitTerrain(w)
  regenBricks(w)
  openChests(w)
  settleEffects(w)
  advanceMatchPhase(w)
  const events = w.out
  w.out = []
  return buildFrame(w, events)
}

const IDLE: 移动技能输入 = { 方向: 方向.停, 按了转弯: false }

function applyInputs(w: World, inputs: ReadonlyMap<U64, readonly AbilityActivation[]>): void {
  const danger = computeDangerCells(w)
  for (const p of w.players) {
    if (!isAlive(p)) continue
    const acts = inputs.get(p.id)
    let move = IDLE
    let place = false
    if (acts)
      for (const a of acts) {
        if (a.ability === '移动') move = { 方向: a.输入.方向, 按了转弯: move.按了转弯 || a.输入.按了转弯 }
        else place = true
      }
    applyMove(w, p, move, danger)
    applyPlace(w, p, place)
  }
}
