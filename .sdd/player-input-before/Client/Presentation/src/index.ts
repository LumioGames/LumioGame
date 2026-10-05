import './presentation.css'
import { createAudio } from './audio'
import { CHARACTER_ORDER, DEFAULT_CONFIG, DEFAULT_RULES, type BomberConfig, type CharacterId, type ProtoRules, type TickFrame, type U64 } from './contract'
import { createHud } from './hud'
import { PresentationFeed } from './present/feed'
import { loadSettings, saveSettings } from './present/settings'
import { attachPresentationShortcuts } from './present/shortcuts'
import { createView, renderDollPortraits } from './view'

export * from './contract'
export type { GameView, ScreenPoint, ViewOptions } from './view'
export { renderDollPortraits } from './view'
export { PresentationFeed } from './present/feed'
export type { FeedSample } from './present/feed'
export { createReplicaAdapter } from './replica-adapter'
export { projectReplicaConfig } from './replica-config'
export { ReplicaTerrain } from './replica-terrain'

export interface PresentationOptions {
  stage: HTMLElement
  labels: HTMLElement
  hud: HTMLElement
  localPlayerId: U64
  config?: BomberConfig
  rules?: ProtoRules
  callbacks?: {
    onUseSkill?(): void
    onPlaceBomb?(): void
    onChangeCharacter?(id: CharacterId): void
  }
}

export interface Presentation {
  push(frame: TickFrame, now?: number): void
  resize(): void
  toggleOverview(): void
  dispose(): void
}

/** Displays authoritative replica frames. The only loop here advances presentation. */
export function createPresentation(options: PresentationOptions): Presentation {
  const { stage, labels, hud: hudRoot, localPlayerId, callbacks = {} } = options
  const config = options.config ?? DEFAULT_CONFIG
  const rules = options.rules ?? DEFAULT_RULES
  const settings = loadSettings()
  const feed = new PresentationFeed(1000 / config.tickRateHz)
  stage.classList.add('bomber-stage')
  labels.classList.add('bomber-labels')
  hudRoot.classList.add('bomber-hud')
  const audio = createAudio({ muted: settings.muted, rules })
  const view = createView({
    container: stage, labelRoot: labels, config, rules, localPlayerId, settings,
    requestHitstop: (ms) => feed.freeze(ms, performance.now()),
  })
  const toggleMute = (): void => {
    settings.muted = !settings.muted
    audio.setMuted(settings.muted)
    hud.setMuted(settings.muted)
    saveSettings(settings)
  }
  const hud = createHud({
    root: hudRoot, config, rules, localPlayerId, settings,
    project: (x, y, z) => view.project(x, y, z),
    portraits: callbacks.onChangeCharacter
      ? renderDollPortraits(CHARACTER_ORDER.filter((id) => Object.hasOwn(rules.characters, id)).map((id) => rules.characters[id].animal))
      : new Map(),
    callbacks: {
      ...callbacks,
      onToggleMute: toggleMute,
      onToggleOverview: () => view.toggleOverview(),
      onToggleMusic: (on) => audio.setMusicEnabled(on),
      onSettingsChanged: () => { audio.setMuted(settings.muted); saveSettings(settings) },
    },
  })
  hud.setMuted(settings.muted)
  const detachShortcuts = attachPresentationShortcuts(window, {
    overview: () => view.toggleOverview(), mute: toggleMute,
    blocked: () => document.hidden || hudRoot.querySelector('.hud-modal.is-on') !== null,
  })
  let disposed = false
  let last = performance.now()
  let animation = 0
  const render = (now: number): void => {
    if (disposed) return
    const dt = Math.min(100, Math.max(0, now - last))
    last = now
    const sample = feed.sample(now)
    if (sample) {
      view.update(sample, dt)
      hud.update(sample, dt)
      audio.update(sample, localPlayerId)
    }
    animation = requestAnimationFrame(render)
  }
  const unlock = (): void => audio.unlock()
  const resize = (): void => { if (!disposed) view.resize() }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  window.addEventListener('resize', resize)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(stage)
  animation = requestAnimationFrame(render)
  return {
    push: (frame, now = performance.now()) => { if (!disposed) feed.push(frame, now) },
    resize,
    toggleOverview: () => { if (!disposed) view.toggleOverview() },
    dispose: () => {
      if (disposed) return
      disposed = true
      detachShortcuts()
      cancelAnimationFrame(animation)
      observer?.disconnect()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('resize', resize)
      hud.dispose()
      view.dispose()
      audio.dispose()
      feed.reset()
      stage.classList.remove('bomber-stage')
      labels.classList.remove('bomber-labels')
      hudRoot.classList.remove('bomber-hud')
    },
  }
}
