/**
 * LumioBomber extensions for Workflow spec-lint, API 1 (Engine ADR-089).
 * Generic frontmatter, navigation, ADR indexing, links, imports, skills and
 * fingerprints belong to the plugin. This repo additionally requires CLAUDE.md
 * and both host discovery paths whenever project skills exist. The ADR-115
 * directory contract check is imported from a LumioGameEngine checkout (see below).
 * Run: node .spec/tools/lint-extensions.mjs [root] [--strict] [--json]
 */
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { delegatedRepoLayoutCheck } from './engine-checkout.mjs'

export const api = 1
export const config = {
  frontmatterDirs: ['knowledge/features', 'knowledge/standards'],
  statusEnum: ['设计中', '实施中', '已交付', '历史归档'],
}

const normalize = path => process.platform === 'win32' ? path.toLowerCase() : path
export const checks = [{
  id: 'lumio-host-entrypoints',
  run({ root, spec, report }) {
    const claude = join(root, 'CLAUDE.md')
    if (!existsSync(claude)) report(claude, '缺核心文件:CLAUDE.md(强制载入入口)')
    if (!existsSync(join(spec, 'skills'))) return
    for (const rel of ['.claude/skills', '.agents/skills']) {
      const path = join(root, rel)
      try {
        // The plugin checks symlinks; ordinary paths need the same containment rule.
        if (lstatSync(path).isSymbolicLink()) continue
        const target = normalize(realpathSync(path))
        const base = normalize(realpathSync(spec))
        if (target !== base && !target.startsWith(base + sep)) {
          report(path, `发现路径未解析进 .spec/:${target}`)
        }
      } catch { report(path, '软链接缺失(宿主自动发现依赖它)') }
    }
  },
}]

/**
 * ADR-115 directory contract. This repository keeps **no implementation** of it: the only JS
 * implementation is `repoLayoutCheck`, exported by the architecture repository's
 * `.spec/tools/lint-extensions.mjs` (repository-layout.md §6, R-00700). `./engine-checkout.mjs`
 * finds that checkout (an explicit LUMIO_ENGINE_ROOT that holds no repo-layout.json is BLOCKED_ENV,
 * never a fall-back to a sibling checkout), names the JSON and HEAD it used on stderr, and
 * delegates to it. That file is a byte-identical copy of the architecture repository's authority,
 * carried by LumioServer, LumioGameRuntime, LumioClient and LumioBomber alike: change the authority
 * and all four copies together. lint-extensions.test.mjs fails when this copy differs from the
 * authority it finds (R-00719, R-00739).
 */
checks.push(delegatedRepoLayoutCheck)

// Preserve the former CLI without executing it when the plugin imports us.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { runLintCli } = await import('../../eng/spec-lint.mjs')
  runLintCli(process.argv.slice(2))
}
