// Browser chat-window presentation for the R-00354 harness.
// Chat-window contents are client-only; they are never restored from Snapshot.
// Wire field names follow architecture gameplay-command-envelope-v1.json (chat.event).

export function createChatWindow() {
  return { lines: [] }
}

export function applyFullSnapshot(window) {
  window.lines = []
}

export function appendAcceptedEvent(window, event) {
  if (!isEvent(event)) return false
  const last = window.lines.length === 0 ? null : window.lines[window.lines.length - 1]
  if (last !== null && (event.roomSequence <= last.roomSequence || event.messageId <= last.messageId)) {
    return false
  }
  window.lines = window.lines.concat([
    Object.freeze({
      messageId: event.messageId,
      roomSequence: event.roomSequence,
      senderNetEntityId: String(event.senderNetEntityId),
      text: event.text,
      appliedTick: event.appliedTick,
    }),
  ])
  return true
}

export function formatLine(event) {
  return `${event.senderNetEntityId}: ${event.text}`
}

export function hexToBytes(hex) {
  const raw = String(hex ?? '')
  if (raw.length === 0 || raw.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(raw)) return null
  const bytes = new Uint8Array(raw.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function readU64LE(view, offset) {
  return view.getBigUint64(offset, true)
}

function u64ToHex16(value) {
  if (typeof value === 'bigint') {
    if (value < 0n || value > 0xffffffffffffffffn) {
      throw new RangeError('u64 out of range')
    }
    return value.toString(16).padStart(16, '0')
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value).toString(16).padStart(16, '0')
  }
  if (typeof value === 'string' && /^(0x)?[0-9a-f]+$/i.test(value)) {
    const n = BigInt(value)
    if (n < 0n || n > 0xffffffffffffffffn) {
      throw new RangeError('u64 out of range')
    }
    return n.toString(16).padStart(16, '0')
  }
  throw new TypeError('u64 requires BigInt, safe integer, or hex string')
}

function u64ToJsonNumber(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value
}

/** Canonical 32-hex sender = instanceId u64 || counter u64 (C-1′ / C-2). Not a u128 primitive. */
export function encodeSenderHex(instanceId, counter) {
  return (u64ToHex16(instanceId) + u64ToHex16(counter)).toLowerCase()
}

/** Decode C-1′ chat.event LumioBinV1 payload (two u64 sender halves). */
export function decodeChatEventPayload(hex) {
  const bytes = hexToBytes(hex)
  if (!bytes || bytes.length < 8 * 5 + 4) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  const messageId = readU64LE(view, offset)
  offset += 8
  const roomSequence = readU64LE(view, offset)
  offset += 8
  const instanceId = readU64LE(view, offset)
  offset += 8
  const counter = readU64LE(view, offset)
  offset += 8
  if (offset + 4 > bytes.length) return null
  const textLen = view.getUint32(offset, true)
  offset += 4
  if (offset + textLen + 8 > bytes.length) return null
  const text = new TextDecoder().decode(bytes.subarray(offset, offset + textLen))
  offset += textLen
  const appliedTick = readU64LE(view, offset)
  return {
    messageId: u64ToJsonNumber(messageId),
    roomSequence: u64ToJsonNumber(roomSequence),
    senderNetEntityId: encodeSenderHex(instanceId, counter),
    senderNetEntityIdInstanceId: instanceId,
    senderNetEntityIdCounter: counter,
    text,
    appliedTick: u64ToJsonNumber(appliedTick),
  }
}

export function extractChatEventsFromFrame(frame) {
  if (frame == null) return []
  let parsed = frame
  if (typeof frame === 'string') {
    try { parsed = JSON.parse(frame) } catch { return [] }
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  if (parsed.messageType === 'FullSnapshot') return []
  if (parsed.messageType === 'ConnectionSuperseded') return []
  const blocks = parsed.messageType === 'Delta'
    ? (Array.isArray(parsed.changedBlocks) ? parsed.changedBlocks : [])
    : (parsed.mappingId === 'chat.event' ? [parsed] : [])
  const events = []
  for (const block of blocks) {
    if (!block || block.mappingId !== 'chat.event') continue
    const event = decodeChatEventPayload(block.payload)
    if (event) events.push(event)
  }
  if (parsed.messageType === 'chat.event' || (parsed.roomSequence != null && parsed.appliedTick != null && parsed.text != null && parsed.mappingId == null && parsed.messageType == null)) {
    const sender = decodeSenderRecord(parsed)
    if (isEvent({ ...parsed, senderNetEntityId: sender ?? parsed.senderNetEntityId })) {
      events.push({
        messageId: parsed.messageId,
        roomSequence: parsed.roomSequence,
        senderNetEntityId: sender ?? String(parsed.senderNetEntityId),
        text: parsed.text,
        appliedTick: parsed.appliedTick,
      })
    }
  }
  return events
}

function decodeSenderRecord(rec) {
  if (rec == null || typeof rec !== 'object') return null
  if (typeof rec.senderNetEntityId === 'string' && /^[0-9a-f]{32}$/i.test(rec.senderNetEntityId)) {
    return rec.senderNetEntityId.toLowerCase()
  }
  if (rec.senderNetEntityIdInstanceId != null && rec.senderNetEntityIdCounter != null) {
    return encodeSenderHex(rec.senderNetEntityIdInstanceId, rec.senderNetEntityIdCounter)
  }
  return null
}

function isEvent(event) {
  return event !== null
    && typeof event === 'object'
    && typeof event.messageId === 'number'
    && typeof event.roomSequence === 'number'
    && event.senderNetEntityId !== undefined
    && typeof event.text === 'string'
    && typeof event.appliedTick === 'number'
}
