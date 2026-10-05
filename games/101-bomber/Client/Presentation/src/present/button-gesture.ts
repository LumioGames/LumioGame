/** DOM gesture edges only; duration and bomb mode belong to authoritative Gameplay. */
export function attachButtonGesture(button: HTMLButtonElement,
  changed: (pressed: boolean, cancelled?: boolean) => void, ready: () => boolean,
  target: Window = window): () => void {
  let pointer: number | undefined
  const removers: Array<() => void> = []
  const enabled = (): boolean => !button.disabled && !target.document.hidden && ready()
  const listen = (element: EventTarget, name: string, callback: (event: Event) => void): void => {
    element.addEventListener(name, callback)
    removers.push(() => element.removeEventListener(name, callback))
  }
  const release = (cancelled: boolean): void => {
    if (pointer === undefined) return
    pointer = undefined
    changed(false, cancelled || !enabled())
  }
  listen(button, 'pointerdown', event => {
    if (pointer !== undefined || !enabled()) return
    event.preventDefault()
    button.blur()
    pointer = (event as PointerEvent).pointerId
    button.setPointerCapture(pointer)
    changed(true)
  })
  listen(button, 'pointerup', event => { if (pointer === (event as PointerEvent).pointerId) release(false) })
  for (const name of ['pointercancel', 'lostpointercapture'])
    listen(button, name, event => { if (pointer === (event as PointerEvent).pointerId) release(true) })
  listen(button, 'click', event => {
    // Pointer clicks already supplied their edges; assistive activation has no pointer.
    if ((event as MouseEvent).detail !== 0 || pointer !== undefined || !enabled()) return
    button.blur()
    changed(true)
    changed(false)
  })
  listen(target, 'blur', () => release(true))
  listen(target.document, 'visibilitychange', () => { if (target.document.hidden) release(true) })
  return () => { release(true); for (const remove of removers) remove() }
}
