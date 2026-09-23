#!/usr/bin/env node
/**
 * native-exemption-guard — ADR-114 真 Native 豁免的报告与防扩散守卫（R-00711，R-00721 加固）。
 *
 * 公开仓 CI 造不出 liblumio_engine_native（ADR-080；Owner 2026-09-23 不扩大 LUMIO_CI_PAT），所以 CI 的
 * `dotnet test` 排除带 [RequiresEngineNative] 的用例。本脚本回答两件事：
 *   1. 报告：CI 没有执行哪些用例、几条，口径「N 未执行，其中 M 条已登记豁免（ADR-114）」。
 *   2. 守卫：CI 未执行的集合必须与架构仓登记册里 LumioGame 的行逐条相等。两个方向都拦——
 *      排除了但没登记，或登记册多一行 / 少一行，都以非 0 退出。
 *
 * 唯一清单是架构仓 `.spec/knowledge/standards/development-verification.md` 的「真 Native 覆盖豁免登记册」；
 * 本仓不维护第二份名单。排除条件也只有一份：CI 工作流里 `id: dotnet-test` 那一步的 `dotnet test` 命令。
 * 守卫直接读那一行，把它的全部参数原样交给同一个宿主列用例（只追加 --no-build --list-tests 等列表开关），
 * 再用全量列表（--solution，缺省本仓 LumioGame.sln，不带任何过滤）减去它——测试步骤里任何额外排除
 * （多一个过滤器、多一个值、缩小测试目标）都会落进「未执行」并要求登记；那一步写成守卫无法静态确定
 * 参数的形式（变量 / 表达式展开、管道、多条命令、多行），守卫直接报错，不猜。
 *
 * 用法（先 `dotnet build LumioGame.sln`；脚本只列用例，不构建、不执行用例）：
 *   node eng/native-exemption-guard.mjs [--register <登记册路径>] [--solution <全量基线 sln>]
 * 登记册缺省取 $LUMIO_ENGINE_ROOT、$LumioArchRoot、同级 ../LumioGameEngine 下的上述路径，找不到即失败。
 * 纯逻辑单测：node --test eng/native-exemption-guard.test.mjs（CI 同跑）。
 *
 * 退出码：0 逐条相等；1 集合不等或登记行无效；2 环境 / 用法错误（登记册缺失、工作流测试步骤无法解析、
 * dotnet 列表失败或无法对账）。
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
/** CI 测试步骤所在的工作流与步骤 id：排除条件的唯一来源。 */
export const CI_WORKFLOW_RELATIVE = '.github/workflows/repository-policy.yml'
export const CI_TEST_STEP_ID = 'dotnet-test'
/** 守卫在 CI 参数之后追加的列表开关（参数里已有的不重复加）。 */
const LIST_FLAGS = ['--no-build', '--list-tests', '--no-ansi', '--no-progress']
/** Microsoft Testing Platform 退出码 8 = 零用例：过滤器把某个程序集排空时列表仍完整，照常解析对账。 */
const EXIT_ZERO_TESTS = 8

export class GuardEnvError extends Error {}

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
 * 把一条 shell 命令拆成词。只接受守卫能静态确定结果的写法：空白分词、单 / 双引号；
 * 变量与命令替换、管道、重定向、多命令、通配、转义等一律报错（CI 实际参数会与守卫看到的不同）。
 */
export function splitCommand(command) {
  const reject = what => new GuardEnvError(`CI 测试步骤的命令含${what}，守卫无法静态确定 CI 实际使用的参数：${command}`)
  const tokens = []
  let current = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (ch === ' ' || ch === '\t') {
      if (current !== null) tokens.push(current)
      current = null
    } else if (ch === "'" || ch === '"') {
      const close = command.indexOf(ch, i + 1)
      if (close === -1) throw reject('未闭合的引号')
      const inner = command.slice(i + 1, close)
      if (ch === '"' && /[$`\\!]/.test(inner)) throw reject('双引号内的展开或转义')
      current = (current ?? '') + inner
      i = close
    } else if (/[$`\\|;&<>(){}[\]*?!#~]/.test(ch)) {
      throw reject(` shell 元字符「${ch}」`)
    } else {
      current = (current ?? '') + ch
    }
  }
  if (current !== null) tokens.push(current)
  return tokens
}

/**
 * 从工作流文本里取 `id: dotnet-test` 那一步的 run 命令，返回 { line, command, args }：
 * line 为命令所在行号（1 起），args 为 `dotnet test` 之后的全部参数。
 * 只做守卫需要的最小 YAML 定位：该 id 恰好一处、该步恰好一个 run、run 是单条命令
 * （未加引号的单行，或只含一行命令的 | / > 块），否则报错。
 */
export function parseCiTestStep(workflowText) {
  const lines = workflowText.split(/\r?\n/)
  const where = `${CI_WORKFLOW_RELATIVE} 的 id: ${CI_TEST_STEP_ID} 步骤`
  const indentOf = line => line.length - line.trimStart().length
  const isBlank = line => line.trim() === '' || line.trim().startsWith('#')

  const idPattern = new RegExp(`^\\s*(?:-\\s+)?id:\\s*(['"]?)${CI_TEST_STEP_ID}\\1\\s*$`)
  const idLines = lines.flatMap((line, i) => (idPattern.test(line) ? [i] : []))
  if (idLines.length !== 1) {
    throw new GuardEnvError(`${CI_WORKFLOW_RELATIVE} 里 id: ${CI_TEST_STEP_ID} 的步骤应恰好 1 个，实际 ${idLines.length} 个。`)
  }
  const keyCol = lines[idLines[0]].indexOf('id:')

  // 步骤起点：向上找破折号后首键与 id 同列的 `- ` 行。
  let start = -1
  for (let i = idLines[0]; i >= 0; i--) {
    if (isBlank(lines[i])) continue
    const dash = /^(\s*-\s+)\S/.exec(lines[i])
    if (dash && dash[1].length === keyCol) { start = i; break }
    if (indentOf(lines[i]) < keyCol) break
  }
  if (start === -1) throw new GuardEnvError(`${where}不在 steps 列表项里，无法定位。`)
  let end = start + 1
  while (end < lines.length && (isBlank(lines[end]) || indentOf(lines[end]) >= keyCol)) end++

  const keyAt = i => (i === start || indentOf(lines[i]) === keyCol ? lines[i].slice(keyCol) : null)
  const runLines = []
  for (let i = start; i < end; i++) {
    if (/^run:(\s|$)/.test(keyAt(i) ?? '')) runLines.push(i)
  }
  if (runLines.length !== 1) throw new GuardEnvError(`${where}应恰好有 1 个 run，实际 ${runLines.length} 个。`)
  const runLine = runLines[0]
  const value = keyAt(runLine).slice('run:'.length).trim()

  // run 之后、下一个同级键之前的内容：块标量的正文，或普通标量的续行。
  const body = []
  for (let i = runLine + 1; i < end && (isBlank(lines[i]) || indentOf(lines[i]) > keyCol); i++) {
    if (!isBlank(lines[i])) body.push(i)
  }
  let line
  if (/^[|>][-+0-9]*\s*$/.test(value)) {
    if (body.length !== 1) throw new GuardEnvError(`${where}的 run 块应只有一条命令，实际 ${body.length} 行。`)
    line = body[0]
  } else {
    if (value === '') throw new GuardEnvError(`${where}的 run 为空。`)
    if (/^['"]/.test(value)) throw new GuardEnvError(`${where}的 run 请写成未加引号的单行命令：${value}`)
    if (body.length > 0) throw new GuardEnvError(`${where}的 run 跨行续写，请写成单行命令。`)
    line = runLine
  }
  const command = line === runLine ? value : lines[line].trim()
  const tokens = splitCommand(command)
  if (tokens[0] !== 'dotnet' || tokens[1] !== 'test') {
    throw new GuardEnvError(`${where}的 run 必须是一条 dotnet test 命令：${command}`)
  }
  return { line: line + 1, command, args: tokens.slice(2) }
}

/**
 * 解析 `dotnet test --list-tests`（Microsoft Testing Platform 模式）的文本输出：每个程序集一块
 * `Discovered N tests in assembly - <path>`，其后 N 行两空格缩进的用例显示名；末尾一行摘要，
 * 单程序集为 `Discovered T tests.`，多程序集为 `Discovered T tests in K assemblies.`（dotnet 10.0.400 实测）。
 * 条数（及多程序集时的块数）必须与摘要对上，否则当作无法解析（失败关闭，不把空列表当成「没有排除」）。
 */
export function parseListing(output) {
  // 已传 --no-ansi；CI 日志里 dotnet test 仍可能带颜色转义，先剥掉再按行解析。
  const lines = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/)
  const names = new Set()
  let listed = 0
  let blocks = 0
  let summary = null
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
      blocks++
      i += count
      continue
    }
    const total = /^Discovered (\d+) tests?(?: in (\d+) assembl(?:y|ies))?\.$/.exec(lines[i].trim())
    if (total) {
      if (summary) throw new GuardEnvError(`无法解析用例列表：出现两行摘要。原始输出：\n${output}`)
      summary = { total: Number(total[1]), assemblies: total[2] === undefined ? 1 : Number(total[2]) }
    }
  }
  if (!summary || summary.total !== listed || summary.assemblies !== blocks) {
    const reported = summary ? `${summary.total} 条 / ${summary.assemblies} 个程序集` : '无摘要行'
    throw new GuardEnvError(`无法解析用例列表：宿主报 ${reported}，解析出 ${listed} 条 / ${blocks} 个程序集。原始输出：\n${output}`)
  }
  return names
}

/**
 * 对账：all 为全量基线，run 为按 CI 测试步骤参数列出的集合，register 为 parseRegister 的结果。
 * 返回 { excluded, exempted, problems }；problems 非空即守卫红。守卫前提不成立时抛 GuardEnvError。
 */
export function reconcile({ all, run, register }) {
  if (all.size === 0) throw new GuardEnvError('全量列表为 0 条用例，无从对账。')
  const outside = [...run].filter(name => !all.has(name)).sort()
  if (outside.length > 0) {
    throw new GuardEnvError(`CI 测试步骤列出了全量基线里没有的用例（基线没覆盖 CI 的测试目标，用 --solution 指定）：\n  ${outside.join('\n  ')}`)
  }
  const excluded = [...all].filter(name => !run.has(name)).sort()
  const registered = new Set(register.names)
  const excludedSet = new Set(excluded)
  const exempted = excluded.filter(name => registered.has(name))

  const problems = register.errors.map(error => `登记册无效行：${error}`)
  for (const name of excluded) {
    if (!registered.has(name)) problems.push(`CI 测试步骤没有执行它，但登记册没有这一行：${name}`)
  }
  for (const name of register.names) {
    if (excludedSet.has(name)) continue
    problems.push(all.has(name)
      ? `登记册有这一行，但 CI 测试步骤照常执行它（排除条件没有覆盖它）：${name}`
      : `登记册有这一行，但本仓不存在这条用例：${name}`)
  }
  return { excluded, exempted, problems }
}

/** 守卫主体：listAll() 列全量基线，listCi(args) 按 CI 测试步骤参数列用例；两者都返回用例名集合。 */
export function runGuard({ workflowText, registerText, listAll, listCi }) {
  const step = parseCiTestStep(workflowText)
  const register = parseRegister(registerText)
  const all = listAll()
  const run = listCi(step.args)
  return { step, register, all, run, ...reconcile({ all, run, register }) }
}

export function formatReport(result, { registerPath }) {
  const { step, register, all, run, excluded, exempted, problems } = result
  const registered = new Set(register.names)
  const out = [
    `ADR-114 真 Native 豁免对账（${REPO_TAG}）`,
    `登记册：${registerPath}（${REPO_TAG} 行 ${register.names.length} 条）`,
    `CI 测试步骤（${CI_WORKFLOW_RELATIVE} 第 ${step.line} 行，id: ${CI_TEST_STEP_ID}）：${step.command}`,
    `用例 ${all.size} 条：CI 执行 ${run.size} 条，排除 ${excluded.length} 条`,
    `${excluded.length} 未执行，其中 ${exempted.length} 条已登记豁免（ADR-114）`,
    ...excluded.map(name => `  - ${name}${registered.has(name) ? '' : '    <- 未登记'}`),
  ]
  if (problems.length > 0) {
    const err = [
      `\nFAIL：CI 未执行的集合与登记册 ${REPO_TAG} 行不逐条相等（${problems.length} 处）。`
        + '加 / 去标记、改 CI 测试步骤的排除条件，都必须与架构仓登记册同批改（ADR-114）。',
      ...problems.map(problem => `  ${problem}`),
    ]
    return { out, err, exitCode: 1 }
  }
  out.push(`\nOK：CI 排除的 ${excluded.length} 条与登记册 ${REPO_TAG} 行逐条相等。`)
  return { out, err: [], exitCode: 0 }
}

function listTests(args) {
  const full = ['test', ...args, ...LIST_FLAGS.filter(flag => !args.includes(flag))]
  const run = spawnSync('dotnet', full, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.error || (run.status !== 0 && run.status !== EXIT_ZERO_TESTS)) {
    throw new GuardEnvError(`dotnet ${full.join(' ')} 失败（退出码 ${run.status ?? run.error}）。先 dotnet build LumioGame.sln。\n${output}`)
  }
  return parseListing(output)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const registerPath = resolveRegister(options.register)
  const result = runGuard({
    workflowText: readFileSync(join(REPO_ROOT, CI_WORKFLOW_RELATIVE), 'utf8'),
    registerText: readFileSync(registerPath, 'utf8'),
    listAll: () => listTests(['--solution', options.solution]),
    listCi: args => listTests(args),
  })
  const report = formatReport(result, { registerPath })
  for (const line of report.out) console.log(line)
  for (const line of report.err) console.error(line)
  return report.exitCode
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
