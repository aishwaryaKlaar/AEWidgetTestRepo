import { api, getOrgUserIdFromJwt } from '../../core/api.js'
import { state } from '../../core/state.js'
import { notImplemented, searchResults } from '../../core/helpers.js'

// Step 1: Create One on One Template
export const createOneOnOneTemplate = notImplemented(
  'POST /one_on_one/template/ — create a 1-on-1 meeting template with agenda items'
)

// Step 2: Create Session — creates 10 admin↔user 1-on-1 relationships
export async function createSession() {
  const adminOrgUserId = getOrgUserIdFromJwt()
  if (!adminOrgUserId) return { ok: false, message: 'Cannot resolve admin org user ID from JWT.' }

  // Collect user2 candidates with org_user_id
  const seen = new Set([adminOrgUserId])
  const candidates = []

  const addCandidate = (full_name, org_user_id) => {
    if (!org_user_id || seen.has(org_user_id)) return
    seen.add(org_user_id)
    candidates.push({ full_name, org_user_id })
  }

  // From dummyUsers (Add User step)
  for (const u of (state.dummyUsers || [])) {
    addCandidate(u.full_name, u.org_user_id)
  }

  // From state.users (if fetchUsers ran earlier)
  for (const u of (state.users || [])) {
    if (candidates.length >= 10) break
    addCandidate(u.full_name, u.org_user_id)
  }

  // Supplement by fetching workspace employees if still under 10
  if (candidates.length < 10) {
    const r = await api('/um/accounts/employee/?page=1&page_size=20')
    if (r.ok) {
      for (const emp of searchResults(r)) {
        if (candidates.length >= 10) break
        addCandidate(emp.user?.full_name, emp.org_user?.id)
      }
    }
  }

  if (!candidates.length) {
    return { ok: false, message: 'No users with org_user_id found. Run "Add User" first.' }
  }

  const created = []
  const failed = []

  for (const user of candidates.slice(0, 10)) {
    const name = `Admin - ${user.full_name} 1-on-1`
    const r = await api('/ono/1-on-1/relationships/', {
      method: 'POST',
      body: JSON.stringify({ name, user1: adminOrgUserId, user2: user.org_user_id }),
    })
    if (r.ok) {
      created.push(user.full_name)
    } else {
      const body = (r.text || '').toLowerCase()
      if (r.status === 400 && (body.includes('exist') || body.includes('already'))) {
        created.push(user.full_name)
      } else {
        console.log(`[createSession] failed for ${user.full_name}:`, r.status, r.text)
        failed.push(`${user.full_name} (${r.status})`)
      }
    }
  }

  if (!created.length) {
    return { ok: false, message: `All sessions failed: ${failed.join(', ')}` }
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return {
    ok: true,
    message: `Created ${created.length} 1-on-1 sessions: ${created.join(', ')}${failNote}`,
  }
}
