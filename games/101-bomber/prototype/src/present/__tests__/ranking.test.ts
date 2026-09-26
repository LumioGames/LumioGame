import { describe, expect, it } from 'vitest'
import { MatchPhase, type MatchResultsView, type PlayerView, type WorldSnapshot } from '../../contract'
import { rankInputsOf, resultsOf } from '../ranking'

function p(id: number, hats: number, eliminated = false, eliminatedTick?: number): PlayerView {
  return {
    NetEntityIdRaw: id,
    LogicTransform: { WorldPosition: { x: 1.5, y: 1, z: 1.5 } },
    teleportTick: 0,
    BomberPlayerState: { HatCount: hats, RespawnAtTick: 0, ProtectedUntilTick: 0 },
    玩家属性: { 血量当前: eliminated ? 0 : 6, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
    meta: { name: `p${id}`, isBot: id !== 1, animal: 'duck', slot: id - 1 },
    eliminated,
    ...(eliminatedTick !== undefined ? { eliminatedTick } : {}),
  }
}

function snap(players: PlayerView[], results?: MatchResultsView): WorldSnapshot {
  return {
    Tick: 100,
    BomberMatchState: { MatchTick: 100, StartTick: 0, EndTick: 100, Phase: MatchPhase.Settlement, HatKingNetEntityIdRaw: 0 },
    Players: players,
    Bombs: [],
    HatPiles: [],
    Pickups: [],
    Chests: [],
    Terrain: { size: 3, ground: new Uint8Array(9), brick: new Uint8Array(9), rev: 0 },
    match: { matchIndex: 1, phaseEndTick: 400, tickRateHz: 20, resourceInitial: 0, resourceRemaining: 0, finalCircle: null, ...(results ? { results } : {}) },
  }
}

describe('present/ranking', () => {
  it('prefers match.results from the rules layer', () => {
    const r: MatchResultsView = { reason: 'timeUp', winner: 3, rows: [{ id: 3, rank: 1, place: 1, survived: true, hats: 0, eliminatedTick: 0 }] }
    expect(resultsOf(snap([p(1, 5), p(3, 0)], r))).toBe(r)
  })

  it('falls back to the shared ranking: a 0-hat sole survivor beats an eliminated 5-hat player', () => {
    const r = resultsOf(snap([p(1, 5, true, 90), p(2, 0), p(3, 2, true, 80)]))
    expect(r.reason).toBe('lastSurvivor')
    expect(r.winner).toBe(2)
    expect(r.rows.map((x) => [x.id, x.rank, x.survived])).toEqual([
      [2, 1, true],
      [1, 2, false],
      [3, 3, false],
    ])
  })

  it('fills a missing eliminatedTick from tickOf', () => {
    const ins = rankInputsOf([p(1, 0, true), p(2, 0, true, 50)], (id) => (id === 1 ? 70 : 10))
    expect(ins.map((i) => [i.id, i.eliminatedTick])).toEqual([
      [1, 70],
      [2, 50],
    ])
    const r = resultsOf(snap([p(1, 0, true), p(2, 0, true, 50)]), () => 70)
    expect(r.reason).toBe('allDown')
    expect(r.rows[0].id).toBe(1)
  })
})
