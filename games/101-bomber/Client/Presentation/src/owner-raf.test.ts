import { afterEach, expect, it, vi } from 'vitest'
import { snap } from './hud/__tests__/fixtures'
const observed = vi.hoisted(() => ({ samples: [] as unknown[], order: [] as string[] }))
vi.mock('./view', () => ({ createView: () => ({ update: (s: unknown) => { observed.samples.push(s); observed.order.push('view') },
  project() {}, resize() {}, toggleOverview() {}, dispose() {} }), renderDollPortraits() {} }))
vi.mock('./hud', () => ({ createHud: () => ({ inputBlocked: () => false, update() {}, setMuted() {}, dispose() {} }) }))
vi.mock('./audio', () => ({ createAudio: () => ({ update() {}, setMuted() {}, unlock() {}, dispose() {} }) }))
vi.mock('./present/settings', () => ({ loadSettings: () => ({ muted: true }), saveSettings() {} }))
vi.mock('./present/shortcuts', () => ({ attachPresentationShortcuts: () => () => {} }))
import { createPresentation } from './index'
afterEach(() => vi.unstubAllGlobals())

it('actual RAF reads one owner pose before updating the view and stops after disposal', () => {
  let frame!: (now: number) => void
  const schedule = vi.fn((callback: (now: number) => void) => { frame = callback; return 1 })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false })
  const node = { classList: { add() {}, remove() {} } } as unknown as HTMLElement
  const pose = { playerId: 1, entity: 'self', connectionGeneration: '9', publicationSequence: '1',
    model: { position: { x: 12, y: 0, z: 13 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }
  const read = vi.fn(() => { observed.order.push('read'); return pose })
  const presentation = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1, readLocalPose: read })
  presentation.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
  frame(10)
  expect(read).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith()
  expect(observed.order).toEqual(['read', 'view'])
  expect(observed.samples[0]).toMatchObject({ localPose: pose })
  presentation.dispose()
  frame(20)
  expect(read).toHaveBeenCalledTimes(1)
})
