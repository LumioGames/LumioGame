/**
 * Account Server websocket client (subprotocol lumio-account-v1).
 * Does not log passwords or bot-tool / admission credential material.
 */
const SUBPROTOCOL = 'lumio-account-v1'
const LOGIN_TYPE = 'LoginOrRegister'

function redact(obj) {
  if (obj == null || typeof obj !== 'object') return obj
  const out = { ...obj }
  delete out.password
  delete out.botToolCredential
  if (out.admissionCredential) {
    out.admissionCredentialSha16 = String(out.admissionCredential).slice(0, 16)
    delete out.admissionCredential
  }
  return out
}

export async function loginOrRegister(port, { loginName, password, botToolCredential, timeoutMs = 15000 }) {
  const url = `ws://127.0.0.1:${port}/`
  const ws = new WebSocket(url, [SUBPROTOCOL])
  const request = { messageType: LOGIN_TYPE, loginName, password }
  if (botToolCredential != null) request.botToolCredential = botToolCredential

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      reject(new Error(`account login timeout (${timeoutMs}ms) loginName=${loginName}`))
    }, timeoutMs)
    ws.addEventListener('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`account websocket error: ${err.message ?? err}`))
    })
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(request))
    })
    ws.addEventListener('message', (ev) => {
      clearTimeout(timer)
      let parsed
      try {
        parsed = JSON.parse(String(ev.data))
      } catch (err) {
        reject(new Error(`account response is not JSON: ${err.message}`))
        try { ws.close() } catch { /* ignore */ }
        return
      }
      try { ws.close() } catch { /* ignore */ }
      resolve(parsed)
    })
  })
}

export function redactLogin(parsed) {
  return redact(parsed)
}

export function summarizeLogin(parsed) {
  if (!parsed || typeof parsed !== 'object') return { accepted: false, code: 'invalid_request' }
  if (parsed.messageType === 'LoginOrRegisterAck' && parsed.accepted === true) {
    return {
      accepted: true,
      accountNewlyCreated: parsed.accountNewlyCreated === true,
      accountId: parsed.accountId,
      loginName: parsed.loginName,
      admissionExpiresAt: parsed.admissionExpiresAt,
      hasAdmissionCredential: Boolean(parsed.admissionCredentialSha16),
    }
  }
  return {
    accepted: false,
    code: parsed.code ?? 'invalid_request',
    detail: parsed.detail,
    loginName: parsed.loginName,
  }
}
