import { describe, expect, it } from 'vitest'
import { 方向 } from '../contract'
import { Joystick4 } from './joystick'

describe('approved prototype joystick intent', () => {
  it('has an 18% dead zone and clamps the 52px knob to the 60px radius', () => {
    const stick = new Joystick4()
    expect(stick.move(100, 100)).toBe(方向.停)
    stick.start(100, 100)
    expect(stick.move(110, 100)).toBe(方向.停)
    expect(stick.move(300, 100)).toBe(方向.右)
    expect(stick.knobX).toBe(60)
    expect(stick.knobY).toBe(0)
    expect(stick.secondary()).toBe(方向.停)
  })
  it('keeps the current axis within 15% hysteresis and includes a substantial secondary axis', () => {
    const stick = new Joystick4()
    stick.start(0, 0)
    expect(stick.move(30, 0)).toBe(方向.右)
    expect(stick.move(30, -32)).toBe(方向.右)
    expect(stick.secondary()).toBe(方向.上)
    expect(stick.move(30, -36)).toBe(方向.上)
    expect(stick.secondary()).toBe(方向.右)
    expect(stick.move(0, -36)).toBe(方向.上)
    expect(stick.secondary()).toBe(方向.停)
  })
  it('clears both axes on return to center, pointer release and a new gesture', () => {
    const stick = new Joystick4()
    stick.start(100, 100)
    stick.move(60, 70)
    expect(stick.secondary()).toBe(方向.上)
    expect(stick.move(102, 103)).toBe(方向.停)
    expect(stick.secondary()).toBe(方向.停)
    stick.move(60, 130)
    stick.end()
    expect([stick.direction(), stick.secondary(), stick.knobX, stick.knobY]).toEqual([0, 0, 0, 0])
    expect(stick.isActive()).toBe(false)
    stick.start(50, 50)
    expect(stick.origin()).toEqual({ x: 50, y: 50 })
    expect(stick.direction()).toBe(方向.停)
  })
})
