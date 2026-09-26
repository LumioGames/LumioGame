import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three'
import type { AnimalId } from '../contract'
import { createSharedMaterials } from './materials'
import { PODIUM_DOLL_SCALE } from './logic/doll-fit'
import { DollFactory } from './world/dolls'

/**
 * 原型扩展（NON-CONTRACT，ADR 0030）：选角界面的玩偶头像——离屏 three 渲染一次 → data URL。
 * 只在开局前跑一次（main.ts 放进 requestAnimationFrame，选角界面先出来）；渲染器用完即 dispose + forceContextLoss，
 * 不与主视图抢 WebGL 上下文。任何一步出错都返回已渲染好的部分（可能为空），调用方对缺的动物退回 CSS 色块。
 */

/** 渲染后端的最小接口（测试注入假的；默认是离屏 WebGLRenderer）。 */
export interface PortraitRenderer {
  render(scene: Scene, camera: Camera): void
  toDataURL(): string
  dispose(): void
}

export interface PortraitDeps {
  createRenderer(px: number): PortraitRenderer
}

/** 取景（表现取值）：领奖台尺寸 1.3 的玩偶挥手，兔耳朵也放得下。 */
const FRAME = { fov: 30, camY: 1.0, camZ: 3.9, lookY: 0.8, yaw: 0.35 } as const

function webglRenderer(px: number): PortraitRenderer {
  const canvas = document.createElement('canvas')
  const r = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  r.setPixelRatio(1)
  r.setSize(px, px, false)
  r.setClearColor(0x000000, 0)
  return {
    render: (scene, camera) => r.render(scene, camera),
    toDataURL: () => canvas.toDataURL('image/png'),
    dispose: () => {
      r.dispose()
      r.forceContextLoss()
    },
  }
}

const DEFAULT_DEPS: PortraitDeps = { createRenderer: webglRenderer }

export function renderDollPortraits(animals: readonly AnimalId[], px = 256, deps: PortraitDeps = DEFAULT_DEPS): Map<AnimalId, string> {
  const out = new Map<AnimalId, string>()
  let renderer: PortraitRenderer | null = null
  const mats = createSharedMaterials()
  try {
    renderer = deps.createRenderer(px)
    const scene = new Scene()
    // 与 scene.ts 同一套暖色：半球光 + 斜前方的太阳。
    scene.add(new HemisphereLight(0xfff4dd, 0xc9b48f, 1.05))
    const sun = new DirectionalLight(0xfff0d4, 2.6)
    sun.position.set(-2, 4, 5)
    scene.add(sun)
    const camera = new PerspectiveCamera(FRAME.fov, 1, 0.1, 20)
    camera.position.set(0, FRAME.camY, FRAME.camZ)
    camera.lookAt(0, FRAME.lookY, 0)
    const factory = new DollFactory(mats, PODIUM_DOLL_SCALE)
    let id = 1
    for (const animal of animals) {
      if (out.has(animal)) continue
      const doll = factory.create(id++, animal, 0)
      doll.addTo(scene)
      try {
        doll.pose(0, 0, 0, FRAME.yaw, 1000, 'wave', -1e9, 0)
        renderer.render(scene, camera)
        out.set(animal, renderer.toDataURL())
      } finally {
        doll.dispose()
      }
    }
  } catch {
    // 没有 WebGL / 上下文丢了：返回已有的部分，选角卡片用色块。
  } finally {
    try {
      renderer?.dispose()
    } catch {
      // 忽略：上下文可能已经没了。
    }
    for (const m of Object.values(mats)) m.dispose()
  }
  return out
}
