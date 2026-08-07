// Core API layer — host detection, auth headers, fetch wrapper
import { tryDecrypt } from './crypto.js'

const API_BASE_BY_HOST = {
  'app.klaarhq.com':     'https://api.klaarhq.com',
  'us.klaarhq.com':      'https://api-usprod.klaarhq.com',
  'omicron.klaarhq.com': 'https://api.klaarhq.com',
  'localhost:4200':      'https://dev-api.klaarhq.com',
}

// Any localhost port (e.g. 5173 from Vite dev server) falls back to US prod for testing
export const API_BASE = API_BASE_BY_HOST[location.host]
  || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'https://api-usprod.klaarhq.com' : 'https://api.klaarhq.com')

export const getToken       = () => localStorage.getItem('X-AUTH-TOKEN')
export const getWorkspaceId = () => localStorage.getItem('workspace-id')

export function getAdminUserIdFromJwt() {
  try {
    const jwt = localStorage.getItem('JWT')
    return JSON.parse(atob(jwt.split('.')[1])).user?.id || ''
  } catch { return '' }
}

// OKR system uses org_user.id (workspace-level), not user.id (auth-level).
// Use this as sheet_user_id for /okr/performance/* endpoints.
export function getOrgUserIdFromJwt() {
  try {
    const jwt = localStorage.getItem('JWT')
    return JSON.parse(atob(jwt.split('.')[1])).org_user?.id || ''
  } catch { return '' }
}

// Try to extract the logged-in user's email directly from the JWT payload.
// Klaar stores it at payload.user.email or payload.email depending on the env.
export function getEmailFromJwt() {
  try {
    const jwt = localStorage.getItem('JWT')
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    return payload.user?.email || payload.email || ''
  } catch { return '' }
}

export function buildHeaders(extra = {}) {
  return {
    'Authorization': 'Bearer ' + getToken(),
    'workspace-id':  getWorkspaceId(),
    'client-domain': location.host,
    'client_domain': location.host,
    'Accept': 'application/json, text/plain, */*',
    ...extra,
  }
}

export async function api(path, init = {}) {
  const opts = {
    method: init.method || 'GET',
    headers: buildHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  }
  if (init.body) opts.body = init.body
  let res, text = '', data = null
  try {
    res  = await fetch(API_BASE + path, opts)
    text = await res.text().catch(() => '')
    try { data = JSON.parse(text) } catch {}

    // Some endpoints return their payload AES-encrypted inside `data.data`
    // (a long opaque string) instead of plain JSON. Decrypt it transparently
    // here so every caller can keep reading `r.data.data` as a plain object/array.
    if (data && typeof data.data === 'string') {
      const decrypted = tryDecrypt(data.data)
      if (decrypted !== null) data.data = decrypted
    }

    return { res, status: res.status, ok: res.ok, data, text }
  } catch (e) {
    console.error('[api] fetch error', opts.method, path, e.message)
    return { res: null, status: 0, ok: false, data: null, text: e.message }
  }
}
