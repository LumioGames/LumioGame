#!/usr/bin/env node
/**
 * verify-evidence — R-00390 / R4-06 oracle.
 *
 * Evidence is logs only (ADR-057 §3). Inputs: server log dir + client log dir.
 * Does not read harness evidence.json / timer-trace.json.
 *
 * Usage:
 *   node verify-evidence.mjs --dir <logs>
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'

export const MAIN_ROOM = 'room-main'
export const BROWSER_NAME = 'Browser01'
export const TEST_PASSWORD = '123456'
export const ORACLE_TICK_SOURCE = 'native-kernel/tickFrame'
export const CLIENT_CADENCE_TICKS = [5, 10, 15]
export const SKIP_HARNESS_FILES = new Set(['evidence.json', 'timer-trace.json'])

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

export function oracleFilePath() {
  return fileURLToPath(import.meta.url)
}

export function oracleSha256(p = oracleFilePath()) {
  const text = readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(text, 'utf8').digest('hex')
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

export function isLauncherLoopIndex(id) {
  const n = Number(id)
  return Number.isInteger(n) && n >= 1 && n <= 101 && String(n) === String(id)
}

function u64ToHex16(value) {
  let n
  if (typeof value === 'bigint') n = value
  else if (typeof value === 'number' && Number.isFinite(value)) n = BigInt(Math.trunc(value))
  else if (typeof value === 'string' && /^(0x)?[0-9a-f]+$/i.test(value)) n = BigInt(value)
  else return null
  if (n < 0n || n > 0xffffffffffffffffn) return null
  return n.toString(16).padStart(16, '0')
}

/** 32-hex sender. Accepts 32-hex or two u64 halves. Does not use a u128 type. */
export function parseSenderNetEntityId(rec) {
  if (rec == null) return null
  if (typeof rec === 'string') {
    const s = rec.toLowerCase()
    if (/^[0-9a-f]{32}$/.test(s) && !/^0+$/.test(s)) return s
    return null
  }
  if (!isObject(rec)) return null
  if (typeof rec.senderNetEntityId === 'string') {
    const parsed = parseSenderNetEntityId(rec.senderNetEntityId)
    if (parsed) return parsed
  }
  if (typeof rec.netEntityId === 'string') {
    const parsed = parseSenderNetEntityId(rec.netEntityId)
    if (parsed) return parsed
  }
  const instance = rec.senderNetEntityIdInstanceId ?? rec.instanceId ?? rec.netEntityIdInstanceId
  const counter = rec.senderNetEntityIdCounter ?? rec.counter ?? rec.netEntityIdCounter
  if (instance == null || counter == null) return null
  const hi = u64ToHex16(instance)
  const lo = u64ToHex16(counter)
  if (!hi || !lo) return null
  const hex = hi + lo
  return /^0+$/.test(hex) ? null : hex
}

export function isHostNetEntityId(id) {
  if (id == null) return false
  if (typeof id === 'object') return parseSenderNetEntityId(id) != null
  const s = String(id)
  if (s.length === 0 || s === '0' || isLauncherLoopIndex(s)) return false
  if (/^sess[-_]/i.test(s)) return false
  return parseSenderNetEntityId(s) != null
}

export function eventOrderKey(tuple) {
  if (typeof tuple === 'string') return tuple
  if (!isObject(tuple)) return String(tuple)
  const sender = parseSenderNetEntityId(tuple) ?? String(tuple.senderNetEntityId ?? '')
  return [tuple.messageId, tuple.roomSequence, sender, tuple.appliedTick].join('|')
}

function walkLogFiles(root, out = []) {
  if (!root || !existsSync(root)) return out
  const st = statSync(root)
  if (st.isFile()) {
    const base = root.replace(/\\/g, '/').split('/').pop()
    if (!SKIP_HARNESS_FILES.has(base)) out.push(root)
    return out
  }
  const names = readdirSync(root).sort()
  for (const name of names) {
    if (SKIP_HARNESS_FILES.has(name)) continue
    const p = join(root, name)
    const child = statSync(p)
    if (child.isDirectory()) walkLogFiles(p, out)
    else if (/\.(ndjson|jsonl|log)$/i.test(name) || name === 'server' || name === 'client') out.push(p)
  }
  return out
}

function loadRecords(path) {
  const files = walkLogFiles(path)
  const events = []
  for (const file of files) {
    events.push(...parseNdjson(readFileSync(file, 'utf8')))
  }
  return events
}

function resolveRoleDir(roundDir, role) {
  const asDir = join(roundDir, role)
  if (existsSync(asDir)) return asDir
  for (const name of [`${role}.ndjson`, `${role}.jsonl`, `${role}.log`]) {
    const asFile = join(roundDir, name)
    if (existsSync(asFile)) return asFile
  }
  return asDir
}

function kindOf(ev) {
  return String(ev?.kind ?? ev?.event ?? '')
}

function entityTypeOf(ev) {
  const t = ev.entityType ?? ev.entityKind
  if (t === 'bot' || t === 'Bot' || t === 'BotEntity') return 'bot'
  if (t === 'player' || t === 'Player' || t === 'PlayerEntity') return 'player'
  return null
}

export function censusFromServerLogs(serverEvents) {
  const byId = new Map()
  for (const { ev } of serverEvents) {
    const kind = kindOf(ev)
    if (kind !== 'entity_admitted' && kind !== 'admit') continue
    const id = parseSenderNetEntityId(ev) ?? parseSenderNetEntityId(ev.netEntityId)
    const type = entityTypeOf(ev)
    if (id == null || type == null) continue
    byId.set(id, type)
  }
  let botCount = 0
  let playerCount = 0
  for (const t of byId.values()) {
    if (t === 'bot') botCount++
    else playerCount++
  }
  return { botCount, playerCount, total: byId.size, netEntityIds: [...byId.keys()] }
}

function chatEventsFromClient(clientEvents) {
  const events = []
  for (const { ev } of clientEvents) {
    const kind = kindOf(ev)
    if (kind !== 'chat.event' && kind !== 'event') continue
    const sender = parseSenderNetEntityId(ev)
    if (sender == null) continue
    if (typeof ev.messageId !== 'number' || typeof ev.roomSequence !== 'number' || typeof ev.appliedTick !== 'number') continue
    events.push({
      messageId: ev.messageId,
      roomSequence: ev.roomSequence,
      senderNetEntityId: sender,
      appliedTick: ev.appliedTick,
      text: typeof ev.text === 'string' ? ev.text : '',
    })
  }
  return events
}

function windowLinesFromClient(clientEvents) {
  const lines = []
  for (const { ev } of clientEvents) {
    if (kindOf(ev) !== 'chat.window') continue
    if (ev.phase === 'restored') continue
    lines.push(ev)
  }
  if (lines.length > 0) return lines
  return chatEventsFromClient(clientEvents)
}

function hasKind(events, kind) {
  return events.some(({ ev }) => kindOf(ev) === kind)
}

function findKind(events, kind) {
  return events.find(({ ev }) => kindOf(ev) === kind)?.ev ?? null
}

function blobOf(events) {
  return events.map(({ ev }) => JSON.stringify(ev)).join('\n').toLowerCase()
}

export function verifyRunFromLogs(serverDir, clientDir) {
  const failures = []
  if (!serverDir || !existsSync(serverDir) || !clientDir || !existsSync(clientDir)) {
    return {
      ok: false,
      failures: [{ check: 'logs:missing', message: 'server log dir and client log dir are required' }],
      census: { botCount: 0, playerCount: 0, total: 0, netEntityIds: [] },
      eventOrder: [],
      appliedTicks: [],
    }
  }

  const serverEvents = loadRecords(serverDir)
  const clientEvents = loadRecords(clientDir)
  const host = findKind(serverEvents, 'host') ?? findKind(clientEvents, 'host')
  const hostName = host?.process ?? host?.host
  if (hostName === 'lumio-mvp-host' || /lumio-mvp-host/i.test(String(hostName ?? ''))) {
    failures.push({ check: 'host:mvp-impersonation', message: 'lumio-mvp-host is never a SUCCESS path' })
  }
  if (hostName !== 'lumio-entity-chat-replay' && !/lumio-entity-chat-replay/i.test(String(hostName ?? ''))) {
    failures.push({ check: 'host:rust', message: 'host process must name lumio-entity-chat-replay' })
  }

  const census = censusFromServerLogs(serverEvents)
  if (census.botCount !== 100) {
    failures.push({ check: 'census:bots', message: `BotEntity 计数 ${census.botCount},应为 100` })
  }
  if (census.playerCount !== 1) {
    failures.push({ check: 'census:player', message: `PlayerEntity 计数 ${census.playerCount},应为 1` })
  }
  if (census.total !== 101) {
    failures.push({ check: 'census:total', message: `实体总数 ${census.total},应为 101` })
  }
  if (!census.netEntityIds.every((id) => isHostNetEntityId(id))) {
    failures.push({ check: 'census:id', message: 'census netEntityId must be 32-hex (two u64), not loop index' })
  }

  const account = findKind(serverEvents, 'account')
  if (account?.wrongPasswordCode && account.wrongPasswordCode !== 'wrong_password') {
    failures.push({ check: 's1:wrong-password', message: `wrong password code=${account.wrongPasswordCode}` })
  }
  if (!account || account.wrongPasswordCode !== 'wrong_password') {
    failures.push({ check: 's1:wrong-password', message: 'account log must observe wrong_password' })
  }

  const observed = chatEventsFromClient(clientEvents)
  if (observed.length === 0) {
    failures.push({ check: 's3:chat-event', message: 'client logs must contain received chat.event' })
  }

  const queryBlob = blobOf(serverEvents) + '\n' + blobOf(clientEvents)
  for (const needed of ['unauthorized', 'invisible', 'stale']) {
    if (!queryBlob.includes(needed)) {
      failures.push({ check: 's5:missing', message: `logs missing query outcome ${needed}` })
    }
  }

  const tick = findKind(clientEvents, 'tick') ?? findKind(serverEvents, 'tick')
  const tickSource = tick?.tickSource ?? tick?.tickPath ?? ''
  if (tickSource !== ORACLE_TICK_SOURCE) {
    failures.push({ check: 's6:tick-source', message: `tickSource must be ${ORACLE_TICK_SOURCE}` })
  }
  const cadenceTicks = tick?.utteranceTicks
  if (!Array.isArray(cadenceTicks) || !CLIENT_CADENCE_TICKS.every((t) => cadenceTicks.includes(t))) {
    failures.push({ check: 's6:cadence', message: 'Client Timer Manager trace must include ticks 5,10,15' })
  }
  if (tick && tick.messageType !== 'InputCommand') {
    failures.push({ check: 's6:messageType', message: `messageType=${tick.messageType}, expected InputCommand` })
  }
  if (tick && tick.mappingId !== 'chat.input') {
    failures.push({ check: 's6:mappingId', message: `mappingId=${tick.mappingId}, expected chat.input` })
  }

  const windowLines = windowLinesFromClient(clientEvents)
  if (windowLines.length !== 101) {
    failures.push({ check: 's6:window', message: `client window lines ${windowLines.length}, expected 101` })
  } else {
    for (let i = 1; i < windowLines.length; i++) {
      if (Number(windowLines[i].roomSequence) <= Number(windowLines[i - 1].roomSequence)) {
        failures.push({ check: 's6:roomSequence', message: 'window.lines order must match strictly increasing roomSequence' })
        break
      }
    }
  }

  const snapshot = findKind(serverEvents, 'snapshot')
  const restore = findKind(serverEvents, 'restore') ?? findKind(clientEvents, 'restore')
  if (!snapshot) {
    failures.push({ check: 's7:snapshot-material', message: 'server logs must contain snapshot' })
  }
  if (Number(snapshot?.historyCount ?? snapshot?.historyCountMax ?? 1) !== 0) {
    failures.push({ check: 's7:history', message: `snapshot historyCount=${snapshot?.historyCount}` })
  }
  const restoredWindow = Number(restore?.windowAfter ?? restore?.restoredWindow ?? -1)
  if (restoredWindow !== 0) {
    failures.push({ check: 's7:window-restore', message: 'Restore 后聊天窗必须为空' })
  }
  const pidA = Number(snapshot?.processA ?? snapshot?.pid ?? 0)
  const pidB = Number(restore?.processB ?? restore?.pid ?? 0)
  if (!Number.isInteger(pidA) || !Number.isInteger(pidB) || pidA <= 0 || pidB <= 0 || pidA === pidB) {
    failures.push({ check: 's7:cross-process', message: 'S7 requires host process A persist then process B restore' })
  }
  if (!/^[0-9a-f]{64}$/.test(String(snapshot?.snapshotSha256 ?? restore?.snapshotSha256 ?? ''))) {
    failures.push({ check: 's7:snapshot-file', message: 'S7 snapshot file sha256 missing' })
  }

  const rebind = findKind(serverEvents, 'rebind') ?? findKind(clientEvents, 'rebind')
  const prev = parseSenderNetEntityId(rebind?.previousNetEntityId ?? rebind?.entityA)
  const next = parseSenderNetEntityId(rebind?.netEntityId ?? rebind)
  if (!prev || !next || prev !== next) {
    failures.push({ check: 's8:rebind', message: 'scenario 8 must rebind the same 32-hex NetEntityId' })
  }
  if (!hasKind(serverEvents, 'superseded') && !hasKind(clientEvents, 'superseded')) {
    failures.push({ check: 's8:superseded', message: 'ConnectionSuperseded must be logged on the old connection' })
  }

  const expiry = findKind(serverEvents, 'expire') ?? findKind(clientEvents, 'expire')
  const entityA = parseSenderNetEntityId(expiry?.entityA)
  const entityB = parseSenderNetEntityId(expiry?.entityB)
  if (expiry?.tombstoned !== true) {
    failures.push({ check: 's9:tombstone', message: 'scenario 9 过期后 A 必须 tombstone,B 用新 NetEntityId' })
  }
  if (entityA && entityB && entityA === entityB) {
    failures.push({ check: 's9:new-id', message: 'scenario 9 entity B must use a different host NetEntityId' })
  }

  const deferred = findKind(serverEvents, 'deferred') ?? findKind(clientEvents, 'deferred')
  const deferredReason = String(deferred?.reason ?? deferred?.message ?? '')
  if (!/ADR-058/i.test(deferredReason) || Number(deferred?.scenario ?? 10) !== 10) {
    failures.push({ check: 's10:deferred', message: 'S10 must be deferred (ADR-058 §11), not pass-by-relaxation' })
  }

  if (observed.length !== 101) {
    failures.push({
      check: 's11:synthesized',
      message: 'eventOrder/appliedTicks must come from client-received chat.event, not send counts',
    })
  }

  const eventOrder = observed.map((ev) => eventOrderKey(ev))
  const appliedTicks = observed.map((ev) => ev.appliedTick)

  return {
    ok: failures.length === 0,
    failures,
    census,
    eventOrder,
    appliedTicks,
    windowLines,
  }
}

export function compareRuns(a, b) {
  const failures = []
  if (!a?.ok) failures.push({ check: 'round-1', message: JSON.stringify(a?.failures ?? []) })
  if (!b?.ok) failures.push({ check: 'round-2', message: JSON.stringify(b?.failures ?? []) })
  if ((a?.census?.botCount !== b?.census?.botCount)
    || (a?.census?.playerCount !== b?.census?.playerCount)
    || (a?.census?.total !== b?.census?.total)) {
    failures.push({ check: 'census-compare', message: 'entity counts differ across runs' })
  }
  const leftOrder = Array.isArray(a?.eventOrder) ? a.eventOrder : []
  const rightOrder = Array.isArray(b?.eventOrder) ? b.eventOrder : []
  if (JSON.stringify(leftOrder) !== JSON.stringify(rightOrder)) {
    failures.push({ check: 'event-order-compare', message: 'event order differs across runs' })
  }
  const leftTicks = Array.isArray(a?.appliedTicks) ? a.appliedTicks : []
  const rightTicks = Array.isArray(b?.appliedTicks) ? b.appliedTicks : []
  if (JSON.stringify(leftTicks) !== JSON.stringify(rightTicks)) {
    failures.push({ check: 'applied-tick-compare', message: 'applied Tick values differ across runs' })
  }
  return { ok: failures.length === 0, failures, round1: a, round2: b }
}

export function verifyEvidenceDir(dir) {
  if (!dir || !existsSync(dir)) {
    return { ok: false, failures: [{ check: 'pack:missing', message: `日志目录不存在: ${dir}` }] }
  }
  const r1 = join(dir, 'round-1')
  const r2 = join(dir, 'round-2')
  if (!existsSync(r1) || !existsSync(r2)) {
    return { ok: false, failures: [{ check: 'pack:rounds', message: '缺少 round-1 / round-2 服务器与客户端日志目录' }] }
  }
  const left = verifyRunFromLogs(resolveRoleDir(r1, 'server'), resolveRoleDir(r1, 'client'))
  const right = verifyRunFromLogs(resolveRoleDir(r2, 'server'), resolveRoleDir(r2, 'client'))
  return compareRuns(left, right)
}

export function senderHex(instanceId, counter) {
  return (u64ToHex16(instanceId) + u64ToHex16(counter)).toLowerCase()
}

function ndjson(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
}

export function writeOracleMinFixture(dir, { crlf = false, harnessJunk = true } = {}) {
  mkdirSync(join(dir, 'round-1', 'server'), { recursive: true })
  mkdirSync(join(dir, 'round-1', 'client'), { recursive: true })
  mkdirSync(join(dir, 'round-2', 'server'), { recursive: true })
  mkdirSync(join(dir, 'round-2', 'client'), { recursive: true })
  const instanceId = 0x1000000000000001n
  const admits = []
  const events = []
  const windows = []
  for (let i = 1; i <= 101; i++) {
    const hex = senderHex(instanceId, i)
    const entityType = i === 101 ? 'player' : 'bot'
    admits.push({
      kind: 'entity_admitted',
      ts: '2026-09-03T00:00:00Z',
      tick: 1,
      netEntityId: hex,
      entityType,
      roomId: MAIN_ROOM,
    })
    events.push({
      kind: 'chat.event',
      ts: '2026-09-03T00:00:01Z',
      tick: 1,
      messageId: i,
      roomSequence: i,
      senderNetEntityId: hex,
      senderNetEntityIdInstanceId: instanceId.toString(),
      senderNetEntityIdCounter: i,
      text: `hello-${i}`,
      appliedTick: 1,
    })
    windows.push({
      kind: 'chat.window',
      phase: 'live',
      roomSequence: i,
      messageId: i,
      senderNetEntityId: hex,
      text: `hello-${i}`,
      appliedTick: 1,
    })
  }
  const extraServer = [
    { kind: 'host', process: 'lumio-entity-chat-replay', pid: 4242 },
    { kind: 'account', wrongPasswordCode: 'wrong_password' },
    { kind: 'query', outcome: 'unauthorized' },
    { kind: 'query', outcome: 'invisible' },
    { kind: 'query', outcome: 'stale' },
    {
      kind: 'snapshot',
      historyCount: 0,
      windowBefore: 101,
      processA: 11,
      snapshotSha256: 'b'.repeat(64),
    },
    { kind: 'restore', windowAfter: 0, lastMessageTextEqual: true, processB: 12 },
    { kind: 'superseded', netEntityId: senderHex(instanceId, 100), reason: 'account_already_online' },
    {
      kind: 'rebind',
      netEntityId: senderHex(instanceId, 100),
      previousNetEntityId: senderHex(instanceId, 100),
    },
    {
      kind: 'expire',
      tombstoned: true,
      entityA: senderHex(instanceId, 99),
      entityB: senderHex(instanceId, 102),
      reason: 'retention',
    },
    { kind: 'deferred', scenario: 10, reason: 'ADR-058 §11 multi-room deferred' },
  ]
  const extraClient = [
    {
      kind: 'tick',
      tickSource: ORACLE_TICK_SOURCE,
      utteranceTicks: [...CLIENT_CADENCE_TICKS],
      messageType: 'InputCommand',
      mappingId: 'chat.input',
      payload: '020000006767',
      payloadSha256: '5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab',
    },
  ]
  const serverText = ndjson([...extraServer, ...admits])
  const clientText = ndjson([...extraClient, ...events, ...windows])
  const toWrite = crlf ? (s) => s.replace(/\n/g, '\r\n') : (s) => s
  for (const round of ['round-1', 'round-2']) {
    writeFileSync(join(dir, round, 'server', 'server.ndjson'), toWrite(serverText))
    writeFileSync(join(dir, round, 'client', 'client.ndjson'), toWrite(clientText))
    if (harnessJunk) {
      writeFileSync(join(dir, round, 'evidence.json'), '{"ok":true,"note":"harness evidence.json must be ignored"}\n')
      writeFileSync(join(dir, round, 'timer-trace.json'), '{"tickSource":"for-loop"}\n')
    }
  }
  return dir
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

function isCliMain() {
  if (!process.argv[1]) return false
  return fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()
}

if (isCliMain() && !process.env.NODE_TEST_CONTEXT) {
  const args = parseArgs(process.argv.slice(2))
  if (args.dir) {
    const report = verifyEvidenceDir(args.dir)
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.ok ? 0 : 1)
  }
  process.stderr.write('usage: node verify-evidence.mjs --dir <logs>\n')
  process.exit(2)
}

const test = process.env.NODE_TEST_CONTEXT ? nodeTest : () => {}

test('oracleSha256 normalizes CRLF to LF before hashing', () => {
  const lf = 'line-one\nline-two\n'
  const crlf = 'line-one\r\nline-two\r\n'
  const dir = join(dirname(oracleFilePath()), '.tmp-oracle-sha')
  mkdirSync(dir, { recursive: true })
  const lfPath = join(dir, 'lf.txt')
  const crlfPath = join(dir, 'crlf.txt')
  writeFileSync(lfPath, lf)
  writeFileSync(crlfPath, crlf)
  assert.equal(oracleSha256(lfPath), oracleSha256(crlfPath))
  assert.notEqual(
    createHash('sha256').update(readFileSync(crlfPath)).digest('hex'),
    oracleSha256(crlfPath),
  )
})

test('parseSenderNetEntityId: 32-hex equals two u64 halves', () => {
  const hex = senderHex(0n, 101n)
  assert.equal(hex, '00000000000000000000000000000065')
  assert.equal(parseSenderNetEntityId(hex), hex)
  assert.equal(parseSenderNetEntityId({ senderNetEntityIdInstanceId: 0, senderNetEntityIdCounter: 101 }), hex)
  assert.equal(isHostNetEntityId('101'), false)
  assert.equal(isLauncherLoopIndex('101'), true)
  assert.equal(isHostNetEntityId(hex), true)
})

test('parseSenderNetEntityId: Runtime instanceId 0x1000000000000001 keeps low bit', () => {
  const hex = senderHex(0x1000000000000001n, 0x10n)
  assert.equal(hex, '10000000000000010000000000000010')
  assert.notEqual(hex, '10000000000000000000000000000010')
  assert.equal(
    parseSenderNetEntityId({
      senderNetEntityIdInstanceId: 0x1000000000000001n,
      senderNetEntityIdCounter: 0x10n,
    }),
    hex,
  )
})

test('空日志目录必须 FAIL', () => {
  const report = verifyEvidenceDir(join(dirname(oracleFilePath()), 'logs', 'missing-pack'))
  assert.equal(report.ok, false)
})

test('harness evidence.json / timer-trace.json 不是输入', () => {
  const dir = join(dirname(oracleFilePath()), '.tmp-oracle-evidence-only')
  mkdirSync(join(dir, 'round-1'), { recursive: true })
  mkdirSync(join(dir, 'round-2'), { recursive: true })
  writeFileSync(join(dir, 'round-1', 'evidence.json'), '{"ok":true,"census":{"total":101}}\n')
  writeFileSync(join(dir, 'round-2', 'evidence.json'), '{"ok":true,"census":{"total":101}}\n')
  const report = verifyEvidenceDir(dir)
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.check === 'logs:missing' || f.check === 'round-1' || f.check === 'round-2'))
})

test('fixture --dir 在 LF 与 CRLF 下均为 ok', () => {
  const root = dirname(oracleFilePath())
  const lfDir = join(root, '.tmp-oracle-min-lf')
  const crlfDir = join(root, '.tmp-oracle-min-crlf')
  writeOracleMinFixture(lfDir, { crlf: false })
  writeOracleMinFixture(crlfDir, { crlf: true })
  const lf = verifyEvidenceDir(lfDir)
  const crlf = verifyEvidenceDir(crlfDir)
  assert.equal(lf.ok, true, JSON.stringify(lf.failures))
  assert.equal(crlf.ok, true, JSON.stringify(crlf.failures))
  assert.equal(JSON.stringify(lf.round1.eventOrder), JSON.stringify(crlf.round1.eventOrder))
})

test('compareRuns 逐位比较 eventOrder 四元组；同多重集不同顺序必须 FAIL', () => {
  const root = dirname(oracleFilePath())
  const dir = join(root, '.tmp-oracle-min-order')
  writeOracleMinFixture(dir)
  const good = verifyEvidenceDir(dir)
  assert.equal(good.ok, true, JSON.stringify(good.failures))
  const drifted = structuredClone(good.round2)
  const last = drifted.eventOrder[100]
  drifted.eventOrder[100] = drifted.eventOrder[99]
  drifted.eventOrder[99] = last
  const cmp = compareRuns(good.round1, drifted)
  assert.equal(cmp.ok, false)
  assert.ok(cmp.failures.some((f) => f.check === 'event-order-compare'), JSON.stringify(cmp.failures))
})

test('compareRuns appliedTicks 逐值比较；只比长度必须 FAIL', () => {
  const root = dirname(oracleFilePath())
  const dir = join(root, '.tmp-oracle-min-ticks')
  writeOracleMinFixture(dir)
  const good = verifyEvidenceDir(dir)
  const drifted = structuredClone(good.round2)
  assert.equal(drifted.appliedTicks.length, 101)
  drifted.appliedTicks = drifted.appliedTicks.map((tick, i) => (i === 50 ? tick + 1 : tick))
  const cmp = compareRuns(good.round1, drifted)
  assert.equal(cmp.ok, false)
  assert.ok(cmp.failures.some((f) => f.check === 'applied-tick-compare'), JSON.stringify(cmp.failures))
})

test('committed fixture --dir 为 ok', () => {
  const dir = join(dirname(oracleFilePath()), 'fixtures', 'oracle-min')
  const report = verifyEvidenceDir(dir)
  assert.equal(report.ok, true, JSON.stringify(report.failures))
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const cli = spawnSync(process.execPath, [oracleFilePath(), '--dir', dir], { encoding: 'utf8', env })
  assert.equal(cli.status, 0, (cli.stderr || '') + (cli.stdout || ''))
})

test('101 窗口行来自客户端日志且 roomSequence 严格递增', () => {
  const root = dirname(oracleFilePath())
  const dir = join(root, '.tmp-oracle-min-window')
  writeOracleMinFixture(dir)
  const report = verifyRunFromLogs(join(dir, 'round-1', 'server'), join(dir, 'round-1', 'client'))
  assert.equal(report.windowLines.length, 101)
  for (let i = 1; i < report.windowLines.length; i++) {
    assert.ok(report.windowLines[i].roomSequence > report.windowLines[i - 1].roomSequence)
  }
})
