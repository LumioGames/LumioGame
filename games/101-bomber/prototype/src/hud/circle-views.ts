import { el, iconEl, setStyle, setText } from './dom'
import { formatClock } from './format'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { feedBase, feedColorId, feedLossText, type FeedEntry } from './kill-feed'

/** 开局倒数期间屏幕正中的一句话规则卡（design §9.6，ADR 0025）；Running 开始时由 CSS 过渡淡出。 */
export class RuleCard {
  private readonly root: HTMLDivElement
  private readonly who: HTMLDivElement
  private on = false

  constructor(parent: HTMLElement, lines: readonly string[]) {
    this.root = el('div', 'hud-rules', parent)
    el('div', 'ru-title', this.root).textContent = '一句话规则'
    this.who = el('div', 'ru-who', this.root)
    const list = el('ol', 'ru-list', this.root)
    lines.forEach((t, i) => {
      const li = el('li', '', list)
      el('span', 'ru-n', li).textContent = String(i + 1)
      el('span', 'ru-t', li).textContent = t
    })
  }

  setVisible(on: boolean): void {
    if (on === this.on) return
    this.on = on
    this.root.classList.toggle('is-on', on)
  }

  /** 原型扩展（NON-CONTRACT，ADR 0030）：「你是 闪电猫 · Shift 闪现」；空串 = 不显示。 */
  setCharacter(line: string): void {
    setText(this.who, line)
    this.who.classList.toggle('is-on', line !== '')
  }
}

/** 计时器下方的资源计量条「积木 43%」，带决赛圈资源阈值刻度（design §4.2）。决赛圈开始后隐藏。 */
export class ResourceMeter {
  private readonly root: HTMLDivElement
  private readonly fill: HTMLDivElement
  private readonly mark: HTMLDivElement
  private readonly label: HTMLSpanElement

  constructor(parent: HTMLElement) {
    this.root = el('div', 'sb-res', parent)
    this.label = el('span', 'sb-res-label', this.root)
    const track = el('div', 'sb-res-track', this.root)
    this.fill = el('div', 'sb-res-fill', track)
    this.mark = el('div', 'sb-res-mark', track)
    this.root.title = '剩余积木低于刻度线时提前进入决赛圈'
  }

  update(pct: number | null, thresholdPct: number): void {
    this.root.classList.toggle('is-on', pct !== null)
    if (pct === null) return
    setText(this.label, `积木 ${pct}%`)
    setStyle(this.fill, 'transform', `scaleX(${(pct / 100).toFixed(3)})`)
    setStyle(this.mark, 'left', `${thresholdPct}%`)
    this.root.classList.toggle('is-near', pct < thresholdPct + 10)
  }
}

/** 本人站在安全圈外：紫色屏幕边缘脉冲 + 「圈外中毒 −0.5 心/秒！回到圈内」（design §4.2 表现行；毒强度按段，ADR 0031）。 */
export class PoisonWarn {
  private readonly edge: HTMLDivElement
  private readonly pill: HTMLDivElement
  private readonly text: HTMLSpanElement
  private on = false

  constructor(parent: HTMLElement) {
    this.edge = el('div', 'hud-poison-edge', parent)
    this.pill = el('div', 'hud-poison pill', parent)
    iconEl('ring', 'po-ico', this.pill)
    this.text = el('span', '', this.pill)
    this.text.textContent = '圈外中毒！回到圈内'
  }

  update(outside: boolean, now: number, fxScale: number, text?: string): void {
    if (text) setText(this.text, text)
    if (outside !== this.on) {
      this.on = outside
      this.pill.classList.toggle('is-on', outside)
    }
    const o = outside ? (0.55 + 0.45 * Math.sin(now * 0.001 * 2 * Math.PI * 1.4)) * fxScale : 0
    setStyle(this.edge, 'opacity', o.toFixed(3))
  }
}

/** 决赛圈出局后的观战条：「你已出局 · 第 N 名 · 观战中」+ 距结算时间（design §4.2 / §12 观战）。 */
export class ElimOverlay {
  private readonly root: HTMLDivElement
  private readonly title: HTMLDivElement
  private readonly time: HTMLSpanElement
  private visible = false

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-elim')
    parent.appendChild(this.root)
    this.title = el('div', 'el-title', this.root)
    const sub = el('div', 'el-sub', this.root)
    this.time = el('span', 'el-time', sub)
    el('span', 'el-key', sub).textContent = '镜头跟随帽王 · V 切换俯瞰'
  }

  show(rank: number): void {
    setText(this.title, `你已出局 · 第 ${rank} 名 · 观战中`)
    this.visible = true
    this.root.classList.add('is-on')
  }

  update(remainingSeconds: number): void {
    if (!this.visible) return
    setText(this.time, `距结算 ${formatClock(remainingSeconds)}`)
  }

  isVisible(): boolean {
    return this.visible
  }

  hide(): void {
    if (!this.visible) return
    this.visible = false
    this.root.classList.remove('is-on')
  }
}

/** Top-10 下方的紧凑击杀栏（最近 4 条）。 */
export class KillFeedView {
  private readonly root: HTMLDivElement
  private version = -1

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-feed', parent)
  }

  update(entries: readonly FeedEntry[], version: number, colorOf: (id: number) => { animal: string; slot: number } | null): void {
    if (version === this.version) return
    this.version = version
    this.root.textContent = ''
    for (const e of entries) {
      const row = el('div', 'kf-row', this.root)
      row.classList.toggle('is-local', e.involvesLocal)
      row.dataset.kind = e.kind
      const c = colorOf(feedColorId(e))
      const dot = el('span', 'lb-dot kf-dot', row)
      if (c) {
        dot.style.background = ANIMAL_COLOR[c.animal] ?? '#ccc'
        dot.style.borderColor = SLOT_COLOR[c.slot] ?? '#fff'
      }
      el('span', 'kf-text', row).textContent = feedBase(e)
      const loss = feedLossText(e)
      if (loss) el('span', 'kf-loss', row).textContent = `· ${loss}`
      if (e.eliminated) el('span', 'kf-out', row).textContent = '出局'
    }
    this.root.classList.toggle('is-empty', entries.length === 0)
  }
}
