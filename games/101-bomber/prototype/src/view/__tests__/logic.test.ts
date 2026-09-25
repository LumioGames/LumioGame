import { describe, expect, it } from 'vitest'
import { BlockType } from '../../contract'
import {
  CAMERA,
  chainHitstopMs,
  chainShakeAmplitude,
  clampFollow,
  followDistanceForAspect,
} from '../logic/camera-math'
import { CHAIN_CAP_MS, computeChainDelays, orderChain, type ChainBomb } from '../logic/chain-stagger'
import { canPreviewBomb, computeFireCross, forEachCrossCell } from '../logic/fire-preview'
import { HAT, hatStackLayout } from '../logic/hat-layout'
import { approachAngle, heartStage, interpolateXZ, shortestAngleDelta, smoothDamp } from '../logic/interp'
import { Timeline } from '../logic/timeline'

describe('interpolateXZ', () => {
  const out = { x: 0, z: 0 }
  it('lerps between prev and curr by alpha', () => {
    interpolateXZ(out, { x: 1, z: 2 }, { x: 3, z: 6 }, 0, 10, 0.25)
    expect(out).toEqual({ x: 1.5, z: 3 })
  })
  it('snaps when the entity teleported after prev (respawn / match reset)', () => {
    interpolateXZ(out, { x: 1, z: 2 }, { x: 15, z: 16 }, 11, 10, 0.1)
    expect(out).toEqual({ x: 15, z: 16 })
  })
  it('interpolates when the teleport happened at or before prev', () => {
    interpolateXZ(out, { x: 0, z: 0 }, { x: 2, z: 0 }, 10, 10, 0.5)
    expect(out.x).toBe(1)
  })
  it('snaps when there is no prev (newly spawned) and clamps alpha', () => {
    interpolateXZ(out, undefined, { x: 4, z: 5 }, 0, 10, 0.5)
    expect(out).toEqual({ x: 4, z: 5 })
    interpolateXZ(out, { x: 0, z: 0 }, { x: 2, z: 2 }, 0, 10, 3)
    expect(out).toEqual({ x: 2, z: 2 })
  })
})

describe('angles and damping', () => {
  it('takes the shortest arc across ±π', () => {
    expect(shortestAngleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6)
    // 走一半：从 π−0.1 经 ±π 走向 −π+0.1，中点在 ±π，而不是绕远路经过 0。
    const half = approachAngle(Math.PI - 0.1, -Math.PI + 0.1, Math.LN2, 1)
    expect(Math.abs(half)).toBeCloseTo(Math.PI, 6)
    const done = approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1)
    expect(Math.abs(shortestAngleDelta(done, -Math.PI + 0.1))).toBeLessThan(1e-6)
  })
  it('smoothDamp converges and does not move at dt = 0', () => {
    const s = { value: 0, velocity: 0 }
    expect(smoothDamp(s, 10, 0.15, 0)).toBe(0)
    for (let i = 0; i < 120; i++) smoothDamp(s, 10, 0.15, 1 / 60)
    expect(s.value).toBeCloseTo(10, 2)
  })
  it('heart stage rounds up to whole hearts', () => {
    expect([6, 5, 4, 3, 2, 1, 0, -2].map((p) => heartStage(p, 2))).toEqual([3, 3, 2, 2, 1, 1, 0, 0])
  })
})

describe('camera math', () => {
  it('keeps 12.5 on 16:9 and pulls back on narrow screens up to 26', () => {
    expect(followDistanceForAspect(16 / 9)).toBe(CAMERA.followDistance)
    const portrait = followDistanceForAspect(9 / 19.5)
    expect(portrait).toBeGreaterThan(CAMERA.followDistance)
    expect(portrait).toBeLessThanOrEqual(CAMERA.maxDistance)
  })
  it('clamps the follow target ≥ 4 cells inside the board', () => {
    expect(clampFollow(1, 19, 4)).toBe(4)
    expect(clampFollow(18, 19, 4)).toBe(15)
    expect(clampFollow(9, 19, 4)).toBe(9)
  })
  it('shake and hitstop follow the chain formulas with caps', () => {
    expect(chainShakeAmplitude(2)).toBe(0)
    expect(chainShakeAmplitude(3)).toBeCloseTo(0.12)
    expect(chainShakeAmplitude(5)).toBeCloseTo(0.2)
    expect(chainShakeAmplitude(20)).toBe(0.4)
    expect(chainHitstopMs(2)).toBe(0)
    expect(chainHitstopMs(3)).toBe(50)
    expect(chainHitstopMs(4)).toBe(60)
    expect(chainHitstopMs(9)).toBe(80)
  })
})

describe('hat stack layout', () => {
  it('draws 5 hats one by one, 0.12 apart', () => {
    const l = hatStackLayout(5)
    expect(l.drawn).toBe(5)
    expect(Array.from(l.offsets.slice(0, 5))).toEqual([0, 0.12, 0.24, 0.36, 0.48].map((v) => Math.fround(v)))
    expect(l.segmentHeight).toBe(0)
    expect(l.totalHeight).toBeCloseTo(4 * 0.12 + HAT.height)
  })
  it('draws 12 hats individually and stays within 1.6 cells', () => {
    const l = hatStackLayout(12)
    expect(l.drawn).toBe(12)
    expect(l.segmentHeight).toBe(0)
    expect(l.totalHeight).toBeLessThanOrEqual(HAT.maxTotal)
  })
  it('compresses 37 hats into 10 + a striped segment, total ≤ 1.6', () => {
    const l = hatStackLayout(37)
    expect(l.drawn).toBe(10)
    expect(l.segmentHeight).toBeGreaterThan(0)
    expect(l.totalHeight).toBeLessThanOrEqual(HAT.maxTotal + 1e-6)
    for (let i = 1; i < l.drawn; i++) expect(l.offsets[i]).toBeGreaterThan(l.offsets[i - 1])
    // 上半截从压缩段顶上开始。
    expect(l.offsets[5]).toBeCloseTo(l.segmentBottom + l.segmentHeight, 5)
  })
  it('tower height never shrinks as hats grow', () => {
    let last = 0
    for (let n = 0; n <= 80; n++) {
      const h = hatStackLayout(n).totalHeight
      expect(h).toBeGreaterThanOrEqual(last - 1e-6)
      expect(h).toBeLessThanOrEqual(HAT.maxTotal + 1e-6)
      last = h
    }
  })
})

describe('bomb preview cross vs fire rules', () => {
  const size = 7
  const mk = () => ({ size, ground: new Uint8Array(size * size).fill(BlockType.地面), brick: new Uint8Array(size * size) })
  const at = (x: number, y: number) => y * size + x

  it('open field reaches full power in all four arms', () => {
    const t = mk()
    const c = computeFireCross(t, 3, 3, 2)
    expect([c.up, c.down, c.left, c.right]).toEqual([2, 2, 2, 2])
    expect(c.breaks).toEqual([])
  })
  it('hard block stops before, soft block and crate are destroyed but not covered', () => {
    const t = mk()
    t.brick[at(3, 2)] = BlockType.铁皮 // 上方紧邻
    t.brick[at(3, 5)] = BlockType.积木 // 下方第 2 格
    t.brick[at(1, 3)] = BlockType.木箱 // 左方第 2 格
    const c = computeFireCross(t, 3, 3, 3)
    expect(c.up).toBe(0)
    expect(c.down).toBe(1)
    expect(c.left).toBe(1)
    expect(c.right).toBe(3)
    expect(c.breaks.sort((a, b) => a - b)).toEqual([at(1, 3), at(3, 5)].sort((a, b) => a - b))
  })
  it('water is covered then stops', () => {
    const t = mk()
    t.ground[at(4, 3)] = BlockType.水
    const c = computeFireCross(t, 3, 3, 3)
    expect(c.right).toBe(1)
  })
  it('stops at the board edge', () => {
    const t = mk()
    const c = computeFireCross(t, 0, 0, 3)
    expect([c.up, c.left, c.down, c.right]).toEqual([0, 0, 3, 3])
  })
  it('enumerates the center plus arm cells with distances', () => {
    const cells: string[] = []
    forEachCrossCell(3, 3, 1, 0, 2, 0, (x, y, d) => cells.push(`${x},${y}:${d}`))
    expect(cells).toEqual(['3,3:0', '3,2:1', '2,3:1', '1,3:2'])
  })
  it('no preview on water, without bombs in hand, on an occupied cell, or when dead', () => {
    const ok = { alive: true, bombsInHand: 1, cellHasBomb: false, groundBlock: BlockType.地面 }
    expect(canPreviewBomb(ok)).toBe(true)
    expect(canPreviewBomb({ ...ok, groundBlock: BlockType.水 })).toBe(false)
    expect(canPreviewBomb({ ...ok, bombsInHand: 0 })).toBe(false)
    expect(canPreviewBomb({ ...ok, cellHasBomb: true })).toBe(false)
    expect(canPreviewBomb({ ...ok, alive: false })).toBe(false)
  })
})

describe('chain stagger', () => {
  const bomb = (id: number, x: number, y: number, fuseEnd: number, p = 2, chain = 7, at = 100): ChainBomb => ({
    id,
    chainId: chain,
    x,
    y,
    up: p,
    down: p,
    left: p,
    right: p,
    fuseEndTick: fuseEnd,
    explodedAtTick: at,
  })

  it('starts at the fuse-expired root and follows the fire, not ids', () => {
    // 根是 id 9（引信到点）；它盖到 id 2，id 2 再盖到 id 1。
    const group = [bomb(1, 5, 1, 140), bomb(2, 3, 1, 130), bomb(9, 1, 1, 100)]
    expect(orderChain(group)).toEqual([9, 2, 1])
  })
  it('uses IndexInChain hints when every bomb has one', () => {
    const group = [bomb(1, 5, 1, 140), bomb(2, 3, 1, 130), bomb(9, 1, 1, 100)]
    const hints = new Map([
      [1, 0],
      [2, 2],
      [9, 1],
    ])
    expect(orderChain(group, hints)).toEqual([1, 9, 2])
  })
  it('staggers 40 ms per bomb, capped at 320 ms, per chain group', () => {
    const line = Array.from({ length: 12 }, (_, i) => bomb(i + 1, 1 + i, 1, i === 0 ? 100 : 200))
    const other = bomb(50, 10, 10, 100, 2, 8)
    const d = computeChainDelays([...line, other])
    expect(d.get(1)).toEqual({ delayMs: 0, index: 0, chainLength: 12 })
    expect(d.get(2)!.delayMs).toBe(40)
    expect(d.get(5)!.delayMs).toBe(160)
    expect(d.get(12)!.delayMs).toBe(CHAIN_CAP_MS)
    expect(d.get(50)).toEqual({ delayMs: 0, index: 0, chainLength: 1 })
  })
  it('bombs not touched by any cross still get an order (by id) after the reached ones', () => {
    const group = [bomb(3, 10, 10, 200), bomb(1, 1, 1, 100)]
    expect(orderChain(group)).toEqual([1, 3])
  })
})

describe('timeline', () => {
  it('runs due actions in time order, including ones scheduled by due actions', () => {
    const t = new Timeline()
    const log: string[] = []
    t.add(20, () => log.push('b'))
    t.add(10, () => {
      log.push('a')
      t.add(15, () => log.push('a2'))
    })
    t.add(50, () => log.push('late'))
    t.run(30)
    expect(log).toEqual(['a', 'b', 'a2'])
    expect(t.size).toBe(1)
  })
})
