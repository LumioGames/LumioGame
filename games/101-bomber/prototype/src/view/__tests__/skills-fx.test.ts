import { describe, expect, it } from 'vitest'
import {
  BlockType,
  BombKind,
  DEFAULT_RULES,
  方向,
  type BombView,
  type ChestView,
  type PlayerSkillsView,
  type PlayerView,
  type SkillSlotView,
  type WorldSnapshot,
} from '../../contract'
import { auraCells } from '../../shared/skill-geometry'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard } from '../../../tests/support/pierce-cases'
import { canPreviewBomb, computeFireCross } from '../logic/fire-preview'
import { effectiveDetonationTicks } from '../logic/detonation'
import { finalCellOf, fogCells, forEachRingDash } from '../logic/ring'
import {
  auraFlameOffsets,
  blinkLanding,
  bombStyle,
  bubbleAlpha,
  comboOf,
  fireFade,
  kickedPos,
  lerpKicked,
  newCombos,
  SKILL_FX,
  snapshotProbe,
  teleportKind,
} from '../logic/skill-fx'
import { CHEST_POOL } from '../world/chests'

const RATE = 20
const SIZE = 9
const skills = DEFAULT_RULES.skills

function slot(skill: SkillSlotView['skill'], level = 1, bound = false): SkillSlotView {
  return { skill, level, bound }
}

function sk(over: Partial<PlayerSkillsView> = {}): PlayerSkillsView {
  return {
    character: 'cat',
    facing: 方向.右,
    slots: { bomb: null, active: slot('blink', 1, true), passive: null },
    cdFromTick: 0,
    cdUntilTick: 0,
    bubbleUntilTick: 0,
    auraUntilTick: 0,
    frozenUntilTick: 0,
    regenFromTick: 0,
    regenNextTick: 0,
    blinkTick: 0,
    ...over,
  }
}

function player(x: number, y: number, s: PlayerSkillsView | undefined, hp = 6): PlayerView {
  return {
    NetEntityIdRaw: 1,
    LogicTransform: { WorldPosition: { x: x + 0.5, y: 1, z: y + 0.5 } },
    teleportTick: 0,
    BomberPlayerState: { HatCount: 0, RespawnAtTick: 0, ProtectedUntilTick: 0 },
    玩家属性: { 血量当前: hp, 火力当前: 2, 移速当前: 3500, 手上炸弹数当前: 1 },
    meta: { name: 'p', isBot: false, animal: 'cat', slot: 0 },
    eliminated: false,
    skills: s,
  }
}

function bomb(x: number, y: number, exploded = 0): BombView {
  return {
    NetEntityIdRaw: 50 + x * 10 + y,
    LogicTransform: { WorldPosition: { x: x + 0.5, y: 1, z: y + 0.5 } },
    teleportTick: 0,
    BomberBombState: {
      OwnerNetEntityIdRaw: 1,
      FuseEndTick: 100,
      Power: 2,
      ChainId: 0,
      BombKind: BombKind.Standard,
      PierceLayers: 0,
      ExplodedAtTick: exploded,
      DangerUntilTick: 0,
      BurnUntilTick: 0,
      ReachUp: 0,
      ReachDown: 0,
      ReachLeft: 0,
      ReachRight: 0,
    },
  }
}

function chest(x: number, y: number): ChestView {
  return {
    NetEntityIdRaw: 900,
    LogicTransform: { WorldPosition: { x: x + 0.5, y: 1, z: y + 0.5 } },
    teleportTick: 0,
    chest: { HitsLeft: 3, HitsRequired: 3, StageIndex: 0 },
  }
}

function snap(o: { tick?: number; players?: PlayerView[]; bombs?: BombView[]; chests?: ChestView[]; bricks?: [number, number, number][] }): WorldSnapshot {
  const brick = new Uint8Array(SIZE * SIZE)
  for (const [x, y, b] of o.bricks ?? []) brick[y * SIZE + x] = b
  return {
    Tick: o.tick ?? 100,
    Players: o.players ?? [],
    Bombs: o.bombs ?? [],
    Chests: o.chests ?? [],
    HatPiles: [],
    Pickups: [],
    Terrain: { size: SIZE, ground: new Uint8Array(SIZE * SIZE).fill(BlockType.地面), brick, rev: 0 },
  } as unknown as WorldSnapshot
}

describe('bomb style', () => {
  it('maps kind + pierce to the four looks', () => {
    expect(bombStyle(BombKind.Standard, 0)).toBe('standard')
    expect(bombStyle(BombKind.Freeze, 0)).toBe('frost')
    expect(bombStyle(BombKind.Pierce, 1)).toBe('pierce')
    expect(bombStyle(BombKind.Standard, 2)).toBe('pierce')
    expect(bombStyle(BombKind.Freeze, 1)).toBe('glacier')
  })
})

describe('kicked bomb interpolation', () => {
  it('offsets the logical cell centre by the slide progress', () => {
    const p = kickedPos(3.5, 4.5, { dir: 方向.右, progressMilli: 400, cellsLeft: 2, speedMilli: 8000 })
    expect(p.x).toBeCloseTo(3.9)
    expect(p.z).toBeCloseTo(4.5)
    const up = kickedPos(3.5, 4.5, { dir: 方向.上, progressMilli: 250, cellsLeft: 2, speedMilli: 8000 })
    expect(up.z).toBeCloseTo(4.25)
    expect(kickedPos(3.5, 4.5, null)).toEqual({ x: 3.5, z: 4.5 })
  })
  it('lerps between frames and snaps on a jump of 2 cells or when there is no previous frame', () => {
    const out = { x: 0, z: 0 }
    expect(lerpKicked({ x: 3.5, z: 4.5 }, { x: 3.9, z: 4.5 }, 0.5, out).x).toBeCloseTo(3.7)
    expect(lerpKicked({ x: 3.5, z: 4.5 }, { x: 5.5, z: 4.5 }, 0.5, out).x).toBeCloseTo(5.5)
    expect(lerpKicked(null, { x: 1, z: 2 }, 0.2, out)).toEqual({ x: 1, z: 2 })
  })
})

describe('teleport kind (blink is never mistaken for a respawn)', () => {
  it('blink via blinkTick === teleportTick', () => {
    expect(teleportKind(10, { teleportTick: 40, blinkTick: 40, hp: 6, eliminated: false }, 6)).toBe('blink')
  })
  it('blink via the alive-to-alive fallback when blinkTick is missing', () => {
    expect(teleportKind(10, { teleportTick: 40, hp: 4, eliminated: false }, 4)).toBe('blink')
  })
  it('respawn after hp 0, and first sight', () => {
    expect(teleportKind(10, { teleportTick: 60, blinkTick: 40, hp: 6, eliminated: false }, 0)).toBe('respawn')
    expect(teleportKind(undefined, { teleportTick: 0, blinkTick: 0, hp: 6, eliminated: false }, undefined)).toBe('first')
  })
  it('blink when blinkTick advances even if the sim did not bump teleportTick', () => {
    expect(teleportKind(40, { teleportTick: 40, blinkTick: 55, hp: 6, eliminated: false }, 6, 30)).toBe('blink')
    expect(teleportKind(40, { teleportTick: 40, blinkTick: 55, hp: 6, eliminated: false }, 6, 55)).toBe('none')
  })
  it('none without a jump; eliminated players never come back', () => {
    expect(teleportKind(40, { teleportTick: 40, blinkTick: 40, hp: 6, eliminated: false }, 6)).toBe('none')
    expect(teleportKind(40, { teleportTick: 70, blinkTick: 0, hp: 6, eliminated: true }, 0)).toBe('none')
  })
})

describe('fire aura / fire walls', () => {
  const probe = { size: SIZE, brick: new Uint8Array(SIZE * SIZE) }
  const cellsOf = (ci: number[]) => ci.map((c) => ({ X: c % SIZE, Y: Math.floor(c / SIZE) }))
  it('aura flames follow the owner: 9 offsets inside, clipped at the edge', () => {
    const inner = auraFlameOffsets(cellsOf(auraCells(probe, 4 * SIZE + 4)), { X: 4, Y: 4 })
    expect(inner).toHaveLength(9)
    expect(inner).toContainEqual({ dx: -1, dy: -1 })
    expect(inner).toContainEqual({ dx: 0, dy: 0 })
    const edge = auraFlameOffsets(cellsOf(auraCells(probe, 0)), { X: 0, Y: 0 })
    expect(edge).toHaveLength(4)
    expect(edge.every((o) => o.dx >= 0 && o.dy >= 0)).toBe(true)
  })
  it('fire fades over the last 0.4 s and is gone at untilTick', () => {
    expect(fireFade(200, 100, RATE)).toBe(1)
    expect(fireFade(200, 200 - SKILL_FX.fireFadeSec * RATE * 0.5, RATE)).toBeCloseTo(0.5)
    expect(fireFade(200, 200, RATE)).toBe(0)
    expect(fireFade(200, 230, RATE)).toBe(0)
  })
})

describe('combo form', () => {
  it('comboOf finds the combo in any slot, active first', () => {
    expect(comboOf(undefined, skills)).toBeNull()
    expect(comboOf(sk(), skills)).toBeNull()
    expect(comboOf(sk({ slots: { bomb: slot('glacierBomb'), active: slot('fireDash', 1, true), passive: null } }), skills)).toBe('fireDash')
    expect(comboOf(sk({ slots: { bomb: slot('glacierBomb'), active: null, passive: null } }), skills)).toBe('glacierBomb')
  })
  it('newCombos reports only combos that just appeared', () => {
    const before = sk({ slots: { bomb: null, active: slot('blink', 1, true), passive: null } })
    const after = sk({ slots: { bomb: null, active: slot('fireDash', 1, true), passive: null } })
    expect(newCombos(before, after, skills)).toEqual(['fireDash'])
    expect(newCombos(after, after, skills)).toEqual([])
    expect(newCombos(undefined, undefined, skills)).toEqual([])
  })
})

describe('blink landing preview', () => {
  it('snapshotProbe marks unexploded bombs and chests as occupied', () => {
    const p = snapshotProbe(snap({ bombs: [bomb(2, 3), bomb(5, 5, 90)], chests: [chest(6, 1)] }))
    expect(p.occupied(3 * SIZE + 2)).toBe(true)
    expect(p.occupied(5 * SIZE + 5)).toBe(false)
    expect(p.occupied(1 * SIZE + 6)).toBe(true)
    expect(p.occupied(0)).toBe(false)
  })
  it('lands beyond a brick when ready, same scan as the sim; null when not ready', () => {
    const me = player(1, 4, sk())
    const s = snap({ players: [me], bricks: [[2, 4, BlockType.积木]] })
    const r = blinkLanding(s, me, DEFAULT_RULES)
    expect(r?.landing).toEqual({ X: 4, Y: 4 })
    // 火墙格 = 起点 + 途经的空格（不含落点，也不含砖格）。
    expect(r?.path).toEqual([
      { X: 1, Y: 4 },
      { X: 3, Y: 4 },
    ])
    const cooling = player(1, 4, sk({ cdUntilTick: 150 }))
    expect(blinkLanding(snap({ players: [cooling] }), cooling, DEFAULT_RULES)).toBeNull()
    const frozen = player(1, 4, sk({ frozenUntilTick: 150 }))
    expect(blinkLanding(snap({ players: [frozen] }), frozen, DEFAULT_RULES)).toBeNull()
    const duck = player(1, 4, sk({ slots: { bomb: null, active: slot('bubble', 1, true), passive: null } }))
    expect(blinkLanding(snap({ players: [duck] }), duck, DEFAULT_RULES)).toBeNull()
    expect(blinkLanding(snap({}), player(1, 4, undefined), DEFAULT_RULES)).toBeNull()
  })
})

describe('bubble', () => {
  it('is steady, then flickers in the last 0.6 s without vanishing, then gone', () => {
    expect(bubbleAlpha(200, 100, RATE)).toBe(SKILL_FX.bubbleAlpha)
    for (let t = 200 - SKILL_FX.bubbleFlickerSec * RATE + 1; t < 200; t++) {
      const a = bubbleAlpha(200, t, RATE)
      expect(a).toBeGreaterThan(0)
      expect(a).toBeLessThanOrEqual(SKILL_FX.bubbleAlpha)
    }
    expect(bubbleAlpha(200, 200, RATE)).toBe(0)
  })
})

describe('final circle down to 1×1', () => {
  it('fog covers the whole interior except the centre cell', () => {
    expect(fogCells(19, { Min: 9, Max: 9 }).length).toBe(17 * 17 - 1)
  })
  it('ring dashes stay on the single cell edge [9, 10]', () => {
    const pts: [number, number][] = []
    forEachRingDash({ Min: 9, Max: 9 }, 0.5, 0.3, 0, (x, z) => pts.push([x, z]))
    expect(pts.length).toBeGreaterThan(0)
    for (const [x, z] of pts) {
      expect(x).toBeGreaterThanOrEqual(9)
      expect(x).toBeLessThanOrEqual(10)
      expect(z).toBeGreaterThanOrEqual(9)
      expect(z).toBeLessThanOrEqual(10)
    }
  })
  it('the centre glow shows once the 1×1 ring is announced or active', () => {
    expect(finalCellOf(null)).toBeNull()
    expect(finalCellOf({ ring: { Min: 8, Max: 10 }, nextRing: null })).toBeNull()
    expect(finalCellOf({ ring: { Min: 8, Max: 10 }, nextRing: { Min: 9, Max: 9 } })).toEqual({ X: 9, Y: 9 })
    expect(finalCellOf({ ring: { Min: 9, Max: 9 }, nextRing: null })).toEqual({ X: 9, Y: 9 })
  })
  it('the chest pool holds every chest stage at once', () => {
    expect(CHEST_POOL).toBeGreaterThanOrEqual(DEFAULT_RULES.ringStages.filter((s) => s.chest).length)
  })
})

describe('fire preview with pierce (canonical rule, shared fixture)', () => {
  for (const c of PIERCE_CASES) {
    it(c.name, () => {
      const b = parsePierceBoard(c.rows)
      const cross = computeFireCross(b, PIERCE_BOMB.x, PIERCE_BOMB.y, c.power, undefined, new Set(b.chests), c.pierceLayers)
      expect([cross.up, cross.down, cross.left, cross.right]).toEqual([...c.reach])
      const bricks = cross.breaks.map((i) => [i % b.size, Math.floor(i / b.size)])
      expect(bricks).toEqual(expect.arrayContaining(c.bricks.map((x) => [...x])))
      expect(bricks).toHaveLength(c.bricks.length)
    })
  }
  it('pierce 1 passes one soft brick and stops at the second (the preview grows with the bomb slot)', () => {
    const b = parsePierceBoard(['.......', '.......', '.......', '....bb.', '.......', '.......', '.......'])
    expect(computeFireCross(b, 3, 3, 3).right).toBe(0)
    expect(computeFireCross(b, 3, 3, 3, undefined, undefined, 1).right).toBe(1)
  })
  it('chain prediction follows pierce too', () => {
    const b = parsePierceBoard(['.......', '.......', '.......', '....b..', '.......', '.......', '.......'])
    const t = effectiveDetonationTicks(
      [
        { id: 1, x: 3, y: 3, power: 3, fuseEndTick: 100, pierce: 1 },
        { id: 2, x: 5, y: 3, power: 1, fuseEndTick: 150 },
      ],
      b,
    )
    expect(t.get(2)).toBe(100)
  })
  it('no preview while bubbled or frozen', () => {
    const base = { alive: true, bombsInHand: 1, cellHasBomb: false, groundBlock: BlockType.地面 }
    expect(canPreviewBomb(base)).toBe(true)
    expect(canPreviewBomb({ ...base, blocked: true })).toBe(false)
  })
})
