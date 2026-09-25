import { 方向 } from '../contract'
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
 * 触屏控件：左下浮动虚拟摇杆（底座 120 px、摇杆头 52 px）+ 右下 88 px 放弹按钮（参考图同款圆按钮）。
 * 只在触屏设备显示（`(pointer: coarse)` 或第一次触摸之后）。
 */
export class TouchControls {
  private readonly stick = new Joystick4(60, 0.18, 0.15)
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private readonly bomb: HTMLButtonElement
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
    root.appendChild(this.base)
    root.appendChild(this.bomb)

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

  dispose(): void {
    for (const f of this.off) f()
    this.off.length = 0
    this.base.remove()
    this.bomb.remove()
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
