// Mirrors Klaar frontend's HttpConfigInterceptor (src/app/core/interceptors/auth.interceptor.ts)
// + test.ts decrypt helper (AES-128-CBC, PKCS7, crypto-js) — used to decrypt API
// response bodies that come back encrypted instead of plain JSON.
//
// Klaar rotated this key on 2025-01-15, and different backend microservices
// appear to be deployed against different sides of that rotation (e.g.
// /um/accounts/ responses decrypted with the pre-rotation key, while
// /survey/feedback-nomination/ responses failed against it — presumably on
// the rotated key instead). Rather than hardcode one and guess wrong per
// service, try both key/IV pairs and use whichever actually decrypts.
import CryptoJS from 'crypto-js'

const KEY_PAIRS = [
  { key: 'm897Z2dRF0etDTdx', iv: 'bFuMI4IaSN1jqem5' }, // pre-rotation — verified against /um/accounts/employee/
  { key: 'tyGF6ssTdsykzxji', iv: 'n8zWso27UFURyDXu' }, // rotated (2025-01-15) — psychometric-feature source
]

function decryptWith(input, { key, iv }) {
  const keyBytes = CryptoJS.enc.Utf8.parse(key)
  const ivBytes  = CryptoJS.enc.Utf8.parse(iv)

  const out = CryptoJS.AES.decrypt(input, keyBytes, {
    iv: ivBytes,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })

  return JSON.parse(out.toString(CryptoJS.enc.Utf8))
}

// Tries each known key/IV pair in turn; throws the last error if none work.
export function decryptPayload(input) {
  let lastErr
  for (const pair of KEY_PAIRS) {
    try { return decryptWith(input, pair) } catch (e) { lastErr = e }
  }
  throw lastErr
}

export function encryptPayload(input, pairIndex = 0) {
  const { key, iv } = KEY_PAIRS[pairIndex]
  const keyBytes = CryptoJS.enc.Utf8.parse(key)
  const ivBytes  = CryptoJS.enc.Utf8.parse(iv)

  return CryptoJS.AES.encrypt(JSON.stringify(input), keyBytes, {
    iv: ivBytes,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString()
}

// Safe wrapper — returns the decrypted value, or null if `input` isn't a
// string or isn't valid encrypted JSON under any known key (so callers can
// fall back safely).
export function tryDecrypt(input) {
  if (typeof input !== 'string' || !input) return null
  try { return decryptPayload(input) } catch { return null }
}
