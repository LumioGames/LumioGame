/**
 * Drive the 11 ecs-entity-chat §6 scenarios against live Account Server + C# MVP host.
 * Host audit is the census source; this module never writes a hardcoded 101 admit event.
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { loginOrRegister, summarizeLogin } from './account-client.mjs'
import { allBotLoginNames, issueBotToolCredential } from './bot-credential.mjs'
import {
  closeQuietly,
  connectMvpHost,
  FULLGRAPH_LIMIT_FILE,
  FULLGRAPH_LIMIT_LINE,
  FULLGRAPH_MAX_CONNECTIONS,
  FULLGRAPH_MAX_SESSIONS,
} from './game-client.mjs'
import { BROWSER_NAME, MAIN_ROOM, TEST_PASSWORD } from './verify-evidence.mjs'

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
 * Attempt 101 simultaneous MVP-host upgrades. Do not shrink the scenario if the
 * FullGraph 64-connection budget rejects the 65th client.
 */
export async function admitLiveConnections({ listenUri, tokenBytes, desired, tracePath }) {
  const sockets = []
  const admits = []
  let blocked = null
  for (let i = 1; i <= desired; i++) {
    try {
      const conn = await connectMvpHost(listenUri, tokenBytes)
      sockets.push(conn.ws)
      admits.push({ index: i, ok: true, protocol: conn.protocol })
      appendTrace(tracePath, { kind: 'connection_upgrade', index: i, ok: true })
    } catch (err) {
      const rec = {
        index: i,
        ok: false,
        status: err.status ?? null,
        capacity: err.capacity === true,
        message: String(err.message ?? err).split('\n')[0],
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
