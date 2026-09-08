// node --test clone-all.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { REPOS, selectRepos, classifyFailure, parseOptions, main } from './clone-all.mjs'

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

test('本地文件系统故障不得被判成「无权限跳过」', () => {
  const localFailures = [
    // git 在建工作树目录时就失败,措辞里同样带 permission denied——这正是 B-00068 的现场
    "fatal: could not create work tree dir 'LumioSample': Permission denied",
    "fatal: could not create directory '/mnt/ro/LumioGame': Permission denied",
    'fatal: unable to write file: No space left on device',
    "error: could not write config file '.git/config': ENOSPC: no space left on device",
    "fatal: could not create work tree dir 'LumioConfig': Read-only file system",
    "error: EACCES: permission denied, mkdir '/mnt/ro/LumioConfig'",
  ]
  for (const stderr of localFailures) {
    assert.equal(classifyFailure(stderr), 'error', stderr)
  }
})

test('磁盘不可写时整体退出码非 0,且不打印「跳过」', () => {
  const out = []
  const code = main(['--dest', '/nonexistent-dest-for-test'], {
    run: () => ({
      status: 128,
      stderr: "fatal: could not create work tree dir 'LumioSample': Permission denied",
    }),
    log: (line) => out.push(line),
    error: (line) => out.push(line),
  })
  const text = out.join('\n')
  assert.notEqual(code, 0)
  assert.ok(!text.includes('跳过(无权限'), text)
  assert.ok(text.includes('失败'), text)
})

test('公开仓被判无权限时不得打印「私有仓」措辞', () => {
  const out = []
  main(['--dest', '/nonexistent-dest-for-test'], {
    run: () => ({ status: 128, stderr: 'remote: Repository not found.' }),
    log: (line) => out.push(line),
    error: (line) => out.push(line),
  })
  const text = out.join('\n')
  assert.ok(text.includes('跳过(无权限'), text)
  // 只查会把公开仓说成私有仓的两处措辞;用法提示行里的「私有仓」是正常的。
  assert.ok(!text.includes('跳过(无权限,私有仓)'), text)
  assert.ok(!text.includes('无权限的都是私有仓'), text)
})

test('私有仓被判无权限时,原有「私有仓」措辞与 0 退出码不变', () => {
  const out = []
  const code = main(['--include-private', '--dest', '/nonexistent-dest-for-test'], {
    run: (args) => {
      const isPrivate = REPOS.some(
        (r) => r.visibility === 'private' && args.some((a) => a.includes(`/${r.name}.git`)),
      )
      return isPrivate
        ? { status: 128, stderr: 'remote: Repository not found.' }
        : { status: 0, stderr: '' }
    },
    log: (line) => out.push(line),
    error: (line) => out.push(line),
  })
  const text = out.join('\n')
  assert.equal(code, 0)
  assert.ok(text.includes('跳过(无权限,私有仓)'), text)
})

test('公开仓被判无权限时以非 0 退出——一个仓都没拉到不算成功', () => {
  const out = []
  const code = main(['--dest', '/nonexistent-dest-for-test'], {
    // 企业代理 / GitHub 侧对公开仓也返回 403 的场景
    run: () => ({ status: 128, stderr: 'The requested URL returned error: 403' }),
    log: (line) => out.push(line),
    error: (line) => out.push(line),
  })
  assert.notEqual(code, 0)
  assert.ok(out.join('\n').includes('公开仓被判无权限'), out.join('\n'))
})

test('只有私有仓被跳过时仍以 0 退出——外部开发者默认路径不受影响', () => {
  const out = []
  const code = main(['--include-private', '--dest', '/nonexistent-dest-for-test'], {
    run: (args) => {
      const isPrivate = REPOS.some(
        (r) => r.visibility === 'private' && args.some((a) => a.includes(`/${r.name}.git`)),
      )
      return isPrivate
        ? { status: 128, stderr: 'remote: Repository not found.' }
        : { status: 0, stderr: '' }
    },
    log: (line) => out.push(line),
    error: (line) => out.push(line),
  })
  assert.equal(code, 0)
})
