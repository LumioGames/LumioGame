/** 本机表现设置（design §9.6：震动 / 全屏效果可降到 0）。只存浏览器本地，不影响规则。 */
export interface PresentationSettings {
  /** 屏幕震动强度 0..1（默认 0.7）。 */
  shake: number
  /** 全屏效果（残血红晕等）强度 0..1。 */
  fullscreenFx: number
  muted: boolean
}

export const DEFAULT_SETTINGS: PresentationSettings = { shake: 0.7, fullscreenFx: 1, muted: false }

const KEY = 'lumio-101-bomber-settings'

export function loadSettings(): PresentationSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PresentationSettings>) }
  } catch {
    // 隐私模式或存储被禁用时退回默认值。
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: PresentationSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s))
  } catch {
    // 同上，存不了就算了。
  }
}
