#!/usr/bin/env node
/**
 * verify-evidence — R-00354 101-Entity 对账器。
 *
 * 用法:
 *   node verify-evidence.mjs --dir <evidenceDir>
 *   node verify-evidence.mjs --round1 <r1/evidence.json> --round2 <r2/evidence.json>
 *
 * census 必须来自 mvp-host Handshake/Admit 绑定(host-audit 非空 sessionId / admit
 * effect,或 admit-trace binding ids)。HTTP 101 的 launcher 循环下标 "1".."101"
 * 不是 NetEntityId。单独的 total:101 常数不算数。FullGraph 不发 entity_admitted。
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

const MVP_HOST_TRACE_KEYS = [
  'seq', 'kind', 'eventId', 'timestamp', 'category', 'severity', 'scope',
  'releasePoolId', 'sessionId', 'reasonCode', 'admissionAttemptId', 'effect',
  'sessionState', 'authorityRevision', 'slotEpoch', 'connectionEpoch', 'grantEpoch',
]

function isAdmitKind(kind) {
  return kind === 'entity_admitted' || kind === 'entity_created' || kind === 'binding_committed' || kind === 'connection_upgrade'
}

export function isLauncherLoopIndex(id) {
  const n = Number(id)
  return Number.isInteger(n) && n >= 1 && n <= 101 && String(n) === String(id)
}

function isAdmitEffect(effect) {
  return /admission|admit|bind|createsession|startreplication|authenticate/i.test(String(effect ?? ''))
}

function bindingIdOf(rec) {
  if (!isObject(rec) || rec.ok === false) return null
  for (const key of ['netEntityId', 'sessionId', 'bindingId']) {
    const id = rec[key]
    if (id == null) continue
    const s = String(id)
    if (s.length > 0 && s !== '0' && !isLauncherLoopIndex(s)) return s
  }
  return null
}

function isHonestSiblingGap(row) {
  return isObject(row)
    && row.ok === false
    && typeof row.blockedReason === 'string'
    && row.blockedReason.length > 0
}

const SIBLING_GAP_SCENARIOS = new Set([5, 7, 9, 10, 11])

function isMvpHostTagged(ev) {
  return ev?.process === 'lumio-mvp-host' || ev?.host === 'lumio-mvp-host' || ev?.source === 'lumio-mvp-host'
}

function isSeventeenKeyTrace(ev) {
  if (!isObject(ev)) return false
  return MVP_HOST_TRACE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(ev, key))
}

function isMvpHostProcessLine(ev) {
  if (!isObject(ev)) return false
  const seqOk = Number.isInteger(ev.seq)
  const kind = eventKind(ev)
  if (!seqOk || (kind !== 'audit' && kind !== 'ack' && kind !== 'state')) return false
  return isMvpHostTagged(ev) || kind === 'audit' || isSeventeenKeyTrace(ev)
}

function hostAuditHasSessionOrConnectionEvidence(auditText = '') {
  for (const { ev } of parseNdjson(auditText)) {
    if (!isMvpHostProcessLine(ev)) continue
    if (typeof ev.sessionId === 'string' && ev.sessionId.length > 0 && ev.sessionId !== '0') return true
    if (ev.sessionState) return true
    if (ev.connectionEpoch != null) return true
    if (ev.admissionAttemptId) return true
    if (ev.effect && /admission/i.test(String(ev.effect))) return true
  }
  return false
}

/** Handshake/Admit evidence: non-empty sessionId or admit/bind effect. NativeReady is not a binding. */
export function hostAuditHasBindingEvidence(auditText = '', admitTraceText = '') {
  const scan = (text, requireMvpLine) => {
    for (const { ev } of parseNdjson(text)) {
      if (requireMvpLine && !isMvpHostProcessLine(ev) && !isAdmitKind(eventKind(ev))) continue
      const session = ev.sessionId
      if (typeof session === 'string' && session.length > 0 && session !== '0' && !isLauncherLoopIndex(session)) {
        return true
      }
      if (isAdmitEffect(ev.effect) && ev.effect !== 'NativeReady') return true
      if (eventKind(ev) === 'binding_committed' && bindingIdOf(ev)) return true
    }
    return false
  }
  return scan(auditText, true) || scan(admitTraceText, false)
}

/** Host-audit must come from a live lumio-mvp-host process, not a GameRoomHost census dump. */
export function hasMvpHostProcessAudit(evidence, auditText = '') {
  const proc = evidence?.hostProcess
  const named = proc?.process === 'lumio-mvp-host' && Number.isInteger(Number(proc.pid)) && Number(proc.pid) > 0
  if (!named) return false
  return parseNdjson(auditText).some(({ ev }) => isMvpHostProcessLine(ev))
}

function hasIndependentTraces(evidence) {
  const t = evidence?.traces
  if (!isObject(t)) return false
  const accountOk = t.account?.wrongPasswordCode === 'wrong_password' || t.account?.createAck === true
  if (!accountOk) return false
  const queries = t.queries
  if (isObject(queries) && !queries.blockedReason) {
    const blob = JSON.stringify(queries).toLowerCase()
    if (['unauthorized', 'invisible', 'stale'].every((k) => blob.includes(k))) return false
  }
  if (t.expiry?.tombstoned === true && !t.expiry?.blockedReason) return false
  const reconnectOk = t.reconnect?.rebound === true || t.reconnect?.entityA != null
  const handshakeOk = Number(t.handshake?.completed ?? 0) === 101
    || (Array.isArray(t.handshake?.sessionIds) && t.handshake.sessionIds.length === 101)
  return reconnectOk || handshakeOk
}

export function playwrightRan(evidence) {
  const pw = evidence?.playwright ?? scenario(evidence, 3)?.playwright
  if (!isObject(pw) || pw.ran !== true) return false
  const browser = String(pw.browser ?? '')
  if (!/chromium|firefox|webkit/i.test(browser)) return false
  return pw.receivedFromNetwork === true && pw.injected !== true
}

function censusFromIdMap(byId) {
  let botCount = 0
  let playerCount = 0
  for (const t of byId.values()) {
    if (t === 'bot') botCount++
    else playerCount++
  }
  return { botCount, playerCount, total: byId.size, netEntityIds: [...byId.keys()] }
}

function emptyCensus() {
  return { botCount: 0, playerCount: 0, total: 0, netEntityIds: [] }
}

function recordAdmit(byId, rec) {
  if (!isObject(rec) || rec.ok === false) return
  const id = bindingIdOf(rec)
  const type = entityTypeOf(rec)
  if (id == null || type == null) return
  byId.set(id, type)
}

/** Distinct netEntityId census from mvp-host process audit. A lone {total:101} is ignored. */
export function censusFromHostAudit(auditText) {
  const byId = new Map()
  for (const { ev } of parseNdjson(auditText)) {
    if (!isAdmitKind(eventKind(ev))) continue
    if (!isMvpHostTagged(ev) && !isSeventeenKeyTrace(ev)) continue
    recordAdmit(byId, ev)
  }
  return censusFromIdMap(byId)
}

function censusFromLiveAdmits(evidence, admitTraceText = '') {
  const byId = new Map()
  const admits = evidence?.liveAdmits?.admits
  if (Array.isArray(admits)) {
    for (const rec of admits) {
      recordAdmit(byId, rec)
    }
  }
  if (byId.size < 101 && admitTraceText) {
    for (const { ev } of parseNdjson(admitTraceText)) {
      if (!isAdmitKind(eventKind(ev))) continue
      if (ev.process && ev.process !== 'lumio-mvp-host') continue
      recordAdmit(byId, ev)
    }
  }
  return censusFromIdMap(byId)
}

export function censusFromEvidence(evidence, auditText = '', admitTraceText = '') {
  if (!hasMvpHostProcessAudit(evidence, auditText)) {
    return emptyCensus()
  }
  const fromAudit = censusFromHostAudit(auditText)
  if (fromAudit.total === 101) return fromAudit
  const fromLive = censusFromLiveAdmits(evidence, admitTraceText)
  if (fromLive.total === 101 && hostAuditHasBindingEvidence(auditText, admitTraceText)) {
    return fromLive
  }
  return fromAudit.total > 0 ? fromAudit : fromLive
}

function scenario(evidence, n) {
  return evidence?.scenarios?.[String(n)] ?? evidence?.scenarios?.[n] ?? {}
}

export function verifyRun(evidence, auditText = '', admitTraceText = '') {
  const failures = []
  if (!isObject(evidence)) {
    return { ok: false, failures: [{ check: 'shape', message: 'evidence is not an object' }] }
  }
  if (evidence.blocked) {
    failures.push({ check: 'blocked', message: String(evidence.blocked) })
  }
  if (!hasMvpHostProcessAudit(evidence, auditText)) {
    failures.push({ check: 'host:mvp', message: 'suite-only host is not C# MVP host' })
  }
  if (!hasIndependentTraces(evidence)) {
    failures.push({ check: 'host:audit', message: 'mvp-host process audit/traces required; scenarios[n].ok is not evidence' })
  }
  const census = censusFromEvidence(evidence, auditText, admitTraceText)
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
    if (i === 6) {
      const tickBatched = row?.ok !== true && row?.timerManagerInvoked !== true
      if (tickBatched) continue
    }
    if (SIBLING_GAP_SCENARIOS.has(i)) {
      if (row?.ok === true) {
        failures.push({
          check: `scenario-${i}:suite-double`,
          message: `scenario ${i} ok:true from GameRoomHost is not live mvp-host`,
        })
        continue
      }
      if (!isHonestSiblingGap(row)) {
        failures.push({
          check: `scenario-${i}`,
          message: `scenario ${i} requires ok:false + blockedReason (sibling gap)`,
        })
      }
      continue
    }
    if (!isObject(row) || row.ok !== true) {
      failures.push({ check: `scenario-${i}`, message: `scenario ${i} missing or not ok` })
    }
  }

  const bindingOk = hostAuditHasBindingEvidence(auditText, admitTraceText)
    && census.total === 101
    && census.netEntityIds.every((id) => !isLauncherLoopIndex(id))
  const s4 = scenario(evidence, 4)
  if (s4.ok === true && !bindingOk) {
    failures.push({
      check: 's4:binding',
      message: 'S4 requires host Handshake/Admit binding ids (non-empty sessionId or admit effect); HTTP 101 loop index is not NetEntityId',
    })
  }

  const s1 = scenario(evidence, 1)
  if (s1.wrongPasswordCode && s1.wrongPasswordCode !== 'wrong_password') {
    failures.push({ check: 's1:wrong-password', message: `wrong password code=${s1.wrongPasswordCode}` })
  }

  const s3 = scenario(evidence, 3)
  if (s3.ok === true && !playwrightRan(evidence)) {
    failures.push({ check: 's3:playwright', message: 'Browser display requires Playwright Chromium run (received events, not injected)' })
  }

  const s5 = scenario(evidence, 5)
  if (!isHonestSiblingGap(s5)) {
    const s5text = JSON.stringify(s5).toLowerCase()
    for (const needed of ['unauthorized', 'invisible', 'stale']) {
      if (!s5text.includes(needed)) {
        failures.push({ check: 's5:missing', message: `scenario 5 缺少 ${needed}` })
      }
    }
  }

  const s6 = scenario(evidence, 6)
  if (s6.ok === true && s6.timerManagerInvoked !== true) {
    failures.push({ check: 's6:timer', message: 'Client Timer Manager not invoked; chat is tick-batched; Timer is a known gap' })
  }
  if (s6.ok === true) {
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
  }

  const s7 = scenario(evidence, 7)
  const windowBefore = Number(s7.windowBeforeSnapshot ?? s7.chatEventsBeforeSnapshot ?? 0)
  if (s7.ok === true && s7.snapshotSource && s7.snapshotSource !== 'live-mvp-host') {
    failures.push({
      check: 's7:suite-double',
      message: 'GameRoomHost persist snapshotSource is not live mvp-host',
    })
  }
  if (s7.ok === true && windowBefore <= 0) {
    failures.push({ check: 's7:snapshot-material', message: 'snapshot must exercise material that could have contained history (HistoryCount default 0 is not a test)' })
  }
  if (!isHonestSiblingGap(s7) && Number(s7.historyCountMax ?? 0) !== 0) {
    failures.push({ check: 's7:history', message: `snapshot historyCount=${s7.historyCountMax}` })
  }
  if (!isHonestSiblingGap(s7) && Number(s7.restoredWindow ?? 0) !== 0) {
    failures.push({ check: 's7:window-restore', message: 'Restore 后聊天窗必须为空' })
  }

  const s8 = scenario(evidence, 8)
  if (s8.ok !== true) failures.push({ check: 's8:rebind', message: 'scenario 8 五分钟内重连必须重绑实体 A' })

  const s9 = scenario(evidence, 9)
  if (!isHonestSiblingGap(s9) && s9.ok !== true && s9.tombstoned !== true) {
    failures.push({ check: 's9:tombstone', message: 'scenario 9 过期后 A 必须 tombstone,B 用新 NetEntityId' })
  }

  const s10 = scenario(evidence, 10)
  if (!isHonestSiblingGap(s10) && s10.ok !== true) {
    failures.push({ check: 's10:isolation', message: 'scenario 10 隔离必须成立' })
  }

  const s11 = scenario(evidence, 11)
  if (!isHonestSiblingGap(s11)) {
    if (!Array.isArray(s11.eventOrder) || s11.eventOrder.length !== 101) {
      failures.push({ check: 'event-order', message: `eventOrder length ${s11.eventOrder?.length}` })
    }
    if (!Array.isArray(s11.appliedTicks) || !s11.appliedTicks.every((t) => Number(t) === 1)) {
      failures.push({ check: 'applied-tick', message: 'appliedTicks must all be 1 for the scale wave' })
    }
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

export function compareRuns(a, b, auditA = '', auditB = '', admitA = '', admitB = '') {
  const left = verifyRun(a, auditA, admitA)
  const right = verifyRun(b, auditB, admitB)
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
    const one = verifyRun(
      safeReadJson(join(dir, 'evidence.json')),
      safeReadText(join(dir, 'host-audit.ndjson')),
      safeReadText(join(dir, 'admit-trace.ndjson')),
    )
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
    safeReadText(join(dir, 'round-1', 'admit-trace.ndjson')),
    safeReadText(join(dir, 'round-2', 'admit-trace.ndjson')),
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
      safeReadText(join(args.round1, '..', 'admit-trace.ndjson')),
      safeReadText(join(args.round2, '..', 'admit-trace.ndjson')),
    )
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
  if (args.evidence) {
    const report = verifyRun(
      loadJson(args.evidence),
      safeReadText(join(args.evidence, '..', 'host-audit.ndjson')),
      safeReadText(join(args.evidence, '..', 'admit-trace.ndjson')),
    )
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
}

const test = process.env.NODE_TEST_CONTEXT ? nodeTest : () => {}

function emptyEvidence() {
  return {}
}

function suiteOnlyEvidence() {
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

function suiteOnlyAudit() {
  const lines = []
  for (let i = 1; i <= 100; i++) {
    lines.push(JSON.stringify({ kind: 'entity_admitted', roomId: MAIN_ROOM, netEntityId: String(i), entityType: 'bot' }))
  }
  lines.push(JSON.stringify({ kind: 'entity_admitted', roomId: MAIN_ROOM, netEntityId: '101', entityType: 'player' }))
  return lines.join('\n') + '\n'
}

function siblingGapFixture(extra = {}) {
  return {
    ok: false,
    source: 'suite-double',
    blockedReason: 'sibling-gap: mvp-host ReferenceWorldSimulation cannot Attribute Query / Chat persist / expiry / isolation / event-order',
    ...extra,
  }
}

function goodEvidence() {
  const base = suiteOnlyEvidence()
  const eventOrder = base.scenarios['11'].eventOrder
  const appliedTicks = base.scenarios['11'].appliedTicks
  base.hostProcess = {
    process: 'lumio-mvp-host',
    pid: 4242,
    listenUri: 'ws://127.0.0.1:19000',
    command: ['dotnet', 'exec', 'lumio-mvp-host.dll', '--listen', 'ws://127.0.0.1:0'],
  }
  base.playwright = { ran: true, browser: 'chromium', receivedFromNetwork: true, injected: false, eventCount: 101 }
  base.traces = {
    account: { createAck: true, loadAck: true, wrongPasswordCode: 'wrong_password' },
    reconnect: { rebound: true, entityA: 'sess-bot-100' },
    handshake: { completed: 101 },
  }
  base.scenarios['3'] = { ok: true, playwrightRan: true }
  base.scenarios['4'] = { ok: true, resolvedBots: 100, browserBound: true }
  base.scenarios['5'] = siblingGapFixture({ unauthorized: null, invisible: null, stale: null })
  base.scenarios['6'] = { ok: false, timerManagerInvoked: false, cadence: 'tick-batched', eventCount: 0 }
  base.scenarios['7'] = siblingGapFixture({
    historyCountMax: 0,
    restoredWindow: 0,
    snapshotSource: 'suite-double',
  })
  base.scenarios['8'] = { ok: true, entityA: 'sess-bot-100', rebound: true }
  base.scenarios['9'] = siblingGapFixture()
  base.scenarios['10'] = siblingGapFixture()
  base.scenarios['11'] = siblingGapFixture({ eventOrder, appliedTicks, totalEntities: 101 })
  return base
}

function goodAudit() {
  const lines = [
    JSON.stringify({ seq: 0, kind: 'audit', process: 'lumio-mvp-host', eventId: 'host.start', category: 'host', severity: 'info' }),
  ]
  for (let i = 1; i <= 100; i++) {
    lines.push(JSON.stringify({
      kind: 'entity_admitted',
      process: 'lumio-mvp-host',
      roomId: MAIN_ROOM,
      netEntityId: `nent-bot-${String(i).padStart(3, '0')}`,
      entityType: 'bot',
      sessionId: `sess-bot-${String(i).padStart(3, '0')}`,
    }))
  }
  lines.push(JSON.stringify({
    kind: 'entity_admitted',
    process: 'lumio-mvp-host',
    roomId: MAIN_ROOM,
    netEntityId: 'nent-player-001',
    entityType: 'player',
    sessionId: 'sess-player-001',
  }))
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

test('suite-only host is not C# MVP host: GameRoomHost/fabricated entity_admitted without mvp-host process audit must FAIL', () => {
  const report = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.equal(report.ok, false, 'GameRoomHost-only pack must not be SUCCESS')
  assert.ok(
    report.failures.some((f) => /suite-only host is not C# MVP host/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('P1-1: scenarios[n].ok 不能单独构成证据,缺 mvp-host process audit 必须 FAIL', () => {
  const report = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 'host:mvp' || f.check === 'host:audit' || /mvp-host/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('P1-2: 未跑 Playwright 不得把 Browser 场景标 ok', () => {
  const report = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's3:playwright' || /Playwright/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('P1-3: HistoryCount 默认 0 不是无历史测试,缺可含历史的 snapshot 必须 FAIL', () => {
  const report = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's7:snapshot-material' || /could have contained history/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('P1-5: 未调用 Client Timer Manager 不得把 cadence 场景标 ok', () => {
  const report = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's6:timer' || /Timer Manager/i.test(f.message)),
    JSON.stringify(report.failures),
  )
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

const MVP_HOST_AUDIT_KEYS = [
  'seq', 'kind', 'eventId', 'timestamp', 'category', 'severity', 'scope',
  'releasePoolId', 'sessionId', 'reasonCode', 'admissionAttemptId', 'effect',
  'sessionState', 'authorityRevision', 'slotEpoch', 'connectionEpoch', 'grantEpoch',
]

function seventeenKeyAudit() {
  return JSON.stringify({
    seq: 0,
    kind: 'state',
    eventId: null,
    timestamp: null,
    category: null,
    severity: null,
    scope: null,
    releasePoolId: null,
    sessionId: null,
    reasonCode: null,
    admissionAttemptId: null,
    effect: null,
    sessionState: 'NativeReady',
    authorityRevision: 0,
    slotEpoch: 1,
    connectionEpoch: null,
    grantEpoch: null,
  }) + '\n'
}

function liveAdmitList() {
  const admits = []
  for (let i = 1; i <= 100; i++) {
    admits.push({
      index: i,
      ok: true,
      status: 101,
      process: 'lumio-mvp-host',
      entityType: 'bot',
      connectionId: String(i),
    })
  }
  admits.push({
    index: 101,
    ok: true,
    status: 101,
    process: 'lumio-mvp-host',
    entityType: 'player',
    connectionId: '101',
  })
  return admits
}

function liveSeventeenKeyEvidence() {
  const evidence = goodEvidence()
  const netEntityIds = Array.from({ length: 101 }, (_, i) => String(i + 1))
  const eventOrder = netEntityIds.map((id, i) => `${id}:hello:${i + 1}`)
  const appliedTicks = Array.from({ length: 101 }, () => 1)
  evidence.liveAdmits = {
    live: 101,
    desired: 101,
    blocked: null,
    admits: liveAdmitList(),
  }
  evidence.traces = {
    account: { createAck: true, loadAck: true, wrongPasswordCode: 'wrong_password' },
    queries: { unauthorized: 'Unauthorized', invisible: 'Invisible', stale: 'StaleGeneration' },
    chat: { eventCount: 101 },
    reconnect: { rebound: true, entityA: '100' },
    expiry: { tombstoned: true, entityB: '102' },
  }
  evidence.scenarios['4'] = { ok: true, resolvedBots: 100, browserBound: true }
  evidence.scenarios['5'] = { ok: true, unauthorized: 'Unauthorized', invisible: 'Invisible', stale: 'StaleGeneration' }
  evidence.scenarios['6'] = { ok: true, timerManagerInvoked: true, cadence: 'client-timer-manager' }
  evidence.scenarios['7'] = {
    ok: true,
    historyCountMax: 0,
    restoredWindow: 0,
    windowBeforeSnapshot: 101,
    snapshotSource: 'runtime-capture',
  }
  evidence.scenarios['8'] = { ok: true, entityA: '100', rebound: true }
  evidence.scenarios['9'] = { ok: true, tombstoned: true, staleARejected: true, entityA: '99' }
  evidence.scenarios['10'] = { ok: true }
  evidence.scenarios['11'] = { ok: true, eventOrder, appliedTicks, totalEntities: 101 }
  return evidence
}

test('mvp-host 17-key NativeReady audit with hostProcess pid and 101 live admits must PASS host:mvp', () => {
  const audit = seventeenKeyAudit()
  const parsed = JSON.parse(audit)
  for (const key of MVP_HOST_AUDIT_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(parsed, key), key)
  }
  assert.equal(parsed.kind, 'state')
  assert.equal(parsed.seq, 0)
  assert.equal(parsed.sessionState, 'NativeReady')
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'process'), false)

  const report = verifyRun(liveSeventeenKeyEvidence(), audit)
  assert.ok(
    !report.failures.some((f) => f.check === 'host:mvp'),
    JSON.stringify(report.failures),
  )
})

test('GameRoomHost-only pack still FAIL host:mvp when 17-key live pack is accepted', () => {
  const suite = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.equal(suite.ok, false)
  assert.ok(
    suite.failures.some((f) => f.check === 'host:mvp' || /suite-only host is not C# MVP host/i.test(f.message)),
    JSON.stringify(suite.failures),
  )
})

test('census 101 from Handshake binding ids + host-audit session evidence, not invented entity_admitted', () => {
  const audit = handshakeBindingAudit()
  assert.equal(audit.includes('entity_admitted'), false)
  const report = verifyRun(handshakeEvidence(), audit)
  assert.equal(report.census.botCount, 100)
  assert.equal(report.census.playerCount, 1)
  assert.equal(report.census.total, 101)
  assert.equal(report.census.netEntityIds.length, 101)
  assert.ok(report.census.netEntityIds.every((id) => !isLauncherLoopIndex(id)))
})

test('hardcoded {total:101} with 17-key audit and no per-connection list must FAIL census', () => {
  const evidence = goodEvidence()
  evidence.census = { total: 101, botCount: 100, playerCount: 1 }
  evidence.liveAdmits = { live: 101, desired: 101 }
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.check.startsWith('census')))
  assert.notEqual(report.census.total, 101)
})

test('tick-batched chat with s6.ok false is allowed when Client Timer Manager was not invoked', () => {
  const evidence = liveSeventeenKeyEvidence()
  evidence.scenarios['6'] = {
    ok: false,
    timerManagerInvoked: false,
    cadence: 'tick-batched',
    eventCount: 101,
  }
  evidence.traces.chat = { eventCount: 101 }
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.ok(
    !report.failures.some((f) => f.check === 's6:timer' || f.check === 'scenario-6'),
    JSON.stringify(report.failures),
  )
})

function siblingGapRow(extra = {}) {
  return siblingGapFixture(extra)
}

function handshakeAdmitList() {
  const admits = []
  for (let i = 1; i <= 100; i++) {
    const sessionId = `sess-bot-${String(i).padStart(3, '0')}`
    admits.push({
      index: i,
      ok: true,
      status: 101,
      process: 'lumio-mvp-host',
      entityType: 'bot',
      loginName: `Bot${String(i).padStart(2, '0')}`,
      connectionId: String(i),
      sessionId,
      netEntityId: sessionId,
      handshake: true,
    })
  }
  admits.push({
    index: 101,
    ok: true,
    status: 101,
    process: 'lumio-mvp-host',
    entityType: 'player',
    loginName: BROWSER_NAME,
    connectionId: '101',
    sessionId: 'sess-player-001',
    netEntityId: 'sess-player-001',
    handshake: true,
  })
  return admits
}

function handshakeBindingAudit() {
  const keys = (extra) => {
    const row = {
      seq: extra.seq,
      kind: extra.kind,
      eventId: extra.eventId ?? null,
      timestamp: extra.timestamp ?? null,
      category: extra.category ?? null,
      severity: extra.severity ?? null,
      scope: extra.scope ?? null,
      releasePoolId: extra.releasePoolId ?? null,
      sessionId: extra.sessionId ?? null,
      reasonCode: extra.reasonCode ?? null,
      admissionAttemptId: extra.admissionAttemptId ?? null,
      effect: extra.effect ?? null,
      sessionState: extra.sessionState ?? null,
      authorityRevision: extra.authorityRevision ?? 0,
      slotEpoch: extra.slotEpoch ?? 1,
      connectionEpoch: extra.connectionEpoch ?? null,
      grantEpoch: extra.grantEpoch ?? null,
    }
    return JSON.stringify(row)
  }
  const lines = [
    keys({ seq: 0, kind: 'state', sessionState: 'NativeReady', authorityRevision: 0, slotEpoch: 1 }),
  ]
  let seq = 1
  for (const rec of handshakeAdmitList()) {
    lines.push(keys({
      seq: seq++,
      kind: 'ack',
      effect: 'BindConnection',
      admissionAttemptId: seq,
      sessionId: rec.sessionId,
      connectionEpoch: 1,
    }))
    lines.push(keys({
      seq: seq++,
      kind: 'state',
      sessionId: rec.sessionId,
      sessionState: 'Syncing',
      authorityRevision: 0,
      slotEpoch: 1,
      grantEpoch: 1,
    }))
  }
  return lines.join('\n') + '\n'
}

function handshakeEvidence() {
  const evidence = goodEvidence()
  const admits = handshakeAdmitList()
  evidence.liveAdmits = { live: 101, desired: 101, blocked: null, admits }
  evidence.scenarios['4'] = {
    ok: true,
    resolvedBots: 100,
    browserBound: true,
    sessionIds: admits.map((a) => a.sessionId),
  }
  evidence.scenarios['5'] = siblingGapRow({ unauthorized: null, invisible: null, stale: null })
  evidence.scenarios['6'] = {
    ok: false,
    timerManagerInvoked: false,
    cadence: 'tick-batched',
    eventCount: 0,
  }
  evidence.scenarios['7'] = siblingGapRow({
    historyCountMax: 0,
    restoredWindow: 0,
    snapshotSource: 'suite-double',
  })
  evidence.scenarios['8'] = { ok: true, entityA: 'sess-bot-100', rebound: true }
  evidence.scenarios['9'] = siblingGapRow()
  evidence.scenarios['10'] = siblingGapRow()
  evidence.scenarios['11'] = siblingGapRow({ totalEntities: 101 })
  evidence.traces = {
    account: evidence.traces.account,
    reconnect: { rebound: true, entityA: 'sess-bot-100' },
    handshake: { completed: 101 },
  }
  return evidence
}

test('P1-A: 101 HTTP 101 upgrades without host-audit sessionId or admit effect must FAIL S4', () => {
  const evidence = liveSeventeenKeyEvidence()
  evidence.scenarios['4'] = { ok: true, resolvedBots: 100, browserBound: true }
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.equal(report.ok, false, 'upgrade-only pack must not SUCCESS S4')
  assert.ok(
    report.failures.some((f) => f.check === 's4:binding' || f.check === 'scenario-4'),
    JSON.stringify(report.failures),
  )
})

test('P1-A: launcher loop index 1..101 is not host NetEntityId', () => {
  const evidence = liveSeventeenKeyEvidence()
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.equal(report.ok, false)
  const loopCensus = report.census.total === 101
    && report.census.netEntityIds.every((id) => isLauncherLoopIndex(id))
  assert.equal(loopCensus, false, 'census must not treat launcher loop index as NetEntityId')
  assert.ok(
    report.failures.some((f) => f.check === 's4:binding' || f.check === 'scenario-4' || f.check.startsWith('census')),
    JSON.stringify(report.failures),
  )
})

test('P1-A: Handshake host-audit sessionId/admit effect may PASS S4 with non-loop binding ids', () => {
  const report = verifyRun(handshakeEvidence(), handshakeBindingAudit())
  assert.ok(
    !report.failures.some((f) => f.check === 's4:binding' || f.check === 'scenario-4'),
    JSON.stringify(report.failures),
  )
  assert.equal(report.census.botCount, 100)
  assert.equal(report.census.playerCount, 1)
  assert.equal(report.census.total, 101)
  assert.ok(report.census.netEntityIds.every((id) => !isLauncherLoopIndex(id)))
})

test('P1-B: GameRoomHost-green S5/S7/S9/S10/S11 must FAIL when snapshotSource is not live mvp-host', () => {
  const evidence = liveSeventeenKeyEvidence()
  assert.equal(evidence.scenarios['5'].ok, true)
  assert.equal(evidence.scenarios['7'].snapshotSource, 'runtime-capture')
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.equal(report.ok, false)
  const checks = report.failures.map((f) => f.check)
  assert.ok(
    checks.some((c) => c === 'scenario-5' || c === 'scenario-5:suite-double' || c === 's5:suite-double'),
    JSON.stringify(report.failures),
  )
  assert.ok(
    checks.some((c) => c === 'scenario-7' || c === 'scenario-7:suite-double' || c === 's7:suite-double'),
    JSON.stringify(report.failures),
  )
})

test('P1-B: sibling-gap S5/S7/S9/S10/S11 ok:false + blockedReason is allowed', () => {
  const evidence = handshakeEvidence()
  const report = verifyRun(evidence, handshakeBindingAudit())
  const blocked = new Set(['scenario-5', 'scenario-7', 'scenario-9', 'scenario-10', 'scenario-11'])
  assert.ok(
    !report.failures.some((f) => blocked.has(f.check)),
    JSON.stringify(report.failures),
  )
  assert.equal(report.ok, true, JSON.stringify(report.failures))
})

test('P1-B: missing ok:false blockedReason on S5/S7/S9/S10/S11 must FAIL', () => {
  const evidence = handshakeEvidence()
  evidence.scenarios['5'] = { ok: false }
  evidence.scenarios['7'] = { ok: false, snapshotSource: 'suite-double' }
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 'scenario-5' || f.check === 'scenario-7'),
    JSON.stringify(report.failures),
  )
})
