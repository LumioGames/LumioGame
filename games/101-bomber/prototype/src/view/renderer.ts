import { NeutralToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three'

/**
 * WebGL 渲染器 + 自适应像素比：min(dpr, 2)，触屏 1.5；平均帧时 > 18 ms 持续 2 s 就降 0.25（最低 1，dpr 本身低于 1 时取 dpr）。
 * 注：three r186 已移除 PCFSoftShadowMap（会告警并回落到 PCFShadowMap），这里直接用 PCFShadowMap + shadow.radius 做软化。
 */
export class RendererHost {
  readonly renderer: WebGLRenderer
  private maxRatio: number
  private ratio: number
  private slowMs = 0
  private avgFrame = 16.7
  width = 1
  height = 1

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    const r = this.renderer
    r.outputColorSpace = SRGBColorSpace
    r.toneMapping = NeutralToneMapping
    r.toneMappingExposure = 1.0
    r.shadowMap.enabled = true
    r.shadowMap.type = PCFShadowMap
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    const dpr = globalThis.devicePixelRatio || 1
    this.maxRatio = Math.min(dpr, touch ? 1.5 : 2)
    this.ratio = this.maxRatio
    r.setPixelRatio(this.ratio)
    container.appendChild(r.domElement)
    this.resize()
  }

  resize(): void {
    this.width = Math.max(1, this.container.clientWidth)
    this.height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(this.width, this.height, true)
  }

  /** 每帧喂真实帧时（毫秒），必要时降像素比。 */
  monitor(frameMs: number): void {
    if (frameMs <= 0 || frameMs > 250) return
    this.avgFrame += (frameMs - this.avgFrame) * 0.05
    if (this.avgFrame > 18) this.slowMs += frameMs
    else this.slowMs = Math.max(0, this.slowMs - frameMs * 0.5)
    const floor = Math.min(1, this.maxRatio)
    if (this.slowMs > 2000 && this.ratio > floor) {
      this.ratio = Math.max(floor, this.ratio - 0.25)
      this.renderer.setPixelRatio(this.ratio)
      this.renderer.setSize(this.width, this.height, true)
      this.slowMs = 0
    }
  }

  dispose(): void {
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
