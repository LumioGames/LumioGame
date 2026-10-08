import { describe, expect, it } from 'vitest'
import { attachPresentationShortcuts } from './shortcuts'

function key(code: string, fields: Record<string, unknown> = {}): KeyboardEvent {
  const event = new Event('keydown', { cancelable: true })
  for (const [name, value] of Object.entries({ code, repeat: false, ...fields }))
    Object.defineProperty(event, name, { value })
  return event as KeyboardEvent
}

function setup(target = new EventTarget()) {
  const calls = { overview: 0, mute: 0 }
  let blocked = false
  const detach = attachPresentationShortcuts(target as Window, {
    overview: () => calls.overview++, mute: () => calls.mute++, blocked: () => blocked,
  })
  return { target, calls, detach, block: (value: boolean) => { blocked = value } }
}

describe('production presentation keyboard shortcuts', () => {
  it('V changes the camera and M changes mute exactly once per physical key press', () => {
    const session = setup()
    for (const code of ['KeyV', 'KeyM']) {
      const press = key(code)
      session.target.dispatchEvent(press)
      expect(press.defaultPrevented).toBe(true)
      session.target.dispatchEvent(key(code, { repeat: true }))
    }
    expect(session.calls).toEqual({ overview: 1, mute: 1 })
    session.target.dispatchEvent(key('KeyM'))
    expect(session.calls.mute).toBe(2)
    session.detach()
  })

  it.each(['ctrlKey', 'altKey', 'metaKey', 'isComposing'])('leaves %s keyboard actions to the browser', field => {
    const session = setup()
    for (const code of ['KeyV', 'KeyM']) {
      const event = key(code, { [field]: true })
      session.target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(session.calls).toEqual({ overview: 0, mute: 0 })
    session.detach()
  })

  it('does not consume gameplay keys or events already consumed by a dialog', () => {
    const session = setup()
    const consumed = key('KeyV')
    consumed.preventDefault()
    session.target.dispatchEvent(consumed)
    for (const code of ['Space', 'ShiftLeft', 'KeyW', 'Escape']) {
      const event = key(code)
      session.target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(session.calls).toEqual({ overview: 0, mute: 0 })
    session.detach()
  })

  it('leaves shortcuts inactive while a modal or hidden page blocks local input', () => {
    const session = setup()
    session.block(true)
    const event = key('KeyM')
    session.target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(session.calls.mute).toBe(0)
    session.block(false)
    session.target.dispatchEvent(key('KeyM'))
    expect(session.calls.mute).toBe(1)
    session.detach()
  })

  it('leaves keys inside interactive and editable elements untouched', () => {
    class InteractiveTarget extends EventTarget {
      closest(selector: string): this | null {
        expect(selector).toContain('[contenteditable]')
        expect(selector).toContain('button')
        return this
      }
    }
    const session = setup(new InteractiveTarget())
    const event = key('KeyM')
    session.target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(session.calls.mute).toBe(0)
    session.detach()
  })

  it('removes disposed-session listeners before a new match binds its presentation', () => {
    const first = setup()
    first.detach()
    first.detach()
    const next = setup(first.target)
    next.target.dispatchEvent(key('KeyV'))
    expect(first.calls).toEqual({ overview: 0, mute: 0 })
    expect(next.calls).toEqual({ overview: 1, mute: 0 })
    next.detach()
  })
})
