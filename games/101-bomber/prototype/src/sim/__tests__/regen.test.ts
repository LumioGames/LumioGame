import { describe, expect, it } from 'vitest'
import { BlockType, MatchPhase } from '../../contract'
import { spawnZones } from '../mapgen'
import { countResource } from '../world'
import { evs, makeWorld, put, run } from './helpers'

/** 软砖再生（design §5，ADR 0026）。 */
describe('soft brick regen', () => {
  const clearAll = (w: ReturnType<typeof makeWorld>) => {
    for (let c = 0; c < w.brick.length; c++) if (w.brick[c] === BlockType.积木 || w.brick[c] === BlockType.木箱) w.brick[c] = BlockType.Air
  }

  it('regrows mirrored soft bricks in empty areas every interval until the target, never in spawn zones or water', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    w.resourceInitial = 100
    clearAll(w)
    const frames = run(w, w.ticks.regenInterval * 3)
    const grown = evs(frames, 'BricksRegrown')
    expect(grown.length).toBeGreaterThan(0)
    const reserved = new Set(spawnZones(w.size).flatMap((z) => z.cells))
    for (const e of grown) {
      expect(e.Cells.length % 1 === 0 && e.Cells.length > 0).toBe(true)
      for (const c of e.Cells) {
        const i = c.Y * w.size + c.X
        expect(reserved.has(i)).toBe(false)
        expect(w.ground[i]).not.toBe(BlockType.水)
        // 四象限镜像同步。
        const mx = w.size - 1 - c.X
        const my = w.size - 1 - c.Y
        expect(w.brick[c.Y * w.size + mx]).toBe(BlockType.积木)
        expect(w.brick[my * w.size + c.X]).toBe(BlockType.积木)
      }
    }
    expect(countResource(w)).toBeGreaterThan(0)
  })

  it('stops before the final circle and never regrows during it', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    w.resourceInitial = 100
    clearAll(w)
    w.match.endTick = w.t + w.ticks.finalCircle + w.ticks.regenStopBeforeFinal
    const frames = run(w, w.ticks.regenInterval * 2)
    expect(evs(frames, 'BricksRegrown')).toHaveLength(0)
    expect([MatchPhase.Running, MatchPhase.Endgame]).toContain(w.match.phase)
  })
})
