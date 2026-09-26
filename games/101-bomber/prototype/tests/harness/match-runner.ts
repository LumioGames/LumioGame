import {
  BlockType,
  CHARACTER_ORDER,
  DEFAULT_RULES,
  MatchPhase,
  protoConfig,
  msToTicks,
  type BomberConfig,
  type BotDifficulty,
  type BotProfileId,
  type CharacterId,
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

/**
 * 无头整局跑手（原型扩展 NON-CONTRACT，design §15 Bot 难度分档（原型工具）；RESOLUTIONS #13 唯一一份）：
 * 走与浏览器完全相同的 LocalHost 路径（本机玩家由 localAutopilot 驾驶），逐帧流式统计、**不存帧**。
 * 给 acceptance-endgame / acceptance-ai / stats-* 用。计时只在测试里用 performance.now()。
 */
export interface MatchRunOptions {
  seed: number
  /** 7 个 Bot 的难度。 */
  ai: BotDifficulty
  /** 本机自动驾驶用的档（'player' = 验收 D 的脚本普通玩家）。 */
  local: BotProfileId
  /** 缺省：player 档 farmer，其余 hunter。 */
  localPersonality?: BotPersonality
  /** 本机角色；'rotate' = CHARACTER_ORDER[seed % 4]；缺省 rabbit（LocalHost 缺省）。 */
  localCharacter?: CharacterId | 'rotate'
  /** 缺省 protoConfig(rules)（7 分钟局）。 */
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

export interface MatchStats {
  seed: number
  ai: BotDifficulty
  local: BotProfileId
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
  evolutions: number
  players: PlayerResult[]
  localRank: number
  localPlace: number
  winner: U64
  winnerCharacter: CharacterId | null
  /** 一共推进的 Tick（含 Warmup）。 */
  ticks: number
  wallMs: number
}

const isCentre = (r: { Min: number; Max: number }, size: number): boolean => r.Min === r.Max && r.Min === (size - 1) / 2

/** 跑一局（只跑第一局，看到 MatchEnded 即停）。 */
export function runMatch(o: MatchRunOptions): MatchStats {
  const rules = o.rules ?? DEFAULT_RULES
  const config = o.config ?? protoConfig(rules)
  const localCharacter = o.localCharacter === 'rotate' ? CHARACTER_ORDER[o.seed % CHARACTER_ORDER.length] : (o.localCharacter ?? 'rabbit')
  const host = new LocalHost({
    seed: o.seed,
    config,
    rules,
    botCount: rules.playerCount - 1,
    ai: o.ai,
    localCharacter,
    botCharacters: 'auto',
    localAutopilot: { profile: o.local, personality: o.localPersonality ?? (o.local === 'player' ? 'farmer' : 'hunter') },
  })
  const hz = config.tickRateHz
  const maxTicks = o.maxTicks ?? msToTicks(rules.warmupMs, hz) + msToTicks(config.matchDurationMs, hz) + 200
  const c = new Collector(host.localPlayerId)
  const unsub = host.subscribe((f) => c.frame(f))
  const t0 = performance.now()
  let ticks = 0
  while (!c.ended) {
    if (ticks >= maxTicks) throw new Error(`seed ${o.seed}: no MatchEnded within ${maxTicks} ticks`)
    host.stepTicks(1)
    ticks++
  }
  unsub()
  return c.finish(o, ticks, performance.now() - t0)
}

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
  private readonly killsBy = new Map<U64, number>()
  private readonly deathsOf = new Map<U64, number>()
  private last: WorldSnapshot | null = null

  constructor(private readonly localId: U64) {}

  frame(f: TickFrame): void {
    if (this.ended) return
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
    if (this.reached1x1) {
      const centre = ((size - 1) / 2) * size + (size - 1) / 2
      const g = gridOfSnapshot(s)
      if (s.Terrain.brick[centre] !== BlockType.Air || [...g.chestCells].includes(centre)) this.centreViolations++
    }
  }

  finish(o: MatchRunOptions, ticks: number, wallMs: number): MatchStats {
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
      seed: o.seed,
      ai: o.ai,
      local: o.local,
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
      evolutions: this.evolutions,
      players,
      localRank: me.rank,
      localPlace: me.place,
      winner: winner.id,
      winnerCharacter: winner.character,
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
  localAvgPlace: number
  winsByCharacter: Partial<Record<CharacterId | 'none', number>>
  skillCastsPerMatch: Partial<Record<SkillId, number>>
  evolutionsPerMatch: number
  msPerTick: number
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
    localAvgPlace: avg((r) => r.localPlace),
    winsByCharacter: wins,
    skillCastsPerMatch: casts,
    evolutionsPerMatch: avg((r) => r.evolutions),
    msPerTick: rows.reduce((a, r) => a + r.wallMs, 0) / Math.max(1, rows.reduce((a, r) => a + r.ticks, 0)),
  }
}

const pct = (x: number): string => `${Math.round(x * 100)}%`
const f1 = (x: number): string => x.toFixed(1)

/** 交付用的 markdown 表（难度 × 指标），外加每档的角色胜场与技能施放。 */
export function formatSummary(rows: readonly StatsSummary[]): string {
  const head =
    '| 难度 | 局数 | 平均局长 | 最长 | 唯一存活 | 同归于尽 | 时间到 | 时间到存活中位 | 场均击杀 | 场均自杀 | 场均帽王更替 | 资源触发 | 到 1×1 | 1×1 可进入 | 本机第 1 | 本机前 3 | 本机平均站位 | ms/Tick |'
  const sep = `|${'---|'.repeat(18)}`
  const lines = rows.map(
    (r) =>
      `| ${r.label} | ${r.matches} | ${f1(r.avgLengthMin)} 分 | ${f1(r.maxLengthMin)} 分 | ${pct(r.soleSurvivorRate)} | ${pct(r.allDownRate)} | ${pct(r.timeUpRate)} | ${r.timeUpSurvivorsMedian ?? '—'} | ${f1(r.killsPerMatch)} | ${f1(r.selfKillsPerMatch)} | ${f1(r.hatKingChangesPerMatch)} | ${pct(r.resourceTriggerRate)} | ${pct(r.reached1x1Rate)} | ${r.enterable1x1All ? '是' : '否'} | ${pct(r.localWinRate)} | ${pct(r.localTop3Rate)} | ${f1(r.localAvgPlace)} | ${r.msPerTick.toFixed(2)} |`,
  )
  const extra = rows.map(
    (r) =>
      `- ${r.label}：名次 1（按角色）${JSON.stringify(r.winsByCharacter)}；场均技能施放 ${JSON.stringify(
        Object.fromEntries(Object.entries(r.skillCastsPerMatch).map(([k, v]) => [k, Math.round((v ?? 0) * 10) / 10])),
      )}；场均进化 ${f1(r.evolutionsPerMatch)}`,
  )
  return [head, sep, ...lines, '', ...extra].join('\n')
}

/** 逐局一行（失败分析用）。 */
export function formatRows(rows: readonly MatchStats[]): string {
  const head = '| 种子 | 局长 | 结束 | 存活 | 存活者血量 | 决赛圈 | 到 1×1 | 击杀 | 自杀 | 毒死 | 烧死 | 本机名次 | 赢家角色 |'
  const sep = `|${'---|'.repeat(13)}`
  const lines = rows.map((r) => {
    const hp = r.players.filter((p) => p.survived).map((p) => `${p.character ?? '?'}:${p.hp}`).join(' ')
    return `| ${r.seed} | ${f1(r.lengthMs / 60000)} 分 | ${r.reason} | ${r.survivors} | ${hp} | ${r.finalCircle ? r.finalCircle.trigger : '—'} | ${r.reached1x1 ? '是' : '否'} | ${r.kills} | ${r.selfKills} | ${r.poisonDeaths} | ${r.burnDeaths} | ${r.localRank} | ${r.winnerCharacter ?? '—'} |`
  })
  return [head, sep, ...lines].join('\n')
}
