import { describe, expect, it } from 'vitest'
import { MatchPhase, type BomberEvent, type PlayerView, type WorldSnapshot } from '../../contract'
import { CrownWatch, HatGainWatch, hitCues, isPowerup, localIsWinner } from '../cues'
import { FANFARE_SEC, LOOP_STEPS, MELODY, musicMode, MusicSequencer, notesAt, pentaFreq, stepSeconds, VARIANTS, type MusicInputs } from '../music'

function player(id: number, hats: number): PlayerView {
  return {
    NetEntityIdRaw: id,
    LogicTransform: { WorldPosition: { x: 1.5, y: 1, z: 1.5 } },
    teleportTick: 0,
    BomberPlayerState: { HatCount: hats, RespawnAtTick: 0, ProtectedUntilTick: 0 },
    玩家属性: { 血量当前: 6, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
    meta: { name: `p${id}`, isBot: id !== 1, animal: 'duck', slot: id - 1 },
    eliminated: false,
  }
}

function snap(tick: number, king: number, hats: Record<number, number>, matchIndex = 1): WorldSnapshot {
  return {
    Tick: tick,
    BomberMatchState: { MatchTick: tick, StartTick: 0, EndTick: 7200, Phase: MatchPhase.Running, HatKingNetEntityIdRaw: king },
    Players: Object.entries(hats).map(([id, h]) => player(Number(id), h)),
    Bombs: [],
    HatPiles: [],
    Pickups: [],
    Chests: [],
    Terrain: { size: 3, ground: new Uint8Array(9), brick: new Uint8Array(9), rev: 0 },
    match: { matchIndex, phaseEndTick: 7200, tickRateHz: 20, resourceInitial: 0, resourceRemaining: 0, finalCircle: null },
  }
}

describe('CrownWatch (review: no fanfare when the current king crosses N)', () => {
  it('fires when the reigning king grows from 1 to N hats without a HatKingChanged', () => {
    const w = new CrownWatch(3)
    expect(w.check(snap(1, 2, { 1: 0, 2: 1 }))).toBe(0)
    expect(w.check(snap(2, 2, { 1: 0, 2: 2 }))).toBe(0)
    expect(w.check(snap(3, 2, { 1: 0, 2: 3 }))).toBe(2)
    expect(w.check(snap(4, 2, { 1: 0, 2: 4 }))).toBe(0)
  })

  it('fires again for a new king ≥ N, and after the reign ends and restarts', () => {
    const w = new CrownWatch(3)
    expect(w.check(snap(1, 2, { 1: 0, 2: 3 }))).toBe(2)
    expect(w.check(snap(2, 1, { 1: 5, 2: 3 }))).toBe(1)
    expect(w.check(snap(3, 0, { 1: 0, 2: 0 }))).toBe(0)
    expect(w.check(snap(4, 1, { 1: 3, 2: 0 }))).toBe(1)
  })

  it('resets on a new match', () => {
    const w = new CrownWatch(3)
    expect(w.check(snap(1, 2, { 2: 3 }))).toBe(2)
    expect(w.check(snap(2, 2, { 2: 3 }, 2))).toBe(2)
  })
})

describe('hitCues (hurt / death sounds follow the chain rhythm)', () => {
  const dmg = (bomb: number, chain: number, cause?: 0 | 1 | 3): BomberEvent => ({
    type: 'DamageApplied',
    VictimNetEntityIdRaw: 1,
    SourceBombNetEntityIdRaw: bomb,
    SourceBombOwnerNetEntityIdRaw: 2,
    ChainId: chain,
    HealthPointsLeft: 2,
    Tick: 5,
    ...(cause !== undefined ? { proto: { Cause: cause, Points: cause === 0 ? 2 : 1 } } : {}),
  })
  const boom = (bomb: number, index: number): BomberEvent => ({
    type: 'BombExploded',
    ChainId: 9,
    SourceBombOwnerNetEntityIdRaw: 2,
    CellCount: 5,
    Tick: 5,
    proto: { BombNetEntityIdRaw: bomb, Cell: { X: 1, Y: 1 }, IndexInChain: index },
  })

  it('delays each hit by 40 ms × index in chain (IndexInChain first, arrival order otherwise), capped at 320 ms', () => {
    expect(hitCues([boom(11, 2), boom(12, 0), dmg(11, 9), dmg(12, 9)], 1).map((c) => c.delay)).toEqual([0, 0.08])
    expect(hitCues([dmg(1, 4), dmg(2, 4), dmg(3, 4)], 1).map((c) => c.delay)).toEqual([0, 0.04, 0.08])
    const many = Array.from({ length: 12 }, (_, i) => dmg(i + 1, 4))
    expect(Math.max(...hitCues(many, 1).map((c) => c.delay))).toBeCloseTo(0.32)
    expect(hitCues([dmg(1, 4)], 7)).toEqual([])
  })

  it('marks poison ticks (for the buzz) and plays them without delay', () => {
    expect(hitCues([dmg(0, 0, 3)], 1)).toEqual([{ delay: 0, poison: true }])
    expect(hitCues([dmg(0, 0, 1)], 1)).toEqual([{ delay: 0, poison: false }])
  })
})

describe('hat pop (ADR 0028: hats = power-ups)', () => {
  it('only power-ups pop a hat; health packs do not', () => {
    expect([0, 1, 2, 3].map((k) => isPowerup(k as 0 | 1 | 2 | 3))).toEqual([true, true, true, false])
  })

  it('HatGainWatch infers pops from the local HatCount while alive, resets per match, and yields to PickupTaken', () => {
    const w = new HatGainWatch()
    expect(w.check(snap(1, 0, { 1: 0, 2: 5 }), 1)).toBe(0)
    expect(w.check(snap(2, 0, { 1: 2, 2: 5 }), 1)).toBe(2)
    expect(w.check(snap(3, 0, { 1: 1, 2: 5 }), 1)).toBe(0)
    const dead = snap(4, 0, { 1: 3 })
    dead.Players[0].玩家属性.血量当前 = 0
    expect(w.check(dead, 1)).toBe(0)
    expect(w.check(snap(5, 0, { 1: 0 }, 2), 1)).toBe(0) // 新一局：重设基线
    expect(w.check(snap(6, 0, { 1: 1 }, 2), 1)).toBe(1)
    w.noteEvent()
    expect(w.check(snap(7, 0, { 1: 2 }, 2), 1)).toBe(0)
  })
})

describe('localIsWinner', () => {
  it('is true for a (shared) top hat count above zero', () => {
    expect(localIsWinner(snap(1, 0, { 1: 3, 2: 3 }), 1)).toBe(true)
    expect(localIsWinner(snap(1, 0, { 1: 2, 2: 3 }), 1)).toBe(false)
    expect(localIsWinner(snap(1, 0, { 1: 0, 2: 0 }), 1)).toBe(false)
  })
})

describe('musicMode (music state machine)', () => {
  const base: MusicInputs = { phase: MatchPhase.Running, renderTick: 0, tickRateHz: 20, matchEndedTick: null, podiumMs: 10000, stalled: false }

  it('main loop in warmup / running, faster variant in the final circle, silent when stalled', () => {
    expect(musicMode({ ...base, phase: MatchPhase.Warmup })).toBe('main')
    expect(musicMode(base)).toBe('main')
    expect(musicMode({ ...base, phase: MatchPhase.Endgame })).toBe('final')
    expect(musicMode({ ...base, stalled: true })).toBe('silent')
  })

  it('settlement: fanfare gap → podium loop until podiumMs → quiet results loop', () => {
    const s = { ...base, phase: MatchPhase.Settlement, matchEndedTick: 1000 }
    expect(musicMode({ ...s, renderTick: 1000 })).toBe('silent')
    expect(musicMode({ ...s, renderTick: 1000 + FANFARE_SEC * 20 + 1 })).toBe('podium')
    expect(musicMode({ ...s, renderTick: 1199 })).toBe('podium')
    expect(musicMode({ ...s, renderTick: 1200 })).toBe('results')
    expect(musicMode({ ...s, matchEndedTick: null })).toBe('results')
  })

  it('variants: 112 BPM main, 128 BPM final with an octave layer, results quieter', () => {
    expect(VARIANTS.main.bpm).toBe(112)
    expect(VARIANTS.final.bpm).toBe(128)
    expect(VARIANTS.final.octaveLayer).toBe(true)
    expect(VARIANTS.results.gain).toBeLessThan(VARIANTS.main.gain)
  })
})

describe('MusicSequencer', () => {
  const PENTA_SET = new Set(Array.from({ length: 12 }, (_, i) => pentaFreq(i).toFixed(2)))

  it('is an 8-bar loop whose melody stays on the C major pentatonic scale', () => {
    expect(MELODY).toHaveLength(8)
    expect(LOOP_STEPS).toBe(128)
    for (let step = 0; step < LOOP_STEPS; step++) {
      for (const n of notesAt(step, VARIANTS.main, 0)) if (n.voice === 'lead') expect(PENTA_SET.has(n.freq.toFixed(2))).toBe(true)
    }
    const bassBar1 = notesAt(0, VARIANTS.main, 0).find((n) => n.voice === 'bass')
    expect(bassBar1?.freq).toBeCloseTo(130.81)
  })

  it('schedules 16th steps at the variant tempo within the lookahead, and nothing while silent', () => {
    const q = new MusicSequencer()
    expect(q.schedule(0)).toEqual([])
    q.setMode('main')
    const notes = q.schedule(10, 0.5)
    const times = [...new Set(notes.map((n) => n.time))]
    expect(times[0]).toBeCloseTo(10.05)
    const sp = stepSeconds(112)
    for (const t of times) expect(Math.abs((t - times[0]) / sp - Math.round((t - times[0]) / sp))).toBeLessThan(1e-6)
    expect(times.length).toBeGreaterThan(1)
    expect(Math.max(...times)).toBeLessThan(10.5)
    expect(notes.every((n) => n.gain > 0 && n.freq > 0)).toBe(true)
    q.setMode('final')
    const fast = q.schedule(10.5, 0.5)
    const ft = [...new Set(fast.map((n) => n.time))]
    expect(ft[1] - ft[0]).toBeCloseTo(stepSeconds(128))
    expect(fast.some((n) => n.voice === 'high')).toBe(true)
    q.setMode('silent')
    expect(q.schedule(11)).toEqual([])
  })

  it('re-aligns instead of replaying history after a long gap', () => {
    const q = new MusicSequencer()
    q.setMode('main')
    q.schedule(0, 0.25)
    const later = q.schedule(30, 0.25)
    expect(Math.min(...later.map((n) => n.time))).toBeGreaterThanOrEqual(30)
  })
})
