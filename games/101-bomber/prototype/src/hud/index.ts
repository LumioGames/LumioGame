import './hud.css'
import {
  MatchPhase,
  PickupKind,
  type BomberConfig,
  type BotDifficulty,
  type CharacterId,
  type PlayerView,
  type ProtoRules,
  type U64,
  type WorldSnapshot,
} from '../contract'
import type { FeedSample } from '../present/feed'
import type { PresentationSettings } from '../present/settings'
import { skillButtonView, skillHudModel, type SkillButtonView } from '../present/skill-hud'
import { skillCss } from '../present/skill-style'
import type { ScreenPoint } from '../view'
import type { Portraits } from './character-select'
import { ElimOverlay, KillFeedView, PoisonWarn, ResourceMeter, RuleCard } from './circle-views'
import { el, iconEl, roundButton, setIcon, setStyle, setText } from './dom'
import { edgeArrowPlacement, interpolatedPlayerPos } from './edge-arrow'
import { circleHud, circleSubtitle } from './final-circle'
import { formatClock, heartFills, heartsLabel, speedLevel, uiScale } from './format'
import { BannerQueue, HintPill, HitHint, PickupFlash, PopupStack } from './fx-layers'
import { HeartTrack } from './hit-stagger'
import { HudBrain, type DeathRecap, type HudMoment, type SettlementResults } from './hud-brain'
import { LeaderboardView } from './leaderboard'
import { Overlays } from './overlays'
import { podiumModel, settlementScene } from './podium'
import { PodiumView } from './podium-view'
import { RecapView } from './recap-view'
import { ResultsView } from './results-view'
import { characterLine, selectCards } from './select-model'
import { RegenRing, SkillBar } from './skill-bar'
import { HudTimeline } from './timeline'
import { localTipStore, ruleCardLines, TipProgress } from './tips'

export interface HudCallbacks {
  onToggleMute(): void
  onToggleOverview(): void
  onTogglePause(): void
  /** 设置面板改了 settings（对象已原地修改），调用方负责持久化。 */
  onSettingsChanged(): void
  /**
   * 背景音乐开关（与 M 全部静音分开）。可选：没接时 HUD 只经 {@link MUSIC_EVENT} 广播，
   * audio 模块自己监听同名事件（hud 与 audio 互不 import）。
   */
  onToggleMusic?(on: boolean): void
  /** 原型扩展（NON-CONTRACT，ADR 0030）：「换角色」确认（下一局生效）；没接时不显示换角色按钮。 */
  onChangeCharacter?(id: CharacterId): void
}

/** 音乐开关的跨模块信号：`CustomEvent<{ on: boolean }>`，派发在 globalThis（浏览器里是 window）上。 */
export const MUSIC_EVENT = 'lumio-bomber:music'

export interface HudOptions {
  root: HTMLElement
  config: BomberConfig
  rules: ProtoRules
  localPlayerId: U64
  settings: PresentationSettings
  /** 由 view 提供的投影，用于屏幕边缘帽王箭头。 */
  project(x: number, y: number, z: number): ScreenPoint
  callbacks: HudCallbacks
  /** 选角卡的玩偶头像（app 从 view 拿到后传进来；HUD 不 import view）。 */
  portraits?: Promise<Portraits> | Portraits
  /** 原型扩展（NON-CONTRACT，design §15 Bot 难度分档（原型工具））：本局 Bot 难度（暂停卡显示）。 */
  ai?: BotDifficulty
  /** 触屏控件是否在显示（技能条提示「副按钮」而不是 Shift）。 */
  isTouch?(): boolean
  /** 开局选的角色（快照还没带角色时——首局开局倒数——换角色卡用它当当前选中）。 */
  character?: CharacterId
}

export interface Hud {
  update(sample: FeedSample, dtMs: number): void
  setPaused(paused: boolean): void
  setMuted(muted: boolean): void
  /** 外部（app）改了音乐开关时同步按钮图标。 */
  setMusic(on: boolean): void
  /** 原型扩展（NON-CONTRACT，ADR 0030）：触屏技能按钮该显示什么（主动槽为空时 null）。每帧 update 之后读。 */
  skillButton(): SkillButtonView | null
  dispose(): void
}

/** 帽王箭头投影点的离地高度（帽塔中段），米。 */
const KING_ANCHOR_Y = 1.6
const HURT_FLASH_MS = 260
/** 决赛圈出局后，死亡回顾卡留多久再收起（之后只留观战条）。 */
const FINAL_RECAP_MS = 6000
const MUSIC_KEY = 'lumio-101-bomber-music'

function loadMusicOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUSIC_KEY) !== '0'
  } catch {
    // 存储被禁用：默认开。
    return true
  }
}

function saveMusicOn(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUSIC_KEY, on ? '1' : '0')
  } catch {
    // 同上。
  }
}

function broadcastMusic(on: boolean): void {
  const target = globalThis as unknown as { dispatchEvent?: (e: Event) => boolean }
  if (typeof CustomEvent === 'undefined' || !target.dispatchEvent) return
  target.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { on } }))
}

export function createHud(opts: HudOptions): Hud {
  const { root, config, rules, localPlayerId: me, settings, callbacks } = opts
  const rate = config.tickRateHz
  const coarse = globalThis.matchMedia?.('(pointer: coarse)')

  root.classList.add('hud')
  const layer = el('div', 'hud-layer', root)

  // ---- 左上：标题 ----
  const logo = el('div', 'hud-logo', layer)
  el('div', 'logo-title', logo).textContent = '帽王乱斗'
  el('div', 'logo-en', logo).textContent = 'VOXEL BOMBER · 101'
  el('div', 'logo-sub', logo).textContent = '原型 · 角色技能 + 决赛圈缩到 1 格'

  // ---- 顶部中央：计分板 + 提示 ----
  const top = el('div', 'hud-top', layer)
  const board = el('div', 'hud-score pill', top)
  const you = el('div', 'sb-side sb-you', board)
  iconEl('hat', 'sb-ico', you)
  const youHats = el('span', 'sb-num', you)
  el('span', 'sb-cap', you).textContent = '你'
  const mid = el('div', 'sb-mid', board)
  const timer = el('div', 'sb-timer', mid)
  const sub = el('div', 'sb-sub', mid)
  const meter = new ResourceMeter(mid)
  const tag = el('span', 'sb-tag', mid)
  const kingSide = el('div', 'sb-side sb-king', board)
  iconEl('crown', 'sb-ico', kingSide)
  const kingHats = el('span', 'sb-num', kingSide)
  el('span', 'sb-cap', kingSide).textContent = '帽王'
  const tips = new TipProgress(localTipStore())
  const hint = new HintPill(top, tips)
  const banners = new BannerQueue(layer)
  const ruleCard = new RuleCard(layer, ruleCardLines(rules.finalCircleMs / 1000))
  const cards = selectCards(rules, config)

  // ---- 右上：圆形按钮 ----
  let musicOn = loadMusicOn()
  const buttons = el('div', 'hud-buttons', layer)
  const muteBtn = roundButton('soundOn', '全部静音（M）', buttons, () => callbacks.onToggleMute())
  const musicBtn = roundButton('musicOn', '背景音乐开关', buttons, () => setMusic(!musicOn, true))
  roundButton('view', '切换视角（V）', buttons, () => callbacks.onToggleOverview())
  const pauseBtn = roundButton('pause', '暂停（Esc）', buttons, () => callbacks.onTogglePause())
  roundButton('help', '操作说明', buttons, () => overlays.open('help'))
  roundButton('gear', '设置', buttons, () => overlays.open('settings'))
  const setMusic = (on: boolean, fromUser: boolean): void => {
    musicOn = on
    setIcon(musicBtn.querySelector('.ico') as HTMLElement, on ? 'musicOn' : 'musicOff')
    musicBtn.classList.toggle('is-off', !on)
    musicBtn.setAttribute('aria-pressed', String(on))
    if (!fromUser) return
    saveMusicOn(on)
    broadcastMusic(on)
    callbacks.onToggleMusic?.(on)
  }

  // ---- 右侧：Top-10 + 击杀栏 ----
  const side = el('div', 'hud-side', layer)
  const leaderboard = new LeaderboardView(side, () => (coarse?.matches ? 5 : 10))
  const feed = new KillFeedView(side)

  // ---- 底部中央：属性胶囊 + 技能条（ADR 0030） ----
  const bottom = el('div', 'hud-bottom', layer)
  const stats = el('div', 'hud-stats pill', bottom)
  const hearts = el('div', 'st-hearts', stats)
  const heartEls: HTMLSpanElement[] = []
  const heartCount = Math.ceil(config.maxHealthPoints / config.healthPointsPerHeart)
  for (let i = 0; i < heartCount; i++) {
    const h = el('span', 'heart', hearts)
    iconEl('heart', 'heart-bg', h)
    const fill = el('span', 'heart-fill', h)
    iconEl('heart', '', fill)
    heartEls.push(fill)
  }
  const regenRing = new RegenRing(stats, hearts)
  const statItem = (icon: 'flame' | 'bomb' | 'speed' | 'hat', label: string, cls: string): HTMLSpanElement => {
    el('span', 'st-sep', stats)
    const item = el('span', `st-item ${cls}`, stats)
    iconEl(icon, 'st-ico', item)
    el('span', 'st-label', item).textContent = label
    return el('span', 'st-val', item)
  }
  const fireVal = statItem('flame', '火力', 'is-fire')
  const bombVal = statItem('bomb', '炸弹', 'is-bomb')
  const speedVal = statItem('speed', '速度', 'is-speed')
  const hatVal = statItem('hat', '帽', 'is-hat')
  const skillBar = new SkillBar(bottom)
  let lastButton: SkillButtonView | null = null
  const flash = new PickupFlash(layer)
  const hitHint = new HitHint(layer)

  // ---- 其余层 ----
  const popups = new PopupStack(layer)
  const arrow = el('div', 'hud-arrow', layer)
  const arrowHead = el('div', 'ar-head', arrow)
  iconEl('arrow', '', arrowHead)
  const arrowBadge = el('div', 'ar-badge', arrow)
  iconEl('crown', 'ar-crown', arrowBadge)
  const arrowHats = el('span', 'ar-hats', arrowBadge)
  const arrowDist = el('span', 'ar-dist', arrowBadge)
  const vignette = el('div', 'hud-vignette', layer)
  const poison = new PoisonWarn(layer)
  const recap = new RecapView(layer, config.respawnMs / 1000)
  const elim = new ElimOverlay(layer)
  const podium = new PodiumView(layer)
  // 换角色（下一局生效）：记下最近选定的角色（开局所选或换过的），换角色卡再打开时选中它。
  let pendingCharacter: CharacterId | null = opts.character ?? null
  let lastNow = 0
  const hudCallbacks: HudCallbacks = callbacks.onChangeCharacter
    ? {
        ...callbacks,
        onChangeCharacter: (id) => {
          pendingCharacter = id
          callbacks.onChangeCharacter?.(id)
        },
      }
    : callbacks
  const results = new ResultsView(
    layer,
    Math.max(1, (rules.settlementMs - rules.podiumMs) / 1000),
    callbacks.onChangeCharacter ? () => overlays.open('character') : undefined,
  )
  const overlays = new Overlays(layer, settings, hudCallbacks, {
    rules,
    config,
    ...(opts.ai ? { ai: opts.ai } : {}),
    ...(opts.portraits ? { portraits: opts.portraits } : {}),
    currentCharacter: () => pendingCharacter ?? (shownSnap ? (findMe(shownSnap)?.skills?.character ?? null) : null),
    notice: (text) => hint.showNotice(text, lastNow),
  })

  // ---- 尺寸：--u 缩放 + 缓存视口尺寸（每帧读 clientWidth 会强制回流） ----
  let vw = root.clientWidth || globalThis.innerWidth || 1280
  let vh = root.clientHeight || globalThis.innerHeight || 720
  const onResize = (): void => {
    vw = root.clientWidth || globalThis.innerWidth || vw
    vh = root.clientHeight || globalThis.innerHeight || vh
    root.style.setProperty('--u', uiScale(vw, vh).toFixed(3))
  }
  onResize()
  globalThis.addEventListener?.('resize', onResize)

  const brain = new HudBrain({ localId: me, pillarMinHats: rules.hatKingPillarMinHats, tickRateHz: rate, pointsPerHeart: config.healthPointsPerHeart, rules })
  const timeline = new HudTimeline()
  const heartTrack = new HeartTrack()
  /** 按连锁节奏延后执行的表现（逐颗红晕、死亡回顾）。 */
  let later: { at: number; fn: () => void }[] = []
  let hurtFlashUntil = 0
  let shownSnap: WorldSnapshot | null = null
  let pendingRecap: DeathRecap | null = null
  let settle: SettlementResults | null = null
  /** 本局规则卡上的「你是谁」已写过的角色（每局只写一次）。 */
  let cardCharacter: CharacterId | null | undefined
  const findMe = (s: WorldSnapshot): PlayerView | undefined => s.Players.find((p) => p.NetEntityIdRaw === me)
  const colorOf = (id: number): { animal: string; slot: number } | null => {
    const p = shownSnap?.Players.find((q) => q.NetEntityIdRaw === id)
    return p ? { animal: p.meta.animal, slot: p.meta.slot } : null
  }

  const apply = (m: HudMoment, now: number): void => {
    switch (m.kind) {
      case 'banner':
        banners.push(m)
        break
      case 'popup':
        popups.show(m.key, m.tone, m.text, m.tier, now)
        break
      case 'tip':
        hint.completeTip(m.id, now)
        break
      case 'notice':
        hint.showNotice(m.text, now)
        break
      case 'pickup':
        flash.show(m.text, m.pickupKind, now, m.skill ? skillCss(m.skill) : undefined)
        break
      case 'heal':
        flash.show(`回春 +${m.points / config.healthPointsPerHeart} 心`, PickupKind.HealthPack, now, skillCss('regen'))
        break
      case 'skills-lost':
        if (pendingRecap) pendingRecap.skillsLost = m.text
        recap.setSkillsLost(m.text)
        break
      case 'hits':
        heartTrack.schedule(now, m.hpBefore, m.hits)
        for (const h of m.hits) {
          const at = now + h.delayMs
          later.push({ at, fn: () => (hurtFlashUntil = at + HURT_FLASH_MS) })
        }
        if (m.hint) hitHint.show(m.hint, now)
        break
      case 'death': {
        const r = m.recap
        pendingRecap = r
        hitHint.clear()
        later.push({ at: now + m.delayMs, fn: () => recap.show(r, now + m.delayMs) })
        break
      }
      case 'drops':
        if (pendingRecap) pendingRecap.drops = m.text
        recap.setDrops(m.text)
        break
      case 'hats-lost':
        if (pendingRecap) pendingRecap.hatsLost = m.count
        recap.setHatsLost(m.count)
        break
      case 'eliminated':
        elim.show(m.rank)
        break
      case 'respawned':
        recap.hide()
        pendingRecap = null
        break
      case 'match-reset':
        recap.hide()
        results.hide()
        podium.hide()
        elim.hide()
        popups.clear()
        banners.clear()
        hitHint.clear()
        heartTrack.clear()
        later = []
        pendingRecap = null
        settle = null
        cardCharacter = undefined
        break
      case 'settlement':
        recap.hide()
        elim.hide()
        hitHint.clear()
        popups.clear()
        settle = m.results
        break
    }
  }

  const runLater = (now: number): void => {
    if (later.length === 0) return
    const due = later.filter((x) => x.at <= now)
    if (due.length === 0) return
    later = later.filter((x) => x.at > now)
    due.sort((a, b) => a.at - b.at)
    for (const x of due) x.fn()
  }

  const updateScoreboard = (sample: FeedSample, snap: WorldSnapshot): void => {
    const live = sample.curr
    const phase = live.BomberMatchState.Phase
    const remaining = (live.match.phaseEndTick - sample.renderTick) / rate
    const circle = circleHud(live, me, sample.renderTick, rules.finalCircleResourcePermille, rules, config.healthPointsPerHeart)
    let t: string
    let s = '活到最后者赢'
    let mode = ''
    if (phase === MatchPhase.Warmup) {
      t = String(Math.max(1, Math.ceil(remaining)))
      s = '准备开局 · 活到最后者赢'
      mode = 'warmup'
    } else if (phase === MatchPhase.Settlement) {
      t = '结算'
      mode = 'settle'
    } else {
      t = formatClock(remaining)
      if (remaining <= 30) mode = 'hurry'
      if (circle.finalCircle) mode = remaining <= 30 ? 'final hurry' : 'final'
    }
    setText(timer, t)
    setText(sub, circleSubtitle(circle) ?? s)
    if (board.dataset.mode !== mode) board.dataset.mode = mode
    setText(tag, circle.finalCircle ? '决赛圈' : '')
    tag.classList.toggle('is-on', circle.finalCircle)
    meter.update(circle.resourcePct, circle.thresholdPct)
    const mine = findMe(snap)
    setText(youHats, String(mine?.BomberPlayerState.HatCount ?? 0))
    const kingId = snap.BomberMatchState.HatKingNetEntityIdRaw
    const king = kingId !== 0 ? snap.Players.find((p) => p.NetEntityIdRaw === kingId) : undefined
    setText(kingHats, king ? String(king.BomberPlayerState.HatCount) : '–')
    kingSide.classList.toggle('is-me', kingId === me)
    ruleCard.setVisible(phase === MatchPhase.Warmup)
    const character = mine?.skills?.character ?? null
    if (character !== cardCharacter) {
      cardCharacter = character
      const card = character ? cards.find((c) => c.id === character) : undefined
      ruleCard.setCharacter(card ? characterLine(card) : '')
    }
    leaderboard.setTitle(circle.finalCircle ? '决赛圈 · 存活优先' : '帽子榜')
    poison.update(circle.outside, sample.realNow, settings.fullscreenFx, circle.poisonText ?? undefined)
    bottom.classList.toggle('is-out', circle.localEliminated)
    stats.classList.toggle('is-out', circle.localEliminated)
    if (elim.isVisible()) elim.update(remaining)
  }

  const updateStats = (sample: FeedSample, snap: WorldSnapshot, now: number): void => {
    const p = findMe(snap)
    // 技能条读最新快照（冷却环按 renderTick 平滑走），不等 HUD 时间线。
    const liveMe = findMe(sample.curr) ?? p
    const m = skillHudModel(liveMe, sample.renderTick, rate, rules, config, opts.isTouch?.() ?? coarse?.matches ?? false)
    skillBar.update(m)
    regenRing.update(m.regen)
    lastButton = skillButtonView(m)
    if (!p) return
    const a = p.玩家属性
    const hp = Math.max(0, heartTrack.displayed(now, a.血量当前))
    const fills = heartFills(hp, config.maxHealthPoints, config.healthPointsPerHeart)
    fills.forEach((f, i) => setStyle(heartEls[i], 'width', `${f * 100}%`))
    const label = heartsLabel(hp, config.maxHealthPoints, config.healthPointsPerHeart)
    if (hearts.title !== label) hearts.title = label
    stats.classList.toggle('is-low', hp > 0 && hp <= config.healthPointsPerHeart)
    stats.classList.toggle('is-dead', hp <= 0)
    setText(fireVal, String(a.火力当前))
    let live = 0
    for (const b of snap.Bombs) if (b.BomberBombState.OwnerNetEntityIdRaw === me && b.BomberBombState.ExplodedAtTick === 0) live++
    setText(bombVal, `${a.手上炸弹数当前}/${a.手上炸弹数当前 + live}`)
    const base = config.speedTierToCellsPerSecond[0] ?? 3500
    setText(speedVal, String(speedLevel(a.移速当前, base, rules.speedStepMilli)))
    speedVal.parentElement?.classList.toggle('is-slow', a.移速当前 < base)
    setText(hatVal, String(p.BomberPlayerState.HatCount))
  }

  const updateArrow = (sample: FeedSample, snap: WorldSnapshot): void => {
    const kingId = snap.BomberMatchState.HatKingNetEntityIdRaw
    const king = kingId !== 0 && kingId !== me ? snap.Players.find((p) => p.NetEntityIdRaw === kingId) : undefined
    const kingPos = king && king.玩家属性.血量当前 > 0 ? interpolatedPlayerPos(sample, kingId) : null
    const place = kingPos ? edgeArrowPlacement(opts.project(kingPos.x, KING_ANCHOR_Y, kingPos.z), vw, vh) : null
    if (!king || !kingPos || !place?.visible || snap.BomberMatchState.Phase === MatchPhase.Settlement) {
      arrow.classList.remove('is-on')
      return
    }
    arrow.classList.add('is-on')
    setStyle(arrow, 'transform', `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`)
    setStyle(arrowHead, 'transform', `rotate(${place.angle.toFixed(3)}rad)`)
    setText(arrowHats, `×${king.BomberPlayerState.HatCount}`)
    const mePos = interpolatedPlayerPos(sample, me)
    setText(arrowDist, mePos ? `${Math.round(Math.hypot(kingPos.x - mePos.x, kingPos.z - mePos.z))} 格` : '')
  }

  const updateVignette = (sample: FeedSample, snap: WorldSnapshot): void => {
    const now = sample.realNow
    const hp = heartTrack.displayed(now, findMe(snap)?.玩家属性.血量当前 ?? config.maxHealthPoints)
    let o = 0
    if (hp > 0 && hp <= config.healthPointsPerHeart) o = 0.55 + 0.45 * Math.sin(now * 0.001 * 2 * Math.PI * 1.1)
    if (now < hurtFlashUntil) o = Math.max(o, ((hurtFlashUntil - now) / HURT_FLASH_MS) * 0.8)
    setStyle(vignette, 'opacity', (o * settings.fullscreenFx).toFixed(3))
  }

  const updateSettlement = (sample: FeedSample): void => {
    const phase = sample.curr.BomberMatchState.Phase
    if (phase !== MatchPhase.Settlement || !settle) {
      podium.hide()
      results.hide()
    } else if (settlementScene(sample.renderTick, settle.endTick, rules.podiumMs, rate) === 'podium') {
      if (!podium.isVisible()) podium.show(podiumModel(settle.rows, settle.reason))
    } else {
      podium.hide()
      if (!results.isVisible()) results.show(settle, rate)
      results.update((sample.curr.match.phaseEndTick - sample.renderTick) / rate)
    }
    const scene = podium.isVisible() ? 'podium' : results.isVisible() ? 'results' : ''
    if (layer.dataset.scene !== scene) layer.dataset.scene = scene
  }

  setMusic(musicOn, false)
  // audio 先于 HUD 创建并已在监听：把本机记住的开关告诉它。
  broadcastMusic(musicOn)
  callbacks.onToggleMusic?.(musicOn)

  return {
    update(sample: FeedSample): void {
      const now = sample.realNow
      lastNow = now
      for (const batch of timeline.advance(sample.curr, sample.renderTick, sample.dueEvents)) {
        for (const m of brain.consume(batch)) apply(m, now)
      }
      runLater(now)
      const snap = timeline.latestProcessed() ?? sample.curr
      if (snap !== shownSnap) {
        shownSnap = snap
        const out = new Set<U64>()
        for (const p of snap.Players) if (p.eliminated) out.add(p.NetEntityIdRaw)
        // 缺 eliminatedTick 的数据源用 HudBrain 的出局记录兜底（review #13）。
        leaderboard.update(brain.liveRanking(snap), out)
      }
      // 逐击扣心期间每帧都要刷新心；其余时候只在快照变化时刷新也一样便宜。
      updateStats(sample, snap, now)
      feed.update(brain.killFeed.entries(), brain.killFeed.version, colorOf)
      updateScoreboard(sample, snap)
      updateArrow(sample, snap)
      updateVignette(sample, snap)
      if (recap.isVisible()) {
        const p = findMe(sample.curr)
        if (p?.eliminated || pendingRecap?.final) {
          recap.update(0)
          if (recap.shownFor(now) > FINAL_RECAP_MS) recap.hide()
        } else {
          const remaining = p ? (p.BomberPlayerState.RespawnAtTick - sample.renderTick) / rate : 0
          if (p && p.玩家属性.血量当前 > 0 && remaining <= 0) recap.hide()
          else recap.update(remaining)
        }
      }
      updateSettlement(sample)
      banners.update(now)
      popups.update(now)
      flash.update(now)
      hitHint.update(now)
      hint.update(now)
    },
    setPaused(paused: boolean): void {
      setIcon(pauseBtn.querySelector('.ico') as HTMLElement, paused ? 'play' : 'pause')
      pauseBtn.classList.toggle('is-active', paused)
      overlays.setPaused(paused)
    },
    setMuted(muted: boolean): void {
      setIcon(muteBtn.querySelector('.ico') as HTMLElement, muted ? 'soundOff' : 'soundOn')
      muteBtn.classList.toggle('is-active', muted)
      overlays.setMuted(muted)
    },
    setMusic(on: boolean): void {
      setMusic(on, false)
      saveMusicOn(on)
    },
    skillButton(): SkillButtonView | null {
      return lastButton
    },
    dispose(): void {
      globalThis.removeEventListener?.('resize', onResize)
      layer.remove()
      root.classList.remove('hud')
    },
  }
}
