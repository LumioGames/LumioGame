import { describe, expect, it } from 'vitest'
import { BlockType, BombKind, CHARACTER_ORDER, DEFAULT_CONFIG, DEFAULT_RULES, MatchPhase, PickupKind, 方向, type CharacterId } from '../../contract'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard } from '../../../tests/support/pierce-cases'
import { hatCountOf } from '../death-drops'
import { hashWorld } from '../hash'
import { removePlayerFromWorld } from '../hats'
import { rankInputsOf, simMatchResults } from '../results'
import { LocalSim } from '../local-sim'
import { startMatch } from '../match-phase'
import { gridProbe, makeBomb, makePickup, newId, type SimFireWall, type SimSkillSlot, type World } from '../world'
import { addBomb, BOMB, cell, evs, giveLevels, makeWorld, mv, player, put, run, SKILL, specs, startCircle, step } from './helpers'

/**
 * 第 4 轮数据模型（原型扩展 NON-CONTRACT，ADR 0030 / 0031）：新状态全部进哈希、角色分配、快照发布、step 分派。
 * 这里只测 W0 的地基；技能行为本身归技能切片。
 */

type Bag = Record<string, unknown>

/** 把一个标量改成「不同的合法值」。 */
function flip(key: string, v: unknown): unknown {
  if (typeof v === 'number') return v + 1
  if (typeof v === 'boolean') return !v
  if (key === 'pick' || key === 'character') return v === 'bear' ? 'duck' : 'bear'
  if (key === 'skill') return v === 'kick' ? 'bubble' : 'kick'
  if (Array.isArray(v)) return [...v, 7]
  throw new Error(`flip: no rule for ${key} = ${String(v)}`)
}

function expectEveryFieldHashed(w: World, obj: Bag, skip: readonly string[], label: string): void {
  const h0 = hashWorld(w)
  for (const k of Object.keys(obj)) {
    if (skip.includes(k)) continue
    const old = obj[k]
    obj[k] = flip(k, old)
    expect(hashWorld(w), `${label}.${k} is not hashed`).not.toBe(h0)
    obj[k] = old
  }
  expect(hashWorld(w)).toBe(h0)
}

function richWorld(): World {
  const w = makeWorld({ players: 3, picks: ['cat', 'auto', null] })
  put(w, 1, 3, 3)
  put(w, 2, 7, 7)
  put(w, 3, 11, 11)
  w.bombs.push(makeBomb({ id: newId(w), owner: 1, cell: cell(w, 5, 5), bornTick: w.t, fuseEndTick: w.t + 40, power: 2 }))
  w.pickups.push(makePickup({ id: newId(w), cell: cell(w, 9, 9), kind: PickupKind.SkillCandy, bornTick: w.t, droppedBy: 0, skill: 'kick', level: 1 }))
  w.fireWalls.push({ id: newId(w), owner: 1, cells: [cell(w, 3, 3), cell(w, 4, 3)], bornTick: w.t, untilTick: w.t + 40 })
  return w
}

describe('hash covers every round-4 field (reflective)', () => {
  it('SimPlayer: every scalar except spec / name / animal; every slot', () => {
    const w = richWorld()
    for (const p of w.players) expectEveryFieldHashed(w, p as unknown as Bag, ['spec', 'name', 'animal', 'slots'], `player${p.id}`)
    const p = player(w, 1)
    const h0 = hashWorld(w)
    for (const s of ['bomb', 'active', 'passive'] as const) {
      const old = p.slots[s]
      const alt: SimSkillSlot = old ? { ...old, level: old.level + 1 } : { skill: 'kick', level: 1, bound: false, parts: null }
      p.slots[s] = alt
      expect(hashWorld(w), `slot ${s}`).not.toBe(h0)
      if (old) {
        p.slots[s] = { ...old, bound: !old.bound }
        expect(hashWorld(w), `slot ${s}.bound`).not.toBe(h0)
        p.slots[s] = { ...old, parts: [{ skill: 'blink', level: 1, bound: true }] }
        expect(hashWorld(w), `slot ${s}.parts`).not.toBe(h0)
      }
      p.slots[s] = old
    }
    expect(hashWorld(w)).toBe(h0)
  })

  it('SimBomb, SimPickup, fire walls, pending skill drops, skill / roster rng', () => {
    const w = richWorld()
    expectEveryFieldHashed(w, w.bombs[0] as unknown as Bag, [], 'bomb')
    expectEveryFieldHashed(w, w.pickups[0] as unknown as Bag, [], 'pickup')
    const h0 = hashWorld(w)
    const wall = w.fireWalls[0]
    for (const k of Object.keys(wall) as (keyof SimFireWall)[]) {
      w.fireWalls[0] = { ...wall, [k]: flip(k, wall[k]) } as SimFireWall
      expect(hashWorld(w), `fireWall.${k}`).not.toBe(h0)
    }
    w.fireWalls[0] = wall
    w.pendingDeaths.push({ victim: 2, killer: 1, tick: w.t, dropKinds: [], dropSkills: [] })
    const h1 = hashWorld(w)
    w.pendingDeaths[0] = { ...w.pendingDeaths[0], dropSkills: [{ slot: 'passive', skill: 'kick', level: 1, keep: null }] }
    expect(hashWorld(w)).not.toBe(h1)
    w.pendingDeaths = []
    expect(hashWorld(w)).toBe(h0)
    for (const k of ['skill', 'roster'] as const) {
      const saved = w.rng[k]
      w.rng[k] = saved.clone()
      w.rng[k].NextInt(0, 10)
      expect(hashWorld(w), `rng.${k}`).not.toBe(h0)
      w.rng[k] = saved
    }
    expect(hashWorld(w)).toBe(h0)
  })
})

describe('characters are opt-in; roster', () => {
  it('legacy specs(n): no character, empty slots, meta = spec', () => {
    const w = makeWorld({ players: 3 })
    const f = step(w)
    for (const p of w.players) {
      expect(p.pick).toBeNull()
      expect(p.character).toBeNull()
      expect(p.slots).toEqual({ bomb: null, active: null, passive: null })
    }
    const s = specs(3)
    f.snapshot.Players.forEach((pv, i) => {
      expect(pv.meta).toEqual({ name: s[i].name, isBot: s[i].isBot, animal: s[i].animal, slot: s[i].slot })
      expect(pv.skills?.character).toBeNull()
      expect(pv.eliminatedTick).toBe(0)
    })
  })

  it('1 fixed + 7 auto → 2 of each; same seed same roster; unique names; the human keeps its name', () => {
    const picks: ('cat' | 'auto')[] = ['cat', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
    const a = makeWorld({ players: 8, picks, seed: 5 })
    const b = makeWorld({ players: 8, picks, seed: 5 })
    const count = new Map<CharacterId, number>()
    for (const p of a.players) count.set(p.character!, (count.get(p.character!) ?? 0) + 1)
    for (const c of CHARACTER_ORDER) expect(count.get(c)).toBe(2)
    expect(a.players.map((p) => p.character)).toEqual(b.players.map((p) => p.character))
    expect(new Set(a.players.map((p) => p.name)).size).toBe(8)
    expect(player(a, 1).name).toBe('P0')
    expect(player(a, 1).animal).toBe('cat')
    for (const p of a.players) expect(p.animal).toBe(a.rules.characters[p.character!].animal)
  })

  it('bots are re-drawn each match for some seed in 1..20', () => {
    const picks: ('rabbit' | 'auto')[] = ['rabbit', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
    let changed = false
    for (let seed = 1; seed <= 20 && !changed; seed++) {
      const w = makeWorld({ players: 8, picks, seed })
      const m0 = w.players.map((p) => p.character).join()
      startMatch(w, 1)
      changed = w.players.map((p) => p.character).join() !== m0
    }
    expect(changed).toBe(true)
  })

  it('exclusive skill at Lv1, bound, in its slot; skills never count as hats (D5)', () => {
    const w = makeWorld({ players: 4, picks: ['rabbit', 'duck', 'cat', 'bear'] })
    expect(player(w, 1).slots.passive).toEqual({ skill: 'regen', level: 1, bound: true, parts: null })
    expect(player(w, 2).slots.active).toEqual({ skill: 'bubble', level: 1, bound: true, parts: null })
    expect(player(w, 3).slots.active?.skill).toBe('blink')
    expect(player(w, 4).slots.active?.skill).toBe('fireAura')
    for (const p of w.players) expect(hatCountOf(w, p)).toBe(0)
    const f = step(w)
    expect(f.snapshot.Players.map((p) => p.BomberPlayerState.HatCount)).toEqual([0, 0, 0, 0])
    expect(f.snapshot.Players[0].skills?.slots.passive).toEqual({ skill: 'regen', level: 1, bound: true })
    expect(f.snapshot.Players[0].meta.name).toBe('P0')
    expect(f.snapshot.Players[3].meta.animal).toBe('bear')
  })

  it('setPick takes effect only at the next match', () => {
    const sim = new LocalSim({ seed: 3, config: DEFAULT_CONFIG, rules: { ...DEFAULT_RULES, playerCount: 2 }, players: specs(2, ['rabbit', 'auto']) })
    sim.setPick(0, 'bear')
    const f = sim.step(new Map())
    expect(f.snapshot.Players[0].skills?.character).toBe('rabbit')
  })
})

describe('snapshot publishing', () => {
  it('FireZones: [] by default; an aura and a wall show up in order; results only in Settlement', () => {
    const w = makeWorld({ players: 2, picks: ['bear', null] })
    put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    let f = step(w)
    expect(f.snapshot.FireZones).toEqual([])
    expect(f.snapshot.match.results).toBeNull()
    player(w, 1).auraUntilTick = w.t + 10
    w.fireWalls.push({ id: newId(w), owner: 2, cells: [cell(w, 9, 9)], bornTick: w.t, untilTick: w.t + 5 })
    f = step(w)
    const z = f.snapshot.FireZones!
    expect(z.map((q) => q.source)).toEqual(['aura', 'firewall'])
    expect(z[0].owner).toBe(1)
    // (5,5) 周围：(4,4)(6,4)(4,6)(6,6) 是铁皮柱。
    expect(z[0].cells).toHaveLength(5)
    expect(z[1].cells).toEqual([{ X: 9, Y: 9 }])
  })

  it('bomb kind / pierce / kick and pickup skill are published', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const b = makeBomb({ id: newId(w), owner: 1, cell: cell(w, 5, 5), bornTick: w.t, fuseEndTick: w.t + 40, power: 2, kind: BombKind.Pierce, pierceLayers: 2 })
    b.kickDir = 方向.右
    b.kickCellsLeft = 2
    b.kickAcc = 400
    w.bombs.push(b)
    w.pickups.push(makePickup({ id: newId(w), cell: cell(w, 9, 9), kind: PickupKind.SkillCandy, bornTick: w.t, droppedBy: 0, skill: 'blink', level: 2 }))
    const f = step(w)
    const bv = f.snapshot.Bombs[0]
    expect(bv.BomberBombState.BombKind).toBe(BombKind.Pierce)
    expect(bv.BomberBombState.PierceLayers).toBe(2)
    // advanceKickedBombs 已跑一步：400 + kickMilliPerTick（< 1000，未前进一格）。
    expect(bv.kick).toEqual({ dir: 方向.右, progressMilli: 400 + w.ticks.kickMilliPerTick, cellsLeft: 2, speedMilli: DEFAULT_RULES.kickSpeedMilli })
    expect(f.snapshot.Pickups[0].skill).toEqual({ id: 'blink', level: 2 })
  })

  it('eliminatedTick = the death tick; results after settlement rank the survivor first', () => {
    const w = makeWorld({ players: 2 })
    put(w, 1, 9, 9)
    put(w, 2, 9, 11)
    startCircle(w)
    step(w)
    const deathTick = w.t
    player(w, 2).health = 0
    w.pendingDeaths.push({ victim: 2, killer: 1, tick: deathTick, dropKinds: [], dropSkills: [] })
    step(w)
    const f = step(w)
    expect(player(w, 2).eliminatedTick).toBe(deathTick)
    expect(w.match.phase).toBe(MatchPhase.Settlement)
    const r = f.snapshot.match.results!
    expect(r.reason).toBe('lastSurvivor')
    expect(r.winner).toBe(1)
    expect(r.rows.map((x) => [x.id, x.rank, x.survived, x.eliminatedTick])).toEqual([
      [1, 1, true, 0],
      [2, 2, false, deathTick],
    ])
    expect(f.snapshot.Players[1].eliminatedTick).toBe(deathTick)
  })

  it('leaving during the final circle = eliminated at the leave tick: the leaver keeps a hashed row in the results (design §4.2)', () => {
    const w = makeWorld({ players: 4 })
    put(w, 1, 9, 9)
    put(w, 2, 9, 11)
    put(w, 3, 11, 9)
    put(w, 4, 7, 9)
    giveLevels(w, 4, 1, 1, 1)
    // 常规阶段退出不进名次表。
    const runner = makeWorld({ players: 3 })
    removePlayerFromWorld(runner, 3)
    expect(runner.departed ?? []).toEqual([])
    expect(rankInputsOf(runner).map((r) => r.id)).toEqual([1, 2])

    startCircle(w)
    step(w)
    const deathTick = w.t
    player(w, 3).health = 0
    w.pendingDeaths.push({ victim: 3, killer: 1, tick: deathTick, dropKinds: [], dropSkills: [] })
    step(w)
    expect(player(w, 3).eliminated).toBe(true)
    run(w, 5)
    const leaveTick = w.t
    expect(leaveTick).toBeGreaterThan(deathTick)
    const h0 = hashWorld(w)
    expect(removePlayerFromWorld(w, 4)).toBe(true)
    // 已出局的旁观者退出也保留原来的出局 Tick。
    expect(removePlayerFromWorld(w, 3)).toBe(true)
    expect(w.players.map((p) => p.id)).toEqual([1, 2])
    expect(w.departed).toEqual([
      { match: w.match.index, id: 4, eliminated: true, eliminatedTick: leaveTick, hats: 3 },
      { match: w.match.index, id: 3, eliminated: true, eliminatedTick: deathTick, hats: 0 },
    ])
    // 退出记录进哈希：逐字段改一下哈希都变。
    const h1 = hashWorld(w)
    expect(h1).not.toBe(h0)
    const d = w.departed![0] as unknown as Record<string, unknown>
    for (const k of Object.keys(d)) {
      const was = d[k]
      d[k] = typeof was === 'boolean' ? !was : (was as number) + 1
      expect(hashWorld(w), k).not.toBe(h1)
      d[k] = was
    }
    expect(hashWorld(w)).toBe(h1)

    w.match.endTick = w.t + 1
    const f = step(w)
    expect(w.match.phase).toBe(MatchPhase.Settlement)
    const r = f.snapshot.match.results!
    expect(r.reason).toBe('timeUp')
    expect(r.rows.map((x) => [x.id, x.survived, x.eliminatedTick, x.place])).toEqual([
      [1, true, 0, 1],
      [2, true, 0, 2],
      [4, false, leaveTick, 3],
      [3, false, deathTick, 4],
    ])
    expect(r.rows.find((x) => x.id === 4)!.hats).toBe(3)
    expect(simMatchResults(w)).toEqual(r)

    // 结算期退出：名次表冻结，存活者仍是存活者。
    expect(removePlayerFromWorld(w, 2)).toBe(true)
    expect(simMatchResults(w)).toEqual(r)

    // 下一局不再带上一局的退出者。
    startMatch(w, w.match.index + 1)
    expect(rankInputsOf(w).map((x) => x.id)).toEqual([1])
  })
})

describe('step dispatch', () => {
  it('技能 never places a bomb (the old step.ts:60 fall-through)', () => {
    const w = makeWorld({ picks: ['duck', null] })
    put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    const f = step(w, { 1: [mv(方向.停), SKILL] })
    expect(evs(f, 'BombPlaced')).toHaveLength(0)
    expect(w.bombs).toHaveLength(0)
    expect(player(w, 1).capacity).toBe(DEFAULT_CONFIG.initialBombCapacity)
  })

  it('a frozen player ignores every input; a skill press reports SkillFailed(frozen)', () => {
    const w = makeWorld({ picks: ['cat', null] })
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    p.frozenUntilTick = w.t + 5
    p.turnBuf = 3
    p.pendingDir = 方向.下
    const f = step(w, { 1: [mv(方向.右, true), BOMB, SKILL] })
    expect(p.mx).toBe(5500)
    expect(p.my).toBe(5500)
    expect(p.facing).toBe(方向.下)
    expect(p.turnBuf).toBe(0)
    expect(evs(f, 'BombPlaced')).toHaveLength(0)
    expect(evs(f, 'SkillFailed')).toMatchObject([{ PlayerNetEntityIdRaw: 1, Skill: 'blink', Reason: 'frozen' }])
  })

  it('facing follows the raw non-stop input even when blocked; 停 keeps it', () => {
    const w = makeWorld()
    const p = put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    w.brick[cell(w, 2, 1)] = BlockType.积木
    step(w, { 1: [mv(方向.右)] })
    expect(p.mx).toBe(1500)
    expect(p.facing).toBe(方向.右)
    step(w, { 1: [mv(方向.停)] })
    expect(p.facing).toBe(方向.右)
  })

  it('makeBomb / makePickup defaults; gridProbe sees bombs and chests', () => {
    const w = makeWorld()
    const b = makeBomb({ id: 99, owner: 1, cell: 20, bornTick: 0, fuseEndTick: 42, power: 2 })
    expect(b).toMatchObject({ kind: BombKind.Standard, pierceLayers: 0, freezeTicks: 0, toxinTicks: 0, shockTicks: 0, slowPermille: 0, kickDir: 方向.停, kickCellsLeft: 0, kickAcc: 0, kickedBy: 0, covered: [], hit: [] })
    expect(makePickup({ id: 1, cell: 2, kind: PickupKind.FirePlus, bornTick: 0, droppedBy: 0 })).toMatchObject({ skill: null, level: 0 })
    expect(makePickup({ id: 1, cell: 2, kind: PickupKind.SkillCandy, bornTick: 0, droppedBy: 0, skill: 'kick' })).toMatchObject({ skill: 'kick', level: 1 })
    addBomb(w, 1, 5, 5, 40)
    const g = gridProbe(w)
    expect(g.occupied(cell(w, 5, 5))).toBe(true)
    expect(g.occupied(cell(w, 5, 7))).toBe(false)
  })

  it('tick table converts the skill levels', () => {
    const w = makeWorld()
    expect(w.ticks.skills.blink[0].cd).toBe(240)
    expect(w.ticks.skills.bubble[0]).toMatchObject({ duration: 60, cd: 360 })
    expect(w.ticks.skills.fireAura[0]).toMatchObject({ duration: 80, cd: 400 })
    expect(w.ticks.skills.regen[0].interval).toBe(200)
    expect(w.ticks.skills.freezeBomb.map((r) => r.freeze)).toEqual([16, 20, 24])
    expect(w.ticks.burnInterval).toBe(20)
    expect(w.ticks.freezeCap).toBe(24)
    expect(w.ticks.kickMilliPerTick).toBe(400)
    expect(w.ticks.ringStages.map((s) => s.at)).toEqual([200, 700, 1100, 1500, 1900, 2200])
  })
})

describe('pierce fixtures agree with explosion.ts for standard bombs', () => {
  it.each(PIERCE_CASES.filter((c) => c.pierceLayers === 0).map((c) => [c.name, c] as const))('%s', (_, c) => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const board = parsePierceBoard(c.rows)
    const ox = 5
    const oy = 5
    for (let y = 0; y < board.size; y++)
      for (let x = 0; x < board.size; x++) {
        w.brick[cell(w, x + ox, y + oy)] = board.brick[y * board.size + x]
        w.ground[cell(w, x + ox, y + oy)] = board.ground[y * board.size + x]
      }
    const b = addBomb(w, 1, PIERCE_BOMB.x + ox, PIERCE_BOMB.y + oy, 1, c.power)
    const f = step(w)
    const back = (i: number) => `${(i % w.size) - ox},${Math.floor(i / w.size) - oy}`
    expect(b.covered.map(back).sort()).toEqual(c.covered.map(([x, y]) => `${x},${y}`).sort())
    expect([b.reachUp, b.reachDown, b.reachLeft, b.reachRight]).toEqual(c.reach)
    expect(evs(f, 'BrickDestroyed').map((e) => `${e.Cell.X - ox},${e.Cell.Y - oy}`).sort()).toEqual(c.bricks.map(([x, y]) => `${x},${y}`).sort())
  })
})
