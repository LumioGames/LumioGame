import { describe, expect, it } from 'vitest'
import type { BomberEvent, WorldSnapshot } from '../../contract'
import { PresentationFeed } from '../feed'

/** feed 只读 Tick，其余字段用不到。 */
const snapAt = (tick: number): WorldSnapshot => ({ Tick: tick }) as unknown as WorldSnapshot
const ended = (tick: number): BomberEvent => ({ type: 'MatchEnded', Tick: tick })

function running(): PresentationFeed {
  const f = new PresentationFeed(50)
  f.push({ snapshot: snapAt(10), events: [] }, 0)
  f.push({ snapshot: snapAt(11), events: [] }, 0)
  f.sample(0)
  return f
}

describe('PresentationFeed · 慢镜（design §3.1 整局最后一杀）', () => {
  it('scales only viewNow while the slow-mo window lasts; renderTick keeps real time', () => {
    const f = running()
    f.slowMo(600, 0.3, 0)
    const a = f.sample(100)
    expect(a?.viewNow).toBeCloseTo(30)
    expect(a?.timeScale).toBe(0.3)
    // 插值系数仍按真实时间走（100 ms ≥ 1 Tick → alpha 封顶 1）。
    expect(a?.renderTick).toBe(11)
    const b = f.sample(600)
    expect(b?.viewNow).toBeCloseTo(180)
    const c = f.sample(700)
    expect(c?.viewNow).toBeCloseTo(280)
    expect(c?.timeScale).toBe(1)
  })

  it('splits a frame that straddles the end of the window', () => {
    const f = running()
    f.slowMo(100, 0.5, 0)
    expect(f.sample(200)?.viewNow).toBeCloseTo(50 + 100)
  })

  it('the sample handle requests slow-mo from the latest sample time, and events still come due on time', () => {
    const f = new PresentationFeed(50)
    f.push({ snapshot: snapAt(10), events: [] }, 0)
    f.push({ snapshot: snapAt(11), events: [ended(11)] }, 0)
    const s = f.sample(1000)
    expect(s?.dueEvents.map((e) => e.type)).toEqual(['MatchEnded'])
    s?.slowMo(600, 0.3)
    const t = f.sample(1100)
    expect(t && s ? t.viewNow - s.viewNow : 0).toBeCloseTo(30)
  })

  it('freeze still wins over slow-mo (timeScale 0), and reset clears the window', () => {
    const f = running()
    f.slowMo(600, 0.3, 0)
    f.freeze(70, 0)
    const z = f.sample(50)
    expect(z?.frozen).toBe(true)
    expect(z?.timeScale).toBe(0)
    f.reset()
    f.push({ snapshot: snapAt(12), events: [] }, 100)
    f.push({ snapshot: snapAt(13), events: [] }, 100)
    const before = f.sample(100)?.viewNow ?? 0
    expect((f.sample(200)?.viewNow ?? 0) - before).toBeCloseTo(100)
  })

  it('ignores non-positive requests', () => {
    const f = running()
    f.slowMo(0, 0.3, 0)
    f.slowMo(-5, 0.3, 0)
    expect(f.sample(100)?.viewNow).toBeCloseTo(100)
  })
})
