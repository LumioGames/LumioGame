// node --test clone-all.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { REPOS, selectRepos, classifyFailure, parseOptions } from './clone-all.mjs'

test('manifest 至少含 LumioSample，且第一个公开仓就是它', () => {
  const publics = REPOS.filter((r) => r.visibility === 'public')
  assert.ok(publics.length > 0)
  assert.equal(publics[0].name, 'LumioSample')
  assert.ok(REPOS.every((r) => ['public', 'private'].includes(r.visibility)))
  assert.ok(REPOS.every((r) => typeof r.summary === 'string' && r.summary.length > 0))
})

test('默认只选公开仓；--include-private 才带上私仓', () => {
  const def = selectRepos(REPOS, { includePrivate: false })
  assert.ok(def.every((r) => r.visibility === 'public'))
  const all = selectRepos(REPOS, { includePrivate: true })
  assert.equal(all.length, REPOS.length)
})

test('无权限的失败被判为「跳过」而不是「错误」', () => {
  const noAccess = [
    "remote: Repository not found.\nfatal: repository 'https://github.com/LumioGames/LumioServer.git/' not found",
    'fatal: could not read Username for https://github.com: terminal prompts disabled',
    'remote: Invalid username or password.\nfatal: Authentication failed for https://github.com/LumioGames/LumioClient.git/',
    'The requested URL returned error: 403',
  ]
  for (const stderr of noAccess) {
    assert.equal(classifyFailure(stderr), 'no-access', stderr)
  }
})

test('真实故障不被伪装成「跳过」', () => {
  const real = [
    'fatal: unable to access: Could not resolve host: github.com',
    'error: unable to write file: No space left on device',
    'fatal: destination path already exists and is not an empty directory.',
  ]
  for (const stderr of real) {
    assert.equal(classifyFailure(stderr), 'error', stderr)
  }
})

test('parseOptions 解析开关与目标目录', () => {
  assert.equal(parseOptions([]).includePrivate, false)
  assert.equal(parseOptions(['--include-private']).includePrivate, true)
  assert.equal(parseOptions(['--dest', '/tmp/x']).dest, '/tmp/x')
  assert.equal(parseOptions(['--depth', '1']).depth, 1)
  assert.equal(parseOptions(['--help']).help, true)
})
