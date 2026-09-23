// node --test eng/native-exemption-guard.test.mjs
// 守卫的纯逻辑单测：列表解析（单 / 多程序集）、CI 测试步骤参数提取、与登记册对账。不调 dotnet。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CI_WORKFLOW_RELATIVE,
  GuardEnvError,
  formatReport,
  parseCiTestStep,
  parseListing,
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

function guard(workflowText, registered) {
  const calls = []
  const result = runGuard({
    workflowText,
    registerText: REGISTER(registered),
    listAll: () => { calls.push('all'); return simulateList([]) },
    listCi: args => { calls.push(args); return simulateList(args) },
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
  assert.throws(() => runGuard({
    workflowText: WITH_TRAIT,
    registerText: REGISTER(NATIVE),
    listAll: () => new Set(['A.Tests.Chat.SendsOne']),
    listCi: () => new Set(['A.Tests.Chat.SendsOne', 'C.Tests.Elsewhere.One']),
  }), GuardEnvError)
  assert.throws(() => runGuard({
    workflowText: WITH_TRAIT,
    registerText: REGISTER(NATIVE),
    listAll: () => new Set(),
    listCi: () => new Set(),
  }), GuardEnvError)
})
