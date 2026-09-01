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
 * If the 65th upgrade is HTTP 503, Admission is missing from FullGraph, or the
 * host dll/exe is missing: write blocked.json (FullGraphComposition.cs:30/31 +
 * measured error) and exit 1. Never fall back to wt-server/r-00344.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FULLGRAPH_LIMIT_FILE,
  FULLGRAPH_LIMIT_LINE,
  FULLGRAPH_SESSIONS_LINE,
  fullGraphBlocked,
} from './game-client.mjs'
import { admitLiveConnections, closeAll } from './scenarios.mjs'
import { verifyRun } from './verify-evidence.mjs'

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
const DESIRED_ADMITS = 101

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

function startMvpHost({ command, commandArgs, logPath }) {
  const proc = spawn(command, commandArgs, {
    cwd: LUMIO_SERVER,
    windowsHide: true,
    env: hostEnv(),
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
  for (const line of String(auditText ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const ev = JSON.parse(trimmed)
      const session = ev.sessionId
      if (typeof session === 'string' && session.length > 0 && session !== '0') return true
      if (ev.kind === 'state' && ev.sessionState) return true
      if (ev.effect && /admission/i.test(String(ev.effect))) return true
    } catch { /* skip */ }
  }
  return false
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

  const secretPath = join(outDir, 'shared-secret.bin')
  const tokenBytes = randomBytes(32)
  writeFileSync(secretPath, tokenBytes)
  const auditPath = join(outDir, 'host-audit.ndjson')
  const tracePath = join(outDir, 'admit-trace.ndjson')
  const hostLog = join(outDir, 'mvp-host.log')
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
  writeFileSync(join(outDir, 'host-command.json'), JSON.stringify({ command, commandArgs, project: HOST_PROJ, buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS] }, null, 2) + '\n')

  const host = startMvpHost({ command, commandArgs, logPath: hostLog })
  let sockets = []
  let exitCode = 1
  try {
    const ready = await host.ready
    process.stdout.write(`${ready.line}\n`)
    writeFileSync(join(outDir, 'host-ready.json'), JSON.stringify({
      listenUri: ready.listenUri,
      testControlUri: ready.testControlUri,
      pid: host.proc.pid,
      process: 'lumio-mvp-host',
    }, null, 2) + '\n')

    const admits = await admitLiveConnections({
      listenUri: ready.listenUri,
      tokenBytes,
      desired: DESIRED_ADMITS,
      tracePath,
    })
    sockets = admits.sockets
    process.stdout.write(`live admits ${admits.live}/${DESIRED_ADMITS} blocked=${admits.blocked ? admits.blocked.error : 'none'}\n`)

    const auditText = safeReadText(auditPath)
    const hostProcess = {
      process: 'lumio-mvp-host',
      pid: host.proc.pid,
      listenUri: ready.listenUri,
      command: [command, ...commandArgs],
    }
    const evidence = {
      ok: false,
      hostProcess,
      liveAdmits: { desired: DESIRED_ADMITS, live: admits.live, blocked: admits.blocked, sample: admits.admits.slice(0, 3).concat(admits.admits.slice(-2)) },
      playwright: { ran: false },
      traces: { account: {}, queries: {}, chat: {}, reconnect: {}, expiry: {} },
      scenarios: {},
    }
    writeFileSync(join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')

    if (admits.blocked || admits.live < DESIRED_ADMITS) {
      const measured = admits.blocked?.error
        ?? admits.admits.find((a) => !a.ok)?.message
        ?? `only ${admits.live} live connections (desired ${DESIRED_ADMITS})`
      const at = admits.blocked?.atConnection ?? admits.live + 1
      const blocked = writeBlocked(outDir, fullGraphBlocked({
        error: measured,
        atConnection: at,
        httpStatus: admits.blocked?.httpStatus ?? admits.admits.find((a) => !a.ok)?.status ?? null,
        live: admits.live,
        extra: {
          hostProcess,
          hostCommand: [command, ...commandArgs],
          buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS],
          file: FULLGRAPH_LIMIT_FILE,
          line: FULLGRAPH_LIMIT_LINE,
          lineSessions: FULLGRAPH_SESSIONS_LINE,
        },
      }))
      const verify = verifyRun(evidence, auditText)
      writeFileSync(join(outDir, 'verify-report.json'), JSON.stringify(verify, null, 2) + '\n')
      await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, hostProcess, verify, live: admits.live })
      process.stderr.write(`BLOCKED ${FULLGRAPH_LIMIT_FILE}:${FULLGRAPH_LIMIT_LINE} ${measured}\n`)
      exitCode = 1
    } else if (!auditHasSessionAdmission(auditText)) {
      const blocked = writeBlocked(outDir, fullGraphBlocked({
        error: 'Admission not in FullGraph: 101 live upgrades but mvp-host audit has no session admission',
        atConnection: DESIRED_ADMITS,
        live: admits.live,
        extra: { hostProcess, hostCommand: [command, ...commandArgs] },
      }))
      await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, hostProcess, live: admits.live })
      process.stderr.write('BLOCKED Admission not in FullGraph\n')
      exitCode = 1
    } else {
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
          live: admits.live,
        })
        await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, hostProcess, live: admits.live })
        process.stderr.write(`BLOCKED missing account-server: ${expected}\n`)
        exitCode = 2
      } else {
        const verify = verifyRun(evidence, auditText)
        writeFileSync(join(outDir, 'verify-report.json'), JSON.stringify(verify, null, 2) + '\n')
        await writeManifest(outDir, {
          conclusion: verify.ok ? 'SUCCESS' : 'FAILED',
          hostProcess,
          verify,
          live: admits.live,
          accountServerDll: accountDll,
          pinnedAccountServer: ACCOUNT_DLL_ORIGIN_MAIN,
          note: '101 live mvp-host admits are required but not sufficient; Browser/Timer/Runtime traces still required',
        })
        exitCode = verify.ok ? 0 : 1
      }
    }
  } catch (err) {
    const message = String(err && err.message ? err.message : err)
    const blocked = writeBlocked(outDir, fullGraphBlocked({
      error: message,
      extra: { hostCommand: [command, ...commandArgs], buildCommand: [DEFAULT_DOTNET, ...HOST_BUILD_ARGS] },
    }))
    await writeManifest(outDir, { conclusion: 'BLOCKED', blocked, failure: { step: 'mvp-host', message } })
    process.stderr.write(`BLOCKED ${message}\n`)
    exitCode = 1
  } finally {
    await closeAll(sockets)
    killTree(host.proc.pid)
  }
  process.exit(exitCode)
}

main().catch((err) => {
  process.stderr.write(`launcher error: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
