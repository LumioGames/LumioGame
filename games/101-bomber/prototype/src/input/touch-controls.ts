import { 方向, type SkillId } from '../contract'
import type { SkillButtonView } from '../present/skill-hud'
import { SKILL_ICON, skillCss } from '../present/skill-style'
import { Joystick4 } from './joystick'
import type { InputState } from './keyboard'

/** 摇杆可起手的区域：屏幕左侧 45%（右侧留给放弹按钮与 HUD）。 */
const STICK_ZONE = 0.45

/** 点在 HUD 可交互元素上时不起摇杆（按钮、滑条、结算 / 暂停遮罩都标了 data-ui）。 */
function isUiTarget(t: EventTarget | null): boolean {
  const e = t as Element | null
  return typeof e?.closest === 'function' && e.closest('button, input, select, a, [data-ui]') !== null
}

/**
 * 触屏控件：左下浮动虚拟摇杆（底座 120 px、摇杆头 52 px）+ 右下 88 px 放弹按钮（参考图同款圆按钮）
 * + 放弹按钮左边 68 px 技能「副按钮」（原型扩展 NON-CONTRACT，ADR 0030：主动槽技能，带冷却环；主动槽为空时隐藏）。
 * 只在触屏设备显示（`(pointer: coarse)` 或第一次触摸之后）。
 */
export class TouchControls {
  private readonly stick = new Joystick4(60, 0.18, 0.15)
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private readonly bomb: HTMLButtonElement
  private readonly skill: HTMLButtonElement
  private readonly skillIco: HTMLSpanElement
  private readonly skillSec: HTMLSpanElement
  private readonly skillLabel: HTMLSpanElement
  private skillShown: SkillId | null = null
  private pointerId: number | null = null
  private visible = false
  private readonly off: (() => void)[] = []

  constructor(
    private readonly root: HTMLElement,
    private readonly state: InputState,
    private readonly target: Window,
  ) {
    root.classList.add('touch-root')
    this.base = document.createElement('div')
    this.base.className = 'tc-stick is-idle'
    this.knob = document.createElement('div')
    this.knob.className = 'tc-knob'
    this.base.appendChild(this.knob)
    this.bomb = document.createElement('button')
    this.bomb.type = 'button'
    this.bomb.className = 'tc-bomb'
    this.bomb.setAttribute('aria-label', '放炸弹')
    this.bomb.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="14" r="7" fill="currentColor"/>' +
      '<rect x="8.7" y="5.4" width="3.6" height="2.6" rx=".6" fill="currentColor"/>' +
      '<path d="M12 6c1-2.2 3.2-3 5-2.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="18.6" cy="3.6" r="1.8" fill="#FF7A3D"/></svg><span class="tc-bomb-label">放炸弹</span><span class="tc-bomb-key">SPACE</span>'
    this.skill = document.createElement('button')
    this.skill.type = 'button'
    this.skill.className = 'tc-skill is-hidden'
    this.skill.setAttribute('aria-label', '放技能')
    this.skillIco = document.createElement('span')
    this.skillIco.className = 'tc-skill-ico'
    const cd = document.createElement('span')
    cd.className = 'tc-skill-cd'
    this.skillSec = document.createElement('span')
    this.skillSec.className = 'tc-skill-sec'
    this.skillLabel = document.createElement('span')
    this.skillLabel.className = 'tc-skill-label'
    this.skill.append(this.skillIco, cd, this.skillSec, this.skillLabel)
    root.appendChild(this.base)
    root.appendChild(this.bomb)
    root.appendChild(this.skill)

    this.listen(this.skill, 'pointerdown', (e) => {
      e.preventDefault()
      this.state.pressSkill()
      this.skill.classList.add('is-pressed')
    })
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.listen(this.skill, t, () => this.skill.classList.remove('is-pressed'))
    }

    this.listen(this.bomb, 'pointerdown', (e) => {
      e.preventDefault()
      this.state.pressBomb()
      this.bomb.classList.add('is-pressed')
    })
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.listen(this.bomb, t, () => this.bomb.classList.remove('is-pressed'))
    }
    this.listen(target, 'pointerdown', (e) => this.onDown(e as PointerEvent))
    this.listen(target, 'pointermove', (e) => this.onMove(e as PointerEvent))
    this.listen(target, 'pointerup', (e) => this.onUp(e as PointerEvent))
    this.listen(target, 'pointercancel', (e) => this.onUp(e as PointerEvent))
    this.listen(target, 'blur', () => this.release())
  }

  show(): void {
    if (this.visible) return
    this.visible = true
    this.root.classList.add('is-touch')
  }

  isVisible(): boolean {
    return this.visible
  }

  direction(): 方向 {
    return this.stick.isActive() ? this.stick.direction() : 方向.停
  }

  /** 摇杆的副方向（原型扩展 NON-CONTRACT，ADR 0032）：次轴够大时是另一个「按住的方向」。 */
  secondary(): 方向 {
    return this.stick.isActive() ? this.stick.secondary() : 方向.停
  }

  /** 技能按钮的显示状态（每帧由 app 从 HUD 取来）；null = 主动槽为空，隐藏按钮。 */
  setSkill(v: SkillButtonView | null): void {
    const b = this.skill
    b.classList.toggle('is-hidden', v === null)
    if (!v) {
      this.skillShown = null
      return
    }
    if (this.skillShown !== v.skill) {
      this.skillShown = v.skill
      this.skillIco.innerHTML = SKILL_ICON[v.skill]
      b.style.setProperty('--skill', skillCss(v.skill))
      b.setAttribute('aria-label', `放技能：${v.label}`)
    }
    const cd = (Math.round(v.cdFrac * 100) / 100).toFixed(2)
    if (b.style.getPropertyValue('--cd') !== cd) b.style.setProperty('--cd', cd)
    const sec = v.cdFrac > 0 ? String(Math.ceil(v.cdSec - 1e-6)) : ''
    if (this.skillSec.textContent !== sec) this.skillSec.textContent = sec
    if (this.skillLabel.textContent !== v.label) this.skillLabel.textContent = v.label
    b.classList.toggle('is-ready', v.ready)
    b.classList.toggle('is-effect', v.effect)
    b.classList.toggle('is-disabled', v.disabled)
  }

  dispose(): void {
    for (const f of this.off) f()
    this.off.length = 0
    this.base.remove()
    this.bomb.remove()
    this.skill.remove()
    this.root.classList.remove('touch-root', 'is-touch')
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void): void {
    t.addEventListener(type, fn)
    this.off.push(() => t.removeEventListener(type, fn))
  }

  private onDown(e: PointerEvent): void {
    if (!this.visible || this.pointerId !== null) return
    if (e.clientX > this.target.innerWidth * STICK_ZONE || isUiTarget(e.target)) return
    this.pointerId = e.pointerId
    this.stick.start(e.clientX, e.clientY)
    this.base.classList.remove('is-idle')
    this.base.style.left = `${e.clientX}px`
    this.base.style.top = `${e.clientY}px`
    this.drawKnob()
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.stick.move(e.clientX, e.clientY)
    this.drawKnob()
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.pointerId) this.release()
  }

  private release(): void {
    this.pointerId = null
    this.stick.end()
    this.base.classList.add('is-idle')
    this.base.style.left = ''
    this.base.style.top = ''
    this.drawKnob()
  }

  private drawKnob(): void {
    this.knob.style.transform = `translate(${this.stick.knobX.toFixed(1)}px, ${this.stick.knobY.toFixed(1)}px)`
    this.base.dataset.dir = String(this.stick.direction())
  }
}
