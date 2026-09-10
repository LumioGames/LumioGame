#!/usr/bin/env node
/**
 * lint-extensions — 本仓 .spec/ 扩展部分的结构一致性机械校验。改完 .spec/ 应跑一次;CI 里随 workflow 执行。
 * 用法:node .spec/tools/lint-extensions.mjs [仓库根目录]   (省略参数时取本脚本上级目录)
 *
 * 通用调度规则、硬红线与通用技能已归 Workflow 插件(ADR-089 第二步),本脚本只校验本仓自有的
 * 知识库 / 决策 / 技能扩展,不再校验 rules/、agents/ 名册与 tasks/ 任务卡。
 *
 * 校验项清单(本注释是全仓「lint 能力清单」的单一权威,其他文档只指回这里):
 *  1. 核心文件存在:CLAUDE.md、.spec/AGENTS.md、.spec/knowledge/README.md 缺失时给可读报错,不崩栈。
 *  2. knowledge 文档 frontmatter:name / description / metadata.type / metadata.status 齐全;
 *     status 只能取枚举(设计中 / 实施中 / 已交付 / 历史归档);description ≤ 120 字符,
 *     且必须单行明文(禁 YAML 多行标量 > / |,防止绕过长度校验)。
 *  3. 导航覆盖:features/ 与 standards/ 及 knowledge 根下的 .md 必须被 knowledge/README.md
 *     链接到(索引漂移 = 知识隐身);decisions/ 下每条 ADR 必须登记进 decisions/README.md 索引。
 *  4. 链接可达:.spec 下全部 .md 与根 README.md / AGENTS.md 的相对链接必须指向存在的文件
 *     (剥围栏代码块与行内代码,避免代码里的 [T](x) 误判)。
 *  5. 强制载入完整性:AGENTS.md、knowledge/README.md 必须有根 CLAUDE.md 的对应 @import 行
 *     (漏一行 = init 静默失效)。
 *  6. agents / skills frontmatter:只允许 name + description,且 name 与文件 / 目录名一致。
 *  8. 软链接存活:.claude/skills、.agents/skills 必须存在且解析进 .spec/。
 *
 * (7 名册一致、9 任务卡 frontmatter 已随 agents/ 与 tasks/ 一并退役,编号保留不复用。)
 */
import { readFileSync, readdirSync, existsSync, statSync, lstatSync, realpathSync } from 'node:fs'
import { join, dirname, basename, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SPEC = join(ROOT, '.spec')
const STATUS_ENUM = new Set(['设计中', '实施中', '已交付', '历史归档'])
const errors = []
const err = (file, msg) => errors.push(`${relative(ROOT, file)}: ${msg}`)

function walk(dir, filter) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, filter))
    else if (filter(p)) out.push(p)
  }
  return out
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---\n', 4)
  if (end === -1) return null
  const body = text.slice(4, end)
  const fm = { __keys: [] }
  let inMetadata = false
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    const m = line.match(/^(\s*)([\w-]+):\s*(.*)$/)
    if (!m) continue
    const [, indent, key, rawValue] = m
    const value = rawValue.replace(/\s+#.*$/, '').trim()
    if (indent === '') {
      inMetadata = key === 'metadata'
      fm.__keys.push(key)
      if (!inMetadata) fm[key] = value
    } else if (inMetadata) {
      fm[`metadata.${key}`] = value
    }
  }
  return fm
}

function mdLinks(file) {
  const text = readFileSync(file, 'utf8')
    .replace(/```[\s\S]*?```/g, '') // 剥围栏代码块,避免代码里的 [T](x) 误判为链接
    .replace(/`[^`\n]*`/g, '')
  const links = []
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1]
    if (/^([a-zA-Z][a-zA-Z0-9+.-]*:|#)/.test(target)) continue // 任何带 scheme 的外部链接
    links.push(decodeURIComponent(target.split('#')[0]))
  }
  return links
}

// ── 1. 核心文件存在 ───────────────────────────────────────────────────────
const CORE = {
  claudeMd: join(ROOT, 'CLAUDE.md'),
  agentsMd: join(SPEC, 'AGENTS.md'),
  navFile: join(SPEC, 'knowledge', 'README.md'),
}
for (const [label, file] of Object.entries({
  'CLAUDE.md(强制载入入口)': CORE.claudeMd,
  '.spec/AGENTS.md(中心文档)': CORE.agentsMd,
  '.spec/knowledge/README.md(知识导航)': CORE.navFile,
})) {
  if (!existsSync(file)) err(file, `缺核心文件:${label}`)
}

// ── 2. knowledge frontmatter ──────────────────────────────────────────────
const knowledgeDir = join(SPEC, 'knowledge')
const featureDocs = walk(join(knowledgeDir, 'features'), (p) => p.endsWith('.md'))
const standardDocs = walk(join(knowledgeDir, 'standards'), (p) => p.endsWith('.md'))
for (const file of [...featureDocs, ...standardDocs]) {
  const fm = parseFrontmatter(file)
  if (!fm) { err(file, '缺少 frontmatter'); continue }
  for (const key of ['name', 'description']) if (!fm[key]) err(file, `frontmatter 缺 ${key}`)
  for (const key of ['metadata.type', 'metadata.status']) if (!fm[key]) err(file, `frontmatter 缺 ${key}`)
  const status = fm['metadata.status']
  if (status && !STATUS_ENUM.has(status)) {
    err(file, `status「${status}」不在枚举(${[...STATUS_ENUM].join(' / ')})——历史在 git,不进文档`)
  }
  if (fm.description && /^[>|]/.test(fm.description)) {
    err(file, 'description 必须单行明文——YAML 多行标量会绕过长度校验')
  } else if (fm.description && [...fm.description].length > 120) {
    err(file, `description 超过 120 字符(${[...fm.description].length})——一句话是什么+何时查`)
  }
}

// ── 3. 导航覆盖 + ADR 索引覆盖 ────────────────────────────────────────────
if (existsSync(CORE.navFile)) {
  const navLinkSet = new Set(mdLinks(CORE.navFile).map((l) => resolve(knowledgeDir, l)))
  const rootDocs = readdirSync(knowledgeDir)
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .map((n) => join(knowledgeDir, n))
  for (const file of new Set([...featureDocs, ...standardDocs, ...rootDocs])) {
    if (!navLinkSet.has(file)) err(file, '未登记进 knowledge/README.md 导航(索引漂移 = 知识隐身)')
  }
}
const decisionsDir = join(SPEC, 'decisions')
if (existsSync(decisionsDir)) {
  const adrIndex = join(decisionsDir, 'README.md')
  const adrLinks = existsSync(adrIndex)
    ? new Set(mdLinks(adrIndex).map((l) => resolve(decisionsDir, l)))
    : new Set()
  for (const file of walk(decisionsDir, (p) => p.endsWith('.md') && basename(p) !== 'README.md')) {
    if (!adrLinks.has(file)) err(file, '未登记进 decisions/README.md 索引')
  }
}

// ── 4. 链接可达(.spec 下全部 .md + 根入口) ──────────────────────────────
const linkScanFiles = [
  ...walk(SPEC, (p) => p.endsWith('.md')),
  join(ROOT, 'README.md'),
  join(ROOT, 'AGENTS.md'),
].filter(existsSync)
for (const file of linkScanFiles) {
  for (const link of mdLinks(file)) {
    const target = resolve(dirname(file), link)
    if (!existsSync(target)) err(file, `悬空链接:${link}`)
  }
}

// ── 5. 强制载入完整性(CLAUDE.md @import) ────────────────────────────────
if (existsSync(CORE.claudeMd)) {
  const claudeMd = readFileSync(CORE.claudeMd, 'utf8')
  const imports = new Set([...claudeMd.matchAll(/^@(\.spec\/\S+)$/gm)].map((m) => m[1]))
  const mustImport = ['.spec/AGENTS.md', '.spec/knowledge/README.md']
  for (const path of mustImport) {
    if (!imports.has(path)) err(CORE.claudeMd, `缺 @import 行:@${path}(漏了 = init 静默不加载)`)
  }
}

// ── 6. agents / skills frontmatter ────────────────────────────────────────
for (const file of walk(join(SPEC, 'agents'), (p) => p.endsWith('.agent.md'))) {
  const fm = parseFrontmatter(file)
  const base = basename(file).replace('.agent.md', '')
  if (!fm) { err(file, '缺少 frontmatter'); continue }
  const keys = fm.__keys.filter((k) => k !== '__keys').sort()
  if (keys.join(',') !== 'description,name') err(file, `frontmatter 只允许 name+description,实际:${keys.join(',')}`)
  if (fm.name !== base) err(file, `frontmatter name「${fm.name}」与文件名「${base}」不一致`)
}
for (const file of walk(join(SPEC, 'skills'), (p) => basename(p) === 'SKILL.md')) {
  const fm = parseFrontmatter(file)
  const dir = basename(dirname(file))
  if (!fm) { err(file, '缺少 frontmatter'); continue }
  const keys = fm.__keys.filter((k) => k !== '__keys').sort()
  if (keys.join(',') !== 'description,name') err(file, `frontmatter 只允许 name+description,实际:${keys.join(',')}`)
  if (fm.name !== dir) err(file, `frontmatter name「${fm.name}」与目录名「${dir}」不一致`)
}

// ── 8. 软链接存活 ─────────────────────────────────────────────────────────
for (const rel of ['.claude/skills', '.agents/skills']) {
  const link = join(ROOT, rel)
  try {
    lstatSync(link)
  } catch {
    err(link, '软链接缺失(宿主自动发现依赖它)')
    continue
  }
  try {
    const real = realpathSync(link)
    if (!real.startsWith(realpathSync(SPEC))) err(link, `软链接未解析进 .spec/(实际指向 ${real})`)
  } catch {
    err(link, '软链接悬空(目标不存在)')
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`lint-extensions: ${errors.length} 处不一致\n`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('lint-extensions: OK')
