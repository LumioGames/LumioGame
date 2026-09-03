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
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'

export const MAIN_ROOM = 'room-main'
export const BROWSER_NAME = 'Browser01'
export const TEST_PASSWORD = '123456'
export const ORACLE_TICK_SOURCE = 'native-kernel/tickFrame'
export const CLIENT_CADENCE_TICKS = [5, 10, 15]

export function oracleFilePath() {
  return fileURLToPath(import.meta.url)
}

export function oracleSha256(p = oracleFilePath()) {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

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
  return isHostNetEntityId(rec.netEntityId) ? String(rec.netEntityId) : null
}

function hostBindingValue(rec, key) {
  if (!isObject(rec)) return null
  const id = rec[key]
  if (id == null) return null
  const s = String(id)
  if (s.length === 0 || s === '0' || isLauncherLoopIndex(s)) return null
  return s
}

/** Host NetEntityId is C-1 u64 (Runtime 16/32-hex) or leftover nent_*. Loop index and sess-* are not. */
export function isHostNetEntityId(id) {
  if (id == null) return false
  const s = String(id)
  if (s.length === 0 || s === '0' || isLauncherLoopIndex(s)) return false
  if (/^sess[-_]/i.test(s)) return false
  if (/^nent[-_]/i.test(s)) return true
  if (/^[0-9a-f]{16}$/i.test(s) || /^[0-9a-f]{32}$/i.test(s)) return !/^0+$/i.test(s)
  return false
}

export const S8_NENT_GAP_REASON = 'sibling-gap: FullSnapshot / 17-key host-audit / test-control do not project ConnectionBinding.NetEntityId (nent_*)'

function isHonestS8Gap(row) {
  if (!isObject(row) || row.ok !== false) return false
  const reason = row.blockedReason
  if (typeof reason !== 'string' || reason.length === 0) return false
  if (/ReferenceWorldSimulation/i.test(reason)) return false
  return /netentityid|nent[_-]|connectionbinding/i.test(reason)
    && /fullsnapshot|17-key|test-control|host-audit|project/i.test(reason)
}

function s8NetEntityIdAliasedToSession(evidence) {
  const s8 = scenario(evidence, 8)
  const t = evidence?.traces?.reconnect
  const pairs = [
    [t?.netEntityId ?? s8?.netEntityId, t?.sessionId ?? s8?.sessionId],
    [t?.previousNetEntityId ?? s8?.previousNetEntityId, t?.previousSessionId ?? s8?.previousSessionId],
  ]
  return pairs.some(([nent, sess]) => nent != null && sess != null && String(nent) === String(sess) && !isHostNetEntityId(nent))
}

function s8PaintedWithoutHostNent(evidence) {
  const s8 = scenario(evidence, 8)
  if (!isObject(s8) || s8.ok !== true) return false
  const t = evidence?.traces?.reconnect
  const entityA = t?.entityA ?? s8.entityA
  const netEntityId = t?.netEntityId ?? s8.netEntityId
  const previousNetEntityId = t?.previousNetEntityId ?? s8.previousNetEntityId
  if (typeof entityA === 'string' && /^sess[-_]/i.test(entityA)) return true
  if (!isHostNetEntityId(netEntityId) || !isHostNetEntityId(previousNetEntityId)) return true
  if (s8NetEntityIdAliasedToSession(evidence)) return true
  return false
}

/** Rebind is same host NetEntityId. Session id or login AccountId match is not a rebind. */
export function isEntityRebound(disconnected, admitted) {
  const left = disconnected?.netEntityId
  const right = admitted?.netEntityId
  return isHostNetEntityId(left) && isHostNetEntityId(right) && String(left) === String(right)
}

function reconnectBindingPair(evidence) {
  const s8 = scenario(evidence, 8)
  const t = evidence?.traces?.reconnect
  const disconnected = {
    netEntityId: t?.previousNetEntityId ?? s8?.previousNetEntityId,
    accountId: t?.previousAccountId ?? s8?.previousAccountId,
  }
  const admitted = {
    netEntityId: t?.netEntityId ?? s8?.netEntityId,
    accountId: t?.accountId ?? s8?.accountId,
  }
  return { disconnected, admitted }
}

export function isReconnectEntityRebound(evidence) {
  const { disconnected, admitted } = reconnectBindingPair(evidence)
  return isEntityRebound(disconnected, admitted)
}

/** First handshake session, then one retry with a distinct session id if missing/mismatch. */
export function reconnectSessionCandidates(bindSessionId, loginName) {
  const ids = []
  const bind = hostBindingValue({ sessionId: bindSessionId }, 'sessionId')
    ?? (typeof bindSessionId === 'string' && bindSessionId.length > 0 && bindSessionId !== '0' && !isLauncherLoopIndex(bindSessionId)
      ? bindSessionId
      : null)
  if (bind) ids.push(bind)
  else if (typeof loginName === 'string' && loginName.length > 0) ids.push(`sess-${loginName}`)
  const retry = typeof loginName === 'string' && loginName.length > 0 ? `sess-${loginName}-re` : null
  if (retry && !ids.includes(retry)) ids.push(retry)
  return ids.slice(0, 2)
}

export function shouldRetryReconnectHandshake(err) {
  const code = err?.reasonCode
  const message = String(err?.message ?? err ?? '')
  return code === 'SessionMismatch'
    || /sessionmismatch|missing host session|missing session|reconnect missing/i.test(message)
}

function isHonestSiblingGap(row) {
  return isObject(row)
    && row.ok === false
    && typeof row.blockedReason === 'string'
    && row.blockedReason.length > 0
}

export function isAcceptedHostProcess(name) {
  const s = String(name ?? '')
  if (s === 'lumio-mvp-host' || /lumio-mvp-host/i.test(s)) return false
  return s === 'lumio-entity-chat-replay' || /lumio-entity-chat-replay/i.test(s)
}

function isMvpHostTagged(ev) {
  return ev?.process === 'lumio-mvp-host' || ev?.host === 'lumio-mvp-host' || ev?.source === 'lumio-mvp-host'
}

function isReplayHostTagged(ev) {
  const name = ev?.process ?? ev?.host ?? ev?.source
  return name === 'lumio-entity-chat-replay'
}

function isSeventeenKeyTrace(ev) {
  if (!isObject(ev)) return false
  return MVP_HOST_TRACE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(ev, key))
}

function isMvpHostProcessLine(ev) {
  if (!isObject(ev)) return false
  const seqOk = Number.isInteger(ev.seq)
  const kind = eventKind(ev)
  if (isReplayHostTagged(ev) && isHostNetEntityId(ev.netEntityId)) return true
  if (!seqOk || (kind !== 'audit' && kind !== 'ack' && kind !== 'state')) return false
  return isMvpHostTagged(ev) || isReplayHostTagged(ev) || kind === 'audit' || isSeventeenKeyTrace(ev)
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

/** Host-audit must come from live lumio-mvp-host or lumio-entity-chat-replay, not a GameRoomHost dump. */
export function hasMvpHostProcessAudit(evidence, auditText = '') {
  const proc = evidence?.hostProcess
  const named = isAcceptedHostProcess(proc?.process)
    && Number.isInteger(Number(proc.pid))
    && Number(proc.pid) > 0
  if (!named) return false
  return parseNdjson(auditText).some(({ ev }) => isMvpHostProcessLine(ev) || isHostNetEntityId(ev.netEntityId))
}

function hasIndependentTraces(evidence) {
  const t = evidence?.traces
  if (!isObject(t)) return false
  const accountOk = t.account?.wrongPasswordCode === 'wrong_password' || t.account?.createAck === true
  if (!accountOk) return false
  const bindings = Array.isArray(t.bindings)
    ? t.bindings.filter((row) => isHostNetEntityId(row?.netEntityId))
    : []
  const handshakeOk = Number(t.handshake?.completed ?? 0) === 101
    || (Array.isArray(t.handshake?.sessionIds) && t.handshake.sessionIds.length === 101)
    || bindings.length === 101
  const reconnectOk = isReconnectEntityRebound(evidence)
    || t.reconnect?.rebound === true
    || isHostNetEntityId(t.reconnect?.entityA)
  return handshakeOk || reconnectOk
}

function hasRealQueryTraces(evidence) {
  const traces = evidence?.traces?.queries
  const s5 = scenario(evidence, 5)
  const blob = `${JSON.stringify(traces ?? {})}\n${JSON.stringify(s5)}`.toLowerCase()
  return ['unauthorized', 'invisible', 'stale'].every((k) => blob.includes(k))
}

function liveSnapshotSource(source) {
  return source === 'lumio-entity-chat-replay'
    || source === 'live-replay'
}

function hostTimerTickSource(source) {
  const s = String(source ?? '')
  if (/for-loop|forloop|test-control\/tick/i.test(s)) return false
  return s === ORACLE_TICK_SOURCE
}

function eventOrderKey(entry) {
  const parts = String(entry).split(':')
  if (parts.length >= 3) return parts.slice(1).join(':')
  return String(entry)
}

function observedChatEvents(evidence) {
  const lists = [
    evidence?.traces?.chat?.receivedEvents,
    scenario(evidence, 11)?.receivedEvents,
    evidence?.playwright?.receivedEvents,
    evidence?.playwright?.windowLines,
    scenario(evidence, 6)?.windowLines,
  ]
  const best = lists
    .filter((rows) => Array.isArray(rows) && rows.length > 0)
    .sort((a, b) => b.length - a.length)[0] ?? []
  return best.filter((ev) => isObject(ev)
    && typeof ev.roomSequence === 'number'
    && typeof ev.appliedTick === 'number'
    && typeof ev.text === 'string')
}

function playwrightReceivedChatEvent(pw) {
  if (!isObject(pw)) return false
  if (pw.receivedChatEvent === true) return true
  if (Array.isArray(pw.receivedEvents) && pw.receivedEvents.length > 0) return true
  if (Array.isArray(pw.windowLines) && pw.windowLines.length > 0) return true
  return false
}

export function playwrightRan(evidence) {
  const pw = evidence?.playwright ?? scenario(evidence, 3)?.playwright
  if (!isObject(pw) || pw.ran !== true) return false
  const browser = String(pw.browser ?? '')
  if (!/chromium|firefox|webkit/i.test(browser)) return false
  if (pw.injected === true) return false
  return pw.receivedFromNetwork === true && playwrightReceivedChatEvent(pw)
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

function recordHostNent(byId, rec) {
  if (!isObject(rec) || rec.ok === false) return
  if (rec.roomId && rec.roomId !== MAIN_ROOM) return
  const id = rec.netEntityId
  const type = entityTypeOf(rec)
  if (!isHostNetEntityId(id) || type == null) return
  byId.set(String(id), type)
}

/** Distinct C-1 host NetEntityId census from 17-key host-audit / bindings. Session ids are not NetEntityId. */
export function censusFromHostAudit(auditText) {
  const byId = new Map()
  for (const { ev } of parseNdjson(auditText)) {
    if (!isHostNetEntityId(ev.netEntityId)) continue
    if (!isAdmitKind(eventKind(ev)) && !isSeventeenKeyTrace(ev) && !isMvpHostTagged(ev) && !isReplayHostTagged(ev)) continue
    recordHostNent(byId, ev)
  }
  return censusFromIdMap(byId)
}

function censusFromBindings(evidence) {
  const rows = evidence?.traces?.bindings ?? evidence?.bindings
  const byId = new Map()
  if (!Array.isArray(rows)) return censusFromIdMap(byId)
  for (const rec of rows) recordHostNent(byId, rec)
  return censusFromIdMap(byId)
}

function censusFromLiveAdmits(evidence, admitTraceText = '') {
  const byId = new Map()
  const admits = evidence?.liveAdmits?.admits
  if (Array.isArray(admits)) {
    for (const rec of admits) recordHostNent(byId, rec)
  }
  if (byId.size < 101 && admitTraceText) {
    for (const { ev } of parseNdjson(admitTraceText)) {
      if (ev.process && !isAcceptedHostProcess(ev.process)) continue
      recordHostNent(byId, ev)
    }
  }
  return censusFromIdMap(byId)
}

export function censusFromEvidence(evidence, auditText = '', admitTraceText = '') {
  if (!hasMvpHostProcessAudit(evidence, auditText)) {
    return emptyCensus()
  }
  const fromBindings = censusFromBindings(evidence)
  if (fromBindings.total === 101) return fromBindings
  const fromAudit = censusFromHostAudit(auditText)
  if (fromAudit.total === 101) return fromAudit
  const fromLive = censusFromLiveAdmits(evidence, admitTraceText)
  if (fromLive.total === 101 && hostAuditHasBindingEvidence(auditText, admitTraceText)) {
    return fromLive
  }
  return fromBindings.total > 0
    ? fromBindings
    : (fromAudit.total > 0 ? fromAudit : fromLive)
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
  const hostName = evidence?.hostProcess?.process
  if (hostName === 'lumio-mvp-host' || /lumio-mvp-host/i.test(String(hostName ?? ''))) {
    failures.push({ check: 'host:mvp-impersonation', message: 'lumio-mvp-host is never a SUCCESS path' })
  }
  if (!hasMvpHostProcessAudit(evidence, auditText)) {
    failures.push({ check: 'host:mvp', message: 'suite-only host is not C# MVP host' })
  }
  if (!isAcceptedHostProcess(hostName)) {
    failures.push({ check: 'host:rust', message: 'hostProcess must name lumio-entity-chat-replay with a live pid' })
  }
  if (String(evidence.oracleSha256 ?? '') !== oracleSha256()) {
    failures.push({ check: 'oracle:sha256', message: 'evidence.oracleSha256 must be sha256 of verify-evidence.mjs' })
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
    if (!isObject(row) || row.ok !== true) {
      failures.push({ check: `scenario-${i}`, message: `scenario ${i} missing or not ok` })
    }
  }

  const bindingOk = hostAuditHasBindingEvidence(auditText, admitTraceText)
    && census.total === 101
    && census.netEntityIds.length === 101
    && census.netEntityIds.every((id) => isHostNetEntityId(id))
  const s4 = scenario(evidence, 4)
  if (s4.ok === true && !bindingOk) {
    failures.push({
      check: 's4:binding',
      message: 'S4 requires bindings + 17-key audit netEntityId (C-1 u64 / 32-hex), not sessionId or login accountId',
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
  const pw = evidence?.playwright ?? s3?.playwright
  if (pw?.injected === true) {
    failures.push({ check: 's3:injected', message: 'must not inject DOM events and mark Browser ok' })
  }
  if (s3.ok === true && !playwrightReceivedChatEvent(pw)) {
    failures.push({ check: 's3:chat-event', message: 'receivedFromNetwork means the Playwright page received at least one chat.event' })
  }

  const s5 = scenario(evidence, 5)
  if (s5.ok === true && !hasRealQueryTraces(evidence)) {
    failures.push({
      check: 'scenario-5:suite-double',
      message: 'scenario 5 ok:true from GameRoomHost is not live mvp-host',
    })
    failures.push({ check: 's5:traces', message: 'scenario 5 requires real query traces (unauthorized/invisible/stale)' })
  }
  if (s5.ok === true) {
    const s5text = `${JSON.stringify(evidence?.traces?.queries ?? {})}\n${JSON.stringify(s5)}`.toLowerCase()
    for (const needed of ['unauthorized', 'invisible', 'stale']) {
      if (!s5text.includes(needed)) {
        failures.push({ check: 's5:missing', message: `scenario 5 缺少 ${needed}` })
      }
    }
  }

  const s6 = scenario(evidence, 6)
  const tickSource = s6.tickSource ?? s6.tickPath ?? evidence?.traces?.chat?.tickSource ?? ''
  if (s6.timerManagerInvoked === true && !hostTimerTickSource(tickSource)) {
    failures.push({
      check: 's6:tick-source',
      message: `timerManagerInvoked requires ${ORACLE_TICK_SOURCE} (Client Timer Manager), not a for-loop or test-control/tick`,
    })
  }
  if (s6.ok === true && s6.timerManagerInvoked !== true) {
    failures.push({ check: 's6:timer', message: 'Client Timer Manager not invoked; chat is tick-batched; Timer is a known gap' })
  }
  if (s6.ok === true && tickSource !== ORACLE_TICK_SOURCE) {
    failures.push({ check: 's6:tick-source', message: `scenario 6 tickSource must be ${ORACLE_TICK_SOURCE}` })
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
    const cadenceTicks = s6.utteranceTicks ?? evidence?.traces?.chat?.utteranceTicks
    if (!Array.isArray(cadenceTicks) || !CLIENT_CADENCE_TICKS.every((t) => cadenceTicks.includes(t))) {
      failures.push({ check: 's6:cadence', message: 'Client Timer Manager trace must include ticks 5,10,15' })
    }
    const windowLines = Array.isArray(s6.windowLines)
      ? s6.windowLines
      : (Array.isArray(pw?.windowLines) ? pw.windowLines : [])
    if (windowLines.length !== 101) {
      failures.push({ check: 's6:window', message: `Playwright __lumioChat.window.lines length ${windowLines.length}, expected 101` })
    } else {
      for (let i = 1; i < windowLines.length; i++) {
        if (Number(windowLines[i].roomSequence) <= Number(windowLines[i - 1].roomSequence)) {
          failures.push({ check: 's6:roomSequence', message: 'window.lines order must match strictly increasing roomSequence' })
          break
        }
      }
    }
  }

  const s7 = scenario(evidence, 7)
  const persist = evidence?.traces?.persist ?? {}
  const windowBefore = Number(
    persist.clientWindowBeforeSnapshot ?? s7.windowBeforeSnapshot ?? s7.chatEventsBeforeSnapshot ?? 0,
  )
  if (s7.ok === true && s7.snapshotSource && !liveSnapshotSource(s7.snapshotSource)) {
    failures.push({
      check: 's7:suite-double',
      message: 'GameRoomHost persist snapshotSource is not live mvp-host',
    })
  }
  if (s7.ok === true && windowBefore <= 0) {
    failures.push({ check: 's7:snapshot-material', message: 'snapshot must exercise material that could have contained history (HistoryCount default 0 is not a test)' })
  }
  if (s7.ok === true && Number(s7.historyCountMax ?? persist.historyCountMax ?? 0) !== 0) {
    failures.push({ check: 's7:history', message: `snapshot historyCount=${s7.historyCountMax}` })
  }
  if (s7.ok === true && persist.clientWindowAfterRestore == null) {
    failures.push({ check: 's7:restored-unmeasured', message: 'restoredWindow must be the measured client window after restore' })
  } else if (s7.ok === true && Number(s7.restoredWindow ?? 0) !== Number(persist.clientWindowAfterRestore ?? 0)) {
    failures.push({ check: 's7:window-restore', message: 'Restore 后聊天窗必须为空' })
  }
  if (s7.ok === true && Number(s7.restoredWindow ?? persist.clientWindowAfterRestore ?? 0) !== 0) {
    failures.push({ check: 's7:window-restore', message: 'Restore 后聊天窗必须为空' })
  }
  const pidA = Number(persist.processA?.pid ?? 0)
  const pidB = Number(persist.processB?.pid ?? 0)
  if (s7.ok === true && (!Number.isInteger(pidA) || !Number.isInteger(pidB) || pidA <= 0 || pidB <= 0 || pidA === pidB)) {
    failures.push({ check: 's7:cross-process', message: 'S7 requires host process A persist then process B restore' })
  }
  if (s7.ok === true && !/^[0-9a-f]{64}$/.test(String(persist.snapshotSha256 ?? ''))) {
    failures.push({ check: 's7:snapshot-file', message: 'S7 snapshot file sha256 missing' })
  }

  if (s8PaintedWithoutHostNent(evidence) || s8NetEntityIdAliasedToSession(evidence) || !isReconnectEntityRebound(evidence)) {
    failures.push({ check: 's8:rebind', message: 'scenario 8 五分钟内重连必须重绑实体 A (host NetEntityId, not sessionId or login AccountId)' })
  }
  const s8 = scenario(evidence, 8)
  const superseded = evidence?.traces?.reconnect?.connectionSupersededReceived ?? s8.connectionSupersededReceived
  if (s8.ok === true && superseded !== true) {
    failures.push({ check: 's8:superseded', message: 'ConnectionSuperseded must be received on the old connection' })
  }

  const s9 = scenario(evidence, 9)
  const expiry = evidence?.traces?.expiry ?? {}
  const entityA = expiry.entityA ?? s9.entityA
  const entityB = expiry.entityB ?? s9.entityB ?? s9.netEntityIdB
  if (s9.ok === true && s9.tombstoned !== true && expiry.tombstoned !== true) {
    failures.push({ check: 's9:tombstone', message: 'scenario 9 过期后 A 必须 tombstone,B 用新 NetEntityId' })
  }
  if (s9.ok === true && isHostNetEntityId(entityA) && isHostNetEntityId(entityB) && String(entityA) === String(entityB)) {
    failures.push({ check: 's9:new-id', message: 'scenario 9 entity B must use a different host NetEntityId' })
  }

  const s11 = scenario(evidence, 11)
  const observed = observedChatEvents(evidence)
  if (s11.ok === true) {
    if (observed.length !== 101) {
      failures.push({
        check: 's11:synthesized',
        message: 'eventOrder/appliedTicks must come from client-received chat.event, not send counts',
      })
    }
    if (!Array.isArray(s11.eventOrder) || s11.eventOrder.length !== 101) {
      failures.push({ check: 'event-order', message: `eventOrder length ${s11.eventOrder?.length}` })
    }
    const observedTicks = observed.map((ev) => ev.appliedTick)
    if (!Array.isArray(s11.appliedTicks) || s11.appliedTicks.length !== observedTicks.length
      || (observedTicks.length === 101 && JSON.stringify(s11.appliedTicks) !== JSON.stringify(observedTicks))) {
      failures.push({ check: 'applied-tick', message: 'appliedTicks must match appliedTick on received chat.event' })
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
    eventOrder: (s11.eventOrder ?? []).map(eventOrderKey),
    appliedTicks: s11.appliedTicks ?? [],
  }
}

function packCompareTexts(eventOrder) {
  return [...(eventOrder ?? [])].map((entry) => {
    const s = String(entry)
    const cut = s.lastIndexOf(':')
    if (cut === -1) return s
    const tail = s.slice(cut + 1)
    if (!/^\d+$/.test(tail)) return s
    return s.slice(0, cut)
  }).sort()
}

export function compareRuns(a, b, auditA = '', auditB = '', admitA = '', admitB = '') {
  const left = verifyRun(a, auditA, admitA)
  const right = verifyRun(b, auditB, admitB)
  const failures = []
  if (!left.ok) failures.push({ check: 'round-1', message: JSON.stringify(left.failures) })
  if (!right.ok) failures.push({ check: 'round-2', message: JSON.stringify(right.failures) })
  if (left.census.botCount !== right.census.botCount
    || left.census.playerCount !== right.census.playerCount
    || left.census.total !== right.census.total) {
    failures.push({ check: 'census-compare', message: 'entity counts differ across runs' })
  }
  const leftTexts = packCompareTexts(left.eventOrder)
  const rightTexts = packCompareTexts(right.eventOrder)
  if (leftTexts.length !== 101 || rightTexts.length !== 101
    || JSON.stringify(leftTexts) !== JSON.stringify(rightTexts)) {
    failures.push({ check: 'event-order-compare', message: 'event order differs across runs' })
  }
  const leftTicks = Array.isArray(left.appliedTicks) ? left.appliedTicks : []
  const rightTicks = Array.isArray(right.appliedTicks) ? right.appliedTicks : []
  if (leftTicks.length !== 101 || rightTicks.length !== 101) {
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

function attachN12Observations(evidence) {
  const s11 = evidence.scenarios?.['11'] ?? {}
  const eventOrder = Array.isArray(s11.eventOrder) ? s11.eventOrder : []
  const events = eventOrder.map((entry, i) => {
    const parts = String(entry).split(':')
    return {
      messageId: i + 1,
      roomSequence: i + 1,
      senderNetEntityId: parts[0],
      text: parts.length >= 3 ? parts.slice(1, -1).join(':') : String(entry),
      appliedTick: Number(s11.appliedTicks?.[i] ?? 1),
      source: i === eventOrder.length - 1 ? 'playwright' : 'node',
    }
  })
  evidence.oracleSha256 = oracleSha256()
  evidence.playwright = {
    ...(evidence.playwright ?? {}),
    ran: true,
    browser: evidence.playwright?.browser ?? 'chromium',
    receivedFromNetwork: events.length > 0,
    injected: false,
    receivedChatEvent: events.length > 0,
    eventCount: events.length,
    windowLines: events,
    receivedEvents: events.filter((ev) => ev.source === 'playwright'),
  }
  evidence.traces = evidence.traces ?? {}
  evidence.traces.chat = {
    ...(evidence.traces.chat ?? {}),
    tickSource: ORACLE_TICK_SOURCE,
    timerManagerInvoked: true,
    cadence: ORACLE_TICK_SOURCE,
    utteranceTicks: [...CLIENT_CADENCE_TICKS],
    receivedEvents: events,
    eventCount: events.length,
  }
  evidence.traces.persist = {
    snapshotSource: 'lumio-entity-chat-replay',
    historyCountMax: 0,
    clientWindowBeforeSnapshot: events.length,
    clientWindowAfterRestore: 0,
    snapshotSha256: 'b'.repeat(64),
    lastMessageTextEqual: true,
    processA: { pid: 11, process: 'lumio-entity-chat-replay' },
    processB: { pid: 12, process: 'lumio-entity-chat-replay' },
    ...(evidence.traces.persist ?? {}),
    clientWindowBeforeSnapshot: events.length,
    clientWindowAfterRestore: 0,
    snapshotSha256: evidence.traces.persist?.snapshotSha256 ?? 'b'.repeat(64),
    processA: evidence.traces.persist?.processA ?? { pid: 11, process: 'lumio-entity-chat-replay' },
    processB: evidence.traces.persist?.processB ?? { pid: 12, process: 'lumio-entity-chat-replay' },
  }
  evidence.traces.reconnect = {
    ...(evidence.traces.reconnect ?? {}),
    connectionSupersededReceived: true,
  }
  if (evidence.scenarios?.['6']) {
    evidence.scenarios['6'] = {
      ...evidence.scenarios['6'],
      tickSource: ORACLE_TICK_SOURCE,
      cadence: ORACLE_TICK_SOURCE,
      utteranceTicks: [...CLIENT_CADENCE_TICKS],
      timerManagerInvoked: true,
      windowLines: events,
    }
  }
  if (evidence.scenarios?.['7']) {
    evidence.scenarios['7'] = {
      ...evidence.scenarios['7'],
      snapshotSource: 'lumio-entity-chat-replay',
      restoredWindow: 0,
      windowBeforeSnapshot: events.length || Number(evidence.scenarios['7'].windowBeforeSnapshot ?? 0),
    }
  }
  if (evidence.scenarios?.['8']) {
    evidence.scenarios['8'] = {
      ...evidence.scenarios['8'],
      connectionSupersededReceived: true,
    }
  }
  return evidence
}

function goodEvidence() {
  const base = suiteOnlyEvidence()
  const eventOrder = base.scenarios['11'].eventOrder
  const appliedTicks = base.scenarios['11'].appliedTicks
  base.hostProcess = {
    process: 'lumio-entity-chat-replay',
    pid: 4242,
    listenUri: 'ws://127.0.0.1:19000',
    command: ['lumio-entity-chat-replay', '--out', 'round-1'],
  }
  base.playwright = { ran: true, browser: 'chromium', receivedFromNetwork: true, injected: false, eventCount: 101 }
  base.traces = {
    account: { createAck: true, loadAck: true, wrongPasswordCode: 'wrong_password' },
    reconnect: {
      rebound: true,
      entityA: 'nent-bot-100',
      sessionId: 'sess-bot-100-re',
      previousSessionId: 'sess-bot-100',
      netEntityId: 'nent-bot-100',
      previousNetEntityId: 'nent-bot-100',
      accountId: 'acct_bot100',
      previousAccountId: 'acct_bot100',
    },
    handshake: { completed: 101 },
  }
  base.scenarios['3'] = { ok: true, playwrightRan: true }
  base.scenarios['4'] = { ok: true, resolvedBots: 100, browserBound: true }
  base.scenarios['5'] = { ok: true, unauthorized: 'Unauthorized', invisible: 'Invisible', stale: 'StaleGeneration' }
  base.scenarios['6'] = {
    ok: true,
    timerManagerInvoked: true,
    cadence: ORACLE_TICK_SOURCE,
    tickSource: ORACLE_TICK_SOURCE,
    eventCount: 101,
    messageType: 'InputCommand',
    mappingId: 'chat.input',
    payload: '020000006767',
    payloadSha256: '5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab',
  }
  base.scenarios['7'] = {
    ok: true,
    historyCountMax: 0,
    restoredWindow: 0,
    windowBeforeSnapshot: 101,
    snapshotSource: 'lumio-entity-chat-replay',
  }
  base.scenarios['8'] = {
    ok: true,
    entityA: 'nent-bot-100',
    rebound: true,
    sessionId: 'sess-bot-100-re',
    previousSessionId: 'sess-bot-100',
    netEntityId: 'nent-bot-100',
    previousNetEntityId: 'nent-bot-100',
    accountId: 'acct_bot100',
    previousAccountId: 'acct_bot100',
  }
  base.scenarios['9'] = {
    ok: true,
    tombstoned: true,
    staleARejected: true,
    entityA: 'nent-bot-099',
    entityB: 'nent-bot-102',
  }
  base.scenarios['10'] = { ok: true, isoTotal: 2 }
  base.scenarios['11'] = { ok: true, eventOrder, appliedTicks, totalEntities: 101 }
  base.traces.queries = { unauthorized: 'Unauthorized', invisible: 'Invisible', stale: 'StaleGeneration' }
  base.traces.chat = { eventCount: 101, tickSource: ORACLE_TICK_SOURCE, timerManagerInvoked: true }
  base.traces.expiry = { tombstoned: true, entityA: 'nent-bot-099', entityB: 'nent-bot-102' }
  return attachN12Observations(base)
}

function goodAudit() {
  const lines = [
    JSON.stringify({ seq: 0, kind: 'audit', process: 'lumio-entity-chat-replay', eventId: 'host.start', category: 'host', severity: 'info' }),
  ]
  for (let i = 1; i <= 100; i++) {
    lines.push(JSON.stringify({
      kind: 'entity_admitted',
      process: 'lumio-entity-chat-replay',
      roomId: MAIN_ROOM,
      netEntityId: `nent-bot-${String(i).padStart(3, '0')}`,
      entityType: 'bot',
      sessionId: `sess-bot-${String(i).padStart(3, '0')}`,
    }))
  }
  lines.push(JSON.stringify({
    kind: 'entity_admitted',
    process: 'lumio-entity-chat-replay',
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
  ev.scenarios['6'] = {
    ok: true,
    timerManagerInvoked: true,
    cadence: 'client-timer-manager',
    messageType: 'InputCommand',
    mappingId: 'chat.input',
    payload: '020000006767',
    payloadSha256: '5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab',
  }
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

test('mvp-host 17-key NativeReady audit with hostProcess pid and 101 live admits must FAIL host:mvp-impersonation', () => {
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
  const audit = liveElevenAudit()
  assert.equal(audit.includes('entity_admitted'), false)
  const report = verifyRun(liveElevenGoodEvidence(), audit)
  assert.equal(report.census.botCount, 100)
  assert.equal(report.census.playerCount, 1)
  assert.equal(report.census.total, 101)
  assert.equal(report.census.netEntityIds.length, 101)
  assert.ok(report.census.netEntityIds.every((id) => isHostNetEntityId(id)))
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

test('tick-batched chat with s6.ok false is pack FAIL; SUCCESS requires host timer / test-control/tick', () => {
  const evidence = liveElevenGoodEvidence()
  evidence.scenarios['6'] = {
    ok: false,
    timerManagerInvoked: false,
    cadence: 'tick-batched',
    eventCount: 101,
  }
  evidence.traces.chat = { eventCount: 101 }
  const report = verifyRun(evidence, liveElevenAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's6:timer' || f.check === 'scenario-6'),
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
  evidence.scenarios['8'] = {
    ok: true,
    entityA: 'nent-bot-100',
    rebound: true,
    sessionId: 'sess-bot-100-re',
    previousSessionId: 'sess-bot-100',
    netEntityId: 'nent-bot-100',
    previousNetEntityId: 'nent-bot-100',
    accountId: 'acct_bot100',
    previousAccountId: 'acct_bot100',
  }
  evidence.scenarios['9'] = siblingGapRow()
  evidence.scenarios['10'] = siblingGapRow()
  evidence.scenarios['11'] = siblingGapRow({ totalEntities: 101 })
  evidence.traces = {
    account: evidence.traces.account,
    reconnect: {
      rebound: true,
      entityA: 'nent-bot-100',
      sessionId: 'sess-bot-100-re',
      previousSessionId: 'sess-bot-100',
      netEntityId: 'nent-bot-100',
      previousNetEntityId: 'nent-bot-100',
      accountId: 'acct_bot100',
      previousAccountId: 'acct_bot100',
    },
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

test('P1-A: Handshake host-audit sessionId/admit effect is not S4 without host NetEntityId', () => {
  const report = verifyRun(handshakeEvidence(), handshakeBindingAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's4:binding' || f.check.startsWith('census') || f.check === 'scenario-4'),
    JSON.stringify(report.failures),
  )
  assert.ok(
    report.census.netEntityIds.every((id) => isHostNetEntityId(id)),
    `sessionId census leaked: ${report.census.netEntityIds.slice(0, 3)}`,
  )
})

test('P1-B: GameRoomHost-green S5/S7/S9/S10/S11 must FAIL when snapshotSource is not live mvp-host', () => {
  const evidence = liveSeventeenKeyEvidence()
  evidence.traces.queries = {}
  evidence.scenarios['5'] = { ok: true }
  assert.equal(evidence.scenarios['5'].ok, true)
  assert.equal(evidence.scenarios['7'].snapshotSource, 'runtime-capture')
  const report = verifyRun(evidence, seventeenKeyAudit())
  assert.equal(report.ok, false)
  const checks = report.failures.map((f) => f.check)
  assert.ok(
    checks.some((c) => c === 'scenario-5' || c === 'scenario-5:suite-double' || c === 's5:suite-double' || c === 's5:traces'),
    JSON.stringify(report.failures),
  )
  assert.ok(
    checks.some((c) => c === 'scenario-7' || c === 'scenario-7:suite-double' || c === 's7:suite-double'),
    JSON.stringify(report.failures),
  )
})

test('P1-B: sibling-gap S5/S7/S9/S10/S11 ok:false + blockedReason is pack FAIL', () => {
  const evidence = handshakeEvidence()
  const report = verifyRun(evidence, handshakeBindingAudit())
  const blocked = new Set(['scenario-5', 'scenario-7', 'scenario-9', 'scenario-10', 'scenario-11'])
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => blocked.has(f.check)),
    JSON.stringify(report.failures),
  )
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

test('S8: new sessionId with same host NetEntityId/AccountId is reconnect ok', () => {
  const evidence = handshakeEvidence()
  evidence.traces.reconnect = {
    rebound: false,
    sessionId: 'sess-bot-100-re',
    previousSessionId: 'sess-bot-100',
    netEntityId: 'nent-bot-100',
    previousNetEntityId: 'nent-bot-100',
    accountId: 'acct_bot100',
    previousAccountId: 'acct_bot100',
    entityA: 'nent-bot-100',
  }
  evidence.scenarios['8'] = {
    ok: true,
    rebound: true,
    entityA: 'nent-bot-100',
    sessionId: 'sess-bot-100-re',
    previousSessionId: 'sess-bot-100',
    netEntityId: 'nent-bot-100',
    previousNetEntityId: 'nent-bot-100',
    accountId: 'acct_bot100',
    previousAccountId: 'acct_bot100',
  }
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.ok(
    !report.failures.some((f) => f.check === 's8:rebind' || f.check === 'scenario-8'),
    JSON.stringify(report.failures),
  )
})

test('S8: sessionId-only match is not the definition of entity rebind', () => {
  const evidence = handshakeEvidence()
  evidence.traces.reconnect = {
    rebound: true,
    sessionId: 'sess-bot-100',
    previousSessionId: 'sess-bot-100',
    entityA: 'sess-bot-100',
  }
  evidence.scenarios['8'] = {
    ok: true,
    rebound: true,
    entityA: 'sess-bot-100',
    sessionId: 'sess-bot-100',
    previousSessionId: 'sess-bot-100',
  }
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's8:rebind' || f.check === 'scenario-8'),
    JSON.stringify(report.failures),
  )
})

test('isEntityRebound: same host NetEntityId across a new sessionId is rebind', () => {
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-old', netEntityId: 'nent-a', accountId: 'acct-1' },
      { sessionId: 'sess-new', netEntityId: 'nent-a', accountId: 'acct-1' },
    ),
    true,
  )
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-a', netEntityId: 'nent-a' },
      { sessionId: 'sess-b', netEntityId: 'nent-a' },
    ),
    true,
  )
})

test('isEntityRebound: AccountId-only is not rebind', () => {
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-a', accountId: 'acct-1' },
      { sessionId: 'sess-b', accountId: 'acct-1' },
    ),
    false,
  )
})

test('isEntityRebound: sess-* netEntityId alias is not host rebind', () => {
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-Bot100', netEntityId: 'sess-Bot100' },
      { sessionId: 'sess-Bot100', netEntityId: 'sess-Bot100' },
    ),
    false,
  )
  assert.equal(
    isEntityRebound(
      { netEntityId: 'sess-Bot100', accountId: 'acct_login' },
      { netEntityId: 'sess-Bot100', accountId: 'acct_login' },
    ),
    false,
  )
})

function liveRunS8ShapeEvidence() {
  const evidence = handshakeEvidence()
  const s8 = {
    ok: true,
    entityA: 'sess-Bot100',
    rebound: true,
    sessionId: 'sess-Bot100',
    previousSessionId: 'sess-Bot100',
    netEntityId: null,
    previousNetEntityId: 'sess-Bot100',
    accountId: 'acct_20bd71abf730f8fdcb9e0e165e2460f2',
    previousAccountId: 'acct_20bd71abf730f8fdcb9e0e165e2460f2',
  }
  evidence.scenarios['8'] = s8
  evidence.traces.reconnect = { ...s8 }
  return evidence
}

test('S8: live-run-s8 shape (sess entityA, null nent, login accountId) must FAIL rebind', () => {
  const report = verifyRun(liveRunS8ShapeEvidence(), handshakeBindingAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's8:rebind' || f.check === 'scenario-8'),
    JSON.stringify(report.failures),
  )
  assert.ok(
    !report.failures.some((f) => f.check === 'host:mvp'),
    JSON.stringify(report.failures),
  )
})

test('S8: netEntityId aliased to sessionId must FAIL rebind', () => {
  const evidence = handshakeEvidence()
  const s8 = {
    ok: true,
    rebound: true,
    entityA: 'sess-Bot100',
    sessionId: 'sess-Bot100',
    previousSessionId: 'sess-Bot100',
    netEntityId: 'sess-Bot100',
    previousNetEntityId: 'sess-Bot100',
    accountId: 'acct_login',
    previousAccountId: 'acct_login',
  }
  evidence.scenarios['8'] = s8
  evidence.traces.reconnect = { ...s8 }
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's8:rebind' || f.check === 'scenario-8'),
    JSON.stringify(report.failures),
  )
})

test('S8: honest ok:false + blockedReason for missing nent projection is pack FAIL', () => {
  const evidence = handshakeEvidence()
  evidence.scenarios['8'] = {
    ok: false,
    rebound: false,
    entityA: null,
    sessionId: 'sess-Bot100',
    previousSessionId: 'sess-Bot100',
    netEntityId: null,
    previousNetEntityId: null,
    blockedReason: S8_NENT_GAP_REASON,
  }
  evidence.traces.reconnect = {
    rebound: false,
    entityA: null,
    sessionId: 'sess-Bot100',
    previousSessionId: 'sess-Bot100',
    netEntityId: null,
    previousNetEntityId: null,
  }
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's8:rebind' || f.check === 'scenario-8'),
    JSON.stringify(report.failures),
  )
  assert.equal(report.ok, false)
})

test('isEntityRebound: sessionId-only match is not rebind', () => {
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-a' },
      { sessionId: 'sess-a' },
    ),
    false,
  )
  assert.equal(
    isEntityRebound(
      { sessionId: 'sess-a', netEntityId: 'nent-a', accountId: 'acct-1' },
      { sessionId: 'sess-a', netEntityId: 'nent-b', accountId: 'acct-2' },
    ),
    false,
  )
})

test('reconnectSessionCandidates: missing session still handshakes then retries once', () => {
  assert.deepEqual(reconnectSessionCandidates(null, 'Bot100'), ['sess-Bot100', 'sess-Bot100-re'])
  assert.deepEqual(reconnectSessionCandidates('sess-Bot100', 'Bot100'), ['sess-Bot100', 'sess-Bot100-re'])
  assert.equal(reconnectSessionCandidates('sess-Bot100', 'Bot100').length, 2)
})

test('shouldRetryReconnectHandshake: SessionMismatch and missing session retry once', () => {
  assert.equal(shouldRetryReconnectHandshake({ reasonCode: 'SessionMismatch', message: 'mvp-host handshake rejected: SessionMismatch' }), true)
  assert.equal(shouldRetryReconnectHandshake(new Error('reconnect missing host sessionId')), true)
  assert.equal(shouldRetryReconnectHandshake(new Error('mvp-host handshake rejected: ReleaseMismatch')), false)
})

const LIVE_RUN_S8GAP_DIRS = [
  join(dirname(fileURLToPath(import.meta.url)), 'evidence', 'live-run-s8gap'),
]

function s8gapPackDir() {
  return LIVE_RUN_S8GAP_DIRS.find((dir) => existsSync(join(dir, 'manifest.json')) && existsSync(join(dir, 'round-1', 'evidence.json')))
    ?? null
}

function nentLive(n) {
  return `nent_${String(n).padStart(32, '0')}`
}

function c1HexLive(n) {
  return Number(n).toString(16).padStart(32, '0')
}

function liveElevenChatEnvelope() {
  return {
    messageType: 'InputCommand',
    mappingId: 'chat.input',
    payload: '0b00000068656c6c6f2d426f743031',
    payloadSha256: '13b37ea0310268b2648b6ce23d0558a193952155edaac3d362f9793ad0063d9a',
  }
}

function liveElevenBindings() {
  const bindings = []
  for (let i = 1; i <= 100; i++) {
    bindings.push({
      netEntityId: nentLive(i),
      accountId: `acct_bot_${String(i).padStart(3, '0')}`,
      roomId: MAIN_ROOM,
      entityKind: 'bot',
      connectionId: `conn-Bot${String(i).padStart(2, '0')}`,
      sessionId: `sess-Bot${String(i).padStart(2, '0')}`,
      generation: 1,
      loginName: `Bot${String(i).padStart(2, '0')}`,
    })
  }
  bindings.push({
    netEntityId: nentLive(101),
    accountId: 'acct_browser',
    roomId: MAIN_ROOM,
    entityKind: 'player',
    connectionId: 'conn-Browser01',
    sessionId: 'sess-Browser01',
    generation: 1,
    loginName: BROWSER_NAME,
  })
  return bindings
}

function liveElevenAdmitsFromBindings(bindings, processName = 'lumio-mvp-host') {
  return bindings.map((row, i) => ({
    index: i + 1,
    ok: true,
    status: 101,
    process: processName,
    entityType: row.entityKind,
    loginName: row.loginName,
    connectionId: row.connectionId,
    sessionId: row.sessionId,
    netEntityId: row.netEntityId,
    accountId: row.accountId,
    handshake: true,
  }))
}

function liveElevenEventOrder(bindings) {
  return bindings.map((row, i) => `${row.netEntityId}:hello-${row.loginName}:${i + 1}`)
}

function liveElevenGoodEvidence(processName = 'lumio-entity-chat-replay') {
  const bindings = liveElevenBindings()
  const eventOrder = liveElevenEventOrder(bindings)
  const appliedTicks = Array.from({ length: 101 }, () => 1)
  const envelope = liveElevenChatEnvelope()
  const evidence = goodEvidence()
  evidence.hostProcess = {
    process: processName,
    pid: 4242,
    listenUri: 'ws://127.0.0.1:19000',
    testControlUri: 'http://127.0.0.1:19001',
    command: [processName, '--listen', 'ws://127.0.0.1:0'],
  }
  evidence.liveAdmits = { live: 101, desired: 101, blocked: null, admits: liveElevenAdmitsFromBindings(bindings, processName) }
  evidence.traces = {
    account: { createAck: true, loadAck: true, wrongPasswordCode: 'wrong_password' },
    handshake: { completed: 101, sessionIds: bindings.map((b) => b.sessionId) },
    bindings,
    queries: {
      unauthorized: 'unauthorized',
      invisible: 'invisible',
      stale: 'stale_generation',
      ok: 'ok',
    },
    chat: {
      eventCount: 101,
      tickSource: ORACLE_TICK_SOURCE,
      timerManagerInvoked: true,
      ...envelope,
    },
    persist: { snapshotSource: 'lumio-entity-chat-replay', historyCount: 0 },
    reconnect: {
      rebound: true,
      entityA: nentLive(100),
      sessionId: 'sess-Bot100-re',
      previousSessionId: 'sess-Bot100',
      netEntityId: nentLive(100),
      previousNetEntityId: nentLive(100),
      accountId: 'acct_bot_100',
      previousAccountId: 'acct_bot_100',
    },
    expiry: { tombstoned: true, entityA: nentLive(99), entityB: nentLive(102), staleARejected: true },
  }
  evidence.scenarios['4'] = {
    ok: true,
    resolvedBots: 100,
    browserBound: true,
    netEntityIds: bindings.map((b) => b.netEntityId),
  }
  evidence.scenarios['5'] = {
    ok: true,
    unauthorized: 'unauthorized',
    invisible: 'invisible',
    stale: 'stale_generation',
  }
  evidence.scenarios['6'] = {
    ok: true,
    timerManagerInvoked: true,
    cadence: ORACLE_TICK_SOURCE,
    tickSource: ORACLE_TICK_SOURCE,
    eventCount: 101,
    ...envelope,
  }
  evidence.scenarios['7'] = {
    ok: true,
    historyCountMax: 0,
    restoredWindow: 0,
    windowBeforeSnapshot: 101,
    snapshotSource: 'lumio-entity-chat-replay',
  }
  evidence.scenarios['8'] = { ...evidence.traces.reconnect, ok: true }
  evidence.scenarios['9'] = {
    ok: true,
    tombstoned: true,
    staleARejected: true,
    entityA: nentLive(99),
    entityB: nentLive(102),
  }
  evidence.scenarios['10'] = { ok: true, isoTotal: 2, crossRoom: 'unauthorized' }
  evidence.scenarios['11'] = { ok: true, eventOrder, appliedTicks, totalEntities: 101 }
  return attachN12Observations(evidence)
}

function liveElevenAudit(processName = 'lumio-entity-chat-replay', bindings = liveElevenBindings()) {
  const lines = [
    JSON.stringify({
      seq: 0,
      kind: 'audit',
      process: processName,
      eventId: 'host.start',
      timestamp: null,
      category: 'host',
      severity: 'info',
      scope: null,
      releasePoolId: null,
      sessionId: null,
      reasonCode: null,
      admissionAttemptId: null,
      effect: null,
      sessionState: null,
      authorityRevision: null,
      slotEpoch: null,
      connectionEpoch: null,
      grantEpoch: null,
    }),
  ]
  let seq = 1
  for (const row of bindings) {
    const base = {
      seq: seq++,
      kind: 'state',
      eventId: null,
      timestamp: null,
      category: null,
      severity: null,
      scope: null,
      releasePoolId: null,
      sessionId: row.sessionId,
      reasonCode: null,
      admissionAttemptId: null,
      effect: 'BindConnection',
      sessionState: 'Active',
      authorityRevision: 1,
      slotEpoch: 1,
      connectionEpoch: 1,
      grantEpoch: 1,
      process: processName,
      netEntityId: row.netEntityId,
      accountId: row.accountId,
      entityKind: row.entityKind,
      entityType: row.entityKind,
      roomId: row.roomId,
    }
    lines.push(JSON.stringify(base))
  }
  return lines.join('\n') + '\n'
}

function siblingGapSuccessShape() {
  const evidence = handshakeEvidence()
  evidence.scenarios['5'] = siblingGapRow()
  evidence.scenarios['6'] = { ok: false, timerManagerInvoked: false, cadence: 'tick-batched', eventCount: 0 }
  evidence.scenarios['7'] = siblingGapRow({ historyCountMax: 0, restoredWindow: 0, snapshotSource: 'suite-double' })
  evidence.scenarios['8'] = {
    ok: false,
    rebound: false,
    entityA: null,
    netEntityId: null,
    previousNetEntityId: null,
    blockedReason: S8_NENT_GAP_REASON,
  }
  evidence.scenarios['9'] = siblingGapRow()
  evidence.scenarios['10'] = siblingGapRow()
  evidence.scenarios['11'] = siblingGapRow({ totalEntities: 101 })
  evidence.traces.reconnect = { rebound: false, entityA: null, netEntityId: null, previousNetEntityId: null }
  return evidence
}

test('live-run-s8gap SUCCESS pack must FAIL because S5-S11/S8 are not-ok', () => {
  const dir = s8gapPackDir()
  const report = dir
    ? verifyEvidenceDir(dir)
    : compareRuns(siblingGapSuccessShape(), siblingGapSuccessShape(), handshakeBindingAudit(), handshakeBindingAudit())
  assert.equal(report.ok, false, 'honest not-ok sibling-gap pack must not conclude SUCCESS')
  const blob = JSON.stringify(report.failures)
  for (const n of [5, 6, 7, 8, 9, 10, 11]) {
    assert.ok(
      new RegExp(`scenario-${n}|s${n}:`).test(blob),
      `expected scenario ${n} failure, got ${blob.slice(0, 1200)}`,
    )
  }
})

test('sibling-gap S5/S7/S9/S10/S11 ok:false is pack FAIL, not SUCCESS skip', () => {
  const report = verifyRun(siblingGapSuccessShape(), handshakeBindingAudit())
  assert.equal(report.ok, false)
  const checks = report.failures.map((f) => f.check)
  assert.ok(checks.includes('scenario-5'), JSON.stringify(report.failures))
  assert.ok(checks.includes('scenario-7') || checks.includes('s7:snapshot-material'), JSON.stringify(report.failures))
  assert.ok(checks.includes('scenario-9') || checks.includes('s9:tombstone'), JSON.stringify(report.failures))
  assert.ok(checks.includes('scenario-10') || checks.includes('s10:isolation'), JSON.stringify(report.failures))
  assert.ok(checks.includes('scenario-11') || checks.includes('event-order'), JSON.stringify(report.failures))
})

test('S8 honest nent-gap ok:false is pack FAIL, not SUCCESS skip', () => {
  const evidence = liveElevenGoodEvidence()
  evidence.scenarios['8'] = {
    ok: false,
    rebound: false,
    entityA: null,
    netEntityId: null,
    previousNetEntityId: null,
    blockedReason: S8_NENT_GAP_REASON,
  }
  evidence.traces.reconnect = { rebound: false, entityA: null, netEntityId: null, previousNetEntityId: null }
  const report = verifyRun(evidence, liveElevenAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 'scenario-8' || f.check === 's8:rebind'),
    JSON.stringify(report.failures),
  )
})

test('S6 timerManagerInvoked true without test-control/tick or host timer must FAIL', () => {
  const evidence = liveElevenGoodEvidence()
  evidence.scenarios['6'] = {
    ...evidence.scenarios['6'],
    timerManagerInvoked: true,
    tickSource: 'for-loop',
    cadence: 'for-loop',
  }
  evidence.traces.chat = { ...evidence.traces.chat, tickSource: 'for-loop', timerManagerInvoked: true }
  const report = verifyRun(evidence, liveElevenAudit())
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's6:timer-source' || f.check === 's6:timer' || /for-loop|test-control\/tick/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('census/S4 require bindings + 17-key audit netEntityId, not sessionId', () => {
  const evidence = handshakeEvidence()
  const report = verifyRun(evidence, handshakeBindingAudit())
  assert.ok(
    report.failures.some((f) => f.check === 's4:binding' || f.check.startsWith('census') || f.check === 'scenario-4'),
    JSON.stringify(report.failures),
  )
  assert.ok(
    report.census.netEntityIds.length === 0
      || report.census.netEntityIds.every((id) => isHostNetEntityId(id)),
    `sessionId census leaked: ${report.census.netEntityIds.slice(0, 3)}`,
  )
})

test('GameRoomHost-only pack still FAIL host:mvp when live 11-scenario rust traces are accepted', () => {
  const suite = verifyRun(suiteOnlyEvidence(), suiteOnlyAudit())
  assert.equal(suite.ok, false)
  assert.ok(
    suite.failures.some((f) => f.check === 'host:mvp' || /suite-only host is not C# MVP host/i.test(f.message)),
    JSON.stringify(suite.failures),
  )
})

test('lumio-entity-chat-replay hostProcess is accepted for the identical 11-scenario suite', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.ok(
    !report.failures.some((f) => f.check === 'host:mvp'),
    JSON.stringify(report.failures),
  )
})

test('rust S5 ok:true with real query traces is not GameRoomHost suite-double', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  assert.equal(evidence.scenarios['5'].ok, true)
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.ok(
    !report.failures.some((f) => f.check === 'scenario-5:suite-double' || f.check === 's5:suite-double'),
    JSON.stringify(report.failures),
  )
})

test('live 11-scenario traces on mvp-host must FAIL because mvp-host is never SUCCESS', () => {
  const evidence = liveElevenGoodEvidence('lumio-mvp-host')
  const report = verifyRun(evidence, liveElevenAudit('lumio-mvp-host'))
  assert.equal(report.ok, false, JSON.stringify(report.failures))
  assert.ok(
    report.failures.some((f) => f.check === 'host:mvp-impersonation' || f.check === 'host:rust'),
    JSON.stringify(report.failures),
  )
})

function n12ObservedEvents(bindings) {
  return bindings.map((row, i) => ({
    messageId: i + 1,
    roomSequence: i + 1,
    senderNetEntityId: row.netEntityId,
    text: `hello-${row.loginName}`,
    appliedTick: 1,
    source: i === 100 ? 'playwright' : 'node',
  }))
}

function n12WindowLines(events) {
  return events.map((ev) => ({
    messageId: ev.messageId,
    roomSequence: ev.roomSequence,
    senderNetEntityId: ev.senderNetEntityId,
    text: ev.text,
    appliedTick: ev.appliedTick,
  }))
}

function n12GoodEvidence() {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  const events = n12ObservedEvents(evidence.traces.bindings)
  const windowLines = n12WindowLines(events)
  evidence.oracleSha256 = oracleSha256()
  evidence.playwright = {
    ran: true,
    browser: 'chromium',
    receivedFromNetwork: true,
    injected: false,
    receivedChatEvent: true,
    eventCount: 101,
    windowLines,
    receivedEvents: events.filter((ev) => ev.source === 'playwright'),
  }
  evidence.traces.chat = {
    ...evidence.traces.chat,
    tickSource: 'native-kernel/tickFrame',
    timerManagerInvoked: true,
    cadence: 'native-kernel/tickFrame',
    utteranceTicks: [5, 10, 15],
    receivedEvents: events,
    eventCount: 101,
  }
  evidence.traces.persist = {
    snapshotSource: 'lumio-entity-chat-replay',
    historyCountMax: 0,
    clientWindowBeforeSnapshot: 101,
    clientWindowAfterRestore: 0,
    snapshotSha256: 'a'.repeat(64),
    lastMessageTextEqual: true,
    processA: { pid: 1001, process: 'lumio-entity-chat-replay' },
    processB: { pid: 1002, process: 'lumio-entity-chat-replay' },
  }
  evidence.traces.reconnect = {
    ...evidence.traces.reconnect,
    connectionSupersededReceived: true,
  }
  evidence.scenarios['3'] = {
    ...evidence.scenarios['3'],
    playwrightRan: true,
    windowLines: 101,
  }
  evidence.scenarios['6'] = {
    ...evidence.scenarios['6'],
    timerManagerInvoked: true,
    cadence: 'native-kernel/tickFrame',
    tickSource: 'native-kernel/tickFrame',
    utteranceTicks: [5, 10, 15],
    eventCount: 101,
    windowLines,
  }
  evidence.scenarios['7'] = {
    ok: true,
    historyCountMax: 0,
    restoredWindow: 0,
    windowBeforeSnapshot: 101,
    snapshotSource: 'lumio-entity-chat-replay',
    lastMessageTextEqual: true,
  }
  evidence.scenarios['8'] = {
    ...evidence.scenarios['8'],
    connectionSupersededReceived: true,
  }
  evidence.scenarios['11'] = {
    ok: true,
    eventOrder: events.map((ev) => `${ev.senderNetEntityId}:${ev.text}:${ev.roomSequence}`),
    appliedTicks: events.map((ev) => ev.appliedTick),
    totalEntities: 101,
  }
  return evidence
}

test('N-12: lumio-mvp-host is never a SUCCESS path', () => {
  const evidence = liveElevenGoodEvidence('lumio-mvp-host')
  const report = verifyRun(evidence, liveElevenAudit('lumio-mvp-host'))
  assert.equal(report.ok, false, 'mvp-host must not be SUCCESS')
  assert.ok(
    report.failures.some((f) => f.check === 'host:mvp-impersonation' || f.check === 'host:rust' || /mvp-host/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: synthesized eventOrder from send counts without received chat.event must FAIL', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.scenarios['11'] = {
    ok: true,
    eventOrder: evidence.traces.bindings.map((row, i) => `${row.netEntityId}:hello-${row.loginName}:${i + 1}`),
    appliedTicks: evidence.traces.bindings.map(() => 1),
    totalEntities: 101,
  }
  delete evidence.traces.chat.receivedEvents
  delete evidence.playwright.receivedEvents
  delete evidence.playwright.windowLines
  delete evidence.playwright.receivedChatEvent
  delete evidence.scenarios['6'].windowLines
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's11:synthesized' || f.check === 'event-order' || /synthes/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: restoredWindow literal 0 without measured client window must FAIL', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.scenarios['7'] = {
    ok: true,
    historyCountMax: 0,
    restoredWindow: 0,
    windowBeforeSnapshot: 101,
    snapshotSource: 'lumio-entity-chat-replay',
  }
  evidence.traces.persist = { snapshotSource: 'lumio-entity-chat-replay', historyCount: 0 }
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's7:restored-unmeasured' || /measured|client window/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: Playwright account-login-only is not receivedFromNetwork chat.event', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.playwright = {
    ran: true,
    browser: 'chromium',
    receivedFromNetwork: true,
    injected: false,
    accountAccepted: true,
    receivedChatEvent: false,
    windowLines: [],
  }
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.ok(
    report.failures.some((f) => f.check === 's3:playwright' || f.check === 's3:chat-event' || /chat\.event/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: S6 tickSource must be native-kernel/tickFrame', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.scenarios['6'].tickSource = 'test-control/tick'
  evidence.traces.chat.tickSource = 'test-control/tick'
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's6:tick-source' || /native-kernel\/tickFrame/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: missing oracleSha256 of verify-evidence.mjs must FAIL', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  delete evidence.oracleSha256
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 'oracle:sha256' || /oracle/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: S8 without ConnectionSuperseded on the old connection must FAIL', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.scenarios['8'].connectionSupersededReceived = false
  evidence.traces.reconnect.connectionSupersededReceived = false
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's8:superseded' || /ConnectionSuperseded/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: S7 same-process restore without persist file must FAIL', () => {
  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.traces.persist = {
    snapshotSource: 'lumio-entity-chat-replay',
    historyCountMax: 0,
    processA: { pid: 9 },
    processB: { pid: 9 },
  }
  evidence.scenarios['7'].ok = true
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, false)
  assert.ok(
    report.failures.some((f) => f.check === 's7:cross-process' || f.check === 's7:snapshot-file' || /process A|snapshot/i.test(f.message)),
    JSON.stringify(report.failures),
  )
})

test('N-12: rust pack with client-observed chat.event, measured window, oracle pin must PASS', () => {
  const evidence = n12GoodEvidence()
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay'))
  assert.equal(report.ok, true, JSON.stringify(report.failures))
  assert.equal(report.census.total, 101)
  assert.equal(report.eventOrder.length, 101)
})

test('C-1 u64 32-hex is Runtime host NetEntityId; loop index and sess-* are not', () => {
  assert.equal(isHostNetEntityId(c1HexLive(1)), true)
  assert.equal(isHostNetEntityId(c1HexLive(100)), true)
  assert.equal(isHostNetEntityId(c1HexLive(101)), true)
  assert.equal(isHostNetEntityId('00000000000000000000000000000064'), true)
  assert.equal(isHostNetEntityId('0000000000000001'), true)
  assert.equal(isHostNetEntityId(nentLive(1)), true)
  assert.equal(isHostNetEntityId('nent-a'), true)
  assert.equal(isHostNetEntityId('1'), false)
  assert.equal(isHostNetEntityId('101'), false)
  assert.equal(isHostNetEntityId(1), false)
  assert.equal(isHostNetEntityId('sess-Bot01'), false)
  assert.equal(isHostNetEntityId('00000000000000000000000000000000'), false)
  assert.equal(isHostNetEntityId('0000000000000000'), false)
})

test('census 101 from Runtime-issued C-1 32-hex host-audit, without minting nent_*', () => {
  const hexBindings = liveElevenBindings().map((row, i) => ({
    ...row,
    netEntityId: c1HexLive(i + 1),
  }))
  const lines = [
    JSON.stringify({ kind: 'audit', process: 'lumio-entity-chat-replay', seq: 0, eventId: 'host.start' }),
  ]
  for (let i = 0; i < hexBindings.length; i++) {
    const row = hexBindings[i]
    lines.push(JSON.stringify({
      kind: 'entity_admitted',
      process: 'lumio-entity-chat-replay',
      entityType: row.entityKind,
      netEntityId: row.netEntityId,
      roomId: MAIN_ROOM,
      sessionId: row.sessionId,
      connectionId: row.connectionId,
      accountId: row.accountId,
      seq: i + 1,
    }))
  }
  const fromAudit = censusFromHostAudit(lines.join('\n') + '\n')
  assert.equal(fromAudit.botCount, 100)
  assert.equal(fromAudit.playerCount, 1)
  assert.equal(fromAudit.total, 101)
  assert.equal(fromAudit.netEntityIds.length, 101)
  assert.ok(fromAudit.netEntityIds.every((id) => /^[0-9a-f]{32}$/.test(id)))
  assert.equal(fromAudit.netEntityIds.some((id) => /^nent[-_]/i.test(id)), false)

  const evidence = liveElevenGoodEvidence('lumio-entity-chat-replay')
  evidence.traces.bindings = hexBindings
  evidence.liveAdmits.admits = liveElevenAdmitsFromBindings(hexBindings, 'lumio-entity-chat-replay')
  evidence.scenarios['4'] = {
    ...evidence.scenarios['4'],
    netEntityIds: hexBindings.map((row) => row.netEntityId),
  }
  evidence.traces.reconnect = {
    ...evidence.traces.reconnect,
    entityA: c1HexLive(100),
    netEntityId: c1HexLive(100),
    previousNetEntityId: c1HexLive(100),
  }
  evidence.scenarios['8'] = {
    ...evidence.scenarios['8'],
    ...evidence.traces.reconnect,
    ok: true,
  }
  evidence.traces.expiry = {
    ...evidence.traces.expiry,
    entityA: c1HexLive(99),
    entityB: c1HexLive(102),
  }
  evidence.scenarios['9'] = {
    ...evidence.scenarios['9'],
    entityA: c1HexLive(99),
    entityB: c1HexLive(102),
  }
  const report = verifyRun(evidence, liveElevenAudit('lumio-entity-chat-replay', hexBindings))
  assert.equal(report.census.botCount, 100, JSON.stringify(report.failures))
  assert.equal(report.census.playerCount, 1)
  assert.equal(report.census.total, 101)
  assert.ok(report.census.netEntityIds.every((id) => isHostNetEntityId(id)))
  assert.ok(!report.failures.some((f) => f.check.startsWith('census') || f.check === 's4:binding' || f.check === 's8:rebind'), JSON.stringify(report.failures))
})

function n12PermuteObserved(evidence, rotate = 17) {
  const out = structuredClone(evidence)
  const events = n12ObservedEvents(out.traces.bindings)
  const bots = events.slice(0, 100)
  const browser = events[100]
  const rotated = bots.slice(rotate).concat(bots.slice(0, rotate))
  const permuted = rotated.map((ev, i) => ({
    ...ev,
    messageId: i + 1,
    roomSequence: i + 1,
    appliedTick: i < 40 ? 1 : 2,
    source: 'node',
  }))
  const last = {
    ...browser,
    messageId: 101,
    roomSequence: 101,
    appliedTick: 3,
    source: 'playwright',
  }
  const all = [...permuted, last]
  const windowLines = n12WindowLines(all)
  out.playwright = {
    ...out.playwright,
    windowLines,
    receivedEvents: [last],
    eventCount: 101,
  }
  out.traces.chat = {
    ...out.traces.chat,
    receivedEvents: all,
    eventCount: 101,
  }
  out.scenarios['6'] = {
    ...out.scenarios['6'],
    windowLines,
    eventCount: 101,
  }
  out.scenarios['11'] = {
    ...out.scenarios['11'],
    eventOrder: all.map((ev) => `${ev.senderNetEntityId}:${ev.text}:${ev.roomSequence}`),
    appliedTicks: all.map((ev) => ev.appliedTick),
  }
  out.hostProcess = { ...out.hostProcess, pid: Number(out.hostProcess?.pid ?? 4242) + 11 }
  return out
}

test('compareRuns: same 101 texts and roomSequence 1..101 PASS despite sender permutation and appliedTick split', () => {
  const a = n12GoodEvidence()
  const b = n12PermuteObserved(a, 17)
  const audit = liveElevenAudit('lumio-entity-chat-replay')
  const left = verifyRun(a, audit)
  const right = verifyRun(b, audit)
  assert.equal(left.ok, true, JSON.stringify(left.failures))
  assert.equal(right.ok, true, JSON.stringify(right.failures))
  assert.notEqual(
    JSON.stringify(left.eventOrder),
    JSON.stringify(right.eventOrder),
    'sender permutation must change positional eventOrder',
  )
  assert.notEqual(
    JSON.stringify(left.appliedTicks),
    JSON.stringify(right.appliedTicks),
    'appliedTick split must differ',
  )
  const report = compareRuns(a, b, audit, audit)
  assert.equal(report.ok, true, JSON.stringify(report.failures))
})

test('compareRuns: missing hello-browser or empty eventOrder still FAIL', () => {
  const a = n12GoodEvidence()
  const audit = liveElevenAudit('lumio-entity-chat-replay')
  const missing = structuredClone(a)
  missing.scenarios['11'].eventOrder = missing.scenarios['11'].eventOrder.filter((row) => !/hello-browser/i.test(String(row)))
  assert.equal(compareRuns(a, missing, audit, audit).ok, false)
  const empty = structuredClone(a)
  empty.scenarios['11'].eventOrder = []
  assert.equal(compareRuns(a, empty, audit, audit).ok, false)
})
