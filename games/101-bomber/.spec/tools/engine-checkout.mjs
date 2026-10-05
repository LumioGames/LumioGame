/**
 * Finds the LumioGameEngine checkout that holds the ADR-115 directory contract
 * (`.spec/tools/repo-layout.json`), names that checkout's HEAD, and runs its `repoLayoutCheck`
 * (repository-layout.md §6, R-00700).
 *
 * Lookup, repository-layout.md §6「判定口径」item 5: a non-empty LUMIO_ENGINE_ROOT is the only
 * candidate when set. If it holds no repo-layout.json that is BLOCKED_ENV, never a quiet fall-back
 * to a sibling checkout on whatever branch it happens to be (R-00709, R-00739). Unset, the
 * same-suffix worktree (`LumioX-y` → `LumioGameEngine-y`) comes first, then the sibling main
 * checkout. Nothing found is BLOCKED_ENV too, never silently passed. Every run names the JSON it
 * used and that checkout's HEAD on stderr, so a pass says what it passed against; a directory that
 * is not itself the top level of a git work tree has no HEAD to name (R-00739).
 *
 * One text, five places. The authority is LumioGameEngine/.spec/tools/engine-checkout.mjs, and the
 * architecture repository's own `resolveLayout` uses `engineCheckout` from it. This file is what
 * finds the architecture checkout, so the other repositories cannot import it from there:
 * LumioServer, LumioGameRuntime, LumioClient and LumioBomber each carry a byte-identical copy at
 * the same path. Change the authority first, then all four copies together. Each of those
 * repositories' lint-extensions.test.mjs compares its copy with the file in the checkout the copy
 * itself finds, and fails on any difference (R-00739). LumioClient's C# architecture test
 * (`RepoLayoutContract.Locate`) follows the same lookup rule.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const ENGINE_REPO = 'LumioGameEngine'
export const LAYOUT_JSON = join('.spec', 'tools', 'repo-layout.json')
const ENGINE_EXTENSION = join('.spec', 'tools', 'lint-extensions.mjs')

/**
 * `{ base }` when a checkout is found, `{ invalid }` (a BLOCKED_ENV message) when an explicit
 * LUMIO_ENGINE_ROOT holds no repo-layout.json, `{}` when nothing is found.
 */
export function engineCheckout(root, env = process.env.LUMIO_ENGINE_ROOT) {
  if (env) {
    const base = resolve(env)
    return existsSync(join(base, LAYOUT_JSON))
      ? { base }
      : { invalid: `BLOCKED_ENV:LUMIO_ENGINE_ROOT=${env} 下没有 ${LAYOUT_JSON}——显式指定的检出无效,不回落到同级检出;修正或清空该变量` }
  }
  const parent = dirname(root)
  const name = basename(root)
  const dash = name.indexOf('-')
  const base = [
    ...(dash > 0 ? [join(parent, ENGINE_REPO + name.slice(dash))] : []),
    join(parent, ENGINE_REPO),
  ].find(candidate => existsSync(join(candidate, LAYOUT_JSON)))
  return base ? { base } : {}
}

/** Symlinks resolved (macOS /tmp → /private/tmp) and, on Windows, case folded. */
function canonical(path) {
  let real
  try { real = realpathSync.native(path) } catch { real = resolve(path) }
  return process.platform === 'win32' ? real.toLowerCase() : real
}

/**
 * HEAD of `base`, only when `base` is itself the top level of a git work tree. `git -C base
 * rev-parse HEAD` alone walks up from `base`: an archive unpacked under some other work tree
 * (`.build/`, `.run/`) would report the outer repository's HEAD as LumioGameEngine's (R-00739).
 */
export function checkoutHead(base) {
  const git = (...args) => spawnSync('git', ['-C', base, ...args], { encoding: 'utf8' })
  const top = git('rev-parse', '--show-toplevel')
  if (top.status !== 0 || canonical(top.stdout.trim()) !== canonical(base)) return 'unknown (not a git checkout)'
  const head = git('rev-parse', 'HEAD')
  return head.status === 0 ? head.stdout.trim() : 'unknown (no commit)'
}

/**
 * The `lumio-repo-layout` check for a repository that keeps no implementation of it: find the
 * architecture checkout, say which one, then run that checkout's `repoLayoutCheck`.
 */
export const delegatedRepoLayoutCheck = {
  id: 'lumio-repo-layout',
  async run(ctx) {
    // Only decides "skip vs BLOCKED_ENV" when no checkout is found; with one, the imported
    // check does the real identification (checkout name → repos / appliesTo / outOfScope key).
    if (!basename(ctx.root).startsWith('Lumio')) return { skipped: `${basename(ctx.root)} 不是 Lumio 仓检出,ADR-115 目录契约不适用` }
    const { base, invalid } = engineCheckout(ctx.root)
    if (invalid) {
      ctx.report(join(ctx.root, LAYOUT_JSON), invalid)
      return undefined
    }
    if (!base) {
      ctx.report(join(ctx.root, LAYOUT_JSON), `BLOCKED_ENV:同级 ${ENGINE_REPO} checkout 缺失,读不到 ${LAYOUT_JSON} 与目录契约检查——放一个同级检出或设 LUMIO_ENGINE_ROOT;不静默通过`)
      return undefined
    }
    // stderr, not stdout: `--json` owns stdout.
    process.stderr.write(`lumio-repo-layout: ${join(base, LAYOUT_JSON)} @ ${ENGINE_REPO} HEAD ${checkoutHead(base)}\n`)
    const { repoLayoutCheck } = await import(pathToFileURL(join(base, ENGINE_EXTENSION)).href)
    if (typeof repoLayoutCheck?.run !== 'function') {
      ctx.report(join(base, ENGINE_EXTENSION), `BLOCKED_ENV:${base} 早于 R-00700,没有导出 repoLayoutCheck——把该检出更新到 origin/main;本仓不留回落实现`)
      return undefined
    }
    return repoLayoutCheck.run(ctx)
  },
}
