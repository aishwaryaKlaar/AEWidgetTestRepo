import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/widget.css'

// Cloudflare Worker URL — update this after running: wrangler deploy
const DOMAIN_CHECK_URL = 'https://klaar-domain-check.REPLACE_WITH_YOUR_ACCOUNT.workers.dev'

async function isDomainAllowed() {
  const h = location.hostname
  if (h === 'localhost' || h === '127.0.0.1') return true
  if (h === 'klaarhq.com' || h.endsWith('.klaarhq.com')) return true
  try {
    const r = await fetch(`${DOMAIN_CHECK_URL}?domain=${encodeURIComponent(h)}`)
    const d = await r.json()
    return d.allowed === true
  } catch (e) {
    console.warn('[Klaar Widget] Domain check failed:', e.message)
    return false
  }
}

function logAuthDiagnostics() {
  const _wid = localStorage.getItem('workspace-id')
  const _tok = localStorage.getItem('X-AUTH-TOKEN')
  const _apiHost = ({ 'app.klaarhq.com': 'api.klaarhq.com', 'us.klaarhq.com': 'api-usprod.klaarhq.com' })[location.host] || 'api-usprod.klaarhq.com'
  console.log(`[Klaar AE Widget] host=${location.host} | api=${_apiHost} | workspace=${_wid || '❌ MISSING'} | token=${_tok ? '✓' : '❌ MISSING'}`)
  if (!_wid || !_tok) console.error('[Klaar AE Widget] Missing auth — widget buttons will fail. Are you logged in to Klaar?')
}

let root = null

// Exposed synchronously at script-eval time so a `script.onload` caller can
// rely on this existing immediately. Nothing auto-mounts on script load —
// the host (e.g. an Angular drawer component) fully controls when/where this
// renders by calling mount(container), and tears it down via unmount().
window.KlaarAEWidget = {
  async mount(container) {
    if (!container) {
      console.error('[Klaar Widget] mount() requires a container element.')
      return
    }
    const allowed = await isDomainAllowed()
    if (!allowed) {
      console.warn('[Klaar Widget] Domain not authorized:', location.hostname)
      return
    }

    // Support being called again without an explicit unmount() first.
    if (root) window.KlaarAEWidget.unmount()

    logAuthDiagnostics()
    root = ReactDOM.createRoot(container)
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  },

  unmount() {
    root?.unmount()
    root = null
  },
}
