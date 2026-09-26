import type { BomberConfig, BotDifficulty, CharacterId } from '../contract'
import type { PresentationSettings } from '../present/settings'
import { CharacterSelect, type Portraits } from './character-select'
import { el, iconEl, roundButton } from './dom'
import type { HudCallbacks } from './index'
import { AI_LABEL, selectCards, type SelectRules } from './select-model'
import { helpRuleLines, type HelpRules } from './tips'

type Card = 'pause' | 'help' | 'settings' | 'character'

/** 原型扩展（NON-CONTRACT，ADR 0030）：暂停卡上的难度一行、帮助卡的规则来源、「换角色」卡要的东西。 */
export interface OverlayOptions {
  rules: SelectRules & HelpRules
  config: Pick<BomberConfig, 'healthPointsPerHeart'>
  ai?: BotDifficulty
  portraits?: Promise<Portraits> | Portraits
  /** 本机当前角色（换角色卡的初始选中）。 */
  currentCharacter(): CharacterId | null
  /** 临时通知（提示胶囊）。 */
  notice(text: string): void
}

/**
 * 暂停 / 帮助 / 设置 / 换角色四张卡，同一时刻只显示一张。打开帮助、设置或换角色会先请求暂停
 * （换角色因此也停住结算倒计时）；关闭帮助 / 设置回到暂停卡，恢复游戏只走「继续」（或 Esc），
 * 与规则层暂停状态保持单一来源。换角色确认后直接恢复游戏（下一局生效）。
 */
export class Overlays {
  private readonly root: HTMLDivElement
  private readonly cards: Record<Card, HTMLDivElement>
  private readonly muteBox: HTMLInputElement
  private readonly picker: CharacterSelect | null
  private paused = false
  private card: Card | null = null
  private pendingCard: Card | null = null

  constructor(
    parent: HTMLElement,
    private readonly settings: PresentationSettings,
    private readonly cb: HudCallbacks,
    private readonly o: OverlayOptions,
  ) {
    this.root = el('div', 'hud-modal', parent)
    this.root.dataset.ui = '1'
    this.cards = {
      pause: this.buildPause(),
      help: this.buildHelp(),
      settings: el('div', 'md-card'),
      character: el('div', 'md-card md-character'),
    }
    this.muteBox = this.buildSettings(this.cards.settings)
    this.picker = cb.onChangeCharacter ? this.buildCharacter(this.cards.character) : null
    for (const c of Object.values(this.cards)) this.root.appendChild(c)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.show(this.pendingCard ?? this.card ?? 'pause')
    else this.show(null)
    this.pendingCard = null
  }

  open(card: 'help' | 'settings' | 'character'): void {
    if (card === 'character' && !this.picker) return
    if (this.paused) {
      this.show(card)
      return
    }
    this.pendingCard = card
    this.cb.onTogglePause()
  }

  setMuted(muted: boolean): void {
    this.muteBox.checked = !muted
  }

  isOpen(): boolean {
    return this.card !== null
  }

  private show(card: Card | null): void {
    this.card = card
    this.root.classList.toggle('is-on', card !== null)
    for (const [k, node] of Object.entries(this.cards)) node.classList.toggle('is-on', k === card)
    if (card === 'character') this.picker?.show(this.o.currentCharacter())
    else this.picker?.hide()
  }

  /** 「换角色」卡：选角卡片的 switch 模式；确认 → 记下（下一局生效）并恢复游戏，取消 → 回暂停卡。 */
  private buildCharacter(card: HTMLDivElement): CharacterSelect {
    const cards = selectCards(this.o.rules, this.o.config)
    return new CharacterSelect({
      host: card,
      mode: 'switch',
      cards,
      ...(this.o.ai ? { aiLabel: AI_LABEL[this.o.ai] } : {}),
      portraits: this.o.portraits ?? new Map(),
      onConfirm: (id) => {
        this.cb.onChangeCharacter?.(id)
        this.o.notice(`下一局换成 ${cards.find((c) => c.id === id)?.name ?? id}`)
        if (this.paused) this.cb.onTogglePause()
        else this.show(null)
      },
      onCancel: () => this.show(this.paused ? 'pause' : null),
    })
  }

  private header(card: HTMLElement, title: string, closable: boolean): void {
    const head = el('div', 'md-head', card)
    el('div', 'md-title', head).textContent = title
    if (closable) roundButton('close', '返回', head, () => this.show(this.paused ? 'pause' : null))
  }

  private buildPause(): HTMLDivElement {
    const card = el('div', 'md-card md-pause')
    this.header(card, '已暂停', false)
    el('p', 'md-note', card).textContent = '规则层已停住，炸弹不会在你离开时爆炸。'
    const row = el('div', 'md-actions', card)
    const resume = el('button', 'md-btn is-primary', row)
    resume.type = 'button'
    iconEl('play', '', resume)
    el('span', '', resume).textContent = '继续'
    resume.addEventListener('click', () => {
      resume.blur()
      this.cb.onTogglePause()
    })
    const help = el('button', 'md-btn', row)
    help.type = 'button'
    iconEl('help', '', help)
    el('span', '', help).textContent = '操作说明'
    help.addEventListener('click', () => {
      help.blur()
      this.show('help')
    })
    const set = el('button', 'md-btn', row)
    set.type = 'button'
    iconEl('gear', '', set)
    el('span', '', set).textContent = '设置'
    set.addEventListener('click', () => {
      set.blur()
      this.show('settings')
    })
    if (this.cb.onChangeCharacter) {
      const swap = el('button', 'md-btn', row)
      swap.type = 'button'
      iconEl('swap', '', swap)
      el('span', '', swap).textContent = '换角色（下一局生效）'
      swap.addEventListener('click', () => {
        swap.blur()
        this.show('character')
      })
    }
    if (this.o.ai) el('p', 'md-note md-ai', card).textContent = `对手难度：${AI_LABEL[this.o.ai]}（网址加 ?ai=easy / normal / hard 可换）`
    return card
  }

  private buildHelp(): HTMLDivElement {
    const card = el('div', 'md-card md-help')
    this.header(card, '怎么玩', true)
    const keys: [string, string][] = [
      ['WASD / 方向键', '移动（四向，靠近路口会自动转弯）'],
      ['空格', '放炸弹'],
      ['Shift', '主动技能（角色专属或拾到的技能）'],
      ['V', '切换跟随 / 全局俯瞰'],
      ['Esc', '暂停'],
      ['M', '全部静音（音乐 + 音效）'],
      ['右上音符按钮', '只开关背景音乐'],
      ['触屏', '左下摇杆移动，右下大按钮放炸弹、小按钮放技能'],
    ]
    const dl = el('dl', 'md-keys', card)
    for (const [k, v] of keys) {
      el('dt', '', dl).textContent = k
      el('dd', '', dl).textContent = v
    }
    const rules = el('ul', 'md-rules', card)
    for (const t of helpRuleLines(this.o.rules)) el('li', '', rules).textContent = t
    return card
  }

  private buildSettings(card: HTMLDivElement): HTMLInputElement {
    card.classList.add('md-settings')
    this.header(card, '设置', true)
    const slider = (label: string, get: () => number, set: (v: number) => void): void => {
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
    slider('屏幕震动', () => this.settings.shake, (v) => (this.settings.shake = v))
    slider('全屏效果（残血红晕）', () => this.settings.fullscreenFx, (v) => (this.settings.fullscreenFx = v))
    const row = el('label', 'md-row', card)
    el('span', 'md-label', row).textContent = '音效'
    const box = el('input', 'md-check', row)
    box.type = 'checkbox'
    box.checked = !this.settings.muted
    box.addEventListener('change', () => {
      if (box.checked === !this.settings.muted) return
      this.cb.onToggleMute()
    })
    el('p', 'md-note', card).textContent = '震动与全屏效果可降到 0（design §9.6）；设置只存在本机浏览器。'
    return box
  }
}
