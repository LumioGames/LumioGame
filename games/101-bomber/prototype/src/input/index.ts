import './touch.css'
import type { AbilityActivation } from '../contract'
import { attachKeyboard, InputState, type ListenerTarget } from './keyboard'
import { TouchControls } from './touch-controls'

export interface InputOptions {
  target: Window
  /** 触屏控件（虚拟摇杆 + 放弹按钮）挂载点；只在触屏设备显示。 */
  touchRoot: HTMLElement
  onToggleOverview(): void
  onTogglePause(): void
  onToggleMute(): void
  /** 第一次用户手势（用于解锁 WebAudio）。 */
  onFirstGesture(): void
}

export interface InputController {
  /**
   * 每个渲染帧调用一次：返回一条 `移动`（当前方向；方向变化时 `按了转弯 = true`），
   * 以及自上次 poll 以来若按过放弹则再加一条 `放弹`（边沿触发）。
   */
  poll(): AbilityActivation[]
  isTouch(): boolean
  dispose(): void
}

export function createInput(opts: InputOptions): InputController {
  const { target } = opts
  const state = new InputState()
  const detachKeyboard = attachKeyboard(target as unknown as ListenerTarget, state, (c) => {
    if (c === 'overview') opts.onToggleOverview()
    else if (c === 'pause') opts.onTogglePause()
    else opts.onToggleMute()
  })
  const touch = new TouchControls(opts.touchRoot, state, target)
  if (target.matchMedia?.('(pointer: coarse)').matches) touch.show()

  let gestured = false
  // 捕获阶段注册：第一次触摸要先把触屏控件显示出来，再交给摇杆的冒泡监听起手。
  const onGesture = (e: Event): void => {
    if (e.type === 'touchstart' || (e as PointerEvent).pointerType === 'touch') touch.show()
    if (!gestured) {
      gestured = true
      opts.onFirstGesture()
    }
  }
  const gestureTypes = ['keydown', 'pointerdown', 'touchstart'] as const
  for (const t of gestureTypes) target.addEventListener(t, onGesture, { capture: true, passive: true })

  return {
    poll: () => state.poll(touch.direction()),
    isTouch: () => touch.isVisible(),
    dispose() {
      detachKeyboard()
      touch.dispose()
      for (const t of gestureTypes) target.removeEventListener(t, onGesture, { capture: true })
    },
  }
}
