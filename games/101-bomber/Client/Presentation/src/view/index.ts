import type { BomberConfig, ProtoRules, U64 } from '../contract'
import type { FeedSample } from '../present/feed'
import type { PresentationSettings } from '../present/settings'
import { ViewRuntime } from './runtime'
export { renderDollPortraits } from './portrait'
import './view.css'

export interface ViewOptions {
  /** Three.js 画布的容器（全屏）。 */
  container: HTMLElement
  /** 世界锚定的 DOM 标签层（名牌、「你」、帽数牌、吃强化的「+1」飘字），由 view 负责定位。 */
  labelRoot: HTMLElement
  config: BomberConfig
  rules: ProtoRules
  localPlayerId: U64
  /** 同一个对象会被 HUD 设置面板原地修改，view 每帧读取。 */
  settings: PresentationSettings
  /** 请求本机定帧（连锁 ≥3 且本人参与时，50–80 ms）。 */
  requestHitstop(ms: number): void
}

export interface ScreenPoint {
  /** 相对 container 左上角的 CSS 像素。 */
  x: number
  y: number
  /** 是否在视口内（含边距判定由调用方自己做）。 */
  onScreen: boolean
  /** 点在相机背后（此时 x/y 已翻转到可用于边缘箭头的方向）。 */
  behind: boolean
}

/** 领奖台前三名的名次牌锚点（世界坐标，帽塔顶之上）；HUD 用 project() 投到屏幕上放「第 N 名」牌。 */
export interface PodiumAnchor {
  /** 1 / 2 / 3。 */
  place: number
  id: U64
  x: number
  y: number
  z: number
  /** 玩偶已经落到台上（落位前不显示名次牌）。 */
  shown: boolean
}

export interface GameView {
  update(sample: FeedSample, dtMs: number): void
  /** V 键：跟随 ↔ 全局俯瞰。 */
  toggleOverview(): void
  /** 世界坐标（米，引擎轴：x = 游戏 X，z = 游戏 Y，y 向上）→ 屏幕坐标。 */
  project(x: number, y: number, z: number): ScreenPoint
  /** 领奖台仪式中前三名的锚点；不在仪式中为空数组。 */
  podiumAnchors(): PodiumAnchor[]
  resize(): void
  dispose(): void
}

export function createView(opts: ViewOptions): GameView {
  const rt = new ViewRuntime(opts)
  return {
    update: (sample, dtMs) => rt.update(sample, dtMs),
    toggleOverview: () => rt.toggleOverview(),
    project: (x, y, z) => rt.project(x, y, z),
    podiumAnchors: () => rt.podiumAnchors(),
    resize: () => rt.resize(),
    dispose: () => rt.dispose(),
  }
}
