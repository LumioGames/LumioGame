import { characterCode, pickCode, SKILL_SLOTS, skillCode } from '../contract'
import type { SimSkillSlot, World } from './world'

/**
 * StateHash（原型口径）：双路 FNV-1a 32 位，对完整权威状态的规范数列求值——含地形两层、RNG 状态、
 * 同弹命中记忆、同链伤害账、移动技能私有字段等。契约 §6.2 的 SHA-256 + Section revision 口径归引擎，
 * 这里只服务「同 Seed 同命令流逐 Tick 相同」的确定性测试（矩阵 7.1 精神）。
 */
class Fnv2 {
  private a = 0x811c9dc5
  private b = 0x050c5d1f

  byte(v: number): void {
    this.a = Math.imul(this.a ^ (v & 0xff), 0x01000193)
    this.b = Math.imul(this.b ^ (v & 0xff), 0x01000197)
  }

  u32(v: number): void {
    this.byte(v)
    this.byte(v >>> 8)
    this.byte(v >>> 16)
    this.byte(v >>> 24)
  }

  /** 整数（可为负、可超 2^32，但须 < 2^53）。 */
  n(v: number): void {
    this.u32(v | 0)
    this.u32(Math.floor(v / 4294967296) | 0)
  }

  list(vs: readonly number[]): void {
    this.n(vs.length)
    for (const v of vs) this.n(v)
  }

  bytes(arr: Uint8Array): void {
    this.n(arr.length)
    for (let i = 0; i < arr.length; i++) this.byte(arr[i])
  }

  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0')
  }
}

/** 技能槽的规范数列：空槽 [0]；否则 [技能码, 等级, 绑定, 两半数, 每半 (技能码, 等级, 绑定)…]。 */
function slotNums(s: SimSkillSlot | null): number[] {
  if (!s) return [0]
  const out = [skillCode(s.skill), s.level, s.bound ? 1 : 0, s.parts ? s.parts.length : -1]
  if (s.parts) for (const q of s.parts) out.push(skillCode(q.skill), q.level, q.bound ? 1 : 0)
  return out
}

export function hashWorld(w: World): string {
  const h = new Fnv2()
  const m = w.match
  h.list([w.t, m.index, m.startTick, m.endTick, m.phase, m.hatKing, w.rev, w.nextId, w.explodeSeq])
  h.list([w.resourceInitial])
  h.list([
    ...w.rng.drop.state(),
    ...w.rng.spawn.state(),
    ...w.rng.chest.state(),
    ...w.rng.regen.state(),
    ...w.rng.skill.state(),
    ...w.rng.roster.state(),
  ])
  const fc = w.finalCircle
  h.list(
    fc
      ? [1, fc.trigger === 'resource' ? 1 : 0, fc.startTick, fc.ring.min, fc.ring.max, fc.nextRing?.min ?? -1, fc.nextRing?.max ?? -1, fc.nextRingTick, fc.stageIndex, fc.announced]
      : [0],
  )
  h.bytes(w.ground)
  h.bytes(w.brick)
  h.n(w.players.length)
  for (const p of w.players) {
    h.list([
      p.id,
      p.spec.slot,
      p.mx,
      p.my,
      p.teleportTick,
      p.health,
      p.power,
      p.speed,
      p.capacity,
      p.respawnAtTick,
      p.protectedUntilTick,
      p.awaitingRespawn ? 1 : 0,
      p.moveAcc,
      p.lastDir,
      p.pendingDir,
      p.turnBuf,
      p.lastAssistTick,
      p.assistTol,
      p.bombBufUntil,
      p.waterTicks,
      p.poisonTicks,
      p.capacityDebt,
      p.eliminated ? 1 : 0,
      // 原型扩展（ADR 0030 / 0031）；name / animal 由角色派生，不哈希。
      p.facing,
      pickCode(p.pick),
      characterCode(p.character),
      p.cdFromTick,
      p.cdUntilTick,
      p.bubbleUntilTick,
      p.auraUntilTick,
      p.frozenUntilTick,
      p.freezeImmuneUntilTick,
      p.burnReadyTick,
      p.regenFromTick,
      p.regenNextTick,
      p.blinkTick,
      p.eliminatedTick,
    ])
    for (const slot of SKILL_SLOTS) h.list(slotNums(p.slots[slot]))
  }
  h.n(w.bombs.length)
  for (const b of w.bombs) {
    h.list([
      b.id,
      b.owner,
      b.cell,
      b.bornTick,
      b.fuseEndTick,
      b.power,
      b.chainId,
      b.explodedAtTick,
      b.dangerUntilTick,
      b.burnUntilTick,
      b.reachUp,
      b.reachDown,
      b.reachLeft,
      b.reachRight,
      b.seq,
      b.kind,
      b.pierceLayers,
      b.freezeTicks,
      b.kickDir,
      b.kickCellsLeft,
      b.kickAcc,
      b.kickedBy,
    ])
    h.list(b.covered)
    h.list(b.hit)
  }
  h.n(w.pickups.length)
  for (const it of w.pickups) h.list([it.id, it.cell, it.kind, it.bornTick, it.droppedBy, skillCode(it.skill), it.level])
  h.n(w.chests.length)
  for (const c of w.chests) {
    h.list([c.id, c.cell, c.hitsRequired, c.stageIndex, c.bornTick, c.hitsLeft, c.opener])
    h.list(c.hitBy)
  }
  h.n(w.fireWalls.length)
  for (const f of w.fireWalls) {
    h.list([f.id, f.owner, f.bornTick, f.untilTick])
    h.list(f.cells)
  }
  const chains = [...w.chainDmg.keys()].sort((a, b) => a - b)
  h.n(chains.length)
  for (const c of chains) {
    const per = w.chainDmg.get(c)!
    const ids = [...per.keys()].sort((a, b) => a - b)
    h.n(c)
    h.list(ids.flatMap((id) => [id, per.get(id)!]))
  }
  h.n(w.pendingDeaths.length)
  for (const d of w.pendingDeaths) {
    h.list([d.victim, d.killer, d.tick])
    h.list(d.dropKinds)
    h.list(d.dropSkills.flatMap((s) => [SKILL_SLOTS.indexOf(s.slot), skillCode(s.skill), s.level, ...slotNums(s.keep)]))
  }
  return h.hex()
}
