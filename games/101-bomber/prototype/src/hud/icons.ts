/**
 * HUD 内联 SVG 图标（无外部资源、无 emoji）。全部用 currentColor，颜色由 CSS 决定。
 * 这些是静态可信字符串，可以放进 innerHTML；玩家名等动态文本一律走 textContent。
 */
const svg = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`

export const ICON = {
  hat: svg(
    '<path fill="currentColor" d="M7.5 4.5c0-.8.7-1.5 1.5-1.5h6c.8 0 1.5.7 1.5 1.5V15h-9z"/>' +
      '<rect x="7.5" y="11.2" width="9" height="2.3" fill="#FFC93C"/>' +
      '<rect x="2.5" y="15" width="19" height="3.2" rx="1.6" fill="currentColor"/>',
  ),
  crown: svg('<path fill="currentColor" d="M3 18.5 4.6 7.2l4.6 4.6L12 4.5l2.8 7.3 4.6-4.6L21 18.5z"/><rect x="3" y="19.3" width="18" height="2.2" rx="1" fill="currentColor"/>'),
  heart: svg(
    '<path fill="currentColor" d="M12 21.2s-7.6-4.6-9.7-9.4C.8 8.3 3 4.4 6.7 4.4c2.1 0 3.8 1.2 5.3 3.1 1.5-1.9 3.2-3.1 5.3-3.1 3.7 0 5.9 3.9 4.4 7.4-2.1 4.8-9.7 9.4-9.7 9.4z"/>',
  ),
  flame: svg('<path fill="currentColor" d="M12.4 2.2c.6 3.3 4.8 5.6 4.8 10.9a5.2 5.2 0 0 1-10.4 0c0-2.7 1.3-4.2 2.7-5.8.3 1.8 1 2.8 2.2 3.3-.6-3.2.3-5.6.7-8.4z"/>'),
  bomb: svg(
    '<circle cx="10.5" cy="14" r="7" fill="currentColor"/><rect x="8.7" y="5.4" width="3.6" height="2.6" rx=".6" fill="currentColor"/>' +
      '<path d="M12 6c1-2.2 3.2-3 5-2.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="18.6" cy="3.6" r="1.8" fill="#FFC93C"/><circle cx="8" cy="11.5" r="1.5" fill="#fff" opacity=".45"/>',
  ),
  speed: svg('<path fill="currentColor" d="M13.6 2 4.5 13.6h6.2L9.6 22l9.3-12.1h-6.3z"/>'),
  soundOn: svg(
    '<path fill="currentColor" d="M3.5 9h3.8L12 5v14l-4.7-4H3.5z"/>' +
      '<path d="M15.2 8.8a4.5 4.5 0 0 1 0 6.4M17.8 6.2a8.2 8.2 0 0 1 0 11.6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
  ),
  soundOff: svg(
    '<path fill="currentColor" d="M3.5 9h3.8L12 5v14l-4.7-4H3.5z"/>' +
      '<path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  ),
  view: svg(
    '<path d="M12 3.2 20.2 7.4v9.2L12 20.8l-8.2-4.2V7.4z M3.8 7.4 12 11.6l8.2-4.2M12 11.6v9.2" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linejoin="round"/>',
  ),
  pause: svg('<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"/>'),
  play: svg('<path fill="currentColor" d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z"/>'),
  help: svg(
    '<path d="M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1-1.3 1.9v.8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="12" cy="18" r="1.4" fill="currentColor"/>',
  ),
  gear: svg(
    '<path fill="currentColor" d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>',
  ),
  close: svg('<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>'),
  arrow: svg('<path fill="currentColor" d="M21 12 5 3.5l3.2 8.5L5 20.5z"/>'),
  cotton: svg(
    '<path fill="currentColor" d="M7.5 18.5a4 4 0 0 1-.6-7.9 5.2 5.2 0 0 1 10-1.4 4.6 4.6 0 0 1 .6 9.3z"/>',
  ),
  musicOn: svg(
    '<path fill="currentColor" d="M9 5.2 19.5 3v11.6a2.9 2.9 0 1 1-1.8-2.7V7.1L10.8 8.6v8a2.9 2.9 0 1 1-1.8-2.7z"/>',
  ),
  musicOff: svg(
    '<path fill="currentColor" opacity=".55" d="M9 5.2 19.5 3v11.6a2.9 2.9 0 1 1-1.8-2.7V7.1L10.8 8.6v8a2.9 2.9 0 1 1-1.8-2.7z"/>' +
      '<path d="M3.5 3.5 20.5 20.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  ),
  star: svg('<path fill="currentColor" d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>'),
  ring: svg(
    '<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.2 2.2" fill="none"/>' +
      '<rect x="8" y="8" width="8" height="8" rx="1.6" fill="currentColor"/>',
  ),
  water: svg('<path fill="currentColor" d="M12 2.8s6.3 6.9 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 9.7 12 2.8 12 2.8z"/>'),
} as const

/** 动物主色（与 view 的玩偶配色一致，Top-10 / 回顾卡的头像色点用）。 */
export const ANIMAL_COLOR: Readonly<Record<string, string>> = {
  duck: '#FFD34D',
  rabbit: '#F5EEE6',
  bear: '#B9804F',
  cat: '#9AA3B5',
  frog: '#6CC551',
  penguin: '#2F4A6B',
  pig: '#FFA6B8',
  dog: '#E3B77E',
}

export const ANIMAL_NAME: Readonly<Record<string, string>> = {
  duck: '鸭',
  rabbit: '兔',
  bear: '熊',
  cat: '猫',
  frog: '蛙',
  penguin: '企鹅',
  pig: '猪',
  dog: '狗',
}

/** 脚圈 / 炸弹色带颜色，按 slot（与 view 一致）。 */
export const SLOT_COLOR: readonly string[] = ['#3DB8DA', '#FF7A3D', '#FFC93C', '#6CC551', '#B57BFF', '#FF6FA8', '#FFFFFF', '#2B2320']
