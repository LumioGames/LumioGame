#!/usr/bin/env node
/**
 * clone-all — 把 LumioGames 组织的公开仓一次性 clone 到本仓的同级目录。
 *
 * 用法:
 *   node clone-all.mjs                     只拉公开仓(默认)
 *   node clone-all.mjs --include-private   同时尝试私有仓(需要已授权的 git 凭据)
 *   node clone-all.mjs --dest <目录>       改变落地目录(默认为本仓的上级目录)
 *   node clone-all.mjs --depth 1           浅克隆,只要最新一次提交
 *
 * 无权限的私有仓只打印「跳过(无权限)」并继续,不中断、不影响退出码;
 * 只有网络/磁盘一类真实故障才以非 0 退出。
 *
 * 清单是手写的,刷新用: gh repo list LumioGames --limit 100 --json name,visibility
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORG = 'LumioGames'

/** 组织内的仓库清单。visibility 为实测值(2026-09-08),不是规划值。 */
export const REPOS = [
  // 公开 —— 外部开发者从这里开始
  { name: 'LumioSample', visibility: 'public', summary: '游戏「示例」:引擎参考实现,也是新游戏的模板仓 —— 从这里开始' },
  { name: 'LumioGame', visibility: 'public', summary: '顶层导航仓,同时是炸弹人游戏产品的 Gameplay 与内容事实源' },
  { name: 'LumioConfig', visibility: 'public', summary: 'Schema-first 配表源、编译器与导出工具' },
  { name: 'LumioAgentSpec', visibility: 'public', summary: '开发项目管理 Agent 框架(调度、审查、规则)' },
  { name: 'workflow-plugin', visibility: 'public', summary: '把 Claude Code / Cursor / Codex 接到 Workflow 的插件' },
  { name: '.github', visibility: 'public', summary: '组织主页与素材(非源码仓)' },
  // 私有 —— SDK 经 NuGet 包分发,无权限时会被跳过
  { name: 'LumioGameEngine', visibility: 'private', summary: '架构与公共契约的唯一事实源' },
  { name: 'LumioGameRuntime', visibility: 'private', summary: 'C# ECS、Tick、GAS 与 Gameplay 热重载宿主' },
  { name: 'LumioServer', visibility: 'private', summary: 'Rust 专用服务器宿主、网络与 CoreCLR 托管' },
  { name: 'LumioClient', visibility: 'private', summary: '引擎无关的 C# 客户端运行时、复制与预测' },
  { name: 'LumioVoxelEngine', visibility: 'private', summary: 'Rust 体素引擎' },
  { name: 'LumioNativeCore', visibility: 'private', summary: 'Rust 原生底座与版本化 native 契约' },
  { name: 'LumioPlatform', visibility: 'private', summary: '账号权威、大厅、反馈与运营后台' },
]

const NO_ACCESS_PATTERNS = [
  /repository not found/i,
  /could not read username/i,
  /could not read password/i,
  /authentication failed/i,
  /invalid username or password/i,
  /terminal prompts disabled/i,
  /returned error: 40[13]/i,
  /permission denied/i,
]

/** 把 git clone 的 stderr 判成「无权限(可跳过)」还是「真实错误」。 */
export function classifyFailure(stderr = '') {
  return NO_ACCESS_PATTERNS.some((re) => re.test(stderr)) ? 'no-access' : 'error'
}

export function selectRepos(repos, { includePrivate }) {
  return includePrivate ? [...repos] : repos.filter((r) => r.visibility === 'public')
}

export function parseOptions(argv) {
  const opts = { includePrivate: false, dest: null, depth: null, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--include-private') opts.includePrivate = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--dest') opts.dest = argv[++i]
    else if (arg === '--depth') opts.depth = Number(argv[++i])
    else throw new Error(`未知参数: ${arg}(用 --help 看用法)`)
  }
  return opts
}

const USAGE = `用法: node clone-all.mjs [--include-private] [--dest <目录>] [--depth <n>]

  --include-private  同时尝试私有仓(需要已授权的 git 凭据)
  --dest <目录>      落地目录,默认为本仓的上级目录
  --depth <n>        浅克隆深度
`

function cloneOne(repo, dest, depth) {
  const target = join(dest, repo.name)
  if (existsSync(target)) return { state: 'exists' }

  const args = ['clone']
  if (depth) args.push('--depth', String(depth))
  args.push(`https://github.com/${ORG}/${repo.name}.git`, target)

  const run = spawnSync('git', args, {
    encoding: 'utf8',
    // 不让 git 弹交互式账号密码框:无权限时立刻失败,而不是挂住等输入。
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (run.error) return { state: 'error', detail: run.error.message }
  if (run.status === 0) return { state: 'cloned' }
  const stderr = (run.stderr || '').trim()
  return { state: classifyFailure(stderr) === 'no-access' ? 'no-access' : 'error', detail: stderr }
}

function main(argv) {
  let opts
  try {
    opts = parseOptions(argv)
  } catch (e) {
    console.error(e.message)
    return 2
  }
  if (opts.help) {
    console.log(USAGE)
    return 0
  }

  const dest = resolve(opts.dest ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const repos = selectRepos(REPOS, opts)
  console.log(`落地目录: ${dest}`)
  console.log(`本次尝试 ${repos.length} 个仓${opts.includePrivate ? '(含私有仓)' : '(仅公开仓,私有仓加 --include-private)'}\n`)

  const tally = { cloned: [], exists: [], 'no-access': [], error: [] }
  for (const repo of repos) {
    const { state, detail } = cloneOne(repo, dest, opts.depth)
    tally[state].push(repo.name)
    if (state === 'cloned') console.log(`✅ ${repo.name} —— 已 clone`)
    else if (state === 'exists') console.log(`⏭️  ${repo.name} —— 已存在,跳过`)
    else if (state === 'no-access') console.log(`🔒 ${repo.name} —— 跳过(无权限,${repo.visibility === 'private' ? '私有仓' : '仓不可见'})`)
    else console.error(`❌ ${repo.name} —— 失败: ${detail}`)
  }

  console.log(`\n汇总: 新 clone ${tally.cloned.length} / 已存在 ${tally.exists.length} / 无权限跳过 ${tally['no-access'].length} / 失败 ${tally.error.length}`)
  if (tally['no-access'].length && !opts.includePrivate) {
    console.log('无权限的都是私有仓,外部开发者不需要它们:SDK 经 NuGet 包分发。')
  }
  if (tally.error.length) {
    console.error(`真实故障(非权限问题): ${tally.error.join(', ')}`)
    return 1
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
