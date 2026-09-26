import { MatchPhase, 方向 } from '../contract'
import type { LocalSimOptions } from './local-sim'
import { deathEliminates } from './death-drops'
import { advanceRing, finalCircleTrigger, startFinalCircle } from './final-circle'
import { evaluateHatKing, processDeaths } from './hats'
import { generateMap } from './mapgen'
import { placeAtMatchStart } from './respawn'
import { simMatchResults } from './results'
import { mixSeed, Sfc32 } from './rng'
import { assignRoster } from './roster'
import { tickTable } from './ticks'
import { countResource, emit, emptySlots, resetAbilityFields, resetAttributes, type SimPlayer, type World } from './world'

/**
 * 对局阶段机（契约 BomberMatchState.Phase；design §4 / §4.1 / §4.2 / §13）：
 * Warmup → Running → Endgame（决赛圈：资源或时间触发，EndTick 可被提前）→ Settlement（EndTick 起，
 * 前段领奖台只是表现，规则层只等 settlementMs）→ 新一局。
 * 滚动局永不停：结算结束当 Tick 用 mix(seed, 局序号) 重新生成地图、玩家复位（保留 id）。
 * 阶段机在 Tick 末（地形提交与伤害单结算之后）推进，所以触发判定看到的是本 Tick 提交后的地形。
 */

/** 原型只有 8 个出生候选（design §5 ≤12 人档的 19×19，本原型固定 ≤ 8 人）。 */
export const MAX_PLAYERS = 8

export function createWorld(opts: LocalSimOptions): World {
  const { config: cfg, rules } = opts
  const n = opts.players.length
  if (n < 1 || n > MAX_PLAYERS) throw new Error(`LocalSim: player count ${n} not in [1, ${MAX_PLAYERS}]`)
  const slots = new Set(opts.players.map((p) => p.slot))
  if (slots.size !== n) throw new Error('LocalSim: duplicate player slot')
  const players: SimPlayer[] = opts.players.map((spec, i) => {
    const p: SimPlayer = {
      id: i + 1,
      spec: { ...spec },
      mx: 0,
      my: 0,
      teleportTick: 0,
      health: 0,
      power: 0,
      speed: 0,
      capacity: 0,
      respawnAtTick: 0,
      protectedUntilTick: 0,
      awaitingRespawn: false,
      moveAcc: 0,
      lastDir: 0,
      pendingDir: 0,
      turnBuf: 0,
      lastAssistTick: -1000,
      assistTol: 0,
      bombBufUntil: 0,
      waterTicks: 0,
      poisonTicks: 0,
      capacityDebt: 0,
      eliminated: false,
      pick: spec.character ?? null,
      character: null,
      name: spec.name,
      animal: spec.animal,
      facing: 方向.下,
      slots: emptySlots(),
      cdFromTick: 0,
      cdUntilTick: 0,
      bubbleUntilTick: 0,
      auraUntilTick: 0,
      frozenUntilTick: 0,
      freezeImmuneUntilTick: 0,
      burnReadyTick: 0,
      regenFromTick: 0,
      regenNextTick: 0,
      blinkTick: 0,
      eliminatedTick: 0,
    }
    resetAttributes(p, cfg)
    return p
  })
  const seed = opts.seed >>> 0
  const w: World = {
    cfg,
    rules,
    ticks: tickTable(cfg, rules),
    seed,
    size: cfg.mapSize,
    t: 0,
    match: { index: -1, startTick: 0, endTick: 0, phase: MatchPhase.Warmup, hatKing: 0 },
    ground: new Uint8Array(0),
    brick: new Uint8Array(0),
    rev: 0,
    spawns: [],
    players,
    bombs: [],
    pickups: [],
    chests: [],
    fireWalls: [],
    nextId: n + 1,
    explodeSeq: 1,
    rng: streams(seed),
    resourceInitial: 0,
    finalCircle: null,
    chainDmg: new Map(),
    pendingDeaths: [],
    batch: new Map(),
    effects: [],
    out: [],
  }
  startMatch(w, 0)
  return w
}

/**
 * 开一局：新地图、清场、玩家复位、分配角色（原型扩展 ADR 0030，roster.ts）并摆到出生候选。
 * 在构造时与上一局结算结束的 Tick 调用。
 */
export function startMatch(w: World, index: number): void {
  const matchSeed = mixSeed(w.seed, index)
  w.rng = streams(matchSeed)
  const map = generateMap(matchSeed, w.cfg, w.rules, w.players.length)
  w.ground = map.ground
  w.brick = map.brick
  w.spawns = map.spawns
  w.rev++
  w.bombs = []
  w.pickups = []
  w.chests = []
  w.fireWalls = []
  w.finalCircle = null
  w.resourceInitial = countResource(w)
  w.pendingDeaths = []
  w.batch.clear()
  w.effects = []
  w.chainDmg.clear()
  for (const p of w.players) {
    resetAttributes(p, w.cfg)
    resetAbilityFields(p)
    p.respawnAtTick = 0
    p.protectedUntilTick = 0
    p.awaitingRespawn = false
    p.capacityDebt = 0
    p.eliminated = false
  }
  assignRoster(w)
  placeAtMatchStart(w)
  const prevKing = w.match.hatKing
  const startTick = w.t + w.ticks.warmup
  w.match = { index, startTick, endTick: startTick + w.ticks.match, phase: MatchPhase.Warmup, hatKing: 0 }
  if (prevKing !== 0) emit(w, { type: 'HatKingChanged', PreviousHatKingNetEntityIdRaw: prevKing, NewHatKingNetEntityIdRaw: 0, Tick: w.t })
  emit(w, { type: 'MatchStarted', presentationOnly: true, MatchIndex: index, Tick: w.t })
}

function streams(seed: number): World['rng'] {
  return {
    drop: new Sfc32(seed, 'drop'),
    spawn: new Sfc32(seed, 'spawn'),
    chest: new Sfc32(seed, 'chest'),
    regen: new Sfc32(seed, 'regen'),
    // 第 4 轮新增（ADR 0030）：各流按名字独立派生，加流不改变旧流的序列。
    skill: new Sfc32(seed, 'skill'),
    roster: new Sfc32(seed, 'roster'),
  }
}

/**
 * 本 Tick 待结算的死亡落地之后仍在局的人数：未出局、且没有一条会让其出局的待处理死亡（决赛圈内的死亡一律出局）。
 * 用于「只剩一人 → 当 Tick 结束」（原型扩展 NON-CONTRACT，ADR 0031 / design §4.2）。倒计时复活中的人算在局。
 */
export function survivorsAfterPending(w: World): number {
  const out = new Set<number>()
  for (const d of w.pendingDeaths) if (deathEliminates(w, d.tick)) out.add(d.victim)
  let n = 0
  for (const p of w.players) if (!p.eliminated && !out.has(p.id)) n++
  return n
}

/**
 * Tick 末推进阶段。Running 每 Tick 查决赛圈触发；Endgame 下本 Tick 的死亡结清后在局 ≤ 1（且不止一人在局）
 * 即在击杀当 Tick 结束（ADR 0031），否则推进安全圈（结束的那一帧不再预告 / 落箱 / 清场）；到 EndTick 进入结算。
 */
export function advanceMatchPhase(w: World): void {
  const m = w.match
  if (m.phase === MatchPhase.Settlement) {
    if (w.t >= m.endTick + w.ticks.settlement) startMatch(w, m.index + 1)
    return
  }
  if (m.phase === MatchPhase.Warmup) {
    if (w.t < m.startTick) return
    m.phase = MatchPhase.Running
  }
  if (m.phase === MatchPhase.Running) {
    const trigger = finalCircleTrigger(w)
    if (trigger) startFinalCircle(w, trigger)
  }
  if (m.phase === MatchPhase.Endgame) {
    // 决赛圈里中途退出的人也算这局的参赛者（按出局记名次），所以两人局一人退出、另一人立即获胜。
    const entrants = w.players.length + (w.departed?.filter((d) => d.match === m.index).length ?? 0)
    if (entrants > 1 && survivorsAfterPending(w) <= 1) m.endTick = Math.min(m.endTick, w.t)
    if (w.t < m.endTick) advanceRing(w)
  }
  if (w.t >= m.endTick) enterSettlement(w)
}

/**
 * 进入结算前把本 Tick 已发布的死亡结清（掉强化、出局，出局 Tick = 死亡 Tick），名次才与事件一致；
 * 之后规则冻结，MatchEnded 排在本 Tick 所有伤害 / 死亡 / 出局事件之后。
 * 原型扩展（NON-CONTRACT，ADR 0031）：MatchEnded.proto 带结束原因与领奖台中央（= 名次表第一行，sim/results.ts）。
 */
function enterSettlement(w: World): void {
  const m = w.match
  if (w.pendingDeaths.length > 0) {
    processDeaths(w)
    evaluateHatKing(w)
  }
  m.endTick = w.t
  m.phase = MatchPhase.Settlement
  const r = simMatchResults(w)
  emit(w, { type: 'MatchEnded', Tick: w.t, proto: { Reason: r.reason, WinnerNetEntityIdRaw: r.winner } })
}

/** 当前阶段结束的 Tick（MatchMeta.phaseEndTick）：Running 与 Endgame 共用 EndTick。 */
export function phaseEndTick(w: World): number {
  const m = w.match
  if (m.phase === MatchPhase.Warmup) return m.startTick
  if (m.phase === MatchPhase.Settlement) return m.endTick + w.ticks.settlement
  return m.endTick
}
