import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHARACTER_ORDER,
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  MatchPhase,
  PickupKind,
  方向,
  type AbilityActivation,
  type BomberConfig,
  type CharacterId,
  type TickFrame,
  type U64,
} from '../src/contract'
import { LocalHost, type LocalHostOptions } from '../src/app/local-host'
import { LocalSim } from '../src/sim/local-sim'

/** 宿主管线（原型扩展 ADR 0030）：选角、AI 难度、技能键锁存、副方向透传、自动驾驶、换角色、开发糖。 */
function host(over: Partial<LocalHostOptions> = {}, config: BomberConfig = DEFAULT_CONFIG): { h: LocalHost; frames: TickFrame[] } {
  const botCount = over.botCount ?? 7
  const h = new LocalHost({ seed: 11, config, rules: { ...DEFAULT_RULES, playerCount: botCount + 1 }, botCount, ...over })
  const frames: TickFrame[] = []
  h.subscribe((f) => frames.push(f))
  return { h, frames }
}

const last = (frames: readonly TickFrame[]) => frames[frames.length - 1].snapshot

/** 抓每个 Tick 送进规则替身的本机输入。 */
function captureLocal(localId: U64): AbilityActivation[][] {
  const seen: AbilityActivation[][] = []
  const orig = LocalSim.prototype.step
  vi.spyOn(LocalSim.prototype, 'step').mockImplementation(function (this: LocalSim, inputs) {
    seen.push([...(inputs.get(localId) ?? [])])
    return orig.call(this, inputs)
  })
  return seen
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LocalHost characters and AI', () => {
  it('defaults: ai = normal, you are the rabbit, bots get balanced characters', () => {
    const { h, frames } = host()
    expect(h.ai).toBe('normal')
    const s = last(frames)
    const me = s.Players.find((p) => p.NetEntityIdRaw === h.localPlayerId)!
    expect(me.skills?.character).toBe('rabbit')
    expect(me.meta.name).toBe('你')
    expect(me.meta.animal).toBe('rabbit')
  })

  it("localCharacter 'cat' → 2/2/2/2 with unique names; animals follow characters", () => {
    const { h, frames } = host({ localCharacter: 'cat', ai: 'easy' })
    expect(h.ai).toBe('easy')
    const s = last(frames)
    const count = new Map<CharacterId, number>()
    for (const p of s.Players) count.set(p.skills!.character!, (count.get(p.skills!.character!) ?? 0) + 1)
    for (const c of CHARACTER_ORDER) expect(count.get(c)).toBe(2)
    expect(new Set(s.Players.map((p) => p.meta.name)).size).toBe(8)
    for (const p of s.Players) expect(p.meta.animal).toBe(p.skills!.character)
    expect(s.Players.find((p) => p.NetEntityIdRaw === h.localPlayerId)!.skills!.character).toBe('cat')
  })

  it("botCharacters 'none' keeps the round-3 animals and names for bots", () => {
    const { frames } = host({ botCharacters: 'none' })
    const bots = last(frames).Players.filter((p) => p.meta.isBot)
    expect(bots.map((p) => p.meta.animal)).toEqual(['duck', 'bear', 'cat', 'frog', 'penguin', 'pig', 'dog'])
    expect(bots[0].meta.name).toBe('小黄鸭')
    for (const p of bots) expect(p.skills?.character).toBeNull()
  })

  it('setLocalCharacter applies at the next MatchStarted, not before', () => {
    const { h, frames } = host({ botCount: 1 }, { ...DEFAULT_CONFIG, matchDurationMs: 20000 })
    h.setLocalCharacter('bear')
    h.stepTicks(900)
    const at = frames.findIndex((f) => f.events.some((e) => e.type === 'MatchStarted' && e.MatchIndex === 1))
    expect(at).toBeGreaterThan(0)
    const mine = (f: TickFrame) => f.snapshot.Players.find((p) => p.NetEntityIdRaw === h.localPlayerId)!.skills!.character
    expect(mine(frames[at - 1])).toBe('rabbit')
    expect(mine(frames[at])).toBe('bear')
  })
})

describe('LocalHost input plumbing', () => {
  it('a skill press is delivered exactly once per latch and never places a bomb', () => {
    const { h, frames } = host({ botCount: 1, localCharacter: 'duck' })
    const seen = captureLocal(h.localPlayerId)
    h.stepTicks(70) // 过开局倒数
    h.sendInput({ ability: '技能' })
    h.sendInput({ ability: '技能' })
    h.stepTicks(5)
    const skills = seen.flat().filter((a) => a.ability === '技能')
    expect(skills).toHaveLength(1)
    expect(seen.flat().some((a) => a.ability === '放弹')).toBe(false)
    expect(frames.flatMap((f) => f.events).some((e) => e.type === 'BombPlaced' && e.OwnerNetEntityIdRaw === h.localPlayerId)).toBe(false)
    // 暂停清掉锁存。
    h.sendInput({ ability: '技能' })
    h.setPaused(true)
    h.setPaused(false)
    h.stepTicks(2)
    expect(seen.flat().filter((a) => a.ability === '技能')).toHaveLength(1)
  })

  it('副方向 passes through and survives until the next move input; the tap fallback carries none', () => {
    const { h } = host({ botCount: 1 })
    const seen = captureLocal(h.localPlayerId)
    h.sendInput({ ability: '移动', 输入: { 方向: 方向.右, 按了转弯: true, 副方向: 方向.下 } })
    h.stepTicks(2)
    expect(seen[0][0]).toEqual({ ability: '移动', 输入: { 方向: 方向.右, 按了转弯: true, 副方向: 方向.下 } })
    expect(seen[1][0]).toEqual({ ability: '移动', 输入: { 方向: 方向.右, 按了转弯: false, 副方向: 方向.下 } })
    h.sendInput({ ability: '移动', 输入: { 方向: 方向.上, 按了转弯: true } })
    h.sendInput({ ability: '移动', 输入: { 方向: 方向.停, 按了转弯: false } })
    h.stepTicks(1)
    expect(seen[2][0]).toEqual({ ability: '移动', 输入: { 方向: 方向.上, 按了转弯: true } })
  })

  it('autopilot drives slot 0 and ignores sendInput', () => {
    const { h, frames } = host({ botCount: 3, localAutopilot: { profile: 'player' } })
    const start = last(frames).Players.find((p) => p.NetEntityIdRaw === h.localPlayerId)!.LogicTransform.WorldPosition
    h.sendInput({ ability: '放弹' })
    h.stepTicks(60 + 100)
    const moved = frames.some((f) => {
      const p = f.snapshot.Players.find((q) => q.NetEntityIdRaw === h.localPlayerId)!.LogicTransform.WorldPosition
      return p.x !== start.x || p.z !== start.z
    })
    expect(moved).toBe(true)
  })

  it('devSpawnSkillCandies drops one candy per running tick at your feet (hashed like any pickup)', () => {
    const { h, frames } = host({ botCount: 1 })
    h.stepTicks(65)
    expect(last(frames).BomberMatchState.Phase).toBe(MatchPhase.Running)
    h.devSpawnSkillCandies(['kick', 'pierceBomb'])
    h.stepTicks(2)
    const spawned = frames.flatMap((f) => f.events).filter((e) => e.type === 'PickupSpawned' && e.Kind === PickupKind.SkillCandy)
    expect(spawned.map((e) => (e.type === 'PickupSpawned' ? [e.Skill, e.SkillLevel, e.Source] : null))).toEqual([
      ['kick', 1, 'crate'],
      ['pierceBomb', 1, 'crate'],
    ])
  })
})
