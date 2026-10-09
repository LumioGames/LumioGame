import { afterEach, expect, it, vi } from 'vitest'
import { snap } from './hud/__tests__/fixtures'
const observed = vi.hoisted(() => ({ samples: [] as unknown[], order: [] as string[], viewWork: () => {}, hudWork: () => {}, audioWork: () => {} }))
vi.mock('./view', () => ({ createView: () => ({ update: (s: unknown) => { observed.samples.push(s); observed.order.push('view'); observed.viewWork() },
  debugLocal: () => null, project() {}, resize() {}, toggleOverview() {}, dispose() {} }), renderDollPortraits() {} }))
vi.mock('./hud', () => ({ createHud: () => ({ inputBlocked: () => false, update: () => observed.hudWork(), setMuted() {}, dispose() {} }) }))
vi.mock('./audio', () => ({ createAudio: () => ({ update: () => observed.audioWork(), setMuted() {}, unlock() {}, dispose() {} }) }))
vi.mock('./present/settings', () => ({ loadSettings: () => ({ muted: true }), saveSettings() {} }))
vi.mock('./present/shortcuts', () => ({ attachPresentationShortcuts: () => () => {} }))
import { createPresentation } from './index'
import { PresentationFeed } from './present/feed'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); observed.samples.length = 0; observed.order.length = 0; observed.viewWork = () => {}; observed.hudWork = () => {}; observed.audioWork = () => {} })

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

it('whole RAF includes feed, HUD, audio and scheduling while keeping the original inner boundary', () => {
  let clock = 1000, frame!: (now: number) => void
  const whole: unknown[] = [], inner: unknown[] = []
  vi.stubGlobal('performance', { now: () => clock })
  const schedule = vi.fn((callback: (now: number) => void) => { frame = callback; clock += 23; return 1 })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false })
  const originalSample = PresentationFeed.prototype.sample
  vi.spyOn(PresentationFeed.prototype, 'sample').mockImplementation(function(this: PresentationFeed, now) { clock += 5; return originalSample.call(this, now) })
  observed.viewWork = () => { clock += 11 }
  observed.hudWork = () => { clock += 17 }
  observed.audioWork = () => { clock += 19 }
  const node = { classList: { add() {}, remove() {} } } as unknown as HTMLElement
  const read = vi.fn(() => { clock += 7; return null })
  const onFrame = vi.fn(() => { clock += 13 })
  const presentation = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1,
    readLocalPose: read, onFrame, onFrameTiming: timing => inner.push(timing), onRenderTiming: timing => whole.push(timing) })
  presentation.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
  clock = 1000
  frame(10)
  expect(whole).toHaveLength(1)
  expect(whole[0]).toMatchObject({ rafT: 10, startedAt: 1000, endedAt: 1095, complete: true,
    spans: [{ phase: 'feedSample', durationMs: 5 }, { phase: 'localViewFrame', durationMs: 31 },
      { phase: 'hudUpdate', durationMs: 17 }, { phase: 'touchSkill', durationMs: 0 },
      { phase: 'audioUpdate', durationMs: 19 }, { phase: 'touchTail', durationMs: 0 }, { phase: 'schedule', durationMs: 23 }] })
  expect(inner[0]).toMatchObject({ startedAt: 1005, endedAt: 1036, complete: true,
    spans: [{ phase: 'ownerPose', durationMs: 7 }, { phase: 'viewUpdate', durationMs: 11 }, { phase: 'onFrame', durationMs: 13 }] })
  expect(read).toHaveBeenCalledTimes(1)
  expect(onFrame).toHaveBeenCalledTimes(1)
  expect(schedule).toHaveBeenCalledTimes(2)
  presentation.dispose()
})

it('whole RAF observes empty feed frames and preserves HUD failure identity and scheduling', () => {
  let clock = 100, frame!: (now: number) => void
  const timings: unknown[] = [], error = new Error('hud-work-failed')
  vi.stubGlobal('performance', { now: () => clock })
  const schedule = vi.fn((callback: (now: number) => void) => { frame = callback; clock += 3; return 1 })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false })
  const originalSample = PresentationFeed.prototype.sample
  vi.spyOn(PresentationFeed.prototype, 'sample').mockImplementation(function(this: PresentationFeed, now) { clock += 9; return originalSample.call(this, now) })
  const node = { classList: { add() {}, remove() {} } } as unknown as HTMLElement
  const read = vi.fn(() => null)
  const presentation = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1,
    readLocalPose: read, onRenderTiming: timing => timings.push(timing) })
  clock = 100
  frame(10)
  expect(timings[0]).toMatchObject({ startedAt: 100, endedAt: 112, complete: true,
    spans: [{ phase: 'feedSample', durationMs: 9 }, { phase: 'touchTail', durationMs: 0 }, { phase: 'schedule', durationMs: 3 }] })
  expect(read).not.toHaveBeenCalled()
  observed.hudWork = () => { clock += 17; throw error }
  presentation.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
  let caught: unknown
  try { frame(20) } catch (thrown) { caught = thrown }
  expect(caught).toBe(error)
  expect(timings[1]).toMatchObject({ complete: false, failedPhase: 'hudUpdate', error })
  expect(schedule).toHaveBeenCalledTimes(2)
  expect(read).toHaveBeenCalledTimes(1)
  presentation.dispose()
})

it('whole RAF observer failures do not stop scheduling and ordinary RAF adds no clock reads', () => {
  let frame!: (now: number) => void
  const clock = vi.fn(() => 100)
  vi.stubGlobal('performance', { now: clock })
  const schedule = vi.fn((callback: (now: number) => void) => { frame = callback; return 1 })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false })
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
  const node = { classList: { add() {}, remove() {} } } as unknown as HTMLElement
  const ordinary = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1 })
  clock.mockClear()
  frame(10)
  expect(clock).not.toHaveBeenCalled()
  ordinary.dispose()
  const observed = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1,
    onRenderTiming: () => { throw new Error('private-observer-failed') } })
  frame(20)
  expect(schedule).toHaveBeenCalledTimes(4)
  expect(logging).toHaveBeenCalledTimes(1)
  observed.dispose()
  const clockFailed = createPresentation({ stage: node, labels: node, hud: node, localPlayerId: 1,
    onRenderTiming: () => { throw new Error('unreachable-observation') } })
  clock.mockImplementationOnce(() => { throw new Error('private-clock-failed') })
  frame(30)
  expect(schedule).toHaveBeenCalledTimes(6)
  expect(logging).toHaveBeenCalledTimes(2)
  clockFailed.dispose()
})
