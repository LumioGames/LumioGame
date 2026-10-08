import { MUSIC_BUS_GAIN } from './music'

/**
 * 音频的纯逻辑部分（无 WebAudio，可单测）：定位衰减、声部上限与抢占、爆炸限流、五声音阶；
 * 分层混音（总线路由、距离 → 低通、近处低频冲击、爆炸并发封顶与合并、大事件压低世界总线、本人脚步）。
 */

// ---------------------------------------------------------------- 分层混音（推断待验证（用户 2026-09-28 反馈））

/** 分贝 → 线性增益。 */
export function dbToGain(db: number): number {
  return db === 0 ? 1 : 10 ** (db / 20)
}

/**
 * 四条总线（推断待验证（用户 2026-09-28 反馈）「声音没有层次感」）：本人（自己的放弹 / 踢弹 / 拾取 / 技能 / 受击 / 击杀确认 / 脚步）、
 * 世界（别人的一切）、UI（界面与全场提示：倒计时、决赛圈、缩圈、号角、掌声）、音乐。世界总线整体比本人低 6 dB。
 */
export const MIX = {
  self: 1,
  world: dbToGain(-6),
  ui: 0.9,
  music: MUSIC_BUS_GAIN,
  /** 三条音效总线汇到一起再进压缩器的总增益（原 SFX 总线 0.8）。 */
  sfxMaster: 0.8,
} as const

export type Bus = 'self' | 'world' | 'ui'
export type SoundSource = 'self' | 'other' | 'ui' | 'announce'

/** 声源 → 总线：本机玩家 → self，别人 → world，界面与全场提示 → ui。 */
export function busFor(source: SoundSource): Bus {
  return source === 'self' ? 'self' : source === 'other' ? 'world' : 'ui'
}

/** 不加滤波时的「全开」截止频率（Hz）。 */
export const LOWPASS_OPEN_HZ = 20000

/** 爆炸与距离感（推断待验证（用户 2026-09-28 反馈））。 */
export const EXPLOSION_MIX = {
  /** 这么近以内不加低通（格）。 */
  nearCells: 3,
  /** 这么远以外只剩闷响：低通截到 farLowpassHz（格）。 */
  farCells: 14,
  farLowpassHz: 700,
  /** 低频冲击：thumpFullCells 格内满、thumpZeroCells 格外没有。 */
  thumpFullCells: 3,
  thumpZeroCells: 8,
  /** 同时发声的爆炸上限；超出的合并成一次更大的轰鸣。 */
  maxVoices: 4,
  /** 一声爆炸占着「并发名额」的时长（秒，≈ 爆炸音主体长度）。 */
  voiceSec: 0.55,
  rumbleBaseGain: 0.55,
  rumblePerMerged: 0.12,
  rumbleMaxGain: 1.1,
} as const

/** 距离 → 低通截止频率：nearCells 内全开，farCells 外 farLowpassHz，中间按对数插值（越远越闷）。 */
export function distanceLowpassHz(d: number): number {
  const t = Math.max(0, Math.min(1, (d - EXPLOSION_MIX.nearCells) / (EXPLOSION_MIX.farCells - EXPLOSION_MIX.nearCells)))
  if (t <= 0) return LOWPASS_OPEN_HZ
  if (t >= 1) return EXPLOSION_MIX.farLowpassHz
  return LOWPASS_OPEN_HZ * (EXPLOSION_MIX.farLowpassHz / LOWPASS_OPEN_HZ) ** t
}

/** 近处爆炸的低频冲击层增益（0..1）：thumpFullCells 内满，thumpZeroCells 外为 0，中间平滑。 */
export function explosionThump(d: number): number {
  const t = Math.max(0, Math.min(1, (d - EXPLOSION_MIX.thumpFullCells) / (EXPLOSION_MIX.thumpZeroCells - EXPLOSION_MIX.thumpFullCells)))
  return 1 - t * t * (3 - 2 * t)
}

/** 别人的放弹声：只在 hearCells 格内、很轻（推断待验证（用户 2026-09-28 反馈））。 */
export const OTHER_BOMB_PLACE = { hearCells: 6, maxGain: 0.3 } as const

export function otherBombPlaceGain(d: number): number {
  if (d >= OTHER_BOMB_PLACE.hearCells) return 0
  return OTHER_BOMB_PLACE.maxGain * (1 - Math.max(0, d) / OTHER_BOMB_PLACE.hearCells)
}

/** 爆炸并发封顶：同时最多 maxVoices 声，超出的记数，由调用方合并成一次 {@link rumbleGain} 的轰鸣。 */
export class ExplosionCap {
  private readonly ends: number[] = []
  private overflow = 0

  constructor(
    readonly max: number = EXPLOSION_MIX.maxVoices,
    readonly voiceSec: number = EXPLOSION_MIX.voiceSec,
  ) {}

  admit(at: number): boolean {
    let keep = 0
    for (const e of this.ends) if (e > at) this.ends[keep++] = e
    this.ends.length = keep
    if (this.ends.length < this.max) {
      this.ends.push(at + this.voiceSec)
      return true
    }
    this.overflow++
    return false
  }

  /** 取走并清零这段时间里被挡下的爆炸数。 */
  takeOverflow(): number {
    const n = this.overflow
    this.overflow = 0
    return n
  }
}

/** 合并轰鸣的增益：合并得越多越响，封顶。 */
export function rumbleGain(merged: number): number {
  return Math.min(EXPLOSION_MIX.rumbleMaxGain, EXPLOSION_MIX.rumbleBaseGain + EXPLOSION_MIX.rumblePerMerged * Math.max(0, merged))
}

/** 大事件（本人击杀、击倒 Boss、补给开启）时世界总线短暂压低（推断待验证（用户 2026-09-28 反馈））。 */
export const DUCK = { db: -6, attackSec: 0.03, holdSec: 0.4, releaseSec: 0.15 } as const

/** 压低包络：start 起 attack 内线性降到 −6 dB，保持 holdSec，再 release 内回到 1。 */
export function duckGainAt(t: number, start: number): number {
  const u = t - start
  const low = dbToGain(DUCK.db)
  if (u < 0) return 1
  if (u < DUCK.attackSec) return 1 + (low - 1) * (u / DUCK.attackSec)
  if (u < DUCK.attackSec + DUCK.holdSec) return low
  const r = u - DUCK.attackSec - DUCK.holdSec
  if (r < DUCK.releaseSec) return low + (1 - low) * (r / DUCK.releaseSec)
  return 1
}

/** 本人脚步（别人的脚步不发声）：每走 everyCells 格一步（推断待验证（用户 2026-09-28 反馈））。 */
export const FOOTSTEP = { everyCells: 0.5, teleportCells: 1.5, gain: 0.16, waterGain: 0.24 } as const

export class FootstepClock {
  private last: { x: number; z: number } | null = null
  private acc = 0

  /** @returns 该响一步时的地面种类；不响为 null。重生 / 闪现这类大跳不算走。 */
  advance(x: number, z: number, inWater: boolean): 'ground' | 'water' | null {
    const last = this.last
    this.last = { x, z }
    if (!last) return null
    const d = Math.hypot(x - last.x, z - last.z)
    if (d > FOOTSTEP.teleportCells) {
      this.acc = 0
      return null
    }
    this.acc += d
    if (this.acc < FOOTSTEP.everyCells) return null
    this.acc = this.acc - FOOTSTEP.everyCells >= FOOTSTEP.everyCells ? 0 : this.acc - FOOTSTEP.everyCells
    return inWater ? 'water' : 'ground'
  }

  reset(): void {
    this.last = null
    this.acc = 0
  }
}

/**
 * 有世界位置的音效（爆炸、连锁、放弹、别人的受击 / 倒下、金币串、宝箱、补给…）按离本机玩家的距离衰减
 * （用户试玩反馈 2026-09-28，推断待验证）：fullCells 格内满音量，silentCells 格外静音，中间 smoothstep 平滑过渡；
 * 声像按左右偏移 Δx / panCells 夹到 [-1, 1]（Synth 每个声部一个 StereoPannerNode）。
 * 本人自己的操作音（放弹、拾取、受击、击杀 / 命中确认）与 UI 音不走这里、不衰减。单位为格。
 */
export const SPATIAL = { fullCells: 4, silentCells: 14, panCells: 8 } as const

/** 距离 → 增益：≤ fullCells 为 1，≥ silentCells 为 0，中间 1 − smoothstep。 */
export function distanceGain(d: number): number {
  const t = Math.max(0, Math.min(1, (d - SPATIAL.fullCells) / (SPATIAL.silentCells - SPATIAL.fullCells)))
  return 1 - t * t * (3 - 2 * t)
}

/** 以本机玩家为听者：增益按 {@link distanceGain}，声像按 Δx / panCells。 */
export function spatialize(dx: number, dz: number): { gain: number; pan: number } {
  return { gain: distanceGain(Math.hypot(dx, dz)), pan: Math.max(-1, Math.min(1, dx / SPATIAL.panCells)) }
}

/**
 * 声部簿：最多 `max` 个同时发声，满了抢占最早开始的那个（返回被抢占的声部，调用方负责静音断开）。
 */
export class VoiceBook<T> {
  private readonly live: { item: T; end: number }[] = []

  constructor(readonly max = 24) {}

  add(item: T, end: number, now: number): T[] {
    this.prune(now)
    const stolen: T[] = []
    while (this.live.length >= this.max) {
      const v = this.live.shift()
      if (v) stolen.push(v.item)
    }
    this.live.push({ item, end })
    return stolen
  }

  prune(now: number): void {
    let keep = 0
    for (const v of this.live) if (v.end > now) this.live[keep++] = v
    this.live.length = keep
  }

  size(): number {
    return this.live.length
  }
}

/** 滑动窗口限流：窗口 `windowSec` 内最多 `max` 次（爆炸音 ≤ 6 次 / 100 ms）。时间单位同 AudioContext（秒）。 */
export class RateLimiter {
  private readonly times: number[] = []

  constructor(
    readonly max = 6,
    readonly windowSec = 0.1,
  ) {}

  allow(t: number): boolean {
    while (this.times.length && this.times[0] <= t - this.windowSec) this.times.shift()
    if (this.times.length >= this.max) return false
    // 调度时间可能乱序（连锁错开），按序插入保持窗口判断正确。
    let i = this.times.length
    while (i > 0 && this.times[i - 1] > t) i--
    this.times.splice(i, 0, t)
    return true
  }
}

/** C 大调五声音阶，从 C5 往上；连锁每多一颗升一级。 */
export function pentatonicHz(step: number): number {
  const degrees = [0, 2, 4, 7, 9]
  const octave = Math.floor(step / degrees.length)
  const semis = degrees[((step % degrees.length) + degrees.length) % degrees.length] + 12 * octave
  return 523.25 * 2 ** (semis / 12)
}

/** 连锁里第 i 颗的表现延迟（与 view 同口径：每颗 40 ms，封顶 320 ms），秒。 */
export function chainDelaySec(i: number): number {
  return Math.min(i * 0.04, 0.32)
}
