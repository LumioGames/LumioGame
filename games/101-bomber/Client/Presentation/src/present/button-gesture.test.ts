import { describe, expect, it } from 'vitest'
import { attachButtonGesture } from './button-gesture'

function setup() {
  const button = Object.assign(new EventTarget(), { disabled: false, setPointerCapture() {}, blur() {} })
  const document = Object.assign(new EventTarget(), { hidden: false })
  const target = Object.assign(new EventTarget(), { document })
  const edges: Array<[boolean, boolean]> = []
  let ready = true
  const detach = attachButtonGesture(button as unknown as HTMLButtonElement,
    (pressed, cancelled = false) => edges.push([pressed, cancelled]), () => ready, target as unknown as Window)
  const event = (name: string, fields = {}) => {
    const e = new Event(name, { cancelable: true }); Object.assign(e, { pointerId: 1, detail: 1, ...fields }); button.dispatchEvent(e)
  }
  return { button, target, document, edges, detach, event, setReady: (value: boolean) => { ready = value } }
}

describe('HUD bomb input gesture', () => {
  it('keeps a captured pointer gesture and suppresses the following pointer click', () => {
    const s = setup()
    s.event('pointerdown'); s.event('pointerdown', { pointerId: 2 }); s.event('pointerleave')
    s.event('pointerup', { pointerId: 2 }); expect(s.edges).toEqual([[true, false]])
    s.event('pointerup'); s.event('lostpointercapture'); s.event('click')
    expect(s.edges).toEqual([[true, false], [false, false]])
    s.detach()
  })
  it('preserves both edges of an accessible click without a pointer gesture', () => {
    const s = setup(); s.event('click', { detail: 0 })
    expect(s.edges).toEqual([[true, false], [false, false]]); s.detach()
  })
  it.each(['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'detach'])('%s cancels without turning into a short release', reason => {
    const s = setup(); s.event('pointerdown')
    if (reason === 'blur') s.target.dispatchEvent(new Event('blur'))
    else if (reason === 'hidden') { s.document.hidden = true; s.document.dispatchEvent(new Event('visibilitychange')) }
    else if (reason === 'detach') s.detach()
    else s.event(reason)
    s.event('pointerup'); expect(s.edges).toEqual([[true, false], [false, true]])
    s.detach()
  })
  it('rejects unavailable input and cancels a gesture whose readiness was lost', () => {
    const s = setup(); s.setReady(false); s.event('pointerdown'); s.event('click', { detail: 0 })
    expect(s.edges).toEqual([])
    s.setReady(true); s.event('pointerdown'); s.setReady(false); s.event('pointerup')
    expect(s.edges).toEqual([[true, false], [false, true]]); s.detach()
  })
})
