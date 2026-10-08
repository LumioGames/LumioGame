import './presentation.css'
import { createAudio } from './audio'
import { CHARACTER_ORDER, DEFAULT_CONFIG, DEFAULT_RULES, type BomberConfig, type CharacterId, type ProtoRules, type TickFrame, type U64, type 方向 } from './contract'
import { createHud } from './hud'
import { PresentationFeed, type LocalPresentationPose } from './present/feed'
import { loadSettings, saveSettings } from './present/settings'
import { attachPresentationShortcuts } from './present/shortcuts'
import { TouchControls } from './present/touch-controls'
import { createView, renderDollPortraits, type LocalViewDebug } from './view'

export * from './contract'
export type { GameView, LocalViewDebug, ScreenPoint, ViewOptions } from './view'
export { renderDollPortraits } from './view'
export { PresentationFeed } from './present/feed'
export type { FeedSample, LocalPresentationPose } from './present/feed'
export { createReplicaAdapter } from './replica-adapter'
export { projectReplicaConfig } from './replica-config'
export { ReplicaTerrain } from './replica-terrain'
export { chooseEntryCharacter } from './entry-selection'

export interface PresentationOptions {
  stage: HTMLElement
  labels: HTMLElement
  hud: HTMLElement
  localPlayerId: U64
  readLocalPose?(): LocalPresentationPose | null
  /** 开发期移动埋点：每个渲染帧在 view 更新后回调一次；不传则不取任何调试值。 */
  onFrame?(frame: PresentationFrameTrace): void
  config?: BomberConfig
  rules?: ProtoRules
  callbacks?: {
    onUseSkill?(): void
    onPlaceBomb?(): void
    onBombButton?(pressed: boolean, cancelled?: boolean, surface?: 'hud' | 'touch'): void
    onChangeCharacter?(id: CharacterId): boolean | void
    onMove?(primary: 方向, secondary: 方向): void
    inputReady?(): boolean
  }
}

export interface PresentationFrameTrace {
  now: number
  dt: number
  renderTick: number
  localPose: LocalPresentationPose | null | undefined
  local: LocalViewDebug | null
}

export interface Presentation {
  setSelectionWindow(open: boolean, initial: boolean): void
  inputBlocked(): boolean
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
  const touchRoot = callbacks.onMove ? document.createElement('div') : null
  if (touchRoot) hudRoot.append(touchRoot)
  const touch = touchRoot ? new TouchControls(touchRoot, {
    move: (primary, secondary) => callbacks.onMove?.(primary, secondary),
    bomb: () => callbacks.onPlaceBomb?.(), skill: () => callbacks.onUseSkill?.(),
    bombButton: callbacks.onBombButton ? (pressed, cancelled) => callbacks.onBombButton?.(pressed, cancelled, 'touch') : undefined,
    ready: () => !document.hidden && !hud.inputBlocked() && (callbacks.inputReady?.() ?? false),
  }, window) : null
  if (window.matchMedia('(pointer: coarse)').matches) touch?.show()
  const toggleMute = (): void => {
    settings.muted = !settings.muted
    audio.setMuted(settings.muted)
    hud.setMuted(settings.muted)
    saveSettings(settings)
  }
  const hud = createHud({
    root: hudRoot, config, rules, localPlayerId, settings,
    isTouch: () => touch?.isVisible() ?? false,
    project: (x, y, z) => view.project(x, y, z),
    portraits: callbacks.onChangeCharacter
      ? renderDollPortraits(CHARACTER_ORDER.filter((id) => Object.hasOwn(rules.characters, id)).map((id) => rules.characters[id].animal))
      : new Map(),
    callbacks: {
      ...callbacks,
      onSelectionGesture: () => audio.unlock(),
      onSelectionSound: (kind) => audio.ui(kind),
      onToggleMute: toggleMute,
      onToggleOverview: () => view.toggleOverview(),
      onToggleMusic: (on) => audio.setMusicEnabled(on),
      onSettingsChanged: () => { audio.setMuted(settings.muted); saveSettings(settings) },
    },
  })
  hud.setMuted(settings.muted)
  const detachShortcuts = attachPresentationShortcuts(window, {
    overview: () => view.toggleOverview(), mute: toggleMute,
    blocked: () => document.hidden || hud.inputBlocked(),
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
      if (options.readLocalPose) sample.localPose = options.readLocalPose()
      view.update(sample, dt)
      options.onFrame?.({ now, dt, renderTick: sample.renderTick, localPose: sample.localPose, local: view.debugLocal() })
      hud.update(sample, dt)
      touch?.setSkill(hud.skillButton())
      audio.update(sample, localPlayerId)
    }
    touch?.setEnabled(!document.hidden && !hud.inputBlocked() && (callbacks.inputReady?.() ?? false))
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
    setSelectionWindow: (open, initial) => { if (!disposed) hud.setSelectionWindow(open, initial) },
    inputBlocked: () => disposed || hud.inputBlocked(),
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
      touch?.dispose()
      touchRoot?.remove()
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
