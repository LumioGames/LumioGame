import type { BomberEvent, U64 } from '../contract'

/**
 * 击杀手感、连杀与连锁里程碑的纯逻辑（design §3.1「单杀 / 连杀 / 连锁」，ADR 0043）。
 * 全部由客户端从 `PlayerDied` / `BombExploded` / `ChainResolved` / `MatchEnded` 推导，不需要规则层新字段；
 * HUD（弹字 / 横幅 / 击杀栏）、音频（击杀音音高）与画面（定帧 / 镜头冲击 / 最后一杀慢镜）各持一份，
 * 喂同一条事件流得到同一结论（三者互不 import）。
 *
 * 口径：
 * - 击杀 = `Killer ≠ 0 且 Killer ≠ Victim`（自爆、溺水、毒圈不算；火焰 / 中毒弹有主人的算）。
 * - 8 秒窗口连杀：与该击杀者上一杀相隔 ≤ 8 秒就接着数，否则从 1 重来；2 / 3 / 4 / 5 杀依次播双杀 / 三杀 / 四杀 / 暴走。
 *   窗口里的击杀全出自同一条爆炸链时不播——那是「多杀」弹字（design §3.1 多杀行）的事。
 * - 不死连杀：击杀者自己倒下就清零；数到 3 / 5 / 8 播大杀特杀 / 主宰 / 超神。同 Tick 先结清击杀再结清死亡（换命也算这一杀）。
 * - 首次 ×5 / ×8 连锁：本机有炸弹参与的链，每局各一次；一条链直接到 ×8 只播 ×8。
 * - 整局最后一杀：`MatchEnded` 同 Tick 的最后一条真击杀。
 *
 * 数值全部是首轮默认、推断待验证（design §15）。原型扩展（NON-CONTRACT）。
 */

export interface KillJuiceConfig {
  /** 连杀窗口（design §3.1：8 秒）。 */
  rapidWindowMs: number
  /** 不死连杀阈值与称号（design §3.1：3 / 5 / 8）。 */
  spree: readonly { kills: number; label: string }[]
  /** 「首次 ×N 连锁」里程碑（design §3.1：×5 / ×8）。 */
  chainMilestones: readonly number[]
  /** 击杀音每级升几个半音。 */
  pitchSemitones: number
  /** 击杀音最多升几级。 */
  pitchMaxStep: number
  /** 本人击杀定帧（design §3.1：70 ms）。 */
  hitstopMs: number
  /** 本人击杀镜头冲击幅度（格，ADR 0043：0.15）。 */
  shake: number
  /** 整局最后一杀的本地慢镜时长（真实毫秒，design §3.1：0.6 秒）。 */
  slowMoMs: number
  /** 慢镜倍率（design §3.1：0.3×）。 */
  slowMoScale: number
  /** 死者帽数 ≥ 它：爆装喷泉更大、配金币串音效（design §3.1：6）。 */
  bigDropHats: number
}

export const KILL_JUICE: KillJuiceConfig = {
  rapidWindowMs: 8000,
  spree: [
    { kills: 3, label: '大杀特杀' },
    { kills: 5, label: '主宰' },
    { kills: 8, label: '超神' },
  ],
  chainMilestones: [5, 8],
  pitchSemitones: 2,
  pitchMaxStep: 6,
  hitstopMs: 70,
  shake: 0.15,
  slowMoMs: 600,
  slowMoScale: 0.3,
  bigDropHats: 6,
}

const RAPID_LABELS = ['双杀', '三杀', '四杀', '暴走'] as const

/** 8 秒窗口里第 n 杀的称号：2 双杀 / 3 三杀 / 4 四杀 / ≥ 5 暴走；1 为 null。 */
export function rapidLabel(count: number): string | null {
  if (count < 2) return null
  return RAPID_LABELS[Math.min(count, 5) - 2]
}

/** 击杀音第 step 级的频率倍率（每级升 `pitchSemitones` 个半音）。 */
export function killPitchRatio(step: number, cfg: KillJuiceConfig = KILL_JUICE): number {
  return 2 ** ((Math.max(0, step) * cfg.pitchSemitones) / 12)
}

/** 最后一杀之后领奖台延后开场的 Tick 数（= 慢镜时长，让最后一杀演完）。 */
export function settleHoldTicks(tickRateHz: number, cfg: KillJuiceConfig = KILL_JUICE): number {
  return Math.ceil((cfg.slowMoMs * tickRateHz) / 1000 - 1e-9)
}

/** 震动强度设置为 0 时关掉定帧 / 慢镜（design §9.6：屏幕震动与全屏效果可降到 0）；镜头冲击由镜头按强度缩放。 */
export function juiceEnabled(shakeSetting: number): boolean {
  return shakeSetting > 0
}

export interface KillInfo {
  tick: U64
  killer: U64
  victim: U64
  chainId: U64
  /** 击杀者 8 秒窗口内的第几杀（1 起）。 */
  rapid: number
  /** 击杀者不死连杀数（1 起）。 */
  spree: number
  /** 击杀音音高级数：窗口内第一杀为 0，每多一杀 +1，封顶 `pitchMaxStep`。 */
  pitchStep: number
  /** 本杀刚跨上的窗口连杀称号（双杀 / 三杀 / 四杀 / 暴走）；没有为 null。 */
  rapidLabel: string | null
  /** 本杀刚跨上的不死连杀称号（大杀特杀 / 主宰 / 超神）；没有为 null。 */
  spreeLabel: string | null
}

export interface ChainMilestone {
  chainId: U64
  bombs: number
  label: string
}

export interface FinalKill {
  tick: U64
  killer: U64
  victim: U64
}

export interface JuiceResult {
  kills: KillInfo[]
  chainMilestones: ChainMilestone[]
  finalKill: FinalKill | null
}

type Died = Extract<BomberEvent, { type: 'PlayerDied' }>

function isKill(e: Died): boolean {
  return e.KillerNetEntityIdRaw !== 0 && e.KillerNetEntityIdRaw !== e.VictimNetEntityIdRaw
}

/** 整局最后一杀：`MatchEnded` 同 Tick 的最后一条真击杀；局不是被击杀终结的为 null。 */
export function finalKillOf(events: readonly BomberEvent[]): FinalKill | null {
  const end = events.find((e) => e.type === 'MatchEnded')
  if (!end) return null
  let out: FinalKill | null = null
  for (const e of events) {
    if (e.type === 'PlayerDied' && e.Tick === end.Tick && isKill(e)) out = { tick: e.Tick, killer: e.KillerNetEntityIdRaw, victim: e.VictimNetEntityIdRaw }
  }
  return out
}

interface RapidState {
  lastTick: number
  count: number
  /** 窗口内击杀出自哪些链（没有链的击杀各自算一条）。 */
  chains: Set<string>
}

interface ChainState {
  bombs: number
  resolved: number
  local: boolean
}

const MAX_CHAINS = 256

export class KillJuice {
  private readonly cfg: KillJuiceConfig
  private readonly localId: U64
  private readonly windowTicks: number
  private readonly rapid = new Map<U64, RapidState>()
  private readonly spree = new Map<U64, number>()
  private readonly chains = new Map<U64, ChainState>()
  private readonly reached = new Set<number>()

  constructor(opts: { localId: U64; tickRateHz: number; config?: KillJuiceConfig }) {
    this.cfg = opts.config ?? KILL_JUICE
    this.localId = opts.localId
    this.windowTicks = Math.round((this.cfg.rapidWindowMs * opts.tickRateHz) / 1000)
  }

  /** 新局：清空窗口、不死连杀与「首次」里程碑。 */
  reset(): void {
    this.rapid.clear()
    this.spree.clear()
    this.chains.clear()
    this.reached.clear()
  }

  /** 吃一批按 Tick 有序的事件（HUD 的一批 / 表现时钟的一次到期）。 */
  consume(events: readonly BomberEvent[]): JuiceResult {
    const kills: KillInfo[] = []
    const touched = new Set<U64>()
    for (let i = 0; i < events.length; ) {
      let j = i
      while (j < events.length && events[j].Tick === events[i].Tick) j++
      // 同 Tick：先换局、再结清击杀、最后结清死亡（换命的那一杀也算进连杀）。
      for (let k = i; k < j; k++) if (events[k].type === 'MatchStarted') this.reset()
      for (let k = i; k < j; k++) {
        const e = events[k]
        if (e.type === 'PlayerDied' && isKill(e)) kills.push(this.onKill(e))
        else if (e.type === 'BombExploded') this.onBomb(e.ChainId, e.SourceBombOwnerNetEntityIdRaw, touched)
        else if (e.type === 'ChainResolved') this.onResolved(e.ChainId, e.BombCount, e.OwnerNetEntityIdRaws, touched)
      }
      for (let k = i; k < j; k++) {
        const e = events[k]
        if (e.type === 'PlayerDied') this.spree.delete(e.VictimNetEntityIdRaw)
      }
      i = j
    }
    return { kills, chainMilestones: this.milestones(touched), finalKill: finalKillOf(events) }
  }

  private onKill(e: Died): KillInfo {
    const killer = e.KillerNetEntityIdRaw
    const tick = e.Tick
    let st = this.rapid.get(killer)
    if (!st || tick - st.lastTick > this.windowTicks) {
      st = { lastTick: tick, count: 0, chains: new Set() }
      this.rapid.set(killer, st)
    }
    st.lastTick = tick
    st.count++
    st.chains.add(e.ChainId !== 0 ? `c${e.ChainId}` : `k${tick}:${e.VictimNetEntityIdRaw}`)
    const spree = (this.spree.get(killer) ?? 0) + 1
    this.spree.set(killer, spree)
    const rapidAnnounced = st.count <= 5 && st.chains.size >= 2 ? rapidLabel(st.count) : null
    return {
      tick,
      killer,
      victim: e.VictimNetEntityIdRaw,
      chainId: e.ChainId,
      rapid: st.count,
      spree,
      pitchStep: Math.min(this.cfg.pitchMaxStep, st.count - 1),
      rapidLabel: rapidAnnounced,
      spreeLabel: this.cfg.spree.find((s) => s.kills === spree)?.label ?? null,
    }
  }

  private chain(id: U64): ChainState {
    let c = this.chains.get(id)
    if (!c) {
      c = { bombs: 0, resolved: 0, local: false }
      this.chains.set(id, c)
      if (this.chains.size > MAX_CHAINS) this.chains.delete(this.chains.keys().next().value as U64)
    }
    return c
  }

  private onBomb(chainId: U64, owner: U64, touched: Set<U64>): void {
    if (chainId === 0) return
    const c = this.chain(chainId)
    c.bombs++
    if (owner === this.localId) c.local = true
    touched.add(chainId)
  }

  private onResolved(chainId: U64, bombs: number, owners: readonly U64[], touched: Set<U64>): void {
    if (chainId === 0) return
    const c = this.chain(chainId)
    c.resolved = Math.max(c.resolved, bombs)
    if (owners.includes(this.localId)) c.local = true
    touched.add(chainId)
  }

  /** 本批碰过的、本机参与的链：跨上还没播过的最高里程碑只播一条，低档一并记为已达成。 */
  private milestones(touched: Set<U64>): ChainMilestone[] {
    const out: ChainMilestone[] = []
    const steps = [...this.cfg.chainMilestones].sort((a, b) => a - b)
    for (const id of touched) {
      const c = this.chains.get(id)
      if (!c || !c.local) continue
      const n = Math.max(c.bombs, c.resolved)
      let top = 0
      for (const m of steps) {
        if (n < m) break
        if (!this.reached.has(m)) top = m
        this.reached.add(m)
      }
      if (top > 0) out.push({ chainId: id, bombs: top, label: `首次 ×${top} 连锁！` })
    }
    return out
  }
}
