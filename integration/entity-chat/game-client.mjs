/**
 * C# MVP host websocket client (subprotocol lumio.mvp.v0 + exact-byte token + base64url nonce).
 * FullGraphComposition MaxConnections/MaxSessions are 64; the 65th upgrade is expected
 * to fail with HTTP 503 (WebSocketByteCarrier.TryReserveConnection).
 */
import { randomBytes } from 'node:crypto'
import { base64UrlEncode } from './bot-credential.mjs'

export const MVP_SUBPROTOCOL = 'lumio.mvp.v0'
export const FULLGRAPH_MAX_CONNECTIONS = 64
export const FULLGRAPH_MAX_SESSIONS = 64
export const FULLGRAPH_LIMIT_FILE = 'LumioServer/mvp-host/src/Lumio.Server.MvpHost.App/FullGraphComposition.cs'
export const FULLGRAPH_LIMIT_LINE = 30

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

export async function connectMvpHost(listenUri, tokenBytes, { nonce, timeoutMs = 10000 } = {}) {
  const n = nonce ?? base64UrlEncode(randomBytes(16))
  const protocols = [MVP_SUBPROTOCOL, base64UrlEncode(tokenBytes), n]
  const ws = new WebSocket(listenUri, protocols)
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      reject(Object.assign(new Error(`mvp-host connect timeout (${timeoutMs}ms)`), { status: null }))
    }, timeoutMs)
    ws.addEventListener('error', (err) => {
      clearTimeout(timer)
      const info = handshakeErrorInfo(err)
      const wrapped = new Error(info.message)
      wrapped.status = info.status
      wrapped.capacity = isCapacityReject(info)
      try { ws.close() } catch { /* ignore */ }
      reject(wrapped)
    })
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve({ ws, nonce: n, protocol: ws.protocol })
    })
  })
}

export async function closeQuietly(ws) {
  if (!ws) return
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  } catch { /* ignore */ }
}
