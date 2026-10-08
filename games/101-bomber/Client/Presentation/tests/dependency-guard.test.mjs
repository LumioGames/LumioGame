import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('production presentation imports only local display code and installed packages', () => {
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { visit(path); continue }
      if (!/\.(?:ts|css)$/.test(path)) continue
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/(?:from\s*|import\s*|import\s*\()(['"])([^'"]+)\1/g)) {
        assert.doesNotMatch(match[2], /(?:^|\/)(?:prototype|sim|bots|local-host|app)(?:\/|$)/, path)
        assert.doesNotMatch(match[2], /(?:^|\/)input\//, path)
      }
    }
  }
  visit(fileURLToPath(new URL('../src/', import.meta.url)))
})
