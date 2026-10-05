// lint-extensions 自测:在临时目录搭 fixture 仓库,断言各类违规被抓、合法仓库全绿。
// 运行:node --test .spec/tools/lint-extensions.test.mjs (需要 Workflow API 1 插件)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const LINT = join(dirname(fileURLToPath(import.meta.url)), 'lint-extensions.mjs')
// 定位架构仓检出的副本(R-00739);lint-extensions.mjs 从它导入,fixture 里两份都要放。
const LOCATOR = join(dirname(fileURLToPath(import.meta.url)), 'engine-checkout.mjs')

// fixture 根 → 清理时要删的目录(repoName 形态下是它的父临时目录,同级的假 LumioGameEngine 一起删)。
const CLEANUP = new Map()

/**
 * 生成一个最小合法仓库,返回根路径;overrides 可改写/追加文件(值为 null 表示删除该默认文件)。
 * options.repoName 让仓库落在临时目录下的指定名字里——目录契约检查按检出目录名识别仓、找同级架构仓。
 */
function fixture(overrides = {}, { repoName } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'lint-extensions-fixture-'))
  const root = repoName ? join(base, repoName) : base
  if (repoName) mkdirSync(root, { recursive: true })
  CLEANUP.set(root, base)
  const files = {
    '.spec/tools/lint-extensions.mjs': readFileSync(LINT, 'utf8'),
    '.spec/tools/engine-checkout.mjs': readFileSync(LOCATOR, 'utf8'),
    'CLAUDE.md': '# CLAUDE.md\n\n@.spec/AGENTS.md\n\n@.spec/knowledge/README.md\n',
    '.spec/AGENTS.md': '# 中心文档\n\n| 名称 | 职责 |\n|------|------|\n| `coder` | 写代码 |\n',
    '.spec/knowledge/README.md': [
      '---', 'name: knowledge', 'description: 导航', 'metadata:', '  type: index', '---', '',
      '# 导航', '', '| 文档 | 一句话 |', '|------|--------|',
      '| [`standards/workflow.md`](standards/workflow.md) | 工作流 |',
      '| [`features/_TEMPLATE.md`](features/_TEMPLATE.md) | 模板 |', '',
    ].join('\n'),
    '.spec/knowledge/standards/workflow.md':
      '---\nname: workflow\ndescription: 工作流\nmetadata:\n  type: doc\n  status: 已交付\n---\n\n# 工作流\n',
    '.spec/knowledge/features/_TEMPLATE.md':
      '---\nname: template\ndescription: 模板\nmetadata:\n  type: doc\n  status: 设计中\n---\n\n# 模板\n',
    '.spec/skills/demo/SKILL.md': '---\nname: demo\ndescription: 演示\n---\n\n# Demo\n',
    ...overrides,
  }
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  mkdirSync(join(root, '.claude'), { recursive: true })
  mkdirSync(join(root, '.agents'), { recursive: true })
  symlinkSync('../.spec/skills', join(root, '.claude/skills'))
  symlinkSync('../.spec/skills', join(root, '.agents/skills'))
  return root
}

/** 跑 lint,返回 { code, output }。 */
function lint(root, args = ['--strict'], env = {}) {
  try {
    const result = spawnSync(process.execPath, [LINT, root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    assert.ifError(result.error)
    return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  } finally {
    rmSync(CLEANUP.get(root) ?? root, { recursive: true, force: true })
    CLEANUP.delete(root)
  }
}

test('最小合法仓库全绿', () => {
  const { code, output } = lint(fixture())
  assert.equal(code, 0, output)
  assert.match(output, /spec-lint: OK/)
})

test('knowledge 文档未登记导航被抓', () => {
  const { code, output } = lint(fixture({
    '.spec/knowledge/standards/hidden.md':
      '---\nname: hidden\ndescription: 隐身\nmetadata:\n  type: doc\n  status: 设计中\n---\n\n# 隐身\n',
  }))
  assert.equal(code, 1)
  assert.match(output, /未登记进 knowledge\/README\.md 导航/)
})

test('悬空链接被抓', () => {
  const { code, output } = lint(fixture({
    '.spec/AGENTS.md': '# 中心文档\n\n| 名称 | 职责 |\n|------|------|\n| `coder` | 写代码 |\n\n[不存在](nowhere.md)\n',
  }))
  assert.equal(code, 1)
  assert.match(output, /悬空链接:nowhere\.md/)
})

test('status 非枚举被抓', () => {
  const { code, output } = lint(fixture({
    '.spec/knowledge/standards/workflow.md':
      '---\nname: workflow\ndescription: 工作流\nmetadata:\n  type: doc\n  status: 草稿\n---\n\n# 工作流\n',
  }))
  assert.equal(code, 1)
  assert.match(output, /status「草稿」不在枚举/)
})

test('description 多行标量被抓(不再绕过长度校验)', () => {
  const { code, output } = lint(fixture({
    '.spec/knowledge/standards/workflow.md':
      '---\nname: workflow\ndescription: >-\n  很长很长的描述\nmetadata:\n  type: doc\n  status: 已交付\n---\n\n# 工作流\n',
  }))
  assert.equal(code, 1)
  assert.match(output, /description 必须单行明文/)
})

test('缺 CLAUDE.md 给可读报错而非崩栈', () => {
  const { code, output } = lint(fixture({ 'CLAUDE.md': null }))
  assert.equal(code, 1)
  assert.match(output, /缺核心文件:CLAUDE\.md/)
  assert.doesNotMatch(output, /at .*lint-extensions\.mjs:\d/) // 无堆栈
})

test('软链接缺失被抓', () => {
  const root = fixture()
  rmSync(join(root, '.claude/skills'))
  const { code, output } = lint(root)
  assert.equal(code, 1)
  assert.match(output, /软链接缺失/)
})


test('默认报告违规但不阻断，扩展与通用检查在同一报告中', () => {
  const { code, output } = lint(fixture({ 'CLAUDE.md': null }), [])
  assert.equal(code, 0, output)
  assert.match(output, /缺核心文件:CLAUDE\.md/)
  assert.match(output, /已加载 api=1/)
  assert.match(output, /lumio-host-entrypoints/)
  assert.match(output, /只报告不阻断/)
})

test('普通发现目录也必须解析进 .spec', () => {
  const root = fixture()
  rmSync(join(root, '.claude/skills'))
  mkdirSync(join(root, '.claude/skills'))
  const { code, output } = lint(root)
  assert.equal(code, 1, output)
  assert.match(output, /发现路径未解析进 \.spec/)
})

test('项目技能退役后无需保留发现软链接', () => {
  const root = fixture()
  rmSync(join(root, '.spec/skills'), { recursive: true })
  rmSync(join(root, '.claude/skills'))
  rmSync(join(root, '.agents/skills'))
  const { code, output } = lint(root)
  assert.equal(code, 0, output)
  assert.match(output, /spec-lint: OK/)
})

test('ADR 未登记的原有检查由插件保留', () => {
  const { code, output } = lint(fixture({
    '.spec/decisions/README.md': '# Decisions\n',
    '.spec/decisions/0001-demo.md': '# Demo\n\n- 状态:生效\n',
  }))
  assert.equal(code, 1, output)
  assert.match(output, /未登记进 decisions\/README\.md 索引/)
})

test('缺插件是环境阻塞，不能冒充 lint 成功', () => {
  const { code, output } = lint(fixture(), [], { WORKFLOW_PLUGIN_ROOT: join(tmpdir(), 'missing-workflow-plugin-' + process.pid) })
  assert.equal(code, 2, output)
  assert.match(output, /BLOCKED_ENV/)
  assert.doesNotMatch(output, /spec-lint: OK/)
})

// ---- ADR-115 目录契约:本仓不留实现,从 LumioGameEngine 检出导入 repoLayoutCheck(R-00700、R-00719) ----
// 这里只测「接线」:找哪个检出、导入哪个导出、缺了怎么报、报出用的是哪份 JSON。检查本身的判定口径由
// 架构仓的自测覆盖,所以架构仓用一个桩:它的 repoLayoutCheck 只回报「被调用了、拿到的 root 是谁」。

const NO_ENGINE_ROOT = { LUMIO_ENGINE_ROOT: '' }

/** 在 dir 放一个假 LumioGameEngine 检出;exportCheck=false 模拟 R-00700 之前的旧检出。 */
function stubEngine(dir, { exportCheck = true, marker = 'STUB' } = {}) {
  mkdirSync(join(dir, '.spec', 'tools'), { recursive: true })
  writeFileSync(join(dir, '.spec', 'tools', 'repo-layout.json'), '{"formatVersion":1,"repos":{}}\n')
  writeFileSync(join(dir, '.spec', 'tools', 'lint-extensions.mjs'), exportCheck
    ? `export const repoLayoutCheck = { id: 'lumio-repo-layout', run({ root, report, gitLsFiles }) { report(root, '${marker} 委托给架构仓:' + root.split(/[\\\\/]/).pop() + ' gitLsFiles=' + typeof gitLsFiles) } }\n`
    : `export const checks = [{ id: 'lumio-repo-layout', run() {} }]\n`)
  return dir
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('目录契约检查从同后缀的同级架构仓检出导入,本仓不留第二份实现', () => {
  const root = fixture({}, { repoName: 'LumioBomber-w1' })
  stubEngine(join(dirname(root), 'LumioGameEngine-w1'))
  stubEngine(join(dirname(root), 'LumioGameEngine'), { marker: 'MAIN' })
  const { code, output } = lint(root, ['--strict'], NO_ENGINE_ROOT)
  assert.equal(code, 1, output)
  assert.match(output, /\[lumio-repo-layout\] .*STUB 委托给架构仓:LumioBomber-w1 gitLsFiles=function/)
  assert.doesNotMatch(output, /MAIN/)
})

test('没有同后缀检出时退到同级主检出', () => {
  const root = fixture({}, { repoName: 'LumioBomber-w2' })
  stubEngine(join(dirname(root), 'LumioGameEngine'), { marker: 'MAIN' })
  const { output } = lint(root, ['--strict'], NO_ENGINE_ROOT)
  assert.match(output, /MAIN 委托给架构仓:LumioBomber-w2/)
})

test('LUMIO_ENGINE_ROOT 优先于同级检出,并写明所用的 repo-layout.json', () => {
  const root = fixture({}, { repoName: 'LumioBomber' })
  stubEngine(join(dirname(root), 'LumioGameEngine'), { marker: 'MAIN' })
  const env = stubEngine(join(dirname(root), 'elsewhere'), { marker: 'ENV' })
  const { output } = lint(root, ['--strict'], { LUMIO_ENGINE_ROOT: env })
  assert.match(output, /ENV 委托给架构仓:LumioBomber/)
  assert.doesNotMatch(output, /MAIN/)
  const used = escape(join(env, '.spec', 'tools', 'repo-layout.json'))
  assert.match(output, new RegExp(`lumio-repo-layout: ${used} @ LumioGameEngine HEAD \\S`))
})

test('LUMIO_ENGINE_ROOT 显式设置但无效时报 BLOCKED_ENV,不回落到同级检出', () => {
  const root = fixture({}, { repoName: 'LumioBomber' })
  stubEngine(join(dirname(root), 'LumioGameEngine'), { marker: 'MAIN' })
  const missing = join(dirname(root), 'no-such-engine')
  const { code, output } = lint(root, ['--strict'], { LUMIO_ENGINE_ROOT: missing })
  assert.equal(code, 1, output)
  assert.match(output, /\[lumio-repo-layout\].*BLOCKED_ENV:LUMIO_ENGINE_ROOT=.*no-such-engine 下没有 .*repo-layout\.json/)
  assert.doesNotMatch(output, /MAIN/)
})

test('同级架构仓缺失时报 BLOCKED_ENV,不静默通过、不回落到本仓实现', () => {
  const { code, output } = lint(fixture({}, { repoName: 'LumioBomber' }), ['--strict'], NO_ENGINE_ROOT)
  assert.equal(code, 1, output)
  assert.match(output, /\[lumio-repo-layout\].*BLOCKED_ENV:同级 LumioGameEngine checkout 缺失/)
})

test('同级架构仓早于 R-00700(没有 repoLayoutCheck 导出)时报 BLOCKED_ENV', () => {
  const root = fixture({}, { repoName: 'LumioBomber' })
  stubEngine(join(dirname(root), 'LumioGameEngine'), { exportCheck: false })
  const { code, output } = lint(root, ['--strict'], NO_ENGINE_ROOT)
  assert.equal(code, 1, output)
  assert.match(output, /BLOCKED_ENV:.*早于 R-00700,没有导出 repoLayoutCheck/)
})

test('非 Lumio 检出(临时 fixture)跳过目录契约,不报 BLOCKED_ENV', () => {
  const { code, output } = lint(fixture(), ['--strict'], NO_ENGINE_ROOT)
  assert.equal(code, 0, output)
  assert.match(output, /lumio-repo-layout 跳过/)
  assert.doesNotMatch(output, /BLOCKED_ENV/)
})

// ---- R-00739:HEAD 溯源不冒名;engine-checkout.mjs 与架构仓权威文本逐字节相同 ----

const GIT_IDENTITY = ['-c', 'user.name=r739', '-c', 'user.email=r739@example.invalid', '-c', 'commit.gpgsign=false']

/** 在 dir 建一个带一个空提交的 git 仓,返回它的 HEAD。 */
function gitRepoWithCommit(dir) {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', [...GIT_IDENTITY, 'commit', '-q', '--allow-empty', '-m', 'r739'], { cwd: dir })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
}

test('HEAD 只认架构仓检出自身:解包在别的 git 工作区里时报 unknown,不冒名外层仓(R-00739)', () => {
  const root = fixture({}, { repoName: 'LumioBomber' })
  // 形态同 `git archive` 解到某个工作区的 .build/ 下:目录本身不是检出,往上找得到外层 git 仓。
  const outer = join(dirname(root), 'host')
  const outerHead = gitRepoWithCommit(outer)
  const unpacked = stubEngine(join(outer, '.build', 'LumioGameEngine'), { marker: 'ENV' })
  const { output } = lint(root, ['--strict'], { LUMIO_ENGINE_ROOT: unpacked })
  assert.match(output, /ENV 委托给架构仓:LumioBomber/)
  assert.match(output, /@ LumioGameEngine HEAD unknown \(not a git checkout\)/)
  assert.doesNotMatch(output, new RegExp(outerHead))
})

test('HEAD 溯源:架构仓检出自身是 git 工作区顶层时写出它的 HEAD(R-00739)', () => {
  const root = fixture({}, { repoName: 'LumioBomber' })
  const engine = stubEngine(join(dirname(root), 'elsewhere'), { marker: 'ENV' })
  const head = gitRepoWithCommit(engine)
  const { output } = lint(root, ['--strict'], { LUMIO_ENGINE_ROOT: engine })
  assert.match(output, new RegExp(`@ LumioGameEngine HEAD ${head}\n`))
})

// 四份定位副本的机械守卫:本仓这份与架构仓 `.spec/tools/engine-checkout.mjs`(权威文本)逐字节比对,
// 架构仓检出用这份副本自己的定位逻辑找——LUMIO_ENGINE_ROOT → 同后缀 worktree → 同级主检出。
// 找不到或权威文本缺失是 BLOCKED_ENV:测试失败,不跳过、不静默通过。
test('engine-checkout.mjs 与架构仓权威文本逐字节相同(四份副本的机械守卫,R-00739)', async () => {
  const { engineCheckout, ENGINE_REPO } = await import(LOCATOR)
  const repoRoot = resolve(dirname(LOCATOR), '..', '..')
  const { base, invalid } = engineCheckout(repoRoot)
  assert.ok(!invalid, invalid)
  assert.ok(base, `BLOCKED_ENV:找不到 ${ENGINE_REPO} 检出,无法与权威文本比对——放一个同级检出或设 LUMIO_ENGINE_ROOT;不静默通过`)
  const authority = join(base, '.spec', 'tools', 'engine-checkout.mjs')
  assert.ok(existsSync(authority), `BLOCKED_ENV:${base} 没有 .spec/tools/engine-checkout.mjs(早于 R-00739)——把该检出更新到 origin/main`)
  const lf = text => text.replace(/\r\n/g, '\n')
  assert.equal(lf(readFileSync(LOCATOR, 'utf8')), lf(readFileSync(authority, 'utf8')),
    `${LOCATOR} 与权威文本 ${authority} 不一致:先改架构仓那份,再 LumioServer、LumioGameRuntime、LumioClient、LumioBomber 四处同改`)
})
