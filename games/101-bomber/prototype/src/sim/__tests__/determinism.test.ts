import { describe, expect, it } from 'vitest'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES, type MatchEnded } from '../../contract'
import { hashWorld } from '../hash'
import { LocalSim } from '../local-sim'
import { createWorld } from '../match-phase'
import { stepWorld } from '../step'
import { centerMilli } from '../world'
import { specs, Walker } from './helpers'

/** 设计 §7 第 11 项（矩阵 7.1 / 7.1a 精神）。 */
function runHashes(seed: number, walkerSeed: number, ticks: number): string[] {
  const sim = new LocalSim({ seed, config: DEFAULT_CONFIG, rules: DEFAULT_RULES, players: specs(8) })
  const ids = Array.from({ length: 8 }, (_, i) => sim.playerIdForSlot(i))
  const walker = new Walker(walkerSeed)
  const out = [sim.stateHash()]
  for (let i = 0; i < ticks; i++) {
    sim.step(walker.inputs(ids))
    out.push(sim.stateHash())
  }
  return out
}

describe('determinism', () => {
  it('same seed + same input stream → identical StateHash on every tick', () => {
    const a = runHashes(42, 99, 900)
    const b = runHashes(42, 99, 900)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBeGreaterThan(800)
  })

  it('stays identical through the whole 115 s circle (6 stages, clearing, chests, eliminations, results) and into the next match', () => {
    // 116 s 局：第 1 秒末就进决赛圈。玩家 1、2 每局开局停在中心并带长保护（炸弹伤不到、毒圈照样在圈内），
    // 所以本局一定时间到结束、安全圈走完 6 段；其余 6 人随机游走放弹，陆续出局。
    const run = (): { hashes: string[]; types: Set<string>; stages: number[]; ended: MatchEnded[] } => {
      const config = { ...DEFAULT_CONFIG, matchDurationMs: 116_000 }
      const w = createWorld({ seed: 11, config, rules: DEFAULT_RULES, players: specs(8) })
      const park = (): void => {
        for (const id of [1, 2]) {
          const p = w.players.find((q) => q.id === id)!
          p.mx = centerMilli(9)
          p.my = centerMilli(9)
          p.protectedUntilTick = 1_000_000
        }
      }
      park()
      const walkers = w.players.filter((p) => p.id > 2).map((p) => p.id)
      const walker = new Walker(5, 0.03)
      const hashes: string[] = []
      const types = new Set<string>()
      const stages: number[] = []
      const ended: MatchEnded[] = []
      for (let i = 0; i < 2750; i++) {
        const f = stepWorld(w, walker.inputs(walkers))
        for (const e of f.events) {
          types.add(e.type)
          if (e.type === 'RingShrunk') stages.push(e.StageIndex)
          if (e.type === 'MatchEnded') ended.push(e)
          if (e.type === 'MatchStarted') park()
        }
        hashes.push(hashWorld(w))
      }
      return { hashes, types, stages, ended }
    }
    const a = run()
    const b = run()
    expect(a.hashes).toEqual(b.hashes)
    expect(a.stages).toEqual([0, 1, 2, 3, 4, 5])
    expect(a.ended).toEqual(b.ended)
    expect(a.ended).toHaveLength(1)
    expect(a.ended[0].proto?.Reason).toBe('timeUp')
    // 宝箱只在 3 次独立炸弹命中后开启（清场不再代开，ADR 0031），随机行走打不开；开启的确定性由 chest-drops.test.ts 覆盖。
    for (const t of ['FinalCircleStarted', 'RingShrinkAnnounced', 'ChestSpawned', 'BrickDestroyed', 'PlayerEliminated', 'MatchEnded', 'MatchStarted'])
      expect(a.types).toContain(t)
  })

  it('seed + 1 or a different input stream diverges', () => {
    expect(runHashes(43, 99, 0)[0]).not.toBe(runHashes(42, 99, 0)[0])
    const a = runHashes(42, 99, 300)
    const b = runHashes(42, 100, 300)
    expect(a[0]).toBe(b[0])
    expect(a[300]).not.toBe(b[300])
  })

  it('the hash covers terrain: changing only one brick changes it (7.1a)', () => {
    const opts = { seed: 5, config: DEFAULT_CONFIG, rules: DEFAULT_RULES, players: specs(2) }
    const w1 = createWorld(opts)
    const w2 = createWorld(opts)
    expect(hashWorld(w1)).toBe(hashWorld(w2))
    const c = w2.brick.findIndex((b) => b === BlockType.积木)
    w2.brick[c] = BlockType.Air
    expect(hashWorld(w1)).not.toBe(hashWorld(w2))
  })

  it('published frames are plain data and do not alias sim state', () => {
    const sim = new LocalSim({ seed: 3, config: DEFAULT_CONFIG, rules: DEFAULT_RULES, players: specs(2) })
    const f0 = sim.current()
    expect(f0.snapshot.Tick).toBe(0)
    expect(f0.events.map((e) => e.type)).toEqual(['MatchStarted'])
    const before = f0.snapshot.Terrain.brick.slice()
    const h = sim.stateHash()
    f0.snapshot.Terrain.brick.fill(0)
    expect(sim.stateHash()).toBe(h)
    const f1 = sim.step(new Map())
    expect(f1.snapshot.Terrain.brick).toEqual(before)
    expect(f1.snapshot.Terrain.brick).not.toBe(f0.snapshot.Terrain.brick)
    expect(JSON.parse(JSON.stringify(f1.snapshot.Players))).toEqual(f1.snapshot.Players)
  })
})
