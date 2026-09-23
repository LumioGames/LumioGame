#!/usr/bin/env node
/**
 * native-exemption-guard — ADR-114 真 Native 豁免的报告与防扩散守卫（R-00711）。
 *
 * 公开仓 CI 造不出 liblumio_engine_native（ADR-080；Owner 2026-09-23 不扩大 LUMIO_CI_PAT），所以 CI 的
 * `dotnet test` 以 `--filter-not-trait RequiresEngineNative=true` 排除带 [RequiresEngineNative] 的用例。
 * 本脚本回答两件事：
 *   1. 报告：CI 排除了哪些用例、几条，口径「N 未执行，其中 M 条已登记豁免（ADR-114）」。
 *   2. 守卫：CI 排除的集合必须与架构仓登记册里 LumioGame 的行逐条相等。两个方向都拦——
 *      代码里多标一条（排除了但没登记），或登记册多一行 / 少一行，都以非 0 退出。
 *
 * 唯一清单是架构仓 `.spec/knowledge/standards/development-verification.md` 的「真 Native 覆盖豁免登记册」；
 * 本仓不维护第二份名单。「CI 排除的集合」不从源码猜，而是用与 CI 同一个 `dotnet test` 宿主实际列出来：
 * 全量列表减去带同一过滤器的列表。
 *
 * 用法（先 `dotnet build LumioGame.sln`；脚本只列用例，不构建、不执行用例）：
 *   node eng/native-exemption-guard.mjs [--register <登记册路径>] [--solution <sln 路径>]
 * 登记册缺省取 $LUMIO_ENGINE_ROOT、$LumioArchRoot、同级 ../LumioGameEngine 下的上述路径，找不到即失败。
 *
 * 退出码：0 逐条相等；1 集合不等或登记行无效；2 环境 / 用法错误（登记册缺失、dotnet 列表失败或无法解析）。
 *
 * 解除卡 R-00712（前置 R-00519 SDK 公开包）落地后，本脚本、CI 过滤与标记一并删除。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTER_RELATIVE = '.spec/knowledge/standards/development-verification.md'
const REGISTER_HEADING = '真 Native 覆盖豁免登记册'
const REPO_TAG = 'LumioGame'
/** 与 RequiresEngineNativeAttribute 及 CI `dotnet test` 步骤的过滤器同一个值。 */
export const EXEMPTION_TRAIT = 'RequiresEngineNative=true'

class GuardEnvError extends Error {}

function parseArgs(argv) {
  const options = { register: '', solution: join(REPO_ROOT, 'LumioGame.sln') }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if ((key === '--register' || key === '--solution') && argv[i + 1]) {
      options[key.slice(2)] = resolve(argv[++i])
    } else {
      throw new GuardEnvError(`未知参数 ${key}。用法：node eng/native-exemption-guard.mjs [--register <path>] [--solution <sln>]`)
    }
  }
  return options
}

function resolveRegister(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new GuardEnvError(`登记册不存在：${explicit}`)
    return explicit
  }
  const roots = [process.env.LUMIO_ENGINE_ROOT, process.env.LumioArchRoot, join(REPO_ROOT, '..', 'LumioGameEngine')]
  for (const root of roots) {
    if (root && existsSync(join(root, REGISTER_RELATIVE))) return join(root, REGISTER_RELATIVE)
  }
  throw new GuardEnvError(`找不到架构仓登记册 ${REGISTER_RELATIVE}：设 LUMIO_ENGINE_ROOT / LumioArchRoot，`
    + '或把 LumioGameEngine 检出在本仓同级目录，或用 --register 指定。')
}

/**
 * 读登记册里 LumioGame 的行。只看「真 Native 覆盖豁免登记册」一节里的表格行；
 * 第一格形如 `` `Namespace.Class.Method`（LumioGame） ``。
 * 返回 { names, errors }：errors 收集无效行（格式不合、缺项、重复），任一即守卫红。
 */
export function parseRegister(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^#{1,6}\s/.test(line) && line.includes(REGISTER_HEADING))
  if (start === -1) throw new GuardEnvError(`登记册里找不到标题「${REGISTER_HEADING}」。`)
  const level = /^(#+)/.exec(lines[start])[1].length
  const names = []
  const errors = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    const heading = /^(#{1,6})\s/.exec(line)
    if (heading && heading[1].length <= level) break
    if (!line.startsWith('|')) continue
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
    // 按第一格末尾的仓名认行；全角 / 半角括号都认出来，再要求严格格式，写歪的行报错而不是被静默忽略。
    const repo = /[（(]\s*([\w-]+)\s*[）)]$/.exec(cells[0])?.[1]
    if (repo !== REPO_TAG) continue
    const match = /^`([A-Za-z_][\w.+]*)`（LumioGame）$/.exec(cells[0])
    if (!match) {
      errors.push(`第 ${i + 1} 行第一格不是 \`<Namespace.Class.Method>\`（LumioGame）：${cells[0]}`)
      continue
    }
    if (cells.length !== 5 || cells.some(cell => cell === '')) {
      errors.push(`第 ${i + 1} 行缺项（ADR-114：五项缺任一的行无效）：${match[1]}`)
      continue
    }
    if (names.includes(match[1])) {
      errors.push(`第 ${i + 1} 行重复登记：${match[1]}`)
      continue
    }
    names.push(match[1])
  }
  return { names, errors }
}

/**
 * 解析 `dotnet test --list-tests`（Microsoft Testing Platform 模式）的文本输出：每个程序集一行
 * `Discovered N tests in assembly - <path>`，其后 N 行两空格缩进的用例显示名；末行 `Discovered T tests.`。
 * 条数必须与宿主自报的数对上，否则当作无法解析（失败关闭，不把空列表当成「没有排除」）。
 */
export function parseListing(output) {
  // 已传 --no-ansi；CI 日志里 dotnet test 仍可能带颜色转义，先剥掉再按行解析。
  const lines = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/)
  const names = new Set()
  let listed = 0
  let reportedTotal = -1
  for (let i = 0; i < lines.length; i++) {
    const block = /^Discovered (\d+) tests? in assembly - /.exec(lines[i])
    if (block) {
      const count = Number(block[1])
      for (let k = 1; k <= count; k++) {
        const entry = /^ {2}(\S.*)$/.exec(lines[i + k] ?? '')
        if (!entry) throw new GuardEnvError(`无法解析用例列表：${lines[i]} 之后第 ${k} 行不是用例名。`)
        // Theory 的显示名带参数后缀；登记册按方法登记，去掉参数。
        names.add(entry[1].replace(/\(.*\)$/, ''))
      }
      listed += count
      i += count
      continue
    }
    const total = /^Discovered (\d+) tests?\.$/.exec(lines[i].trim())
    if (total) reportedTotal = Number(total[1])
  }
  if (reportedTotal !== listed) {
    throw new GuardEnvError(`无法解析用例列表：宿主报 ${reportedTotal} 条，解析出 ${listed} 条。原始输出：\n${output}`)
  }
  return names
}

function listTests(solution, filterArgs) {
  const args = ['test', '--solution', solution, '--no-build', '--list-tests', '--no-ansi', '--no-progress', ...filterArgs]
  const run = spawnSync('dotnet', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.error || run.status !== 0) {
    throw new GuardEnvError(`dotnet ${args.join(' ')} 失败（退出码 ${run.status ?? run.error}）。先 dotnet build LumioGame.sln。\n${output}`)
  }
  return parseListing(output)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const registerPath = resolveRegister(options.register)
  const register = parseRegister(readFileSync(registerPath, 'utf8'))
  const all = listTests(options.solution, [])
  const run = listTests(options.solution, ['--filter-not-trait', EXEMPTION_TRAIT])
  if (all.size === 0) throw new GuardEnvError('全量列表为 0 条用例，无从对账。')

  const excluded = [...all].filter(name => !run.has(name)).sort()
  const registered = new Set(register.names)
  const excludedSet = new Set(excluded)
  const exempted = excluded.filter(name => registered.has(name))

  console.log(`ADR-114 真 Native 豁免对账（${REPO_TAG}）`)
  console.log(`登记册：${registerPath}（${REPO_TAG} 行 ${register.names.length} 条）`)
  console.log(`CI 过滤：--filter-not-trait ${EXEMPTION_TRAIT}`)
  console.log(`用例 ${all.size} 条：CI 执行 ${run.size} 条，排除 ${excluded.length} 条`)
  console.log(`${excluded.length} 未执行，其中 ${exempted.length} 条已登记豁免（ADR-114）`)
  for (const name of excluded) console.log(`  - ${name}${registered.has(name) ? '' : '    <- 未登记'}`)

  const problems = []
  for (const error of register.errors) problems.push(`登记册无效行：${error}`)
  for (const name of excluded) {
    if (!registered.has(name)) problems.push(`带标记被 CI 排除，但登记册没有这一行：${name}`)
  }
  for (const name of register.names) {
    if (excludedSet.has(name)) continue
    problems.push(all.has(name)
      ? `登记册有这一行，但 CI 没有排除它（用例未带 [RequiresEngineNative]）：${name}`
      : `登记册有这一行，但本仓不存在这条用例：${name}`)
  }

  if (problems.length > 0) {
    console.error(`\nFAIL：CI 排除集合与登记册 ${REPO_TAG} 行不逐条相等（${problems.length} 处）。`
      + '加 / 去标记必须与架构仓登记册同批改（ADR-114）。')
    for (const problem of problems) console.error(`  ${problem}`)
    return 1
  }
  console.log(`\nOK：CI 排除的 ${excluded.length} 条与登记册 ${REPO_TAG} 行逐条相等。`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    if (!(error instanceof GuardEnvError)) throw error
    console.error(`ERROR：${error.message}`)
    process.exitCode = 2
  }
}
