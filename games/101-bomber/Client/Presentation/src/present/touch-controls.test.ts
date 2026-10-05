import { afterEach, describe, expect, it, vi } from 'vitest'
import { TouchControls, type TouchActions } from './touch-controls'

class ElementFixture extends EventTarget {
  className = ''
  innerHTML = ''
  type = ''
  disabled = false
  children: ElementFixture[] = []
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  captures: number[] = []
  classList = { add() {}, remove() {}, toggle() {} }
  appendChild(child: ElementFixture) { this.children.push(child) }
  append(...children: ElementFixture[]) { this.children.push(...children) }
  setAttribute() {}
  setPointerCapture(id: number) { this.captures.push(id) }
  remove() {}
}

function pointer(target: EventTarget, name: string, id = 4, fields = {}) {
  const event = new Event(name, { cancelable: true })
  Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: 30, clientY: 100, ...fields })
  target.dispatchEvent(event)
}

function setup() {
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => new ElementFixture() })
  vi.stubGlobal('document', document)
  const target = Object.assign(new EventTarget(), { document, innerWidth: 400 })
  const root = new ElementFixture()
  const edges: Array<[boolean, boolean]> = []
  const legacy = vi.fn()
  let ready = true
  const actions: TouchActions & { bombButton(pressed: boolean, cancelled?: boolean): void } = {
    move() {}, bomb: legacy, skill() {}, ready: () => ready,
    bombButton: (pressed, cancelled = false) => edges.push([pressed, cancelled]),
  }
  const controls = new TouchControls(root as unknown as HTMLElement, actions, target as unknown as Window)
  controls.show()
  controls.setEnabled(true)
  const bomb = root.children.find(child => child.className === 'tc-bomb')!
  return { controls, bomb, target, document, edges, legacy, setReady: (value: boolean) => { ready = value } }
}

afterEach(() => vi.unstubAllGlobals())

describe('touch bomb gesture forwarded to authoritative input', () => {
  it('captures one pointer and forwards down/up without locally placing a bomb', () => {
    const s = setup()
    pointer(s.bomb, 'pointerdown')
    pointer(s.bomb, 'pointerdown', 5)
    pointer(s.bomb, 'pointerleave')
    expect(s.edges).toEqual([[true, false]])
    expect(s.bomb.captures).toEqual([4])
    pointer(s.bomb, 'pointerup', 5)
    expect(s.edges).toHaveLength(1)
    pointer(s.bomb, 'pointerup')
    pointer(s.bomb, 'lostpointercapture')
    expect(s.edges).toEqual([[true, false], [false, false]])
    expect(s.legacy).not.toHaveBeenCalled()
    s.controls.dispose()
  })

  it.each(['pointercancel', 'lostpointercapture'])('%s cancels once without a release action', name => {
    const s = setup()
    pointer(s.bomb, 'pointerdown')
    pointer(s.bomb, name)
    pointer(s.bomb, 'pointerup')
    expect(s.edges).toEqual([[true, false], [false, true]])
    s.controls.dispose()
  })

  it.each(['blur', 'hidden', 'disabled', 'dispose'])('%s cancels a held button', reason => {
    const s = setup()
    pointer(s.bomb, 'pointerdown')
    if (reason === 'blur') s.target.dispatchEvent(new Event('blur'))
    if (reason === 'hidden') { s.document.hidden = true; s.document.dispatchEvent(new Event('visibilitychange')) }
    if (reason === 'disabled') s.controls.setEnabled(false)
    if (reason === 'dispose') s.controls.dispose()
    expect(s.edges).toEqual([[true, false], [false, true]])
    s.controls.dispose()
  })

  it('releasing a different joystick finger preserves the held bomb', () => {
    const s = setup()
    pointer(s.target, 'pointerdown', 1)
    pointer(s.bomb, 'pointerdown', 2)
    pointer(s.target, 'pointerup', 1)
    expect(s.edges).toEqual([[true, false]])
    pointer(s.bomb, 'pointerup', 2)
    expect(s.edges).toEqual([[true, false], [false, false]])
    s.controls.dispose()
  })

  it('ignores an unavailable press and cancels if readiness is lost before release', () => {
    const s = setup()
    s.setReady(false)
    pointer(s.bomb, 'pointerdown')
    expect(s.edges).toEqual([])
    s.setReady(true)
    pointer(s.bomb, 'pointerdown')
    s.setReady(false)
    pointer(s.bomb, 'pointerup')
    expect(s.edges).toEqual([[true, false], [false, true]])
    s.controls.dispose()
  })
})
