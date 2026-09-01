/**
 * C# MVP host websocket client (subprotocol lumio.mvp.v0 + exact-byte token + base64url nonce).
 * FullGraphComposition MaxConnections/MaxSessions are 128 (101-entity slice).
 * HTTP Upgrade is measured as 101/503; RoomAdmissionRegistry.Admit only runs after
 * the client Handshake envelope (same writer SmokeClient uses).
 */
import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'
import { base64UrlEncode } from './bot-credential.mjs'

export const MVP_SUBPROTOCOL = 'lumio.mvp.v0'
export const MVP_PRODUCT_ID = 'A'
export const MVP_GAME_RELEASE_ID = 'A-1.1.0'
export const MVP_MAX_MESSAGE_BYTES = 65536
export const MVP_MAX_FRAGMENT_BYTES = 4096
export const MVP_ANTI_REPLAY_WINDOW = 1024
export const FULLGRAPH_MAX_CONNECTIONS = 128
export const FULLGRAPH_MAX_SESSIONS = 128
export const FULLGRAPH_LIMIT_FILE = 'LumioServer/mvp-host/src/Lumio.Server.MvpHost.App/FullGraphComposition.cs'
export const FULLGRAPH_LIMIT_LINE = 34
export const FULLGRAPH_SESSIONS_LINE = 35

const WS_STATE = Symbol('lumio.mvp.ws')

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

/** Envelope sessionId must match common.schema.json `$defs/id`. Prefer stable loginName so two rounds compare. */
export function mvpSessionId(accountId, loginName) {
  if (typeof loginName === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(loginName)) {
    return `sess-${loginName}`
  }
  const raw = String(accountId || loginName || '')
  const sanitized = raw.replace(/[^A-Za-z0-9._:-]/g, '-').replace(/^[^A-Za-z0-9]+/, 's')
  if (sanitized.length === 0) throw new Error('mvp sessionId is empty')
  return sanitized.slice(0, 128)
}

export function writeClientHandshake({
  sessionId,
  sequence = 1,
  productId = MVP_PRODUCT_ID,
  gameReleaseId = MVP_GAME_RELEASE_ID,
  traceId,
  maxMessageBytes = MVP_MAX_MESSAGE_BYTES,
} = {}) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('client Handshake requires sessionId')
  }
  const envelope = {
    protocolVersion: 1,
    length: maxMessageBytes,
    sequence,
    sessionId,
    productId,
    gameReleaseId,
    messageType: 'Handshake',
    reliability: 'Reliable',
    integrity: { algorithm: 'None', value: 'none' },
    traceId: traceId ?? `trace-entity-chat-${sequence}`,
    transportPolicy: {
      maxMessageBytes,
      maxFragmentBytes: MVP_MAX_FRAGMENT_BYTES,
      antiReplayWindow: MVP_ANTI_REPLAY_WINDOW,
      authBinding: 'SessionAdmission',
      errorClass: 'Rejectable',
    },
    body: { role: 'Client' },
  }
  return Buffer.from(JSON.stringify(envelope), 'utf8')
}

export function encodeWsTextFrame(payload, { masked = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')
  const len = data.length
  const mask = masked ? randomBytes(4) : null
  let header
  if (len < 126) {
    header = Buffer.alloc(masked ? 6 : 2)
    header[0] = 0x81
    header[1] = (masked ? 0x80 : 0) | len
    if (mask) mask.copy(header, 2)
  } else if (len < 65536) {
    header = Buffer.alloc(masked ? 8 : 4)
    header[0] = 0x81
    header[1] = (masked ? 0x80 : 0) | 126
    header.writeUInt16BE(len, 2)
    if (mask) mask.copy(header, 4)
  } else {
    header = Buffer.alloc(masked ? 14 : 10)
    header[0] = 0x81
    header[1] = (masked ? 0x80 : 0) | 127
    header.writeBigUInt64BE(BigInt(len), 2)
    if (mask) mask.copy(header, 10)
  }
  if (!mask) return Buffer.concat([header, data])
  const body = Buffer.alloc(len)
  for (let i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3]
  return Buffer.concat([header, body])
}

function encodeWsControlFrame(opcode, payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  if (data.length > 125) throw new Error('ws control frame too long')
  const mask = randomBytes(4)
  const header = Buffer.alloc(6)
  header[0] = 0x80 | (opcode & 0x0f)
  header[1] = 0x80 | data.length
  mask.copy(header, 2)
  const body = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) body[i] = data[i] ^ mask[i & 3]
  return Buffer.concat([header, body])
}

export function readWsFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return null
  const fin = (buffer[0] & 0x80) !== 0
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  let len = buffer[1] & 0x7f
  let offset = 2
  if (len === 126) {
    if (buffer.length < 4) return null
    len = buffer.readUInt16BE(2)
    offset = 4
  } else if (len === 127) {
    if (buffer.length < 10) return null
    const big = buffer.readBigUInt64BE(2)
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ws frame too large')
    len = Number(big)
    offset = 10
  }
  if (masked) offset += 4
  if (buffer.length < offset + len) return null
  let payload = buffer.subarray(offset, offset + len)
  if (masked) {
    const mask = buffer.subarray(offset - 4, offset)
    const decoded = Buffer.alloc(len)
    for (let i = 0; i < len; i++) decoded[i] = payload[i] ^ mask[i & 3]
    payload = decoded
  }
  return { fin, opcode, payload, rest: buffer.subarray(offset + len) }
}

function attachWsBuffer(socket, head) {
  if (socket[WS_STATE]) {
    if (head && head.length) {
      socket[WS_STATE].buf = Buffer.concat([socket[WS_STATE].buf, Buffer.from(head)])
    }
    pumpWs(socket)
    return socket[WS_STATE]
  }
  const state = {
    buf: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
    frames: [],
    waiters: [],
    closed: false,
    closeError: null,
  }
  socket[WS_STATE] = state
  socket.on('data', (chunk) => {
    state.buf = Buffer.concat([state.buf, chunk])
    pumpWs(socket)
  })
  socket.on('end', () => { state.closed = true; pumpWs(socket) })
  socket.on('close', () => { state.closed = true; pumpWs(socket) })
  socket.on('error', (err) => {
    state.closed = true
    state.closeError = err
    pumpWs(socket)
  })
  pumpWs(socket)
  return state
}

function pumpWs(socket) {
  const state = socket[WS_STATE]
  if (!state) return
  while (!state.closed) {
    let frame
    try {
      frame = readWsFrame(state.buf)
    } catch (err) {
      state.closed = true
      state.closeError = err
      break
    }
    if (!frame) break
    state.buf = frame.rest
    if (frame.opcode === 0x9) {
      try { socket.write(encodeWsControlFrame(0x0a, frame.payload)) } catch { /* ignore */ }
      continue
    }
    if (frame.opcode === 0x0a) continue
    if (frame.opcode === 0x8) {
      state.closed = true
      state.closeError = new Error('mvp-host websocket close')
      break
    }
    state.frames.push(frame)
  }
  while (state.waiters.length > 0 && (state.frames.length > 0 || state.closed)) {
    const waiter = state.waiters.shift()
    if (state.frames.length > 0) waiter.resolve(state.frames.shift())
    else waiter.reject(state.closeError ?? new Error('mvp-host websocket closed'))
  }
}

function recvWsFrame(socket, timeoutMs) {
  const state = attachWsBuffer(socket)
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve: (frame) => { clearTimeout(timer); resolve(frame) },
      reject: (err) => { clearTimeout(timer); reject(err) },
    }
    const timer = setTimeout(() => {
      const idx = state.waiters.indexOf(waiter)
      if (idx >= 0) state.waiters.splice(idx, 1)
      reject(new Error(`mvp-host websocket recv timeout (${timeoutMs}ms)`))
    }, timeoutMs)
    state.waiters.push(waiter)
    pumpWs(socket)
  })
}

async function recvWsMessage(socket, timeoutMs) {
  const fragments = []
  let opcode = 0
  const deadline = Date.now() + timeoutMs
  while (true) {
    const remain = Math.max(1, deadline - Date.now())
    const frame = await recvWsFrame(socket, remain)
    if (frame.opcode === 0x1 || frame.opcode === 0x2) {
      opcode = frame.opcode
      fragments.length = 0
      fragments.push(frame.payload)
    } else if (frame.opcode === 0x0) {
      fragments.push(frame.payload)
    } else {
      continue
    }
    if (frame.fin) {
      const payload = Buffer.concat(fragments)
      if (opcode === 0x1) return payload.toString('utf8')
      return payload
    }
  }
}

export async function recvWsJson(socket, timeoutMs = 10000) {
  const text = await recvWsMessage(socket, timeoutMs)
  const raw = Buffer.isBuffer(text) ? text.toString('utf8') : String(text)
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`mvp-host envelope is not JSON: ${err.message}`)
  }
}

export async function sendWsJson(socket, payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8')
  await new Promise((resolve, reject) => {
    socket.write(encodeWsTextFrame(bytes), (err) => (err ? reject(err) : resolve()))
  })
}

export async function completeMvpHandshake(socket, { sessionId, timeoutMs = 10000 } = {}) {
  attachWsBuffer(socket)
  const first = await recvWsJson(socket, timeoutMs)
  if (first?.messageType !== 'Handshake') {
    throw new Error(`expected server Handshake, got ${first?.messageType ?? typeof first}`)
  }
  await sendWsJson(socket, writeClientHandshake({ sessionId, sequence: 1 }))
  const second = await recvWsJson(socket, timeoutMs)
  if (second?.messageType === 'Error') {
    const code = second.body?.reasonCode ?? 'error'
    const err = new Error(`mvp-host handshake rejected: ${code}`)
    err.reasonCode = code
    throw err
  }
  if (second?.messageType !== 'FullSnapshot') {
    throw new Error(`expected FullSnapshot after Handshake, got ${second?.messageType ?? typeof second}`)
  }
  const boundSessionId = typeof second.sessionId === 'string' && second.sessionId.length > 0
    ? second.sessionId
    : sessionId
  return {
    sessionId: boundSessionId,
    serverHandshake: first,
    snapshot: second,
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
    req.on('upgrade', (res, socket, head) => {
      clearTimeout(timer)
      attachWsBuffer(socket, head)
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

const test = process.env.NODE_TEST_CONTEXT ? nodeTest : () => {}

test('mvpSessionId prefers stable loginName so two rounds share binding ids', () => {
  assert.equal(mvpSessionId('acct_0d7bbdd07af32db0e52e8952c23c9fd1', 'Bot01'), 'sess-Bot01')
  assert.equal(mvpSessionId('acct_x', 'Bot100'), 'sess-Bot100')
  assert.equal(mvpSessionId('acct_x', 'Browser01'), 'sess-Browser01')
  assert.match(mvpSessionId('acct_x', 'Bot01'), /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
})

test('client Handshake envelope is lumio.mvp.v0 role Client with sessionId', () => {
  const bytes = writeClientHandshake({ sessionId: 'acct-test-session', sequence: 1 })
  const env = JSON.parse(bytes.toString('utf8'))
  assert.equal(env.messageType, 'Handshake')
  assert.equal(env.body.role, 'Client')
  assert.equal(env.sessionId, 'acct-test-session')
  assert.equal(env.productId, MVP_PRODUCT_ID)
  assert.equal(env.gameReleaseId, MVP_GAME_RELEASE_ID)
  assert.equal(env.integrity.algorithm, 'None')
  assert.equal(env.integrity.value, 'none')
  assert.equal(env.transportPolicy.authBinding, 'SessionAdmission')
})

test('websocket text frames round-trip through masked encode and decode', () => {
  const payload = Buffer.from('{"messageType":"Handshake"}', 'utf8')
  const framed = encodeWsTextFrame(payload, { masked: true })
  const decoded = readWsFrame(framed)
  assert.equal(decoded.opcode, 0x1)
  assert.equal(decoded.fin, true)
  assert.equal(decoded.payload.toString('utf8'), payload.toString('utf8'))
  assert.equal(decoded.rest.length, 0)
})

