import './base.css'
import { CHARACTER_ORDER, DEFAULT_RULES, type CharacterId, type ProtoRules } from '../contract'
import { createAudio } from '../audio'
import { createHud } from '../hud'
import { loadLastCharacter, pickCharacter, saveLastCharacter, type Portraits } from '../hud/character-select'
import { createInput } from '../input'
import { PresentationFeed } from '../present/feed'
import { loadSettings, saveSettings } from '../present/settings'
import { createView, renderDollPortraits } from '../view'
import { LocalHost } from './local-host'
import { appConfig, DEV_FAST_SCALE, devEvolveCandies, parseAppParams } from './params'

/**
 * 组装入口。URL 参数见 params.ts（?seed / ?match / ?bots / ?ai / ?char，开发时另有 ?dev=evolve,autopilot,fast）。
 * 第 4 轮（ADR 0030）：先选角（`?char=` 跳过），再建宿主、视图、HUD 与输入——选角屏只是开局仪式里的一屏。
 */
const params = parseAppParams(location.search, import.meta.env.DEV)
const seed = (params.seed ?? Math.floor(Math.random() * 0x7fffffff)) >>> 0
const config = appConfig(params)
const rules: ProtoRules = { ...DEFAULT_RULES, playerCount: params.bots + 1 }
const timeScale = params.dev.has('fast') ? DEV_FAST_SCALE : 1

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} missing`)
  return el
}

const settings = loadSettings()
const audio = createAudio({ muted: settings.muted, rules })
// 选角卡的玩偶头像：离屏渲染一次（下一帧再做，选角屏先出来；失败时卡片用色块）。
const portraits: Promise<Portraits> = new Promise((resolve) => {
  requestAnimationFrame(() => {
    try {
      resolve(renderDollPortraits(CHARACTER_ORDER.map((c) => rules.characters[c].animal)))
    } catch {
      resolve(new Map())
    }
  })
})

void boot()

async function boot(): Promise<void> {
  const character: CharacterId =
    params.character ??
    (await pickCharacter({
      root: $('hud'),
      rules,
      config,
      portraits,
      ai: params.ai,
      initial: loadLastCharacter(),
      onGesture: () => audio.unlock(),
      onSound: (k) => audio.ui(k),
    }))

  const host = new LocalHost({
    seed,
    config,
    rules,
    botCount: params.bots,
    localCharacter: character,
    ai: params.ai,
    ...(params.dev.has('autopilot') ? { localAutopilot: { profile: 'player' as const } } : {}),
  })
  if (params.dev.has('evolve')) host.devSpawnSkillCandies(devEvolveCandies(rules, character))
  const feed = new PresentationFeed(1000 / config.tickRateHz / timeScale)
  host.subscribe((f) => feed.push(f, performance.now()))

  const view = createView({
    container: $('stage'),
    labelRoot: $('labels'),
    config,
    rules,
    localPlayerId: host.localPlayerId,
    settings,
    requestHitstop: (ms) => feed.freeze(ms, performance.now()),
  })

  const togglePause = (): void => {
    host.setPaused(!host.isPaused())
    hud.setPaused(host.isPaused())
  }
  const toggleMute = (): void => {
    settings.muted = !settings.muted
    audio.setMuted(settings.muted)
    hud.setMuted(settings.muted)
    saveSettings(settings)
  }

  let touchNow = false
  const hud = createHud({
    root: $('hud'),
    config,
    rules,
    localPlayerId: host.localPlayerId,
    settings,
    project: (x, y, z) => view.project(x, y, z),
    portraits,
    ai: host.ai,
    character,
    isTouch: () => touchNow,
    callbacks: {
      onToggleMute: toggleMute,
      onToggleOverview: () => view.toggleOverview(),
      onTogglePause: togglePause,
      onSettingsChanged: () => {
        audio.setMuted(settings.muted)
        saveSettings(settings)
      },
      onToggleMusic: (on) => audio.setMusicEnabled(on),
      // 换角色：下一局开局生效（D15），并记成下次打开页面的默认选中。
      onChangeCharacter: (id) => {
        host.setLocalCharacter(id)
        saveLastCharacter(id)
      },
    },
  })
  hud.setMuted(settings.muted)

  const input = createInput({
    target: window,
    touchRoot: $('touch'),
    onToggleOverview: () => view.toggleOverview(),
    onTogglePause: togglePause,
    onToggleMute: toggleMute,
    onFirstGesture: () => audio.unlock(),
  })

  window.addEventListener('resize', () => view.resize())
  // 切到后台自动暂停；切回来时只恢复「自动暂停」的那一次，玩家自己按的暂停不动。
  let autoPaused = false
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !host.isPaused()) {
      autoPaused = true
      togglePause()
    } else if (!document.hidden && autoPaused) {
      autoPaused = false
      if (host.isPaused()) togglePause()
    }
  })

  let last = performance.now()
  const frame = (now: number): void => {
    const dt = Math.min(100, now - last)
    last = now
    touchNow = input.isTouch()
    for (const a of input.poll()) host.sendInput(a)
    host.pump(now * timeScale)
    const s = feed.sample(now)
    if (s) {
      view.update(s, dt)
      hud.update(s, dt)
      input.setSkillButton(hud.skillButton())
      audio.update(s, host.localPlayerId)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // 调试入口（原型专用）：浏览器控制台里可读帧、哈希、种子、角色与难度。
  ;(window as unknown as { __bomber: unknown }).__bomber = { host, feed, seed, config, rules, settings, character, ai: host.ai, params }
}
