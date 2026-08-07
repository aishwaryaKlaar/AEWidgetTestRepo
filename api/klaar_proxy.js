const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Proxies launch_multiple_survey server-side so we can read the actual Django error body
// (CORS blocks the browser from reading 500 responses directly)
export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { auth, workspaceId, clientDomain, body } = req.body || {}

  let klaarStatus = 0, data = {}
  try {
    const r = await fetch('https://api.klaarhq.com/surveyms/launch_multiple_survey', {
      method: 'POST',
      headers: {
        'Authorization':  auth || '',
        'workspace-id':   workspaceId || '',
        'client-domain':  clientDomain || '',
        'client_domain':  clientDomain || '',
        'Content-Type':   'application/json',
        'Accept':         'application/json, text/plain, */*',
      },
      body: JSON.stringify(body),
    })
    klaarStatus = r.status
    const text = await r.text().catch(() => '')
    try { data = JSON.parse(text) }
    catch { data = { raw_html: text.slice(0, 4000) } }
  } catch (e) {
    data = { fetch_error: e.message }
  }

  // Always return 200 to the browser so widget JS can read the body
  return res.status(200).json({ klaar_status: klaarStatus, ok: klaarStatus >= 200 && klaarStatus < 300, data })
}
