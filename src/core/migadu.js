const PROXY_BASE = import.meta.env.VITE_PROXY_BASE || ''

export async function ensureMigaduDomain(domain) {
  try {
    const r = await fetch(`${PROXY_BASE}/api/migadu`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'ensure_domain', domain }),
    })
    const data = await r.json()
    return { ok: data.ok === true, already_exists: !!data.already_exists, dnsRecords: data.dnsRecords, error: data.error }
  } catch (e) {
    console.warn('[Migadu] ensureDomain failed:', e.message)
    return { ok: false, error: e.message }
  }
}

export async function activateMigaduDomain(domain) {
  try {
    const r = await fetch(`${PROXY_BASE}/api/migadu`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'activate_domain', domain }),
    })
    const data = await r.json()
    console.log('[Migadu] activate result:', JSON.stringify(data, null, 2))
    return data
  } catch (e) {
    console.warn('[Migadu] activateDomain failed:', e.message)
    return { ok: false, error: e.message }
  }
}

export async function createMigaduMailbox(domain, localPart, name) {
  try {
    const r = await fetch(`${PROXY_BASE}/api/migadu`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create_mailbox', domain, localPart, name }),
    })
    const data = await r.json()
    if (!data.ok) {
      console.warn(`[Migadu] mailbox ${localPart}@${domain} failed:`, data.error || JSON.stringify(data.data))
    }
    return data.ok === true
  } catch (e) {
    console.warn('[Migadu] createMailbox failed:', e.message)
    return false
  }
}
