import { MatchPhase } from '../contract'

/**
 * 背景音乐的纯逻辑（无 WebAudio，可单测）：按对局阶段选变奏（状态机），再把 8 小节循环排成音符事件。
 * 口径（round-2 规格 / design §3.1「加冕 · 音乐层」、§4.1「决赛圈音乐增强」、§13 领奖台）：
 * 欢快的 C 大调五声旋律 + 柔和贝斯 + 轻 tick，无噪声底；常规 112 BPM，决赛圈 128 BPM 加高八度层，
 * 领奖台先让位给胜利号角，结算表换安静变奏。
 */
export type MusicMode = 'silent' | 'main' | 'final' | 'podium' | 'results'

export interface MusicInputs {
  phase: MatchPhase
  renderTick: number
  tickRateHz: number
  /** MatchEnded 的 Tick；结算阶段没见到时为 null。 */
  matchEndedTick: number | null
  podiumMs: number
  /** 渲染时钟停住（暂停 / 切后台）时静音，避免暂停画面下音乐照放。 */
  stalled: boolean
}

/** 领奖台开场留给胜利号角 + 掌声的时长（秒），之后才进庆祝循环。 */
export const FANFARE_SEC = 2.6

export function musicMode(i: MusicInputs): MusicMode {
  if (i.stalled) return 'silent'
  if (i.phase === MatchPhase.Warmup || i.phase === MatchPhase.Running) return 'main'
  if (i.phase === MatchPhase.Endgame) return 'final'
  if (i.matchEndedTick === null) return 'results'
  const elapsed = (i.renderTick - i.matchEndedTick) / i.tickRateHz
  if (elapsed < FANFARE_SEC) return 'silent'
  if (elapsed * 1000 < i.podiumMs) return 'podium'
  return 'results'
}

export interface Variant {
  bpm: number
  /** 相对音乐总线的整体音量。 */
  gain: number
  /** 旋律再叠一层高八度。 */
  octaveLayer: boolean
  /** tick：0 = 无，1 = 反拍，2 = 每个十六分。 */
  ticks: 0 | 1 | 2
  /** 贝斯：每小节几下（1 / 2 / 3）。 */
  bassHits: 1 | 2 | 3
}

export const VARIANTS: Readonly<Record<Exclude<MusicMode, 'silent'>, Variant>> = {
  main: { bpm: 112, gain: 1, octaveLayer: false, ticks: 1, bassHits: 3 },
  final: { bpm: 128, gain: 1.1, octaveLayer: true, ticks: 2, bassHits: 3 },
  podium: { bpm: 120, gain: 0.8, octaveLayer: true, ticks: 1, bassHits: 2 },
  results: { bpm: 96, gain: 0.55, octaveLayer: false, ticks: 0, bassHits: 1 },
}

/** 音乐总线音量（规格：低音量 0.18）。 */
export const MUSIC_BUS_GAIN = 0.18

export const STEPS_PER_BAR = 16
export const BARS = 8
export const LOOP_STEPS = STEPS_PER_BAR * BARS

/**
 * 旋律：每小节 16 个十六分音符格。数字 = 五声音阶级数（0 = C4，5 = C5 …），`-` = 延音，`.` = 休止。
 * 和声走 C – Am – F – G – C – Am – F/G – C。
 */
export const MELODY: readonly string[] = [
  '0-2-3-5-3-2-3---',
  '4-5-4-3-2---0---',
  '5-4-5-7-6-5-4---',
  '3-4-3-2-1---3---',
  '0-2-3-5-7-5-3---',
  '4-5-7-5-4---2---',
  '5-4-3-2-1-2-3-4-',
  '5-------3-2-0---',
]

/** 每小节贝斯根音（Hz，C3 / A2 / F2 / G2 一带）；第 7 小节后半换到 G。 */
const BASS_ROOT: readonly number[] = [130.81, 110, 87.31, 98, 130.81, 110, 87.31, 130.81]
const BAR7_SECOND_HALF = 98

const PENTA = [0, 2, 4, 7, 9]

/** 五声级数 → 频率，0 级 = C4（261.63 Hz）。 */
export function pentaFreq(step: number): number {
  const octave = Math.floor(step / PENTA.length)
  const semis = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length] + 12 * octave
  return 261.63 * 2 ** (semis / 12)
}

export type MusicVoice = 'lead' | 'high' | 'bass' | 'tick'

export interface MusicNote {
  voice: MusicVoice
  /** AudioContext 时间（秒）。 */
  time: number
  freq: number
  dur: number
  /** 0..1，已乘变奏音量，未乘总线音量。 */
  gain: number
}

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4
}

/** 第 `step` 格（0..LOOP_STEPS-1）在变奏 `v` 下该响的音符；time 由调用方给。 */
export function notesAt(step: number, v: Variant, time: number): MusicNote[] {
  const out: MusicNote[] = []
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS
  const s = step % STEPS_PER_BAR
  const sp = stepSeconds(v.bpm)
  const line = MELODY[bar]
  const ch = line[s]
  if (ch >= '0' && ch <= '9') {
    let len = 1
    while (s + len < STEPS_PER_BAR && line[s + len] === '-') len++
    const f = pentaFreq(Number(ch))
    const dur = len * sp * 0.92
    out.push({ voice: 'lead', time, freq: f, dur, gain: 0.5 * v.gain })
    if (v.octaveLayer) out.push({ voice: 'high', time, freq: f * 2, dur: Math.min(dur, sp * 2), gain: 0.2 * v.gain })
  }
  const root = bar === 6 && s >= 8 ? BAR7_SECOND_HALF : BASS_ROOT[bar]
  const bassSteps = v.bassHits === 1 ? [0] : v.bassHits === 2 ? [0, 8] : [0, 6, 8]
  if (bassSteps.includes(s)) {
    const fifth = s === 6
    out.push({ voice: 'bass', time, freq: fifth ? root * 1.5 : root, dur: sp * (fifth ? 1.6 : 3.2), gain: (fifth ? 0.35 : 0.55) * v.gain })
  }
  const tick = v.ticks === 2 ? true : v.ticks === 1 ? s % 4 === 2 : false
  if (tick) out.push({ voice: 'tick', time, freq: s % 4 === 2 ? 3200 : 2400, dur: 0.025, gain: (s % 4 === 2 ? 0.16 : 0.08) * v.gain })
  return out
}

/**
 * 前瞻排程：每帧调 `schedule(now, horizon)`，把 [now, now + horizon) 内的格子排成音符。
 * 换变奏时从下一格起回到循环开头；掉帧 / 切后台回来落后太多时重新对齐，不补放历史。
 */
export class MusicSequencer {
  private mode: MusicMode = 'silent'
  private nextTime: number | null = null
  private step = 0

  getMode(): MusicMode {
    return this.mode
  }

  setMode(mode: MusicMode): boolean {
    if (mode === this.mode) return false
    this.mode = mode
    this.step = 0
    if (mode === 'silent') this.nextTime = null
    return true
  }

  schedule(now: number, horizon = 0.25): MusicNote[] {
    if (this.mode === 'silent') return []
    const v = VARIANTS[this.mode]
    if (this.nextTime === null || this.nextTime < now - 0.1) {
      this.nextTime = now + 0.05
      this.step = 0
    }
    const out: MusicNote[] = []
    const sp = stepSeconds(v.bpm)
    while (this.nextTime < now + horizon) {
      for (const n of notesAt(this.step, v, this.nextTime)) out.push(n)
      this.nextTime += sp
      this.step = (this.step + 1) % LOOP_STEPS
    }
    return out
  }
}
