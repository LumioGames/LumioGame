interface PresentationShortcutActions {
  overview(): void
  mute(): void
  blocked(): boolean
}

/** Local display controls only; gameplay input remains with the production host. */
export function attachPresentationShortcuts(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  actions: PresentationShortcutActions,
): () => void {
  const keydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || actions.blocked()) return
    const source = event.target as Element | null
    if (source?.closest?.('button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]')) return
    const action = event.code === 'KeyV' ? actions.overview : event.code === 'KeyM' ? actions.mute : null
    if (!action) return
    event.preventDefault()
    action()
  }
  target.addEventListener('keydown', keydown)
  return () => target.removeEventListener('keydown', keydown)
}
