import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { SUN_OFFSET } from './logic/doll-fit'
import { BACKGROUND } from './palette'

/**
 * 场景与灯光（render-design §2）：半球光 + 暖色平行光（棋盘中心 + SUN_OFFSET = (−3, 14, +7)，约 61° 仰角，
 * 影子主要落向后方、远离镜头，只略偏 +x——头的影子不再落到右边前方的墙顶上，ADR 0032）；
 * 静态正交阴影相机 ±14（design 写 ±12，按光向斜切后不够罩住整盘）；背景与雾 #DDF1F7（30–70）；PMREM RoomEnvironment 给金属件一点反光。
 */
export interface SceneRig {
  scene: Scene
  sun: DirectionalLight
  envMap: Texture
  dispose(): void
}

export function createSceneRig(renderer: WebGLRenderer, boardCenter: number): SceneRig {
  const scene = new Scene()
  scene.background = new Color(BACKGROUND)
  scene.fog = new Fog(BACKGROUND, 30, 70)

  const hemi = new HemisphereLight(0xfff4dd, 0xc9b48f, 1.05)
  scene.add(hemi)

  // 第 4 轮（ADR 0032）：太阳从 (−9, 12, +6)（约 45°）抬到 (−3, 14, +7)，往右走时影子不再「顶」到前方墙上。
  const sun = new DirectionalLight(0xfff0d4, 3.1)
  sun.position.set(boardCenter + SUN_OFFSET.x, SUN_OFFSET.y, boardCenter + SUN_OFFSET.z)
  sun.target.position.set(boardCenter, 0, boardCenter)
  sun.castShadow = true
  // 19 格棋盘 + 包边在光空间里最宽约 ±13.9（光越陡越窄），取 ±14 整盘都有影子。
  const sc = sun.shadow.camera
  sc.left = -14
  sc.right = 14
  sc.top = 14
  sc.bottom = -14
  sc.near = 1
  sc.far = 50
  sc.updateProjectionMatrix()
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  scene.add(sun)
  scene.add(sun.target)

  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envMap = pmrem.fromScene(room, 0.04).texture
  room.dispose()
  pmrem.dispose()
  scene.environment = envMap
  scene.environmentIntensity = 0.45

  return {
    scene,
    sun,
    envMap,
    dispose() {
      envMap.dispose()
    },
  }
}
