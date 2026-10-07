import { describe, expect, it } from 'vitest'
import type { WorldSnapshot } from '../../contract'
import { died, snap } from '../../hud/__tests__/fixtures'
import { interpolatedPlayerPos } from '../../hud/edge-arrow'
import { PresentationFeed } from '../feed'

function pose(x: number, epoch?: string, tick = 10): WorldSnapshot {
  const snapshot = snap({ tick, players: [{ id: 1, x, z: x * 2 }, { id: 2, x: tick * .175 }] })
  if (epoch !== undefined) snapshot.Players[0].poseEpoch = epoch
  return snapshot
}

function xAt(feed: PresentationFeed, at: number): number {
  return interpolatedPlayerPos(feed.sample(at)!, 1)!.x
}

describe('local published pose reception timeline', () => {
  it('bounds owner render steps at 60Hz under repeated and skipped authority ticks', () => {
    const feed = new PresentationFeed(50, 1)
    const ticks = [10, 10, 12, 12, 14, 14, 16, 16]
    const xs: number[] = []
    ticks.forEach((tick, i) => {
      feed.push({ snapshot: pose(i * .175, undefined, tick), events: [] }, i * 50)
      for (let j = 0; j < 3; j++) xs.push(xAt(feed, i * 50 + j * 50 / 3))
    })
    expect(Math.max(...xs.slice(1).map((x, i) => x - xs[i]))).toBeLessThanOrEqual(.175 / 3 + 1e-8)
  })

  it('refreshes an unchanged authority tick through intermediate published positions', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(.175), events: [] }, 50)
    expect(xAt(feed, 50)).toBe(0)
    expect(interpolatedPlayerPos(feed.sample(75)!, 1)).toEqual({ x: .0875, z: .175 })
    expect(xAt(feed, 100)).toBe(.175)
  })

  it('does not restart a segment when target and epoch are unchanged', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0, 'life'), events: [] }, 0)
    feed.push({ snapshot: pose(1, 'life'), events: [] }, 50)
    feed.push({ snapshot: pose(1, 'life'), events: [] }, 70)
    expect(xAt(feed, 75)).toBe(.5)
    expect(xAt(feed, 100)).toBe(1)
  })

  it('starts irregular arrivals at the previously displayed point and permits corrections', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(1), events: [] }, 50)
    const before = xAt(feed, 70)
    expect(before).toBe(.4)
    feed.push({ snapshot: pose(-1), events: [] }, 70)
    expect(xAt(feed, 70)).toBe(before)
    expect(xAt(feed, 95)).toBeCloseTo(-.3)
    expect(xAt(feed, 120)).toBe(-1)
    expect(xAt(feed, 1000)).toBe(-1)
  })

  it.each(['life:2:0', 'life:1:1'])('snaps a same-tick epoch change to %s', epoch => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0, 'life:1:0', 9), events: [] }, 0)
    feed.push({ snapshot: pose(1, 'life:1:0'), events: [] }, 50)
    expect(xAt(feed, 70)).toBe(.4)
    feed.push({ snapshot: pose(5, epoch), events: [] }, 70)
    expect(xAt(feed, 70)).toBe(5)
    expect(xAt(feed, 90)).toBe(5)
  })

  it('uses teleportTick for older fixtures without an explicit epoch', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(1), events: [] }, 50)
    const teleported = pose(5)
    teleported.Players[0].teleportTick = 10
    feed.push({ snapshot: teleported, events: [] }, 70)
    expect(xAt(feed, 70)).toBe(5)
  })

  it.each(['removal', 'unknown', 'reset'])('clears an old local segment on %s', boundary => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(1), events: [] }, 50)
    if (boundary === 'reset') {
      feed.reset()
      expect(feed.sample(70)).toBeNull()
    } else {
      const snapshot = pose(1)
      if (boundary === 'removal') snapshot.Players = snapshot.Players.filter(p => p.NetEntityIdRaw !== 1)
      else snapshot.Players[0].positionKnown = false
      feed.push({ snapshot, events: [] }, 70)
      const sample = feed.sample(70)!
      expect(sample.ownerPose).toBeUndefined()
      expect(interpolatedPlayerPos(sample, 1)).toBeNull()
    }
    feed.push({ snapshot: pose(5), events: [] }, 80)
    expect(xAt(feed, 80)).toBe(5)
  })

  it('ignores stale poses and owns the numeric target coordinates', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    const snapshot = pose(1)
    feed.push({ snapshot, events: [] }, 50)
    snapshot.Players[0].LogicTransform.WorldPosition.x = 100
    feed.push({ snapshot: pose(100, 'new-life', 9), events: [] }, 70)
    expect(xAt(feed, 75)).toBe(.5)
    expect(xAt(feed, 100)).toBe(1)
  })

  it('freezes the sampled owner pose while newer publications arrive', () => {
    const feed = new PresentationFeed(50, 1)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(1), events: [] }, 50)
    expect(xAt(feed, 75)).toBe(.5)
    feed.freeze(80, 75)
    feed.push({ snapshot: pose(2), events: [] }, 100)
    expect(xAt(feed, 125)).toBe(.5)
    expect(feed.sample(125)!.frozen).toBe(true)
    expect(xAt(feed, 160)).toBe(2)
  })

  it.each([undefined, 0])('retains default behavior for local ID %s', id => {
    const feed = id === undefined ? new PresentationFeed(50) : new PresentationFeed(50, id)
    feed.push({ snapshot: pose(0), events: [] }, 0)
    feed.push({ snapshot: pose(1), events: [] }, 50)
    const sample = feed.sample(75)!
    expect(sample.ownerPose).toBeUndefined()
    expect(interpolatedPlayerPos(sample, 1)).toEqual({ x: 1, z: 2 })
  })

  it('retains authority event timing, remote poses, terrain refresh and occurrence deduplication', () => {
    const local = new PresentationFeed(50, 1)
    const authority = new PresentationFeed(50)
    const ticks = [10, 10, 12, 12, 14, 14, 16, 16]
    ticks.forEach((tick, i) => {
      const snapshot = pose(i * .175, undefined, tick)
      snapshot.Terrain.rev = i
      snapshot.Terrain.brick[0] = i
      const event = { ...died(tick, 1, 2, 0), occurrenceId: `death:${tick}` }
      const frame = { snapshot, events: [event] }
      local.push(frame, i * 50)
      authority.push(frame, i * 50)
      for (let j = 0; j < 3; j++) {
        const at = i * 50 + j * 50 / 3
        const a = local.sample(at)!, b = authority.sample(at)!
        expect(interpolatedPlayerPos(a, 2)).toEqual(interpolatedPlayerPos(b, 2))
        expect(a.renderTick).toBe(b.renderTick)
        expect(a.alpha).toBe(b.alpha)
        expect(a.dueEvents).toEqual(b.dueEvents)
        expect(a.curr.Terrain).toEqual(b.curr.Terrain)
        expect(a.curr.Tick).toBe(tick)
      }
    })
  })
})
