/**
 * C# MVP host websocket client (subprotocol lumio.mvp.v0 + exact-byte token + base64url nonce).
 * FullGraphComposition MaxConnections/MaxSessions are 128 (101-entity slice).
 * Handshake uses HTTP Upgrade so a capacity 503 is the measured error, not a
 * WebSocket error string that may omit the code.
 */
import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { base64UrlEncode } from './bot-credential.mjs'

export const MVP_SUBPROTOCOL = 'lumio.mvp.v0'
export const FULLGRAPH_MAX_CONNECTIONS = 128
export const FULLGRAPH_MAX_SESSIONS = 128
export const FULLGRAPH_LIMIT_FILE = 'LumioServer/mvp-host/src/Lumio.Server.MvpHost.App/FullGraphComposition.cs'
export const FULLGRAPH_LIMIT_LINE = 34
export const FULLGRAPH_SESSIONS_LINE = 35

function handshakeErrorInfo(err) {
  const message = String(err?.message ?? err ?? '')
  const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/)
  const status = statusMatch ? Number(statusMatch[1]) : null
  return { message, status }
}

export function isCapacityReject(info) {
  return info.status === 503
    || /503|service unavailable|capacity|maxconnection|max.?session/i.test(info.message)
}

export function fullGraphBlocked({ error, atConnection, httpStatus, live, extra } = {}) {
  return {
    status: 'BLOCKED',
    constant: `MaxConnections = ${FULLGRAPH_MAX_CONNECTIONS} / MaxSessions = ${FULLGRAPH_MAX_SESSIONS}`,
    file: FULLGRAPH_LIMIT_FILE,
    line: FULLGRAPH_LIMIT_LINE,
    lineSessions: FULLGRAPH_SESSIONS_LINE,
    error: error ?? null,
    atConnection: atConnection ?? null,
    httpStatus: httpStatus ?? null,
    live: live ?? null,
    desired: 101,
    ...extra,
  }
}

export async function connectMvpHost(listenUri, tokenBytes, { nonce, timeoutMs = 10000 } = {}) {
  const n = nonce ?? base64UrlEncode(randomBytes(16))
  const url = new URL(listenUri)
  const key = randomBytes(16).toString('base64')
  const protocols = [MVP_SUBPROTOCOL, base64UrlEncode(Buffer.from(tokenBytes)), n]
  return await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: `${url.pathname || '/'}${url.search}`,
      method: 'GET',
      headers: {
        Host: url.host,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Protocol': protocols.join(', '),
      },
    })
    const timer = setTimeout(() => {
      try { req.destroy() } catch { /* ignore */ }
      reject(Object.assign(new Error(`mvp-host connect timeout (${timeoutMs}ms)`), { status: null }))
    }, timeoutMs)
    req.on('upgrade', (res, socket) => {
      clearTimeout(timer)
      socket.on('error', () => { /* hold reservation until closeQuietly */ })
      resolve({
        ws: socket,
        socket,
        nonce: n,
        protocol: res.headers['sec-websocket-protocol'] ?? MVP_SUBPROTOCOL,
        status: 101,
      })
    })
    req.on('response', (res) => {
      clearTimeout(timer)
      const status = res.statusCode ?? null
      const chunks = []
      res.on('data', (c) => { if (chunks.length < 8) chunks.push(c) })
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').slice(0, 400)
        const message = `mvp-host HTTP ${status}${body ? `: ${body.split('\n')[0]}` : ''}`
        const wrapped = new Error(message)
        wrapped.status = status
        wrapped.capacity = isCapacityReject({ message, status })
        wrapped.body = body
        try { res.resume(); res.destroy() } catch { /* ignore */ }
        reject(wrapped)
      })
    })
    req.on('error', (err) => {
      clearTimeout(timer)
      const info = handshakeErrorInfo(err)
      const wrapped = new Error(info.message)
      wrapped.status = info.status
      wrapped.capacity = isCapacityReject(info)
      reject(wrapped)
    })
    req.end()
  })
}

export async function closeQuietly(ws) {
  if (!ws) return
  try {
    if (typeof ws.close === 'function' && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING || ws.readyState === undefined)) {
      ws.close()
      return
    }
    if (typeof ws.destroy === 'function') ws.destroy()
    else if (typeof ws.end === 'function') ws.end()
  } catch { /* ignore */ }
}
