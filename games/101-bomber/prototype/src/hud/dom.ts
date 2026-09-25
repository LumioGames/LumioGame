import { ICON } from './icons'

/** 极简 DOM 工具：HUD 每帧都在跑，写之前先比较，避免无谓的样式失效。 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (parent) parent.appendChild(e)
  return e
}

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text
}

export function iconEl(name: keyof typeof ICON, className = '', parent?: Element): HTMLSpanElement {
  const s = el('span', `ico ${className}`.trim(), parent)
  s.innerHTML = ICON[name]
  return s
}

export function setIcon(node: HTMLElement, name: keyof typeof ICON): void {
  if (node.dataset.icon === name) return
  node.dataset.icon = name
  node.innerHTML = ICON[name]
}

export function setStyle(node: HTMLElement, prop: string, value: string): void {
  if (node.style.getPropertyValue(prop) !== value) node.style.setProperty(prop, value)
}

/** 重新触发一次 CSS 动画（先摘 class、强制回流、再挂回）。只在事件触发时调用，不在每帧调用。 */
export function restartAnimation(node: HTMLElement, cls: string): void {
  node.classList.remove(cls)
  void node.offsetWidth
  node.classList.add(cls)
}

/** 圆形按钮：点完立刻失焦，避免空格键（放弹）再次激活按钮。 */
export function roundButton(icon: keyof typeof ICON, label: string, parent: Element, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'hud-round', parent)
  b.type = 'button'
  b.title = label
  b.setAttribute('aria-label', label)
  const i = el('span', 'ico', b)
  setIcon(i, icon)
  b.addEventListener('click', () => {
    b.blur()
    onClick()
  })
  return b
}
