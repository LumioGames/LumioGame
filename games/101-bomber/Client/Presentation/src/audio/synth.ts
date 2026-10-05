import { dbToGain, DUCK, LOWPASS_OPEN_HZ, MIX, VoiceBook, type Bus } from './mixing'
import { MUSIC_BUS_GAIN, type MusicNote, type MusicVoice } from './music'

/**
 * WebAudio 合成器：master（压缩器）← 音效总汇 0.8 ← 本人 / 世界（再过一级压低节点）/ UI 三条总线 ← 每个音效一个声部
 *                                                   （增益 → 可选距离低通 → 声像）；
 *                              ← 音乐总线 0.18 ← 每个音符一对振荡器 + 包络（不占音效声部上限）。
 * 分层混音（用户 2026-09-28 反馈，mixing.MIX / DUCK）：世界总线比本人低 6 dB，大事件时再压低 6 dB 约 0.4 秒。
 * 全部程序合成，无音频资源文件。
 */
interface Voice {
  out: GainNode
  pan: StereoPannerNode
  filter: BiquadFilterNode | null
  sources: AudioScheduledSourceNode[]
}

/** 声部的去向：总线（缺省 world）与距离低通。 */
export interface VoiceRoute {
  bus?: Bus
  lowpassHz?: number
}

/** 增益低于它的声部直接不开（远处按距离衰减到听不见的，不占声部上限）。 */
const MIN_AUDIBLE = 0.004

export interface ToneSpec {
  type?: OscillatorType
  f0: number
  f1?: number
  at: number
  dur: number
  peak?: number
  attack?: number
}

export interface NoiseSpec {
  at: number
  dur: number
  filter?: BiquadFilterType
  f0: number
  f1?: number
  q?: number
  peak?: number
  attack?: number
}

export class Synth {
  readonly ctx: AudioContext
  private readonly master: GainNode
  private readonly sfx: GainNode
  private readonly buses: Record<Bus, GainNode>
  private readonly worldDuck: GainNode
  private readonly noise: AudioBuffer
  private readonly voices = new VoiceBook<Voice>(24)
  private readonly hissGain: GainNode
  private readonly music: GainNode
  private muted = false
  private musicOn = true

  constructor() {
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.2
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.sfx = this.ctx.createGain()
    this.sfx.gain.value = MIX.sfxMaster
    this.sfx.connect(comp)
    const bus = (g: number, to: AudioNode): GainNode => {
      const n = this.ctx.createGain()
      n.gain.value = g
      n.connect(to)
      return n
    }
    this.worldDuck = bus(1, this.sfx)
    this.buses = { self: bus(MIX.self, this.sfx), world: bus(MIX.world, this.worldDuck), ui: bus(MIX.ui, this.sfx) }
    this.music = this.ctx.createGain()
    this.music.gain.value = MUSIC_BUS_GAIN
    this.music.connect(comp)
    comp.connect(this.master)
    this.master.connect(this.ctx.destination)

    const len = Math.floor(this.ctx.sampleRate * 1.5)
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    // 表现层允许用 Math.random（规则层才要求确定性）。
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    // 引信嘶嘶声：全局共用一条循环噪声，按附近炸弹调音量。
    const hiss = this.ctx.createBufferSource()
    hiss.buffer = this.noise
    hiss.loop = true
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 4200
    bp.Q.value = 0.9
    this.hissGain = this.ctx.createGain()
    this.hissGain.gain.value = 0
    hiss.connect(bp)
    bp.connect(this.hissGain)
    this.hissGain.connect(this.sfx)
    hiss.start()
  }

  now(): number {
    return this.ctx.currentTime
  }

  isMuted(): boolean {
    return this.muted
  }

  setMuted(m: boolean): void {
    this.muted = m
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.03)
  }

  /** 背景音乐开关（与总静音分开：音乐可关、音效照响）。 */
  setMusicEnabled(on: boolean): void {
    this.musicOn = on
    const t = this.ctx.currentTime
    this.music.gain.cancelScheduledValues(t)
    this.music.gain.setTargetAtTime(on ? MUSIC_BUS_GAIN : 0, t, 0.08)
  }

  isMusicEnabled(): boolean {
    return this.musicOn
  }

  /** 一个音乐音符：直接挂音乐总线，播完自动断开。 */
  musicNote(n: MusicNote): void {
    const o = this.ctx.createOscillator()
    o.type = MUSIC_WAVE[n.voice]
    o.frequency.setValueAtTime(n.freq, n.time)
    if (n.voice === 'tick') o.frequency.exponentialRampToValueAtTime(n.freq * 0.6, n.time + n.dur)
    const g = this.ctx.createGain()
    const attack = n.voice === 'tick' ? 0.002 : n.voice === 'bass' ? 0.015 : 0.01
    this.envelope(g.gain, n.time, n.dur, Math.max(0.0002, n.gain), attack)
    o.connect(g)
    g.connect(this.music)
    o.start(n.time)
    o.stop(n.time + n.dur + 0.03)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
    }
  }

  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setHiss(level: number): void {
    this.hissGain.gain.setTargetAtTime(this.muted ? 0 : level, this.ctx.currentTime, 0.08)
  }

  /**
   * 开一个声部；`end` 之后自动断开。route：进哪条总线（缺省 world）、要不要按距离加低通。
   * 增益太小（远到听不见）时返回 null，后续 tone / noiseBurst 自动跳过。
   */
  voice(at: number, dur: number, gain: number, pan: number, route?: VoiceRoute): Voice | null {
    if (gain < MIN_AUDIBLE) return null
    const out = this.ctx.createGain()
    out.gain.value = gain
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    let filter: BiquadFilterNode | null = null
    const lp = route?.lowpassHz
    if (lp !== undefined && lp < LOWPASS_OPEN_HZ * 0.9) {
      filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = lp
      filter.Q.value = 0.6
      out.connect(filter)
      filter.connect(p)
    } else {
      out.connect(p)
    }
    p.connect(this.buses[route?.bus ?? 'world'])
    const v: Voice = { out, pan: p, filter, sources: [] }
    const end = at + dur + 0.05
    for (const s of this.voices.add(v, end, this.ctx.currentTime)) this.kill(s)
    setTimeout(() => this.disconnect(v), Math.max(0, (end - this.ctx.currentTime) * 1000 + 100))
    return v
  }

  /**
   * 大事件（本人击杀、击倒 Boss、补给开启）：世界总线在 at 起 attack 内降 6 dB、保持 holdSec、再 release 回来
   * （与 mixing.duckGainAt 同一包络）。连着来就从当前值接着压。
   */
  duck(at: number): void {
    const g = this.worldDuck.gain
    const low = dbToGain(DUCK.db)
    const t = Math.max(at, this.ctx.currentTime)
    const holdable = g as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }
    if (holdable.cancelAndHoldAtTime) holdable.cancelAndHoldAtTime(t)
    else {
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
    }
    g.linearRampToValueAtTime(low, t + DUCK.attackSec)
    g.setValueAtTime(low, t + DUCK.attackSec + DUCK.holdSec)
    g.linearRampToValueAtTime(1, t + DUCK.attackSec + DUCK.holdSec + DUCK.releaseSec)
  }

  tone(v: Voice | null, s: ToneSpec): void {
    if (!v) return
    const o = this.ctx.createOscillator()
    o.type = s.type ?? 'sine'
    o.frequency.setValueAtTime(s.f0, s.at)
    if (s.f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), s.at + s.dur)
    const g = this.ctx.createGain()
    this.envelope(g.gain, s.at, s.dur, s.peak ?? 0.5, s.attack ?? 0.005)
    o.connect(g)
    g.connect(v.out)
    o.start(s.at)
    o.stop(s.at + s.dur + 0.02)
    v.sources.push(o)
  }

  noiseBurst(v: Voice | null, s: NoiseSpec): void {
    if (!v) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = s.filter ?? 'lowpass'
    f.frequency.setValueAtTime(s.f0, s.at)
    if (s.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), s.at + s.dur)
    f.Q.value = s.q ?? 0.7
    const g = this.ctx.createGain()
    this.envelope(g.gain, s.at, s.dur, s.peak ?? 0.5, s.attack ?? 0.004)
    src.connect(f)
    f.connect(g)
    g.connect(v.out)
    const offset = Math.random() * Math.max(0, this.noise.duration - s.dur - 0.1)
    src.start(s.at, offset, s.dur + 0.05)
    v.sources.push(src)
  }

  dispose(): void {
    void this.ctx.close()
  }

  private envelope(p: AudioParam, at: number, dur: number, peak: number, attack: number): void {
    p.setValueAtTime(0.0001, at)
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(attack, dur * 0.5))
    p.exponentialRampToValueAtTime(0.0001, at + dur)
  }

  private kill(v: Voice): void {
    const t = this.ctx.currentTime
    v.out.gain.cancelScheduledValues(t)
    v.out.gain.setTargetAtTime(0, t, 0.01)
    for (const s of v.sources) {
      try {
        s.stop(t + 0.05)
      } catch {
        // 已经停过的源再 stop 会抛，忽略。
      }
    }
  }

  private disconnect(v: Voice): void {
    try {
      v.out.disconnect()
      v.filter?.disconnect()
      v.pan.disconnect()
    } catch {
      // 已断开。
    }
  }
}

const MUSIC_WAVE: Readonly<Record<MusicVoice, OscillatorType>> = {
  lead: 'triangle',
  high: 'sine',
  bass: 'sine',
  tick: 'sine',
}
