/**
 * Mint Bot-tool credentials the same way LumioServer account-server tests do
 * (BotNamespaceTests / TestHarness): LumioBinV1 payload + LumioSignatureV1 Ed25519.
 * Keys stay in env / generated test material; never commit production secrets.
 */
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'

export const BOT_TOOL_TRUST_DOMAIN = 'bot-tool'
export const BOT_TOOL_PAYLOAD_TYPE = 'bot-tool-credential-v1'
export const BOT_TOOL_SCOPE = 'bot-namespace'
export const BOT_TOOL_PAYLOAD_VERSION = 1
export const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
export const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export function hexLower(bytes) {
  return Buffer.from(bytes).toString('hex')
}

export function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generateEd25519SeedPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const seed = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32))
  const publicKeyRaw = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32))
  return { seed, publicKey: publicKeyRaw }
}

export function privateKeyFromSeed(seed) {
  const raw = Buffer.from(seed)
  if (raw.length !== 32) throw new Error('Ed25519 seed must be 32 bytes')
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' })
}

function u16le(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}

function u32le(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function u64le(n) {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(n))
  return b
}

function ascii(s) {
  const payload = Buffer.from(String(s), 'ascii')
  return Buffer.concat([u32le(payload.length), payload])
}

export function encodeBotToolPayload({ toolId, scope = BOT_TOOL_SCOPE, issuedAt, expiresAt, nonce }) {
  if (!Buffer.isBuffer(nonce) || nonce.length !== 16) throw new Error('nonce must be 16 bytes')
  return Buffer.concat([
    u16le(BOT_TOOL_PAYLOAD_VERSION),
    ascii(toolId),
    ascii(scope),
    u64le(issuedAt),
    u64le(expiresAt),
    nonce,
  ])
}

export function lumioSignaturePreimage(trustDomain, payloadType, payload) {
  const digestHex = createHash('sha256').update(payload).digest('hex')
  return Buffer.concat([
    Buffer.from('LumioSignatureV1', 'ascii'),
    Buffer.from([0]),
    Buffer.from(trustDomain, 'ascii'),
    Buffer.from([0]),
    Buffer.from(payloadType, 'ascii'),
    Buffer.from([0]),
    Buffer.from(digestHex, 'ascii'),
  ])
}

export function issueBotToolCredential(seed, {
  toolId = 'bot-launcher',
  issuedAt,
  expiresAt,
  nonce,
} = {}) {
  const now = issuedAt ?? Math.floor(Date.now() / 1000)
  const exp = expiresAt ?? now + 3600
  const n = nonce ?? randomBytes(16)
  const payload = encodeBotToolPayload({
    toolId,
    scope: BOT_TOOL_SCOPE,
    issuedAt: now,
    expiresAt: exp,
    nonce: n,
  })
  const preimage = lumioSignaturePreimage(BOT_TOOL_TRUST_DOMAIN, BOT_TOOL_PAYLOAD_TYPE, payload)
  const signature = sign(null, preimage, privateKeyFromSeed(seed))
  return base64UrlEncode(Buffer.concat([payload, signature]))
}

export function botLoginName(i) {
  if (!Number.isInteger(i) || i < 1 || i > 100) throw new Error(`bot index out of range: ${i}`)
  return `Bot${String(i).padStart(2, '0')}`
}

export function allBotLoginNames() {
  return Array.from({ length: 100 }, (_, i) => botLoginName(i + 1))
}

if (process.env.NODE_TEST_CONTEXT) {
  nodeTest('Bot01–Bot100 命名与 Bot100 三位数', () => {
    assert.equal(botLoginName(1), 'Bot01')
    assert.equal(botLoginName(9), 'Bot09')
    assert.equal(botLoginName(10), 'Bot10')
    assert.equal(botLoginName(100), 'Bot100')
    const names = allBotLoginNames()
    assert.equal(names.length, 100)
    assert.equal(names[0], 'Bot01')
    assert.equal(names[99], 'Bot100')
  })

  nodeTest('Bot-tool payload 含 version/toolId/scope/u64/nonce16', () => {
    const nonce = Buffer.alloc(16, 7)
    const payload = encodeBotToolPayload({
      toolId: 'bot-launcher',
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_003_600,
      nonce,
    })
    assert.equal(payload.readUInt16LE(0), 1)
    assert.ok(payload.length > 16 + 2)
    const pair = generateEd25519SeedPair()
    const wire = issueBotToolCredential(pair.seed, { issuedAt: 10, expiresAt: 20, nonce })
    assert.match(wire, /^[A-Za-z0-9_-]+$/)
    assert.equal(pair.publicKey.length, 32)
    assert.equal(pair.seed.length, 32)
  })
}
