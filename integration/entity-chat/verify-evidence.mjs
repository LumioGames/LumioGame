#!/usr/bin/env node
/**
 * verify-evidence — R-00354 101-Entity 对账器。
 *
 * 用法:
 *   node verify-evidence.mjs --dir <evidenceDir>
 *   node verify-evidence.mjs --round1 <r1/evidence.json> --round2 <r2/evidence.json>
 *
 * census 必须来自 host-audit.ndjson 的 per-entity 事件,或 evidence.census.netEntityIds
 * 去重列表;单独的 total:101 常数不算数。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'

export const MAIN_ROOM = 'room-main'
export const BROWSER_NAME = 'Browser01'
export const TEST_PASSWORD = '123456'

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

function safeReadText(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function safeReadJson(p) {
  try { return loadJson(p) } catch { return null }
}

export function eventKind(ev) {
  return ev?.kind ?? ev?.event ?? null
}

export function parseNdjson(text) {
  const events = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    try {
      const ev = JSON.parse(trimmed)
      if (isObject(ev)) events.push({ line: i + 1, ev })
    } catch { /* skip */ }
  }
  return events
}

function entityTypeOf(ev) {
  const t = ev.entityType ?? ev.entityKind
  if (t === 'bot' || t === 'Bot' || t === 'BotEntity') return 'bot'
  if (t === 'player' || t === 'Player' || t === 'PlayerEntity') return 'player'
  return null
}

function isAdmitKind(kind) {
  return kind === 'entity_admitted' || kind === 'entity_created' || kind === 'binding_committed'
}

/** Distinct netEntityId census. A lone {total:101} is ignored. */
export function censusFromHostAudit(auditText) {
  const byId = new Map()
  for (const { ev } of parseNdjson(auditText)) {
    if (!isAdmitKind(eventKind(ev))) continue
    const id = ev.netEntityId
    const type = entityTypeOf(ev)
    if (id == null || type == null) continue
    byId.set(String(id), type)
  }
  let botCount = 0
  let playerCount = 0
  for (const t of byId.values()) {
    if (t === 'bot') botCount++
    else playerCount++
  }
  return { botCount, playerCount, total: byId.size, netEntityIds: [...byId.keys()] }
}

export function censusFromEvidence(evidence, auditText = '') {
  const fromAudit = censusFromHostAudit(auditText)
  if (fromAudit.total > 0) return fromAudit
  const c = evidence?.census ?? {}
  const ids = Array.isArray(c.netEntityIds) ? c.netEntityIds.map(String) : []
  const types = Array.isArray(c.entityTypes) ? c.entityTypes : []
  if (ids.length === 0) {
    return { botCount: 0, playerCount: 0, total: 0, netEntityIds: [] }
  }
  const byId = new Map()
  ids.forEach((id, i) => {
    const t = entityTypeOf({ entityType: types[i] }) ?? 'bot'
    byId.set(id, t)
  })
  let botCount = 0
  let playerCount = 0
  for (const t of byId.values()) {
    if (t === 'bot') botCount++
    else if (t === 'player') playerCount++
  }
  return { botCount, playerCount, total: byId.size, netEntityIds: [...byId.keys()] }
}

function scenario(evidence, n) {
  return evidence?.scenarios?.[String(n)] ?? evidence?.scenarios?.[n] ?? {}
}

export function verifyRun(evidence, auditText = '') {
  const failures = []
  if (!isObject(evidence)) {
    return { ok: false, failures: [{ check: 'shape', message: 'evidence is not an object' }] }
  }
  if (evidence.blocked) {
    failures.push({ check: 'blocked', message: String(evidence.blocked) })
  }
  const census = censusFromEvidence(evidence, auditText)
  if (census.botCount !== 100) {
    failures.push({ check: 'census:bots', message: `BotEntity 计数 ${census.botCount},应为 100(per-entity 去重,不得写死常数)` })
  }
  if (census.playerCount !== 1) {
    failures.push({ check: 'census:player', message: `PlayerEntity 计数 ${census.playerCount},应为 1` })
  }
  if (census.total !== 101) {
    failures.push({ check: 'census:total', message: `实体总数 ${census.total},应为 101` })
  }

  for (let i = 1; i <= 11; i++) {
    const row = scenario(evidence, i)
    if (!isObject(row) || row.ok !== true) {
      failures.push({ check: `scenario-${i}`, message: `scenario ${i} missing or not ok` })
    }
  }

  const s1 = scenario(evidence, 1)
  if (s1.wrongPasswordCode && s1.wrongPasswordCode !== 'wrong_password') {
    failures.push({ check: 's1:wrong-password', message: `wrong password code=${s1.wrongPasswordCode}` })
  }

  const s5 = scenario(evidence, 5)
  const s5text = JSON.stringify(s5).toLowerCase()
  for (const needed of ['unauthorized', 'invisible', 'stale']) {
    if (!s5text.includes(needed)) {
      failures.push({ check: 's5:missing', message: `scenario 5 缺少 ${needed}` })
    }
  }

  const s6 = scenario(evidence, 6)
  if (s6.messageType !== 'InputCommand') {
    failures.push({ check: 's6:messageType', message: `scenario 6 messageType=${s6.messageType}, expected InputCommand` })
  }
  if (s6.mappingId !== 'chat.input') {
    failures.push({ check: 's6:mappingId', message: `scenario 6 mappingId=${s6.mappingId}, expected chat.input` })
  }
  if (!/^[0-9a-f]{64}$/.test(String(s6.payloadSha256 ?? ''))) {
    failures.push({ check: 's6:payloadSha256', message: 'scenario 6 payloadSha256 must be lowercase sha256 hex' })
  }
  if (!/^[0-9a-f]+$/.test(String(s6.payload ?? '')) || String(s6.payload ?? '').length < 8) {
    failures.push({ check: 's6:payload', message: 'scenario 6 payload must be lowercase LumioBinV1 hex' })
  }

  const s7 = scenario(evidence, 7)
  if (Number(s7.historyCountMax ?? 0) !== 0) {
    failures.push({ check: 's7:history', message: `snapshot historyCount=${s7.historyCountMax}` })
  }
  if (Number(s7.restoredWindow ?? 0) !== 0) {
    failures.push({ check: 's7:window-restore', message: 'Restore 后聊天窗必须为空' })
  }

  const s8 = scenario(evidence, 8)
  if (s8.ok !== true) failures.push({ check: 's8:rebind', message: 'scenario 8 五分钟内重连必须重绑实体 A' })

  const s9 = scenario(evidence, 9)
  if (s9.ok !== true && s9.tombstoned !== true) {
    failures.push({ check: 's9:tombstone', message: 'scenario 9 过期后 A 必须 tombstone,B 用新 NetEntityId' })
  }

  const s10 = scenario(evidence, 10)
  if (s10.ok !== true) {
    failures.push({ check: 's10:isolation', message: 'scenario 10 隔离必须成立' })
  }

  const s11 = scenario(evidence, 11)
  if (!Array.isArray(s11.eventOrder) || s11.eventOrder.length !== 101) {
    failures.push({ check: 'event-order', message: `eventOrder length ${s11.eventOrder?.length}` })
  }
  if (!Array.isArray(s11.appliedTicks) || !s11.appliedTicks.every((t) => Number(t) === 1)) {
    failures.push({ check: 'applied-tick', message: 'appliedTicks must all be 1 for the scale wave' })
  }

  const dump = JSON.stringify(evidence)
  if (dump.includes('"123456"') && /password/i.test(dump)) {
    failures.push({ check: 'password-leak', message: 'evidence 不得回显测试口令' })
  }

  return {
    ok: failures.length === 0,
    failures,
    census,
    eventOrder: s11.eventOrder ?? [],
    appliedTicks: s11.appliedTicks ?? [],
  }
}

export function compareRuns(a, b, auditA = '', auditB = '') {
  const left = verifyRun(a, auditA)
  const right = verifyRun(b, auditB)
  const failures = []
  if (!left.ok) failures.push({ check: 'round-1', message: JSON.stringify(left.failures) })
  if (!right.ok) failures.push({ check: 'round-2', message: JSON.stringify(right.failures) })
  if (JSON.stringify(left.census) !== JSON.stringify(right.census)) {
    failures.push({ check: 'census-compare', message: 'entity counts differ across runs' })
  }
  if (JSON.stringify(left.eventOrder) !== JSON.stringify(right.eventOrder)) {
    failures.push({ check: 'event-order-compare', message: 'event order differs across runs' })
  }
  if (JSON.stringify(left.appliedTicks) !== JSON.stringify(right.appliedTicks)) {
    failures.push({ check: 'applied-tick-compare', message: 'applied Tick evidence differs across runs' })
  }
  return { ok: failures.length === 0, failures, round1: left, round2: right }
}

export function verifyEvidenceDir(dir) {
  if (!dir || !existsSync(dir)) {
    return { ok: false, failures: [{ check: 'pack:missing', message: `证据目录不存在: ${dir}` }] }
  }
  const r1 = join(dir, 'round-1', 'evidence.json')
  const r2 = join(dir, 'round-2', 'evidence.json')
  if (!existsSync(r1) && existsSync(join(dir, 'evidence.json'))) {
    const one = verifyRun(safeReadJson(join(dir, 'evidence.json')), safeReadText(join(dir, 'host-audit.ndjson')))
    return { ...one, failures: one.ok ? one.failures : [...one.failures, { check: 'pack:round2', message: '缺少 round-2' }] }
  }
  if (!existsSync(r1) || !existsSync(r2)) {
    return { ok: false, failures: [{ check: 'pack:rounds', message: '缺少 round-1/round-2/evidence.json' }] }
  }
  return compareRuns(
    loadJson(r1),
    loadJson(r2),
    safeReadText(join(dir, 'round-1', 'host-audit.ndjson')),
    safeReadText(join(dir, 'round-2', 'host-audit.ndjson')),
  )
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    out[a.slice(2)] = argv[i + 1]
    i++
  }
  return out
}

if (!process.env.NODE_TEST_CONTEXT) {
  const args = parseArgs(process.argv.slice(2))
  if (args.dir) {
    const report = verifyEvidenceDir(args.dir)
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
  if (args.round1 && args.round2) {
    const report = compareRuns(
      loadJson(args.round1),
      loadJson(args.round2),
      safeReadText(join(args.round1, '..', 'host-audit.ndjson')),
      safeReadText(join(args.round2, '..', 'host-audit.ndjson')),
    )
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
  if (args.evidence) {
    const report = verifyRun(loadJson(args.evidence), safeReadText(join(args.evidence, '..', 'host-audit.ndjson')))
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
}

const test = process.env.NODE_TEST_CONTEXT ? nodeTest : () => {}

function emptyEvidence() {
  return {}
}

function goodEvidence() {
  const netEntityIds = Array.from({ length: 100 }, (_, i) => String(i + 1))
  netEntityIds.push('101')
  const entityTypes = Array.from({ length: 100 }, () => 'bot')
  entityTypes.push('player')
  const eventOrder = netEntityIds.map((id, i) => `${id}:hello:${i + 1}`)
  const appliedTicks = Array.from({ length: 101 }, () => 1)
  const scenarios = {}
  for (let i = 1; i <= 11; i++) scenarios[String(i)] = { ok: true }
  scenarios['1'] = { ok: true, wrongPasswordCode: 'wrong_password' }
  scenarios['5'] = { ok: true, unauthorized: 'Unauthorized', invisible: 'Invisible', stale: 'StaleGeneration' }
  scenarios['6'] = {
    ok: true,
    messageType: 'InputCommand',
    mappingId: 'chat.input',
    payload: '020000006767',
    payloadSha256: '5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab',
  }
  scenarios['7'] = { ok: true, historyCountMax: 0, restoredWindow: 0 }
  scenarios['8'] = { ok: true }
  scenarios['9'] = { ok: true, tombstoned: true, staleARejected: true, entityA: '99' }
  scenarios['10'] = { ok: true }
  scenarios['11'] = { ok: true, eventOrder, appliedTicks, totalEntities: 101 }
  return {
    ok: true,
    census: { botCount: 100, playerCount: 1, total: 101, netEntityIds, entityTypes },
    scenarios,
  }
}

function goodAudit() {
  const lines = []
  for (let i = 1; i <= 100; i++) {
    lines.push(JSON.stringify({ kind: 'entity_admitted', roomId: MAIN_ROOM, netEntityId: String(i), entityType: 'bot' }))
  }
  lines.push(JSON.stringify({ kind: 'entity_admitted', roomId: MAIN_ROOM, netEntityId: '101', entityType: 'player' }))
  return lines.join('\n') + '\n'
}

test('空证据包:101 计数必须 FAIL(不得把写死 101 当 census)', () => {
  const report = verifyRun(emptyEvidence())
  assert.equal(report.ok, false)
  assert.match(report.failures.map((f) => f.check).join('\n'), /census/)
  assert.equal(report.census.total, 0)
})

test('空证据包:两轮对比必须 FAIL', () => {
  const cmp = compareRuns(emptyEvidence(), emptyEvidence())
  assert.equal(cmp.ok, false)
})

test('空证据包:隔离必须 FAIL', () => {
  const report = verifyRun(emptyEvidence())
  assert.ok(report.failures.some((f) => f.check.startsWith('s10') || f.check === 'scenario-10'))
})

test('空证据包:stale/tombstone 必须 FAIL', () => {
  const report = verifyRun(emptyEvidence())
  assert.ok(report.failures.some((f) => f.check.startsWith('s5') || f.check.startsWith('s9') || f.check === 'scenario-5'))
})

test('空证据包:重连必须 FAIL', () => {
  const report = verifyRun(emptyEvidence())
  assert.ok(report.failures.some((f) => f.check.startsWith('s8') || f.check === 'scenario-8'))
})

test('空证据包:snapshot-无历史必须 FAIL', () => {
  const report = verifyRun(emptyEvidence())
  assert.ok(report.failures.some((f) => f.check.startsWith('s7') || f.check === 'scenario-7'))
})

test('verifyEvidenceDir:缺失目录必须 FAIL', () => {
  const report = verifyEvidenceDir(join('integration', 'entity-chat', 'evidence', 'missing-pack'))
  assert.equal(report.ok, false)
})

test('好包:101 计数来自 host audit 去重而非常数', () => {
  const report = verifyRun(goodEvidence(), goodAudit())
  assert.equal(report.ok, true, JSON.stringify(report.failures))
  assert.equal(report.census.botCount, 100)
  assert.equal(report.census.playerCount, 1)
  assert.equal(report.census.total, 101)
})

test('好包缺 InputCommand envelope 字段必须 FAIL', () => {
  const ev = goodEvidence()
  delete ev.scenarios['6'].mappingId
  delete ev.scenarios['6'].payloadSha256
  const report = verifyRun(ev, goodAudit())
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => String(f.check).startsWith('s6')))
})

test('假 census 常数(无 per-entity 事件)必须 FAIL', () => {
  const evidence = goodEvidence()
  evidence.census = { total: 101, botCount: 100, playerCount: 1 }
  const report = verifyRun(evidence, '')
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.check.startsWith('census')))
})

test('compareRuns:两轮一致通过;event order 漂移必须 FAIL', () => {
  const a = goodEvidence()
  assert.equal(compareRuns(a, structuredClone(a), goodAudit(), goodAudit()).ok, true)
  const drifted = goodEvidence()
  drifted.scenarios['11'].eventOrder = drifted.scenarios['11'].eventOrder.map((x) => x + '-x')
  assert.equal(compareRuns(a, drifted, goodAudit(), goodAudit()).ok, false)
})
