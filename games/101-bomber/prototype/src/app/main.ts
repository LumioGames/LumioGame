import './base.css'
import { DEFAULT_CONFIG, DEFAULT_RULES, type BomberConfig, type ProtoRules } from '../contract'
import { createAudio } from '../audio'
import { createHud } from '../hud'
import { createInput } from '../input'
import { PresentationFeed } from '../present/feed'
import { loadSettings, saveSettings } from '../present/settings'
import { createView } from '../view'
import { LocalHost } from './local-host'

/**
 * 组装入口。URL 参数（均可选）：
 *   ?seed=123     固定地图与 Bot 随机种子（默认随机）
 *   ?match=120    局时秒数（默认 360，design §4）
 *   ?bots=7       Bot 数量 0–7（默认 7）
 */
const params = new URLSearchParams(location.search)
const intParam = (k: string): number | null => {
  const v = params.get(k)
  if (v === null || v.trim() === '') return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

const seed = (intParam('seed') ?? Math.floor(Math.random() * 0x7fffffff)) >>> 0
const matchSec = intParam('match')
const botCount = Math.max(0, Math.min(7, intParam('bots') ?? 7))
const config: BomberConfig = {
  ...DEFAULT_CONFIG,
  ...(matchSec !== null && matchSec > 0 ? { matchDurationMs: matchSec * 1000 } : {}),
}
const rules: ProtoRules = { ...DEFAULT_RULES, playerCount: botCount + 1 }

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} missing`)
  return el
}

const host = new LocalHost({ seed, config, rules, botCount })
const feed = new PresentationFeed(1000 / config.tickRateHz)
host.subscribe((f) => feed.push(f, performance.now()))

const settings = loadSettings()
const view = createView({
  container: $('stage'),
  labelRoot: $('labels'),
  config,
  rules,
  localPlayerId: host.localPlayerId,
  settings,
  requestHitstop: (ms) => feed.freeze(ms, performance.now()),
})
const audio = createAudio({ muted: settings.muted, rules })

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

const hud = createHud({
  root: $('hud'),
  config,
  rules,
  localPlayerId: host.localPlayerId,
  settings,
  project: (x, y, z) => view.project(x, y, z),
  callbacks: {
    onToggleMute: toggleMute,
    onToggleOverview: () => view.toggleOverview(),
    onTogglePause: togglePause,
    onSettingsChanged: () => {
      audio.setMuted(settings.muted)
      saveSettings(settings)
    },
    onToggleMusic: (on) => audio.setMusicEnabled(on),
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
  for (const a of input.poll()) host.sendInput(a)
  host.pump(now)
  const s = feed.sample(now)
  if (s) {
    view.update(s, dt)
    hud.update(s, dt)
    audio.update(s, host.localPlayerId)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 调试入口（原型专用）：浏览器控制台里可读帧、哈希、种子。
;(window as unknown as { __bomber: unknown }).__bomber = { host, feed, seed, config, rules, settings }
