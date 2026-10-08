import type { SkillSlot } from '../contract'
import type { RegenRingModel, SkillChipModel, SkillHudModel } from '../present/skill-hud'
import { skillCss } from '../present/skill-style'
import { el, setSkillIcon, setStyle, setText } from './dom'
import { ICON } from './icons'

interface ChipEls {
  root: HTMLDivElement
  icon: HTMLSpanElement
  sec: HTMLSpanElement
  button: HTMLButtonElement | null
}

export class SkillBar {
  readonly root: HTMLDivElement
  private readonly chips: ChipEls[] = []

  constructor(parent: HTMLElement, private readonly onUseSkill?: () => void) {
    this.root = el('div', 'hud-skills pill', parent)
    this.chips.push(this.build('bomb'), this.build('active'))
  }

  update(m: SkillHudModel): void {
    m.chips.forEach((c, i) => this.write(this.chips[i], c))
    this.root.classList.toggle('is-frozen', m.frozen)
  }

  private build(slot: SkillSlot): ChipEls {
    const root = el('div', 'sk-chip', this.root)
    root.dataset.slot = slot
    root.dataset.ui = '1'
    const icon = el('span', 'ico sk-ico', root)
    const sec = el('span', 'sk-sec', root)
    return { root, icon, sec, button: null }
  }

  private setControl(e: ChipEls, active: boolean): void {
    if (active && !e.button) {
      const button = el('button', 'sk-cast', e.root)
      button.type = 'button'
      button.dataset.ui = '1'
      button.dataset.slot = 'active'
      button.append(e.icon, e.sec)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        button.blur()
        this.onUseSkill?.()
      })
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopImmediatePropagation()
      })
      e.button = button
    } else if (!active && e.button) {
      e.button.blur()
      e.root.append(e.icon, e.sec)
      e.button.remove()
      e.button = null
    }
  }

  private write(e: ChipEls, c: SkillChipModel): void {
    const r = e.root
    r.dataset.slot = c.slot
    this.setControl(e, c.slot === 'active' && c.skill !== null && !!this.onUseSkill)
    const skill = c.skill ?? ''
    if (r.dataset.skill !== skill) {
      r.dataset.skill = skill
      if (c.skill) setStyle(r, '--skill', skillCss(c.skill))
      else r.style.removeProperty('--skill')
    }
    if (c.slot === 'bomb' && !c.skill) {
      if (e.icon.dataset.skill !== 'standard') {
        e.icon.dataset.skill = 'standard'
        e.icon.innerHTML = ICON.bomb
      }
    } else setSkillIcon(e.icon, c.skill)
    r.classList.toggle('is-empty', c.skill === null && c.slot !== 'bomb')
    r.classList.toggle('is-standard', c.slot === 'bomb' && c.skill === null)
    r.classList.toggle('is-favorite', c.favorite)
    r.classList.toggle('is-ready', c.ready && e.button !== null)
    r.classList.toggle('is-cd', c.cdFrac > 0)
    r.classList.toggle('is-effect', c.effectFrac > 0)
    setStyle(r, '--cd', (Math.round(c.cdFrac * 100) / 100).toFixed(2))
    setStyle(r, '--fx', (Math.round(c.effectFrac * 100) / 100).toFixed(2))
    setText(e.sec, c.cdFrac > 0 ? String(Math.ceil(c.cdSec - 1e-6)) : '')
    if (e.button) {
      e.button.disabled = !c.ready
      e.button.tabIndex = e.button.disabled ? -1 : 0
      e.button.setAttribute('aria-label', `角色技能：${c.name}`)
    }
    const title = c.skill ? `${c.name} · ${c.desc}` : c.slot === 'bomb' ? '标准弹 · 放弹时使用' : '角色技能未就绪'
    if (r.title !== title) r.title = title
    r.setAttribute('aria-label', c.slot === 'bomb' ? `特殊炸弹：${c.name}` : `角色技能：${c.name || '未就绪'}`)
  }
}

const RING_C = 2 * Math.PI * 8

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
