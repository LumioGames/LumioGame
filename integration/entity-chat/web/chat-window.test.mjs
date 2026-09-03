import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendAcceptedEvent,
  applyFullSnapshot,
  createChatWindow,
  decodeChatEventPayload,
  encodeSenderHex,
  extractChatEventsFromFrame,
  formatLine,
} from './chat-window.js'

const GG_EVENT_HEX = '01000000000000000100000000000000000000000000000065000000000000000200000067670700000000000000'
const GG_SENDER = '00000000000000000000000000000065'
const RUNTIME_INSTANCE_ID = 0x1000000000000001n
const RUNTIME_COUNTER = 0x10n
const RUNTIME_SENDER = '10000000000000010000000000000010'
const IEEE_LOSSY_SENDER = '10000000000000000000000000000010'

function writeU64LE(bytes, offset, value) {
  let n = typeof value === 'bigint' ? value : BigInt(value)
  for (let i = 0; i < 8; i++) {
    bytes[offset + i] = Number(n & 0xffn)
    n >>= 8n
  }
}

function encodeChatEventPayload({ messageId, roomSequence, instanceId, counter, text, appliedTick }) {
  const utf8 = new TextEncoder().encode(text)
  const bytes = new Uint8Array(8 * 5 + 4 + utf8.length)
  let offset = 0
  writeU64LE(bytes, offset, messageId)
  offset += 8
  writeU64LE(bytes, offset, roomSequence)
  offset += 8
  writeU64LE(bytes, offset, instanceId)
  offset += 8
  writeU64LE(bytes, offset, counter)
  offset += 8
  bytes[offset] = utf8.length & 0xff
  bytes[offset + 1] = (utf8.length >>> 8) & 0xff
  bytes[offset + 2] = (utf8.length >>> 16) & 0xff
  bytes[offset + 3] = (utf8.length >>> 24) & 0xff
  offset += 4
  bytes.set(utf8, offset)
  offset += utf8.length
  writeU64LE(bytes, offset, appliedTick)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

test('decodeChatEventPayload reads C-1 two-u64 sender as 32-hex', () => {
  const event = decodeChatEventPayload(GG_EVENT_HEX)
  assert.equal(event.messageId, 1)
  assert.equal(event.roomSequence, 1)
  assert.equal(event.senderNetEntityId, GG_SENDER)
  assert.equal(event.senderNetEntityIdInstanceId, 0n)
  assert.equal(event.senderNetEntityIdCounter, 101n)
  assert.equal(event.text, 'gg')
  assert.equal(event.appliedTick, 7)
  assert.equal(encodeSenderHex(0, 101), GG_SENDER)
})

test('decodeChatEventPayload keeps low bit of Runtime instanceId 0x1000000000000001', () => {
  const payload = encodeChatEventPayload({
    messageId: 1,
    roomSequence: 1,
    instanceId: RUNTIME_INSTANCE_ID,
    counter: RUNTIME_COUNTER,
    text: 'gg',
    appliedTick: 7,
  })
  const event = decodeChatEventPayload(payload)
  assert.equal(event.senderNetEntityId, RUNTIME_SENDER)
  assert.notEqual(event.senderNetEntityId, IEEE_LOSSY_SENDER)
  assert.equal(event.senderNetEntityIdInstanceId, RUNTIME_INSTANCE_ID)
  assert.equal(event.senderNetEntityIdCounter, RUNTIME_COUNTER)
  assert.equal(
    event.senderNetEntityId,
    RUNTIME_INSTANCE_ID.toString(16).padStart(16, '0') + RUNTIME_COUNTER.toString(16).padStart(16, '0'),
  )
  assert.equal(encodeSenderHex(RUNTIME_INSTANCE_ID, RUNTIME_COUNTER), RUNTIME_SENDER)
  const fromDelta = extractChatEventsFromFrame({
    messageType: 'Delta',
    changedBlocks: [{ mappingId: 'chat.event', payload }],
  })
  assert.equal(fromDelta[0].senderNetEntityId, RUNTIME_SENDER)
})

test('extractChatEventsFromFrame reads Delta.changedBlocks chat.event', () => {
  const events = extractChatEventsFromFrame({
    messageType: 'Delta',
    tickId: 7,
    revision: 1,
    changedBlocks: [{
      mappingId: 'chat.event',
      payload: GG_EVENT_HEX,
      payloadSha256: '019c19137fdcc3eadf322f67067c254ef33fc2f81a7123bc89253d9a41d0d179',
    }],
  })
  assert.equal(events.length, 1)
  assert.equal(events[0].roomSequence, 1)
  assert.equal(events[0].text, 'gg')
  assert.equal(events[0].appliedTick, 7)
  assert.equal(events[0].senderNetEntityId, GG_SENDER)
})

test('FullSnapshot clears the window and does not restore chat.event', () => {
  const window = createChatWindow()
  appendAcceptedEvent(window, {
    messageId: 1,
    roomSequence: 1,
    senderNetEntityId: GG_SENDER,
    text: 'gg',
    appliedTick: 7,
  })
  applyFullSnapshot(window)
  assert.equal(window.lines.length, 0)
  const fromSnap = extractChatEventsFromFrame({
    messageType: 'FullSnapshot',
    tickId: 7,
    revision: 1,
    stateBlocks: [{ mappingId: 'chat.event', payload: GG_EVENT_HEX, payloadSha256: '019c19137fdcc3eadf322f67067c254ef33fc2f81a7123bc89253d9a41d0d179' }],
  })
  assert.equal(fromSnap.length, 0)
})

test('formatLine uses sender and text', () => {
  assert.equal(formatLine({ senderNetEntityId: GG_SENDER, text: 'gg' }), `${GG_SENDER}: gg`)
})
