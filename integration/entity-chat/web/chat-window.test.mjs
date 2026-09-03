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

test('decodeChatEventPayload reads C-1 two-u64 sender as 32-hex', () => {
  const event = decodeChatEventPayload(GG_EVENT_HEX)
  assert.equal(event.messageId, 1)
  assert.equal(event.roomSequence, 1)
  assert.equal(event.senderNetEntityId, GG_SENDER)
  assert.equal(event.senderNetEntityIdInstanceId, 0)
  assert.equal(event.senderNetEntityIdCounter, 101)
  assert.equal(event.text, 'gg')
  assert.equal(event.appliedTick, 7)
  assert.equal(encodeSenderHex(0, 101), GG_SENDER)
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
