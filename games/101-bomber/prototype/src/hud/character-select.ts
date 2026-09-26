import type { AnimalId, BomberConfig, BotDifficulty, CharacterId } from '../contract'
import { skillCss } from '../present/skill-style'
import { el, iconEl, skillIconEl } from './dom'
import { uiScale } from './format'
import { ANIMAL_COLOR } from './icons'
import { AI_LABEL, initialIndex, selectCards, selectKey, selectKeysHint, selectReduce, type SelectCard, type SelectMode, type SelectRules, type SelectState } from './select-model'

/**
 * 选角界面（ADR 0030 / D1）的 DOM：开局前一屏（'start'），以及暂停卡 / 结算页「换角色」里的同一套卡片（'switch'，
 * 下一局生效）。逻辑全在 select-model.ts；这里只画卡、接键盘 / 指针。
 * 头像由 app 从 view 的 renderDollPortraits 传进来（HUD 不 import view）；没到之前用动物色块顶上。
 */

export type Portraits = ReadonlyMap<AnimalId, string>

export interface CharacterSelectOptions {
  host: HTMLElement
  mode: SelectMode
  cards: readonly SelectCard[]
  aiLabel?: string
  portraits: Promise<Portraits> | Portraits
  onConfirm(id: CharacterId): void
  onCancel?(): void
  /** 第一次按键 / 点击（解锁 WebAudio）。 */
  onGesture?(): void
  /** 换卡 / 确认的提示音。 */
  onSound?(kind: 'select' | 'confirm'): void
}

interface CardEls {
  root: HTMLButtonElement
  art: HTMLDivElement
}

export class CharacterSelect {
  private readonly root: HTMLDivElement
  private readonly cardEls: CardEls[] = []
  private state: SelectState = { index: 0, done: null }
  private open = false
  private disposed = false
  private readonly onKey = (e: KeyboardEvent): void => this.key(e)

  constructor(private readonly o: CharacterSelectOptions) {
    this.root = el('div', 'hud-select', o.host)
    this.root.dataset.mode = o.mode
    this.root.dataset.ui = '1'
    const head = el('div', 'sel-head', this.root)
    el('div', 'sel-title', head).textContent = o.mode === 'start' ? '选择角色' : '换角色'
    el('div', 'sel-sub', head).textContent =
      o.mode === 'start' ? '每个角色带一个专属技能 · 之后在暂停或结算里还能换' : '下一局开局生效，本局不变'
    const row = el('div', 'sel-cards', this.root)
    row.setAttribute('role', 'radiogroup')
    o.cards.forEach((c, i) => this.cardEls.push(this.buildCard(row, c, i)))
    const foot = el('div', 'sel-foot', this.root)
    const info = el('div', 'sel-info', foot)
    if (o.aiLabel) el('span', 'sel-ai', info).textContent = `对手难度：${o.aiLabel}`
    el('span', 'sel-keys', info).textContent = selectKeysHint(o.mode)
    const actions = el('div', 'sel-actions', foot)
    if (o.mode === 'switch') {
      const cancel = el('button', 'md-btn', actions)
      cancel.type = 'button'
      el('span', '', cancel).textContent = '取消'
      cancel.addEventListener('click', () => {
        cancel.blur()
        this.dispatch({ t: 'cancel' })
      })
    }
    const ok = el('button', 'md-btn is-primary sel-go', actions)
    ok.type = 'button'
    iconEl('play', '', ok)
    el('span', '', ok).textContent = o.mode === 'start' ? '开始对局' : '确定'
    ok.addEventListener('click', () => {
      ok.blur()
      this.o.onGesture?.()
      this.dispatch({ t: 'confirm' })
    })
    const p = o.portraits
    if (p instanceof Promise) void p.then((m) => this.setPortraits(m)).catch(() => undefined)
    else this.setPortraits(p)
  }

  show(current: string | null): void {
    if (this.disposed) return
    this.state = { index: initialIndex(current), done: null }
    this.render()
    if (!this.open) globalThis.addEventListener?.('keydown', this.onKey, { capture: true })
    this.open = true
    this.root.classList.add('is-on')
    this.cardEls[this.state.index]?.root.focus({ preventScroll: true })
  }

  hide(): void {
    if (!this.open) return
    this.open = false
    globalThis.removeEventListener?.('keydown', this.onKey, { capture: true })
    this.root.classList.remove('is-on')
  }

  isOpen(): boolean {
    return this.open
  }

  dispose(): void {
    this.hide()
    this.disposed = true
    this.root.remove()
  }

  /** 头像到了：色块换成图片（渲染失败的动物继续用色块）。 */
  setPortraits(m: Portraits): void {
    this.o.cards.forEach((c, i) => {
      const url = m.get(c.animal)
      const art = this.cardEls[i]?.art
      if (!url || !art || art.querySelector('img')) return
      art.textContent = ''
      const img = el('img', 'sel-portrait', art)
      img.alt = c.name
      img.draggable = false
      img.src = url
    })
  }

  private buildCard(row: HTMLElement, c: SelectCard, i: number): CardEls {
    const b = el('button', 'sel-card', row)
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.dataset.character = c.id
    b.style.setProperty('--skill', skillCss(c.skill))
    el('span', 'sel-num', b).textContent = String(i + 1)
    const art = el('div', 'sel-art', b)
    el('div', 'sel-swatch', art).style.background = ANIMAL_COLOR[c.animal] ?? '#ccc'
    el('div', 'sel-name', b).textContent = c.name
    el('div', 'sel-tag', b).textContent = c.tagline
    const sk = el('div', 'sel-skill', b)
    skillIconEl(c.skill, 'sel-skill-ico', sk)
    el('span', 'sel-skill-name', sk).textContent = c.skillName
    el('span', 'sel-badge', sk).textContent = c.kind
    el('div', 'sel-key', b).textContent = c.keyHint
    el('div', 'sel-desc', b).textContent = c.desc
    b.addEventListener('click', () => {
      this.o.onGesture?.()
      this.dispatch({ t: 'pick', i })
    })
    b.addEventListener('dblclick', () => this.dispatch({ t: 'confirm' }))
    return { root: b, art }
  }

  private key(e: KeyboardEvent): void {
    if (!this.open || e.ctrlKey || e.metaKey || e.altKey) return
    // Esc 不映射（selectKey 返回 null），不拦截：交给全局暂停键，换角色模式下恢复游戏时整张卡一起关掉。
    const a = selectKey(e.code)
    if (!a) return
    // 捕获阶段拦下：方向键 / 空格不能漏给游戏输入。
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.repeat && a.t !== 'move') return
    this.o.onGesture?.()
    this.dispatch(a)
  }

  private dispatch(a: Parameters<typeof selectReduce>[1]): void {
    const before = this.state
    this.state = selectReduce(this.state, a, this.o.cards.length, this.o.mode)
    if (this.state.index !== before.index) this.o.onSound?.('select')
    this.render()
    if (this.state.done === 'confirmed') {
      this.o.onSound?.('confirm')
      const id = this.o.cards[this.state.index].id
      this.hide()
      this.o.onConfirm(id)
    } else if (this.state.done === 'cancelled') {
      this.hide()
      this.o.onCancel?.()
    }
  }

  private render(): void {
    this.cardEls.forEach((c, i) => {
      const on = i === this.state.index
      c.root.classList.toggle('is-on', on)
      c.root.setAttribute('aria-checked', String(on))
      c.root.tabIndex = on ? 0 : -1
    })
  }
}

const LAST_KEY = 'lumio-101-bomber-character'

/** 上次在界面里确认的角色（`?char=` 不写这里）；存储不可用时为 null。 */
export function loadLastCharacter(store?: Pick<Storage, 'getItem'>): string | null {
  try {
    // 读 localStorage 本身也可能抛（存储被禁用），所以放在 try 里取。
    return (store ?? globalThis.localStorage)?.getItem(LAST_KEY) ?? null
  } catch {
    // 隐私模式 / 存储被禁用：当作第一次来。
    return null
  }
}

export function saveLastCharacter(id: CharacterId, store?: Pick<Storage, 'setItem'>): void {
  try {
    ;(store ?? globalThis.localStorage)?.setItem(LAST_KEY, id)
  } catch {
    // 同上。
  }
}

export interface PickCharacterOptions {
  root: HTMLElement
  rules: SelectRules
  config: Pick<BomberConfig, 'healthPointsPerHeart'>
  portraits: Promise<Portraits> | Portraits
  ai: BotDifficulty
  initial: string | null
  onGesture(): void
  onSound?(kind: 'select' | 'confirm'): void
}

/** 开局选角：在 HUD 根节点上挂一屏选角，确认后移除并返回所选角色（并记进 localStorage）。 */
export function pickCharacter(o: PickCharacterOptions): Promise<CharacterId> {
  o.root.classList.add('hud')
  const vw = o.root.clientWidth || globalThis.innerWidth || 1280
  const vh = o.root.clientHeight || globalThis.innerHeight || 720
  o.root.style.setProperty('--u', uiScale(vw, vh).toFixed(3))
  return new Promise((resolve) => {
    const sel = new CharacterSelect({
      host: o.root,
      mode: 'start',
      cards: selectCards(o.rules, o.config),
      aiLabel: AI_LABEL[o.ai],
      portraits: o.portraits,
      onGesture: o.onGesture,
      ...(o.onSound ? { onSound: o.onSound } : {}),
      onConfirm: (id) => {
        saveLastCharacter(id)
        sel.dispose()
        resolve(id)
      },
    })
    sel.show(o.initial)
  })
}
