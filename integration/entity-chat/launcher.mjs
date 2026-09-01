#!/usr/bin/env node
/**
 * launcher — R-00354 101-entity C# MVP acceptance.
 *
 * SUCCESS requires sibling lumio-mvp-host to admit 101 live connections.
 * GameRoomHost is a unit-test double only and is never the SUCCESS path.
 *
 * Sibling build (origin/main LumioServer):
 *   dotnet build --project <LumioServer>/mvp-host/src/Lumio.Server.MvpHost.App/Lumio.Server.MvpHost.App.csproj -c Release --nologo
 * Host flags:
 *   lumio-mvp-host.exe --listen ws://127.0.0.1:0 --allow-insecure-loopback
 *     --shared-secret-file <generated> --reconnect-window-seconds 300
 *     --enable-test-control --test-control-listen http://127.0.0.1:0
 *     --audit-trace-file <out>/host-audit.ndjson
 *
 * If upgrades are HTTP 503, Admission is missing from FullGraph, or the
 * host dll/exe is missing: write blocked.json (FullGraphComposition.cs +
 * measured error) and exit 1. Never fall back to wt-server/r-00344.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateEd25519SeedPair, hexLower } from './bot-credential.mjs'
import {
  closeQuietly,
  FULLGRAPH_LIMIT_FILE,
  FULLGRAPH_LIMIT_LINE,
  FULLGRAPH_SESSIONS_LINE,
  fullGraphBlocked,
} from './game-client.mjs'
import {
  admitLiveConnections,
  closeAll,
  credentialTokenBytes,
  loginBots,
  loginBrowser,
  reconnectNamedBot,
  runAccountScenario1,
  runPlaywrightBrowser,
} from './scenarios.mjs'
import { compareRuns, isLauncherLoopIndex, parseNdjson, playwrightRan, TEST_PASSWORD, verifyRun } from './verify-evidence.mjs'

const SIBLING_GAP_REASON = 'sibling-gap: mvp-host ReferenceWorldSimulation cannot Attribute Query / Chat persist / expiry / isolation / event-order'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const DEFAULT_DOTNET = process.env.LUMIO_DOTNET ?? 'dotnet'
const LUMIO_SERVER = resolve(process.env.LUMIO_SERVER_ROOT ?? join(REPO_ROOT, '../../LumioServer'))
const HOST_PROJ = join(LUMIO_SERVER, 'mvp-host/src/Lumio.Server.MvpHost.App/Lumio.Server.MvpHost.App.csproj')
const HOST_BUILD_ARGS = ['build', '--project', HOST_PROJ, '-c', 'Release', '--nologo']
const ACCOUNT_DLL_ORIGIN_MAIN = join(
  LUMIO_SERVER,
  'account-server/src/Lumio.Server.Account.App/bin/Release/net10.0/lumio-account-server.dll',
)
const HOST_READY_TIMEOUT_MS = 30000
const ACCOUNT_READY_TIMEOUT_MS = 30000
const DESIRED_ADMITS = 101
const SUITE_PROJ = join(REPO_ROOT, 'modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/Lumio.Game.EntityChat.Suite.csproj')
const SUITE_DLL = join(
  REPO_ROOT,
  'modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/bin/Debug/net10.0/Lumio.Game.EntityChat.Suite.dll',
)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq)
    const value = eq === -1 ? argv[i + 1] : a.slice(eq + 1)
    if (value === undefined || value.startsWith('--')) out[key] = true
    else {
      out[key] = value
      if (eq === -1) i++
    }
  }
  return out
}

function sha256File(p) {
  return new Promise((resolveP, reject) => {
    const h = createHash('sha256')
    createReadStream(p).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolveP(h.digest('hex')))
  })
}

function walkFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walkFiles(p))
    else out.push(p)
  }
  return out
}

function safeReadText(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function safeReadJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function killTree(pid) {
  if (!pid) return
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } catch { /* best effort */ }
}

function hostEnv() {
  const env = { ...process.env }
  if (!env.DOTNET_ROOT) {
    const fromDotnet = process.env.LUMIO_DOTNET && existsSync(process.env.LUMIO_DOTNET)
      ? dirname(process.env.LUMIO_DOTNET)
      : null
    const which = spawnSync('where.exe', ['dotnet'], { encoding: 'utf8', windowsHide: true })
    const first = String(which.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && existsSync(s))
    env.DOTNET_ROOT = fromDotnet ?? (first ? dirname(first) : env.DOTNET_ROOT)
  }
  return env
}

function hostArtifactCandidates() {
  const roots = [
    join(LUMIO_SERVER, 'mvp-host/src/Lumio.Server.MvpHost.App/bin/Release/net10.0'),
    join(LUMIO_SERVER, 'mvp-host/src/Lumio.Server.MvpHost.App/bin/Debug/net10.0'),
  ]
  const out = []
  for (const root of roots) {
    out.push({ exe: join(root, 'lumio-mvp-host.exe'), dll: join(root, 'lumio-mvp-host.dll') })
  }
  return out
}

function findHostArtifact() {
  for (const c of hostArtifactCandidates()) {
    if (existsSync(c.dll)) return { ...c, kind: 'dll' }
    if (existsSync(c.exe)) return { ...c, kind: 'exe' }
  }
  return null
}

function originMainAccountDll() {
  return existsSync(ACCOUNT_DLL_ORIGIN_MAIN) ? ACCOUNT_DLL_ORIGIN_MAIN : null
}

function writeBlocked(outDir, blocked) {
  const payload = { ...blocked, status: 'BLOCKED' }
  writeFileSync(join(outDir, 'blocked.json'), JSON.stringify(payload, null, 2) + '\n')
  return payload
}

async function writeManifest(outDir, extra) {
  const evidenceFiles = []
  for (const p of walkFiles(outDir)) {
    if (p === join(outDir, 'manifest.json')) continue
    evidenceFiles.push({ path: relative(outDir, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: await sha256File(p) })
  }
  const manifest = {
    schemaVersion: 1,
    tool: 'lumio-entity-chat-integration/launcher',
    createdAt: new Date().toISOString(),
    conclusion: extra.conclusion,
    ...extra,
    evidenceFiles,
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

function startMvpHost({ command, commandArgs, logPath, extraEnv = {} }) {
  const proc = spawn(command, commandArgs, {
    cwd: LUMIO_SERVER,
    windowsHide: true,
    env: { ...hostEnv(), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const ready = new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error(`mvp-host ready timeout (${HOST_READY_TIMEOUT_MS}ms); stderr=${stderr.slice(-500)}`))
    }, HOST_READY_TIMEOUT_MS)
    const onData = (chunk, stream) => {
      const text = String(chunk)
      if (stream === 'stdout') stdout += text
      else stderr += text
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      const lines = (stream === 'stdout' ? stdout : stdout + stderr).split(/\r?\n/)
      for (const line of lines) {
        if (!line.startsWith('MVP_HOST_READY ')) continue
        clearTimeout(timer)
        const payload = line.slice('MVP_HOST_READY '.length)
        const listenMatch = payload.match(/listen=(\S+)/)
        const controlMatch = payload.match(/testControl=(\S+)/)
        if (!listenMatch) {
          rejectP(new Error(`mvp-host ready line missing listen: ${line}`))
          return
        }
        resolveP({ listenUri: listenMatch[1], testControlUri: controlMatch?.[1] ?? '-', line })
        return
      }
    }
    proc.stdout?.on('data', (c) => onData(c, 'stdout'))
    proc.stderr?.on('data', (c) => onData(c, 'stderr'))
    proc.on('error', (err) => {
      clearTimeout(timer)
      rejectP(err)
    })
    proc.on('exit', (code) => {
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        rejectP(new Error(`mvp-host exited ${code}; ${stderr.slice(-500) || stdout.slice(-500)}`))
      }
    })
  })
  return { proc, ready, logPath }
}

function auditHasSessionAdmission(auditText) {
  for (const { ev } of parseNdjson(auditText)) {
    const session = ev.sessionId
    if (typeof session === 'string' && session.length > 0 && session !== '0' && !isLauncherLoopIndex(session)) {
      return true
    }
    if (ev.effect && /admit|bind|createsession|authenticate/i.test(String(ev.effect))) return true
  }
  return false
}

function siblingGapRow(extra = {}) {
  return {
    ok: false,
    source: 'suite-double',
    blockedReason: SIBLING_GAP_REASON,
    ...extra,
  }
}

function isBindingAdmit(rec) {
  return rec?.ok === true
    && rec.handshake === true
    && typeof rec.sessionId === 'string'
    && rec.sessionId.length > 0
    && rec.sessionId !== '0'
    && !isLauncherLoopIndex(rec.sessionId)
}

function startAccountServer({ dll, storePath, logPath, admissionSeedHex, botPublicHex }) {
  mkdirSync(storePath, { recursive: true })
  const proc = spawn(DEFAULT_DOTNET, [dll, '--store-path', storePath, '--listen', '127.0.0.1:0'], {
    cwd: dirname(dll),
    windowsHide: true,
    env: {
      ...hostEnv(),
      LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX: admissionSeedHex,
      LUMIO_ACCOUNT_BOT_TOOL_PUBLIC_KEY_HEX: botPublicHex,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const ready = new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error(`account-server ready timeout (${ACCOUNT_READY_TIMEOUT_MS}ms); stderr=${stderr.slice(-500)}`))
    }, ACCOUNT_READY_TIMEOUT_MS)
    const onData = (chunk, stream) => {
      const text = String(chunk)
      if (stream === 'stdout') stdout += text
      else stderr += text
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('ACCOUNT_SERVER_READY ')) continue
        clearTimeout(timer)
        try {
          const payload = JSON.parse(line.slice('ACCOUNT_SERVER_READY '.length))
          if (!payload.port) {
            rejectP(new Error(`account-server ready missing port: ${line}`))
            return
          }
          resolveP({ port: payload.port, pid: payload.pid ?? proc.pid, line })
        } catch (err) {
          rejectP(new Error(`account-server ready JSON: ${err.message}`))
        }
        return
      }
    }
    proc.stdout?.on('data', (c) => onData(c, 'stdout'))
    proc.stderr?.on('data', (c) => onData(c, 'stderr'))
    proc.on('error', (err) => {
      clearTimeout(timer)
      rejectP(err)
    })
    proc.on('exit', (code) => {
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        rejectP(new Error(`account-server exited ${code}; ${stderr.slice(-500) || stdout.slice(-500)}`))
      }
    })
  })
  return { proc, ready }
}

function startStaticServer({ root, readyFile, logPath }) {
  mkdirSync(dirname(readyFile), { recursive: true })
  const proc = spawn(process.execPath, [
    join(SCRIPT_DIR, 'static-server.mjs'),
    '--root', root,
    '--port', '0',
    '--ready-file', readyFile,
  ], {
    cwd: SCRIPT_DIR,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const ready = new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error(`static-server ready timeout; stderr=${stderr.slice(-400)}`))
    }, 15000)
    const onData = (chunk, stream) => {
      const text = String(chunk)
      if (stream === 'stdout') stdout += text
      else stderr += text
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('STATIC_READY ')) continue
        clearTimeout(timer)
        try {
          const payload = JSON.parse(line.slice('STATIC_READY '.length))
          resolveP({ port: payload.port, line })
        } catch (err) {
          rejectP(err)
        }
        return
      }
    }
    proc.stdout?.on('data', (c) => onData(c, 'stdout'))
    proc.stderr?.on('data', (c) => onData(c, 'stderr'))
    proc.on('error', (err) => {
      clearTimeout(timer)
      rejectP(err)
    })
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        rejectP(new Error(`static-server exited ${code}`))
      }
    })
  })
  return { proc, ready }
}

function ensureSuiteDll() {
  if (existsSync(SUITE_DLL)) return SUITE_DLL
  spawnSync(DEFAULT_DOTNET, ['build', '--project', SUITE_PROJ, '--nologo'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: hostEnv(),
  })
  return existsSync(SUITE_DLL) ? SUITE_DLL : null
}

function runGameplaySuite({ outDir, accountDll }) {
  const dll = ensureSuiteDll()
  if (!dll) return { ok: false, error: `missing ${SUITE_DLL}`, evidence: null }
  mkdirSync(outDir, { recursive: true })
  const result = spawnSync(
    DEFAULT_DOTNET,
    ['exec', dll, '--out', outDir, '--account-server-dll', accountDll],
    { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, env: hostEnv(), timeout: 180000 },
  )
  try {
    writeFileSync(join(outDir, 'suite.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  } catch { /* ignore */ }
  return {
    exitCode: result.status,
    evidence: safeReadJson(join(outDir, 'evidence.json')),
    error: result.status === 0 ? null : String(result.stderr || result.stdout || `exit ${result.status}`).slice(-400),
  }
}

function mergeRoundEvidence({
  hostProcess,
  liveAdmits,
  playwright,
  account,
  botLogins,
  browser,
  suiteEvidence,
  liveReconnect,
}) {
  const s1ok = account?.create?.accepted === true
    && account?.load?.accepted === true
    && account?.wrongPassword?.code === 'wrong_password'
  const botAdmits = (liveAdmits.admits ?? []).filter((a) => isBindingAdmit(a) && a.entityType === 'bot')
  const playerAdmits = (liveAdmits.admits ?? []).filter((a) => isBindingAdmit(a) && a.entityType === 'player')
  const sessionIds = (liveAdmits.admits ?? []).filter(isBindingAdmit).map((a) => a.sessionId)
  const pw = {
    ran: playwright?.ran === true,
    browser: playwright?.browser ?? '',
    receivedFromNetwork: playwright?.receivedFromNetwork === true,
    injected: playwright?.injected === true,
    error: playwright?.error ?? null,
    channel: playwright?.channel ?? null,
  }
  const s3ok = playerAdmits.length === 1 && liveAdmits.live === 101 && playwrightRan({ playwright: pw })
  const entityA = liveReconnect?.entityA ?? liveReconnect?.sessionId ?? botAdmits.find((a) => a.loginName === 'Bot100')?.sessionId ?? null
  const s8ok = liveReconnect?.rebound === true && typeof entityA === 'string' && !isLauncherLoopIndex(entityA)
  const scenarios = {
    1: {
      ok: s1ok,
      wrongPasswordCode: account?.wrongPassword?.code,
      create: account?.create,
      load: account?.load,
    },
    2: { ok: botAdmits.length === 100, botCount: botAdmits.length },
    3: {
      ok: s3ok,
      total: liveAdmits.live,
      playerCount: playerAdmits.length,
      playwrightRan: pw.ran,
    },
    4: {
      ok: botAdmits.length === 100 && playerAdmits.length === 1
        && sessionIds.length === 101
        && sessionIds.every((id) => !isLauncherLoopIndex(id))
        && (botLogins ?? []).every((b) => b.accepted && b.accountId)
        && browser?.accepted === true,
      resolvedBots: botAdmits.length,
      browserBound: playerAdmits.length === 1,
      sessionIds,
    },
    5: siblingGapRow(),
    6: {
      ok: false,
      timerManagerInvoked: false,
      cadence: 'tick-batched',
      eventCount: 0,
    },
    7: siblingGapRow({ historyCountMax: 0, restoredWindow: 0, snapshotSource: 'suite-double' }),
    8: {
      ok: s8ok,
      entityA,
      rebound: liveReconnect?.rebound === true,
    },
    9: siblingGapRow(),
    10: siblingGapRow(),
    11: siblingGapRow({ totalEntities: liveAdmits.live }),
  }
  return {
    ok: false,
    hostProcess,
    liveAdmits: {
      desired: DESIRED_ADMITS,
      live: liveAdmits.live,
      blocked: liveAdmits.blocked,
      admits: liveAdmits.admits,
      sample: (liveAdmits.admits ?? []).slice(0, 3).concat((liveAdmits.admits ?? []).slice(-2)),
    },
    playwright: pw,
    traces: {
      account: {
        createAck: account?.create?.accepted === true,
        loadAck: account?.load?.accepted === true,
        wrongPasswordCode: account?.wrongPassword?.code,
      },
      handshake: { completed: sessionIds.length, sessionIds },
      reconnect: { rebound: s8ok, entityA },
    },
    scenarios,
  }
}

async function runOneRound({
  roundDir,
  artifact,
  accountDll,
  admission,
  bot,
}) {
  mkdirSync(roundDir, { recursive: true })
  const secretPath = join(roundDir, 'shared-secret.bin')
  const tokenBytes = randomBytes(32)
  writeFileSync(secretPath, tokenBytes)
  const auditPath = join(roundDir, 'host-audit.ndjson')
  const tracePath = join(roundDir, 'admit-trace.ndjson')
  const hostLog = join(roundDir, 'mvp-host.log')
  const hostArgs = [
    '--listen', 'ws://127.0.0.1:0',
    '--allow-insecure-loopback',
    '--shared-secret-file', secretPath,
    '--reconnect-window-seconds', '300',
    '--enable-test-control',
    '--test-control-listen', 'http://127.0.0.1:0',
    '--audit-trace-file', auditPath,
  ]
  const command = artifact.kind === 'exe' ? artifact.exe : DEFAULT_DOTNET
  const commandArgs = artifact.kind === 'exe' ? hostArgs : ['exec', artifact.dll, ...hostArgs]
  writeFileSync(join(roundDir, 'host-command.json'), JSON.stringify({
    command,
    commandArgs,
    project: HOST_PROJ,
    buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS],
  }, null, 2) + '\n')

  const host = startMvpHost({
    command,
    commandArgs,
    logPath: hostLog,
    extraEnv: {
      LUMIO_ACCOUNT_ADMISSION_PUBLIC_KEY_HEX: hexLower(admission.publicKey),
      LUMIO_ACCOUNT_ADMISSION_KEY_ID: '1',
    },
  })
  const accountProc = startAccountServer({
    dll: accountDll,
    storePath: join(roundDir, 'account-store'),
    logPath: join(roundDir, 'account-server.log'),
    admissionSeedHex: hexLower(admission.seed),
    botPublicHex: hexLower(bot.publicKey),
  })
  let sockets = []
  let staticProc = null
  try {
    const [ready, accountReady] = await Promise.all([host.ready, accountProc.ready])
    process.stdout.write(`${ready.line}\n`)
    writeFileSync(join(roundDir, 'host-ready.json'), JSON.stringify({
      listenUri: ready.listenUri,
      testControlUri: ready.testControlUri,
      pid: host.proc.pid,
      process: 'lumio-mvp-host',
    }, null, 2) + '\n')
    const accountPort = accountReady.port
    const accountScenario = await runAccountScenario1({
      accountPort,
      botSeed: bot.seed,
      tracePath,
    })
    const botLogins = await loginBots({
      accountPort,
      botSeed: bot.seed,
      tracePath,
      count: 100,
    })
    const browser = await loginBrowser({ accountPort, tracePath })
    const clients = []
    for (const b of botLogins) {
      if (!b.accepted || !b.admissionCredential || !b.accountId) continue
      clients.push({
        tokenBytes: credentialTokenBytes(b.admissionCredential),
        entityType: 'bot',
        loginName: b.loginName,
        accountId: b.accountId,
        sessionId: b.accountId,
      })
    }
    if (browser.accepted && browser.admissionCredential && browser.accountId) {
      clients.push({
        tokenBytes: credentialTokenBytes(browser.admissionCredential),
        entityType: 'player',
        loginName: browser.loginName,
        accountId: browser.accountId,
        sessionId: browser.accountId,
      })
    }
    const admits = await admitLiveConnections({
      listenUri: ready.listenUri,
      tokenBytes,
      clients,
      desired: DESIRED_ADMITS,
      tracePath,
    })
    sockets = admits.sockets
    process.stdout.write(`live admits ${admits.live}/${DESIRED_ADMITS} blocked=${admits.blocked ? admits.blocked.error : 'none'}\n`)

    let liveReconnect = { rebound: false }
    if (sockets.length >= 100) {
      const bot100 = admits.admits.find((a) => a.loginName === 'Bot100' && isBindingAdmit(a))
      await closeQuietly(sockets[99])
      liveReconnect = await reconnectNamedBot({
        accountPort,
        botSeed: bot.seed,
        loginName: 'Bot100',
        listenUri: ready.listenUri,
        tracePath,
        sessionId: bot100?.sessionId,
      })
      if (liveReconnect.socket) sockets[99] = liveReconnect.socket
    }

    let playwright = { ran: false, injected: false, receivedFromNetwork: false }
    try {
      const staticReadyFile = join(roundDir, 'static-ready.json')
      staticProc = startStaticServer({
        root: join(SCRIPT_DIR, 'web'),
        readyFile: staticReadyFile,
        logPath: join(roundDir, 'static-server.log'),
      })
      const staticInfo = await staticProc.ready
      const pageUrl = `http://127.0.0.1:${staticInfo.port}/index.html?account=${encodeURIComponent(`ws://127.0.0.1:${accountPort}/`)}&login=Browser01`
      playwright = await runPlaywrightBrowser({
        pageUrl,
        password: TEST_PASSWORD,
        resultPath: join(roundDir, 'browser-result.json'),
        consolePath: join(roundDir, 'browser-console.ndjson'),
      })
    } catch (err) {
      playwright = {
        ran: false,
        injected: false,
        receivedFromNetwork: false,
        error: String(err && err.message ? err.message : err).split('\n')[0],
      }
    }

    const suite = runGameplaySuite({ outDir: join(roundDir, 'suite'), accountDll })
    const hostProcess = {
      process: 'lumio-mvp-host',
      pid: host.proc.pid,
      listenUri: ready.listenUri,
      command: [command, ...commandArgs],
    }
    const evidence = mergeRoundEvidence({
      hostProcess,
      liveAdmits: admits,
      playwright,
      account: accountScenario,
      botLogins,
      browser,
      suiteEvidence: suite.evidence,
      liveReconnect,
    })
    const auditText = safeReadText(auditPath)
    const admitTraceText = safeReadText(tracePath)
    writeFileSync(join(roundDir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    const verify = verifyRun(evidence, auditText, admitTraceText)
    writeFileSync(join(roundDir, 'verify-report.json'), JSON.stringify(verify, null, 2) + '\n')
    return {
      evidence,
      auditText,
      admitTraceText,
      admits,
      hostProcess,
      playwright,
      suite,
      verify,
    }
  } finally {
    await closeAll(sockets)
    if (staticProc?.proc?.pid) killTree(staticProc.proc.pid)
    killTree(host.proc.pid)
    killTree(accountProc.proc.pid)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.out) {
    process.stderr.write('missing --out <evidenceDir>\n')
    process.exit(3)
  }
  const outDir = resolve(String(args.out))
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  process.stdout.write(`entity-chat launcher, evidence ${outDir}\n`)
  process.stdout.write(`mvp-host project: ${HOST_PROJ}\n`)
  process.stdout.write(`mvp-host build: ${DEFAULT_DOTNET} ${HOST_BUILD_ARGS.join(' ')}\n`)

  let artifact = args['host-exe']
    ? { exe: resolve(String(args['host-exe'])), dll: null, kind: existsSync(resolve(String(args['host-exe']))) ? 'exe' : null }
    : findHostArtifact()

  if (!artifact || (artifact.kind === 'exe' && !existsSync(artifact.exe)) || (artifact.kind === 'dll' && !existsSync(artifact.dll))) {
    const build = spawnSync(DEFAULT_DOTNET, HOST_BUILD_ARGS, { cwd: LUMIO_SERVER, encoding: 'utf8', windowsHide: true, env: hostEnv() })
    writeFileSync(join(outDir, 'host-build.log'), `${build.stdout ?? ''}\n${build.stderr ?? ''}`)
    artifact = findHostArtifact()
    if (!artifact) {
      const missing = hostArtifactCandidates()[0].exe
      const blocked = writeBlocked(outDir, fullGraphBlocked({
        error: `missing lumio-mvp-host dll/exe: ${missing}`,
        extra: {
          missing: [missing, HOST_PROJ],
          buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS],
          buildExitCode: build.status,
        },
      }))
      await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, failure: { step: 'prepare', message: blocked.error } })
      process.stderr.write(`BLOCKED missing mvp-host: ${missing}\n`)
      process.exit(1)
    }
  }

  const hostPath = artifact.kind === 'exe' ? artifact.exe : artifact.dll
  process.stdout.write(`mvp-host=${hostPath}\n`)

  const accountOverride = args['account-server-dll']
    ? resolve(String(args['account-server-dll']))
    : (process.env.LUMIO_ACCOUNT_SERVER_DLL ? resolve(process.env.LUMIO_ACCOUNT_SERVER_DLL) : null)
  const accountDll = (accountOverride && existsSync(accountOverride)) ? accountOverride : originMainAccountDll()
  if (!accountDll || !existsSync(accountDll)) {
    const expected = ACCOUNT_DLL_ORIGIN_MAIN
    const blocked = writeBlocked(outDir, {
      status: 'BLOCKED',
      error: `sibling account-server origin/main 构建产物缺失: ${expected}`,
      missing: [expected],
      file: FULLGRAPH_LIMIT_FILE,
      line: FULLGRAPH_LIMIT_LINE,
    })
    await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, failure: { step: 'prepare', message: blocked.error } })
    process.stderr.write(`BLOCKED missing account-server: ${expected}\n`)
    process.exit(2)
  }
  process.stdout.write(`account-server=${accountDll}\n`)

  const admission = generateEd25519SeedPair()
  const bot = generateEd25519SeedPair()
  let exitCode = 1
  try {
    process.stdout.write('round 1\n')
    const round1 = await runOneRound({
      roundDir: join(outDir, 'round-1'),
      artifact,
      accountDll,
      admission,
      bot,
    })
    process.stdout.write('round 2\n')
    const round2 = await runOneRound({
      roundDir: join(outDir, 'round-2'),
      artifact,
      accountDll,
      admission,
      bot,
    })

    const live = Math.min(round1.admits.live, round2.admits.live)
    const blockedAdmit = round1.admits.blocked || round2.admits.blocked
    if (blockedAdmit || live < DESIRED_ADMITS) {
      const measured = blockedAdmit?.error
        ?? `only ${live} live connections (desired ${DESIRED_ADMITS})`
      const blocked = writeBlocked(outDir, fullGraphBlocked({
        error: measured,
        atConnection: blockedAdmit?.atConnection ?? live + 1,
        httpStatus: blockedAdmit?.httpStatus ?? null,
        live,
        extra: {
          hostProcess: round1.hostProcess,
          file: FULLGRAPH_LIMIT_FILE,
          line: FULLGRAPH_LIMIT_LINE,
          lineSessions: FULLGRAPH_SESSIONS_LINE,
        },
      }))
      await writeManifest(outDir, {
        conclusion: 'BLOCKED',
        blocked,
        hostProcess: round1.hostProcess,
        live,
        accountServerDll: accountDll,
      })
      process.stderr.write(`BLOCKED ${FULLGRAPH_LIMIT_FILE}:${FULLGRAPH_LIMIT_LINE} ${measured}\n`)
      exitCode = 1
    } else if (!auditHasSessionAdmission(round1.auditText) || !auditHasSessionAdmission(round2.auditText)) {
      const blocked = writeBlocked(outDir, fullGraphBlocked({
        error: 'Admission not in FullGraph: 101 live upgrades but mvp-host audit has no session admission',
        atConnection: DESIRED_ADMITS,
        live,
        extra: { hostProcess: round1.hostProcess },
      }))
      await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, hostProcess: round1.hostProcess, live })
      process.stderr.write('BLOCKED Admission not in FullGraph\n')
      exitCode = 1
    } else {
      const compare = compareRuns(
        round1.evidence,
        round2.evidence,
        round1.auditText,
        round2.auditText,
        round1.admitTraceText,
        round2.admitTraceText,
      )
      writeFileSync(join(outDir, 'verify-report.json'), JSON.stringify(compare, null, 2) + '\n')
      await writeManifest(outDir, {
        conclusion: compare.ok ? 'SUCCESS' : 'FAILED',
        hostProcess: round1.hostProcess,
        verify: compare,
        live,
        accountServerDll: accountDll,
        pinnedAccountServer: ACCOUNT_DLL_ORIGIN_MAIN,
        playwright: { round1: round1.playwright, round2: round2.playwright },
      })
      exitCode = compare.ok ? 0 : 1
      if (!compare.ok) {
        process.stderr.write(`FAILED ${JSON.stringify(compare.failures).slice(0, 800)}\n`)
      }
    }
  } catch (err) {
    const message = String(err && err.message ? err.message : err)
    const blocked = writeBlocked(outDir, fullGraphBlocked({
      error: message,
      extra: { buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS] },
    }))
    await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, failure: { step: 'mvp-host', message } })
    process.stderr.write(`BLOCKED ${message}\n`)
    exitCode = 1
  }
  process.exit(exitCode)
}

main().catch((err) => {
  process.stderr.write(`launcher error: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
