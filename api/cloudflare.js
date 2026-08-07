const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Cloudflare sometimes returns an HTML error page (auth failure, WAF challenge, 5xx)
// instead of JSON — .json() would throw uncaught and crash the whole function
// (losing our CORS headers in the process). Parse defensively instead.
async function safeJson(r) {
  const text = await r.text().catch(() => '')
  try { return JSON.parse(text) } catch { return { success: false, __non_json_response: text.slice(0, 500) } }
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, subdomain, migaduRecords } = req.body || {}
  const token  = process.env.CF_API_TOKEN
  const zoneId = process.env.CF_KLAAR_TEAM_ZONE_ID

  if (!token || !zoneId) {
    return res.status(500).json({ error: 'CF_API_TOKEN or CF_KLAAR_TEAM_ZONE_ID env vars not set' })
  }

  const cfHeaders = {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  if (action === 'setup_subdomain') {
    if (!subdomain) return res.status(400).json({ error: 'subdomain required' })

    const domain = `${subdomain}.klaar.team`
    const records = []

    function expandName(n) {
      return n === '@' ? domain : `${n}.${domain}`
    }

    if (migaduRecords) {
      for (const mx of migaduRecords.mx_records || []) {
        records.push({ type: 'MX', name: expandName(mx.name), content: mx.value, priority: mx.priority, ttl: 3600 })
      }
      if (migaduRecords.spf) {
        records.push({ type: 'TXT', name: expandName(migaduRecords.spf.name), content: migaduRecords.spf.value, ttl: 3600 })
      }
      for (const dkim of migaduRecords.dkim || []) {
        records.push({ type: 'CNAME', name: expandName(dkim.name), content: dkim.value.replace(/\.$/, ''), ttl: 3600, proxied: false })
      }
      if (migaduRecords.dmarc) {
        records.push({ type: 'TXT', name: expandName(migaduRecords.dmarc.name), content: migaduRecords.dmarc.value, ttl: 3600 })
      }
      // DNS verification token — delete any old hosted-email-verify= tokens first.
      // Multiple tokens accumulate when the domain is deleted + recreated in Migadu,
      // and Migadu's verify check fails when more than one token exists in DNS.
      if (migaduRecords.dns_verification) {
        const verifyName = expandName(migaduRecords.dns_verification.name)
        const listR = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(verifyName)}&type=TXT&per_page=100`,
          { headers: cfHeaders }
        )
        const listData = await safeJson(listR)
        for (const rec of (listData.result || [])) {
          if (rec.content.startsWith('hosted-email-verify=')) {
            await fetch(
              `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${rec.id}`,
              { method: 'DELETE', headers: cfHeaders }
            )
          }
        }
        records.push({ type: 'TXT', name: verifyName, content: migaduRecords.dns_verification.value, ttl: 3600 })
      }
    } else {
      records.push({ type: 'MX', name: domain, content: 'aspmx1.migadu.com', priority: 10, ttl: 3600 })
      records.push({ type: 'MX', name: domain, content: 'aspmx2.migadu.com', priority: 20, ttl: 3600 })
    }

    const results = []
    for (const record of records) {
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        { method: 'POST', headers: cfHeaders, body: JSON.stringify(record) }
      )
      const data = await safeJson(r)
      const alreadyExists = !data.success &&
        data.errors?.some(e => e.code === 81057 || (e.message || '').includes('already exists'))

      results.push({
        record:  `${record.type} ${record.name}`,
        ok:      data.success || alreadyExists,
        existed: alreadyExists,
        error:   data.success || alreadyExists ? null : (data.errors?.[0]?.message || data.__non_json_response || 'Unknown Cloudflare error'),
      })
    }

    const anyFailed = results.some(r => !r.ok)
    return res.json({ ok: !anyFailed, domain, results })
  }

  if (action === 'list_records') {
    if (!subdomain) return res.status(400).json({ error: 'subdomain required' })
    const domain = `${subdomain}.klaar.team`
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`,
      { headers: cfHeaders }
    )
    const data = await safeJson(r)
    const records = (data.result || []).map(rec => ({ type: rec.type, name: rec.name, content: rec.content, proxied: rec.proxied }))
    return res.json({ ok: data.success, domain, records, error: data.success ? null : (data.errors?.[0]?.message || data.__non_json_response || 'Unknown Cloudflare error') })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
