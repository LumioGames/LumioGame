import { 方向, type AbilityActivation } from '../contract'

/**
 * 键盘输入的纯逻辑（无 DOM，可单测）：
 * - 方向键用「后按者胜」的栈：按住右再按上走上，松开上回到右；
 * - 放弹边沿触发：每次按下（非自动重复）只算一次，poll 时消费；
 * - `按了转弯`（契约 §2.1）：本次 poll 的方向与上次 poll 不同且不是「停」时为 true；
 * - 两次 poll 之间「按下又松开」的短按也不丢：该方向按一帧输出。
 */

export type KeyCommand = 'bomb' | 'overview' | 'pause' | 'mute'

export const KEY_DIRS: Readonly<Record<string, 方向>> = {
  KeyW: 方向.上,
  ArrowUp: 方向.上,
  KeyS: 方向.下,
  ArrowDown: 方向.下,
  KeyA: 方向.左,
  ArrowLeft: 方向.左,
  KeyD: 方向.右,
  ArrowRight: 方向.右,
}

export const KEY_COMMANDS: Readonly<Record<string, KeyCommand>> = {
  Space: 'bomb',
  KeyV: 'overview',
  Escape: 'pause',
  KeyM: 'mute',
}

export class DirectionStack {
  private readonly stack: 方向[] = []

  press(d: 方向): void {
    this.release(d)
    this.stack.push(d)
  }

  release(d: 方向): void {
    const i = this.stack.indexOf(d)
    if (i >= 0) this.stack.splice(i, 1)
  }

  clear(): void {
    this.stack.length = 0
  }

  current(): 方向 {
    return this.stack.length ? this.stack[this.stack.length - 1] : 方向.停
  }
}

export interface KeyResult {
  /** 是游戏键（调用方应 preventDefault）。 */
  handled: boolean
  /** 需要立刻执行的非技能命令（放弹不在此列，它走 poll）。 */
  command: Exclude<KeyCommand, 'bomb'> | null
}

const NONE: KeyResult = { handled: false, command: null }

export class InputState {
  private readonly dirs = new DirectionStack()
  private bombPending = false
  private lastPolled: 方向 = 方向.停
  private tapDir: 方向 = 方向.停

  keyDown(code: string, repeat: boolean): KeyResult {
    const d = KEY_DIRS[code]
    if (d !== undefined) {
      if (!repeat) {
        this.dirs.press(d)
        this.tapDir = d
      }
      return { handled: true, command: null }
    }
    const c = KEY_COMMANDS[code]
    if (c === undefined) return NONE
    if (repeat) return { handled: true, command: null }
    if (c === 'bomb') {
      this.bombPending = true
      return { handled: true, command: null }
    }
    return { handled: true, command: c }
  }

  keyUp(code: string): boolean {
    const d = KEY_DIRS[code]
    if (d !== undefined) {
      this.dirs.release(d)
      return true
    }
    return KEY_COMMANDS[code] !== undefined
  }

  /** 触屏放弹按钮。 */
  pressBomb(): void {
    this.bombPending = true
  }

  /** 失焦 / 切后台：松开所有键，避免角色一直走。未消费的放弹也作废。 */
  clear(): void {
    this.dirs.clear()
    this.bombPending = false
    this.tapDir = 方向.停
  }

  /** @param external 触屏摇杆方向；非「停」时优先于键盘。 */
  poll(external: 方向 = 方向.停): AbilityActivation[] {
    let d = external !== 方向.停 ? external : this.dirs.current()
    if (d === 方向.停) d = this.tapDir
    this.tapDir = 方向.停
    const turn = d !== 方向.停 && d !== this.lastPolled
    this.lastPolled = d
    const out: AbilityActivation[] = [{ ability: '移动', 输入: { 方向: d, 按了转弯: turn } }]
    if (this.bombPending) {
      this.bombPending = false
      out.push({ ability: '放弹' })
    }
    return out
  }
}

/** 键盘事件的最小形状（便于在 Node 里用假对象测试）。 */
export interface KeyEventLike {
  code: string
  repeat: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  target?: unknown
  preventDefault(): void
}

export interface ListenerTarget {
  addEventListener(type: string, listener: (e: never) => void, options?: AddEventListenerOptions | boolean): void
  removeEventListener(type: string, listener: (e: never) => void, options?: EventListenerOptions | boolean): void
}

/** 焦点在表单控件上时（设置面板的滑条），方向键 / 空格留给控件本身；Esc 仍然生效。 */
function isFormTarget(t: unknown): boolean {
  const tag = (t as { tagName?: unknown } | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * 把 InputState 挂到一个事件目标上（真实环境是 window）。返回解绑函数。
 */
export function attachKeyboard(
  target: ListenerTarget,
  state: InputState,
  onCommand: (c: Exclude<KeyCommand, 'bomb'>) => void,
): () => void {
  const down = (e: KeyEventLike): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.code !== 'Escape' && isFormTarget(e.target)) return
    const r = state.keyDown(e.code, e.repeat)
    if (r.handled) e.preventDefault()
    if (r.command) onCommand(r.command)
  }
  const up = (e: KeyEventLike): void => {
    // 修饰键按住时松开方向键也要释放，否则会「卡键」。
    if (state.keyUp(e.code) && !isFormTarget(e.target)) e.preventDefault()
  }
  const blur = (): void => state.clear()
  target.addEventListener('keydown', down)
  target.addEventListener('keyup', up)
  target.addEventListener('blur', blur)
  return () => {
    target.removeEventListener('keydown', down)
    target.removeEventListener('keyup', up)
    target.removeEventListener('blur', blur)
  }
}
