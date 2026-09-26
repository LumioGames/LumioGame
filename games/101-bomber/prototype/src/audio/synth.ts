import { VoiceBook } from './mixing'
import { MUSIC_BUS_GAIN, type MusicNote, type MusicVoice } from './music'

/**
 * WebAudio 合成器：master（压缩器）← SFX 总线 0.8 ← 每个音效一个声部（增益 + 声像）；
 *                              ← 音乐总线 0.18 ← 每个音符一对振荡器 + 包络（不占 SFX 声部上限）。
 * 全部程序合成，无音频资源文件。
 */
interface Voice {
  out: GainNode
  pan: StereoPannerNode
  sources: AudioScheduledSourceNode[]
}

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
    this.sfx.gain.value = 0.8
    this.sfx.connect(comp)
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

  /** 开一个声部；`end` 之后自动断开。 */
  voice(at: number, dur: number, gain: number, pan: number): Voice {
    const out = this.ctx.createGain()
    out.gain.value = gain
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    out.connect(p)
    p.connect(this.sfx)
    const v: Voice = { out, pan: p, sources: [] }
    const end = at + dur + 0.05
    for (const s of this.voices.add(v, end, this.ctx.currentTime)) this.kill(s)
    setTimeout(() => this.disconnect(v), Math.max(0, (end - this.ctx.currentTime) * 1000 + 100))
    return v
  }

  tone(v: Voice, s: ToneSpec): void {
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

  noiseBurst(v: Voice, s: NoiseSpec): void {
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
