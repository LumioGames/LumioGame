#!/usr/bin/env node
/**
 * launcher — RM-00011 C# MVP 101-entity suite: prepare → round 1 → round 2 → compare.
 * Extends the R-00281 cross-process automation surface. Does not archive Hello objects.
 * Does not extend hello-wire-v1. Never logs secrets.
 *
 * Sibling lumio-mvp-host FullGraph MaxConnections=64 cannot host 101 live connections;
 * this launcher runs Lumio.Game.EntityChat.Suite (Bot launcher + GameRoomHost) against
 * the real Account Server process.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareRuns, verifyRun } from './verify-evidence.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const DEFAULT_DOTNET = process.env.LUMIO_DOTNET ?? 'dotnet'
const SUITE_PROJ = join(REPO_ROOT, 'modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/Lumio.Game.EntityChat.Suite.csproj')
const SUITE_DLL = join(REPO_ROOT, 'modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/bin/Debug/net10.0/Lumio.Game.EntityChat.Suite.dll')

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

function safeReadJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function runDotnet(args, cwd) {
  return spawnSync(DEFAULT_DOTNET, args, { cwd, encoding: 'utf8', windowsHide: true, env: process.env })
}

async function runSuiteRound(n, outDir, accountDll) {
  const roundDir = join(outDir, `round-${n}`)
  rmSync(roundDir, { recursive: true, force: true })
  mkdirSync(roundDir, { recursive: true })
  const args = [SUITE_DLL, '--out', roundDir]
  if (accountDll) args.push('--account-server-dll', accountDll)
  const t0 = Date.now()
  const r = spawnSync(DEFAULT_DOTNET, ['exec', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    timeout: 600000,
  })
  writeFileSync(join(roundDir, 'suite.log'), `${r.stdout ?? ''}\n${r.stderr ?? ''}`)
  const evidence = safeReadJson(join(roundDir, 'evidence.json'))
  const audit = existsSync(join(roundDir, 'host-audit.ndjson')) ? readFileSync(join(roundDir, 'host-audit.ndjson'), 'utf8') : ''
  const verify = evidence ? verifyRun(evidence, audit) : { ok: false, failures: [{ check: 'missing', message: 'evidence.json not written' }] }
  writeFileSync(join(roundDir, 'verify-report.json'), JSON.stringify(verify, null, 2) + '\n')
  return {
    round: n,
    ok: r.status === 0 && verify.ok,
    exitCode: r.status,
    durationMs: Date.now() - t0,
    verify,
    blocked: evidence?.blocked ?? null,
    census: evidence?.census ?? null,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.out) {
    process.stderr.write('missing --out <evidenceDir>\n')
    process.exit(3)
  }
  const outDir = resolve(String(args.out))
  mkdirSync(outDir, { recursive: true })
  process.stdout.write(`entity-chat launcher, evidence ${outDir}\n`)

  if (!existsSync(SUITE_DLL)) {
    const build = runDotnet(['build', SUITE_PROJ, '--nologo'], REPO_ROOT)
    writeFileSync(join(outDir, 'build.log'), `${build.stdout ?? ''}\n${build.stderr ?? ''}`)
    if (build.status !== 0 || !existsSync(SUITE_DLL)) {
      writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
        conclusion: 'BLOCKED',
        failure: { step: 'build', message: 'EntityChat.Suite failed to build', exitCode: build.status },
      }, null, 2) + '\n')
      process.stderr.write('suite build failed\n')
      process.exit(1)
    }
  }

  const accountDll = args['account-server-dll']
    ?? process.env.LUMIO_ACCOUNT_SERVER_DLL
    ?? [
      resolve(REPO_ROOT, '../../LumioServer/account-server/src/Lumio.Server.Account.App/bin/Release/net10.0/lumio-account-server.dll'),
      resolve(REPO_ROOT, '../../wt-server/r-00350-review/account-server/src/Lumio.Server.Account.App/bin/Debug/net10.0/lumio-account-server.dll'),
      resolve(REPO_ROOT, '../../wt-server/r-00344/account-server/src/Lumio.Server.Account.App/bin/Release/net10.0/lumio-account-server.dll'),
      resolve(REPO_ROOT, '../../wt-server/r-00344/account-server/src/Lumio.Server.Account.App/bin/Debug/net10.0/lumio-account-server.dll'),
    ].find((p) => existsSync(p))

  if (!accountDll || !existsSync(accountDll)) {
    const expected = resolve(REPO_ROOT, '../../LumioServer/account-server/src/Lumio.Server.Account.App/bin/Release/net10.0/lumio-account-server.dll')
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
      conclusion: 'BLOCKED',
      failure: { step: 'prepare', message: `sibling account-server 构建产物缺失: ${expected}` },
      missing: [expected],
    }, null, 2) + '\n')
    process.stderr.write(`BLOCKED missing account-server: ${expected}\n`)
    process.exit(2)
  }
  process.stdout.write(`account-server-dll=${accountDll}\n`)

  const rounds = []
  for (const n of [1, 2]) {
    const round = await runSuiteRound(n, outDir, accountDll)
    rounds.push(round)
    process.stdout.write(`round ${n} ok=${round.ok} exit=${round.exitCode} blocked=${round.blocked ?? 'none'} census=${JSON.stringify(round.census)}\n`)
    if (!round.ok) break
  }

  let comparison = { ok: false, skipped: true, failures: [{ check: 'compare:skipped', message: 'two rounds not both successful' }] }
  if (rounds.length === 2 && rounds.every((r) => r.ok)) {
    comparison = compareRuns(
      safeReadJson(join(outDir, 'round-1/evidence.json')),
      safeReadJson(join(outDir, 'round-2/evidence.json')),
      existsSync(join(outDir, 'round-1/host-audit.ndjson')) ? readFileSync(join(outDir, 'round-1/host-audit.ndjson'), 'utf8') : '',
      existsSync(join(outDir, 'round-2/host-audit.ndjson')) ? readFileSync(join(outDir, 'round-2/host-audit.ndjson'), 'utf8') : '',
    )
  }

  const evidenceFiles = []
  for (const p of walkFiles(outDir)) {
    if (p === join(outDir, 'manifest.json')) continue
    evidenceFiles.push({ path: relative(outDir, p).replaceAll('\\', '/'), bytes: statSync(p).size, sha256: await sha256File(p) })
  }

  const blocked = rounds.find((r) => r.blocked)?.blocked
  const ok = rounds.length === 2 && rounds.every((r) => r.ok) && comparison.ok
  const conclusion = blocked && !ok ? 'BLOCKED' : ok ? 'SUCCESS' : 'FAILED'
  const manifest = {
    schemaVersion: 1,
    tool: 'lumio-entity-chat-integration/launcher',
    createdAt: new Date().toISOString(),
    conclusion,
    blocked: blocked ?? null,
    rounds,
    comparison,
    evidenceFiles,
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  process.stdout.write(`manifest conclusion ${conclusion}\n`)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  process.stderr.write(`launcher error: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
