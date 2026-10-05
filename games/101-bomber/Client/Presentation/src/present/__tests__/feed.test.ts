import { describe, expect, it } from 'vitest'
import { died, snap } from '../../hud/__tests__/fixtures'
import { PresentationFeed } from '../feed'

describe('authoritative presentation feed', () => {
  it('owns copies of nested data and typed terrain arrays', () => {
    const feed = new PresentationFeed(50)
    const snapshot = snap({ tick: 10 })
    const event = died(10, 1, 2, 0)
    feed.push({ snapshot, events: [event] }, 0)
    snapshot.Players[0].meta.name = 'changed'
    snapshot.Terrain.brick[0] = 99
    event.Tick = 90
    const sample = feed.sample(0)!
    expect(sample.curr.Players[0].meta.name).not.toBe('changed')
    expect(sample.curr.Terrain.brick[0]).not.toBe(99)
    expect(sample.dueEvents[0].Tick).toBe(10)
    expect(feed.sample(1)!.dueEvents).toEqual([])
  })

  it('interpolates without extrapolation and ignores stale or repeated frames', () => {
    const feed = new PresentationFeed(50)
    feed.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
    feed.push({ snapshot: snap({ tick: 11 }), events: [died(11, 1, 2, 0)] }, 50)
    feed.push({ snapshot: snap({ tick: 9 }), events: [] }, 60)
    feed.push({ snapshot: snap({ tick: 11 }), events: [died(11, 1, 2, 0)] }, 70)
    expect(feed.sample(75)!.renderTick).toBe(10.5)
    const final = feed.sample(1000)!
    expect(final.renderTick).toBe(11)
    expect(final.dueEvents).toHaveLength(1)
    expect(final.viewNow).toBe(100)
  })

  it.each([2, 3])('plays a %i-tick snapshot span over its logical duration', span => {
    const feed = new PresentationFeed(50)
    const latestTick = 10 + span
    const duration = span * 50
    feed.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
    feed.push({ snapshot: snap({ tick: latestTick }), events: [died(latestTick, 1, 2, 0)] }, duration)
    for (const portion of [0.25, 0.5, 0.75]) {
      const sample = feed.sample(duration + duration * portion)!
      expect(sample.alpha).toBeCloseTo(portion)
      expect(sample.renderTick).toBeCloseTo(10 + span * portion)
      expect(sample.dueEvents).toEqual([])
    }
    const end = feed.sample(duration * 2)!
    expect(end.renderTick).toBe(latestTick)
    expect(end.dueEvents).toHaveLength(1)
    expect(feed.sample(duration * 2 + 1000)!.renderTick).toBe(latestTick)
    expect(feed.sample(duration * 2 + 1001)!.dueEvents).toEqual([])
  })

  it('resets clocks and accepts a restarted session', () => {
    const feed = new PresentationFeed(50)
    feed.push({ snapshot: snap({ tick: 100 }), events: [] }, 0)
    feed.sample(0)
    feed.freeze(80, 0)
    expect(feed.sample(10)!.frozen).toBe(true)
    feed.reset()
    expect(feed.sample(20)).toBe(null)
    feed.push({ snapshot: snap({ tick: 1 }), events: [] }, 20)
    expect(feed.sample(20)!.frozen).toBe(false)
    expect(feed.sample(20)!.viewNow).toBe(0)
  })
  it('accepts same-tick voxel revisions without restarting interpolation or replaying events', () => {
    const feed = new PresentationFeed(50)
    feed.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
    feed.push({ snapshot: snap({ tick: 11 }), events: [died(11, 1, 2, 0)] }, 50)
    const revised = snap({ tick: 11 })
    revised.Terrain.rev = 2
    revised.Terrain.brick[1] = 6
    feed.push({ snapshot: revised, events: [] }, 70)
    const sample = feed.sample(75)!
    expect(sample.curr.Terrain.rev).toBe(2)
    expect(sample.curr.Terrain.brick[1]).toBe(6)
    expect(sample.renderTick).toBe(10.5)
    expect(feed.sample(100)!.dueEvents).toHaveLength(1)
    expect(feed.sample(150)!.dueEvents).toEqual([])
  })
  it('delivers a new stamped occurrence arriving on the same tick exactly once', () => {
    const feed = new PresentationFeed(50)
    feed.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
    const event = { ...died(10, 1, 2, 0), occurrenceId: '1:10:9' }
    feed.push({ snapshot: snap({ tick: 10 }), events: [event] }, 1)
    expect(feed.sample(2)!.dueEvents).toHaveLength(1)
    feed.push({ snapshot: snap({ tick: 10 }), events: [event] }, 3)
    expect(feed.sample(4)!.dueEvents).toEqual([])
  })
})
