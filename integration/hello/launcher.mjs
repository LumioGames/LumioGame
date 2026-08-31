#!/usr/bin/env node
/**
 * launcher — MS-00002 Hello World 集成总指挥:prepare → round 1 → round 2 → finalize。
 *
 * 用法:
 *   node launcher.mjs --server-exe <lumio-server.exe> --native-dir <架构仓 .run/<BuildId>/win-x64> \
 *     --runtime-dir <LumioGameRuntime modules/hello/entry 构建输出> --bot-dll <Lumio.Client.HelloBot.dll> \
 *     --web-dir <LumioClient modules/web/hello/> --contract <hello-wire-v1.json> --out <evidenceDir>
 * 可选覆盖:--entry-type/--entry-method(Runtime hello entry 的入口类型/方法,默认 HelloEntry/Run,
 *   以 Runtime worker 交付为准) --hostfxr(--) --dotnet(默认 dotnet);
 *   环境变量等价物:LUMIO_ENTRY_TYPE / LUMIO_ENTRY_METHOD / LUMIO_HOSTFXR / LUMIO_DOTNET。
 *
 * 一轮(round)流程:server → static-server → bot → Playwright 真实 Chromium → bot result →
 * 三方对账(verify-evidence)→ stdin shutdown → 等全部子进程退出码 0。
 * finalize:两轮对比(方向/revision/payloadSha256/tickId 一致,latency 均 <1000)+ 残留进程检查 +
 * 写 evidence/manifest.json(结论 SUCCESS/FAILED),退出码 0/1。
 * 任何一步失败:完整清理(kill 树)→ 保留已产证据 → 退出码 1。
 * 子进程 stdout/stderr 全部落 evidence/<round>/... 与 evidence/<proc>.log;launcher 自身事件流落 launcher.ndjson。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_HOSTFXR = 'C:/Users/g923/.dotnet/host/fxr/10.0.11/hostfxr.dll'
const ROUNDS = 2
const SERVER_READY_TIMEOUT_MS = 30000
const STATIC_READY_TIMEOUT_MS = 15000
const BROWSER_OK_TIMEOUT_MS = 30000
const BOT_RESULT_TIMEOUT_MS = 30000
const BOT_CONNECT_TIMEOUT_MS = 10000
const BOT_CONNECT_FALLBACK_MS = 2000
const EXIT_GRACE_MS = 15000

class StepError extends Error {
  constructor(step, message) {
    super(message)
    this.step = step
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq)
    const value = eq === -1 ? argv[i + 1] : a.slice(eq + 1)
    if (value === undefined || value.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = value
      if (eq === -1) i++
    }
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (msg) => process.stdout.write(`${msg}\n`)

function sha256File(p) {
  return new Promise((resolveP, reject) => {
    const h = createHash('sha256')
    createReadStream(p).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolveP(h.digest('hex')))
  })
}

function walkFiles(dir) {
  const out = []
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
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function tail(text, lines = 30) {
  const arr = String(text ?? '').trimEnd().split(/\r?\n/)
  return arr.slice(Math.max(0, arr.length - lines)).join('\n')
}

function killTree(pid) {
  if (!pid) return
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } catch { /* 清理尽力而为 */ }
}

function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (err) { return err.code === 'EPERM' }
}

// ---------------------------------------------------------------------------

function newCtx(args, outDir) {
  return { args, outDir, procs: [], browser: null, browserPid: null, rounds: [], failure: null, release: null }
}

function logEvent(ctx, obj) {
  try {
    appendFileSync(join(ctx.outDir, 'launcher.ndjson'), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n')
  } catch { /* 证据日志尽力而为 */ }
}

function track(ctx, name, proc, logPath) {
  const rec = { name, proc, logPath, pid: proc.pid, exitCode: null, killed: false }
  ctx.procs.push(rec)
  proc.on('exit', (code) => { rec.exitCode = code })
  for (const stream of [proc.stdout, proc.stderr]) {
    if (stream) stream.on('data', (chunk) => { try { appendFileSync(logPath, chunk) } catch { /* 尽力而为 */ } })
  }
  return rec
}

async function waitForReadyFile(path, timeoutMs, rec, label) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const txt = safeReadText(path)
    if (txt.trim()) {
      try {
        const json = JSON.parse(txt)
        if (Number.isInteger(json.port) && json.port > 0) return json
      } catch { /* 文件可能尚未写完整,继续轮询 */ }
    }
    if (rec && rec.exitCode !== null) {
      throw new StepError(label, `${label} 在就绪前退出(码 ${rec.exitCode});日志尾:\n${tail(safeReadText(rec.logPath))}`)
    }
    if (Date.now() > deadline) {
      throw new StepError(label, `等待 ${label} ready-file 超时(${timeoutMs}ms):${path};日志尾:\n${tail(rec ? safeReadText(rec.logPath) : '')}`)
    }
    await sleep(100)
  }
}

async function waitExit(rec, timeoutMs) {
  if (rec.exitCode !== null) return { code: rec.exitCode, killed: false }
  return new Promise((resolveP) => {
    const timer = setTimeout(() => {
      killTree(rec.pid)
      rec.killed = true
      // taskkill 后 exit 事件仍会到来;直接以当前状态收口
      resolveP({ code: rec.exitCode, killed: true })
    }, timeoutMs)
    rec.proc.on('exit', (code) => {
      clearTimeout(timer)
      rec.exitCode = code
      resolveP({ code, killed: rec.killed })
    })
  })
}

async function waitAllExits(ctx, graceMs) {
  const results = await Promise.all(ctx.procs.map((rec) => waitExit(rec, graceMs)))
  return ctx.procs.map((rec, i) => ({ name: rec.name, pid: rec.pid, exitCode: results[i].code, killed: results[i].killed }))
}

async function gracefulKillAll(ctx) {
  if (ctx.browser) { try { await ctx.browser.close() } catch { /* 尽力而为 */ } ctx.browser = null }
  for (const rec of ctx.procs) {
    if (rec.exitCode === null && rec.proc.stdin) {
      try { rec.proc.stdin.write('shutdown\n') } catch { /* 尽力而为 */ }
    }
  }
  await sleep(2000)
  for (const rec of ctx.procs) {
    if (rec.exitCode === null) { killTree(rec.pid); rec.killed = true }
  }
}

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------

async function prepare(ctx) {
  const A = ctx.args
  const mustExist = (value, flag) => {
    if (!value) throw new StepError('prepare', `缺少必填参数 --${flag}`)
    const p = resolve(String(value))
    if (!existsSync(p)) throw new StepError('prepare', `--${flag} 指向的路径不存在: ${p}`)
    return p
  }
  const serverExe = mustExist(A['server-exe'], 'server-exe')
  const nativeDir = mustExist(A['native-dir'], 'native-dir')
  const runtimeDir = mustExist(A['runtime-dir'], 'runtime-dir')
  const botDll = mustExist(A['bot-dll'], 'bot-dll')
  const webDir = mustExist(A['web-dir'], 'web-dir')
  const contractPath = mustExist(A.contract, 'contract')
  if (!statSync(webDir).isDirectory()) throw new StepError('prepare', `--web-dir 不是目录: ${webDir}`)
  if (!existsSync(join(webDir, 'index.html'))) throw new StepError('prepare', `web 根目录缺少 index.html: ${webDir}`)

  const hostfxr = resolve(String(A.hostfxr ?? process.env.LUMIO_HOSTFXR ?? DEFAULT_HOSTFXR))
  if (!existsSync(hostfxr)) {
    throw new StepError('prepare', `hostfxr 不存在: ${hostfxr}(可用 --hostfxr 或环境变量 LUMIO_HOSTFXR 覆盖)`)
  }

  const buildInfoPath = join(nativeDir, 'build-info.json')
  if (!existsSync(buildInfoPath)) throw new StepError('prepare', `native 目录缺少 build-info.json: ${nativeDir}`)
  const buildInfo = safeReadJson(buildInfoPath)
  if (!buildInfo) throw new StepError('prepare', `build-info.json 不是合法 JSON: ${buildInfoPath}`)

  const dlls = readdirSync(nativeDir).filter((f) => f.toLowerCase().endsWith('.dll')).map((f) => join(nativeDir, f)).sort()
  if (dlls.length === 0) throw new StepError('prepare', `native 目录没有任何 dll: ${nativeDir}`)
  let nativeDll = null
  const wantedSha = buildInfo.binarySha256 ?? buildInfo.binary_sha256
  if (dlls.length === 1) nativeDll = dlls[0]
  else {
    for (const p of dlls) {
      if (wantedSha && (await sha256File(p)) === wantedSha) { nativeDll = p; break }
    }
    if (!nativeDll) throw new StepError('prepare', `native 目录有多个 dll 且无一匹配 build-info.binarySha256: ${dlls.join(', ')}`)
  }

  const rcs = readdirSync(runtimeDir).filter((f) => f.toLowerCase().endsWith('.runtimeconfig.json'))
  if (rcs.length !== 1) throw new StepError('prepare', `runtime 目录应恰有一个 *.runtimeconfig.json,实际 ${rcs.length}: ${runtimeDir}`)
  const runtimeConfig = join(runtimeDir, rcs[0])
  const assemblyDll = join(runtimeDir, rcs[0].replace(/\.runtimeconfig\.json$/i, '') + '.dll')
  if (!existsSync(assemblyDll)) throw new StepError('prepare', `runtime entry dll 不存在: ${assemblyDll}`)

  const contractCopy = join(webDir, 'contract.json')
  copyFileSync(contractPath, contractCopy)

  const entryType = String(A['entry-type'] ?? process.env.LUMIO_ENTRY_TYPE ?? 'HelloEntry')
  const entryMethod = String(A['entry-method'] ?? process.env.LUMIO_ENTRY_METHOD ?? 'Run')
  const dotnetBin = String(A.dotnet ?? process.env.LUMIO_DOTNET ?? 'dotnet')

  const artifacts = {}
  for (const [key, p] of Object.entries({ serverExe, nativeDll, buildInfo: buildInfoPath, runtimeDll: assemblyDll, runtimeConfig, botDll, contract: contractPath })) {
    artifacts[key] = { path: p, bytes: statSync(p).size, sha256: await sha256File(p) }
  }
  const webFiles = []
  for (const p of walkFiles(webDir)) {
    webFiles.push({ path: relative(webDir, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: await sha256File(p) })
  }

  const contractJson = safeReadJson(contractPath)
  if (!contractJson) throw new StepError('prepare', `契约文件不是合法 JSON: ${contractPath}`)
  const release = {
    serverExe, nativeDll, runtimeDll: assemblyDll, runtimeConfig, botDll, webDir, contractPath, contractCopy,
    hostfxr, entryType, entryMethod, dotnet: dotnetBin, contract: contractJson,
    manifest: {
      schemaVersion: 1,
      tool: 'lumio-hello-integration/launcher',
      createdAt: new Date().toISOString(),
      build: {
        buildId: buildInfo.buildId ?? buildInfo.build_id ?? null,
        abiHash: buildInfo.abiHash ?? buildInfo.abi_hash ?? null,
        binarySha256: buildInfo.binarySha256 ?? buildInfo.binary_sha256 ?? null,
        source: buildInfoPath,
      },
      artifacts,
      webAssets: { root: webDir, fileCount: webFiles.length, totalBytes: webFiles.reduce((s, f) => s + f.bytes, 0), files: webFiles },
      entry: { type: entryType, method: entryMethod, hostfxr },
    },
  }
  writeFileSync(join(ctx.outDir, 'release-manifest.json'), JSON.stringify(release.manifest, null, 2) + '\n')
  say(`prepare 完成: ${Object.keys(artifacts).length} 个工件 + ${webFiles.length} 个 web 资产(buildId=${release.manifest.build.buildId})`)
  logEvent(ctx, { step: 'prepare', buildId: release.manifest.build.buildId, artifacts: Object.keys(artifacts).length, webFiles: webFiles.length })
  return release
}

// ---------------------------------------------------------------------------
// round
// ---------------------------------------------------------------------------

async function waitBotConnected(botTracePath) {
  const t0 = Date.now()
  while (Date.now() - t0 < BOT_CONNECT_TIMEOUT_MS) {
    for (const line of safeReadText(botTracePath).split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const ev = JSON.parse(line)
        if ((ev.kind ?? ev.event) === 'connected') return { connected: true, waitedMs: Date.now() - t0 }
      } catch { /* 行未写完整,继续 */ }
    }
    await sleep(100)
  }
  // 任务约定:未见 connected 也固定等 2s 再继续,由后续 result/verify 兜底判定
  await sleep(BOT_CONNECT_FALLBACK_MS)
  return { connected: false, waitedMs: Date.now() - t0, fallback: true }
}

async function waitBotResult(botResultPath, rec) {
  const deadline = Date.now() + BOT_RESULT_TIMEOUT_MS
  for (;;) {
    const json = safeReadJson(botResultPath)
    if (json && (json.ok === true || json.status === 'ok')) return json
    if (rec && rec.exitCode !== null) {
      throw new StepError('bot-result', `bot 在写出 result 前退出(码 ${rec.exitCode});日志尾:\n${tail(safeReadText(rec.logPath))}`)
    }
    if (Date.now() > deadline) {
      throw new StepError('bot-result', `等待 bot-result.json ok:true 超时(${BOT_RESULT_TIMEOUT_MS}ms);日志尾:\n${tail(rec ? safeReadText(rec.logPath) : '')}`)
    }
    await sleep(100)
  }
}

async function runBrowserScenario(ctx, roundDir, staticPort, serverPort) {
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch (err) {
    throw new StepError('browser', `playwright 不可用(先 npm install): ${err.message}`)
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
      launchErrors.push(`${ch}: ${String(err.message).split('\n')[0]}`)
    }
  }
  if (!browser) throw new StepError('browser', `真实 Chromium 启动失败(chrome → msedge 均失败): ${launchErrors.join(' | ')}`)
  ctx.browser = browser
  // Playwright 1.62 起 Browser.process() 已移除(仅 BrowserServer 保留);拿不到 PID 时以 close()+残留扫描兜底
  ctx.browserPid = typeof browser.process === 'function' ? browser.process()?.pid ?? null : null

  const consolePath = join(roundDir, 'browser-console.ndjson')
  const net = { pageErrors: 0, requestFailed: 0, badResponses: 0 }
  const context = await browser.newContext()
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await context.newPage()
  const appendEv = (obj) => { try { appendFileSync(consolePath, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n') } catch { /* 尽力而为 */ } }
  page.on('console', (m) => appendEv({ kind: 'console', type: m.type(), text: m.text() }))
  page.on('pageerror', (e) => { net.pageErrors++; appendEv({ kind: 'pageerror', text: String(e) }) })
  page.on('requestfailed', (r) => { net.requestFailed++; appendEv({ kind: 'requestfailed', url: r.url(), failure: r.failure()?.errorText ?? null }) })
  page.on('response', (r) => { if (r.status() >= 400) { net.badResponses++; appendEv({ kind: 'bad-response', url: r.url(), status: r.status() }) } })

  const url = `http://127.0.0.1:${staticPort}/index.html?ws=${encodeURIComponent(`ws://127.0.0.1:${serverPort}/`)}&role=browser`
  let ok = false
  let firstError = null
  let result = null
  const soft = async (label, fn) => {
    try {
      await fn()
    } catch (err) {
      appendEv({ kind: 'harness-error', step: label, text: String(err.message).split('\n')[0] })
    }
  }
  try {
    await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__lumioResult && window.__lumioResult.status === 'ok', null, { timeout: BROWSER_OK_TIMEOUT_MS, polling: 120 })
    result = await page.evaluate(() => window.__lumioResult)
    ok = true
  } catch (err) {
    firstError = String(err.message).split('\n')[0]
    result = await page.evaluate(() => window.__lumioResult ?? null).catch(() => null)
  } finally {
    await soft('screenshot', () => page.screenshot({ path: join(roundDir, ok ? 'hello-received.png' : 'failure-evidence.png'), fullPage: true }))
    await soft('tracing-stop', () => context.tracing.stop({ path: join(roundDir, 'trace.zip') }))
    await soft('context-close', () => context.close())
    await soft('browser-close', () => browser.close())
    ctx.browser = null
  }
  if (result) writeFileSync(join(roundDir, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n')
  if (!ok) {
    throw new StepError('browser', `window.__lumioResult.status 未在 ${BROWSER_OK_TIMEOUT_MS}ms 内达到 "ok": ${firstError};console 证据: ${consolePath}`)
  }
  return { ok: true, channel, browserPid: ctx.browserPid, url, net, consolePath }
}

async function verifyRoundFiles(release, roundDir) {
  const { verifyRound } = await import('./verify-evidence.mjs')
  return verifyRound({
    contract: release.contract,
    auditText: safeReadText(join(roundDir, 'server-audit.ndjson')),
    botTraceText: safeReadText(join(roundDir, 'bot-trace.ndjson')),
    browserResult: safeReadJson(join(roundDir, 'browser-result.json')),
    botResult: safeReadJson(join(roundDir, 'bot-result.json')),
  })
}

async function runRound(ctx, n, release) {
  const roundDir = join(ctx.outDir, `round-${n}`)
  mkdirSync(roundDir, { recursive: true })
  const t0 = Date.now()
  const R = { round: n, ok: false, serverPort: null, staticPort: null, processes: [], botConnect: null, browser: null, verify: null, error: null, durationMs: null }
  logEvent(ctx, { round: n, step: 'round-start' })
  say(`--- round ${n} 开始`)
  const roundProcStart = ctx.procs.length
  try {
    // 1) server
    const serverReady = join(roundDir, 'server-ready.json')
    const serverArgs = [
      '--engine-native', release.nativeDll,
      '--hostfxr', release.hostfxr,
      '--runtime-config', release.runtimeConfig,
      '--assembly', release.runtimeDll,
      '--entry-type', release.entryType,
      '--entry-method', release.entryMethod,
      '--wire-contract', release.contractPath,
      '--audit-file', join(roundDir, 'server-audit.ndjson'),
      '--ready-file', serverReady,
    ]
    const serverRec = track(ctx, 'server', spawn(release.serverExe, serverArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }), join(roundDir, 'server.log'))
    const serverReadyJson = await waitForReadyFile(serverReady, SERVER_READY_TIMEOUT_MS, serverRec, 'server')
    R.serverPort = serverReadyJson.port
    say(`server 就绪 port=${R.serverPort} pid=${serverRec.pid}`)

    // 2) static-server
    const staticReady = join(roundDir, 'static-ready.json')
    const staticRec = track(ctx, 'static-server', spawn(process.execPath, [join(SCRIPT_DIR, 'static-server.mjs'), '--root', release.webDir, '--port', '0', '--ready-file', staticReady], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }), join(roundDir, 'static-server.log'))
    const staticReadyJson = await waitForReadyFile(staticReady, STATIC_READY_TIMEOUT_MS, staticRec, 'static-server')
    R.staticPort = staticReadyJson.port
    say(`static-server 就绪 port=${R.staticPort}`)

    // 3) bot
    const botTrace = join(roundDir, 'bot-trace.ndjson')
    const botResultPath = join(roundDir, 'bot-result.json')
    const botRec = track(ctx, 'bot', spawn(release.dotnet, [release.botDll, '--url', `ws://127.0.0.1:${R.serverPort}/`, '--role', 'bot', '--contract', release.contractPath, '--trace', botTrace, '--result', botResultPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }), join(roundDir, 'bot.log'))
    R.botConnect = await waitBotConnected(botTrace)
    say(`bot 连接状态: ${JSON.stringify(R.botConnect)}`)

    // 4) Playwright 真实 Chromium
    R.browser = await runBrowserScenario(ctx, roundDir, R.staticPort, R.serverPort)
    say(`browser 场景完成 channel=${R.browser.channel}`)

    // 5) bot result
    await waitBotResult(botResultPath, botRec)
    say('bot result ok')

    // 6) shutdown 前对账(audit 可能尚未 flush,结果仅记录不判定)
    const preVerify = await verifyRoundFiles(release, roundDir)
    logEvent(ctx, { round: n, step: 'verify-pre-shutdown', ok: preVerify.ok, failures: preVerify.failures.length })

    // 7) 优雅关闭并等全部退出
    for (const rec of [staticRec, serverRec]) {
      try { rec.proc.stdin.write('shutdown\n') } catch { /* 尽力而为 */ }
    }
    R.processes = (await waitAllExits(ctx, EXIT_GRACE_MS)).slice(roundProcStart)
    const badExit = R.processes.filter((p) => p.exitCode !== 0 || p.killed)
    say(`子进程退出: ${JSON.stringify(R.processes)}`)

    // 8) shutdown 后权威对账(契约:server 退出前 flush audit)
    const report = await verifyRoundFiles(release, roundDir)
    const reportPath = join(roundDir, 'verify-report.json')
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
    R.verify = { ok: report.ok, failures: report.failures.length, summary: report.summary, reportPath, failureSample: report.failures.slice(0, 10) }
    R.ok = report.ok && badExit.length === 0
    if (badExit.length > 0) R.error = { step: 'exit', message: `子进程退出码异常: ${JSON.stringify(badExit)}` }
    if (!report.ok) R.error = { step: 'verify', message: `三方对账失败 ${report.failures.length} 项(见 ${reportPath})` }
  } catch (err) {
    R.ok = false
    R.error = { step: err.step ?? `round-${n}`, message: String(err.message).split('\n')[0], detail: err.step ? undefined : err.stack?.split('\n').slice(0, 4).join('\n') }
    logEvent(ctx, { round: n, step: 'round-error', stepName: err.step ?? null, message: R.error.message })
    say(`round ${n} 失败(${R.error.step}): ${R.error.message}`)
    await gracefulKillAll(ctx)
  }
  R.durationMs = Date.now() - t0
  logEvent(ctx, { round: n, step: 'round-end', ok: R.ok, durationMs: R.durationMs })
  say(`--- round ${n} 结束 ok=${R.ok} (${R.durationMs}ms)`)
  return R
}

// ---------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------

function listProcesses(names) {
  return new Promise((resolveP) => {
    const filter = names.map((n) => `Name='${n}'`).join(' OR ')
    const ps = spawn('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    ps.stdout.on('data', (d) => (out += d))
    ps.stderr.on('data', () => { /* 尽力而为 */ })
    ps.on('error', () => resolveP([]))
    ps.on('exit', () => {
      try {
        const json = JSON.parse(out.trim() || '[]')
        const arr = Array.isArray(json) ? json : [json]
        resolveP(arr.filter(Boolean).map((x) => ({ pid: x.ProcessId, name: x.Name, commandLine: x.CommandLine ?? '' })))
      } catch {
        resolveP([])
      }
    })
  })
}

async function checkResiduals(ctx) {
  const failures = []
  const warnings = []
  for (const rec of ctx.procs) {
    if (pidAlive(rec.pid)) failures.push(`跟踪进程 ${rec.name}(pid ${rec.pid}) 仍存活`)
  }
  if (ctx.browserPid && pidAlive(ctx.browserPid)) failures.push(`chromium(pid ${ctx.browserPid}) 仍存活`)
  if (ctx.browserPid === null) warnings.push('未能获取 chromium PID(当前 Playwright 版本无 Browser.process),以 close()+镜像扫描兜底')
  const scanned = await listProcesses(['lumio-server.exe', 'dotnet.exe', 'chrome.exe', 'msedge.exe'])
  for (const p of scanned) {
    const name = String(p.name ?? '').toLowerCase()
    const cl = String(p.commandLine ?? '').toLowerCase()
    if (name === 'lumio-server.exe') failures.push(`残留 lumio-server.exe pid=${p.pid}`)
    if (name === 'dotnet.exe' && cl.includes('hellobot')) failures.push(`残留 HelloBot dotnet pid=${p.pid}: ${p.commandLine}`)
    // 本机其他 headless chrome 无法与本次运行区分,只告警不判失败;精确核对依赖上面的 browserPid
    if ((name === 'chrome.exe' || name === 'msedge.exe') && cl.includes('--headless')) warnings.push(`存在 headless 浏览器 pid=${p.pid}(可能与本运行无关)`)
  }
  return { ok: failures.length === 0, failures, warnings, scannedPids: scanned.map((p) => p.pid) }
}

function loadRoundReceived(ctx, n) {
  const roundDir = join(ctx.outDir, `round-${n}`)
  return {
    browser: { received: safeReadJson(join(roundDir, 'browser-result.json'))?.received ?? [] },
    bot: { received: safeReadJson(join(roundDir, 'bot-result.json'))?.received ?? [] },
  }
}

async function finalize(ctx, release) {
  const { compareRounds } = await import('./verify-evidence.mjs')
  let comparison = null
  if (ctx.rounds.length === ROUNDS && ctx.rounds.every((r) => r.ok)) {
    comparison = { ...compareRounds(loadRoundReceived(ctx, 1), loadRoundReceived(ctx, 2)), rule: '契约 process.evidence.roundsComparison:方向/sender/revision/payloadSha256/tickId 必须一致;latencyMs 只需均 <1000' }
    say(`两轮对比 ok=${comparison.ok} failures=${comparison.failures.length}`)
    for (const f of comparison.failures) say(`  对比失败: ${f.message}`)
  } else {
    comparison = { ok: false, skipped: true, failures: [{ check: 'compare:skipped', message: '两轮未全部成功,跳过对比' }] }
  }

  const residuals = await checkResiduals(ctx)
  say(`残留进程检查 ok=${residuals.ok} failures=${residuals.failures.length}`)
  for (const f of residuals.failures) say(`  残留: ${f}`)

  const evidenceFiles = []
  for (const p of walkFiles(ctx.outDir)) {
    if (p === join(ctx.outDir, 'manifest.json')) continue
    evidenceFiles.push({ path: relative(ctx.outDir, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: await sha256File(p) })
  }

  const ok = !ctx.failure && ctx.rounds.length === ROUNDS && ctx.rounds.every((r) => r.ok) && comparison.ok && residuals.ok
  const manifest = {
    schemaVersion: 1,
    tool: 'lumio-hello-integration/launcher',
    createdAt: new Date().toISOString(),
    conclusion: ok ? 'SUCCESS' : 'FAILED',
    failure: ctx.failure ?? (ctx.rounds.find((r) => !r.ok)?.error ?? null),
    release: release ? { manifest: 'release-manifest.json', build: release.manifest.build } : null,
    rounds: ctx.rounds,
    comparison,
    residuals,
    evidenceFiles,
  }
  writeFileSync(join(ctx.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  logEvent(ctx, { step: 'finalize', conclusion: manifest.conclusion })
  say(`manifest.json 写出,结论 ${manifest.conclusion}(evidence 文件 ${evidenceFiles.length} 个)`)
  return ok
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.out) {
    process.stderr.write('缺少必填参数 --out <evidenceDir>\n')
    process.exit(3)
  }
  const outDir = resolve(String(args.out))
  mkdirSync(outDir, { recursive: true })
  const ctx = newCtx(args, outDir)
  say(`launcher 开始,evidence 目录 ${outDir}`)

  try {
    ctx.release = await prepare(ctx)
  } catch (err) {
    ctx.failure = { step: err.step ?? 'prepare', message: String(err.message).split('\n')[0] }
    say(`prepare 失败: ${err.message}`)
    logEvent(ctx, { step: 'error', stepName: err.step ?? 'prepare', message: ctx.failure.message })
    await gracefulKillAll(ctx)
    await finalize(ctx, null)
    process.exit(1)
  }

  for (let n = 1; n <= ROUNDS; n++) {
    const r = await runRound(ctx, n, ctx.release)
    ctx.rounds.push(r)
    if (!r.ok) break // 失败即止:保留证据,不跑下一轮
  }

  await gracefulKillAll(ctx)
  const ok = await finalize(ctx, ctx.release)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  process.stderr.write(`launcher 内部错误: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
