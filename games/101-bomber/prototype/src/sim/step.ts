import { MatchPhase, 方向, type AbilityActivation, type TickFrame, type U64, type 移动技能输入 } from '../contract'
import { queueBurns } from './burn'
import { openChests } from './chest'
import { settleEffects, queueDrowning } from './effects'
import { computeDangerCells, runExplosions } from './explosion'
import { queuePoison } from './final-circle'
import { evaluateHatKing, processDeaths } from './hats'
import { advanceKickedBombs, tryKick } from './kick'
import { advanceMatchPhase } from './match-phase'
import { applyMove, haltMove } from './move'
import { spawnDrops, processPickups } from './pickup'
import { applyPlace } from './place-bomb'
import { applyRecovery } from './recovery'
import { processRespawns } from './respawn'
import { regenBricks } from './regen'
import { applySkill } from './skills'
import { buildFrame } from './snapshot'
import { commitTerrain } from './terrain-commit'
import { emit, isAlive, type World } from './world'

/**
 * 固定 20 Hz Tick 管线，镜像引擎 13 相中与玩法相关的顺序（契约 §2.2）：
 * ApplyInputs（技能）→ ProcessorPlan（死亡 → 踢出的炸弹滑行 → 爆炸 / 连锁 / 危险窗 → 溺水 / 毒圈 / 烧伤 → 掉落 →
 * 拾取 → 重生 → 帽王）→ VoxelCommit（帧末一批写 + 软砖再生 + 宝箱开启）→ CommandBufferCommit（伤害单结算）→
 * 回春 → 阶段机 → 发布帧。
 * 系统开关取 Tick 开始时的阶段：Warmup / Settlement 不收输入，Settlement 冻结全部玩法系统（名次定格）；
 * 走到 EndTick 的那个 Tick 照常结算，阶段机在进入结算前把本 Tick 的死亡结清。
 * 第 4 轮（原型扩展 NON-CONTRACT，ADR 0030）新增的踢弹 / 烧伤 / 回春 / 技能在这里排定唯一顺序（critic §2.3）。
 */
export function stepWorld(w: World, inputs: ReadonlyMap<U64, readonly AbilityActivation[]>): TickFrame {
  w.t++
  const phase = w.match.phase
  if (phase === MatchPhase.Running || phase === MatchPhase.Endgame) applyInputs(w, inputs)
  if (phase !== MatchPhase.Settlement) {
    processDeaths(w)
    advanceKickedBombs(w)
    runExplosions(w)
    queueDrowning(w)
    queuePoison(w)
    queueBurns(w)
    spawnDrops(w)
    processPickups(w)
    processRespawns(w)
    evaluateHatKing(w)
  }
  commitTerrain(w)
  regenBricks(w)
  openChests(w)
  settleEffects(w)
  if (phase !== MatchPhase.Settlement) applyRecovery(w)
  advanceMatchPhase(w)
  const events = w.out
  w.out = []
  return buildFrame(w, events)
}

const IDLE: 移动技能输入 = { 方向: 方向.停, 按了转弯: false }

/**
 * 每个活人按 id 序：解析本 Tick 的输入（多条移动：方向 / 副方向取最后一条，「按了转弯」取或；放弹 / 技能各自锁存）。
 * 冻结中：按了技能键发 SkillFailed('frozen')，清掉在途移动，其余一概不做。
 * 否则：非停的方向更新面向（被挡也更新，猫朝砖按住也能闪过去）→ 踢弹（先于移动，副方向也能踢）→ 移动 → 放弹 → 技能。
 */
function applyInputs(w: World, inputs: ReadonlyMap<U64, readonly AbilityActivation[]>): void {
  const danger = computeDangerCells(w)
  const t = w.t
  for (const p of w.players) {
    if (!isAlive(p)) continue
    const acts = inputs.get(p.id)
    let move = IDLE
    let place = false
    let skill = false
    if (acts)
      for (const a of acts) {
        switch (a.ability) {
          case '移动': {
            const next: 移动技能输入 = { 方向: a.输入.方向, 按了转弯: move.按了转弯 || a.输入.按了转弯 }
            if (a.输入.副方向 !== undefined) next.副方向 = a.输入.副方向
            move = next
            break
          }
          case '放弹':
            place = true
            break
          case '技能':
            skill = true
            break
        }
      }
    if (t < p.frozenUntilTick) {
      if (skill) {
        const s = p.slots.active
        emit(w, { type: 'SkillFailed', presentationOnly: true, PlayerNetEntityIdRaw: p.id, Skill: s ? s.skill : null, Reason: 'frozen', Tick: t })
      }
      haltMove(p)
      continue
    }
    if (move.方向 !== 方向.停) p.facing = move.方向
    tryKick(w, p, move)
    applyMove(w, p, move, danger)
    applyPlace(w, p, place)
    applySkill(w, p, skill)
  }
}

