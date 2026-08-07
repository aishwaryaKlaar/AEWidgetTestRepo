const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, domain, localPart, name: displayName } = req.body || {}

  const migaduEmail = process.env.MIGADU_EMAIL
  const migaduKey   = process.env.MIGADU_API_KEY

  if (!migaduEmail || !migaduKey) {
    return res.status(500).json({ error: 'MIGADU_EMAIL or MIGADU_API_KEY env vars not set' })
  }

  const auth = Buffer.from(`${migaduEmail}:${migaduKey}`).toString('base64')
  const migaduHeaders = {
    Authorization:  `Basic ${auth}`,
    'Content-Type': 'application/json',
  }

  if (action === 'ensure_domain') {
    if (!domain) return res.status(400).json({ error: 'domain required' })

    // Check if the domain already exists in Migadu
    const check = await fetch(`https://api.migadu.com/v1/domains/${domain}`, { headers: migaduHeaders })

    if (!check.ok) {
      // Domain doesn't exist — create it
      const create = await fetch('https://api.migadu.com/v1/domains', {
        method: 'POST',
        headers: migaduHeaders,
        body: JSON.stringify({ name: domain, hosted_dns: 'false', create_default_addresses: 'true' }),
      })
      let createData = {}
      try { createData = await create.json() } catch (_) { createData = { error: await create.text().catch(() => 'unknown') } }
      if (!create.ok) {
        return res.status(create.status).json({ ok: false, domain, error: createData.error || 'Domain creation failed' })
      }
    }

    // Fetch the required DNS records so the caller can add them to Cloudflare
    const rec = await fetch(`https://api.migadu.com/v1/domains/${domain}/records`, { headers: migaduHeaders })
    let dnsRecords = null
    if (rec.ok) { try { dnsRecords = await rec.json() } catch (_) { dnsRecords = null } }

    return res.json({ ok: true, domain, already_exists: check.ok, dnsRecords })
  }

  if (action === 'activate_domain') {
    if (!domain) return res.status(400).json({ error: 'domain required' })

    // First: run diagnostics so we can see exactly which DNS checks pass/fail
    let diagnostics = null
    try {
      const dr = await fetch(`https://api.migadu.com/v1/domains/${domain}/diagnostics`, { headers: migaduHeaders })
      diagnostics = dr.ok ? await dr.json() : null
    } catch (_) {}

    // Try activation (GET as per Migadu API docs). Retry up to 5 times with 4s delay.
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    let lastData = {}
    let lastStatus = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await sleep(4000)
      const r = await fetch(`https://api.migadu.com/v1/domains/${domain}/activate`, { headers: migaduHeaders })
      lastStatus = r.status
      try { lastData = await r.json() } catch (_) { lastData = {} }
      if (r.ok) return res.json({ ok: true, domain, attempts: attempt + 1, diagnostics, data: lastData })
      if (lastData.error && lastData.error !== 'dns_check_failed') break
    }
    return res.json({ ok: false, domain, activateStatus: lastStatus, activateError: lastData, diagnostics })
  }

  if (action === 'create_mailbox') {
    if (!domain || !localPart) return res.status(400).json({ error: 'domain and localPart required' })

    const defaultPassword = process.env.MIGADU_DEFAULT_PASSWORD
    if (!defaultPassword) {
      return res.status(500).json({ error: 'MIGADU_DEFAULT_PASSWORD env var not set' })
    }

    const r = await fetch(`https://api.migadu.com/v1/domains/${domain}/mailboxes/`, {
      method:  'POST',
      headers: migaduHeaders,
      body:    JSON.stringify({
        local_part:         localPart,
        name:               displayName || localPart,
        password:           defaultPassword,
        is_sender_allowed:  true,
      }),
    })
    let data = {}
    try { data = await r.json() } catch (_) { data = { error: await r.text().catch(() => 'unknown') } }

    const alreadyExists = r.status === 409 ||
      (typeof data.local_part === 'string' && data.local_part === localPart)
    return res.status(r.ok || alreadyExists ? 200 : r.status).json({
      ok: r.ok || alreadyExists,
      email: `${localPart}@${domain}`,
      data,
    })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
