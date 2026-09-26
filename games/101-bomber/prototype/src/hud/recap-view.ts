import { el, iconEl, setStyle, setText } from './dom'
import { lossLine } from './format'
import type { DeathRecap } from './hud-brain'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'

/**
 * 死亡回顾卡（design §9.6）：击杀者、炸弹主人与类型、连锁长度、最后两个伤害来源、
 * 掉出的强化与少了几顶帽子（design §8.5 / §9.4，ADR 0028：帽子 = 强化数；PowerupsDropped / 帽数差晚一 Tick 到，
 * 经 setDrops / setHatsLost 补上），
 * 以及「重新摆上桌」倒计时（从 RespawnAtTick 与 renderTick 算）；决赛圈内死亡改为「出局 · 不再复活」。
 */
export class RecapView {
  private readonly root: HTMLDivElement
  private readonly headline: HTMLDivElement
  private readonly facts: HTMLDListElement
  private readonly sources: HTMLOListElement
  private readonly count: HTMLSpanElement
  private readonly bar: HTMLDivElement
  private readonly footLabel: HTMLSpanElement
  private dropsEl: HTMLElement | null = null
  private skillsEl: HTMLElement | null = null
  private drops: string | null = null
  private hatsLost: number | null = null
  private visible = false
  private shownAt = 0

  constructor(parent: HTMLElement, private readonly respawnSeconds: number) {
    this.root = el('div', 'hud-recap')
    parent.appendChild(this.root)
    const head = el('div', 'rc-head', this.root)
    iconEl('cotton', 'rc-ico', head)
    this.headline = el('div', 'rc-headline', head)
    this.facts = el('dl', 'rc-facts', this.root)
    el('div', 'rc-sub', this.root).textContent = '最后两个伤害来源'
    this.sources = el('ol', 'rc-sources', this.root)
    const foot = el('div', 'rc-foot', this.root)
    this.footLabel = el('span', 'rc-foot-label', foot)
    this.footLabel.textContent = '重新摆上桌'
    this.count = el('span', 'rc-count', foot)
    const track = el('div', 'rc-track', this.root)
    this.bar = el('div', 'rc-bar', track)
  }

  show(r: DeathRecap, now = 0): void {
    this.shownAt = now
    setText(this.headline, r.headline)
    this.facts.textContent = ''
    const fact = (k: string, v: string): void => {
      el('dt', '', this.facts).textContent = k
      el('dd', '', this.facts).textContent = v
    }
    if (r.killerName) fact('击杀者', r.killerName)
    if (r.bombOwnerName) fact('炸弹主人', r.bombOwnerName)
    if (r.bombKindName) fact('炸弹类型', r.bombKindName)
    if (r.chainLength >= 1) fact('连锁长度', r.chainLength >= 2 ? `×${r.chainLength} 连锁` : '单颗')
    this.drops = r.drops
    this.hatsLost = r.hatsLost
    fact('掉落强化', lossLine(r.drops, r.hatsLost))
    this.dropsEl = this.facts.lastElementChild as HTMLElement | null
    this.skillsEl = null
    if (r.skillsLost) {
      fact('掉落技能', r.skillsLost)
      this.skillsEl = this.facts.lastElementChild as HTMLElement | null
    }
    this.root.classList.toggle('is-final', r.final)
    setText(this.footLabel, r.final ? '决赛圈出局 · 不再复活' : '重新摆上桌')
    this.sources.textContent = ''
    if (r.sources.length === 0) el('li', 'rc-empty', this.sources).textContent = '无记录'
    for (const s of r.sources) {
      const li = el('li', '', this.sources)
      const dot = el('span', 'rc-dot', li)
      if (s.animal) {
        dot.style.background = ANIMAL_COLOR[s.animal] ?? '#ccc'
        dot.style.borderColor = s.slot !== null ? (SLOT_COLOR[s.slot] ?? '#fff') : '#fff'
      } else dot.classList.add('is-water')
      el('span', 'rc-src', li).textContent = s.label
      el('span', 'rc-detail', li).textContent = s.detail
    }
    this.visible = true
    this.root.classList.add('is-on')
  }

  /** PowerupsDropped 到达：补上「掉落强化」明细（卡片未显示时由 show() 从 recap 读）。 */
  setDrops(text: string): void {
    this.drops = text
    if (this.dropsEl) setText(this.dropsEl, lossLine(this.drops, this.hatsLost))
  }

  /** 原型扩展（NON-CONTRACT，ADR 0030）：SkillsDropped 到达 → 「掉落技能」一行（D8）；卡片未显示时由 show() 从 recap 读。 */
  setSkillsLost(text: string): void {
    if (!this.visible) return
    if (!this.skillsEl) {
      el('dt', '', this.facts).textContent = '掉落技能'
      this.skillsEl = el('dd', '', this.facts)
    }
    setText(this.skillsEl, text)
  }

  /** 掉了几个强化（= 几顶帽子）定下来了。 */
  setHatsLost(n: number): void {
    this.hatsLost = n
    if (this.dropsEl) setText(this.dropsEl, lossLine(this.drops, this.hatsLost))
  }

  /** 显示了多久（毫秒），出局后观战时用来自动收起。 */
  shownFor(now: number): number {
    return this.visible ? now - this.shownAt : 0
  }

  /** @param remainingSeconds 距重生的秒数（≤0 时显示 0）。 */
  update(remainingSeconds: number): void {
    if (!this.visible) return
    const r = Math.max(0, remainingSeconds)
    setText(this.count, String(Math.ceil(r)))
    setStyle(this.bar, 'transform', `scaleX(${Math.min(1, r / this.respawnSeconds).toFixed(3)})`)
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
