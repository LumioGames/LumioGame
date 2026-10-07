import {
  BlockType,
  MatchPhase,
  PickupKind,
  centerDistance,
  isBoss,
  maxHealthOfView,
  ringZoneOf,
  type BomberConfig,
  type PickupSpawned,
  type ProtoRules,
  type ResourceBoxTier,
  type RingZone,
  type TickFrame,
  type U64,
  type WorldSnapshot,
  type ZoneRadii,
} from '../../src/contract'
import { cellOf } from '../../src/shared/grid'

/**
 * 方向 B · M1 报告项（原型扩展 NON-CONTRACT，ADR 0039 / 0040 / 0043，design §15 / §17.1「特殊炸弹、Boss 与决胜指标」）：
 * Boss 出现 / 持续 / 被击倒、金心发行与易手、各圈停留随局时、各级资源箱开启、狂暴期间击杀、高光卡覆盖率。
 * **只从事件与快照推导**（不读 sim）；数据缺席（规则还没产生）时计 0，比例类报 N/A。
 */

/** 各圈停留的局时分档（30 秒一档；4 分钟局 = 8 档）。 */
export const ZONE_BUCKET_MS = 30_000
export const RING_ZONES: readonly RingZone[] = ['outer', 'mid', 'core']
export const BOX_TIERS: readonly ResourceBoxTier[] = ['wood', 'iron', 'gold']
type GoldSource = Exclude<PickupSpawned['Source'], 'death'>
const GOLD_SOURCES: readonly GoldSource[] = ['brick', 'crate', 'chest', 'supply']

/**
 * 高光卡接入点（ADR 0043；分配逻辑归 M1-4 `src/present/highlight-cards.ts`）：每局一个，逐帧喂与 LocalHost 订阅者相同的帧，
 * MatchEnded 之后问一次每人分到的卡（null / 缺席 = 没分到）。没接上时覆盖率报 N/A。
 */
export interface HighlightProbe {
  frame(f: TickFrame): void
  cards(final: WorldSnapshot): ReadonlyMap<U64, string | null>
}
export type HighlightProbeFactory = (ctx: { config: BomberConfig; rules: ProtoRules; localId: U64 }) => HighlightProbe

/**
 * 一段 Boss 期：心数上限（快照 maxHealth）从 ≥ bossMinHearts 心起，到死亡（down）或对局结束（matchEnd）止；
 * 'lost' = 活着却不再是 Boss（上限存活期间只升不降，正常不会出现，出现即说明规则层口径变了）。
 */
export interface BossReign {
  id: U64
  fromTick: number
  toTick: number
  /** 期间快照里的最高心数上限（半心点）。 */
  peakMaxHealth: number
  end: 'down' | 'matchEnd' | 'lost'
  /** end = 'down' 时那条 PlayerDied 的击杀者（= 本人为自杀 / 毒圈等）；否则（或没看到 PlayerDied）null。 */
  killer: U64 | null
}

export interface M1MatchMetrics {
  hz: number
  bossReigns: BossReign[]
  goldHearts: {
    /** 发行 = 非死亡来源的金心 PickupSpawned，按来源。 */
    issued: Record<GoldSource, number>
    /** 死者掉出的金心（PickupSpawned Source 'death'）。 */
    dropped: number
    /** 金心 PickupTaken。 */
    picked: number
    /** 易手 = 死者掉出的金心被死者以外的人捡走。 */
    handoffs: number
  }
  /** 开启 = 砖层木箱被炸弹链炸掉（BrickDestroyed.ChainId ≠ 0）；等级取上一帧 ResourceBoxes，不在表里的木箱 = 木箱（M1-1 口径）。 */
  boxesOpened: Record<ResourceBoxTier, number>
  /** 被缩圈清场 / 重生清场抹掉的箱（ChainId = 0），不算开启。 */
  boxesCleared: Record<ResourceBoxTier, number>
  frenzy: {
    /** 进入狂暴次数（快照 frenzyUntilTick 变大且在未来）。 */
    starts: number
    /** 击杀者在狂暴中（Tick < frenzyUntilTick）的击杀（不含自杀 / 无主）。 */
    kills: number
    /** 狂暴中死亡（被反杀 / 毒圈等）。 */
    deaths: number
  }
  /** 存活玩家·Tick（Running / Endgame），下标 = 局时 ⌊(Tick − StartTick) / 30 s⌋。 */
  zoneTicks: Record<RingZone, number>[]
  /** 高光卡：null = 没接上分配逻辑。 */
  highlight: { players: number; covered: number } | null
}

const zeroTiers = (): Record<ResourceBoxTier, number> => ({ wood: 0, iron: 0, gold: 0 })
const zeroZones = (): Record<RingZone, number> => ({ outer: 0, mid: 0, core: 0 })
const alive = (p: WorldSnapshot['Players'][number]): boolean => p.玩家属性.血量当前 > 0 && !p.eliminated

/** 逐帧流式收集一局的 M1 报告项（不存帧；高光探针自己决定存什么）。看到 MatchEnded 后不再收。 */
export class M1Collector {
  private ended = false
  private readonly hz: number
  private readonly zones: ZoneRadii
  private readonly reigns: BossReign[] = []
  private readonly bossOpen = new Map<U64, { fromTick: number; peak: number }>()
  private readonly frenzyUntil = new Map<U64, number>()
  private boxTier = new Map<number, ResourceBoxTier>()
  private readonly goldSpawns = new Map<U64, { source: PickupSpawned['Source']; droppedBy: U64 }>()
  private readonly gold: M1MatchMetrics['goldHearts'] = { issued: { brick: 0, crate: 0, chest: 0, supply: 0 }, dropped: 0, picked: 0, handoffs: 0 }
  private readonly opened = zeroTiers()
  private readonly cleared = zeroTiers()
  private readonly frenzy = { starts: 0, kills: 0, deaths: 0 }
  private readonly zoneTicks: Record<RingZone, number>[] = []

  constructor(
    private readonly config: BomberConfig,
    private readonly rules: ProtoRules,
    private readonly probe: HighlightProbe | null = null,
  ) {
    this.hz = config.tickRateHz
    this.zones = rules.map.zones
  }

  frame(f: TickFrame): void {
    if (this.ended) return
    const s = f.snapshot
    const size = s.Terrain.size
    let endTick = -1
    // 1. 事件：一律对照上一帧的状态（Boss / 狂暴 / 箱等级）。
    for (const e of f.events) {
      switch (e.type) {
        case 'PlayerDied': {
          const v = e.VictimNetEntityIdRaw
          const k = e.KillerNetEntityIdRaw
          const b = this.bossOpen.get(v)
          if (b) this.close(v, b, e.Tick, 'down', k)
          const killerUntil = Math.max(this.frenzyUntil.get(k) ?? 0, s.Players.find((p) => p.NetEntityIdRaw === k)?.frenzyUntilTick ?? 0)
          if (k !== 0 && k !== v && e.Tick < killerUntil) this.frenzy.kills++
          if (e.Tick < (this.frenzyUntil.get(v) ?? 0)) this.frenzy.deaths++
          break
        }
        case 'PickupSpawned':
          if (e.Kind !== PickupKind.GoldHeart) break
          this.goldSpawns.set(e.PickupNetEntityIdRaw, { source: e.Source, droppedBy: e.DroppedByNetEntityIdRaw })
          if (e.Source === 'death') this.gold.dropped++
          else this.gold.issued[e.Source]++
          break
        case 'PickupTaken': {
          if (e.Kind !== PickupKind.GoldHeart) break
          this.gold.picked++
          const from = e.proto ? this.goldSpawns.get(e.proto.PickupNetEntityIdRaw) : undefined
          if (from && from.source === 'death' && from.droppedBy !== e.PickerNetEntityIdRaw) this.gold.handoffs++
          break
        }
        case 'BrickDestroyed': {
          if (e.Block !== BlockType.木箱) break
          const tier = this.boxTier.get(e.Cell.Y * size + e.Cell.X) ?? 'wood'
          if (e.ChainId !== 0) this.opened[tier]++
          else this.cleared[tier]++
          break
        }
        case 'MatchEnded':
          endTick = e.Tick
          break
        default:
          break
      }
    }
    // 2. 各圈停留：本帧快照里的存活玩家，只算 Running / Endgame。
    const phase = s.BomberMatchState.Phase
    const start = s.BomberMatchState.StartTick
    if ((phase === MatchPhase.Running || phase === MatchPhase.Endgame) && s.Tick >= start) {
      const bucket = Math.floor(((s.Tick - start) * 1000) / this.hz / ZONE_BUCKET_MS)
      while (this.zoneTicks.length <= bucket) this.zoneTicks.push(zeroZones())
      const zones = s.match.map?.zones ?? this.zones
      for (const p of s.Players) {
        if (!alive(p)) continue
        const c = cellOf(p.LogicTransform.WorldPosition.x, p.LogicTransform.WorldPosition.z)
        this.zoneTicks[bucket][ringZoneOf(zones, centerDistance(size, c.X, c.Y))]++
      }
    }
    this.probe?.frame(f)
    if (endTick >= 0) {
      this.ended = true
      for (const [id, b] of [...this.bossOpen]) this.close(id, b, endTick, 'matchEnd', null)
      return
    }
    // 3. 状态：Boss 期开合、狂暴窗口、箱等级（给下一帧的事件用）。
    for (const p of s.Players) {
      const id = p.NetEntityIdRaw
      const max = maxHealthOfView(p, this.config)
      const open = this.bossOpen.get(id)
      if (alive(p) && isBoss(this.config, this.rules, max)) {
        if (open) open.peak = Math.max(open.peak, max)
        else this.bossOpen.set(id, { fromTick: s.Tick, peak: max })
      } else if (open) {
        // 没有 PlayerDied 却不再是 Boss（没看到死亡事件 / 上限回落）：按本帧收口。
        this.close(id, open, s.Tick, alive(p) ? 'lost' : 'down', null)
      }
      const until = p.frenzyUntilTick ?? 0
      if (until > (this.frenzyUntil.get(id) ?? 0) && until > s.Tick) this.frenzy.starts++
      this.frenzyUntil.set(id, until)
    }
    const tiers = new Map<number, ResourceBoxTier>()
    for (const b of s.ResourceBoxes ?? []) tiers.set(b.Cell.Y * size + b.Cell.X, b.tier)
    this.boxTier = tiers
  }

  finish(final: WorldSnapshot): M1MatchMetrics {
    let highlight: M1MatchMetrics['highlight'] = null
    if (this.probe) {
      const cards = this.probe.cards(final)
      const covered = final.Players.filter((p) => {
        const c = cards.get(p.NetEntityIdRaw)
        return c !== undefined && c !== null && c !== ''
      }).length
      highlight = { players: final.Players.length, covered }
    }
    return {
      hz: this.hz,
      bossReigns: [...this.reigns],
      goldHearts: { ...this.gold, issued: { ...this.gold.issued } },
      boxesOpened: { ...this.opened },
      boxesCleared: { ...this.cleared },
      frenzy: { ...this.frenzy },
      zoneTicks: this.zoneTicks.map((z) => ({ ...z })),
      highlight,
    }
  }

  private close(id: U64, b: { fromTick: number; peak: number }, toTick: number, end: BossReign['end'], killer: U64 | null): void {
    this.bossOpen.delete(id)
    this.reigns.push({ id, fromTick: b.fromTick, toTick, peakMaxHealth: b.peak, end, killer })
  }
}

export interface ZoneBucketSummary {
  fromSec: number
  toSec: number
  /** 这一档里所有局的存活玩家·秒。 */
  playerSec: number
  /** 各圈占比；这一档没有样本为 null。 */
  share: Record<RingZone, number> | null
}

export interface M1Summary {
  matches: number
  /** 出现过 Boss 的局占比（design §15 目标 ≥ 60%）。 */
  bossMatchRate: number
  bossReignsPerMatch: number
  /** Boss 期平均 / 最长持续（秒；局末仍是 Boss 的按 MatchEnded 截断）；没有 Boss 为 null。 */
  bossAvgSec: number | null
  bossMaxSec: number | null
  /** Boss 期以死亡结束的比例（任何死因；design §15 目标 ≥ 50%）；没有 Boss 为 null。 */
  bossDownRate: number | null
  /** 其中被他人击杀（击杀者 ≠ 本人且 ≠ 0）的比例。 */
  bossKilledRate: number | null
  goldIssuedPerMatch: number
  goldIssuedBySource: Record<GoldSource, number>
  goldDroppedPerMatch: number
  goldPickedPerMatch: number
  goldHandoffsPerMatch: number
  boxesOpenedPerMatch: Record<ResourceBoxTier, number>
  boxesClearedPerMatch: Record<ResourceBoxTier, number>
  frenzyStartsPerMatch: number
  frenzyKillsPerMatch: number
  frenzyKillsTotal: number
  frenzyDeathsPerMatch: number
  zoneByBucket: ZoneBucketSummary[]
  /** 高光卡覆盖率（ADR 0043 应为 100%）；探针没接上为 null。 */
  highlightCoverage: number | null
}

export function summarizeM1(rows: readonly M1MatchMetrics[]): M1Summary {
  const n = Math.max(1, rows.length)
  const sum = (f: (r: M1MatchMetrics) => number): number => rows.reduce((a, r) => a + f(r), 0)
  const reigns = rows.flatMap((r) => r.bossReigns.map((b) => ({ sec: (b.toTick - b.fromTick) / r.hz, b })))
  const ratio = (k: number): number | null => (reigns.length === 0 ? null : k / reigns.length)
  const perMatch = <K extends string>(keys: readonly K[], f: (r: M1MatchMetrics) => Record<K, number>): Record<K, number> =>
    Object.fromEntries(keys.map((k) => [k, sum((r) => f(r)[k]) / n])) as Record<K, number>
  const buckets = Math.max(0, ...rows.map((r) => r.zoneTicks.length))
  const zoneByBucket: ZoneBucketSummary[] = []
  for (let i = 0; i < buckets; i++) {
    const z = zeroZones()
    let hz = 0
    for (const r of rows) {
      const b = r.zoneTicks[i]
      hz = r.hz
      if (b) for (const k of RING_ZONES) z[k] += b[k]
    }
    const total = z.outer + z.mid + z.core
    zoneByBucket.push({
      fromSec: (i * ZONE_BUCKET_MS) / 1000,
      toSec: ((i + 1) * ZONE_BUCKET_MS) / 1000,
      playerSec: hz > 0 ? total / hz : 0,
      share: total === 0 ? null : { outer: z.outer / total, mid: z.mid / total, core: z.core / total },
    })
  }
  const hl = rows.filter((r) => r.highlight !== null)
  const hlPlayers = hl.reduce((a, r) => a + r.highlight!.players, 0)
  return {
    matches: rows.length,
    bossMatchRate: rows.filter((r) => r.bossReigns.length > 0).length / n,
    bossReignsPerMatch: reigns.length / n,
    bossAvgSec: reigns.length === 0 ? null : reigns.reduce((a, x) => a + x.sec, 0) / reigns.length,
    bossMaxSec: reigns.length === 0 ? null : Math.max(...reigns.map((x) => x.sec)),
    bossDownRate: ratio(reigns.filter((x) => x.b.end === 'down').length),
    bossKilledRate: ratio(reigns.filter((x) => x.b.end === 'down' && x.b.killer !== null && x.b.killer !== 0 && x.b.killer !== x.b.id).length),
    goldIssuedPerMatch: sum((r) => GOLD_SOURCES.reduce((a, k) => a + r.goldHearts.issued[k], 0)) / n,
    goldIssuedBySource: perMatch(GOLD_SOURCES, (r) => r.goldHearts.issued),
    goldDroppedPerMatch: sum((r) => r.goldHearts.dropped) / n,
    goldPickedPerMatch: sum((r) => r.goldHearts.picked) / n,
    goldHandoffsPerMatch: sum((r) => r.goldHearts.handoffs) / n,
    boxesOpenedPerMatch: perMatch(BOX_TIERS, (r) => r.boxesOpened),
    boxesClearedPerMatch: perMatch(BOX_TIERS, (r) => r.boxesCleared),
    frenzyStartsPerMatch: sum((r) => r.frenzy.starts) / n,
    frenzyKillsPerMatch: sum((r) => r.frenzy.kills) / n,
    frenzyKillsTotal: sum((r) => r.frenzy.kills),
    frenzyDeathsPerMatch: sum((r) => r.frenzy.deaths) / n,
    zoneByBucket,
    highlightCoverage: hl.length === 0 || hlPlayers === 0 ? null : hl.reduce((a, r) => a + r.highlight!.covered, 0) / hlPlayers,
  }
}

const NA = 'N/A'
const pct = (x: number | null): string => (x === null ? NA : `${Math.round(x * 100)}%`)
const f1 = (x: number | null): string => (x === null ? NA : x.toFixed(1))
const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** 高光卡没接上时的说明（报告里原样打出）。 */
export const HIGHLIGHT_NA_NOTE = '高光卡分配逻辑（M1-4 src/present/highlight-cards.ts）尚未接入：接入点 = stats-suite 的 HIGHLIGHT_PROBE / runMatch({ highlight })'

/** M1 报告项（markdown）：一行一项，外加各圈停留随局时的表。 */
export function formatM1(s: M1Summary): string {
  const tiers = (r: Record<ResourceBoxTier, number>): string => `木 ${f1(r.wood)} / 铁 ${f1(r.iron)} / 金 ${f1(r.gold)}`
  const lines = [
    `- Boss（上限 ≥ 6 心）：出现局占比 ${pct(s.bossMatchRate)}；场均 Boss 期 ${f1(s.bossReignsPerMatch)}；平均持续 ${f1(s.bossAvgSec)} 秒（最长 ${f1(s.bossMaxSec)} 秒）；被击倒比例 ${pct(s.bossDownRate)}（其中被他人击杀 ${pct(s.bossKilledRate)}）`,
    `- 金心：场均发行 ${f1(s.goldIssuedPerMatch)}（木箱 ${f1(s.goldIssuedBySource.crate)} / 宝箱 ${f1(s.goldIssuedBySource.chest)} / 补给 ${f1(s.goldIssuedBySource.supply)} / 积木 ${f1(s.goldIssuedBySource.brick)}）；场均死亡掉出 ${f1(s.goldDroppedPerMatch)}；场均拾取 ${f1(s.goldPickedPerMatch)}；场均易手 ${f1(s.goldHandoffsPerMatch)}`,
    `- 资源箱开启（场均）：${tiers(s.boxesOpenedPerMatch)}；被清场抹掉（不算开启）：${tiers(s.boxesClearedPerMatch)}`,
    `- 狂暴：场均进入 ${f1(s.frenzyStartsPerMatch)} 次；狂暴期间击杀 场均 ${f1(s.frenzyKillsPerMatch)}（合计 ${s.frenzyKillsTotal}）；狂暴中死亡 场均 ${f1(s.frenzyDeathsPerMatch)}`,
    `- 高光卡覆盖率：${s.highlightCoverage === null ? `${NA}（${HIGHLIGHT_NA_NOTE}）` : pct(s.highlightCoverage)}`,
    `- 各圈停留（存活玩家·时间占比，局时 ${ZONE_BUCKET_MS / 1000} 秒一档）：${s.zoneByBucket.length === 0 ? NA : ''}`,
  ]
  if (s.zoneByBucket.length > 0) {
    lines.push('', '| 局时 | 外圈 | 中圈 | 核心 | 样本（人·秒） |', `|${'---|'.repeat(5)}`)
    for (const b of s.zoneByBucket)
      lines.push(`| ${mmss(b.fromSec)}–${mmss(b.toSec)} | ${pct(b.share?.outer ?? null)} | ${pct(b.share?.mid ?? null)} | ${pct(b.share?.core ?? null)} | ${Math.round(b.playerSec)} |`)
  }
  return lines.join('\n')
}
