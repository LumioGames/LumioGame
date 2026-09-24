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
 * 列表只反映过滤与测试目标。让用例不执行、作业却可能照样绿、而列表看不出来的写法，守卫一律报错（退出码 2），
 * 不去重、不忽略：
 *   - CI 测试步骤的开关（R-00741，清单见 NON_EXECUTING_OPTIONS）：只列不跑的 --list-tests / --xunit-list、
 *     --help、--info、--explicit、--debug、--ignore-exit-code、配置文件与响应文件间接传参、MSBuild 属性 -p，
 *     以及缺 `--fail-skips on`。
 *   - 仓内配置文件（R-00742，清单见 EXECUTION_CONFIG_FILES）：xunit.runner.json、testconfig.json、
 *     launchSettings.json、<项目>.run.json、Directory.Build.rsp。出现即报错，不解析内容——它们能写的键
 *     （命令行选项、环境变量、各扩展自己的段）随版本增加，守卫判断不了哪些无害。
 *   - 给测试宿主加启动参数的 MSBuild 属性（R-00742，清单见 RUN_ARGUMENT_PROPERTIES）：出现在仓内 MSBuild
 *     文件、或工作流任何位置（MSBuild 把环境变量当属性读）都报错。
 *   - xunit v3 显式用例（R-00742）：`[Fact(Explicit = true)]` 之类。--list-tests 照样列出它，缺省却不执行、
 *     --fail-skips on 也不把它的 Not run 算失败，所以列表会把它算成「已执行」。守卫两路找：扫仓内 .cs 的
 *     Explicit 标识符（EXPLICIT_IDENTIFIER，连运行时才展开的数据行也能看到），再用 xunit 自己的发现清单
 *     （--xunit-list full）核对 CI 要执行的用例里有没有 `Explicit: true`（连仓外定义的特性也能看到）。
 *     任一命中即报错，不计入「未执行」：显式用例在本地缺省也不执行，不是 ADR-114 允许的豁免手段，
 *     若把它计入并允许登记，等于给登记册开了第二种豁免入口。
 *
 * 用法（先 `dotnet build LumioGame.sln`；脚本只列用例，不构建、不执行用例）：
 *   node eng/native-exemption-guard.mjs [--register <登记册路径>] [--solution <全量基线 sln>]
 * 登记册缺省取 $LUMIO_ENGINE_ROOT、$LumioArchRoot、同级 ../LumioGameEngine 下的上述路径，找不到即失败。
 * 纯逻辑单测：node --test eng/native-exemption-guard.test.mjs（CI 同跑）。
 *
 * 退出码：0 逐条相等；1 集合不等或登记行无效；2 环境 / 用法错误（登记册缺失、工作流测试步骤无法解析、
 * 测试步骤含不执行用例的开关、仓内有改变执行方式的配置文件或 MSBuild 属性、有显式用例、dotnet 列表失败
 * 或无法对账）。
 *
 * 解除卡 R-00712（前置 R-00519 SDK 公开包）落地后，本脚本、CI 过滤与标记一并删除。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTER_RELATIVE = '.spec/knowledge/standards/development-verification.md'
const REGISTER_HEADING = '真 Native 覆盖豁免登记册'
const REPO_TAG = 'LumioGame'
/** CI 测试步骤所在的工作流与步骤 id：排除条件的唯一来源。 */
export const CI_WORKFLOW_RELATIVE = '.github/workflows/repository-policy.yml'
export const CI_TEST_STEP_ID = 'dotnet-test'
/**
 * 守卫在 CI 参数之后追加的列表开关。--list-tests 出现在 CI 参数里时已被 checkCiTestArgs 拒绝；
 * 其余三个不影响执行，参数里已有的不重复加。
 */
const LIST_FLAGS = ['--no-build', '--list-tests', '--no-ansi', '--no-progress']
/**
 * CI 测试步骤里不得出现的选项（按选项名，大小写不敏感；`--x`、`-x`、`/x` 与 `=值` / `:值` 写法都认——
 * 测试宿主实测接受 `--LIST-TESTS`、`-list-tests`、`--explicit:only`）。它们让用例不执行、作业却可能照样绿，
 * 而 --list-tests 列表反映不出来，所以只能拒绝。依据 `dotnet test --help`（dotnet 10.0.400、
 * Microsoft.Testing.Platform 2.3.3、xunit.v3）逐项核对；括号里是 2026-09-23 本地实测，都是在 CI 参数后追加该选项。
 * `-?` / `/?` 已被 splitCommand 当作通配符拒绝。
 */
export const NON_EXECUTING_OPTIONS = Object.freeze({
  'list-tests': '只列用例、不执行（exit 0，列出 16 条，一条没跑）',
  help: '只打印帮助、不执行（--help / -h / /h 都 exit 0）',
  h: '即 --help：只打印帮助、不执行',
  info: '只打印测试程序信息、不执行',
  'xunit-list': '只列 xunit 发现信息、不执行（exit 8；配 --ignore-exit-code 8 即 exit 0）',
  explicit: 'on / only 改变哪些用例执行，--list-tests 反映不出来（only 时 16 条全部 Not run，带 --fail-skips on 仍 exit 0）；off 是缺省，不必写',
  debug: '等调试器附加才执行，无人值守时挂起',
  'ignore-exit-code': '把零用例、失败、中止等非成功退出码当成功',
  'config-file': 'testconfig.json 能改变执行方式，守卫看不到文件内容（xUnit.explicit=only 时 16 条全部 Not run 且 exit 0）',
  'xunit-config-filename': 'xunit.runner.json 能改变执行方式，守卫看不到文件内容',
  // R-00742（2026-09-24 本地实测）：-p:TestingPlatformCommandLineArguments / RunArguments 设成 "--explicit only"，
  // 非显式用例全部 Not run、带 --fail-skips on 仍 exit 0；-p 还会让测试步骤按另一套属性重新构建。
  p: 'MSBuild 属性能给测试宿主加启动参数或改变构建（-p:TestingPlatformCommandLineArguments="--explicit only" 实测全部 Not run 且 exit 0），列表反映不出来',
  property: '即 -p：MSBuild 属性能给测试宿主加启动参数或改变构建，列表反映不出来',
})
/** --ignore-exit-code 的环境变量形式；-e 或进程环境里设它都生效（实测 exit 0、零用例）。 */
const EXIT_CODE_IGNORE_ENV = 'TESTINGPLATFORM_EXITCODE_IGNORE'

/**
 * 仓内会改变用例执行方式的配置文件（R-00742）：按文件名认（不分大小写），出现在仓内任何位置（含 bin/obj——
 * 构建把 testconfig.json 复制成输出目录里的 <程序集>.testconfig.json，宿主读的是那一份）即报错，不解析内容。
 * 括号里是 2026-09-24 本地实测（dotnet 10.0.400、Microsoft.Testing.Platform 2.3.3、xunit.v3 4.0.0，CI 同一条命令）。
 */
export const EXECUTION_CONFIG_FILES = Object.freeze([
  {
    pattern: /^(?:.+\.)?testconfig\.json$/i,
    reason: 'Microsoft Testing Platform 配置文件，可写 xUnit 段、commandLineOptions、environmentVariables'
      + '（输出目录里放 {"xUnit":{"explicit":"only"}}：非显式用例全部 Not run、exit 0）',
  },
  {
    pattern: /^(?:.+\.)?xunit\.runner\.json$/i,
    reason: 'xunit v3 配置文件，宿主从输出目录读取（methodDisplay 实测生效；explicit 键实测不生效），'
      + '可改显示名、并行、理论预枚举等，守卫不逐键判定',
  },
  {
    pattern: /^launchSettings\.json$/i,
    reason: 'dotnet test 按启动配置给测试宿主加参数与环境变量'
      + '（Properties/launchSettings.json 写 commandLineArgs "--explicit only"：非显式用例全部 Not run、exit 0）',
  },
  {
    pattern: /.\.run\.json$/i,
    reason: '<项目>.run.json 与 launchSettings.json 同等（项目目录里放同样内容：非显式用例全部 Not run、exit 0）',
  },
  {
    pattern: /^Directory\.Build\.rsp$/i,
    reason: 'MSBuild 自动读取的响应文件，等于给每次构建追加参数（里面写 -property:TestingPlatformCommandLineArguments=…，'
      + '带构建的 dotnet test 实测测试宿主以 exit 5 结束，说明参数到了宿主；守卫判断不了哪些写法无害）',
  },
])

/**
 * 给测试宿主加启动参数或换启动命令的 MSBuild 属性 / 目标（R-00742）。按名字认（不分大小写，MSBuild 属性名本就
 * 不分大小写）：出现在仓内 MSBuild 文件（*.csproj、*.props、*.targets 等，不含 bin/obj 下的还原生成物）或工作流
 * 任何位置（MSBuild 把环境变量当属性读）即报错。括号里是 2026-09-24 本地实测或未实测的依据。
 */
export const RUN_ARGUMENT_PROPERTIES = Object.freeze({
  TestingPlatformCommandLineArguments: 'Directory.Build.props 里设 "--explicit only" 实测非显式用例全部 Not run、exit 0',
  RunArguments: '-p:RunArguments="--explicit only" 实测同上',
  StartArguments: '-p 与同名环境变量设 "--explicit only" 实测同上',
  RunCommand: 'dotnet test 用它启动测试宿主，可换成别的程序（按 SDK targets 同源推定，未单独实测）',
  StartProgram: 'SDK targets 用它决定 RunCommand（未单独实测）',
  ComputeRunArguments: 'SDK 留给工具改写 RunCommand / RunArguments 的目标（未单独实测）',
})
const RUN_ARGUMENT_PATTERN = new RegExp(`\\b(${Object.keys(RUN_ARGUMENT_PROPERTIES).join('|')})\\b`, 'i')
const MSBUILD_FILE = /\.(?:\w*proj|props|targets)$/i

/**
 * xunit v3 显式用例的标识符（R-00742）：Explicit（特性命名参数、数据行、TheoryDataRow 初始化器、派生特性构造函数）、
 * ExplicitAsNullable、ExplicitOption*、WithExplicit。只扫 .cs（不含 bin/obj），区分大小写；守卫不解析 C#，
 * 注释或字符串里出现也算——请改写避开这个词。`explicit operator` 是小写关键字，不算。
 */
export const EXPLICIT_IDENTIFIER = /\b(?:With)?Explicit(?:AsNullable|Option\w*)?\b/
/** 遍历仓内文件时跳过的目录名。 */
const WALK_SKIP_DIRS = new Set(['.git', 'node_modules'])
/** 源码类扫描（.cs、MSBuild 文件）额外跳过的构建输出目录名；配置文件扫描不跳过它们。 */
const BUILD_OUTPUT_DIRS = new Set(['bin', 'obj'])
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

/** 选项名：去掉 `--` / `-` / `/` 前缀与 `=值` / `:值` 后缀，转小写；不是选项返回 null。 */
function optionName(token) {
  const match = /^(?:--?|\/)([^=:]+)/.exec(token)
  return match ? match[1].toLowerCase() : null
}

/**
 * 拒绝让 CI 测试步骤不执行用例、却可能以 0 退出的写法（R-00741）：NON_EXECUTING_OPTIONS 里的选项、
 * `@文件` 响应文件（dotnet test 会展开它，守卫看不到内容；实测里面写 --list-tests 即只列不跑、exit 0）、
 * 工作流任何位置出现 TESTINGPLATFORM_EXITCODE_IGNORE 或 RUN_ARGUMENT_PROPERTIES 里的属性名（MSBuild 把环境变量
 * 当属性读，R-00742），以及没有恰好一个 `--fail-skips on`（缺它或写成 off，跳过的用例不执行也不算失败）。
 * 任一即抛 GuardEnvError，列出全部问题。
 */
export function checkCiTestArgs(step, workflowText) {
  const problems = []
  const failSkips = []
  step.args.forEach((token, i) => {
    if (token.startsWith('@')) {
      problems.push(`${token}：响应文件，dotnet test 会展开其中的参数，守卫看不到内容`)
      return
    }
    const name = optionName(token)
    if (name && Object.hasOwn(NON_EXECUTING_OPTIONS, name)) {
      problems.push(`${token}：${NON_EXECUTING_OPTIONS[name]}`)
    }
    if (name === 'fail-skips') {
      const inline = /^[^=:]*[=:](.*)$/.exec(token)
      failSkips.push(inline ? inline[1] : step.args[i + 1])
    }
  })
  if (failSkips.length !== 1 || String(failSkips[0]).toLowerCase() !== 'on') {
    const seen = failSkips.length === 0 ? '没有 --fail-skips' : `--fail-skips 取值为 ${failSkips.map(value => value ?? '（缺值）').join('、')}`
    problems.push(`${seen}：必须恰好一个 --fail-skips on，否则跳过的用例不执行也不算失败`)
  }
  const workflowLines = workflowText.split(/\r?\n/)
  const envLine = workflowLines.findIndex(text => text.toUpperCase().includes(EXIT_CODE_IGNORE_ENV))
  if (envLine !== -1) {
    problems.push(`${CI_WORKFLOW_RELATIVE} 第 ${envLine + 1} 行出现 ${EXIT_CODE_IGNORE_ENV}：它是 --ignore-exit-code 的环境变量形式`)
  }
  workflowLines.forEach((text, i) => {
    const property = RUN_ARGUMENT_PATTERN.exec(text)?.[1]
    if (property) {
      problems.push(`${CI_WORKFLOW_RELATIVE} 第 ${i + 1} 行出现 ${property}：MSBuild 把同名环境变量当属性读，`
        + `它能给测试宿主加启动参数（${RUN_ARGUMENT_PROPERTIES[canonicalProperty(property)]}）`)
    }
  })
  if (problems.length > 0) {
    throw new GuardEnvError([
      `CI 测试步骤（${CI_WORKFLOW_RELATIVE} 第 ${step.line} 行，id: ${CI_TEST_STEP_ID}）含让用例不执行、作业却可能照样绿的写法，`
        + '守卫不据此对账（--list-tests 列表反映不出它们，否则会把没执行的用例算成已执行）：',
      ...problems.map(problem => `  ${problem}`),
    ].join('\n'))
  }
}

/** RUN_ARGUMENT_PROPERTIES 的键（MSBuild 属性名不分大小写，报错时用规范写法取依据）。 */
function canonicalProperty(name) {
  return Object.keys(RUN_ARGUMENT_PROPERTIES).find(key => key.toLowerCase() === name.toLowerCase())
}

/**
 * 仓内扫描（R-00742）：files 为相对仓根、以 / 分隔的全部文件路径，read(path) 返回文本。
 * 找三类东西——EXECUTION_CONFIG_FILES 里的配置文件（按文件名，含 bin/obj）、MSBuild 文件里的
 * RUN_ARGUMENT_PROPERTIES、.cs 里的 EXPLICIT_IDENTIFIER（后两类不含 bin/obj）。任一即抛 GuardEnvError，列出全部命中。
 */
export function checkRepoFiles(files, read) {
  const problems = []
  for (const path of [...files].sort()) {
    const segments = path.split('/')
    const name = segments.at(-1)
    const config = EXECUTION_CONFIG_FILES.find(({ pattern }) => pattern.test(name))
    if (config) problems.push(`${path}：${config.reason}`)
    if (segments.slice(0, -1).some(segment => BUILD_OUTPUT_DIRS.has(segment.toLowerCase()))) continue
    const source = MSBUILD_FILE.test(name) ? RUN_ARGUMENT_PATTERN : /\.cs$/i.test(name) ? EXPLICIT_IDENTIFIER : null
    if (!source) continue
    read(path).split(/\r?\n/).forEach((text, i) => {
      const hit = source.exec(text)?.[0]
      if (!hit) return
      problems.push(source === EXPLICIT_IDENTIFIER
        ? `${path} 第 ${i + 1} 行出现 ${hit}：xunit 显式用例缺省不执行，--list-tests 照样列出、--fail-skips on 也不算失败`
        : `${path} 第 ${i + 1} 行出现 ${hit}：给测试宿主加启动参数（${RUN_ARGUMENT_PROPERTIES[canonicalProperty(hit)]}）`)
    })
  }
  if (problems.length > 0) {
    throw new GuardEnvError([
      '仓内有让用例不执行、作业却可能照样绿的配置或写法，守卫不据此对账（--list-tests 列表反映不出它们，'
        + '否则会把没执行的用例算成已执行；R-00742）：',
      ...problems.map(problem => `  ${problem}`),
    ].join('\n'))
  }
}

/**
 * 解析 `dotnet test <CI 参数> --xunit-list full` 的文本输出（xunit v3 4.0.0 实测格式）：每条用例一行
 * `- Display name: "<显示名>"`，显式用例在其后几行带 `Explicit:     true`。返回 [{ display, name, explicit }]，
 * name 去掉 Theory 参数后缀，与 parseListing 同口径。
 */
export function parseXunitDiscovery(output) {
  const entries = []
  for (const line of output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/)) {
    const display = /^\s*- Display name: "(.*)"\s*$/.exec(line)?.[1]
    if (display !== undefined) {
      entries.push({ display, name: display.replace(/\(.*\)$/, ''), explicit: false })
    } else if (/^\s*Explicit:\s+true\s*$/.test(line)) {
      if (entries.length === 0) throw new GuardEnvError(`无法解析 xunit 发现清单：Explicit 行之前没有用例。原始输出：\n${output}`)
      entries.at(-1).explicit = true
    }
  }
  return entries
}

/**
 * 用 xunit 自己的发现清单核对 CI 要执行的用例里没有显式用例（R-00742）。清单必须与 CI 列表逐条对上，
 * 否则当作无法解析（失败关闭，不把空清单当成「没有显式用例」）。
 */
export function checkNoExplicit(discovered, run) {
  const names = new Set(discovered.map(entry => entry.name))
  const missing = [...run].filter(name => !names.has(name))
  const extra = [...names].filter(name => !run.has(name))
  if (missing.length > 0 || extra.length > 0) {
    throw new GuardEnvError(`xunit 发现清单（--xunit-list full）与 CI 列表对不上，无法确认有没有显式用例：`
      + `清单缺 ${missing.length} 条、多 ${extra.length} 条。\n  ${[...missing, ...extra].sort().join('\n  ')}`)
  }
  const explicit = discovered.filter(entry => entry.explicit).map(entry => entry.display).sort()
  if (explicit.length > 0) {
    throw new GuardEnvError([
      `CI 测试步骤要执行的用例里有 ${explicit.length} 条 xunit 显式用例（Explicit: true）：缺省不执行，`
        + '--list-tests 照样列出、--fail-skips on 也不算失败，守卫会把它算成已执行（R-00742）。'
        + '显式用例不是 ADR-114 的豁免手段：去掉 Explicit，需要 native 的改用 [RequiresEngineNative] 并登记。',
      ...explicit.map(name => `  ${name}`),
    ].join('\n'))
  }
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

/**
 * 守卫主体：repoFiles / readRepoFile 为仓内全部文件与读取函数（checkRepoFiles），listAll() 列全量基线，
 * listCi(args) 按 CI 测试步骤参数列用例（都返回用例名集合），discoverCi(args) 按同一参数返回 xunit 发现清单
 * （parseXunitDiscovery 的结果）。先做不调 dotnet 的检查，任一不过即报错、不列用例。
 */
export function runGuard({ workflowText, registerText, repoFiles, readRepoFile, listAll, listCi, discoverCi }) {
  const step = parseCiTestStep(workflowText)
  checkCiTestArgs(step, workflowText)
  checkRepoFiles(repoFiles, readRepoFile)
  const register = parseRegister(registerText)
  const all = listAll()
  const run = listCi(step.args)
  checkNoExplicit(discoverCi(step.args), run)
  return { step, register, all, run, ...reconcile({ all, run, register }) }
}

export function formatReport(result, { registerPath }) {
  const { step, register, all, run, excluded, exempted, problems } = result
  const registered = new Set(register.names)
  const out = [
    `ADR-114 真 Native 豁免对账（${REPO_TAG}）`,
    `登记册：${registerPath}（${REPO_TAG} 行 ${register.names.length} 条）`,
    `CI 测试步骤（${CI_WORKFLOW_RELATIVE} 第 ${step.line} 行，id: ${CI_TEST_STEP_ID}）：${step.command}`,
    '执行方式检查：CI 测试步骤无不执行用例的开关，仓内无改变执行方式的配置文件、MSBuild 启动参数属性与显式用例（R-00741 / R-00742）',
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

/**
 * 按参数跑一次 dotnet test 的列表模式，返回原始输出；退出码只接受 0 与 8（零用例）。
 * flags 里的开关 CI 参数已有的不重复加（选项值如 full 总是追加）。
 */
function dotnetList(args, flags) {
  const full = ['test', ...args, ...flags.filter(flag => !(flag.startsWith('--') && args.includes(flag)))]
  const run = spawnSync('dotnet', full, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.error || (run.status !== 0 && run.status !== EXIT_ZERO_TESTS)) {
    throw new GuardEnvError(`dotnet ${full.join(' ')} 失败（退出码 ${run.status ?? run.error}）。先 dotnet build LumioGame.sln。\n${output}`)
  }
  return output
}

const listTests = args => parseListing(dotnetList(args, LIST_FLAGS))
/** xunit 自己的发现清单：只列不跑，恒以退出码 8（零用例）结束。 */
const discoverTests = args => parseXunitDiscovery(dotnetList(args, ['--no-build', '--xunit-list', 'full', '--no-ansi', '--no-progress']))

/** 仓内全部文件（相对仓根、以 / 分隔）。跟随指向目录的符号链接，按真实路径去重防环；跳过 WALK_SKIP_DIRS。 */
function listRepoFiles(root) {
  const files = []
  const seen = new Set()
  const walk = (dir, prefix) => {
    const real = realpathSync(dir)
    if (seen.has(real)) return
    seen.add(real)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix + entry.name
      const isDir = entry.isDirectory() || (entry.isSymbolicLink() && existsSync(join(dir, entry.name)) && statSync(join(dir, entry.name)).isDirectory())
      if (!isDir) files.push(path)
      else if (!WALK_SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), `${path}/`)
    }
  }
  walk(root, '')
  return files
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const registerPath = resolveRegister(options.register)
  const result = runGuard({
    workflowText: readFileSync(join(REPO_ROOT, CI_WORKFLOW_RELATIVE), 'utf8'),
    registerText: readFileSync(registerPath, 'utf8'),
    repoFiles: listRepoFiles(REPO_ROOT),
    readRepoFile: path => readFileSync(join(REPO_ROOT, path), 'utf8'),
    listAll: () => listTests(['--solution', options.solution]),
    listCi: args => listTests(args),
    discoverCi: args => discoverTests(args),
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
