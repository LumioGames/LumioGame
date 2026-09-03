import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendAcceptedEvent,
  applyFullSnapshot,
  createChatWindow,
  decodeChatEventPayload,
  extractChatEventsFromFrame,
  formatLine,
} from './chat-window.js'

const GG_EVENT_HEX = '0100000000000000010000000000000065000000000000000200000067670700000000000000'

test('decodeChatEventPayload reads frozen C-1 gg fixture', () => {
  const event = decodeChatEventPayload(GG_EVENT_HEX)
  assert.equal(event.messageId, 1)
  assert.equal(event.roomSequence, 1)
  assert.equal(event.senderNetEntityId, '101')
  assert.equal(event.text, 'gg')
  assert.equal(event.appliedTick, 7)
})

test('extractChatEventsFromFrame reads Delta.changedBlocks chat.event', () => {
  const events = extractChatEventsFromFrame({
    messageType: 'Delta',
    tickId: 7,
    revision: 1,
    changedBlocks: [{
      mappingId: 'chat.event',
      payload: GG_EVENT_HEX,
      payloadSha256: '9fafc556e56dc024a90caf7c102dfccfed4189c708e0a51b0139aab28277670c',
    }],
  })
  assert.equal(events.length, 1)
  assert.equal(events[0].roomSequence, 1)
  assert.equal(events[0].text, 'gg')
  assert.equal(events[0].appliedTick, 7)
})

test('FullSnapshot clears the window and does not restore chat.event', () => {
  const window = createChatWindow()
  appendAcceptedEvent(window, {
    messageId: 1,
    roomSequence: 1,
    senderNetEntityId: '101',
    text: 'gg',
    appliedTick: 7,
  })
  applyFullSnapshot(window)
  assert.equal(window.lines.length, 0)
  const fromSnap = extractChatEventsFromFrame({
    messageType: 'FullSnapshot',
    tickId: 7,
    revision: 1,
    stateBlocks: [{ mappingId: 'chat.event', payload: GG_EVENT_HEX, payloadSha256: '9fafc556e56dc024a90caf7c102dfccfed4189c708e0a51b0139aab28277670c' }],
  })
  assert.equal(fromSnap.length, 0)
})

test('formatLine uses sender and text', () => {
  assert.equal(formatLine({ senderNetEntityId: '101', text: 'gg' }), '101: gg')
})
