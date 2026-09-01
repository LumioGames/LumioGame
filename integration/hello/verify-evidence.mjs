#!/usr/bin/env node
/**
 * verify-evidence — MS-00002 Hello World 单轮证据三方对账器(server audit / bot trace / bot+browser result)。
 *
 * 用法(独立运行):
 *   node verify-evidence.mjs --audit <server-audit.ndjson> --bot-trace <bot-trace.ndjson> \
 *     --bot-result <bot-result.json> --browser-result <browser-result.json> \
 *     --contract <hello-wire-v1.json> [--json]
 *   退出码:0 = PASS,1 = FAIL。默认输出人类可读报告(--json 输出完整 JSON)。
 *
 * 约定(与契约 process 节对齐):
 *   - audit 与 bot trace 均为 NDJSON,每行一个事件对象;事件判别字段容忍 kind|event。
 *   - browser result = window.__lumioResult 的 JSON 快照(契约 process.evidence.browserResult)。
 *   - bot result 至少含 {ok:boolean, received:[...]};received 记录形状同 browser result。
 *   - 必填字段词表从契约 process.auditEventKinds / botTraceEventKinds 动态读取,不在本文件复制第二份。
 *
 * 本文件同时是 node --test 的测试对象:`node --test verify-evidence.mjs` 只在测试运行器子进程
 * (NODE_TEST_CONTEXT 存在)中注册用例;被 launcher import 或直接当 CLI 跑时不会执行测试。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'

export const HELLO_PAYLOAD = 'Hello World'
export const HELLO_PAYLOAD_SHA256 = sha256Text(HELLO_PAYLOAD)
export const LATENCY_LIMIT_MS = 1000
const EXCERPT_MAX = 200

function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}

function excerpt(text, max = EXCERPT_MAX) {
  const s = String(text ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function fail(check, message, { line, excerpt: ex, path } = {}) {
  const f = { check, message }
  if (line !== undefined) f.line = line
  if (ex !== undefined) f.excerpt = ex
  if (path !== undefined) f.path = path
  return f
}

/** 解析一段 NDJSON 文本为带行号的事件序列;坏行进 parseErrors,不中断整体解析。 */
export function parseNdjson(text, label = 'ndjson') {
  const events = []
  const parseErrors = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const line = i + 1
    let ev
    try {
      ev = JSON.parse(trimmed)
    } catch (err) {
      parseErrors.push({ line, excerpt: excerpt(trimmed), message: `JSON 解析失败: ${err.message}` })
      continue
    }
    if (!isObject(ev)) {
      parseErrors.push({ line, excerpt: excerpt(trimmed), message: '事件必须是 JSON 对象' })
      continue
    }
    events.push({ line, text: trimmed, ev })
  }
  return { label, events, parseErrors }
}

/** 事件判别字段:容忍 kind|event 两种命名。 */
export function eventKind(ev) {
  return ev?.kind ?? ev?.event ?? null
}

/** 按契约词表核对每个事件的种类与必填字段;词表形如 contract.process.auditEventKinds。 */
export function checkVocabulary(events, vocab, label) {
  const failures = []
  for (const { line, text, ev } of events) {
    const kind = eventKind(ev)
    if (!kind) {
      failures.push(fail(`${label}:missing-kind`, '事件缺少判别字段 kind/event', { line, excerpt: excerpt(text) }))
      continue
    }
    const spec = vocab[kind]
    if (!spec) {
      failures.push(fail(`${label}:unknown-kind`, `未知事件种类 "${kind}"(不在契约 ${label} 词表)`, { line, excerpt: excerpt(text) }))
      continue
    }
    for (const field of spec.required ?? []) {
      if (!Object.hasOwn(ev, field)) {
        failures.push(fail(`${label}:missing-field`, `${kind} 缺少契约必填字段 ${field}`, { line, excerpt: excerpt(text) }))
      }
    }
  }
  return failures
}

/**
 * 非 Echo 链核对:每条 ingress_received 之后必须存在 deltaCount>=1 的 tick_committed,
 * 且随后有路由给「对方会话」的 delta_routed(同 sender/sequence/sha,携带该 tick 的 tickId/revision);
 * 反向亦然——任何 delta_routed 之前必须存在匹配的 tick_committed(无 tick 即 egress = Echo 链)。
 * 同时核对 tickId/revision 单调递增与 ingress sequence 每 sender 从 1 严格 +1。
 */
export function verifyAuditChain(audit) {
  const F = []
  const ingresses = audit.events.filter((x) => eventKind(x.ev) === 'ingress_received')
  const ticks = audit.events.filter((x) => eventKind(x.ev) === 'tick_committed')
  const deltas = audit.events.filter((x) => eventKind(x.ev) === 'delta_routed')

  let prev = null
  for (const t of ticks) {
    const dc = Number(t.ev.deltaCount)
    if (!Number.isFinite(dc) || dc < 1) {
      F.push(fail('audit:tick-empty', `tick_committed(tickId ${t.ev.tickId}) deltaCount=${t.ev.deltaCount},必须 >=1`, { line: t.line, excerpt: excerpt(t.text) }))
    }
    if (prev) {
      if (!(Number(t.ev.revision) > Number(prev.ev.revision))) {
        F.push(fail('audit:revision-monotonic', `tick_committed revision 未严格递增(${prev.ev.revision} -> ${t.ev.revision})`, { line: t.line, excerpt: excerpt(t.text) }))
      }
      if (!(Number(t.ev.tickId) > Number(prev.ev.tickId))) {
        F.push(fail('audit:tickid-monotonic', `tick_committed tickId 未严格递增(${prev.ev.tickId} -> ${t.ev.tickId})`, { line: t.line, excerpt: excerpt(t.text) }))
      }
    }
    prev = t
  }

  const bySender = new Map()
  for (const ing of ingresses) {
    const list = bySender.get(ing.ev.sender) ?? []
    list.push(ing)
    bySender.set(ing.ev.sender, list)
  }
  for (const [sender, list] of bySender) {
    let expected = 1
    for (const ing of list) {
      if (Number(ing.ev.sequence) !== expected) {
        F.push(fail('audit:sequence-monotonic', `sender ${sender} 的 ingress sequence 应为 ${expected},实际 ${ing.ev.sequence}(契约:每 sender 从 1 严格 +1)`, { line: ing.line, excerpt: excerpt(ing.text) }))
      }
      expected = Number(ing.ev.sequence) + 1
    }
  }

  for (const ing of ingresses) {
    const ev = ing.ev
    const tick = ticks.find((t) => t.line > ing.line && Number(t.ev.deltaCount) >= 1)
    if (!tick) {
      F.push(fail('audit:ingress-without-tick', `ingress_received(sender ${ev.sender}, sequence ${ev.sequence}) 之后不存在 deltaCount>=1 的 tick_committed —— 无权威 tick 即 egress(Echo 链)`, { line: ing.line, excerpt: excerpt(ing.text) }))
      continue
    }
    const matched = deltas.filter(
      (d) => d.line > ing.line
        && d.ev.sender === ev.sender
        && String(d.ev.sequence) === String(ev.sequence)
        && d.ev.payloadSha256 === ev.payloadSha256
        && String(d.ev.tickId) === String(tick.ev.tickId)
        && String(d.ev.revision) === String(tick.ev.revision),
    )
    if (matched.length === 0) {
      F.push(fail('audit:ingress-without-delta', `ingress_received(sender ${ev.sender}, sequence ${ev.sequence}) 已提交 tick(tickId ${tick.ev.tickId}, revision ${tick.ev.revision}),但找不到携带相同 tickId/revision 的 delta_routed`, { line: ing.line, excerpt: excerpt(ing.text) }))
      continue
    }
    for (const d of matched) {
      if (d.ev.sessionId === ev.sessionId) {
        F.push(fail('audit:delta-echo-back', `delta_routed(sender ${ev.sender}, sequence ${ev.sequence}) 路由回发送方会话 ${ev.sessionId} —— Echo 而非对端路由`, { line: d.line, excerpt: excerpt(d.text) }))
      }
    }
  }

  for (const d of deltas) {
    const covered = ticks.some(
      (t) => t.line < d.line
        && String(t.ev.tickId) === String(d.ev.tickId)
        && String(t.ev.revision) === String(d.ev.revision)
        && Number(t.ev.deltaCount) >= 1,
    )
    if (!covered) {
      F.push(fail('audit:delta-without-tick', `delta_routed(tickId ${d.ev.tickId}, revision ${d.ev.revision}, sender ${d.ev.sender}) 之前不存在匹配的 tick_committed —— 无权威 tick 即 egress(Echo 链)`, { line: d.line, excerpt: excerpt(d.text) }))
    }
  }

  return { failures: F, stats: { ingress: ingresses.length, tick: ticks.length, delta: deltas.length } }
}

/** bot trace 核对:关键事件齐全、exitOk=true、无 error_received、delta 延迟与哈希达标。 */
export function verifyBotTrace(trace) {
  const F = []
  const tagged = trace.events.map((x) => ({ line: x.line, text: x.text, ev: x.ev, kind: eventKind(x.ev) }))
  for (const k of ['bot_started', 'connected', 'command_sent', 'delta_received', 'bot_finished']) {
    if (!tagged.some((x) => x.kind === k)) {
      F.push(fail('botTrace:missing-event', `bot trace 缺少关键事件 ${k}`))
    }
  }
  for (const x of tagged) {
    if (x.kind === 'error_received') {
      F.push(fail('botTrace:error-received', `bot 收到 Error(${x.ev.code}): ${x.ev.detail}`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    if (x.kind === 'handshake_ack' && x.ev.accepted !== true) {
      F.push(fail('botTrace:handshake-rejected', `握手被拒(accepted=${x.ev.accepted})`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    if (x.kind === 'command_result' && x.ev.ok !== true) {
      F.push(fail('botTrace:command-failed', `command_result ok=${x.ev.ok}: ${x.ev.detail}`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    if (x.kind === 'bot_finished' && x.ev.exitOk !== true) {
      F.push(fail('botTrace:exit-not-ok', `bot_finished exitOk=${x.ev.exitOk}`, { line: x.line, excerpt: excerpt(x.text) }))
    }
  }
  for (const x of tagged.filter((e) => e.kind === 'command_sent')) {
    if (x.ev.sender !== 'bot') {
      F.push(fail('botTrace:command-sender', `command_sent sender 应为 bot,实际 ${x.ev.sender}`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    if (x.ev.payloadSha256 !== HELLO_PAYLOAD_SHA256) {
      F.push(fail('botTrace:command-hash', `command_sent payloadSha256=${x.ev.payloadSha256} != sha256("Hello World")`, { line: x.line, excerpt: excerpt(x.text) }))
    }
  }
  for (const x of tagged.filter((e) => e.kind === 'delta_received')) {
    if (x.ev.sender !== 'browser') {
      F.push(fail('botTrace:delta-sender', `delta_received sender 应为 browser(bot 只应收到对端增量),实际 ${x.ev.sender}`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    if (x.ev.payloadSha256 !== HELLO_PAYLOAD_SHA256) {
      F.push(fail('botTrace:delta-hash', `delta_received payloadSha256=${x.ev.payloadSha256} != sha256("Hello World")`, { line: x.line, excerpt: excerpt(x.text) }))
    }
    const lat = Number(x.ev.latencyMs)
    if (!Number.isFinite(lat) || lat >= LATENCY_LIMIT_MS) {
      F.push(fail('botTrace:latency', `delta_received latencyMs=${x.ev.latencyMs} 超限或非法(须 <${LATENCY_LIMIT_MS})`, { line: x.line, excerpt: excerpt(x.text) }))
    }
  }
  return { failures: F }
}

function checkReceivedRecords(records, ownRole, F) {
  const peer = ownRole === 'browser' ? 'bot' : 'browser'
  records.filter(isObject).forEach((r, i) => {
    const path = `received[${i}]`
    for (const field of ['sender', 'sequence', 'tickId', 'revision', 'payloadSha256', 'latencyMs']) {
      if (!Object.hasOwn(r, field)) {
        F.push(fail(`results:${ownRole}:missing-field`, `${ownRole} result ${path} 缺少字段 ${field}`, { path }))
      }
    }
    if (r.sender === ownRole) {
      F.push(fail(`results:${ownRole}:self-echo`, `${ownRole} result ${path}.sender=${r.sender} 等于自身角色 —— 回声而非对端路由`, { path }))
    } else if (r.sender !== undefined && r.sender !== peer) {
      F.push(fail(`results:${ownRole}:unexpected-sender`, `${ownRole} result ${path}.sender=${r.sender},应为 ${peer}`, { path }))
    }
    if (r.payloadSha256 !== undefined && r.payloadSha256 !== HELLO_PAYLOAD_SHA256) {
      F.push(fail(`results:${ownRole}:payload-hash`, `${ownRole} result ${path}.payloadSha256=${r.payloadSha256} != sha256("Hello World")=${HELLO_PAYLOAD_SHA256}`, { path }))
    }
    if (r.latencyMs !== undefined) {
      const lat = Number(r.latencyMs)
      if (!Number.isFinite(lat) || lat >= LATENCY_LIMIT_MS) {
        F.push(fail(`results:${ownRole}:latency`, `${ownRole} result ${path}.latencyMs=${r.latencyMs} 超限或非法(须 <${LATENCY_LIMIT_MS})`, { path }))
      }
    }
  })
  // 单调性:同一接收数组内 sequence/revision/tickId 严格递增(缺失字段已另行报告)
  const valid = records.filter(isObject)
  for (const field of ['sequence', 'revision', 'tickId']) {
    for (let i = 1; i < valid.length; i++) {
      const a = Number(valid[i - 1][field])
      const b = Number(valid[i][field])
      if (Number.isFinite(a) && Number.isFinite(b) && !(b > a)) {
        F.push(fail(`results:${ownRole}:monotonic`, `${ownRole} result received[${i - 1}→${i}].${field} 未严格递增(${a} -> ${b})`, { path: `received[${i}]` }))
      }
    }
  }
}

/** browser/bot result 核对:status ok、收到对端记录、payloadSha256 等于 sha256("Hello World")、latency<1000。 */
export function verifyResults({ browserResult, botResult }) {
  const F = []

  if (!isObject(browserResult)) {
    F.push(fail('results:browser:shape', 'browser result 不是 JSON 对象(window.__lumioResult 快照)'))
  } else {
    if (browserResult.status !== 'ok') {
      F.push(fail('results:browser:status', `browser status=${JSON.stringify(browserResult.status)},应为 "ok"`, { path: 'status' }))
    }
    if (browserResult.role !== undefined && browserResult.role !== 'browser') {
      F.push(fail('results:browser:role', `browser role=${JSON.stringify(browserResult.role)},应为 "browser"`, { path: 'role' }))
    }
    if (Array.isArray(browserResult.errors) && browserResult.errors.length > 0) {
      F.push(fail('results:browser:errors', `browser errors 非空: ${JSON.stringify(browserResult.errors)}`, { path: 'errors' }))
    }
    if (isObject(browserResult.sent) && browserResult.sent.payloadSha256 !== undefined && browserResult.sent.payloadSha256 !== HELLO_PAYLOAD_SHA256) {
      F.push(fail('results:browser:sent-hash', `browser sent.payloadSha256=${browserResult.sent.payloadSha256} != sha256("Hello World")`, { path: 'sent.payloadSha256' }))
    }
    if (!Array.isArray(browserResult.received)) {
      F.push(fail('results:browser:received-shape', 'browser result.received 不是数组', { path: 'received' }))
    } else {
      checkReceivedRecords(browserResult.received, 'browser', F)
      if (!browserResult.received.some((r) => isObject(r) && r.sender === 'bot')) {
        F.push(fail('results:browser:no-bot-record', 'browser result.received 不含 sender=bot 记录', { path: 'received' }))
      }
    }
  }

  if (!isObject(botResult)) {
    F.push(fail('results:bot:shape', 'bot result 不是 JSON 对象'))
  } else {
    if (botResult.ok !== true && botResult.status !== 'ok') {
      F.push(fail('results:bot:ok', `bot result ok=${JSON.stringify(botResult.ok)} status=${JSON.stringify(botResult.status)},应为 ok:true`, { path: 'ok' }))
    }
    if (Array.isArray(botResult.errors) && botResult.errors.length > 0) {
      F.push(fail('results:bot:errors', `bot errors 非空: ${JSON.stringify(botResult.errors)}`, { path: 'errors' }))
    }
    if (!Array.isArray(botResult.received)) {
      F.push(fail('results:bot:received-shape', 'bot result.received 不是数组', { path: 'received' }))
    } else {
      checkReceivedRecords(botResult.received, 'bot', F)
      if (!botResult.received.some((r) => isObject(r) && r.sender === 'browser')) {
        F.push(fail('results:bot:no-browser-record', 'bot result.received 不含 sender=browser 记录', { path: 'received' }))
      }
    }
  }

  return { failures: F }
}

/** 三方对账:browser/bot result 与 bot trace 的每条 received 记录必须能在 audit delta_routed 中找到同值记录。 */
export function verifyCrossSource({ audit, botTrace, browserResult, botResult }) {
  const F = []
  const deltas = audit.events.filter((x) => eventKind(x.ev) === 'delta_routed')
  const match = (r) => deltas.some(
    (d) => d.ev.sender === r.sender
      && String(d.ev.sequence) === String(r.sequence)
      && String(d.ev.tickId) === String(r.tickId)
      && String(d.ev.revision) === String(r.revision)
      && d.ev.payloadSha256 === r.payloadSha256,
  )
  const sources = [
    { label: 'browserResult.received', records: isObject(browserResult) && Array.isArray(browserResult.received) ? browserResult.received : [] },
    { label: 'botResult.received', records: isObject(botResult) && Array.isArray(botResult.received) ? botResult.received : [] },
    {
      label: 'botTrace.delta_received',
      records: botTrace.events
        .filter((x) => eventKind(x.ev) === 'delta_received')
        .map((x) => ({ ...x.ev, _line: x.line, _text: x.text })),
    },
  ]
  for (const s of sources) {
    s.records.filter(isObject).forEach((r, i) => {
      if (!match(r)) {
        const loc = r._line !== undefined ? { line: r._line, excerpt: excerpt(r._text) } : {}
        F.push(fail('cross:unmatched-record', `${s.label}[${i}] (sender=${r.sender}, sequence=${r.sequence}, tickId=${r.tickId}, revision=${r.revision}, sha=${r.payloadSha256}) 无法在 server audit 的 delta_routed 中对账 —— 三方数值不一致`, loc))
      }
    })
  }
  return { failures: F }
}

/** 单轮总入口;contract 为解析后的契约 JSON(词表真值)。 */
export function verifyRound({ contract, auditText, botTraceText, browserResult, botResult }) {
  const failures = []
  const audit = parseNdjson(auditText, 'audit')
  const trace = parseNdjson(botTraceText, 'botTrace')

  for (const e of audit.parseErrors) {
    failures.push(fail('audit:bad-line', `audit 第 ${e.line} 行: ${e.message}`, { line: e.line, excerpt: e.excerpt }))
  }
  for (const e of trace.parseErrors) {
    failures.push(fail('botTrace:bad-line', `botTrace 第 ${e.line} 行: ${e.message}`, { line: e.line, excerpt: e.excerpt }))
  }

  const auditVocab = isObject(contract) ? contract?.process?.auditEventKinds ?? {} : {}
  const botVocab = isObject(contract) ? contract?.process?.botTraceEventKinds ?? {} : {}
  if (Object.keys(auditVocab).length === 0 || Object.keys(botVocab).length === 0) {
    failures.push(fail('contract:vocab-missing', '契约缺少 process.auditEventKinds / botTraceEventKinds,无法核对事件词表'))
  }
  failures.push(...checkVocabulary(audit.events, auditVocab, 'audit'))
  failures.push(...checkVocabulary(trace.events, botVocab, 'botTrace'))

  // 结构存在性:防止空证据空转通过(零 ingress 的空 audit 不允许 PASS)
  const auditKinds = new Set(audit.events.map((x) => eventKind(x.ev)))
  for (const k of ['server_listening', 'ingress_received', 'tick_committed', 'delta_routed', 'server_shutdown']) {
    if (!auditKinds.has(k)) failures.push(fail('audit:missing-event', `server audit 缺少关键事件 ${k}`))
  }
  const traceKinds = new Set(trace.events.map((x) => eventKind(x.ev)))
  for (const k of ['bot_started', 'bot_finished']) {
    if (!traceKinds.has(k)) failures.push(fail('botTrace:missing-event', `bot trace 缺少关键事件 ${k}`))
  }

  const chain = verifyAuditChain(audit)
  const results = verifyResults({ browserResult, botResult })
  const botTraceCheck = verifyBotTrace(trace)
  const cross = verifyCrossSource({ audit, botTrace: trace, browserResult, botResult })
  failures.push(...chain.failures, ...results.failures, ...botTraceCheck.failures, ...cross.failures)

  const example = isObject(contract) ? contract?.hash?.example : null
  if (isObject(example) && example.payloadSha256 !== undefined && example.payloadSha256 !== HELLO_PAYLOAD_SHA256) {
    failures.push(fail('contract:hash-example', `本工具计算的 sha256("${HELLO_PAYLOAD}") 与契约 hash.example(${example.payloadSha256})不一致`))
  }

  const receivedOf = (r) => (isObject(r) && Array.isArray(r.received) ? r.received.filter(isObject) : [])
  const latMax = (arr) => arr.reduce((m, r) => Math.max(m, Number(r.latencyMs) || 0), 0)
  const browserReceived = receivedOf(browserResult)
  const botReceived = receivedOf(botResult)
  const summary = {
    audit: { events: audit.events.length, ...chain.stats },
    botTrace: { events: trace.events.length, deltaReceived: trace.events.filter((x) => eventKind(x.ev) === 'delta_received').length },
    browser: { received: browserReceived.length, latencyMaxMs: latMax(browserReceived) },
    bot: { received: botReceived.length, latencyMaxMs: latMax(botReceived) },
  }
  return { ok: failures.length === 0, failures, summary }
}

const COMPARE_FIELDS = ['sequence', 'revision', 'payloadSha256', 'tickId']

/** 两轮对比:方向/sender/sequence/revision/payloadSha256/tickId 必须一致;latencyMs 只需均 <1000。 */
export function compareRounds(roundA, roundB) {
  const F = []
  const comparison = {}
  for (const side of ['browser', 'bot']) {
    const ra = roundA?.[side]?.received ?? []
    const rb = roundB?.[side]?.received ?? []
    const dirsA = [...new Set(ra.filter(isObject).map((r) => r.sender))].sort()
    const dirsB = [...new Set(rb.filter(isObject).map((r) => r.sender))].sort()
    const entry = { directionsRound1: dirsA, directionsRound2: dirsB, perDirection: {} }
    if (JSON.stringify(dirsA) !== JSON.stringify(dirsB)) {
      F.push(fail('compare:directions', `${side} 侧两轮方向(sender)集不一致: round1=[${dirsA}] round2=[${dirsB}]`))
    }
    if (ra.length !== rb.length) {
      F.push(fail('compare:count', `${side} 侧两轮 received 记录数不一致: round1=${ra.length} round2=${rb.length}`))
    }
    for (const sender of new Set([...dirsA, ...dirsB])) {
      const a = ra.filter((r) => isObject(r) && r.sender === sender)
      const b = rb.filter((r) => isObject(r) && r.sender === sender)
      const rec = { round1: a[0] ?? null, round2: b[0] ?? null }
      if (a.length > 1 || b.length > 1) {
        F.push(fail('compare:multiple-records', `${side} 侧 sender=${sender} 出现多条记录(round1=${a.length}, round2=${b.length});Hello 场景每方向应恰好一条`))
      }
      if (a[0] && b[0]) {
        const drift = []
        for (const field of COMPARE_FIELDS) {
          if (String(a[0][field]) !== String(b[0][field])) {
            drift.push(field)
            F.push(fail('compare:field-drift', `两轮不一致 ${side} ← sender=${sender}.${field}: round1=${JSON.stringify(a[0][field])} round2=${JSON.stringify(b[0][field])}(契约 roundsComparison:方向/revision/payloadSha256/tickId 必须一致)`))
          }
        }
        if (drift.length > 0) rec.drift = drift
        for (const [label, r] of [['round1', a[0]], ['round2', b[0]]]) {
          const lat = Number(r.latencyMs)
          if (!Number.isFinite(lat) || lat >= LATENCY_LIMIT_MS) {
            F.push(fail('compare:latency', `两轮对比中 ${label} ${side} ← sender=${sender} latencyMs=${r.latencyMs} 超限或非法(须 <${LATENCY_LIMIT_MS})`))
          }
        }
      } else {
        F.push(fail('compare:missing-record', `${side} 侧 sender=${sender} 在某一轮缺少记录(round1=${a.length}, round2=${b.length})`))
      }
      entry.perDirection[sender] = rec
    }
    comparison[side] = entry
  }
  return { ok: F.length === 0, failures: F, comparison }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function runCli() {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined
  }
  const need = ['audit', 'bot-trace', 'bot-result', 'browser-result', 'contract']
  const paths = {}
  const missing = need.filter((n) => !flag(n))
  if (missing.length) {
    process.stderr.write(`用法: node verify-evidence.mjs --audit <f> --bot-trace <f> --bot-result <f> --browser-result <f> --contract <f> [--json]\n缺少参数: ${missing.map((m) => `--${m}`).join(' ')}\n`)
    return 1
  }
  for (const n of need) paths[n] = flag(n)
  const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
  const report = verifyRound({
    contract: readJson(paths.contract),
    auditText: readFileSync(paths.audit, 'utf8'),
    botTraceText: readFileSync(paths['bot-trace'], 'utf8'),
    browserResult: readJson(paths['browser-result']),
    botResult: readJson(paths['bot-result']),
  })
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    for (const f of report.failures) {
      const loc = f.line ? ` (行 ${f.line})` : ''
      process.stdout.write(`FAIL [${f.check}]${loc} ${f.message}\n`)
      if (f.excerpt) process.stdout.write(`     摘录: ${f.excerpt}\n`)
    }
    process.stdout.write(`summary: ${JSON.stringify(report.summary)}\n`)
    process.stdout.write(`VERDICT: ${report.ok ? 'PASS' : 'FAIL'}\n`)
  }
  return report.ok ? 0 : 1
}

const isTestRun = Boolean(process.env.NODE_TEST_CONTEXT)
if (!isTestRun && process.argv.includes('--audit')) {
  runCli().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`verify-evidence 内部错误: ${err && err.stack ? err.stack : err}\n`)
      process.exit(1)
    },
  )
}
if (isTestRun) registerTests()

// ---------------------------------------------------------------------------
// 测试(仅在 node --test 子进程中注册;合成 fixture 覆盖正反用例)
// ---------------------------------------------------------------------------

function registerTests() {
  const test = nodeTest
  const HELLO_SHA = HELLO_PAYLOAD_SHA256

  // 最小契约词表(与 engine/wire/hello-wire-v1.json process 节同形,运行时真值仍以契约文件为准)
  function contractFixture() {
    return {
      contractId: 'lumio.hello-wire.v1',
      version: 1,
      hash: { algorithm: 'sha256', encoding: 'lowercase-hex', input: 'payload 字段原始 UTF-8 字节', example: { payload: HELLO_PAYLOAD, payloadSha256: HELLO_SHA } },
      process: {
        auditEventKinds: {
          server_listening: { required: ['port', 'pid', 'contractId'] },
          session_open: { required: ['sessionId', 'remote'] },
          handshake_accepted: { required: ['sessionId', 'role', 'clientName'] },
          handshake_rejected: { required: ['sessionId', 'code', 'detail'] },
          baseline_sent: { required: ['sessionId', 'revision', 'tickId'] },
          baseline_acked: { required: ['sessionId', 'revision'] },
          ingress_received: { required: ['sessionId', 'sender', 'sequence', 'payloadSha256'] },
          ingress_rejected: { required: ['sessionId', 'sender', 'sequence', 'code'] },
          tick_committed: { required: ['tickId', 'revision', 'deltaCount', 'senders'] },
          delta_routed: { required: ['sessionId', 'sender', 'sequence', 'tickId', 'revision', 'payloadSha256'] },
          session_closed: { required: ['sessionId', 'code'] },
          server_shutdown: { required: ['reason', 'sessions'] },
        },
        botTraceEventKinds: {
          bot_started: { required: ['pid', 'role', 'serverUrl'] },
          connected: { required: ['sessionId'] },
          handshake_ack: { required: ['role', 'accepted'] },
          baseline_received: { required: ['revision', 'tickId', 'helloLogCount'] },
          baseline_ack_sent: { required: ['revision'] },
          command_sent: { required: ['sender', 'sequence', 'payloadSha256', 'sentAtMs'] },
          delta_received: { required: ['sender', 'sequence', 'tickId', 'revision', 'payloadSha256', 'latencyMs'] },
          command_result: { required: ['ok', 'detail'] },
          error_received: { required: ['code', 'detail'] },
          bot_finished: { required: ['exitOk', 'receivedBySender'] },
        },
      },
    }
  }

  // ---- 合成 fixture:好链 ----

  function goodAuditLines({ dropTickCommitted = false, echoBack = false } = {}) {
    const SB = 'session-bot'
    const SW = 'session-browser'
    const lines = [
      { kind: 'server_listening', port: 50000, pid: 100, contractId: 'lumio.hello-wire.v1' },
      { kind: 'session_open', sessionId: SW, remote: '127.0.0.1:1' },
      { kind: 'session_open', sessionId: SB, remote: '127.0.0.1:2' },
      { kind: 'handshake_accepted', sessionId: SW, role: 'browser', clientName: 'browser' },
      { kind: 'handshake_accepted', sessionId: SB, role: 'bot', clientName: 'bot' },
      { kind: 'baseline_sent', sessionId: SW, revision: 0, tickId: 0 },
      { kind: 'baseline_acked', sessionId: SW, revision: 0 },
      { kind: 'baseline_sent', sessionId: SB, revision: 0, tickId: 0 },
      { kind: 'baseline_acked', sessionId: SB, revision: 0 },
      { kind: 'ingress_received', sessionId: SW, sender: 'browser', sequence: 1, payloadSha256: HELLO_SHA },
    ]
    if (!dropTickCommitted) lines.push({ kind: 'tick_committed', tickId: 1, revision: 1, deltaCount: 1, senders: ['browser'] })
    lines.push({ kind: 'delta_routed', sessionId: echoBack ? SW : SB, sender: 'browser', sequence: 1, tickId: 1, revision: 1, payloadSha256: HELLO_SHA })
    lines.push({ kind: 'ingress_received', sessionId: SB, sender: 'bot', sequence: 1, payloadSha256: HELLO_SHA })
    if (!dropTickCommitted) lines.push({ kind: 'tick_committed', tickId: 2, revision: 2, deltaCount: 1, senders: ['bot'] })
    lines.push({ kind: 'delta_routed', sessionId: echoBack ? SB : SW, sender: 'bot', sequence: 1, tickId: 2, revision: 2, payloadSha256: HELLO_SHA })
    lines.push({ kind: 'session_closed', sessionId: SW, code: 'normal' })
    lines.push({ kind: 'session_closed', sessionId: SB, code: 'normal' })
    lines.push({ kind: 'server_shutdown', reason: 'integration-complete', sessions: 2 })
    return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  }

  function goodBotTraceLines() {
    const lines = [
      { kind: 'bot_started', pid: 200, role: 'bot', serverUrl: 'ws://127.0.0.1:50000/' },
      { kind: 'connected', sessionId: 'session-bot' },
      { kind: 'handshake_ack', role: 'bot', accepted: true },
      { kind: 'baseline_received', revision: 0, tickId: 0, helloLogCount: 0 },
      { kind: 'baseline_ack_sent', revision: 0 },
      { kind: 'command_sent', sender: 'bot', sequence: 1, payloadSha256: HELLO_SHA, sentAtMs: 1000 },
      { kind: 'delta_received', sender: 'browser', sequence: 1, tickId: 1, revision: 1, payloadSha256: HELLO_SHA, latencyMs: 40 },
      { kind: 'command_result', ok: true, detail: 'hello committed' },
      { kind: 'bot_finished', exitOk: true, receivedBySender: { browser: 1 } },
    ]
    return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  }

  function goodBrowserResult({ latencyMs = 35, sha = HELLO_SHA } = {}) {
    return {
      status: 'ok',
      role: 'browser',
      sessionId: 'session-browser',
      baselineRevision: 0,
      sent: { sequence: 1, payloadSha256: HELLO_SHA, sentAtMs: 1200 },
      received: [{ sender: 'bot', sequence: 1, tickId: 2, revision: 2, payloadSha256: sha, latencyMs }],
      errors: [],
    }
  }

  function goodBotResult({ latencyMs = 48, sha = HELLO_SHA } = {}) {
    return {
      ok: true,
      status: 'ok',
      role: 'bot',
      sessionId: 'session-bot',
      baselineRevision: 0,
      sent: { sequence: 1, payloadSha256: HELLO_SHA, sentAtMs: 1000 },
      received: [{ sender: 'browser', sequence: 1, tickId: 1, revision: 1, payloadSha256: sha, latencyMs }],
      errors: [],
    }
  }

  function roundFixture(mutate = {}) {
    return {
      contract: contractFixture(),
      auditText: goodAuditLines(mutate),
      botTraceText: goodBotTraceLines(),
      browserResult: goodBrowserResult(mutate),
      botResult: goodBotResult(mutate),
    }
  }

  function failureText(report) {
    return report.failures.map((f) => `${f.check}: ${f.message}`).join('\n')
  }

  test('sha256("Hello World") 与契约示例一致', () => {
    assert.equal(HELLO_PAYLOAD_SHA256, 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e')
  })

  test('好链:完整正例对账通过', () => {
    const report = verifyRound(roundFixture())
    assert.equal(report.ok, true, `不应有失败项:\n${failureText(report)}`)
    assert.equal(report.summary.audit.ingress, 2)
    assert.equal(report.summary.audit.tick, 2)
    assert.equal(report.summary.audit.delta, 2)
  })

  test('Echo 链:缺 tick_committed 必须 FAIL', () => {
    const report = verifyRound(roundFixture({ dropTickCommitted: true }))
    assert.equal(report.ok, false, '缺 tick_committed 的 Echo 链必须 FAIL')
    assert.match(failureText(report), /tick_committed|无 tick/)
  })

  test('Echo 链:delta_routed 路由回发送方会话必须 FAIL', () => {
    const report = verifyRound(roundFixture({ echoBack: true }))
    assert.equal(report.ok, false, '回声路由必须 FAIL')
    assert.match(failureText(report), /回发送方会话|Echo/)
  })

  test('坏 hash:browser received payloadSha256 不符必须 FAIL', () => {
    const report = verifyRound(roundFixture({ sha: 'deadbeef' + '0'.repeat(56) }))
    assert.equal(report.ok, false, '坏 hash 必须 FAIL')
    assert.match(failureText(report), /payloadSha256/)
  })

  test('latency 超标(>=1000ms)必须 FAIL', () => {
    const report = verifyRound(roundFixture({ latencyMs: 1500 }))
    assert.equal(report.ok, false, 'latency 超标必须 FAIL')
    assert.match(failureText(report), /latency|延迟/)
  })

  test('必填字段缺失(按契约词表动态核对)必须 FAIL', () => {
    const input = roundFixture()
    const tampered = input.auditText.replace('"payloadSha256":"', '"_removed_":"', 1)
    const report = verifyRound({ ...input, auditText: tampered })
    assert.equal(report.ok, false, 'ingress_received 缺 payloadSha256 必须 FAIL')
    assert.match(failureText(report), /payloadSha256/)
  })

  test('compareRounds:两轮一致且 latency 达标通过;revision 漂移必须 FAIL', () => {
    const r1 = { browser: { received: goodBrowserResult().received }, bot: { received: goodBotResult().received } }
    const r2same = { browser: { received: goodBrowserResult({ latencyMs: 200 }).received }, bot: { received: goodBotResult({ latencyMs: 300 }).received } }
    assert.equal(compareRounds(r1, r2same).ok, true)

    const drifted = goodBrowserResult()
    drifted.received[0].revision = 3
    const r2drift = { browser: { received: drifted.received }, bot: { received: goodBotResult().received } }
    const cmp = compareRounds(r1, r2drift)
    assert.equal(cmp.ok, false, '两轮 revision 不一致必须 FAIL')
    assert.match(cmp.failures.map((f) => f.message).join('\n'), /revision/)
  })
}

// node:test 在本文件中经 require 使用(CLI 直跑时不加载 node:test)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
