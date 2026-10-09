import { afterEach, expect, it, vi } from 'vitest'
import { snap } from './hud/__tests__/fixtures'
const observed = vi.hoisted(() => ({ samples: [] as unknown[], order: [] as string[], viewWork: () => {} }))
vi.mock('./view', () => ({ createView: () => ({ update: (s: unknown) => { observed.samples.push(s); observed.order.push('view'); observed.viewWork() },
  debugLocal: () => null, project() {}, resize() {}, toggleOverview() {}, dispose() {} }), renderDollPortraits() {} }))
vi.mock('./hud', () => ({ createHud: () => ({ inputBlocked: () => false, update() {}, setMuted() {}, dispose() {} }) }))
vi.mock('./audio', () => ({ createAudio: () => ({ update() {}, setMuted() {}, unlock() {}, dispose() {} }) }))
vi.mock('./present/settings', () => ({ loadSettings: () => ({ muted: true }), saveSettings() {} }))
vi.mock('./present/shortcuts', () => ({ attachPresentationShortcuts: () => () => {} }))
import { createPresentation } from './index'
afterEach(() => { vi.unstubAllGlobals(); observed.samples.length = 0; observed.order.length = 0; observed.viewWork = () => {} })

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

it('actual RAF phase timing uses observer time and preserves the throwing boundary', () => {
  let clock = 1000, frame!: (now: number) => void, failRead = false
  const error = new Error('owner-pose-read-failed'), timings: unknown[] = []
  const schedule = vi.fn((callback: (now: number) => void) => { frame = callback; return 1 })
  vi.stubGlobal('performance', { now: () => clock })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false })
  const node = { classList: { add() {}, remove() {} } } as unknown as HTMLElement
  observed.viewWork = () => { clock += 11 }
  const read = vi.fn(() => { clock += 7; if (failRead) throw error; return null })
  const onFrame = vi.fn((_frame: unknown) => { clock += 13 })
  const presentation = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1,
    readLocalPose: read, onFrame, onFrameTiming: timing => timings.push(timing) })
  presentation.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
  frame(10)
  expect(timings).toHaveLength(1)
  expect(timings[0]).toMatchObject({ rafT: 10, startedAt: 1000, endedAt: 1031, complete: true,
    spans: [{ phase: 'ownerPose', durationMs: 7 }, { phase: 'viewUpdate', durationMs: 11 }, { phase: 'onFrame', durationMs: 13 }] })
  expect(read).toHaveBeenCalledTimes(1)
  expect(onFrame).toHaveBeenCalledTimes(1)
  expect(onFrame.mock.calls[0][0]).toMatchObject({ now: 10, dt: 0 })
  expect(schedule).toHaveBeenCalledTimes(2)
  failRead = true
  let caught: unknown
  try { frame(20) } catch (thrown) { caught = thrown }
  expect(caught).toBe(error)
  expect(timings[1]).toMatchObject({ complete: false, failedPhase: 'ownerPose', error,
    spans: [{ phase: 'ownerPose', durationMs: 7 }] })
  expect(read).toHaveBeenCalledTimes(2)
  expect(onFrame).toHaveBeenCalledTimes(1)
  expect(schedule).toHaveBeenCalledTimes(2)
  presentation.dispose()
})
