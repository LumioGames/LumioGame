/**
 * Drive the 11 ecs-entity-chat §6 scenarios against live Account Server + C# MVP host.
 * Host audit is the census source; this module never writes a hardcoded 101 admit event.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'
import { loginOrRegister, summarizeLogin } from './account-client.mjs'
import { allBotLoginNames, issueBotToolCredential } from './bot-credential.mjs'
import {
  closeQuietly,
  completeMvpHandshake,
  connectMvpHost,
  handshakeAdmitBinding,
  mvpSessionId,
  sendWsPing,
  FULLGRAPH_LIMIT_FILE,
  FULLGRAPH_LIMIT_LINE,
  FULLGRAPH_MAX_CONNECTIONS,
  FULLGRAPH_MAX_SESSIONS,
} from './game-client.mjs'
import {
  BROWSER_NAME,
  MAIN_ROOM,
  S8_NENT_GAP_REASON,
  TEST_PASSWORD,
  isEntityRebound,
  isHostNetEntityId,
  isLauncherLoopIndex,
  reconnectSessionCandidates,
  shouldRetryReconnectHandshake,
} from './verify-evidence.mjs'
import { extractChatEventsFromFrame } from './web/chat-window.js'

export { BROWSER_NAME, MAIN_ROOM, TEST_PASSWORD }

export const ISO_ROOM = 'room-iso'

export function encodeChatInput(text) {
  const utf8 = Buffer.from(String(text ?? ''), 'utf8')
  const payload = Buffer.alloc(4 + utf8.length)
  payload.writeUInt32LE(utf8.length, 0)
  utf8.copy(payload, 4)
  return {
    messageType: 'InputCommand',
    mappingId: 'chat.input',
    payload: payload.toString('hex'),
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
  }
}

export function observedEventKey(event) {
  return `${event.senderNetEntityId}:${event.text}:${event.roomSequence}`
}

/** Loopback Room wire client (C-1 JSON, first frame `{connectionId}`). */
export async function connectRoomWire(listenUri, connectionId, { timeoutMs = 10000 } = {}) {
  const url = String(listenUri ?? '')
  if (!url) throw new Error('missing room listenUri')
  const ws = new WebSocket(url)
  const received = []
  const chatEvents = []
  const state = { superseded: false, snapshot: false, closed: false }
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`room connect timeout (${timeoutMs}ms)`)), timeoutMs)
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('room websocket error'))
    })
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      ws.send(JSON.stringify({ connectionId }))
      resolve()
    })
  })
  ws.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : String(ev.data)
    received.push(raw)
    let parsed = null
    try { parsed = JSON.parse(raw) } catch { parsed = null }
    if (parsed?.messageType === 'ConnectionSuperseded') state.superseded = true
    if (parsed?.messageType === 'FullSnapshot') state.snapshot = true
    chatEvents.push(...extractChatEventsFromFrame(parsed ?? raw))
  })
  ws.addEventListener('close', () => { state.closed = true })
  await opened
  return {
    ws,
    connectionId,
    received,
    chatEvents,
    get superseded() { return state.superseded },
    get snapshot() { return state.snapshot },
    get closed() { return state.closed },
    close: () => { try { ws.close() } catch { /* ignore */ } },
  }
}

export async function testControlRequest(testControlUri, method, path, body) {
  const base = String(testControlUri ?? '').replace(/\/$/, '')
  if (!base || base === '-') {
    throw new Error('missing testControlUri')
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const raw = await res.text()
  let json = null
  try {
    json = JSON.parse(raw)
  } catch {
    json = { ok: false, error: `non-json ${res.status}`, raw: raw.slice(0, 200) }
  }
  return { status: res.status, json }
}

export async function fetchBindings(testControlUri) {
  const { json } = await testControlRequest(testControlUri, 'GET', '/test-control/bindings')
  return Array.isArray(json?.bindings) ? json.bindings : []
}

export function indexBindings(bindings, botLogins = [], browser = null) {
  const byAccount = new Map()
  for (const row of botLogins) {
    if (row?.accountId) byAccount.set(row.accountId, { loginName: row.loginName, entityType: 'bot', accountId: row.accountId })
  }
  if (browser?.accountId) {
    byAccount.set(browser.accountId, { loginName: browser.loginName, entityType: 'player', accountId: browser.accountId })
  }
  return (bindings ?? []).map((row) => {
    const extra = byAccount.get(row.accountId) ?? {}
    const entityKind = row.entityKind ?? extra.entityType ?? null
    return {
      ...row,
      loginName: extra.loginName ?? row.loginName ?? null,
      entityKind,
      entityType: entityKind,
    }
  })
}

function mainRoomBindings(indexed) {
  return indexed.filter((row) => !row.roomId || row.roomId === MAIN_ROOM)
}

function findLogin(indexed, loginName) {
  return indexed.find((row) => row.loginName === loginName) ?? null
}

function appendTrace(path, obj) {
  if (!path) return
  appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n')
}

export async function runAccountScenario1({ accountPort, botSeed, tracePath }) {
  const claim = issueBotToolCredential(botSeed)
  const first = await loginOrRegister(accountPort, { loginName: 'Bot01', password: TEST_PASSWORD, botToolCredential: claim })
  appendTrace(tracePath, { kind: 'login_or_register', loginName: 'Bot01', ...summarizeLogin(first) })
  const second = await loginOrRegister(accountPort, {
    loginName: 'Bot01',
    password: TEST_PASSWORD,
    botToolCredential: issueBotToolCredential(botSeed),
  })
  appendTrace(tracePath, { kind: 'login_or_register', loginName: 'Bot01', ...summarizeLogin(second) })
  const wrong = await loginOrRegister(accountPort, {
    loginName: 'Bot01',
    password: 'wrong-password',
    botToolCredential: issueBotToolCredential(botSeed),
  })
  appendTrace(tracePath, { kind: 'login_rejected', loginName: 'Bot01', ...summarizeLogin(wrong) })
  return {
    create: summarizeLogin(first),
    load: summarizeLogin(second),
    wrongPassword: summarizeLogin(wrong),
    firstRaw: first,
  }
}

export async function loginBots({ accountPort, botSeed, tracePath, count = 100 }) {
  const names = allBotLoginNames().slice(0, count)
  const results = []
  for (const loginName of names) {
    const parsed = await loginOrRegister(accountPort, {
      loginName,
      password: TEST_PASSWORD,
      botToolCredential: issueBotToolCredential(botSeed),
    })
    const summary = summarizeLogin(parsed)
    appendTrace(tracePath, { kind: 'bot_login', loginName, ...summary })
    results.push({ loginName, ...summary, admissionCredential: parsed.admissionCredential })
  }
  return results
}

export async function loginBrowser({ accountPort, tracePath, loginName = BROWSER_NAME }) {
  const parsed = await loginOrRegister(accountPort, { loginName, password: TEST_PASSWORD })
  const summary = summarizeLogin(parsed)
  appendTrace(tracePath, { kind: 'browser_login', loginName, ...summary })
  return { loginName, ...summary, admissionCredential: parsed.admissionCredential, raw: parsed }
}

/**
 * Attempt 101 MVP-host upgrades. Do not shrink the scenario if FullGraph
 * rejects a client; record the measured HTTP status and stop.
 *
 * `clients` is optional per-connection material: { tokenBytes, entityType, loginName }.
 * Shared-secret admits omit entityType and do not count as a bot/player census.
 */
export async function admitLiveConnections({ listenUri, tokenBytes, clients, desired, tracePath, afterAdmit }) {
  const sockets = []
  const admits = []
  let blocked = null
  const n = Array.isArray(clients) && clients.length > 0 ? clients.length : desired
  for (let i = 1; i <= n; i++) {
    const client = Array.isArray(clients) ? clients[i - 1] : null
    const token = client?.tokenBytes ?? tokenBytes
    const entityType = client?.entityType ?? null
    const loginName = client?.loginName ?? null
    try {
      const conn = await connectMvpHost(listenUri, token)
      try {
        const sessionId = mvpSessionId(client?.sessionId ?? client?.accountId, loginName)
        if (typeof sessionId !== 'string' || sessionId.length === 0 || isLauncherLoopIndex(sessionId)) {
          throw new Error(`mvp-host Handshake skipped: missing host sessionId for ${loginName ?? i}`)
        }
        const hs = await completeMvpHandshake(conn.socket, { sessionId })
        sockets.push(conn.ws)
        const rec = {
          index: i,
          ok: true,
          protocol: conn.protocol,
          status: conn.status ?? 101,
          process: 'lumio-mvp-host',
          connectionId: String(i),
          sessionId: hs.sessionId,
          netEntityId: hs.netEntityId ?? null,
          handshake: true,
          snapshotMessageType: hs.snapshot?.messageType ?? 'FullSnapshot',
          ...(entityType ? { entityType } : {}),
          ...(loginName ? { loginName } : {}),
          ...(client?.accountId ? { accountId: client.accountId } : {}),
        }
        admits.push(rec)
        appendTrace(tracePath, { kind: 'connection_upgrade', index: i, ok: true, status: rec.status, process: rec.process, loginName, entityType })
        appendTrace(tracePath, { kind: 'binding_committed', ...rec })
        if (typeof afterAdmit === 'function') {
          rec.chat = await afterAdmit(rec)
        }
      } catch (hsErr) {
        await closeQuietly(conn.ws)
        throw hsErr
      }
    } catch (err) {
      const rec = {
        index: i,
        ok: false,
        status: err.status ?? null,
        capacity: err.capacity === true,
        message: String(err.message ?? err).split('\n')[0],
        process: 'lumio-mvp-host',
        connectionId: String(i),
        ...(entityType ? { entityType } : {}),
        ...(loginName ? { loginName } : {}),
      }
      admits.push(rec)
      appendTrace(tracePath, { kind: 'connection_upgrade', ...rec })
      if (rec.capacity || rec.status === 503) {
        blocked = {
          status: 'BLOCKED',
          constant: `MaxConnections = ${FULLGRAPH_MAX_CONNECTIONS} / MaxSessions = ${FULLGRAPH_MAX_SESSIONS}`,
          file: FULLGRAPH_LIMIT_FILE,
          line: FULLGRAPH_LIMIT_LINE,
          error: rec.message,
          atConnection: i,
          httpStatus: rec.status,
        }
        break
      }
      break
    }
  }
  return { sockets, admits, blocked, live: sockets.length }
}

export async function closeAll(sockets) {
  for (const ws of sockets) await closeQuietly(ws)
}

function firstLine(err) {
  return String(err?.message ?? err ?? '').split('\n')[0]
}

/** Playwright Chromium against the harness page. Does not inject chat events. */
export async function runPlaywrightBrowser({
  pageUrl,
  password,
  resultPath,
  consolePath,
  waitForEvents = 0,
  waitMs = 30000,
} = {}) {
  const importErrors = []
  let chromium = null
  const here = dirname(fileURLToPath(import.meta.url))
  const requirePw = createRequire(import.meta.url)
  const fileSpecs = [
    resolve(here, '../hello/node_modules/playwright/index.js'),
    resolve(here, '../../../../LumioGame/integration/hello/node_modules/playwright/index.js'),
    process.env.LUMIO_GAME_ROOT
      ? resolve(process.env.LUMIO_GAME_ROOT, 'integration/hello/node_modules/playwright/index.js')
      : null,
  ].filter((p) => p && existsSync(p))
  try {
    ;({ chromium } = await import('playwright'))
  } catch (err) {
    importErrors.push(`playwright: ${firstLine(err)}`)
  }
  if (!chromium) {
    for (const spec of fileSpecs) {
      try {
        const mod = requirePw(spec)
        chromium = mod?.chromium ?? mod?.default?.chromium ?? null
        if (chromium) break
        const esm = await import(pathToFileURL(spec.replace(/index\.js$/i, 'index.mjs')).href)
        chromium = esm?.chromium ?? esm?.default?.chromium ?? null
        if (chromium) break
        importErrors.push(`${spec}: no chromium export`)
      } catch (err) {
        importErrors.push(`${spec}: ${firstLine(err)}`)
      }
    }
  }
  if (!chromium) {
    return {
      ran: false,
      injected: false,
      receivedFromNetwork: false,
      receivedChatEvent: false,
      windowLines: [],
      error: `playwright unavailable: ${importErrors.join(' | ') || 'module not found'}`,
    }
  }

  const launchErrors = []
  let browser = null
  let channel = null
  for (const ch of ['chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ channel: ch, headless: true })
      channel = ch
      break
    } catch (err) {
      launchErrors.push(`${ch}: ${firstLine(err)}`)
    }
  }
  if (!browser) {
    try {
      browser = await chromium.launch({ headless: true })
      channel = 'chromium'
    } catch (err) {
      launchErrors.push(`bundled: ${firstLine(err)}`)
      return {
        ran: false,
        injected: false,
        receivedFromNetwork: false,
        receivedChatEvent: false,
        windowLines: [],
        error: `Chromium missing: ${launchErrors.join(' | ')}`,
      }
    }
  }

  const appendEv = (obj) => {
    if (!consolePath) return
    try {
      appendFileSync(consolePath, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n')
    } catch { /* ignore */ }
  }

  let result = null
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('console', (m) => appendEv({ kind: 'console', type: m.type(), text: m.text() }))
  page.on('pageerror', (e) => appendEv({ kind: 'pageerror', text: String(e) }))
  try {
    await page.goto(pageUrl, { timeout: 20000, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => typeof window.__lumioStartLogin === 'function', null, { timeout: 10000 })
    await page.evaluate(async (pw) => {
      await window.__lumioStartLogin(pw)
    }, password)
    await page.waitForFunction(
      () => window.__lumioResult && window.__lumioResult.status !== 'pending',
      null,
      { timeout: 20000 },
    )
    if (Number(waitForEvents) > 0) {
      await page.waitForFunction(
        (n) => (window.__lumioChat?.window?.lines?.length ?? 0) >= n,
        Number(waitForEvents),
        { timeout: waitMs },
      )
    }
    result = await page.evaluate(() => ({
      ...(window.__lumioResult ?? {}),
      windowLines: window.__lumioChat?.window?.lines ?? [],
      receivedChatEvent: (window.__lumioChat?.window?.lines?.length ?? 0) > 0
        || window.__lumioResult?.receivedChatEvent === true,
      connectionSuperseded: window.__lumioResult?.connectionSuperseded === true,
    }))
  } catch (err) {
    appendEv({ kind: 'harness-error', text: firstLine(err) })
    result = await page.evaluate(() => ({
      ...(window.__lumioResult ?? {}),
      windowLines: window.__lumioChat?.window?.lines ?? [],
      receivedChatEvent: (window.__lumioChat?.window?.lines?.length ?? 0) > 0,
    })).catch(() => null)
    const windowLines = Array.isArray(result?.windowLines) ? result.windowLines : []
    return {
      ran: true,
      injected: false,
      receivedFromNetwork: windowLines.length > 0 || result?.receivedChatEvent === true,
      receivedChatEvent: windowLines.length > 0 || result?.receivedChatEvent === true,
      windowLines,
      receivedEvents: windowLines,
      browser: 'chromium',
      channel,
      error: firstLine(err),
      result,
    }
  } finally {
    try { await context.close() } catch { /* ignore */ }
    try { await browser.close() } catch { /* ignore */ }
  }
  if (resultPath) {
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n')
  }
  const windowLines = Array.isArray(result?.windowLines) ? result.windowLines : []
  const receivedChatEvent = windowLines.length > 0 || result?.receivedChatEvent === true
  return {
    ran: true,
    injected: false,
    receivedFromNetwork: receivedChatEvent,
    receivedChatEvent,
    windowLines,
    receivedEvents: windowLines,
    connectionSuperseded: result?.connectionSuperseded === true,
    browser: 'chromium',
    channel,
    result,
  }
}

export function credentialTokenBytes(admissionCredential) {
  return Buffer.from(String(admissionCredential), 'utf8')
}

async function handshakeReconnectOnce(listenUri, tokenBytes, sessionId) {
  const conn = await connectMvpHost(listenUri, tokenBytes)
  try {
    const hs = await completeMvpHandshake(conn.socket, { sessionId })
    return { conn, hs }
  } catch (err) {
    await closeQuietly(conn.ws)
    throw err
  }
}

export async function reconnectNamedBot({
  accountPort,
  botSeed,
  loginName,
  listenUri,
  tracePath,
  sessionId,
  netEntityId,
}) {
  const parsed = await loginOrRegister(accountPort, {
    loginName,
    password: TEST_PASSWORD,
    botToolCredential: issueBotToolCredential(botSeed),
  })
  const summary = summarizeLogin(parsed)
  appendTrace(tracePath, { kind: 'reconnect_login', loginName, ...summary })
  if (!parsed.accepted || !parsed.admissionCredential) {
    return { ok: false, rebound: false, loginName, ...summary }
  }
  let bindSessionId = null
  try {
    bindSessionId = mvpSessionId(sessionId ?? parsed.accountId, loginName)
  } catch {
    bindSessionId = null
  }
  const disconnected = {
    sessionId: sessionId ?? bindSessionId ?? null,
    netEntityId: isHostNetEntityId(netEntityId) ? netEntityId : null,
  }
  const candidates = reconnectSessionCandidates(bindSessionId, loginName)
  if (candidates.length === 0) {
    return { ok: false, rebound: false, loginName, error: 'reconnect missing host sessionId', ...summary }
  }
  const tokenBytes = credentialTokenBytes(parsed.admissionCredential)
  let lastError = 'reconnect missing host sessionId'
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const handshakeSessionId = candidates[attempt]
    try {
      const { conn, hs } = await handshakeReconnectOnce(listenUri, tokenBytes, handshakeSessionId)
      const missingSession = typeof hs.sessionId !== 'string' || hs.sessionId.length === 0
      if (missingSession && attempt === 0 && candidates.length > 1) {
        await closeQuietly(conn.ws)
        appendTrace(tracePath, {
          kind: 'reconnect_upgrade',
          process: 'lumio-mvp-host',
          loginName,
          ok: false,
          message: 'reconnect missing host sessionId',
          retry: true,
        })
        lastError = 'reconnect missing host sessionId'
        continue
      }
      const admitted = handshakeAdmitBinding(hs)
      const rebound = isEntityRebound(disconnected, admitted)
      const hostNent = rebound
        ? disconnected.netEntityId
        : (isHostNetEntityId(admitted.netEntityId) ? admitted.netEntityId : null)
      appendTrace(tracePath, {
        kind: 'reconnect_upgrade',
        process: 'lumio-mvp-host',
        loginName,
        ok: rebound,
        status: conn.status ?? 101,
        entityType: 'bot',
        sessionId: admitted.sessionId ?? hs.sessionId,
        previousSessionId: disconnected.sessionId,
        netEntityId: admitted.netEntityId ?? null,
        previousNetEntityId: disconnected.netEntityId,
        handshake: true,
        rebound,
        ...(rebound ? {} : { blockedReason: S8_NENT_GAP_REASON }),
      })
      appendTrace(tracePath, {
        kind: 'binding_committed',
        process: 'lumio-mvp-host',
        loginName,
        entityType: 'bot',
        sessionId: admitted.sessionId ?? hs.sessionId,
        netEntityId: admitted.netEntityId ?? null,
        handshake: true,
        reconnect: true,
      })
      return {
        ok: rebound,
        rebound,
        socket: conn.ws,
        loginName,
        status: conn.status ?? 101,
        sessionId: admitted.sessionId ?? hs.sessionId,
        previousSessionId: disconnected.sessionId,
        netEntityId: admitted.netEntityId ?? null,
        previousNetEntityId: disconnected.netEntityId,
        accountId: admitted.accountId ?? null,
        entityA: hostNent,
        ...(rebound ? {} : { blockedReason: S8_NENT_GAP_REASON }),
      }
    } catch (err) {
      lastError = String(err.message ?? err).split('\n')[0]
      const retry = attempt === 0 && candidates.length > 1 && shouldRetryReconnectHandshake(err)
      appendTrace(tracePath, {
        kind: 'reconnect_upgrade',
        process: 'lumio-mvp-host',
        loginName,
        ok: false,
        message: lastError,
        retry,
      })
      if (!retry) break
    }
  }
  return { ok: false, rebound: false, loginName, error: lastError }
}

export async function driveLiveEleven({
  testControlUri,
  botLogins,
  browser,
  accountPort,
  botSeed,
  tracePath,
  reconnectBot100,
  disconnectLogin,
  keepAlive,
  admits,
  observed,
}) {
  const failed = (reason, extra = {}) => ({
    ok: false,
    error: reason,
    bindings: [],
    queries: { blockedReason: reason },
    chat: { eventCount: 0, tickSource: null, timerManagerInvoked: false },
    persist: { snapshotSource: 'missing', historyCountMax: 0, restoredWindow: null, windowBeforeSnapshot: null },
    reconnect: { rebound: false, blockedReason: reason },
    expiry: { tombstoned: false, blockedReason: reason },
    isolation: { ok: false, blockedReason: reason },
    eventOrder: [],
    appliedTicks: [],
    ...extra,
  })

  if (!testControlUri || testControlUri === '-') {
    return failed('missing testControlUri')
  }

  try {
  let bindings
  try {
    bindings = indexBindings(await fetchBindings(testControlUri), botLogins, browser)
  } catch (err) {
    return failed(String(err?.message ?? err).split('\n')[0])
  }

  const censusRows = mainRoomBindings(bindings).filter((row) => isHostNetEntityId(row.netEntityId))
  const bots = censusRows.filter((row) => row.entityKind === 'bot' || row.entityType === 'bot')
  const players = censusRows.filter((row) => row.entityKind === 'player' || row.entityType === 'player')
  appendTrace(tracePath, {
    kind: 'test_control_bindings',
    process: 'lumio-mvp-host',
    count: censusRows.length,
    botCount: bots.length,
    playerCount: players.length,
  })

  const player = players[0] ?? findLogin(bindings, BROWSER_NAME)
  const bot01 = findLogin(bindings, 'Bot01') ?? bots[0]
  const queries = {
    unauthorized: null,
    invisible: null,
    stale: null,
    ok: null,
    missing: null,
  }
  if (player?.netEntityId && bot01?.netEntityId) {
    const ok = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: player.netEntityId,
      targetNetEntityId: player.netEntityId,
      attributeId: 'EntityIdentity.entityType',
    })
    queries.ok = ok.json
    const unauthorized = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: bot01.netEntityId,
      targetNetEntityId: player.netEntityId,
      attributeId: 'EntityIdentity.restrictedFlag',
    })
    queries.unauthorized = unauthorized.json
    const invisible = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: bot01.netEntityId,
      targetNetEntityId: player.netEntityId,
      attributeId: 'ChatComponent.lastMessageText',
    })
    queries.invisible = invisible.json
    const stale = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: player.netEntityId,
      targetNetEntityId: player.netEntityId,
      attributeId: 'EntityIdentity.entityType',
      connectionGeneration: 0,
    })
    queries.stale = stale.json
    const missing = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: player.netEntityId,
      targetNetEntityId: 'nent_0000000000000000000000000000dead',
      attributeId: 'EntityIdentity.entityType',
    })
    queries.missing = missing.json
  }
  const s5ok = String(queries.ok?.outcome).toLowerCase() === 'ok'
    && String(queries.unauthorized?.outcome).toLowerCase() === 'unauthorized'
    && String(queries.invisible?.outcome).toLowerCase() === 'invisible'
    && /stale/.test(String(queries.stale?.outcome ?? '').toLowerCase())

  const chatTargets = censusRows.filter((row) => row.connectionId)
  let envelope = null
  let chatAdmitted = 0
  const admitChats = new Map()
  for (const rec of admits?.admits ?? []) {
    if (rec?.chat?.ok === true) {
      admitChats.set(String(rec.connectionId), rec)
      envelope ??= {
        messageType: rec.chat.messageType,
        mappingId: rec.chat.mappingId,
        payload: rec.chat.payload,
        payloadSha256: rec.chat.payloadSha256,
      }
    }
  }
  if (typeof keepAlive === 'function') await keepAlive()
  for (let i = 0; i < chatTargets.length; i++) {
    const row = chatTargets[i]
    const text = `hello-${row.loginName ?? row.connectionId}`
    const prior = admitChats.get(String(row.connectionId))
    if (prior?.chat?.ok === true) {
      chatAdmitted += 1
      continue
    }
    const cmd = encodeChatInput(text)
    envelope ??= cmd
    const posted = await testControlRequest(testControlUri, 'POST', '/test-control/chat', {
      connectionId: row.connectionId,
      mappingId: cmd.mappingId,
      payload: cmd.payload,
      payloadSha256: cmd.payloadSha256,
    })
    if (posted.json?.ok === true) {
      chatAdmitted += 1
    }
    appendTrace(tracePath, {
      kind: 'test_control_chat',
      process: 'lumio-mvp-host',
      connectionId: row.connectionId,
      netEntityId: row.netEntityId,
      ok: posted.json?.ok === true,
      kindResult: posted.json?.kind ?? null,
      error: posted.json?.error ?? null,
    })
    if (typeof keepAlive === 'function' && (i + 1) % 10 === 0) await keepAlive()
  }
  const tick = await testControlRequest(testControlUri, 'POST', '/test-control/tick', { roomId: MAIN_ROOM })
  const appliedTick = Number(tick.json?.appliedTick ?? 0)
  const receivedEvents = Array.isArray(observed?.receivedEvents) ? observed.receivedEvents : []
  const eventOrder = receivedEvents.map((ev) => observedEventKey(ev))
  const appliedTicks = receivedEvents.map((ev) => ev.appliedTick)
  const utteranceTicks = Array.isArray(observed?.utteranceTicks) ? observed.utteranceTicks : []
  const timerManagerInvoked = observed?.timerManagerInvoked === true
    && observed?.tickSource === 'native-kernel/tickFrame'
  const windowLines = Array.isArray(observed?.windowLines) ? observed.windowLines : []
  const s6ok = receivedEvents.length === 101
    && windowLines.length === 101
    && timerManagerInvoked
    && utteranceTicks.includes(5)
    && utteranceTicks.includes(10)
    && utteranceTicks.includes(15)
    && envelope?.mappingId === 'chat.input'

  const snapshot = await testControlRequest(testControlUri, 'POST', '/test-control/snapshot', { roomId: MAIN_ROOM })
  const snapEntities = Array.isArray(snapshot.json?.entities) ? snapshot.json.entities : []
  const historyCountMax = Math.max(
    Number(snapshot.json?.historyCount ?? 0),
    ...snapEntities.map((row) => Number(row?.historyCount ?? 0)),
    0,
  )
  const historyReject = await testControlRequest(testControlUri, 'POST', '/test-control/restore', {
    roomId: MAIN_ROOM,
    historyCount: 1,
    entities: snapEntities.slice(0, 1).map((row) => ({ ...row, historyCount: 1 })),
  })
  const restore = await testControlRequest(testControlUri, 'POST', '/test-control/restore', snapshot.json ?? { roomId: MAIN_ROOM, historyCount: 0, entities: [] })
  const windowBeforeSnapshot = Number.isFinite(Number(observed?.windowBeforeSnapshot))
    ? Number(observed.windowBeforeSnapshot)
    : (Array.isArray(observed?.windowLinesBefore) ? observed.windowLinesBefore.length : null)
  const restoredWindow = Number.isFinite(Number(observed?.restoredWindow))
    ? Number(observed.restoredWindow)
    : (Array.isArray(observed?.windowLinesAfter) ? observed.windowLinesAfter.length : null)
  const persist = {
    snapshotSource: observed?.snapshotSource ?? 'missing',
    historyCountMax,
    restoredWindow,
    windowBeforeSnapshot,
    clientWindowBeforeSnapshot: windowBeforeSnapshot,
    clientWindowAfterRestore: restoredWindow,
    snapshotSha256: observed?.snapshotSha256 ?? null,
    processA: observed?.processA ?? null,
    processB: observed?.processB ?? null,
    historyRejected: historyReject.json?.ok === false,
    restoreOk: restore.json?.ok === true,
  }
  const s7ok = Number(persist.windowBeforeSnapshot) > 0
    && persist.historyCountMax === 0
    && persist.restoredWindow === 0
    && persist.restoreOk === true
    && persist.historyRejected === true
    && persist.processA?.pid
    && persist.processB?.pid
    && Number(persist.processA.pid) !== Number(persist.processB.pid)
    && typeof persist.snapshotSha256 === 'string'

  const bot100Before = findLogin(bindings, 'Bot100')
  const previousNent = isHostNetEntityId(bot100Before?.netEntityId) ? bot100Before.netEntityId : null
  let reconnect = { rebound: false, previousNetEntityId: previousNent }
  if (typeof reconnectBot100 === 'function') {
    reconnect = {
      ...reconnect,
      ...(await reconnectBot100(bot100Before)),
      previousNetEntityId: previousNent,
    }
  }
  const afterReconnect = indexBindings(await fetchBindings(testControlUri), botLogins, browser)
  const bot100After = findLogin(afterReconnect, 'Bot100')
    ?? afterReconnect.find((row) => row.accountId && row.accountId === bot100Before?.accountId)
    ?? null
  const admittedNent = isHostNetEntityId(bot100After?.netEntityId)
    ? bot100After.netEntityId
    : (isHostNetEntityId(reconnect.netEntityId) ? reconnect.netEntityId : null)
  const s8ok = isEntityRebound(
    { netEntityId: previousNent },
    { netEntityId: admittedNent },
  )
  reconnect = {
    ...reconnect,
    rebound: s8ok,
    ok: s8ok && observed?.connectionSupersededReceived === true,
    entityA: s8ok ? previousNent : admittedNent,
    netEntityId: admittedNent,
    previousNetEntityId: previousNent,
    accountId: bot100After?.accountId ?? reconnect.accountId ?? bot100Before?.accountId ?? null,
    previousAccountId: bot100Before?.accountId ?? null,
    sessionId: bot100After?.sessionId ?? reconnect.sessionId ?? null,
    previousSessionId: bot100Before?.sessionId ?? reconnect.previousSessionId ?? null,
    connectionSupersededReceived: observed?.connectionSupersededReceived === true,
  }
  const s8ObservedOk = s8ok && reconnect.connectionSupersededReceived === true

  const bot99 = findLogin(afterReconnect, 'Bot99') ?? findLogin(bindings, 'Bot99')
  const entityA99 = isHostNetEntityId(bot99?.netEntityId) ? bot99.netEntityId : null
  let expiry = { tombstoned: false, entityA: entityA99, entityB: null, staleARejected: false }
  if (entityA99) {
    if (typeof disconnectLogin === 'function') {
      await disconnectLogin('Bot99')
    }
    const expired = await testControlRequest(testControlUri, 'POST', '/test-control/expire', { netEntityId: entityA99 })
    const tomb = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
      requesterNetEntityId: player?.netEntityId ?? entityA99,
      targetNetEntityId: entityA99,
      attributeId: 'EntityIdentity.entityType',
    })
    expiry.tombstoned = expired.json?.ok === true && String(tomb.json?.outcome).toLowerCase() === 'tombstoned'
    expiry.staleARejected = String(tomb.json?.outcome).toLowerCase() === 'tombstoned'
    const relogin = await loginOrRegister(accountPort, {
      loginName: 'Bot99',
      password: TEST_PASSWORD,
      botToolCredential: issueBotToolCredential(botSeed),
    })
    if (relogin?.accepted && relogin.admissionCredential) {
      const born = await testControlRequest(testControlUri, 'POST', '/test-control/room-admit', {
        roomId: MAIN_ROOM,
        connectionId: 'c-bot99-b',
        admissionCredential: relogin.admissionCredential,
      })
      expiry.entityB = isHostNetEntityId(born.json?.netEntityId) ? born.json.netEntityId : null
      expiry.accountId = relogin.accountId ?? bot99.accountId
    }
  }
  const s9ok = expiry.tombstoned === true
    && isHostNetEntityId(expiry.entityA)
    && isHostNetEntityId(expiry.entityB)
    && String(expiry.entityA) !== String(expiry.entityB)

  let isolation = { ok: false, isoTotal: 0, crossRoom: null }
  const isoA = await loginOrRegister(accountPort, { loginName: 'IsoPlayerA', password: TEST_PASSWORD })
  const isoB = await loginOrRegister(accountPort, { loginName: 'IsoPlayerB', password: TEST_PASSWORD })
  if (isoA?.accepted && isoB?.accepted && isoA.admissionCredential && isoB.admissionCredential) {
    const admitA = await testControlRequest(testControlUri, 'POST', '/test-control/room-admit', {
      roomId: ISO_ROOM,
      connectionId: 'iso-a',
      admissionCredential: isoA.admissionCredential,
    })
    const admitB = await testControlRequest(testControlUri, 'POST', '/test-control/room-admit', {
      roomId: ISO_ROOM,
      connectionId: 'iso-b',
      admissionCredential: isoB.admissionCredential,
    })
    const isoBindings = (await fetchBindings(testControlUri)).filter((row) => row.roomId === ISO_ROOM)
    isolation.isoTotal = isoBindings.length
    const isoNent = isoBindings[0]?.netEntityId
    if (player?.netEntityId && isHostNetEntityId(isoNent)) {
      const cross = await testControlRequest(testControlUri, 'POST', '/test-control/query', {
        requesterNetEntityId: player.netEntityId,
        targetNetEntityId: isoNent,
        attributeId: 'EntityIdentity.entityType',
      })
      isolation.crossRoom = cross.json?.outcome ?? null
    }
    isolation.ok = admitA.json?.accepted === true
      && admitB.json?.accepted === true
      && isolation.isoTotal === 2
      && String(isolation.crossRoom).toLowerCase() === 'unauthorized'
  }

  const s10ok = isolation.ok === true
  const s11ok = eventOrder.length === 101 && appliedTicks.length === 101 && receivedEvents.length === 101
  return {
    ok: s5ok && s6ok && s7ok && s8ObservedOk && s9ok && s10ok && s11ok && bots.length === 100 && players.length === 1,
    bindings: censusRows,
    queries: {
      unauthorized: queries.unauthorized?.outcome ?? queries.unauthorized,
      invisible: queries.invisible?.outcome ?? queries.invisible,
      stale: queries.stale?.outcome ?? queries.stale,
      ok: queries.ok?.outcome ?? queries.ok,
      missing: queries.missing?.outcome ?? queries.missing,
    },
    chat: {
      eventCount: receivedEvents.length,
      tickSource: observed?.tickSource ?? null,
      timerManagerInvoked,
      cadence: observed?.tickSource ?? null,
      utteranceTicks,
      receivedEvents,
      appliedTick,
      ...envelope,
    },
    persist,
    reconnect,
    expiry,
    isolation,
    eventOrder,
    appliedTicks,
    s4ok: bots.length === 100 && players.length === 1 && censusRows.length === 101,
    s5ok,
    s6ok,
    s7ok,
    s8ok: s8ObservedOk,
    s9ok,
    s10ok: isolation.ok === true,
    s11ok,
  }
  } catch (err) {
    return failed(String(err?.message ?? err).split('\n')[0])
  }
}

export function buildScenariosRecord({
  account,
  botLogins,
  browser,
  admits,
  blocked,
}) {
  return {
    1: {
      create: account.create,
      load: account.load,
      wrongPassword: account.wrongPassword,
    },
    account: {
      create: account.create,
      load: account.load,
      wrongPassword: account.wrongPassword,
    },
    botLogins: botLogins.map((b) => ({
      loginName: b.loginName,
      accepted: b.accepted,
      accountId: b.accountId,
      accountNewlyCreated: b.accountNewlyCreated,
    })),
    browser: {
      loginName: browser.loginName,
      accepted: browser.accepted,
      accountId: browser.accountId,
      accountNewlyCreated: browser.accountNewlyCreated,
    },
    liveAdmits: {
      desired: 101,
      live: admits.live,
      blocked,
      sample: admits.admits.slice(0, 5).concat(admits.admits.length > 5 ? admits.admits.slice(-2) : []),
    },
    bindings: [],
    attributeQueries: [],
    chat: { inputs: [], events: [], browserWindow: [] },
    persist: {},
    reconnect: {},
    expiry: {},
    isolation: {},
    room: MAIN_ROOM,
    note: 'census 必须来自 host-audit.ndjson 的 per-entity 事件,本文件不写死 101',
  }
}

export function writeScenariosFile(path, scenarios) {
  writeFileSync(path, JSON.stringify(scenarios, null, 2) + '\n')
}

const test = process.env.NODE_TEST_CONTEXT ? nodeTest : () => {}

test('encodeChatInput matches frozen LumioBinV1 gg hash', () => {
  const cmd = encodeChatInput('gg')
  assert.equal(cmd.messageType, 'InputCommand')
  assert.equal(cmd.mappingId, 'chat.input')
  assert.equal(cmd.payload, '020000006767')
  assert.equal(cmd.payloadSha256, '5dbd584f1718b8bcd0dab4abeea83169f4a990defab81a8316ed845798d92dab')
})

test('encodeChatInput hello-Bot01 is lowercase hex payload + sha256', () => {
  const cmd = encodeChatInput('hello-Bot01')
  assert.equal(cmd.payload, '0b00000068656c6c6f2d426f743031')
  assert.match(cmd.payloadSha256, /^[0-9a-f]{64}$/)
  assert.equal(cmd.payloadSha256, createHash('sha256').update(Buffer.from(cmd.payload, 'hex')).digest('hex'))
})

test('observedEventKey is sender:text:roomSequence from a received chat.event', () => {
  assert.equal(
    observedEventKey({ senderNetEntityId: '101', text: 'hello-Bot01', roomSequence: 1, appliedTick: 7 }),
    '101:hello-Bot01:1',
  )
})

test('indexBindings joins loginName from accountId and keeps host nent_*', () => {
  const indexed = indexBindings(
    [{ netEntityId: 'nent_00000000000000000000000000000001', accountId: 'acct_a', roomId: MAIN_ROOM, entityKind: 'bot', connectionId: 'c1', sessionId: 'sess-Bot01', generation: 1 }],
    [{ loginName: 'Bot01', accountId: 'acct_a' }],
    { loginName: BROWSER_NAME, accountId: 'acct_b' },
  )
  assert.equal(indexed[0].loginName, 'Bot01')
  assert.equal(isHostNetEntityId(indexed[0].netEntityId), true)
})

