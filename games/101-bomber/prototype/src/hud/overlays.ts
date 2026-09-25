import type { PresentationSettings } from '../present/settings'
import { el, iconEl, roundButton } from './dom'
import type { HudCallbacks } from './index'

type Card = 'pause' | 'help' | 'settings'

/**
 * 暂停 / 帮助 / 设置三张卡，同一时刻只显示一张。打开帮助或设置会先请求暂停；
 * 关闭它们回到暂停卡，恢复游戏只走「继续」（或 Esc），与规则层暂停状态保持单一来源。
 */
export class Overlays {
  private readonly root: HTMLDivElement
  private readonly cards: Record<Card, HTMLDivElement>
  private readonly muteBox: HTMLInputElement
  private paused = false
  private card: Card | null = null
  private pendingCard: Card | null = null

  constructor(parent: HTMLElement, private readonly settings: PresentationSettings, private readonly cb: HudCallbacks) {
    this.root = el('div', 'hud-modal', parent)
    this.root.dataset.ui = '1'
    this.cards = {
      pause: this.buildPause(),
      help: this.buildHelp(),
      settings: el('div', 'md-card'),
    }
    this.muteBox = this.buildSettings(this.cards.settings)
    for (const c of Object.values(this.cards)) this.root.appendChild(c)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.show(this.pendingCard ?? this.card ?? 'pause')
    else this.show(null)
    this.pendingCard = null
  }

  open(card: 'help' | 'settings'): void {
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
    return card
  }

  private buildHelp(): HTMLDivElement {
    const card = el('div', 'md-card md-help')
    this.header(card, '怎么玩', true)
    const keys: [string, string][] = [
      ['WASD / 方向键', '移动（四向，靠近路口会自动转弯）'],
      ['空格', '放炸弹'],
      ['V', '切换跟随 / 全局俯瞰'],
      ['Esc', '暂停'],
      ['M', '全部静音（音乐 + 音效）'],
      ['右上音符按钮', '只开关背景音乐'],
      ['触屏', '左下拖动摇杆移动，右下按钮放炸弹'],
    ]
    const dl = el('dl', 'md-keys', card)
    for (const [k, v] of keys) {
      el('dt', '', dl).textContent = k
      el('dd', '', dl).textContent = v
    }
    const rules = el('ul', 'md-rules', card)
    for (const t of [
      '3 颗心；每颗炸弹 −1 心，连锁能一口气秒杀。',
      '炸开积木会掉糖：火力、炸弹、速度、血包。',
      '头顶的帽子 = 身上的强化数：吃一个火力 / 炸弹 / 速度就多一顶，血包不算。',
      '被炸死时强化每级一半概率掉出（决赛圈里全掉），帽子跟着变少；掉在地上的强化谁捡归谁。',
      '帽子最多的是帽王，头顶有光柱；屏幕边缘箭头指向他。',
      '水里会减速、放不了炸弹，泡久了会溺水。',
      '最后 90 秒（或积木快被炸光时）进入决赛圈：死了不再复活，圈外中毒，安全圈会缩小。',
      '决赛圈里的金色宝箱要被炸 3 次才开，里面有强化和血包。',
      '计时结束（或决赛圈只剩 1 人），帽子最多者赢。',
    ]) {
      el('li', '', rules).textContent = t
    }
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
