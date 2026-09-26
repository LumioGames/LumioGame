import {
  BlockType,
  DEFAULT_RULES,
  MATERIALS,
  MatchPhase,
  PickupKind,
  type BombExploded,
  type ProtoRules,
  type U64,
  type WorldSnapshot,
} from '../contract'
import { BombStatusWatch } from '../present/bomb-status'
import type { FeedSample } from '../present/feed'
import { cellCenter } from '../shared/grid'
import { CrownWatch, DEATH_AFTER_HIT_SEC, HatGainWatch, hitCues, isPowerup, localIsWinner, SkillCueWatch } from './cues'
import { chainDelaySec, RateLimiter, spatialize } from './mixing'
import { musicMode, MusicSequencer } from './music'
import * as sfx from './sounds'
import { Synth } from './synth'

export interface AudioSystem {
  /** 在第一次用户手势里调用（浏览器自动播放策略）。 */
  unlock(): void
  /** 全部静音（M）：音乐与音效一起。 */
  setMuted(muted: boolean): void
  /** 背景音乐开关（HUD 右上按钮）：只管音乐，音效照响。 */
  setMusicEnabled(on: boolean): void
  /** 每帧调用：按 sample.dueEvents 播音效，按 renderTick 驱动持续音（引信、心跳）。 */
  update(sample: FeedSample, localPlayerId: U64): void
  /** 原型扩展（NON-CONTRACT，ADR 0030）：选角界面的换卡 / 确认音（在 unlock 之后才响）。 */
  ui(kind: 'select' | 'confirm'): void
  dispose(): void
}

/** 听得见引信 / 危险提示音的距离（格）。 */
const NEAR_CELLS = 9
const HEARTBEAT_MS = 900
/** 帽子连拾音高递增的连续间隔（秒）。 */
const HAT_STREAK_SEC = 1.5
/** 吃强化后帽子落到帽塔顶的时刻（与 view 的 0.3 s 落帽同步），秒。 */
const HAT_LAND_SEC = 0.3
/** 渲染 Tick 停住这么久（毫秒）就当暂停 / 后台，音乐静下来。 */
const STALL_MS = 400
/** 胜利号角之后多久起掌声（秒）。 */
const APPLAUSE_AFTER_SEC = 0.75
/**
 * HUD 音乐按钮的跨模块信号（与 hud/index.ts 的 MUSIC_EVENT 同名；hud 与 audio 互不 import）：
 * `CustomEvent<{ on: boolean }>`，派发在 globalThis 上。
 */
export const MUSIC_EVENT = 'lumio-bomber:music'

export function createAudio(opts: { muted: boolean; music?: boolean; rules?: ProtoRules }): AudioSystem {
  let synth: Synth | null = null
  let muted = opts.muted
  let musicOn = opts.music ?? true
  const rules = opts.rules ?? DEFAULT_RULES
  const crown = new CrownWatch(rules.hatKingPillarMinHats)
  const hatGain = new HatGainWatch()
  const skillCue = new SkillCueWatch()
  /** 原型扩展（NON-CONTRACT，ADR 0033）：没有中毒 / 麻痹 / 解毒事件的数据源用快照推本人中招。 */
  const statusCue = new BombStatusWatch()
  const seq = new MusicSequencer()
  let crownSnap: WorldSnapshot | null = null
  let stallTick = -1
  let stallSince = 0
  let matchEndedTick: number | null = null
  const boomLimit = new RateLimiter(6, 0.1)
  const clackLimit = new RateLimiter(4, 0.1)
  const blips = new Map<U64, number>()
  let lastHeartbeat = -Infinity
  let lastCountdown = -1
  let hatStreak = 0
  let hatStreakAt = -Infinity
  let sawBrickEvents = false
  let lastBrick: Uint8Array | null = null
  let lastRev = -1
  let lastMatch = -1

  const posOf = (snap: WorldSnapshot, id: U64): { x: number; z: number } | null => {
    const p = snap.Players.find((q) => q.NetEntityIdRaw === id)
    return p ? { x: p.LogicTransform.WorldPosition.x, z: p.LogicTransform.WorldPosition.z } : null
  }

  /** 连锁的爆炸位置：优先原型扩展的 Cell，否则在快照里找同链、同 Tick 爆炸的炸弹。 */
  const explosionPos = (e: BombExploded, s: FeedSample, used: Set<U64>): { x: number; z: number } | null => {
    if (e.proto?.Cell) {
      const c = cellCenter(e.proto.Cell.X, e.proto.Cell.Y)
      return { x: c.x, z: c.z }
    }
    for (const snap of [s.curr, s.prev]) {
      for (const b of snap.Bombs) {
        const st = b.BomberBombState
        if (used.has(b.NetEntityIdRaw) || st.ChainId !== e.ChainId || st.ExplodedAtTick !== e.Tick) continue
        if (st.OwnerNetEntityIdRaw !== e.SourceBombOwnerNetEntityIdRaw) continue
        used.add(b.NetEntityIdRaw)
        return { x: b.LogicTransform.WorldPosition.x, z: b.LogicTransform.WorldPosition.z }
      }
    }
    return null
  }

  const run = (s: Synth, sample: FeedSample, me: U64): void => {
    const t0 = s.now() + 0.01
    const snap = sample.curr
    const listener = posOf(snap, me) ?? { x: snap.Terrain.size / 2, z: snap.Terrain.size / 2 }
    const at = (x: number, z: number, scale = 1, delay = 0): sfx.Placement => {
      const sp = spatialize(x - listener.x, z - listener.z)
      return { at: t0 + delay, gain: sp.gain * scale, pan: sp.pan }
    }
    const here = (scale = 1, delay = 0): sfx.Placement => ({ at: t0 + delay, gain: scale, pan: 0 })
    /** 本人帽塔 +n：帽子落上去那一刻「啵」一声，连吃音高递增（design §3.1 收割）。 */
    const hatPop = (n: number): void => {
      if (t0 - hatStreakAt > HAT_STREAK_SEC) hatStreak = 0
      hatStreakAt = t0
      for (let i = 0; i < Math.min(n, 6); i++) {
        const d = HAT_LAND_SEC + i * 0.09
        sfx.hatMint(s, here(0.6, d))
        sfx.hatPickup(s, here(0.5, d), hatStreak++)
      }
    }
    const cellAt = (X: number, Y: number, scale = 1, delay = 0): sfx.Placement => at(X + 0.5, Y + 0.5, scale, delay)
    const prevKing = sample.prev.BomberMatchState.HatKingNetEntityIdRaw
    const minHats = rules.hatKingPillarMinHats
    // 受击 / 死亡音按 view 的连锁节奏错开（design §7.5）：每位受害者各自一张延迟表。
    const lastHit = new Map<U64, number>()
    const victims = new Set<U64>()
    for (const e of sample.dueEvents) if (e.type === 'DamageApplied') victims.add(e.VictimNetEntityIdRaw)
    for (const v of victims) {
      const cues = hitCues(sample.dueEvents, v)
      const p = v === me ? null : posOf(snap, v)
      for (const c of cues) {
        if (v === me) {
          if (c.poison) sfx.poisonBuzz(s, here(0.9, c.delay))
          else if (c.toxin) sfx.toxinTick(s, here(0.9, c.delay))
          else sfx.hurt(s, here(1, c.delay))
          if (c.burn) sfx.sizzle(s, here(0.8, c.delay))
        } else if (p && c.toxin) {
          sfx.toxinTick(s, at(p.x, p.z, 0.35, c.delay))
        } else if (p && !c.poison) {
          sfx.hurt(s, at(p.x, p.z, 0.45, c.delay))
          if (c.burn) sfx.sizzle(s, at(p.x, p.z, 0.4, c.delay))
        }
      }
      lastHit.set(v, cues.reduce((m, c) => Math.max(m, c.delay), 0))
    }

    // ---- 一次性事件 ----
    const chains = new Map<U64, BombExploded[]>()
    for (const e of sample.dueEvents) {
      switch (e.type) {
        case 'BombPlaced':
          sfx.bombPlace(s, e.OwnerNetEntityIdRaw === me ? here(0.9) : cellAt(e.Cell.X, e.Cell.Y, 0.8))
          break
        case 'BombExploded': {
          const list = chains.get(e.ChainId)
          if (list) list.push(e)
          else chains.set(e.ChainId, [e])
          break
        }
        case 'BrickDestroyed':
          sawBrickEvents = true
          if (clackLimit.allow(t0)) sfx.brickClack(s, cellAt(e.Cell.X, e.Cell.Y, 0.7, 0.03))
          break
        case 'BombExtinguished':
          sfx.fizz(s, e.OwnerNetEntityIdRaw === me ? here(0.8) : cellAt(e.Cell.X, e.Cell.Y, 0.6))
          break
        case 'PlayerDied': {
          const d = lastHit.has(e.VictimNetEntityIdRaw) ? (lastHit.get(e.VictimNetEntityIdRaw) ?? 0) + DEATH_AFTER_HIT_SEC : 0
          sfx.death(s, e.VictimNetEntityIdRaw === me ? here(1, d) : cellAt(e.Cell.X, e.Cell.Y, 0.8, d))
          // 倒台：死的是帽王、且死前帽塔够光柱阈值（与 HUD 倒台横幅同口径）。
          const hats = sample.prev.Players.find((p) => p.NetEntityIdRaw === e.VictimNetEntityIdRaw)?.BomberPlayerState.HatCount ?? 0
          if (prevKing !== 0 && e.VictimNetEntityIdRaw === prevKing && hats >= minHats) sfx.kingFall(s, here(0.8, 0.15))
          break
        }
        case 'PlayerRespawned':
          if (e.NetEntityIdRaw === me) sfx.respawn(s, here(0.9))
          break
        case 'PickupTaken':
          hatGain.noteEvent()
          if (e.PickerNetEntityIdRaw === me) {
            if (e.Kind === PickupKind.HealthPack) sfx.healthPack(s, here(0.9))
            // 技能糖的声音由 SkillGained / SkillEvolved 负责；没有这些事件时给一声普通糖。
            else if (e.Kind !== PickupKind.SkillCandy || !sample.dueEvents.some((x) => x.type === 'SkillGained' || x.type === 'SkillEvolved'))
              sfx.candy(s, here(0.9))
            // 帽子 = 强化数（ADR 0028）：吃到强化，帽子落上帽塔「啵」一声。
            if (isPowerup(e.Kind)) hatPop(1)
          }
          break
        case 'ChestHit': {
          const c = snap.Chests.find((x) => x.NetEntityIdRaw === e.ChestNetEntityIdRaw) ?? sample.prev.Chests.find((x) => x.NetEntityIdRaw === e.ChestNetEntityIdRaw)
          const w = c?.LogicTransform.WorldPosition
          sfx.chestHit(s, w ? at(w.x, w.z, 0.9, 0.04) : here(0.5, 0.04))
          break
        }
        case 'ChestOpened':
          sfx.chestOpen(s, cellAt(e.Cell.X, e.Cell.Y, e.OpenerNetEntityIdRaw === me ? 1.2 : 0.9, 0.1))
          break
        case 'PlayerEliminated':
          if (e.NetEntityIdRaw === me) sfx.eliminated(s, here(0.9, 0.25))
          else {
            const p = posOf(snap, e.NetEntityIdRaw)
            sfx.eliminated(s, p ? at(p.x, p.z, 0.35, 0.25) : here(0.25, 0.25))
          }
          break
        case 'FinalCircleStarted':
          sfx.finalStinger(s, t0 + 0.05)
          break
        case 'RingShrinkAnnounced':
          sfx.ringWarn(s, t0)
          break
        // ---- 第 4 轮技能（原型扩展 NON-CONTRACT，ADR 0030）----
        case 'SkillActivated': {
          skillCue.noteEvent()
          const place = e.PlayerNetEntityIdRaw === me ? here(0.9) : cellAt(e.Cell.X, e.Cell.Y, 0.7)
          if (e.Skill === 'bubble' || e.Skill === 'bounceBubble') sfx.skillBubble(s, place)
          else if (e.Skill === 'blink') sfx.skillBlink(s, place)
          else if (e.Skill === 'fireAura') sfx.skillIgnite(s, place)
          else if (e.Skill === 'fireDash') {
            sfx.skillBlink(s, place)
            sfx.skillIgnite(s, { ...place, at: place.at + 0.08 })
          }
          break
        }
        case 'SkillFailed':
          if (e.PlayerNetEntityIdRaw === me) sfx.skillDenied(s, here(0.7))
          break
        case 'SkillGained':
          if (e.PlayerNetEntityIdRaw === me) sfx.skillGain(s, here(0.9), e.How === 'levelUp')
          break
        case 'SkillEvolved': {
          skillCue.noteEvent()
          const p = posOf(snap, e.PlayerNetEntityIdRaw)
          sfx.evolve(s, e.PlayerNetEntityIdRaw === me ? here(1) : p ? at(p.x, p.z, 0.4) : here(0.3))
          break
        }
        case 'PlayerHealed':
          if (e.NetEntityIdRaw === me) sfx.regenChime(s, here(0.8))
          break
        case 'BombKicked':
          sfx.kick(s, e.KickerNetEntityIdRaw === me ? here(0.9) : cellAt(e.FromCell.X, e.FromCell.Y, 0.8))
          break
        case 'PlayerFrozen': {
          const p = e.VictimNetEntityIdRaw === me ? null : posOf(snap, e.VictimNetEntityIdRaw)
          sfx.freeze(s, e.VictimNetEntityIdRaw === me ? here(0.9) : p ? at(p.x, p.z, 0.6) : here(0.3))
          break
        }
        // ---- 原型扩展（NON-CONTRACT，ADR 0033）：中毒弹 / 麻痹弹 ----
        case 'PlayerPoisoned':
        case 'PlayerShocked': {
          statusCue.noteEvent(e.type)
          const mine = e.VictimNetEntityIdRaw === me
          const p = mine ? null : posOf(snap, e.VictimNetEntityIdRaw)
          const place = mine ? here(0.9, 0.05) : p ? at(p.x, p.z, 0.55, 0.05) : here(0.25, 0.05)
          if (e.type === 'PlayerPoisoned') sfx.poisonHiss(s, place)
          else sfx.zap(s, place)
          break
        }
        case 'PlayerCured': {
          statusCue.noteEvent(e.type)
          const p = e.NetEntityIdRaw === me ? null : posOf(snap, e.NetEntityIdRaw)
          sfx.cureChime(s, e.NetEntityIdRaw === me ? here(0.8, 0.1) : p ? at(p.x, p.z, 0.35, 0.1) : here(0.2, 0.1))
          break
        }
        case 'MatchEnded':
          // 领奖台开场（design §13）：胜利号角（本人是冠军——名次 1，活到最后者赢——时更亮）+ 短掌声。
          matchEndedTick = e.Tick
          sfx.victoryFanfare(s, t0 + 0.05, localIsWinner(snap, me))
          sfx.applause(s, t0 + APPLAUSE_AFTER_SEC, () => Math.random())
          break
        default:
          break
      }
    }
    // 加冕号角：与 HUD 横幅 / 光柱同一快照口径（现任帽王涨过 N 顶也响）。
    if (snap !== crownSnap) {
      crownSnap = snap
      const king = crown.check(snap)
      if (king !== 0) sfx.fanfare(s, here(king === me ? 0.9 : 0.5, 0.1))
      // 快照兜底看 sample.prev：curr 比到期事件领先一帧（事件要等 renderTick ≥ e.Tick），看 curr 会在真事件
      // 到来前一帧就判「没见过事件」而先响一声兜底，下一帧真事件再响一遍。prev.Tick ≤ renderTick，
      // 其事件已在上面的 dueEvents 里处理过（noteEvent 已记上）。
      // 没有 PickupTaken 的数据源：本人帽数上涨也「啵」。
      const gained = hatGain.check(sample.prev, me)
      if (gained > 0) hatPop(gained)
      // 没有技能表现事件的数据源：本人冷却终点变大 / 新出现组合技也响。
      const sc = skillCue.check(sample.prev, me, rules.skills)
      if (sc.cast) sfx.skillBlink(s, here(0.6))
      if (sc.evolved) sfx.evolve(s, here(0.9))
      // 没有中毒 / 麻痹 / 解毒事件的数据源：本人的中毒 / 麻痹终点变大、中毒提前清零也响（同样看 prev，不会与事件各响一遍）。
      for (const c of statusCue.check(sample.prev, me)) {
        if (c === 'poisoned') sfx.poisonHiss(s, here(0.9))
        else if (c === 'shocked') sfx.zap(s, here(0.9))
        else sfx.cureChime(s, here(0.8))
      }
    }
    for (const list of chains.values()) {
      list.sort((a, b) => (a.proto?.IndexInChain ?? 0) - (b.proto?.IndexInChain ?? 0))
      const used = new Set<U64>()
      list.forEach((e, i) => {
        const d = chainDelaySec(i)
        const p = explosionPos(e, sample, used)
        const place = p ? at(p.x, p.z, 1, d) : here(0.8, d)
        if (boomLimit.allow(place.at)) sfx.explosion(s, place, 0.92 + Math.random() * 0.16)
        if (list.length >= 2) sfx.chainNote(s, { ...place, gain: place.gain * 0.8 }, i)
      })
    }

    // ---- 没有 BrickDestroyed 表现事件的数据源：用地形 diff 出方块碎裂声 ----
    const terr = snap.Terrain
    if (snap.match.matchIndex !== lastMatch) {
      lastMatch = snap.match.matchIndex
      lastBrick = null
    }
    if (terr.rev !== lastRev) {
      if (!sawBrickEvents && lastBrick && lastBrick.length === terr.brick.length) {
        for (let i = 0; i < terr.brick.length; i++) {
          const was = lastBrick[i] as BlockType
          if (was === BlockType.Air || terr.brick[i] !== BlockType.Air || !MATERIALS[was]?.destructible) continue
          if (!clackLimit.allow(t0)) break
          sfx.brickClack(s, cellAt(i % terr.size, Math.floor(i / terr.size), 0.7, 0.03))
        }
      }
      lastBrick = terr.brick.slice()
      lastRev = terr.rev
    }

    // ---- 持续音：引信嘶嘶、危险提示、心跳、倒计时 ----
    const rate = snap.match.tickRateHz
    const dangerTicks = Math.ceil(0.4 * rate)
    let hiss = 0
    const alive = new Set<U64>()
    for (const b of snap.Bombs) {
      const st = b.BomberBombState
      if (st.ExplodedAtTick !== 0) continue
      alive.add(b.NetEntityIdRaw)
      const w = b.LogicTransform.WorldPosition
      const dx = w.x - listener.x
      const dz = w.z - listener.z
      if (Math.hypot(dx, dz) > NEAR_CELLS) continue
      const sp = spatialize(dx, dz)
      hiss += sp.gain
      const left = st.FuseEndTick - sample.renderTick
      const played = blips.get(b.NetEntityIdRaw) ?? 0
      if (left <= dangerTicks && played === 0) {
        sfx.dangerBlip(s, { at: t0, gain: sp.gain, pan: sp.pan })
        blips.set(b.NetEntityIdRaw, 1)
      } else if (left <= dangerTicks / 2 && played === 1) {
        sfx.dangerBlip(s, { at: t0, gain: sp.gain, pan: sp.pan })
        blips.set(b.NetEntityIdRaw, 2)
      }
    }
    for (const id of blips.keys()) if (!alive.has(id)) blips.delete(id)
    // 持续的引信噪声在 8 人场里几乎不停，听起来像背景底噪；原型里关掉，只保留末段危险提示音。
    void hiss
    s.setHiss(0)

    const mine = snap.Players.find((p) => p.NetEntityIdRaw === me)
    const hp = mine?.玩家属性.血量当前 ?? 0
    if (hp > 0 && hp <= 2 && sample.realNow - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = sample.realNow
      sfx.heartbeat(s, t0)
    }

    const phase = snap.BomberMatchState.Phase
    const remaining = (snap.match.phaseEndTick - sample.renderTick) / rate
    const sec = Math.ceil(remaining)
    const counting = (phase === MatchPhase.Warmup && sec >= 1 && sec <= 3) || ((phase === MatchPhase.Running || phase === MatchPhase.Endgame) && sec >= 1 && sec <= 10)
    if (counting && sec !== lastCountdown) sfx.countdownTick(s, t0, phase === MatchPhase.Warmup || sec <= 3)
    lastCountdown = counting ? sec : -1

    runMusic(s, sample)
  }

  const runMusic = (s: Synth, sample: FeedSample): void => {
    const snap = sample.curr
    if (snap.Tick !== stallTick) {
      stallTick = snap.Tick
      stallSince = sample.realNow
    }
    const phase = snap.BomberMatchState.Phase
    if (phase !== MatchPhase.Settlement) matchEndedTick = null
    const mode = musicOn
      ? musicMode({
          phase,
          renderTick: sample.renderTick,
          tickRateHz: snap.match.tickRateHz,
          matchEndedTick,
          podiumMs: rules.podiumMs,
          stalled: sample.realNow - stallSince > STALL_MS,
        })
      : 'silent'
    seq.setMode(mode)
    for (const n of seq.schedule(s.now())) s.musicNote(n)
  }

  const onMusicEvent = (ev: Event): void => {
    const on = (ev as CustomEvent<{ on?: unknown }>).detail?.on
    if (typeof on === 'boolean') api.setMusicEnabled(on)
  }
  const bus = globalThis as unknown as {
    addEventListener?: (t: string, f: (e: Event) => void) => void
    removeEventListener?: (t: string, f: (e: Event) => void) => void
  }

  const api: AudioSystem = {
    unlock() {
      if (!synth) {
        try {
          synth = new Synth()
          synth.setMuted(muted)
          synth.setMusicEnabled(musicOn)
        } catch {
          // 浏览器不支持 WebAudio：静默运行。
          synth = null
          return
        }
      }
      synth.resume()
    },
    setMuted(m: boolean) {
      muted = m
      synth?.setMuted(m)
    },
    setMusicEnabled(on: boolean) {
      musicOn = on
      synth?.setMusicEnabled(on)
      if (!on) seq.setMode('silent')
    },
    update(sample: FeedSample, localPlayerId: U64) {
      if (!synth || sample.frozen) return
      if (muted) {
        synth.setHiss(0)
        seq.setMode('silent')
        // 静音期间不追地形 diff；解除静音后重新取基线，免得一次性补放一堆碎裂声。
        lastBrick = null
        lastRev = -1
        return
      }
      run(synth, sample, localPlayerId)
    },
    ui(kind: 'select' | 'confirm') {
      if (!synth || muted) return
      const at = synth.now() + 0.01
      if (kind === 'select') sfx.uiSelect(synth, at)
      else sfx.uiConfirm(synth, at)
    },
    dispose() {
      bus.removeEventListener?.(MUSIC_EVENT, onMusicEvent)
      synth?.dispose()
      synth = null
    },
  }
  bus.addEventListener?.(MUSIC_EVENT, onMusicEvent)
  return api
}
