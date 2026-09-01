/**
 * Drive the 11 ecs-entity-chat §6 scenarios against live Account Server + C# MVP host.
 * Host audit is the census source; this module never writes a hardcoded 101 admit event.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loginOrRegister, summarizeLogin } from './account-client.mjs'
import { allBotLoginNames, issueBotToolCredential } from './bot-credential.mjs'
import {
  closeQuietly,
  completeMvpHandshake,
  connectMvpHost,
  handshakeAdmitBinding,
  mvpSessionId,
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

export { BROWSER_NAME, MAIN_ROOM, TEST_PASSWORD }

function appendTrace(path, obj) {
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
export async function admitLiveConnections({ listenUri, tokenBytes, clients, desired, tracePath }) {
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
export async function runPlaywrightBrowser({ pageUrl, password, resultPath, consolePath }) {
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

  let receivedFromNetwork = false
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
    result = await page.evaluate(() => window.__lumioResult)
    receivedFromNetwork = result?.account?.accepted === true
  } catch (err) {
    appendEv({ kind: 'harness-error', text: firstLine(err) })
    result = await page.evaluate(() => window.__lumioResult ?? null).catch(() => null)
    return {
      ran: true,
      injected: false,
      receivedFromNetwork: false,
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
  return {
    ran: true,
    injected: false,
    receivedFromNetwork,
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

export function writeScenariosFile(path, scenarios) {
  writeFileSync(path, JSON.stringify(scenarios, null, 2) + '\n')
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
