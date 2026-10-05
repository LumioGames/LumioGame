import type { BomberConfig, BotDifficulty, CharacterId } from '../contract'
import type { PresentationSettings } from '../present/settings'
import { CharacterSelect, loadLastCharacter, saveLastCharacter, type Portraits } from './character-select'
import { el, roundButton } from './dom'
import type { HudCallbacks } from './index'
import { selectCards, type SelectRules } from './select-model'
import type { HelpRules } from './tips'

type Card = 'settings' | 'character'

export interface OverlayOptions {
  rules: SelectRules & HelpRules
  config: Pick<BomberConfig, 'healthPointsPerHeart'>
  ai?: BotDifficulty
  portraits?: Promise<Portraits> | Portraits
  currentCharacter(): CharacterId | null
  notice(text: string): void
}

/** Local settings and character selection never pause the authoritative room. */
export class Overlays {
  private readonly root: HTMLDivElement
  private readonly cards: Record<Card, HTMLDivElement>
  private readonly muteBox: HTMLInputElement
  private readonly picker: CharacterSelect | null
  private readonly initialPicker: CharacterSelect | null
  private selectionOpen = false
  private initialSubmitted = false

  constructor(parent: HTMLElement, private readonly settings: PresentationSettings,
    private readonly cb: HudCallbacks, private readonly o: OverlayOptions) {
    this.root = el('div', 'hud-modal', parent)
    this.root.dataset.ui = '1'
    this.cards = { settings: el('div', 'md-card md-settings', this.root), character: el('div', 'md-card md-character', this.root) }
    this.muteBox = this.buildSettings(this.cards.settings)
    const cards = selectCards(o.rules, o.config)
    this.picker = cb.onChangeCharacter ? new CharacterSelect({
      host: this.cards.character, mode: 'switch', cards, portraits: o.portraits ?? new Map(),
      onGesture: cb.onSelectionGesture, onSound: cb.onSelectionSound,
      onConfirm: (id) => { this.confirm(id); this.show(null) },
      onCancel: () => this.show(null),
    }) : null
    this.initialPicker = cb.onChangeCharacter ? new CharacterSelect({
      host: parent, mode: 'start', cards, portraits: o.portraits ?? new Map(),
      onGesture: cb.onSelectionGesture, onSound: cb.onSelectionSound,
      onConfirm: (id) => this.confirm(id),
    }) : null
  }

  private confirm(id: CharacterId): void {
    if (!this.selectionOpen) return
    if (this.cb.onChangeCharacter?.(id) === false) return
    saveLastCharacter(id)
    this.initialSubmitted = true
  }

  setSelectionWindow(open: boolean, initial: boolean): void {
    this.selectionOpen = open
    if (!open) {
      this.initialPicker?.hide()
      if (this.picker?.isOpen()) this.show(null)
    } else if (initial && !this.initialSubmitted && !this.initialPicker?.isOpen()) {
      this.show(null)
      this.initialPicker?.show(loadLastCharacter() ?? this.o.currentCharacter())
    }
  }

  inputBlocked(): boolean { return this.root.classList.contains('is-on') || Boolean(this.initialPicker?.isOpen()) }

  open(card: Card): void {
    if (this.initialPicker?.isOpen() || (card === 'character' && (!this.picker || !this.selectionOpen))) return
    this.show(card)
  }

  setMuted(muted: boolean): void { this.muteBox.checked = !muted }

  dispose(): void { this.picker?.dispose(); this.initialPicker?.dispose(); this.root.remove() }

  private show(card: Card | null): void {
    this.root.classList.toggle('is-on', card !== null)
    for (const [key, node] of Object.entries(this.cards)) node.classList.toggle('is-on', key === card)
    if (card === 'character') this.picker?.show(this.o.currentCharacter())
    else this.picker?.hide()
  }

  private buildSettings(card: HTMLDivElement): HTMLInputElement {
    const head = el('div', 'md-head', card)
    el('div', 'md-title', head).textContent = '设置'
    roundButton('close', '关闭', head, () => this.show(null))
    const slider = (label: string, get: () => number, set: (value: number) => void): void => {
      const row = el('label', 'md-row', card)
      el('span', 'md-label', row).textContent = label
      const input = el('input', 'md-range', row)
      input.type = 'range'
      input.min = '0'
      input.max = '100'
      input.step = '5'
      input.value = String(Math.round(get() * 100))
      const out = el('span', 'md-val', row)
      out.textContent = `${input.value}%`
      input.addEventListener('input', () => {
        set(Number(input.value) / 100)
        out.textContent = `${input.value}%`
        this.cb.onSettingsChanged()
      })
    }
    slider('屏幕震动', () => this.settings.shake, (v) => { this.settings.shake = v })
    slider('全屏效果', () => this.settings.fullscreenFx, (v) => { this.settings.fullscreenFx = v })
    const row = el('label', 'md-row', card)
    el('span', 'md-label', row).textContent = '音效'
    const box = el('input', 'md-check', row)
    box.type = 'checkbox'
    box.checked = !this.settings.muted
    box.addEventListener('change', () => {
      if (box.checked !== !this.settings.muted) this.cb.onToggleMute()
    })
    return box
  }
}
