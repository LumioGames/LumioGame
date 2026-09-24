// node --test eng/native-exemption-guard.test.mjs
// 守卫的纯逻辑单测：列表解析（单 / 多程序集）、CI 测试步骤参数提取、拒绝不执行用例的开关、仓内配置文件 /
// MSBuild 启动参数属性 / 显式用例、xunit 发现清单解析、与登记册对账。不调 dotnet。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CI_WORKFLOW_RELATIVE,
  GuardEnvError,
  checkRepoFiles,
  formatReport,
  parseCiTestStep,
  parseListing,
  parseXunitDiscovery,
  runGuard,
  splitCommand,
} from './native-exemption-guard.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_WORKFLOW = readFileSync(join(REPO_ROOT, CI_WORKFLOW_RELATIVE), 'utf8')

const DLL_A = '/w/game/modules/a/tests/A.Tests/bin/Debug/net10.0/A.Tests.dll (net10.0|x64)'
const DLL_B = '/w/game/modules/b/tests/B.Tests/bin/Debug/net10.0/B.Tests.dll (net10.0|x64)'

// dotnet 10.0.400 + Microsoft.Testing.Platform 实测的单程序集格式（本地 LumioGame.sln，2026-09-23）。
const SINGLE = [
  `Discovering tests from ${DLL_A}`,
  '',
  `Discovered 3 tests in assembly - ${DLL_A}`,
  '  A.Tests.Chat.SendsOne',
  '  A.Tests.Chat.RejectsOversize(size: 4097)',
  '  A.Tests.Chat.RejectsOversize(size: 9000)',
  '',
  'Discovered 3 tests.',
  '',
].join('\n')

// 同一宿主、临时加第二个测试工程后实测的多程序集格式：摘要行是 `Discovered T tests in N assemblies.`。
const MULTI = [
  `Discovering tests from ${DLL_A}`,
  `Discovering tests from ${DLL_B}`,
  '',
  `Discovered 2 tests in assembly - ${DLL_A}`,
  '  A.Tests.Chat.SendsOne',
  '  A.Tests.Chat.Native',
  '',
  `Discovered 1 tests in assembly - ${DLL_B}`,
  '  B.Tests.Probe.One',
  '',
  'Discovered 3 tests in 2 assemblies.',
  '',
].join('\n')

// 过滤器把一个程序集排空时：该块为 0 条，宿主以退出码 8 结束但列表完整（实测）。
const MULTI_WITH_EMPTY = [
  `Discovering tests from ${DLL_B}`,
  `Discovering tests from ${DLL_A}`,
  'Exit code: 8',
  '',
  `Discovered 1 tests in assembly - ${DLL_A}`,
  '  A.Tests.Chat.SendsOne',
  '',
  `Discovered 0 tests in assembly - ${DLL_B}`,
  '',
  'Discovered 1 tests in 2 assemblies.',
  '',
  'Test discovery completed with non-success exit code: 8 (see: https://aka.ms/testingplatform/exitcodes)',
].join('\n')

test('单程序集列表：按摘要 `Discovered T tests.` 对账，Theory 去参数', () => {
  assert.deepEqual([...parseListing(SINGLE)].sort(), ['A.Tests.Chat.RejectsOversize', 'A.Tests.Chat.SendsOne'])
})

test('多程序集列表：按摘要 `Discovered T tests in N assemblies.` 对账，不恒红', () => {
  assert.deepEqual([...parseListing(MULTI)].sort(), ['A.Tests.Chat.Native', 'A.Tests.Chat.SendsOne', 'B.Tests.Probe.One'])
  assert.deepEqual([...parseListing(MULTI_WITH_EMPTY)], ['A.Tests.Chat.SendsOne'])
})

test('列表带 ANSI 颜色转义也能解析', () => {
  const colored = MULTI.replace('Discovered 3 tests in 2 assemblies.', '\x1b[32mDiscovered 3 tests in 2 assemblies.\x1b[m')
  assert.equal(parseListing(colored).size, 3)
})

test('列表对不上账即失败关闭：缺摘要、总数不符、程序集数不符、摘要重复', () => {
  const cases = {
    缺摘要: SINGLE.replace('Discovered 3 tests.', ''),
    单程序集总数不符: SINGLE.replace('Discovered 3 tests.', 'Discovered 4 tests.'),
    多程序集总数不符: MULTI.replace('Discovered 3 tests in 2 assemblies.', 'Discovered 5 tests in 2 assemblies.'),
    程序集数不符: MULTI.replace('Discovered 3 tests in 2 assemblies.', 'Discovered 3 tests in 3 assemblies.'),
    摘要重复: `${MULTI}\nDiscovered 3 tests in 2 assemblies.\n`,
    块内条数不足: SINGLE.replace('  A.Tests.Chat.SendsOne\n', ''),
  }
  for (const [label, output] of Object.entries(cases)) {
    assert.throws(() => parseListing(output), GuardEnvError, label)
  }
})

test('真实工作流：测试步骤能被提取，且就是 CI 实际执行的那条 dotnet test', () => {
  const step = parseCiTestStep(REAL_WORKFLOW)
  assert.equal(step.args[0], 'LumioGame.sln')
  const trait = step.args.indexOf('--filter-not-trait')
  assert.ok(trait > 0, '测试步骤应以 --filter-not-trait 排除豁免用例')
  assert.equal(step.args[trait + 1], 'RequiresEngineNative=true')
  assert.ok(step.args.includes('--fail-skips'))
  assert.equal(REAL_WORKFLOW.split('\n')[step.line - 1].trim(), `run: ${step.command}`)
})

test('测试步骤里多加一条排除，提取出的参数原样带上它（守卫据此列用例）', () => {
  const original = parseCiTestStep(REAL_WORKFLOW).command
  const mutated = REAL_WORKFLOW.replace(`run: ${original}`, `run: ${original} --filter-not-class A.Tests.Chat`)
  assert.notEqual(mutated, REAL_WORKFLOW)
  const args = parseCiTestStep(mutated).args
  assert.deepEqual(args.slice(-2), ['--filter-not-class', 'A.Tests.Chat'])
})

const STEP = (run, extra = '') => [
  'jobs:',
  '  build-test:',
  '    steps:',
  '      - name: build',
  '        run: dotnet build LumioGame.sln',
  '      - name: dotnet test',
  '        id: dotnet-test',
  '        working-directory: game',
  run,
  extra,
  '      - name: guard',
  '        run: node eng/native-exemption-guard.mjs',
].join('\n')

test('测试步骤可写成单行块标量；id 写在首键也认', () => {
  const block = STEP('        run: |\n          dotnet test LumioGame.sln --filter-not-trait "A=b"\n')
  assert.deepEqual(parseCiTestStep(block).args, ['LumioGame.sln', '--filter-not-trait', 'A=b'])
  const idFirst = [
    'jobs:',
    '  t:',
    '    steps:',
    '      - id: dotnet-test',
    "        run: dotnet test X.sln --filter-not-class 'A.B'",
  ].join('\n')
  assert.deepEqual(parseCiTestStep(idFirst).args, ['X.sln', '--filter-not-class', 'A.B'])
})

test('守卫无法静态确定参数的写法一律报错，不猜', () => {
  const rejected = {
    变量展开: STEP('        run: dotnet test LumioGame.sln $EXTRA_FILTER'),
    表达式: STEP('        run: dotnet test LumioGame.sln ${{ env.FILTER }}'),
    命令替换: STEP('        run: dotnet test LumioGame.sln $(cat eng/filter.args)'),
    管道: STEP('        run: dotnet test LumioGame.sln | tee log'),
    多命令: STEP('        run: dotnet test LumioGame.sln && echo done'),
    多行块: STEP('        run: |\n          dotnet test LumioGame.sln\n          dotnet test Other.sln\n'),
    续行: STEP('        run: dotnet test LumioGame.sln', '          --filter-not-class A.B'),
    引号标量: STEP('        run: "dotnet test LumioGame.sln"'),
    不是dotnet_test: STEP('        run: ./eng/test.sh'),
    缺run: STEP(''),
    重复run: STEP('        run: dotnet test A.sln', '        run: dotnet test B.sln'),
  }
  for (const [label, workflow] of Object.entries(rejected)) {
    assert.throws(() => parseCiTestStep(workflow), GuardEnvError, label)
  }
  assert.throws(() => parseCiTestStep(REAL_WORKFLOW.replace(/\n\s*id: dotnet-test\n/, '\n')), GuardEnvError, '缺 id')
  const twice = STEP('        run: dotnet test A.sln').replace('id: dotnet-test', 'id: dotnet-test\n        run: dotnet test A.sln\n      - id: dotnet-test')
  assert.throws(() => parseCiTestStep(twice), GuardEnvError, 'id 重复')
})

test('命令分词：单双引号拼接成一个词，未闭合引号报错', () => {
  assert.deepEqual(splitCommand(`dotnet test a.sln --filter-not-trait "K=v w" --x 'y z'`),
    ['dotnet', 'test', 'a.sln', '--filter-not-trait', 'K=v w', '--x', 'y z'])
  assert.throws(() => splitCommand('dotnet test "a.sln'), GuardEnvError)
})

// 对账：用一张小的「用例 → trait / 类」表模拟宿主按参数列用例，检查守卫把 CI 步骤的参数原样交给列表、再与登记册对账。
const UNIVERSE = [
  { name: 'A.Tests.Chat.SendsOne', cls: 'A.Tests.Chat', traits: [] },
  { name: 'A.Tests.Chat.Native', cls: 'A.Tests.Chat', traits: ['RequiresEngineNative=true'] },
  { name: 'A.Tests.Boot.NativeBoot', cls: 'A.Tests.Boot', traits: ['RequiresEngineNative=true'] },
  { name: 'B.Tests.Probe.One', cls: 'B.Tests.Probe', traits: [] },
  { name: 'B.Tests.Probe.Two', cls: 'B.Tests.Probe', traits: [] },
]

function simulateList(args) {
  // xunit v3 的过滤选项接受一个或多个值：取到下一个 `--` 选项为止。
  const valuesOf = option => args.flatMap((arg, i) => {
    if (arg !== option) return []
    const next = args.findIndex((later, j) => j > i && later.startsWith('--'))
    return args.slice(i + 1, next === -1 ? args.length : next)
  })
  const notTraits = valuesOf('--filter-not-trait')
  const notClasses = valuesOf('--filter-not-class')
  const known = new Set(['--filter-not-trait', '--filter-not-class', '--fail-skips', '--solution'])
  for (const arg of args) {
    if (arg.startsWith('--') && !known.has(arg)) throw new Error(`模拟宿主不认识 ${arg}`)
  }
  return new Set(UNIVERSE
    .filter(t => !t.traits.some(trait => notTraits.includes(trait)))
    .filter(t => !notClasses.includes(t.cls))
    .map(t => t.name))
}

const REGISTER = (names) => [
  '## 真 Native 覆盖豁免登记册',
  '',
  '| 用例 | 原因 | 替代复核 | 解除卡 | 登记单 |',
  '|------|------|----------|--------|--------|',
  ...names.map(name => `| \`${name}\`（LumioGame） | 需 native | 带 native 全量 | R-00712 | R-00711 |`),
  '',
].join('\n')

// `dotnet test ... --xunit-list full` 的输出（xunit v3 4.0.0 经 dotnet test 10.0.400 实测格式：宿主退出码 8，
// 标准输出缩进在 `Standard output:` 之下；显式用例带 `Explicit:     true`，trait 在其后）。
const DLL_PATH = '/w/game/modules/a/tests/A.Tests/bin/Debug/net10.0/A.Tests.dll (net10.0|x64)'
function xunitFull(displayNames, explicit = []) {
  return [
    `Running tests from ${DLL_PATH}`,
    `${DLL_PATH} Zero tests ran (20s 487ms)`,
    'Exit code: 8',
    '  Standard output: ',
    '  Assembly: A.Tests',
    ...displayNames.flatMap(name => [
      `    - Display name: "${name}"`,
      `      Test method:  ${name.replace(/\(.*\)$/, '')}`,
      '      ID:           dc1786e48563b9b949ce9253dbc0dea3fb6cb8c86950018ce70045a2621ba79a',
      ...(explicit.includes(name) ? ['      Explicit:     true'] : []),
      '      Traits:',
      '        "Area": ["chat"]',
    ]),
    '',
    'Test run summary: Zero tests ran',
    '  total: 0',
    'Test run completed with non-success exit code: 8 (see: https://aka.ms/testingplatform/exitcodes)',
  ].join('\n')
}

function guard(workflowText, registered) {
  const calls = []
  const result = runGuard({
    workflowText,
    registerText: REGISTER(registered),
    repoFiles: [],
    readRepoFile: () => '',
    listAll: () => { calls.push('all'); return simulateList([]) },
    listCi: args => { calls.push(args); return simulateList(args) },
    discoverCi: args => parseXunitDiscovery(xunitFull([...simulateList(args)])),
  })
  return { result, calls, report: formatReport(result, { registerPath: 'register.md' }) }
}

const WITH_TRAIT = STEP('        run: dotnet test LumioGame.sln --filter-not-trait "RequiresEngineNative=true" --fail-skips on')
const NATIVE = ['A.Tests.Boot.NativeBoot', 'A.Tests.Chat.Native']

test('对账：排除集合与登记册逐条相等 → OK，口径「N 未执行，其中 M 条已登记豁免」', () => {
  const { result, calls, report } = guard(WITH_TRAIT, NATIVE)
  assert.deepEqual(calls[1], ['LumioGame.sln', '--filter-not-trait', 'RequiresEngineNative=true', '--fail-skips', 'on'])
  assert.deepEqual(result.problems, [])
  assert.equal(report.exitCode, 0)
  assert.ok(report.out.includes('2 未执行，其中 2 条已登记豁免（ADR-114）'), report.out.join('\n'))
  assert.ok(report.out.some(line => line.trim().startsWith('OK：')))
})

test('变异①：测试步骤多一条 --filter-not-class → 计入「未执行」并因未登记而红', () => {
  const mutated = WITH_TRAIT.replace('--fail-skips on', '--fail-skips on --filter-not-class B.Tests.Probe')
  const { result, calls, report } = guard(mutated, NATIVE)
  assert.deepEqual(calls[1].slice(-2), ['--filter-not-class', 'B.Tests.Probe'])
  assert.deepEqual(result.excluded, ['A.Tests.Boot.NativeBoot', 'A.Tests.Chat.Native', 'B.Tests.Probe.One', 'B.Tests.Probe.Two'])
  assert.equal(report.exitCode, 1)
  assert.ok(report.out.includes('4 未执行，其中 2 条已登记豁免（ADR-114）'), report.out.join('\n'))
  assert.deepEqual(result.problems.filter(p => p.includes('登记册没有这一行')).length, 2)
})

test('变异：测试步骤再加一个 --filter-not-trait 值同样被抓', () => {
  const mutated = WITH_TRAIT.replace('"RequiresEngineNative=true"', '"RequiresEngineNative=true" "Slow=true"')
  const universeHasSlow = UNIVERSE.find(t => t.name === 'B.Tests.Probe.Two')
  universeHasSlow.traits.push('Slow=true')
  try {
    const { result, report } = guard(mutated, NATIVE)
    assert.equal(report.exitCode, 1)
    assert.deepEqual(result.excluded.filter(name => !NATIVE.includes(name)), ['B.Tests.Probe.Two'])
  } finally {
    universeHasSlow.traits.pop()
  }
})

test('变异：测试步骤去掉过滤器 → 登记行没被排除而红；登记册多一行 / 少一行也红', () => {
  const noFilter = STEP('        run: dotnet test LumioGame.sln --fail-skips on')
  assert.equal(guard(noFilter, NATIVE).report.exitCode, 1)
  assert.equal(guard(WITH_TRAIT, [...NATIVE, 'A.Tests.Gone.Missing']).report.exitCode, 1)
  assert.equal(guard(WITH_TRAIT, NATIVE.slice(1)).report.exitCode, 1)
})

test('CI 列出的用例不在全量基线里 → 守卫前提不成立，报错而不是放行', () => {
  const inputs = (all, run) => ({
    workflowText: WITH_TRAIT,
    registerText: REGISTER(NATIVE),
    repoFiles: [],
    readRepoFile: () => '',
    listAll: () => new Set(all),
    listCi: () => new Set(run),
    discoverCi: () => parseXunitDiscovery(xunitFull(run)),
  })
  assert.throws(() => runGuard(inputs(['A.Tests.Chat.SendsOne'], ['A.Tests.Chat.SendsOne', 'C.Tests.Elsewhere.One'])), GuardEnvError)
  assert.throws(() => runGuard(inputs([], [])), GuardEnvError)
})

// R-00741：让 CI 测试步骤不执行用例、作业却可能照样绿、而 --list-tests 列表反映不出来的写法，
// 守卫一律报错（GuardEnvError，脚本退出码 2），不去重、不据此列用例。
const REAL_COMMAND = parseCiTestStep(REAL_WORKFLOW).command
const withRun = command => {
  const mutated = REAL_WORKFLOW.replace(`run: ${REAL_COMMAND}`, `run: ${command}`)
  assert.notEqual(mutated, REAL_WORKFLOW)
  return mutated
}

function guardOn(workflowText, { repo = {}, discovery = xunitFull(['A.Tests.Chat.SendsOne']) } = {}) {
  const calls = []
  const names = new Set(['A.Tests.Chat.SendsOne'])
  const run = () => runGuard({
    workflowText,
    registerText: REGISTER([]),
    repoFiles: Object.keys(repo),
    readRepoFile: path => repo[path],
    listAll: () => { calls.push('all'); return names },
    listCi: args => { calls.push(args); return names },
    discoverCi: args => { calls.push(['discover', ...args]); return parseXunitDiscovery(discovery) },
  })
  return { run, calls }
}

function assertRejected(workflowText, expected, label) {
  const { run, calls } = guardOn(workflowText)
  assert.throws(run, error => {
    assert.ok(error instanceof GuardEnvError, `${label}：应为 GuardEnvError，实际 ${error}`)
    for (const text of [expected].flat()) assert.ok(error.message.includes(text), `${label}：报错里应有「${text}」：\n${error.message}`)
    return true
  }, label)
  assert.deepEqual(calls, [], `${label}：报错前不应列用例`)
}

test('卡面场景：测试步骤加 --list-tests → 报错并说明只列不跑，不去重、不列用例', () => {
  assertRejected(withRun(`${REAL_COMMAND} --list-tests`), ['id: dotnet-test', '--list-tests：只列用例、不执行'], '--list-tests')
})

test('只列不跑 / 不执行 / 判定放水的选项逐个被拒；大小写、单横线、/ 前缀、=值 与 :值 写法都认', () => {
  const rejected = [
    ['--list-tests', '只列用例'],
    ['--LIST-TESTS', '只列用例'],
    ['-list-tests', '只列用例'],
    ['--list-tests=true', '只列用例'],
    ['--list-tests:true', '只列用例'],
    ['--help', '只打印帮助'],
    ['-h', '只打印帮助'],
    ['/h', '只打印帮助'],
    ['-HELP', '只打印帮助'],
    ['--info', '只打印测试程序信息'],
    ['-Info', '只打印测试程序信息'],
    ['--xunit-list tests', '只列 xunit 发现信息'],
    ['--explicit only', 'Not run'],
    ['--Explicit=only', 'Not run'],
    ['--explicit:on', 'Not run'],
    ['--explicit off', 'off 是缺省'],
    ['--debug', '等调试器'],
    ['--ignore-exit-code 8', '非成功退出码当成功'],
    ['--config-file ci.testconfig.json', 'testconfig.json'],
    ['--xunit-config-filename ci.xunit.json', 'xunit.runner.json'],
    ['@ci.rsp', '响应文件'],
    ['-p:TestingPlatformCommandLineArguments=--list-tests', 'MSBuild 属性'],
    ['-p:StartArguments=x', 'MSBuild 属性'],
    ['/p:RunArguments=x', 'MSBuild 属性'],
    ['--property:Configuration=Release', 'MSBuild 属性'],
    ['-property:A=b', 'MSBuild 属性'],
    ['-p A=b', 'MSBuild 属性'],
  ]
  for (const [extra, reason] of rejected) {
    const token = extra.split(' ')[0]
    assertRejected(withRun(`${REAL_COMMAND} ${extra}`), [`${token}：`, reason], extra)
  }
})

test('--fail-skips 必须恰好一个且为 on：缺、off、重复、缺值都拒', () => {
  const base = REAL_COMMAND.replace(' --fail-skips on', '')
  assert.notEqual(base, REAL_COMMAND)
  const cases = {
    缺: [base, '没有 --fail-skips'],
    off: [`${base} --fail-skips off`, '--fail-skips 取值为 off'],
    重复: [`${base} --fail-skips on --fail-skips off`, '--fail-skips 取值为 on、off'],
    缺值: [`${base} --fail-skips`, '--fail-skips 取值为 （缺值）'],
    等号off: [`${base} --fail-skips=off`, '--fail-skips 取值为 off'],
  }
  for (const [label, [command, reason]] of Object.entries(cases)) {
    assertRejected(withRun(command), [reason, '必须恰好一个 --fail-skips on'], label)
  }
})

test('TESTINGPLATFORM_EXITCODE_IGNORE（--ignore-exit-code 的环境变量形式）出现在 -e 参数或工作流 env 都拒', () => {
  assertRejected(withRun(`${REAL_COMMAND} -e TESTINGPLATFORM_EXITCODE_IGNORE=8`), 'TESTINGPLATFORM_EXITCODE_IGNORE', '-e')
  const envBlock = REAL_WORKFLOW.replace(/\njobs:\n/, "\nenv:\n  TESTINGPLATFORM_EXITCODE_IGNORE: '8'\n\njobs:\n")
  assert.notEqual(envBlock, REAL_WORKFLOW)
  assertRejected(envBlock, ['第 ', '行出现 TESTINGPLATFORM_EXITCODE_IGNORE'], 'env')
})

test('多处问题一次列全', () => {
  const { run } = guardOn(withRun(`${REAL_COMMAND.replace(' --fail-skips on', '')} --list-tests --explicit only`))
  assert.throws(run, error => ['--list-tests：', '--explicit：', '没有 --fail-skips'].every(text => error.message.includes(text)))
})

test('真实工作流与不影响「执行哪些用例、失败算不算失败」的选项照常对账', () => {
  const allowed = [
    REAL_COMMAND,
    REAL_COMMAND.replace('--fail-skips on', '--fail-skips=on'),
    `${REAL_COMMAND} --xunit-info`,
    `${REAL_COMMAND} --stop-on-fail on`,
    `${REAL_COMMAND} --minimum-expected-tests 16`,
    `${REAL_COMMAND} --output Detailed --report-xunit-trx`,
    `${REAL_COMMAND} -e LUMIO_TRACE=1`,
  ]
  for (const command of allowed) {
    const workflow = command === REAL_COMMAND ? REAL_WORKFLOW : withRun(command)
    const { run, calls } = guardOn(workflow)
    const result = run()
    assert.deepEqual(result.problems, [], command)
    assert.equal(calls.length, 3, command)
  }
})

test('工作流任何位置出现给测试宿主加启动参数的 MSBuild 属性名（环境变量形式）都拒，不分大小写', () => {
  for (const [name, value] of [
    ['StartArguments', '--explicit only'],
    ['RUNARGUMENTS', '--list-tests'],
    ['TestingPlatformCommandLineArguments', '--explicit only'],
    ['RunCommand', '/usr/bin/true'],
    ['StartProgram', '/usr/bin/true'],
  ]) {
    const envBlock = REAL_WORKFLOW.replace(/\njobs:\n/, `\nenv:\n  ${name}: '${value}'\n\njobs:\n`)
    assert.notEqual(envBlock, REAL_WORKFLOW)
    assertRejected(envBlock, [`行出现 ${name}`, 'MSBuild 把同名环境变量当属性读'], name)
  }
  assertRejected(withRun(`${REAL_COMMAND} -e StartArguments=x`), '行出现 StartArguments', '-e')
})

// R-00742：仓内会改变执行方式、而列表与参数检查都看不到的文件与写法，守卫一律报错（退出码 2），不解析内容、不列用例。
const CLEAN_REPO = {
  'modules/a/tests/A.Tests/A.Tests.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>',
  'modules/a/tests/A.Tests/ChatTests.cs': '[Fact]\npublic void SendsOne() { }\n// explicit conversion 与 explicit operator 是小写，不算；ExplicitlyNamed 也不算\npublic void ExplicitlyNamed() { }',
  'modules/a/tests/A.Tests/bin/Debug/net10.0/A.Tests.deps.json': '{}',
  'modules/a/tests/A.Tests/packages.lock.json': '{}',
  'global.json': '{"test":{"runner":"Microsoft.Testing.Platform"}}',
  'integration/hello/evidence-run1/round-1/bot-result.json': '{}',
  'Directory.Build.props': '<Project><PropertyGroup><Nullable>enable</Nullable></PropertyGroup></Project>',
}

test('干净的仓：配置文件、MSBuild 属性、显式用例检查都通过，照常列用例对账', () => {
  const { run, calls } = guardOn(REAL_WORKFLOW, { repo: CLEAN_REPO })
  assert.deepEqual(run().problems, [])
  assert.equal(calls.length, 3)
})

test('改变执行方式的配置文件按文件名拒（不分大小写，含 bin/obj 输出目录），不解析内容、不列用例', () => {
  const T = 'modules/a/tests/A.Tests'
  const cases = {
    [`${T}/xunit.runner.json`]: 'xunit v3 配置文件',
    [`${T}/A.Tests.xunit.runner.json`]: 'xunit v3 配置文件',
    [`${T}/bin/Debug/net10.0/xunit.runner.json`]: 'xunit v3 配置文件',
    [`${T}/XUnit.Runner.JSON`]: 'xunit v3 配置文件',
    [`${T}/testconfig.json`]: 'Microsoft Testing Platform 配置文件',
    [`${T}/bin/Debug/net10.0/A.Tests.testconfig.json`]: 'Microsoft Testing Platform 配置文件',
    [`${T}/Properties/launchSettings.json`]: '启动配置',
    [`${T}/launchsettings.json`]: '启动配置',
    [`${T}/A.Tests.run.json`]: '<项目>.run.json',
    'Directory.Build.rsp': 'MSBuild 自动读取的响应文件',
    [`${T}/directory.build.rsp`]: 'MSBuild 自动读取的响应文件',
  }
  for (const [path, reason] of Object.entries(cases)) {
    // 内容写成「看起来无害」的空对象也拒：守卫不逐键判定。
    const { run, calls } = guardOn(REAL_WORKFLOW, { repo: { ...CLEAN_REPO, [path]: '{}' } })
    assert.throws(run, error => {
      assert.ok(error instanceof GuardEnvError, `${path}：应为 GuardEnvError，实际 ${error}`)
      assert.ok(error.message.includes(`  ${path}：`) && error.message.includes(reason) && error.message.includes('R-00742'), `${path}：\n${error.message}`)
      return true
    }, path)
    assert.deepEqual(calls, [], `${path}：报错前不应列用例`)
  }
})

test('仓内 MSBuild 文件里给测试宿主加启动参数的属性 / 目标都拒，不分大小写；bin/obj 下的还原生成物不扫', () => {
  const T = 'modules/a/tests/A.Tests'
  const cases = [
    ['Directory.Build.props', '<Project>\n  <PropertyGroup>\n    <TestingPlatformCommandLineArguments>--explicit only</TestingPlatformCommandLineArguments>\n  </PropertyGroup>\n</Project>', 'TestingPlatformCommandLineArguments', 3],
    [`${T}/A.Tests.csproj`, '<Project Sdk="Microsoft.NET.Sdk">\n<PropertyGroup><RunArguments>--list-tests</RunArguments></PropertyGroup>\n</Project>', 'RunArguments', 2],
    ['Directory.Build.targets', '<Project>\n<PropertyGroup><startarguments>--explicit only</startarguments></PropertyGroup>\n</Project>', 'startarguments', 2],
    ['eng/run.targets', '<Project>\n  <Target Name="ComputeRunArguments" />\n</Project>', 'ComputeRunArguments', 2],
    ['eng/x.proj', '<Project><PropertyGroup><RunCommand>true</RunCommand></PropertyGroup></Project>', 'RunCommand', 1],
    ['Directory.Build.props', '<Project><Target Name="T"><CreateProperty Value="--list-tests"><Output TaskParameter="Value" PropertyName="StartProgram" /></CreateProperty></Target></Project>', 'StartProgram', 1],
  ]
  for (const [path, text, hit, line] of cases) {
    const { run, calls } = guardOn(REAL_WORKFLOW, { repo: { ...CLEAN_REPO, [path]: text } })
    assert.throws(run, error => {
      assert.ok(error instanceof GuardEnvError, `${path}：应为 GuardEnvError，实际 ${error}`)
      assert.ok(error.message.includes(`${path} 第 ${line} 行出现 ${hit}：给测试宿主加启动参数`), `${path}：\n${error.message}`)
      return true
    }, path)
    assert.deepEqual(calls, [], `${path}：报错前不应列用例`)
  }
  const generated = { ...CLEAN_REPO, [`${T}/obj/A.Tests.csproj.nuget.g.props`]: '<RunArguments>x</RunArguments>' }
  assert.deepEqual(guardOn(REAL_WORKFLOW, { repo: generated }).run().problems, [])
})

test('仓内 .cs 出现 xunit 显式用例的标识符即拒（Explicit / ExplicitAsNullable / ExplicitOption* / WithExplicit），不管值是什么', () => {
  const T = 'modules/a/tests/A.Tests'
  const cases = [
    ['[Fact(Explicit = true)]', 'Explicit'],
    ['[Fact(Explicit=true)]', 'Explicit'],
    ['[Theory(Explicit = true)]', 'Explicit'],
    ['[InlineData(2, Explicit = true)]', 'Explicit'],
    ['[MemberData(nameof(Rows), Explicit = true)]', 'Explicit'],
    ['new TheoryDataRow<int>(2) { Explicit = true },', 'Explicit'],
    ['    Explicit = true; // 派生特性的构造函数里', 'Explicit'],
    ['public override bool Explicit => true;', 'Explicit'],
    ['[Fact(Explicit = false)]', 'Explicit'],
    ['new TheoryDataRow<int>(2).WithExplicit(true),', 'WithExplicit'],
    ['ExplicitAsNullable = true,', 'ExplicitAsNullable'],
    ['options.ExplicitOption = ExplicitOption.Only;', 'ExplicitOption'],
  ]
  for (const [code, hit] of cases) {
    const path = `${T}/ProbeTests.cs`
    const { run, calls } = guardOn(REAL_WORKFLOW, { repo: { ...CLEAN_REPO, [path]: `namespace A.Tests;\n\n${code}\n` } })
    assert.throws(run, error => {
      assert.ok(error instanceof GuardEnvError, `${code}：应为 GuardEnvError，实际 ${error}`)
      assert.ok(error.message.includes(`${path} 第 3 行出现 ${hit}：xunit 显式用例缺省不执行`), `${code}：\n${error.message}`)
      return true
    }, code)
    assert.deepEqual(calls, [], `${code}：报错前不应列用例`)
  }
  const buildOutput = { ...CLEAN_REPO, [`${T}/obj/Debug/net10.0/Generated.cs`]: '[Fact(Explicit = true)]' }
  assert.deepEqual(guardOn(REAL_WORKFLOW, { repo: buildOutput }).run().problems, [], 'bin/obj 下的生成物不扫')
})

test('多处问题一次列全：配置文件、MSBuild 属性、显式标识符', () => {
  const repo = {
    ...CLEAN_REPO,
    'modules/a/tests/A.Tests/Properties/launchSettings.json': '{}',
    'Directory.Build.props': '<RunArguments>x</RunArguments>',
    'modules/a/tests/A.Tests/ProbeTests.cs': '[Fact(Explicit = true)]',
  }
  const { run } = guardOn(REAL_WORKFLOW, { repo })
  assert.throws(run, error => ['launchSettings.json：', '出现 RunArguments', '出现 Explicit'].every(text => error.message.includes(text)))
})

// 本地实测（xunit v3 4.0.0、dotnet test 10.0.400）：临时加的 [Fact(Explicit = true)]、派生特性构造函数里设 Explicit、
// [InlineData(2, Explicit = true)] 三种都出现在 --list-tests 列表里，xunit 发现清单则给它们标 `Explicit: true`。
test('xunit 发现清单：解析显示名、去 Theory 参数、认出 Explicit 行', () => {
  const output = xunitFull(['A.Tests.Chat.SendsOne', 'A.Tests.Chat.Rows(value: 1)', 'A.Tests.Chat.Rows(value: 2)'], ['A.Tests.Chat.Rows(value: 2)'])
  assert.deepEqual(parseXunitDiscovery(output), [
    { display: 'A.Tests.Chat.SendsOne', name: 'A.Tests.Chat.SendsOne', explicit: false },
    { display: 'A.Tests.Chat.Rows(value: 1)', name: 'A.Tests.Chat.Rows', explicit: false },
    { display: 'A.Tests.Chat.Rows(value: 2)', name: 'A.Tests.Chat.Rows', explicit: true },
  ])
  assert.throws(() => parseXunitDiscovery('  Explicit:     true\n'), GuardEnvError, 'Explicit 行之前没有用例')
})

test('CI 要执行的用例里有显式用例 → 报错并列出显示名，不计入「未执行」', () => {
  const discovery = xunitFull(['A.Tests.Chat.SendsOne'], ['A.Tests.Chat.SendsOne'])
  const { run, calls } = guardOn(REAL_WORKFLOW, { discovery })
  assert.throws(run, error => {
    assert.ok(error instanceof GuardEnvError, `应为 GuardEnvError，实际 ${error}`)
    for (const text of ['1 条 xunit 显式用例（Explicit: true）', '  A.Tests.Chat.SendsOne', '不是 ADR-114 的豁免手段']) {
      assert.ok(error.message.includes(text), `报错里应有「${text}」：\n${error.message}`)
    }
    return true
  })
  // 发现清单按 CI 测试步骤的同一组参数取。
  assert.deepEqual(calls.at(-1), ['discover', ...parseCiTestStep(REAL_WORKFLOW).args])
})

test('xunit 发现清单与 CI 列表对不上（空、缺、多）→ 失败关闭，不当成没有显式用例', () => {
  for (const [label, discovery] of Object.entries({
    空清单: '',
    缺一条: xunitFull([]),
    多一条: xunitFull(['A.Tests.Chat.SendsOne', 'A.Tests.Chat.Other']),
  })) {
    const { run } = guardOn(REAL_WORKFLOW, { discovery })
    assert.throws(run, error => error instanceof GuardEnvError && error.message.includes('对不上'), label)
  }
})

test('checkRepoFiles 只读源码类文件（.cs 与 MSBuild 文件），不读配置文件与其他文件', () => {
  const read = []
  checkRepoFiles(Object.keys(CLEAN_REPO), path => { read.push(path); return CLEAN_REPO[path] })
  assert.deepEqual(read.sort(), ['Directory.Build.props', 'modules/a/tests/A.Tests/A.Tests.csproj', 'modules/a/tests/A.Tests/ChatTests.cs'])
})
