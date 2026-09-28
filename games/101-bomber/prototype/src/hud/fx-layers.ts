import type { PickupKind } from '../contract'
import { el, iconEl, restartAnimation, setIcon, setText } from './dom'
import type { BannerTone, PopupTone } from './hud-brain'
import type { TipProgress } from './tips'

interface BannerItem {
  tone: BannerTone
  title: string
  sub: string
  mine: boolean
}

/** 横幅排队最多留几条。 */
export const BANNER_QUEUE_MAX = 3

/**
 * 横幅排队规则（纯逻辑）：决赛圈开场插队到最前（它改变的是生死规则）；本人连杀紧跟其后（这一杀的即时反馈，
 * 排在别人的加冕 / 倒台后面就失去意义了，ADR 0043）；其余按到达顺序。超过上限时先挤掉最早的普通横幅，插队的两种不被挤掉。
 */
export function queueBanner<T extends { tone: BannerTone }>(queue: T[], b: T, max = BANNER_QUEUE_MAX): void {
  if (b.tone === 'final') queue.unshift(b)
  else if (b.tone === 'streak') {
    let i = 0
    while (i < queue.length && (queue[i].tone === 'final' || queue[i].tone === 'streak')) i++
    queue.splice(i, 0, b)
  } else queue.push(b)
  while (queue.length > max) {
    const i = queue.findIndex((x) => x.tone !== 'final' && x.tone !== 'streak')
    queue.splice(i >= 0 ? i : 0, 1)
  }
}

/**
 * 全场横幅：只播加冕 / 倒台 / 决赛圈开场（design §3.1、§4.2），排队逐条播放。
 * 原型扩展（NON-CONTRACT，ADR 0030）：本人进化「进化：火焰冲刺！」也走横幅（tone 'evolve'，只给本人看）。
 * 本人连杀（tone 'streak'，ADR 0043）：双杀 … 暴走 / 大杀特杀 / 主宰 / 超神，只给本人看。
 */
export class BannerQueue {
  private readonly root: HTMLDivElement
  private readonly title: HTMLDivElement
  private readonly sub: HTMLDivElement
  private readonly icon: HTMLSpanElement
  private readonly queue: BannerItem[] = []
  private until = 0
  static readonly DURATION_MS = 1800
  /** 决赛圈开场横幅更久（规则变了，要读完两句）。 */
  static readonly FINAL_DURATION_MS = 2800
  /** 进化横幅：一句名字 + 配方，比加冕略长。 */
  static readonly EVOLVE_DURATION_MS = 2200

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-banner', parent)
    const row = el('div', 'bn-row', this.root)
    this.icon = iconEl('crown', 'bn-ico', row)
    this.title = el('div', 'bn-title', row)
    this.sub = el('div', 'bn-sub', this.root)
  }

  push(b: BannerItem): void {
    queueBanner(this.queue, b)
  }

  update(now: number): void {
    if (now < this.until) return
    const next = this.queue.shift()
    if (!next) {
      this.root.classList.remove('is-on')
      return
    }
    this.until =
      now + (next.tone === 'final' ? BannerQueue.FINAL_DURATION_MS : next.tone === 'evolve' ? BannerQueue.EVOLVE_DURATION_MS : BannerQueue.DURATION_MS)
    this.root.dataset.tone = next.tone
    setIcon(this.icon, next.tone === 'final' ? 'ring' : next.tone === 'evolve' ? 'spark' : next.tone === 'streak' ? 'flame' : 'crown')
    this.root.classList.toggle('is-mine', next.mine)
    setText(this.title, next.title)
    setText(this.sub, next.sub)
    restartAnimation(this.root, 'is-on')
  }

  clear(): void {
    this.queue.length = 0
    this.until = 0
    this.root.classList.remove('is-on')
  }
}

interface PopupEntry {
  node: HTMLDivElement
  until: number
}

/** 本人弹字（×N 连锁 / 双杀 / 拆迁 / 收割 / 逆袭 / 击飞 XX！+N / 首次 ×N 连锁）。同 key 的弹字原地升级而不是叠一条新的。 */
export class PopupStack {
  private readonly root: HTMLDivElement
  private readonly entries = new Map<string, PopupEntry>()
  static readonly MAX = 4

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-popups', parent)
  }

  show(key: string, tone: PopupTone, text: string, tier: number, now: number): void {
    let e = this.entries.get(key)
    if (!e) {
      const node = el('div', 'popup')
      this.root.prepend(node)
      e = { node, until: 0 }
      this.entries.set(key, e)
      while (this.entries.size > PopupStack.MAX) {
        const [oldKey, old] = this.entries.entries().next().value as [string, PopupEntry]
        old.node.remove()
        this.entries.delete(oldKey)
      }
    }
    e.node.dataset.tone = tone
    e.node.dataset.tier = String(Math.max(1, Math.min(4, tier)))
    setText(e.node, text)
    e.until = now + 1300 + tier * 150
    restartAnimation(e.node, 'is-on')
  }

  update(now: number): void {
    for (const [k, e] of this.entries) {
      if (now >= e.until) {
        e.node.remove()
        this.entries.delete(k)
      }
    }
  }

  clear(): void {
    for (const e of this.entries.values()) e.node.remove()
    this.entries.clear()
  }
}

/** 属性胶囊旁的「+1 火力」闪字；技能糖（「获得 闪现 Lv1」）按技能色描字（ADR 0030）。 */
export class PickupFlash {
  private readonly node: HTMLDivElement
  private until = 0

  constructor(parent: HTMLElement) {
    this.node = el('div', 'hud-flash', parent)
  }

  show(text: string, kind: PickupKind, now: number, color?: string): void {
    setText(this.node, text)
    this.node.dataset.kind = String(kind)
    if (color) this.node.style.setProperty('--flash', color)
    else this.node.style.removeProperty('--flash')
    this.until = now + 1000
    restartAnimation(this.node, 'is-on')
  }

  update(now: number): void {
    if (this.until && now >= this.until) {
      this.until = 0
      this.node.classList.remove('is-on')
    }
  }
}

/**
 * 计分板下方的提示胶囊：首次游玩三条提示（design §13），兼做临时通知。
 * 优先级：临时通知 > 刚完成的提示（短暂显示「完成」）> 当前提示。
 */
export class HintPill {
  private readonly node: HTMLDivElement
  private readonly label: HTMLSpanElement
  private readonly text: HTMLSpanElement
  private notice: { text: string; until: number } | null = null
  private done: { text: string; until: number } | null = null

  constructor(parent: HTMLElement, private readonly tips: TipProgress) {
    this.node = el('div', 'hud-hint pill', parent)
    this.label = el('span', 'hint-label', this.node)
    this.text = el('span', 'hint-text', this.node)
    this.node.dataset.mode = ''
  }

  completeTip(id: Parameters<TipProgress['complete']>[0], now: number): void {
    const cur = this.tips.current()
    if (!this.tips.complete(id)) return
    if (cur && cur.id === id) this.done = { text: cur.text, until: now + 1400 }
  }

  showNotice(text: string, now: number): void {
    this.notice = { text, until: now + 2600 }
  }

  update(now: number): void {
    if (this.notice && now >= this.notice.until) this.notice = null
    if (this.done && now >= this.done.until) this.done = null
    let label = ''
    let text = ''
    let mode = ''
    if (this.notice) {
      text = this.notice.text
      mode = 'notice'
    } else if (this.done) {
      label = '完成'
      text = this.done.text
      mode = 'done'
    } else {
      const tip = this.tips.current()
      if (tip) {
        label = `提示 ${tip.id + 1}/3`
        text = tip.text
        mode = 'tip'
      }
    }
    setText(this.label, label)
    setText(this.text, text)
    if (this.node.dataset.mode !== mode) this.node.dataset.mode = mode
  }
}

/** 活着挨炸时，心形胶囊上方的来源提示（「被 X 的连锁 ×N 命中 −1 心」），约 2 秒。 */
export class HitHint {
  private readonly node: HTMLDivElement
  private until = 0
  static readonly DURATION_MS = 2000

  constructor(parent: HTMLElement) {
    this.node = el('div', 'hud-hit', parent)
  }

  show(text: string, now: number): void {
    setText(this.node, text)
    this.until = now + HitHint.DURATION_MS
    restartAnimation(this.node, 'is-on')
  }

  update(now: number): void {
    if (this.until && now >= this.until) {
      this.until = 0
      this.node.classList.remove('is-on')
    }
  }

  clear(): void {
    this.until = 0
    this.node.classList.remove('is-on')
  }
}
