import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_RULES } from '../../contract'
import { snap } from '../../hud/__tests__/fixtures'
import { PresentationFeed, type FeedSample } from '../../present/feed'
import { ViewRuntime } from '../runtime'

function fixture(alpha: number, localPose?: FeedSample['localPose']) {
  const feed = new PresentationFeed(50)
  feed.push({ snapshot: snap({ tick: 10, players: [{ id: 1, x: 1, z: 2 }, { id: 2, x: 3, z: 4 }] }), events: [] }, 0)
  feed.push({ snapshot: snap({ tick: 11, players: [{ id: 1, x: 5, z: 6 }, { id: 2, x: 7, z: 8 }] }), events: [] }, 50)
  const sample = feed.sample(50 + 50 * alpha)!
  if (localPose !== undefined) sample.localPose = localPose
  const dolls = new Map(sample.curr.Players.map(p => [p.NetEntityIdRaw, {
    visual: 'alive', shown: false, root: { visible: true }, groundY: 0, x: 0, z: 0, speed: 0, dirX: 0, dirZ: 0,
    setHeight() {}, update(x: number, z: number) { this.x = x; this.z = z }, hide() { this.root.visible = false },
  }]))
  const state = {
    opts: { localPlayerId: 1, config: DEFAULT_CONFIG, rules: DEFAULT_RULES }, dolls,
    blinkSnap: new Set(), prevMap: new Map(sample.prev.Players.map(p => [p.NetEntityIdRaw, p])),
    pos: { x: 0, z: 0 }, localTarget: { x: 0, z: 0, dx: 0, dz: 0 }, perHeart: 2,
    terrain: { groundAt: () => 0 }, waterTrail: { step: () => null }, dollFx: {},
    skillFx: { player() {} }, updateSpectate() {}, deaths: [],
  }
  const update = () => (ViewRuntime.prototype as unknown as {
    updateDolls(this: unknown, sample: FeedSample, now: number, dt: number): void
  }).updateDolls.call(state, sample, 0, 0)
  return { sample, dolls, state, update }
}

describe('actual doll owner Model consumption', () => {
  it.each([0, 0.5])('uses evaluated owner pose at snapshot alpha %s while remotes interpolate', alpha => {
    const f = fixture(alpha, { playerId: 1, entity: 'raw-self', connectionGeneration: '9', publicationSequence: '9007199254740993',
      model: { position: { x: 12, y: 0, z: 13 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } })
    const before = structuredClone(f.sample.curr)
    f.update()
    expect([f.dolls.get(1)!.x, f.dolls.get(1)!.z]).toEqual([12, 13])
    expect([f.state.localTarget.x, f.state.localTarget.z]).toEqual([12, 13])
    expect([f.dolls.get(2)!.x, f.dolls.get(2)!.z]).toEqual([3 + 4 * alpha, 4 + 4 * alpha])
    expect(f.sample.curr).toEqual(before)
    f.sample.localPose = { ...f.sample.localPose!, publicationSequence: '9007199254740994',
      model: { position: { x: 20, y: 0, z: 21 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }
    f.update()
    expect([f.dolls.get(1)!.x, f.dolls.get(1)!.z]).toEqual([20, 21])
  })

  it('hides an uninitialized Model owner while a consumer without the callback keeps interpolation', () => {
    const waiting = fixture(0.5, null)
    waiting.update()
    expect(waiting.dolls.get(1)!.root.visible).toBe(false)
    expect(waiting.dolls.get(2)!.x).toBe(5)
    const legacy = fixture(0.5)
    legacy.update()
    expect(legacy.dolls.get(1)!.x).toBe(3)
  })
})
