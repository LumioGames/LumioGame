import { pentatonicHz } from './mixing'
import type { Synth } from './synth'

/**
 * 音效配方（render-design §6）。每个函数开一个声部：`at` 为 AudioContext 时间，`gain` / `pan` 已含定位。
 */
export interface Placement {
  at: number
  gain: number
  pan: number
}

export function bombPlace(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.2, p.gain, p.pan)
  s.tone(v, { f0: 220, f1: 140, at: p.at, dur: 0.14, peak: 0.55 })
  s.noiseBurst(v, { filter: 'highpass', f0: 3000, at: p.at, dur: 0.02, peak: 0.35 })
}

export function explosion(s: Synth, p: Placement, pitch: number): void {
  const v = s.voice(p.at, 0.65, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'lowpass', f0: 1800 * pitch, f1: 200 * pitch, at: p.at, dur: 0.55, peak: 0.9, q: 0.9 })
  s.tone(v, { f0: 90 * pitch, f1: 40 * pitch, at: p.at, dur: 0.38, peak: 0.9 })
}

export function chainNote(s: Synth, p: Placement, step: number): void {
  const v = s.voice(p.at, 0.2, p.gain, p.pan)
  s.tone(v, { type: 'triangle', f0: pentatonicHz(step), at: p.at, dur: 0.18, peak: 0.4 })
}

export function brickClack(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.16, p.gain, p.pan)
  const fs = [760, 940, 640]
  fs.forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, f1: f * 0.8, at: p.at + i * 0.035, dur: 0.04, peak: 0.28 }))
}

export function candy(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.3, p.gain, p.pan)
  ;[1318.5, 1568, 2093].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: p.at + i * 0.07, dur: 0.1, peak: 0.3 }))
}

export function healthPack(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.6, p.gain, p.pan)
  ;[261.6, 329.6, 392].forEach((f) => s.tone(v, { f0: f, at: p.at, dur: 0.55, peak: 0.22, attack: 0.03 }))
  s.tone(v, { f0: 400, f1: 1600, at: p.at + 0.05, dur: 0.15, peak: 0.2 })
}

export function hatPickup(s: Synth, p: Placement, semitone: number): void {
  const v = s.voice(p.at, 0.16, p.gain, p.pan)
  s.tone(v, { type: 'square', f0: 660 * 2 ** (Math.min(semitone, 24) / 12), at: p.at, dur: 0.12, peak: 0.16 })
}

/** 捏玩具的吱声：先升后降。 */
export function hurt(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.3, p.gain, p.pan)
  s.tone(v, { f0: 900, f1: 1500, at: p.at, dur: 0.08, peak: 0.35 })
  s.tone(v, { f0: 1500, f1: 700, at: p.at + 0.08, dur: 0.16, peak: 0.3 })
}

export function death(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.7, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'bandpass', f0: 900, f1: 400, at: p.at, dur: 0.3, peak: 0.6, q: 1.2 })
  s.tone(v, { f0: 1200, f1: 280, at: p.at + 0.08, dur: 0.55, peak: 0.3 })
}

/** 木头「嗒」一声：玩偶被重新摆上桌。 */
export function respawn(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.12, p.gain, p.pan)
  s.tone(v, { f0: 540, f1: 470, at: p.at, dur: 0.07, peak: 0.5 })
  s.tone(v, { type: 'triangle', f0: 1080, at: p.at, dur: 0.04, peak: 0.2 })
}

export function heartbeat(s: Synth, at: number): void {
  const v = s.voice(at, 0.4, 0.9, 0)
  s.tone(v, { f0: 62, f1: 50, at, dur: 0.13, peak: 0.8, attack: 0.01 })
  s.tone(v, { f0: 124, f1: 100, at, dur: 0.1, peak: 0.25 })
  s.tone(v, { f0: 56, f1: 45, at: at + 0.2, dur: 0.11, peak: 0.6, attack: 0.01 })
}

export function fanfare(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.9, p.gain, p.pan)
  const notes = [392, 523.25, 659.25, 783.99]
  notes.forEach((f, i) => {
    const last = i === notes.length - 1
    s.tone(v, { type: 'triangle', f0: f, at: p.at + i * 0.1, dur: last ? 0.45 : 0.12, peak: 0.35 })
    s.tone(v, { type: 'square', f0: f, at: p.at + i * 0.1, dur: last ? 0.4 : 0.1, peak: 0.07 })
  })
}

/** 滑哨下落：帽王倒台。 */
export function kingFall(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.9, p.gain, p.pan)
  s.tone(v, { f0: 1500, f1: 300, at: p.at, dur: 0.8, peak: 0.3, attack: 0.02 })
}

export function countdownTick(s: Synth, at: number, high: boolean): void {
  const v = s.voice(at, 0.08, 0.6, 0)
  s.tone(v, { f0: high ? 1500 : 1000, at, dur: 0.06, peak: 0.3 })
}

export function dangerBlip(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.06, p.gain, p.pan)
  s.tone(v, { type: 'square', f0: 1200, at: p.at, dur: 0.05, peak: 0.12 })
}

export function fizz(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.35, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'highpass', f0: 2500, f1: 5000, at: p.at, dur: 0.3, peak: 0.25 })
}

export function matchEnd(s: Synth, at: number): void {
  const v = s.voice(at, 1.2, 0.8, 0)
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: at + i * 0.12, dur: 0.14, peak: 0.3 }))
  ;[523.25, 659.25, 783.99].forEach((f) => s.tone(v, { type: 'triangle', f0: f, at: at + 0.5, dur: 0.6, peak: 0.2, attack: 0.02 }))
}

/** 毒圈扣血：一下柔和的低频嗡（锯齿过低通感，用两只略失谐的方波叠出来）。 */
export function poisonBuzz(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.3, p.gain, p.pan)
  s.tone(v, { type: 'sawtooth', f0: 110, f1: 92, at: p.at, dur: 0.24, peak: 0.16, attack: 0.02 })
  s.tone(v, { type: 'square', f0: 111.5, f1: 93, at: p.at, dur: 0.22, peak: 0.07, attack: 0.02 })
}

/** 宝箱挨一炸：木头「空」一声。 */
export function chestHit(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.22, p.gain, p.pan)
  s.tone(v, { f0: 300, f1: 210, at: p.at, dur: 0.12, peak: 0.55, attack: 0.002 })
  s.tone(v, { type: 'triangle', f0: 620, f1: 480, at: p.at, dur: 0.06, peak: 0.25, attack: 0.002 })
}

/** 宝箱开启：闪亮的上行琶音。 */
export function chestOpen(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.9, p.gain, p.pan)
  ;[783.99, 987.77, 1174.66, 1567.98, 1975.53].forEach((f, i) =>
    s.tone(v, { type: 'triangle', f0: f, at: p.at + i * 0.06, dur: 0.22, peak: 0.26 }),
  )
  s.tone(v, { type: 'sine', f0: 3135.96, at: p.at + 0.32, dur: 0.4, peak: 0.12 })
}

/** 出局：悲伤的下滑。 */
export function eliminated(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 1.1, p.gain, p.pan)
  s.tone(v, { type: 'triangle', f0: 523.25, f1: 392, at: p.at, dur: 0.35, peak: 0.3, attack: 0.02 })
  s.tone(v, { type: 'triangle', f0: 466.16, f1: 261.63, at: p.at + 0.35, dur: 0.7, peak: 0.28, attack: 0.02 })
}

/** 帽子落上帽塔（吃到强化，ADR 0028）：「啵」+ 一声铃。 */
export function hatMint(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.5, p.gain, p.pan)
  s.tone(v, { f0: 380, f1: 900, at: p.at, dur: 0.07, peak: 0.45, attack: 0.002 })
  s.tone(v, { type: 'triangle', f0: 1318.51, at: p.at + 0.08, dur: 0.35, peak: 0.22 })
  s.tone(v, { type: 'sine', f0: 2637.02, at: p.at + 0.08, dur: 0.25, peak: 0.07 })
}

/** 决赛圈开场：低音鼓点 + 上行三音。 */
export function finalStinger(s: Synth, at: number): void {
  const v = s.voice(at, 1.1, 0.85, 0)
  s.tone(v, { f0: 120, f1: 50, at, dur: 0.35, peak: 0.7, attack: 0.004 })
  ;[392, 466.16, 587.33].forEach((f, i) => {
    s.tone(v, { type: 'square', f0: f, at: at + 0.18 + i * 0.14, dur: i === 2 ? 0.5 : 0.13, peak: 0.1 })
    s.tone(v, { type: 'triangle', f0: f, at: at + 0.18 + i * 0.14, dur: i === 2 ? 0.55 : 0.14, peak: 0.26 })
  })
}

/** 缩圈预告：两声柔和提示铃。 */
export function ringWarn(s: Synth, at: number): void {
  const v = s.voice(at, 0.5, 0.6, 0)
  s.tone(v, { type: 'triangle', f0: 880, at, dur: 0.14, peak: 0.22 })
  s.tone(v, { type: 'triangle', f0: 660, at: at + 0.16, dur: 0.22, peak: 0.2 })
}

/**
 * 领奖台胜利号角（design §13）：铜管感的 G–C–E–G 上行 + 长和弦；本人第一时更亮（高八度 + 更响的方波）。
 */
export function victoryFanfare(s: Synth, at: number, bright: boolean): void {
  const v = s.voice(at, 2.4, bright ? 0.95 : 0.75, 0)
  const lift = bright ? 2 : 1
  const run = [392, 523.25, 659.25, 783.99]
  run.forEach((f, i) => {
    s.tone(v, { type: 'triangle', f0: f * lift, at: at + i * 0.13, dur: 0.14, peak: 0.32 })
    s.tone(v, { type: 'square', f0: f, at: at + i * 0.13, dur: 0.12, peak: bright ? 0.1 : 0.06 })
  })
  const chordAt = at + 0.58
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f) => {
    s.tone(v, { type: 'triangle', f0: f, at: chordAt, dur: 1.5, peak: 0.18, attack: 0.03 })
    if (bright) s.tone(v, { type: 'sine', f0: f * 2, at: chordAt, dur: 1.2, peak: 0.05, attack: 0.05 })
  })
  s.tone(v, { f0: 130.81, at: chordAt, dur: 1.4, peak: 0.35, attack: 0.02 })
}

/** 短促的掌声 / 欢呼：一串随机时刻的小噪声拍（规格允许领奖台用短噪声，音量低、约 2 秒）。 */
export function applause(s: Synth, at: number, jitter: () => number): void {
  const v = s.voice(at, 2.3, 0.45, 0)
  for (let i = 0; i < 26; i++) {
    const t = at + i * 0.075 + jitter() * 0.05
    const fade = 1 - i / 30
    s.noiseBurst(v, { filter: 'bandpass', f0: 1400 + jitter() * 1600, at: t, dur: 0.05, peak: 0.28 * fade, q: 1.4, attack: 0.002 })
  }
  // 两声口哨式欢呼。
  s.tone(v, { f0: 1500, f1: 2300, at: at + 0.2, dur: 0.28, peak: 0.08 })
  s.tone(v, { f0: 1700, f1: 2600, at: at + 0.9, dur: 0.3, peak: 0.07 })
}

// ---- 第 4 轮：角色技能（原型扩展 NON-CONTRACT，ADR 0030；音色为表现取值，推断待验证） ----

/** 吹泡泡：上滑的「啵噜」+ 一点高光。 */
export function skillBubble(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.5, p.gain, p.pan)
  s.tone(v, { f0: 300, f1: 900, at: p.at, dur: 0.18, peak: 0.35, attack: 0.01 })
  s.tone(v, { type: 'triangle', f0: 1400, f1: 1800, at: p.at + 0.14, dur: 0.22, peak: 0.16 })
}

/** 闪现：一道高频扫过 + 落地轻响。 */
export function skillBlink(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.35, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'bandpass', f0: 2500, f1: 7000, at: p.at, dur: 0.14, peak: 0.3, q: 2 })
  s.tone(v, { type: 'square', f0: 1760, f1: 880, at: p.at, dur: 0.1, peak: 0.08 })
  s.tone(v, { f0: 520, f1: 420, at: p.at + 0.15, dur: 0.06, peak: 0.3 })
}

/** 点火：「呼」的低频噪声膨胀。 */
export function skillIgnite(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.6, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'lowpass', f0: 400, f1: 2400, at: p.at, dur: 0.5, peak: 0.5, attack: 0.08 })
  s.tone(v, { f0: 110, f1: 160, at: p.at, dur: 0.35, peak: 0.25, attack: 0.05 })
}

/** 技能按不出来：两声短促低音。 */
export function skillDenied(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.2, p.gain, p.pan)
  s.tone(v, { type: 'square', f0: 220, at: p.at, dur: 0.05, peak: 0.1 })
  s.tone(v, { type: 'square', f0: 185, at: p.at + 0.08, dur: 0.07, peak: 0.1 })
}

/** 获得技能 / 升级（升级更高一档）。 */
export function skillGain(s: Synth, p: Placement, levelUp: boolean): void {
  const v = s.voice(p.at, 0.5, p.gain, p.pan)
  const base = levelUp ? 784 : 659.25
  ;[1, 1.25, 1.5].forEach((k, i) => s.tone(v, { type: 'triangle', f0: base * k, at: p.at + i * 0.07, dur: 0.12, peak: 0.26 }))
}

/** 进化：上行琶音 + 闪亮和弦。 */
export function evolve(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 1.4, p.gain, p.pan)
  ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: p.at + i * 0.06, dur: 0.16, peak: 0.26 }))
  ;[1046.5, 1318.5, 1568].forEach((f) => s.tone(v, { type: 'sine', f0: f, at: p.at + 0.34, dur: 0.8, peak: 0.12, attack: 0.03 }))
  s.noiseBurst(v, { filter: 'highpass', f0: 5000, at: p.at + 0.3, dur: 0.4, peak: 0.08 })
}

/** 回春回血：柔和的两声铃。 */
export function regenChime(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.7, p.gain, p.pan)
  s.tone(v, { type: 'sine', f0: 880, at: p.at, dur: 0.3, peak: 0.2, attack: 0.02 })
  s.tone(v, { type: 'sine', f0: 1174.66, at: p.at + 0.12, dur: 0.45, peak: 0.18, attack: 0.02 })
}

/** 踢弹：木头「咚」+ 滑出去的摩擦。 */
export function kick(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.45, p.gain, p.pan)
  s.tone(v, { f0: 180, f1: 90, at: p.at, dur: 0.1, peak: 0.55, attack: 0.002 })
  s.noiseBurst(v, { filter: 'bandpass', f0: 900, f1: 500, at: p.at + 0.04, dur: 0.35, peak: 0.12, q: 1.5 })
}

/** 被冻住：冰裂的高频碎响。 */
export function freeze(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.5, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'highpass', f0: 4000, f1: 8000, at: p.at, dur: 0.18, peak: 0.25 })
  ;[2637, 3136, 2349].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: p.at + 0.03 + i * 0.05, dur: 0.08, peak: 0.12 }))
}

/** 烧伤：短促的「嘶」。 */
export function sizzle(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.3, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'highpass', f0: 3000, f1: 1800, at: p.at, dur: 0.25, peak: 0.22 })
}

/** 选角换卡。 */
export function uiSelect(s: Synth, at: number): void {
  const v = s.voice(at, 0.1, 0.6, 0)
  s.tone(v, { type: 'triangle', f0: 1046.5, at, dur: 0.05, peak: 0.2 })
}

/** 选角确认。 */
export function uiConfirm(s: Synth, at: number): void {
  const v = s.voice(at, 0.4, 0.7, 0)
  ;[659.25, 987.77].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: at + i * 0.08, dur: 0.14, peak: 0.26 }))
}

// ---- 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹 ----

/** 中毒：咕嘟冒泡 + 一口毒气的「嘶」（PlayerPoisoned）。 */
export function poisonHiss(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.6, p.gain, p.pan)
  s.noiseBurst(v, { filter: 'bandpass', f0: 1400, f1: 700, at: p.at, dur: 0.45, peak: 0.2, q: 2, attack: 0.02 })
  ;[440, 560, 380].forEach((f, i) => s.tone(v, { type: 'sine', f0: f, f1: f * 0.6, at: p.at + 0.04 + i * 0.09, dur: 0.07, peak: 0.16 }))
}

/** 毒发掉血：一颗小毒泡「啵」（DamageApplied，Cause = Toxin），比受击吱声轻。 */
export function toxinTick(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.2, p.gain, p.pan)
  s.tone(v, { type: 'sine', f0: 520, f1: 280, at: p.at, dur: 0.08, peak: 0.2 })
  s.tone(v, { type: 'sine', f0: 380, f1: 220, at: p.at + 0.06, dur: 0.07, peak: 0.14 })
}

/** 麻痹：电击「滋啦」——高频方波下扫 + 低频嗡 + 噼啪（PlayerShocked）。 */
export function zap(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.45, p.gain, p.pan)
  s.tone(v, { type: 'square', f0: 1900, f1: 520, at: p.at, dur: 0.12, peak: 0.13 })
  s.tone(v, { type: 'sawtooth', f0: 96, f1: 88, at: p.at + 0.02, dur: 0.3, peak: 0.12, attack: 0.01 })
  s.noiseBurst(v, { filter: 'highpass', f0: 5000, f1: 2500, at: p.at, dur: 0.16, peak: 0.2 })
}

/** 解毒：干净的上行三音（PlayerCured），与回春的两音区分。 */
export function cureChime(s: Synth, p: Placement): void {
  const v = s.voice(p.at, 0.6, p.gain, p.pan)
  ;[523.25, 783.99, 1046.5].forEach((f, i) => s.tone(v, { type: 'triangle', f0: f, at: p.at + i * 0.07, dur: 0.22, peak: 0.2, attack: 0.01 }))
}
