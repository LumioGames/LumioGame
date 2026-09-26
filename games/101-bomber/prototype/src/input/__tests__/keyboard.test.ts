import { describe, expect, it } from 'vitest'
import { 方向, type AbilityActivation, type 移动技能输入 } from '../../contract'
import { attachKeyboard, DirectionStack, InputState, type KeyEventLike, type ListenerTarget } from '../keyboard'
import { Joystick4 } from '../joystick'

/** 最小事件目标：记录监听器，测试里直接派发普通对象。 */
class FakeTarget implements ListenerTarget {
  readonly listeners = new Map<string, Set<(e: never) => void>>()
  addEventListener(type: string, fn: (e: never) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(fn)
  }
  removeEventListener(type: string, fn: (e: never) => void): void {
    this.listeners.get(type)?.delete(fn)
  }
  fire(type: string, e: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) (fn as (e: unknown) => void)(e)
  }
  count(): number {
    let n = 0
    for (const s of this.listeners.values()) n += s.size
    return n
  }
}

interface FakeKey extends KeyEventLike {
  prevented: boolean
}

function key(code: string, extra: Partial<KeyEventLike> = {}): FakeKey {
  const e: FakeKey = {
    code,
    repeat: false,
    prevented: false,
    preventDefault() {
      e.prevented = true
    },
    ...extra,
  }
  return e
}

const move = (acts: AbilityActivation[]): 移动技能输入 => {
  const m = acts.find((a) => a.ability === '移动')
  if (!m || m.ability !== '移动') throw new Error('no move')
  return m.输入
}
const bombs = (acts: AbilityActivation[]): number => acts.filter((a) => a.ability === '放弹').length
const skills = (acts: AbilityActivation[]): number => acts.filter((a) => a.ability === '技能').length

describe('DirectionStack', () => {
  it('last pressed held key wins; releasing it falls back to the previous one', () => {
    const s = new DirectionStack()
    s.press(方向.右)
    s.press(方向.上)
    expect(s.current()).toBe(方向.上)
    s.release(方向.上)
    expect(s.current()).toBe(方向.右)
    s.press(方向.右)
    s.release(方向.右)
    expect(s.current()).toBe(方向.停)
  })

  it('secondary (ADR 0032): the most recent held key perpendicular to the top; opposite keys never count', () => {
    const s = new DirectionStack()
    s.press(方向.右)
    s.press(方向.上)
    expect(s.secondary()).toBe(方向.右)
    s.press(方向.左)
    expect(s.current()).toBe(方向.左)
    expect(s.secondary()).toBe(方向.上)
    s.release(方向.上)
    // [右, 左]：只剩反向键 → 没有副方向。
    expect(s.secondary()).toBe(方向.停)
    s.clear()
    expect(s.secondary()).toBe(方向.停)
  })

  it('tracks keys, not directions (H6): D + → held, releasing D keeps 右', () => {
    const s = new DirectionStack()
    s.press(方向.右, 'KeyD')
    s.press(方向.右, 'ArrowRight')
    s.release(方向.右, 'KeyD')
    expect(s.current()).toBe(方向.右)
    s.release(方向.右, 'ArrowRight')
    expect(s.current()).toBe(方向.停)
  })
})

describe('InputState poll', () => {
  it('always returns one 移动 with 按了转弯 only when the direction changed since the last poll', () => {
    const s = new InputState()
    expect(move(s.poll())).toEqual({ 方向: 方向.停, 按了转弯: false })
    s.keyDown('KeyD', false)
    expect(move(s.poll())).toEqual({ 方向: 方向.右, 按了转弯: true })
    expect(move(s.poll())).toEqual({ 方向: 方向.右, 按了转弯: false })
    s.keyDown('ArrowUp', false)
    expect(move(s.poll())).toEqual({ 方向: 方向.上, 按了转弯: true, 副方向: 方向.右 })
    s.keyUp('ArrowUp')
    expect(move(s.poll())).toEqual({ 方向: 方向.右, 按了转弯: true })
    s.keyUp('KeyD')
    expect(move(s.poll())).toEqual({ 方向: 方向.停, 按了转弯: false })
  })

  it('keeps a tap that was pressed and released between two polls for exactly one poll', () => {
    const s = new InputState()
    s.keyDown('KeyW', false)
    s.keyUp('KeyW')
    expect(move(s.poll())).toEqual({ 方向: 方向.上, 按了转弯: true })
    expect(move(s.poll())).toEqual({ 方向: 方向.停, 按了转弯: false })
  })

  it('bomb is edge-triggered: one 放弹 per press, auto-repeat ignored, consumed by poll', () => {
    const s = new InputState()
    s.keyDown('Space', false)
    s.keyDown('Space', true)
    s.keyDown('Space', true)
    expect(bombs(s.poll())).toBe(1)
    expect(bombs(s.poll())).toBe(0)
    s.keyUp('Space')
    s.keyDown('Space', false)
    s.keyUp('Space')
    s.keyDown('Space', false)
    expect(bombs(s.poll())).toBe(1)
  })

  it('touch direction overrides the keyboard while active', () => {
    const s = new InputState()
    s.keyDown('KeyA', false)
    expect(move(s.poll(方向.下))).toEqual({ 方向: 方向.下, 按了转弯: true })
    expect(move(s.poll())).toEqual({ 方向: 方向.左, 按了转弯: true })
  })

  it('poll emits 副方向 only for a perpendicular held key; a 副方向 change is not a turn (ADR 0032)', () => {
    const s = new InputState()
    s.keyDown('KeyD', false)
    s.poll()
    s.keyDown('KeyA', false)
    // 反向键：只换方向，不带副方向。
    expect(move(s.poll())).toEqual({ 方向: 方向.左, 按了转弯: true })
    s.keyDown('KeyW', false)
    expect(move(s.poll())).toEqual({ 方向: 方向.上, 按了转弯: true, 副方向: 方向.左 })
    s.keyUp('KeyA')
    // 副方向从左变成右（D 还按着），主方向没变：不算转弯。
    expect(move(s.poll())).toEqual({ 方向: 方向.上, 按了转弯: false, 副方向: 方向.右 })
  })

  it('per-key release (H6): holding D and →, releasing D keeps walking right', () => {
    const s = new InputState()
    s.keyDown('KeyD', false)
    s.keyDown('ArrowRight', false)
    s.poll()
    s.keyUp('KeyD')
    expect(move(s.poll())).toEqual({ 方向: 方向.右, 按了转弯: false })
    s.keyUp('ArrowRight')
    expect(move(s.poll()).方向).toBe(方向.停)
  })

  it('poll(external, externalSide) passes the touch 副方向 through, only while the stick is active', () => {
    const s = new InputState()
    expect(move(s.poll(方向.右, 方向.下))).toEqual({ 方向: 方向.右, 按了转弯: true, 副方向: 方向.下 })
    // 非垂直的外部副方向不送。
    expect(move(s.poll(方向.右, 方向.左))).toEqual({ 方向: 方向.右, 按了转弯: false })
    s.keyDown('KeyW', false)
    // 摇杆松开：回到键盘，键盘没有第二个键 → 不带副方向。
    expect(move(s.poll(方向.停, 方向.下))).toEqual({ 方向: 方向.上, 按了转弯: true })
  })

  it('Shift is edge-triggered: one 技能 per press, auto-repeat ignored, consumed by poll; never a 放弹', () => {
    const s = new InputState()
    expect(s.keyDown('ShiftLeft', false)).toEqual({ handled: true, command: null })
    expect(s.keyDown('ShiftLeft', true)).toEqual({ handled: true, command: null })
    const acts = s.poll()
    expect(skills(acts)).toBe(1)
    expect(bombs(acts)).toBe(0)
    expect(skills(s.poll())).toBe(0)
    s.keyUp('ShiftLeft')
    s.keyDown('ShiftRight', false)
    expect(skills(s.poll())).toBe(1)
    s.pressSkill()
    expect(skills(s.poll())).toBe(1)
    s.keyDown('ShiftLeft', false)
    s.clear()
    expect(skills(s.poll())).toBe(0)
  })

  it('clear() releases every key and drops an unconsumed bomb press', () => {
    const s = new InputState()
    s.keyDown('KeyD', false)
    s.keyDown('Space', false)
    s.clear()
    const acts = s.poll()
    expect(move(acts).方向).toBe(方向.停)
    expect(bombs(acts)).toBe(0)
  })
})

describe('attachKeyboard', () => {
  it('prevents default for game keys, dispatches commands once, and ignores modifier chords', () => {
    const t = new FakeTarget()
    const s = new InputState()
    const cmds: string[] = []
    const detach = attachKeyboard(t, s, (c) => cmds.push(c))
    const space = key('Space')
    t.fire('keydown', space)
    expect(space.prevented).toBe(true)
    t.fire('keydown', key('KeyV'))
    t.fire('keydown', key('KeyV', { repeat: true }))
    t.fire('keydown', key('Escape'))
    t.fire('keydown', key('KeyM'))
    expect(cmds).toEqual(['overview', 'pause', 'mute'])
    const copy = key('KeyD', { metaKey: true })
    t.fire('keydown', copy)
    expect(copy.prevented).toBe(false)
    const other = key('KeyQ')
    t.fire('keydown', other)
    expect(other.prevented).toBe(false)
    const acts = s.poll()
    expect(bombs(acts)).toBe(1)
    expect(move(acts).方向).toBe(方向.停)
    detach()
    expect(t.count()).toBe(0)
  })

  it('leaves arrows and space to a focused form control (settings slider), but Esc still pauses', () => {
    const t = new FakeTarget()
    const s = new InputState()
    const cmds: string[] = []
    attachKeyboard(t, s, (c) => cmds.push(c))
    const slider = { tagName: 'INPUT' }
    const arrow = key('ArrowLeft', { target: slider })
    t.fire('keydown', arrow)
    expect(arrow.prevented).toBe(false)
    t.fire('keydown', key('Escape', { target: slider }))
    expect(cmds).toEqual(['pause'])
    expect(move(s.poll()).方向).toBe(方向.停)
  })

  it('Shift is prevented but is not a command', () => {
    const t = new FakeTarget()
    const s = new InputState()
    const cmds: string[] = []
    attachKeyboard(t, s, (c) => cmds.push(c))
    const shift = key('ShiftRight')
    t.fire('keydown', shift)
    expect(shift.prevented).toBe(true)
    expect(cmds).toEqual([])
    expect(skills(s.poll())).toBe(1)
  })

  it('⌘ keyup releases held directions (macOS swallows their keyups while ⌘ is down)', () => {
    const t = new FakeTarget()
    const s = new InputState()
    attachKeyboard(t, s, () => undefined)
    t.fire('keydown', key('KeyD'))
    expect(move(s.poll()).方向).toBe(方向.右)
    // ⌘ 按下期间 KeyD 的 keyup 被系统吞掉，只收到 MetaLeft 的 keyup。
    t.fire('keyup', key('MetaLeft'))
    expect(move(s.poll()).方向).toBe(方向.停)
  })

  it('window blur clears held keys so the doll does not keep walking', () => {
    const t = new FakeTarget()
    const s = new InputState()
    attachKeyboard(t, s, () => undefined)
    t.fire('keydown', key('ArrowRight'))
    expect(move(s.poll()).方向).toBe(方向.右)
    t.fire('blur')
    expect(move(s.poll()).方向).toBe(方向.停)
  })
})

describe('Joystick4', () => {
  it('outputs 停 inside the 18% dead zone and clamps the knob to the base radius', () => {
    const j = new Joystick4(60, 0.18, 0.15)
    j.start(100, 100)
    expect(j.move(105, 104)).toBe(方向.停)
    expect(j.move(300, 100)).toBe(方向.右)
    expect(Math.hypot(j.knobX, j.knobY)).toBeCloseTo(60)
  })

  it('maps screen up to 上 (away from camera) and uses 15% hysteresis before switching axis', () => {
    const j = new Joystick4(60, 0.18, 0.15)
    j.start(0, 0)
    expect(j.move(0, -40)).toBe(方向.上)
    // 水平分量略大于竖直，但没超出 15% 滞回：保持「上」。
    expect(j.move(32, -30)).toBe(方向.上)
    expect(j.move(40, -30)).toBe(方向.右)
    expect(j.move(-40, 10)).toBe(方向.左)
    j.end()
    expect(j.direction()).toBe(方向.停)
    expect(j.move(50, 0)).toBe(方向.停)
  })

  it('secondary (ADR 0032): the minor axis counts once it reaches half the major axis', () => {
    const j = new Joystick4(60, 0.18, 0.15, 0.5)
    j.start(0, 0)
    expect(j.move(60, 30)).toBe(方向.右)
    expect(j.secondary()).toBe(方向.下)
    j.move(60, 10)
    expect(j.secondary()).toBe(方向.停)
    j.move(-40, -60)
    expect(j.direction()).toBe(方向.上)
    expect(j.secondary()).toBe(方向.左)
    j.move(3, 3)
    expect(j.secondary()).toBe(方向.停)
    j.move(60, -40)
    j.end()
    expect(j.secondary()).toBe(方向.停)
  })
})
