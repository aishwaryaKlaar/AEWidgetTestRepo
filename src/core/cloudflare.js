const PROXY_BASE = import.meta.env.VITE_PROXY_BASE || ''

export async function setupCloudflareSubdomain(subdomain, migaduRecords) {
  try {
    const r = await fetch(`${PROXY_BASE}/api/cloudflare`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'setup_subdomain', subdomain, migaduRecords }),
    })
    const data = await r.json()
    return { ok: data.ok === true, domain: data.domain, results: data.results, error: data.error }
  } catch (e) {
    console.warn('[CF] setupSubdomain failed:', e.message)
    return { ok: false, error: e.message }
  }
}
