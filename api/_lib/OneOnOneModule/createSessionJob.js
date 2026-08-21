// Node-safe port of createSession() from src/modules/oneOnOne/actions.js ("Create Session" —
// the only wired-up step in the widget's "1 on 1" section), for the Slack slash-command
// proof-of-concept.
//
// adminOrgUserId is REQUIRED here (used as user1 in every relationship), unlike Feedback's
// optional exclusion — resolved via resolveSheetUserId() (the is_admin-flagged manager's
// real UUID), the same admin-identity trick already used by Goals/Reviews since a real
// logged-in admin's JWT can't be harvested per-workspace at scale. No durable state —
// always fetch live employees for the user2 candidates.
import { klaarApi, runJobAndReply, resolveSheetUserId, searchResults } from '../shared/klaarCore.js'

// Ported from createSession() in actions.js, minus the state.js reads.
export async function createSessionJob() {
  const { sheetUserId: adminOrgUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const seen = new Set([adminOrgUserId])
  const candidates = []

  const r = await klaarApi('/um/accounts/employee/?page=1&page_size=20')
  if (r.ok) {
    for (const emp of searchResults(r)) {
      if (candidates.length >= 10) break
      const oid = emp.org_user?.id
      if (!oid || seen.has(oid)) continue
      seen.add(oid)
      candidates.push({ full_name: emp.user?.full_name, org_user_id: oid })
    }
  }

  if (!candidates.length) {
    return { ok: false, message: 'No users found. Run /add-employee or /bulk-upload-user first.' }
  }

  const created = [], failed = []
  for (const user of candidates) {
    const name = `Admin - ${user.full_name} 1-on-1`
    const r2 = await klaarApi('/ono/1-on-1/relationships/', {
      method: 'POST',
      body: JSON.stringify({ name, user1: adminOrgUserId, user2: user.org_user_id }),
    })
    if (r2.ok) {
      created.push(user.full_name)
    } else {
      const body = (r2.text || '').toLowerCase()
      if (r2.status === 400 && (body.includes('exist') || body.includes('already'))) {
        created.push(user.full_name)
      } else {
        failed.push(`${user.full_name} (${r2.status})`)
      }
    }
  }

  if (!created.length) return { ok: false, message: `All sessions failed: ${failed.join(', ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 1-on-1 sessions: ${created.join(', ')}${failNote}. Go to 1 on 1 in Klaar to view them.` }
}

export async function runCreateSessionJob({ response_url }) {
  await runJobAndReply(createSessionJob, response_url)
}
