#!/usr/bin/env node
/**
 * launcher — R-00376 / N-12 101-entity acceptance on lumio-entity-chat-replay.
 *
 * SUCCESS requires sibling lumio-entity-chat-replay. GameRoomHost and
 * lumio-mvp-host are never a SUCCESS path. Evidence fields come from
 * client-received chat.event and on-disk persist, never send-count synthesis.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectRoomWire, runPlaywrightBrowser } from './scenarios.mjs'
import { compareRuns, oracleSha256, TEST_PASSWORD, verifyEvidenceDir, verifyRun } from './verify-evidence.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LUMIO_SERVER = resolve(process.env.LUMIO_SERVER_ROOT ?? join(REPO_ROOT, '../../LumioServer'))
const REPLAY_BIN = process.platform === 'win32' ? 'lumio-entity-chat-replay.exe' : 'lumio-entity-chat-replay'
const ROOM_WAIT_MS = 90000

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
  env.LUMIO_GAME_ROOT = env.LUMIO_GAME_ROOT || REPO_ROOT
  return env
}

function replayCandidates() {
  const override = process.env.LUMIO_ENTITY_CHAT_REPLAY
  const out = []
  if (override) out.push(resolve(override))
  out.push(
    join(LUMIO_SERVER, 'target/debug', REPLAY_BIN),
    join(LUMIO_SERVER, 'target/release', REPLAY_BIN),
    join(LUMIO_SERVER, 'modules/process/target/debug', REPLAY_BIN),
    join(LUMIO_SERVER, 'modules/process/target/release', REPLAY_BIN),
  )
  return out
}

function findReplayBin() {
  return replayCandidates().find((p) => existsSync(p)) ?? null
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

function listenPortsForPid(pid) {
  if (!pid) return []
  const listed = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
  const ports = []
  for (const line of String(listed.stdout ?? '').split(/\r?\n/)) {
    const match = line.match(/TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
    if (match && Number(match[2]) === Number(pid)) ports.push(Number(match[1]))
  }
  return ports
}

function sleep(ms) {
  return new Promise((resolveP) => setTimeout(resolveP, ms))
}

async function probeRoom(port, connectionId) {
  const listenUri = `ws://127.0.0.1:${port}`
  try {
    const client = await connectRoomWire(listenUri, connectionId, { timeoutMs: 1500 })
    return { listenUri, client }
  } catch {
    return null
  }
}

async function waitForRoom(pid, connectionId, budgetMs, abort) {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    if (abort && abort.done) return null
    for (const port of listenPortsForPid(pid)) {
      const hit = await probeRoom(port, connectionId)
      if (hit) return hit
    }
    await sleep(250)
  }
  return null
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

function mergeObserved(evidence, observation, pid) {
  const windowLines = observation.windowLines ?? []
  const receivedEvents = Array.isArray(observation.receivedEvents) ? observation.receivedEvents : []
  evidence.oracleSha256 = oracleSha256()
  evidence.playwright = {
    ...(evidence.playwright ?? {}),
    ...(observation.playwright ?? {}),
    receivedFromNetwork: windowLines.length > 0 || observation.playwright?.receivedChatEvent === true,
    receivedChatEvent: windowLines.length > 0 || observation.playwright?.receivedChatEvent === true,
    windowLines,
    receivedEvents: windowLines,
    injected: false,
  }
  evidence.traces = evidence.traces ?? {}
  const priorChat = evidence.traces.chat ?? {}
  evidence.traces.chat = receivedEvents.length > 0
    ? { ...priorChat, receivedEvents, eventCount: receivedEvents.length, windowLines }
    : priorChat
  const persist = evidence.traces.persist ?? {}
  evidence.traces.persist = {
    ...persist,
    clientWindowBeforeSnapshot: persist.clientWindowBeforeSnapshot ?? observation.windowBeforeSnapshot ?? (windowLines.length > 0 ? windowLines.length : persist.clientWindowBeforeSnapshot),
    clientWindowAfterRestore: persist.clientWindowAfterRestore ?? observation.restoredWindow,
    processA: persist.processA ?? (pid ? { pid, process: 'lumio-entity-chat-replay' } : null),
    processB: persist.processB ?? null,
    snapshotSha256: persist.snapshotSha256 ?? observation.snapshotSha256 ?? null,
  }
  const supersededOnOld = observation.oldConnectionSuperseded === true
  const priorReconnect = evidence.traces.reconnect ?? {}
  evidence.traces.reconnect = {
    ...priorReconnect,
    connectionSupersededReceived: supersededOnOld || priorReconnect.connectionSupersededReceived === true,
    oldConnectionId: observation.oldConnectionId ?? priorReconnect.oldConnectionId ?? 'c-bot100',
  }
  if (evidence.scenarios?.[8]) {
    evidence.scenarios[8].connectionSupersededReceived =
      supersededOnOld || evidence.scenarios[8].connectionSupersededReceived === true
  }
  if (receivedEvents.length === 101 && evidence.scenarios?.[11]) {
    evidence.scenarios[11].eventOrder = receivedEvents.map((ev) => `${ev.senderNetEntityId}:${ev.text}:${ev.roomSequence}`)
    evidence.scenarios[11].appliedTicks = receivedEvents.map((ev) => ev.appliedTick)
    evidence.scenarios[11].receivedEvents = receivedEvents
  }
  if (windowLines.length === 101 && evidence.scenarios?.[6]) {
    evidence.scenarios[6].windowLines = windowLines
  }
  if (observation.windowBeforeSnapshot != null && Number.isFinite(Number(observation.windowBeforeSnapshot)) && evidence.scenarios?.[7]) {
    evidence.scenarios[7].windowBeforeSnapshot = Number(observation.windowBeforeSnapshot)
  }
  if (observation.restoredWindow != null && evidence.scenarios?.[7]) {
    evidence.scenarios[7].restoredWindow = Number(observation.restoredWindow)
  }
  return evidence
}

async function observeRound({ pid, roundDir, abort }) {
  const observation = {
    receivedEvents: [],
    windowLines: [],
    playwright: { ran: false, injected: false, receivedFromNetwork: false, receivedChatEvent: false },
    connectionSuperseded: false,
    oldConnectionSuperseded: false,
    oldConnectionId: 'c-bot100',
    windowBeforeSnapshot: null,
    restoredWindow: null,
    snapshotSha256: null,
    error: null,
  }
  let staticProc = null
  let observer = null
  let oldBot100 = null
  try {
    const room = await waitForRoom(pid, 'c-bot01', ROOM_WAIT_MS, abort)
    if (!room) {
      observation.error = 'room listen not observed on lumio-entity-chat-replay'
      return observation
    }
    observer = room.client
    oldBot100 = await connectRoomWire(room.listenUri, 'c-bot100', { timeoutMs: 3000 }).catch(() => null)
    const staticReadyFile = join(roundDir, '..', `.observe-${pid}`, 'static-ready.json')
    staticProc = startStaticServer({
      root: join(SCRIPT_DIR, 'web'),
      readyFile: staticReadyFile,
      logPath: join(roundDir, '..', `.observe-${pid}`, 'static-server.log'),
    })
    const staticInfo = await staticProc.ready
    const pageUrl = `http://127.0.0.1:${staticInfo.port}/index.html?room=${encodeURIComponent(room.listenUri)}&login=Browser01&connectionId=c-browser`
    observation.playwright = await runPlaywrightBrowser({
      pageUrl,
      password: TEST_PASSWORD,
      resultPath: join(roundDir, '..', `.observe-${pid}`, 'browser-result.json'),
      consolePath: join(roundDir, '..', `.observe-${pid}`, 'browser-console.ndjson'),
      waitForEvents: 101,
      waitMs: ROOM_WAIT_MS,
    })
    observation.windowLines = observation.playwright.windowLines ?? []
    observation.oldConnectionSuperseded = oldBot100?.superseded === true
    observation.connectionSuperseded = observation.oldConnectionSuperseded
    const nodeEvents = observer?.chatEvents ?? []
    const pageEvents = observation.windowLines
    observation.receivedEvents = pageEvents.length >= nodeEvents.length ? pageEvents : nodeEvents
    observation.windowBeforeSnapshot = observation.windowLines.length > 0 ? observation.windowLines.length : null
  } catch (err) {
    observation.error = String(err && err.message ? err.message : err).split('\n')[0]
  } finally {
    try { observer?.close() } catch { /* ignore */ }
    try { oldBot100?.close() } catch { /* ignore */ }
    if (staticProc?.proc?.pid) killTree(staticProc.proc.pid)
  }
  return observation
}

function spawnReplay({ bin, roundDir, logPath }) {
  mkdirSync(roundDir, { recursive: true })
  const abort = { done: false }
  const proc = spawn(bin, ['--out', roundDir], {
    windowsHide: true,
    env: hostEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const exit = new Promise((resolveP) => {
    const onData = (chunk, stream) => {
      const text = String(chunk)
      if (stream === 'stdout') stdout += text
      else stderr += text
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
    }
    proc.stdout?.on('data', (c) => onData(c, 'stdout'))
    proc.stderr?.on('data', (c) => onData(c, 'stderr'))
    proc.on('error', (err) => {
      stderr += String(err)
      abort.done = true
      resolveP({ code: 1, stdout, stderr })
    })
    proc.on('exit', (code) => {
      abort.done = true
      try { writeFileSync(logPath, `${stdout}\n${stderr}`) } catch { /* ignore */ }
      resolveP({ code, stdout, stderr })
    })
  })
  return { proc, exit, abort }
}

function blockedFromReplay(exited, roundDir) {
  const fromFile = safeReadText(join(roundDir, 'blocked.txt')).trim()
  const fromLog = `${exited.stdout ?? ''}\n${exited.stderr ?? ''}`
  const logMatch = fromLog.match(/BLOCKED:\s*(.+)/)
  return fromFile || (logMatch ? logMatch[1].trim() : '') || (exited.code ? `replay exited ${exited.code}` : 'evidence.json missing')
}

async function runOneRound({ bin, roundDir }) {
  mkdirSync(dirname(roundDir), { recursive: true })
  const logPath = join(dirname(roundDir), `${relative(dirname(roundDir), roundDir)}.replay.log`.replaceAll('\\', '.'))
  const replay = spawnReplay({ bin, roundDir, logPath })
  const observation = observeRound({ pid: replay.proc.pid, roundDir, abort: replay.abort })
  const [obs, exited] = await Promise.all([observation, replay.exit])
  const evidencePath = join(roundDir, 'evidence.json')
  let evidence = safeReadJson(evidencePath)
  if (!evidence) {
    evidence = { ok: false, blocked: blockedFromReplay(exited, roundDir) }
  } else if (!evidence.blocked && exited.code) {
    const reason = blockedFromReplay(exited, roundDir)
    if (reason) evidence.blocked = reason
  }
  evidence = mergeObserved(evidence, obs, replay.proc.pid)
  evidence.oracleSha256 = oracleSha256()
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n')
  if (obs.error) {
    writeFileSync(join(roundDir, 'observe-error.txt'), `${obs.error}\n`)
  }
  const auditText = safeReadText(join(roundDir, 'host-audit.ndjson'))
  const admitTraceText = safeReadText(join(roundDir, 'admit-trace.ndjson'))
  const verify = verifyRun(evidence, auditText, admitTraceText)
  writeFileSync(join(roundDir, 'verify-report.json'), JSON.stringify(verify, null, 2) + '\n')
  return { evidence, auditText, admitTraceText, verify, observation: obs, pid: replay.proc.pid }
}

async function runPack(bin, packDir) {
  rmSync(packDir, { recursive: true, force: true })
  mkdirSync(packDir, { recursive: true })
  process.stdout.write(`pack ${packDir}\n`)
  process.stdout.write('round 1\n')
  const round1 = await runOneRound({ bin, roundDir: join(packDir, 'round-1') })
  process.stdout.write('round 2\n')
  const round2 = await runOneRound({ bin, roundDir: join(packDir, 'round-2') })
  const compare = compareRuns(
    round1.evidence,
    round2.evidence,
    round1.auditText,
    round2.auditText,
    round1.admitTraceText,
    round2.admitTraceText,
  )
  writeFileSync(join(packDir, 'verify-report.json'), JSON.stringify(compare, null, 2) + '\n')
  const shaList = []
  for (const p of walkFiles(packDir)) {
    shaList.push({ path: relative(packDir, p).replaceAll('\\', '/'), sha256: await sha256File(p) })
  }
  writeFileSync(join(packDir, 'sha256.json'), JSON.stringify(shaList, null, 2) + '\n')
  await writeManifest(packDir, {
    conclusion: compare.ok ? 'SUCCESS' : (round1.evidence?.blocked || round2.evidence?.blocked ? 'BLOCKED' : 'FAILED'),
    hostProcess: round1.evidence?.hostProcess,
    verify: compare,
    oracleSha256: oracleSha256(),
    playwright: { round1: round1.observation?.playwright, round2: round2.observation?.playwright },
  })
  return compare
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

  const bin = args['host-exe'] ? resolve(String(args['host-exe'])) : findReplayBin()
  if (!bin || !existsSync(bin)) {
    const expected = replayCandidates()[0]
    const blocked = writeBlocked(outDir, {
      status: 'BLOCKED',
      error: `missing lumio-entity-chat-replay (set LUMIO_ENTITY_CHAT_REPLAY or LUMIO_SERVER_ROOT): ${expected}`,
      missing: replayCandidates(),
    })
    await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, failure: { step: 'prepare', message: blocked.error } })
    process.stderr.write(`BLOCKED missing lumio-entity-chat-replay: ${expected}\n`)
    process.exit(1)
  }
  if (/lumio-mvp-host/i.test(bin)) {
    const blocked = writeBlocked(outDir, {
      status: 'BLOCKED',
      error: 'lumio-mvp-host is never a SUCCESS path; host must be lumio-entity-chat-replay',
    })
    await writeManifest(outDir, { conclusion: 'BLOCKED', blocked })
    process.stderr.write('BLOCKED lumio-mvp-host is never a SUCCESS path\n')
    process.exit(1)
  }
  process.stdout.write(`replay=${bin}\n`)

  const packA = await runPack(bin, join(outDir, 'pack-a'))
  const packB = await runPack(bin, join(outDir, 'pack-b'))
  const dirA = verifyEvidenceDir(join(outDir, 'pack-a'))
  const dirB = verifyEvidenceDir(join(outDir, 'pack-b'))
  const ok = packA.ok && packB.ok && dirA.ok && dirB.ok
  writeFileSync(join(outDir, 'verify-report.json'), JSON.stringify({ packA, packB, dirA, dirB, ok }, null, 2) + '\n')
  await writeManifest(outDir, {
    conclusion: ok ? 'SUCCESS' : 'FAILED',
    oracleSha256: oracleSha256(),
    packs: { a: packA, b: packB },
  })
  if (!ok) {
    process.stderr.write(`FAILED ${JSON.stringify({ packA: packA.failures, packB: packB.failures }).slice(0, 800)}\n`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`launcher error: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
