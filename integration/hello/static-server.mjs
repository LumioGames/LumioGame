#!/usr/bin/env node
/**
 * static-server — Hello World 集成用的最小静态文件服务(node:http,零依赖)。
 *
 * 用法:node static-server.mjs --root <目录> --port 0 --ready-file <json路径>
 * 行为(与 MS-00002 契约 process 节的静态服务约定一致):
 *   - 监听 127.0.0.1 动态端口(--port 0 交给 OS 分配,禁止硬编码端口);
 *   - 就绪后向 --ready-file 写 {"port":N},并在 stdout 输出单行 `STATIC_READY {"port":N}`
 *     (stdout 只允许这一行,访问日志/错误一律走 stderr,避免污染机器可读通道);
 *   - stdin 收到 `shutdown` 行,或 SIGINT/SIGTERM → 优雅关闭并退出码 0;
 *   - 仅服务 --root 之下的文件,越界路径一律 403。
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { createInterface } from 'node:readline'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq)
    const value = eq === -1 ? argv[i + 1] : a.slice(eq + 1)
    if (value === undefined || value.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = value
      if (eq === -1) i++
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const root = args.root ? resolve(String(args.root)) : null
const port = Number(args.port ?? 0)
const readyFile = args['ready-file'] ? resolve(String(args['ready-file'])) : null

if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  process.stderr.write(`参数错误:--root 必须指向存在的目录(得到 ${root})\n`)
  process.exit(3)
}
if (!readyFile) {
  process.stderr.write('参数错误:缺少 --ready-file <json路径>\n')
  process.exit(3)
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`参数错误:--port 必须是 0-65535 整数(得到 ${args.port})\n`)
  process.exit(3)
}
mkdirSync(dirname(readyFile), { recursive: true })

let shuttingDown = false
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' }).end('method not allowed\n')
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
  } catch {
    res.writeHead(400).end('bad url\n')
    return
  }
  if (pathname.endsWith('/')) pathname += 'index.html'
  const sep = process.platform === 'win32' ? '\\' : '/'
  const target = normalize(join(root, pathname))
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end('forbidden\n')
    return
  }
  let st
  try {
    st = statSync(target)
  } catch {
    res.writeHead(404).end('not found\n')
    return
  }
  if (!st.isFile()) {
    res.writeHead(404).end('not found\n')
    return
  }
  const headers = {
    'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-store',
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(target).on('error', () => {
    res.destroy()
  }).pipe(res)
})

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  // close() 只等 keep-alive 连接排空;超时兜底仍以 0 退出(优雅关闭语义已达)
  const force = setTimeout(() => process.exit(code), 3000)
  force.unref()
  server.close(() => process.exit(code))
}

server.on('error', (err) => {
  process.stderr.write(`static-server 致命错误: ${err.message}\n`)
  process.exit(2)
})

server.listen(port, '127.0.0.1', () => {
  const actual = server.address().port
  writeFileSync(readyFile, JSON.stringify({ port: actual }) + '\n')
  process.stdout.write(`STATIC_READY ${JSON.stringify({ port: actual })}\n`)
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (String(line).trim() === 'shutdown') shutdown(0)
  })
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
