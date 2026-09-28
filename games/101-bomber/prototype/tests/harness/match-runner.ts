import {
  BlockType,
  CHARACTER_ORDER,
  DEFAULT_RULES,
  MatchPhase,
  lineupFor,
  protoConfig,
  msToTicks,
  rulesForMap,
  type BomberConfig,
  type BotDifficulty,
  type BotProfileId,
  type CharacterId,
  type MapTierId,
  type MatchEndReason,
  type MatchResultsView,
  type ProtoRules,
  type SkillId,
  type TickFrame,
  type U64,
  type WorldSnapshot,
} from '../../src/contract'
import { LocalHost } from '../../src/app/local-host'
import type { BotPersonality } from '../../src/bots/bot-brain'
import { matchEndReason, matchResults } from '../../src/shared/ranking'
import { finalCellBlocker, gridOfSnapshot } from '../support/final-cell'
import { M1Collector, formatM1, summarizeM1, type HighlightProbeFactory, type M1MatchMetrics, type M1Summary } from './m1-metrics'

/**
 * 无头整局跑手（原型扩展 NON-CONTRACT，design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13 唯一一份）：
 * 走与浏览器完全相同的 LocalHost 路径（本机玩家由 localAutopilot 驾驶），逐帧流式统计、**不存帧**。
 * 给 acceptance-endgame / acceptance-ai / stats-* 用。计时只在测试里用 performance.now()。
 * 方向 B（ADR 0040 / 0043）：`{ map, lineup, softTargets }` 跑 16 人 · 27×27 与默认阵容；缺省仍是旧的 8 人 19 档、全员 `ai`。
 */
export interface MatchRunOptions {
  seed: number
  /** 全体 Bot 的难度（缺省 normal）；给了 `lineup` 时逐个被它覆盖。 */
  ai?: BotDifficulty
  /**
   * 地图档（ADR 0040）：给了就用 `rulesForMap(rules ?? DEFAULT_RULES, map, players)`（段表、再生、人数、`map` 换成该档）；
   * 缺省 = 给了 `rules` 就用它自带的档，都没给 = 旧的 8 人 19 档（{@link LEGACY_MAP}）。`config` 的 mapSize 须与档一致。
   */
  map?: MapTierId
  /** 总人数（含本机）；缺省 = 地图档默认人数（27 档 16 人）或 `rules.playerCount`。 */
  players?: number
  /**
   * 逐个 Bot 的难度（下标 i = slot i + 1，长度 = Bot 数），或 'default' = contract `lineupFor(Bot 数)`
   * （ADR 0043：15 个 Bot = 菜鸟 7 / 普通 6 / 困难 2）。缺省 = 全员 `ai`（LocalHost 不收 botLineup）。
   */
  lineup?: readonly BotDifficulty[] | 'default'
  /**
   * 不围剿真人的软目标（ADR 0043）。'local'（缺省）= 本机 slot 0（自动驾驶时亦然）——冻结的 LocalHost 总是这样传，且只支持这一种；
   * 'none' 需要 `LocalHostOptions` 加开关（src 改动，不归本工具），给了即抛错。
   */
  softTargets?: 'local' | 'none'
  /** 高光卡接入点（M1-4）；缺省 / null = 覆盖率报 N/A。 */
  highlight?: HighlightProbeFactory | null
  /** 本机自动驾驶用的档（'player' = 验收 D 的脚本普通玩家）。 */
  local: BotProfileId
  /** 缺省：player 档 farmer，其余 hunter。 */
  localPersonality?: BotPersonality
  /** 本机角色；'rotate' = CHARACTER_ORDER[seed % 4]；缺省 rabbit（LocalHost 缺省）。 */
  localCharacter?: CharacterId | 'rotate'
  /** 缺省 protoConfig(本局规则)（4 分钟局，ADR 0035）；自己给时用 protoConfig(rulesOf(...), 覆盖项)。 */
  config?: BomberConfig
  rules?: ProtoRules
  /** 超过即抛错；缺省 warmup + 局时 + 200。 */
  maxTicks?: number
}

export interface PlayerResult {
  id: U64
  character: CharacterId | null
  isLocal: boolean
  rank: number
  place: number
  survived: boolean
  hats: number
  hp: number
  kills: number
  deaths: number
}

export interface DeathRecord {
  tick: number
  victim: U64
  killer: U64
  cause: number
  /** 这次死亡让该玩家出局（决赛圈内不再重生）。 */
  eliminated: boolean
}

export interface MatchStats {
  seed: number
  /** 全员同档时为该档；混编阵容为 'mixed'（看 lineup）。 */
  ai: BotDifficulty | 'mixed'
  local: BotProfileId
  /** 地图档与总人数（含本机；逐人结果见 players）。 */
  map: MapTierId
  playerCount: number
  /** 实际的逐个 Bot 难度（下标 i = slot i + 1）。 */
  lineup: BotDifficulty[]
  /** 交给每个 Bot 的软目标（= [本机 id]）。 */
  softTargets: U64[]
  startTick: number
  endTick: number
  /** MatchEnded.Tick − StartTick，毫秒。 */
  lengthMs: number
  finalCircle: { trigger: 'resource' | 'time'; startTick: number } | null
  reason: MatchEndReason
  survivors: number
  kills: number
  deaths: number
  selfKills: number
  poisonDeaths: number
  burnDeaths: number
  /** 帽王更替次数（不含开局那一帧的重置）。 */
  hatKingChanges: number
  reached1x1: boolean
  /** 1×1 生效那一帧的可进入性（final-cell.ts）；没到 1×1 为 null。 */
  enterable1x1: boolean | null
  enterBlocker: string | null
  /** 预告 1×1 之后还落了宝箱。 */
  chestFor1x1: boolean
  /** 1×1 生效后中心格有砖 / 宝箱的帧数。 */
  centreViolations: number
  skillCasts: Partial<Record<SkillId, number>>
  /** Bot（非本机）施放技能的次数。 */
  botSkillCasts: number
  evolutions: number
  /** 本机放下的炸弹数（BombPlaced）。 */
  localBombs: number
  /** 本机位置变过的 Tick 数（自动驾驶真的在动）。 */
  localMovedTicks: number
  /** 每次死亡（失败分析用；约 20–30 条 / 局）。 */
  deathLog: DeathRecord[]
  players: PlayerResult[]
  localRank: number
  localPlace: number
  winner: U64
  winnerCharacter: CharacterId | null
  /** 方向 B · M1 报告项（Boss / 金心 / 资源箱 / 狂暴 / 各圈停留 / 高光卡）。 */
  m1: M1MatchMetrics
  /** 一共推进的 Tick（含 Warmup）。 */
  ticks: number
  wallMs: number
}

const isCentre = (r: { Min: number; Max: number }, size: number): boolean => r.Min === r.Max && r.Min === (size - 1) / 2

/**
 * 既不给 map 也不给 rules 时的档：旧的 8 人 19 档。与 DEFAULT_RULES 的默认档是否切到 27（归 M1-2）无关——
 * 旧批次（旧 D / easy / hard / 冒烟）照旧是 8 人 19×19；`rulesForMap(DEFAULT_RULES, 19)` 今天与 DEFAULT_RULES 逐项相等。
 */
export const LEGACY_MAP: MapTierId = 19

/** 本局规则：给了 map（或都没给 → {@link LEGACY_MAP}）用 rulesForMap；只给 rules 就照用（players 只改人数）。 */
export function rulesOf(o: Pick<MatchRunOptions, 'map' | 'players' | 'rules'>): ProtoRules {
  if (o.map === undefined && o.rules !== undefined) return o.players !== undefined ? { ...o.rules, playerCount: o.players } : o.rules
  return rulesForMap(o.rules ?? DEFAULT_RULES, o.map ?? LEGACY_MAP, o.players)
}

/** 逐个 Bot 的难度：'default' = lineupFor(Bot 数)，数组照用（长度须 = Bot 数），缺省全员 ai。 */
export function lineupOf(o: Pick<MatchRunOptions, 'ai' | 'lineup'>, botCount: number): BotDifficulty[] {
  if (o.lineup === 'default') return lineupFor(botCount)
  if (o.lineup) {
    if (o.lineup.length !== botCount) throw new Error(`runMatch: lineup has ${o.lineup.length} entries for ${botCount} bots`)
    return [...o.lineup]
  }
  return Array.from({ length: botCount }, () => o.ai ?? 'normal')
}

/** 跑一局（只跑第一局，看到 MatchEnded 即停）。 */
export function runMatch(o: MatchRunOptions): MatchStats {
  const rules = rulesOf(o)
  const config = o.config ?? protoConfig(rules)
  if (config.mapSize !== rules.map.size) throw new Error(`runMatch: config.mapSize ${config.mapSize} != map tier ${rules.map.size} (build config with protoConfig(rulesOf(...)))`)
  const botCount = rules.playerCount - 1
  const lineup = lineupOf(o, botCount)
  const localCharacter = o.localCharacter === 'rotate' ? CHARACTER_ORDER[o.seed % CHARACTER_ORDER.length] : (o.localCharacter ?? 'rabbit')
  const host = new LocalHost({
    seed: o.seed,
    config,
    rules,
    botCount,
    ai: o.ai ?? 'normal',
    // 只在给了 lineup 时传 botLineup：缺省走 LocalHost 的「全员 ai」老路径（逐位同旧行为）。
    ...(o.lineup !== undefined ? { botLineup: lineup } : {}),
    localCharacter,
    botCharacters: 'auto',
    softTargets: o.softTargets ?? 'local',
    localAutopilot: { profile: o.local, personality: o.localPersonality ?? (o.local === 'player' ? 'farmer' : 'hunter') },
  })
  const hz = config.tickRateHz
  const maxTicks = o.maxTicks ?? msToTicks(rules.warmupMs, hz) + msToTicks(config.matchDurationMs, hz) + 200
  const probe = o.highlight ? o.highlight({ config, rules, localId: host.localPlayerId }) : null
  const c = new Collector(host.localPlayerId, new M1Collector(config, rules, probe))
  const unsub = host.subscribe((f) => c.frame(f))
  const t0 = performance.now()
  let ticks = 0
  while (!c.ended) {
    if (ticks >= maxTicks) throw new Error(`seed ${o.seed}: no MatchEnded within ${maxTicks} ticks`)
    host.stepTicks(1)
    ticks++
  }
  unsub()
  const ai = lineup.length === 0 ? (o.ai ?? 'normal') : lineup.every((d) => d === lineup[0]) ? lineup[0] : 'mixed'
  return c.finish({ seed: o.seed, ai, local: o.local, map: rules.map.id, playerCount: rules.playerCount, lineup, softTargets: (o.softTargets ?? 'local') === 'none' ? [] : [host.localPlayerId] }, ticks, performance.now() - t0)
}

type RunIdentity = Pick<MatchStats, 'seed' | 'ai' | 'local' | 'map' | 'playerCount' | 'lineup' | 'softTargets'>

class Collector {
  ended = false
  private startTick = 0
  private endTick = 0
  private reason: MatchEndReason | null = null
  private kills = 0
  private deaths = 0
  private selfKills = 0
  private poisonDeaths = 0
  private burnDeaths = 0
  private hatKingChanges = 0
  private fc: MatchStats['finalCircle'] = null
  private announced1x1 = false
  private chestFor1x1 = false
  private reached1x1 = false
  private enterable1x1: boolean | null = null
  private enterBlocker: string | null = null
  private centreViolations = 0
  private readonly casts: Partial<Record<SkillId, number>> = {}
  private evolutions = 0
  private botCasts = 0
  private localBombs = 0
  private localMoved = 0
  private localPos = ''
  private readonly deathLog: DeathRecord[] = []
  private readonly killsBy = new Map<U64, number>()
  private readonly deathsOf = new Map<U64, number>()
  private last: WorldSnapshot | null = null

  constructor(
    private readonly localId: U64,
    private readonly m1: M1Collector,
  ) {}

  frame(f: TickFrame): void {
    if (this.ended) return
    this.m1.frame(f)
    const s = f.snapshot
    this.last = s
    const size = s.Terrain.size
    const starting = f.events.some((e) => e.type === 'MatchStarted')
    if (starting) this.startTick = s.BomberMatchState.StartTick
    for (const e of f.events) {
      switch (e.type) {
        case 'PlayerDied':
          this.deaths++
          this.deathsOf.set(e.VictimNetEntityIdRaw, (this.deathsOf.get(e.VictimNetEntityIdRaw) ?? 0) + 1)
          if (e.KillerNetEntityIdRaw !== 0 && e.KillerNetEntityIdRaw !== e.VictimNetEntityIdRaw) {
            this.kills++
            this.killsBy.set(e.KillerNetEntityIdRaw, (this.killsBy.get(e.KillerNetEntityIdRaw) ?? 0) + 1)
          }
          if (e.Cause === 0 && e.KillerNetEntityIdRaw === e.VictimNetEntityIdRaw) this.selfKills++
          if (e.Cause === 3) this.poisonDeaths++
          if (e.Cause === 2) this.burnDeaths++
          this.deathLog.push({ tick: e.Tick, victim: e.VictimNetEntityIdRaw, killer: e.KillerNetEntityIdRaw, cause: e.Cause, eliminated: false })
          break
        case 'PlayerEliminated':
          for (let i = this.deathLog.length - 1; i >= 0; i--)
            if (this.deathLog[i].victim === e.NetEntityIdRaw) {
              this.deathLog[i].eliminated = true
              break
            }
          break
        case 'HatKingChanged':
          if (!starting) this.hatKingChanges++
          break
        case 'FinalCircleStarted':
          this.fc = { trigger: e.Trigger, startTick: e.Tick }
          break
        case 'RingShrinkAnnounced':
          if (isCentre(e.Next, size)) this.announced1x1 = true
          break
        case 'ChestSpawned':
          if (this.announced1x1) this.chestFor1x1 = true
          break
        case 'RingShrunk':
          if (isCentre(e.Ring, size)) {
            this.reached1x1 = true
            this.enterBlocker = finalCellBlocker(gridOfSnapshot(s))
            this.enterable1x1 = this.enterBlocker === null
          }
          break
        case 'SkillActivated':
          this.casts[e.Skill] = (this.casts[e.Skill] ?? 0) + 1
          if (e.PlayerNetEntityIdRaw !== this.localId) this.botCasts++
          break
        case 'BombPlaced':
          if (e.OwnerNetEntityIdRaw === this.localId) this.localBombs++
          break
        case 'SkillEvolved':
          this.evolutions++
          break
        case 'MatchEnded':
          this.ended = true
          this.endTick = e.Tick
          this.reason = e.proto?.Reason ?? null
          break
        default:
          break
      }
    }
    const me = s.Players.find((p) => p.NetEntityIdRaw === this.localId)
    if (me) {
      const k = `${me.LogicTransform.WorldPosition.x},${me.LogicTransform.WorldPosition.z}`
      if (this.localPos !== '' && k !== this.localPos) this.localMoved++
      this.localPos = k
    }
    if (this.reached1x1) {
      const centre = ((size - 1) / 2) * size + (size - 1) / 2
      const g = gridOfSnapshot(s)
      if (s.Terrain.brick[centre] !== BlockType.Air || [...g.chestCells].includes(centre)) this.centreViolations++
    }
  }

  finish(o: RunIdentity, ticks: number, wallMs: number): MatchStats {
    const s = this.last
    if (!s) throw new Error('no frames')
    const results: MatchResultsView =
      s.match.results ??
      matchResults(s.Players.map((p) => ({ id: p.NetEntityIdRaw, eliminated: p.eliminated, eliminatedTick: p.eliminatedTick ?? 0, hats: p.BomberPlayerState.HatCount })))
    checkRanking(o.seed, s, results, this.reason)
    const players: PlayerResult[] = results.rows.map((r) => {
      const p = s.Players.find((x) => x.NetEntityIdRaw === r.id)!
      return {
        id: r.id,
        character: p.skills?.character ?? null,
        isLocal: r.id === this.localId,
        rank: r.rank,
        place: r.place,
        survived: r.survived,
        hats: r.hats,
        hp: p.玩家属性.血量当前,
        kills: this.killsBy.get(r.id) ?? 0,
        deaths: this.deathsOf.get(r.id) ?? 0,
      }
    })
    const me = players.find((p) => p.isLocal)!
    const winner = players[0]
    const hz = s.match.tickRateHz
    return {
      ...o,
      startTick: this.startTick,
      endTick: this.endTick,
      lengthMs: ((this.endTick - this.startTick) * 1000) / hz,
      finalCircle: this.fc,
      reason: this.reason ?? results.reason,
      survivors: players.filter((p) => p.survived).length,
      kills: this.kills,
      deaths: this.deaths,
      selfKills: this.selfKills,
      poisonDeaths: this.poisonDeaths,
      burnDeaths: this.burnDeaths,
      hatKingChanges: this.hatKingChanges,
      reached1x1: this.reached1x1,
      enterable1x1: this.enterable1x1,
      enterBlocker: this.enterBlocker,
      chestFor1x1: this.chestFor1x1,
      centreViolations: this.centreViolations,
      skillCasts: { ...this.casts },
      botSkillCasts: this.botCasts,
      evolutions: this.evolutions,
      localBombs: this.localBombs,
      localMovedTicks: this.localMoved,
      deathLog: this.deathLog,
      players,
      localRank: me.rank,
      localPlace: me.place,
      winner: winner.id,
      winnerCharacter: winner.character,
      m1: this.m1.finish(s),
      ticks,
      wallMs,
    }
  }
}

/**
 * 名次不变量（D2「活到最后者赢」）：存活者在前；出局者按出局 Tick 晚者在前；winner = rows[0]；结束原因与存活数一致；
 * 领奖台中央 = 唯一幸存者，或幸存者里帽子最多的。违反即抛错。
 */
export function checkRanking(seed: number, s: WorldSnapshot, r: MatchResultsView, reason: MatchEndReason | null): void {
  const fail = (m: string): never => {
    throw new Error(`seed ${seed}: ranking invariant — ${m}`)
  }
  const rows = r.rows
  if (rows.length !== s.Players.length) fail(`rows ${rows.length} != players ${s.Players.length}`)
  const firstDead = rows.findIndex((x) => !x.survived)
  if (firstDead >= 0 && rows.slice(firstDead).some((x) => x.survived)) fail('a survivor ranks below an eliminated player')
  for (let i = Math.max(0, firstDead) + 1; firstDead >= 0 && i < rows.length; i++)
    if (rows[i].eliminatedTick > rows[i - 1].eliminatedTick) fail(`eliminated order at place ${rows[i].place}`)
  if (r.winner !== rows[0].id) fail(`winner ${r.winner} != rows[0] ${rows[0].id}`)
  const survivors = rows.filter((x) => x.survived)
  const want = matchEndReason(survivors.length, rows.length)
  if (reason !== null && reason !== want) fail(`reason ${reason} but ${survivors.length} survivors`)
  if (r.reason !== want) fail(`results.reason ${r.reason} but ${survivors.length} survivors`)
  if (survivors.length > 0) {
    const most = Math.max(...survivors.map((x) => x.hats))
    if (!rows[0].survived || rows[0].hats !== most) fail('podium centre is not the survivor with the most hats')
  }
  if (s.BomberMatchState.Phase !== MatchPhase.Settlement) fail(`phase ${s.BomberMatchState.Phase} at MatchEnded`)
}

export interface StatsSummary {
  label: string
  matches: number
  avgLengthMin: number
  maxLengthMin: number
  soleSurvivorRate: number
  allDownRate: number
  timeUpRate: number
  timeUpSurvivorsMedian: number | null
  killsPerMatch: number
  deathsPerMatch: number
  selfKillsPerMatch: number
  hatKingChangesPerMatch: number
  resourceTriggerRate: number
  reached1x1Rate: number
  enterable1x1All: boolean
  localWinRate: number
  localTop3Rate: number
  /** 新验收 D（ADR 0043）：本机名次 ≤ 4 的局占比。 */
  localTop4Rate: number
  /** 本机击杀 / 死亡合计（击杀不含自杀；死亡含一切死因）与 K/D = 击杀合计 / 死亡合计（0 死 = Infinity）。 */
  localKills: number
  localDeaths: number
  localKD: number
  localKillsPerMatch: number
  localAvgPlace: number
  winsByCharacter: Partial<Record<CharacterId | 'none', number>>
  skillCastsPerMatch: Partial<Record<SkillId, number>>
  evolutionsPerMatch: number
  msPerTick: number
  /** 单局平均墙钟（毫秒）。 */
  msPerMatch: number
  m1: M1Summary
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function summarize(label: string, rows: readonly MatchStats[]): StatsSummary {
  const n = Math.max(1, rows.length)
  const avg = (f: (r: MatchStats) => number): number => rows.reduce((a, r) => a + f(r), 0) / n
  const rate = (f: (r: MatchStats) => boolean): number => rows.filter(f).length / n
  const wins: Partial<Record<CharacterId | 'none', number>> = {}
  const casts: Partial<Record<SkillId, number>> = {}
  for (const r of rows) {
    // 「赢」= 名次 1 的每个人（并列都算）。
    for (const p of r.players) if (p.rank === 1) wins[p.character ?? 'none'] = (wins[p.character ?? 'none'] ?? 0) + 1
    for (const [k, v] of Object.entries(r.skillCasts)) casts[k as SkillId] = (casts[k as SkillId] ?? 0) + (v ?? 0) / n
  }
  const timeUps = rows.filter((r) => r.reason === 'timeUp')
  const me = rows.map((r) => r.players.find((p) => p.isLocal)!)
  const localKills = me.reduce((a, p) => a + p.kills, 0)
  const localDeaths = me.reduce((a, p) => a + p.deaths, 0)
  return {
    label,
    matches: rows.length,
    avgLengthMin: avg((r) => r.lengthMs) / 60000,
    maxLengthMin: Math.max(0, ...rows.map((r) => r.lengthMs)) / 60000,
    soleSurvivorRate: rate((r) => r.reason === 'lastSurvivor'),
    allDownRate: rate((r) => r.reason === 'allDown'),
    timeUpRate: rate((r) => r.reason === 'timeUp'),
    timeUpSurvivorsMedian: median(timeUps.map((r) => r.survivors)),
    killsPerMatch: avg((r) => r.kills),
    deathsPerMatch: avg((r) => r.deaths),
    selfKillsPerMatch: avg((r) => r.selfKills),
    hatKingChangesPerMatch: avg((r) => r.hatKingChanges),
    resourceTriggerRate: rate((r) => r.finalCircle?.trigger === 'resource'),
    reached1x1Rate: rate((r) => r.reached1x1),
    enterable1x1All: rows.every((r) => r.enterable1x1 !== false && r.centreViolations === 0),
    localWinRate: rate((r) => r.localRank === 1),
    localTop3Rate: rate((r) => r.localRank <= 3),
    localTop4Rate: rate((r) => r.localRank <= 4),
    localKills,
    localDeaths,
    localKD: localDeaths === 0 ? (localKills === 0 ? 0 : Infinity) : localKills / localDeaths,
    localKillsPerMatch: localKills / n,
    localAvgPlace: avg((r) => r.localPlace),
    winsByCharacter: wins,
    skillCastsPerMatch: casts,
    evolutionsPerMatch: avg((r) => r.evolutions),
    msPerTick: rows.reduce((a, r) => a + r.wallMs, 0) / Math.max(1, rows.reduce((a, r) => a + r.ticks, 0)),
    msPerMatch: avg((r) => r.wallMs),
    m1: summarizeM1(rows.map((r) => r.m1)),
  }
}

const pct = (x: number): string => `${Math.round(x * 100)}%`
const f1 = (x: number): string => x.toFixed(1)
const kd = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : '∞')

/** 交付用的 markdown 表（批次 × 指标），外加每批的角色胜场、技能施放与 M1 报告项。 */
export function formatSummary(rows: readonly StatsSummary[]): string {
  const head =
    '| 批次 | 局数 | 平均局长 | 最长 | 唯一存活 | 同归于尽 | 时间到 | 时间到存活中位 | 场均击杀 | 场均自杀 | 场均帽王更替 | 资源触发 | 到 1×1 | 1×1 可进入 | 本机第 1 | 本机前 3 | 本机前 4 | 本机 K/D | 本机场均击杀 | 本机平均站位 | ms/Tick | 秒/局 |'
  const sep = `|${'---|'.repeat(22)}`
  const lines = rows.map(
    (r) =>
      `| ${r.label} | ${r.matches} | ${f1(r.avgLengthMin)} 分 | ${f1(r.maxLengthMin)} 分 | ${pct(r.soleSurvivorRate)} | ${pct(r.allDownRate)} | ${pct(r.timeUpRate)} | ${r.timeUpSurvivorsMedian ?? '—'} | ${f1(r.killsPerMatch)} | ${f1(r.selfKillsPerMatch)} | ${f1(r.hatKingChangesPerMatch)} | ${pct(r.resourceTriggerRate)} | ${pct(r.reached1x1Rate)} | ${r.enterable1x1All ? '是' : '否'} | ${pct(r.localWinRate)} | ${pct(r.localTop3Rate)} | ${pct(r.localTop4Rate)} | ${kd(r.localKD)}（${r.localKills} / ${r.localDeaths}） | ${f1(r.localKillsPerMatch)} | ${f1(r.localAvgPlace)} | ${r.msPerTick.toFixed(2)} | ${f1(r.msPerMatch / 1000)} |`,
  )
  const extra = rows.map(
    (r) =>
      `- ${r.label}：名次 1（按角色）${JSON.stringify(r.winsByCharacter)}；场均技能施放 ${JSON.stringify(
        Object.fromEntries(Object.entries(r.skillCastsPerMatch).map(([k, v]) => [k, Math.round((v ?? 0) * 10) / 10])),
      )}；场均进化 ${f1(r.evolutionsPerMatch)}`,
  )
  const m1 = rows.flatMap((r) => ['', `### M1 报告项 · ${r.label}`, '', formatM1(r.m1)])
  return [head, sep, ...lines, '', ...extra, ...m1].join('\n')
}

/** 逐局一行（失败分析用）。 */
export function formatRows(rows: readonly MatchStats[]): string {
  const head =
    '| 种子 | 局长 | 结束 | 存活 | 存活者血量 | 决赛圈 | 到 1×1 | 击杀 | 自杀 | 毒死 | 烧死 | 本机名次 | 本机杀 / 死 | 赢家角色 | Boss 期 | 金心发行 / 易手 | 开箱 木 / 铁 / 金 | 狂暴杀 | 墙钟 |'
  const sep = `|${'---|'.repeat(19)}`
  const lines = rows.map((r) => {
    const hp = r.players.filter((p) => p.survived).map((p) => `${p.character ?? '?'}:${p.hp}`).join(' ')
    const me = r.players.find((p) => p.isLocal)!
    const g = r.m1.goldHearts
    const issued = g.issued.brick + g.issued.crate + g.issued.chest + g.issued.supply
    const b = r.m1.boxesOpened
    return `| ${r.seed} | ${f1(r.lengthMs / 60000)} 分 | ${r.reason} | ${r.survivors} | ${hp} | ${r.finalCircle ? r.finalCircle.trigger : '—'} | ${r.reached1x1 ? '是' : '否'} | ${r.kills} | ${r.selfKills} | ${r.poisonDeaths} | ${r.burnDeaths} | ${r.localRank} | ${me.kills} / ${me.deaths} | ${r.winnerCharacter ?? '—'} | ${r.m1.bossReigns.length} | ${issued} / ${g.handoffs} | ${b.wood} / ${b.iron} / ${b.gold} | ${r.m1.frenzy.kills} | ${f1(r.wallMs / 1000)} s |`
  })
  return [head, sep, ...lines].join('\n')
}
