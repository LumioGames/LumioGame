import { 方向 } from '../contract'

/**
 * 浮动虚拟摇杆的纯逻辑：四向输出（契约 `方向` 只有四向 + 停），18% 死区，
 * 换轴要多出 15% 的滞回，避免在 45° 附近来回抖动。屏幕向上 = 游戏「上」（远离镜头）。
 */
export class Joystick4 {
  private ox = 0
  private oy = 0
  private active = false
  private dir: 方向 = 方向.停
  /** 摇杆头相对底座中心的位移（已夹到半径内），CSS 像素。 */
  knobX = 0
  knobY = 0

  constructor(
    readonly radius = 60,
    readonly deadZone = 0.18,
    readonly hysteresis = 0.15,
  ) {}

  start(x: number, y: number): void {
    this.ox = x
    this.oy = y
    this.active = true
    this.dir = 方向.停
    this.knobX = this.knobY = 0
  }

  move(x: number, y: number): 方向 {
    if (!this.active) return 方向.停
    const dx = x - this.ox
    const dy = y - this.oy
    const len = Math.hypot(dx, dy)
    const k = len > this.radius ? this.radius / len : 1
    this.knobX = dx * k
    this.knobY = dy * k
    if (len < this.deadZone * this.radius) {
      this.dir = 方向.停
      return this.dir
    }
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const h = 1 + this.hysteresis
    const wasHorizontal = this.dir === 方向.左 || this.dir === 方向.右
    const wasVertical = this.dir === 方向.上 || this.dir === 方向.下
    let horizontal: boolean
    if (wasHorizontal) horizontal = !(ay > ax * h)
    else if (wasVertical) horizontal = ax > ay * h
    else horizontal = ax >= ay
    this.dir = horizontal ? (dx < 0 ? 方向.左 : 方向.右) : dy < 0 ? 方向.上 : 方向.下
    return this.dir
  }

  end(): void {
    this.active = false
    this.dir = 方向.停
    this.knobX = this.knobY = 0
  }

  isActive(): boolean {
    return this.active
  }

  direction(): 方向 {
    return this.dir
  }

  origin(): { x: number; y: number } {
    return { x: this.ox, y: this.oy }
  }
}
