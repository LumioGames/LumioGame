import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 接缝守卫：表现层（view / hud / input / audio / present）与 Bot 只能依赖 contract / shared / present，
 * 不得 import 规则替身 sim/。只有 app/local-host.ts 与 sim 自己的测试可以碰 sim。
 * 将来换成引擎 Replica 时，删掉 sim/ 与 local-host 不应让任何其他文件编译失败。
 */
const SRC = join(import.meta.dirname, '..', 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

describe('module boundaries', () => {
  const files = walk(SRC)

  it('only app/local-host.ts (and sim itself) imports sim/', () => {
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(SRC, f).split(sep).join('/')
      if (rel.startsWith('sim/') || rel === 'app/local-host.ts') continue
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? ''
        if (/(^|\/)sim(\/|$)/.test(spec)) offenders.push(`${rel} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('contract/ imports nothing outside contract/', () => {
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(SRC, f).split(sep).join('/')
      if (!rel.startsWith('contract/')) continue
      for (const m of readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? ''
        if (!spec.startsWith('./')) offenders.push(`${rel} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('bots/ depends only on contract/ and shared/', () => {
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(SRC, f).split(sep).join('/')
      if (!rel.startsWith('bots/')) continue
      for (const m of readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? ''
        if (spec.startsWith('.') && !/^\.\.\/(contract|shared)(\/|$)|^\.\//.test(spec)) offenders.push(`${rel} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
