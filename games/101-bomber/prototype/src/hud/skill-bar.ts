import type { SkillSlot } from '../contract'
import type { RegenRingModel, SkillChipModel, SkillHudModel } from '../present/skill-hud'
import { SLOT_LABEL, skillCss } from '../present/skill-style'
import { el, setSkillIcon, setStyle, setText } from './dom'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：属性胶囊旁的技能条——三个槽（炸弹 / 主动 / 被动），
 * 显示技能图标、等级点、主动技能的冷却环与秒数、生效中的脉冲、Shift 提示；以及心旁边的回春计时环。
 * 模型在 present/skill-hud.ts（纯函数），这里只把它写进 DOM（先比较再写）。
 */

interface ChipEls {
  root: HTMLDivElement
  icon: HTMLSpanElement
  sec: HTMLSpanElement
  pips: HTMLSpanElement[]
  key: HTMLSpanElement
  label: HTMLSpanElement
}

/** 等级点最多画 3 个（基础技能 Lv1–3；组合技 1 级不画点）。 */
const MAX_PIPS = 3

export class SkillBar {
  readonly root: HTMLDivElement
  private readonly chips: ChipEls[] = []

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-skills pill', parent)
    for (const slot of ['bomb', 'active', 'passive'] as const) this.chips.push(this.build(slot))
  }

  update(m: SkillHudModel): void {
    m.chips.forEach((c, i) => this.write(this.chips[i], c))
    this.root.classList.toggle('is-frozen', m.frozen)
    this.root.classList.toggle('is-none', m.chips.every((c) => c.skill === null))
  }

  private build(slot: SkillSlot): ChipEls {
    const root = el('div', 'sk-chip is-empty', this.root)
    root.dataset.slot = slot
    const icon = el('span', 'ico sk-ico', root)
    const label = el('span', 'sk-slot', root)
    label.textContent = SLOT_LABEL[slot]
    const sec = el('span', 'sk-sec', root)
    const lv = el('span', 'sk-lv', root)
    const pips: HTMLSpanElement[] = []
    for (let i = 0; i < MAX_PIPS; i++) pips.push(el('span', 'sk-pip', lv))
    const key = el('span', 'sk-key', root)
    return { root, icon, sec, pips, key, label }
  }

  private write(e: ChipEls, c: SkillChipModel): void {
    const r = e.root
    const skill = c.skill ?? ''
    if (r.dataset.skill !== skill) {
      r.dataset.skill = skill
      if (c.skill) setStyle(r, '--skill', skillCss(c.skill))
      else r.style.removeProperty('--skill')
    }
    setSkillIcon(e.icon, c.skill)
    r.classList.toggle('is-empty', c.skill === null)
    r.classList.toggle('is-bound', c.bound)
    r.classList.toggle('is-combo', c.combo)
    r.classList.toggle('is-ready', c.ready)
    r.classList.toggle('is-cd', c.cdFrac > 0)
    r.classList.toggle('is-effect', c.effectFrac > 0)
    setStyle(r, '--cd', (Math.round(c.cdFrac * 100) / 100).toFixed(2))
    setStyle(r, '--fx', (Math.round(c.effectFrac * 100) / 100).toFixed(2))
    setText(e.sec, c.cdFrac > 0 ? String(Math.ceil(c.cdSec - 1e-6)) : '')
    const pips = c.combo ? 0 : c.level
    e.pips.forEach((p, i) => {
      p.classList.toggle('is-on', i < pips)
      p.classList.toggle('is-max', i < c.maxLevel)
    })
    setText(e.key, c.skill ? c.key : '')
    const title = c.skill ? `${c.name}${c.combo ? '' : ` Lv${c.level}`} · ${c.desc}` : `${SLOT_LABEL[c.slot]}：空`
    if (r.title !== title) r.title = title
  }
}

/** 回春计时环的周长（r = 8 的圆，SVG 用户单位）。 */
const RING_C = 2 * Math.PI * 8

/** 心旁边的回春计时环（棉花兔，design §12 的角色例外）：环转满回一次血。 */
export class RegenRing {
  private readonly root: HTMLSpanElement
  private readonly arc: SVGCircleElement

  constructor(parent: HTMLElement, after?: Element) {
    this.root = document.createElement('span')
    this.root.className = 'st-regen'
    this.root.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="rg-bg" cx="10" cy="10" r="8"/>' +
      `<circle class="rg-arc" cx="10" cy="10" r="8" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg>`
    if (after?.parentElement === parent) after.after(this.root)
    else parent.appendChild(this.root)
    this.arc = this.root.querySelector('.rg-arc') as SVGCircleElement
  }

  update(m: RegenRingModel): void {
    this.root.classList.toggle('is-on', m.visible)
    if (!m.visible) return
    const off = ((1 - m.frac) * RING_C).toFixed(2)
    if (this.arc.getAttribute('stroke-dashoffset') !== off) this.arc.setAttribute('stroke-dashoffset', off)
    const title = `回春：${Math.ceil(m.secLeft - 1e-6)} 秒后回血`
    if (this.root.title !== title) this.root.title = title
  }
}
