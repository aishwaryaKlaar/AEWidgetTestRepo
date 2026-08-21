// Module-agnostic Node-safe helpers for the Slack slash-command jobs — auth, the fetch
// wrapper, and the Slack-reply plumbing. Used by every module's job files (UserModule,
// GoalsModule, etc.). Anything specific to one module's own data (employee payloads,
// mailbox creation, group creation...) lives in that module's own core file instead,
// which imports from here rather than duplicating these.
//
// Not imported from src/core/api.js / src/core/helpers.js because those transitively
// import src/core/state.js, which calls localStorage at module-load time and throws
// immediately in Node.
import { tryDecrypt } from '../../../src/core/crypto.js'
import { MANAGERS } from '../UserModule/addManagersJob.js'

// Copied verbatim from src/core/helpers.js (pure functions, not importable directly
// because that file itself imports core/state.js).
export function errorBodyText(r) {
  const decrypted = r.data?.data
  const text = typeof decrypted === 'string' ? decrypted
    : decrypted ? JSON.stringify(decrypted)
    : (r.text || '')
  return text.toLowerCase()
}

export function searchResults(r) {
  return r.data?.data?.results || r.data?.results || []
}

// Several create-endpoints wrap their payload one extra `data` level deeper than others
// when called under our stopgap token instead of a real browser session (confirmed on
// /okr/performance/default/assignments/, /review/get_ratings_for_org, and now
// /review/create_calibration) — try every nesting depth actually seen so far instead of
// hardcoding one and having each call site rediscover this the hard way.
export function extractField(data, field) {
  return data?.[field] ?? data?.data?.[field] ?? data?.data?.data?.[field] ?? null
}

// Node analog of buildHeaders() in src/core/api.js — reads the stopgap credentials
// from env vars instead of localStorage/location.
export function stopgapHeaders(extra = {}) {
  return {
    'Authorization': 'Bearer ' + process.env.KLAAR_STOPGAP_TOKEN,
    'workspace-id':  process.env.KLAAR_STOPGAP_WORKSPACE_ID,
    'client-domain': process.env.KLAAR_STOPGAP_CLIENT_DOMAIN,
    'client_domain': process.env.KLAAR_STOPGAP_CLIENT_DOMAIN,
    'Accept': 'application/json, text/plain, */*',
    ...extra,
  }
}

// Node analog of api() in src/core/api.js.
export async function klaarApi(path, init = {}) {
  const opts = {
    method: init.method || 'GET',
    headers: stopgapHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  }
  if (init.body) opts.body = init.body
  let res, text = '', data = null
  try {
    res  = await fetch(process.env.KLAAR_STOPGAP_API_BASE + path, opts)
    text = await res.text().catch(() => '')
    try { data = JSON.parse(text) } catch {}
    if (data && typeof data.data === 'string') {
      const decrypted = tryDecrypt(data.data)
      if (decrypted !== null) data.data = decrypted
    }
    return { res, status: res.status, ok: res.ok, data, text }
  } catch (e) {
    console.error('[klaarApi] fetch error', opts.method, path, e.message)
    return { res: null, status: 0, ok: false, data: null, text: e.message }
  }
}

// The repeated "read + validate KLAAR_STOPGAP_EMAIL_DOMAIN" guard, factored out once.
// Used by any module that needs to build a known person's email (users, goals, ...).
export function getStopgapDomain() {
  const domain = process.env.KLAAR_STOPGAP_EMAIL_DOMAIN
  if (!domain) return { domain: null, error: { ok: false, message: 'KLAAR_STOPGAP_EMAIL_DOMAIN env var not set.' } }
  return { domain, error: null }
}

// Search the workspace's employees for an exact email match and return their org_user
// UUID — the generic "search by email" piece of resolveCreatedUuid() in UserModule
// (which also has POST-response-shape handling specific to just-created employees).
// Any module that needs "this known person's real Klaar ID" can use this directly.
export async function resolveUuidByEmail(email) {
  const sr = await klaarApi(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
  const match = searchResults(sr).find(e =>
    [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
  )
  return match?.org_user?.id || match?.id || match?.user?.id
}

// Resolve the is_admin-flagged manager's real org_user UUID — used as an admin identity
// (OKR "sheet_user_id", review ownership, etc.) across modules. Same approach as
// UserModule's admin-identity resolution (see UserModule/addGroupJob.js's comment for
// why): a real logged-in admin's JWT doesn't scale per-workspace, but this manager
// already gets real is_admin: 'YES' rights via putUserProfiles() once /create-manager
// has run. Originally lived in GoalsModule/goalsCore.js; promoted here once ReviewsModule
// needed the exact same resolution.
export async function resolveSheetUserId() {
  const { domain, error } = getStopgapDomain()
  if (error) return { error: error.message }

  const adminManager = MANAGERS.find(m => m.is_admin)
  if (!adminManager) return { error: 'No manager flagged is_admin in MANAGERS — needed as the sheet owner.' }

  const email = `${adminManager.email_prefix}@${domain}`.toLowerCase()
  const sheetUserId = await resolveUuidByEmail(email)
  if (!sheetUserId) return { error: `Could not resolve ${email}'s UUID — has /create-manager run for this workspace?` }

  return { sheetUserId }
}

// Ported from the GET fallback in createGoals()/defaultGoals() in src/modules/goals/
// actions.js — the browser prefers state.timePeriods (set by createTimePeriod() earlier
// in the same session) and only fetches live if that's empty. We have no shared state,
// so this always fetches live instead. Also used by ReviewsModule's createReviewsJob,
// which needs the same time-period list to cycle reviews across.
export async function fetchTimePeriods(sheetUserId) {
  const r = await klaarApi(`/okr/performance/time_period/?sheet_user_id=${sheetUserId}`)
  return r.ok ? (r.data?.results || r.data?.data || []) : []
}

// Pick the time period that covers today, or fall back to the first one found. Every
// OKR-creation job needs "the" active period the same way createGoals() does, so this
// centralizes that pick instead of repeating it per file.
export async function resolveActivePeriod(sheetUserId) {
  const periods = await fetchTimePeriods(sheetUserId)
  const today = new Date().toISOString().slice(0, 10)
  const active = periods.find(p => p.id && p.start_at <= today && today <= p.end_at)
  return active || periods.find(p => p.id) || null
}

// Shared pagination loop backing both fetchAllGroups() and fetchWorkspaceGroupId() below —
// same endpoint already proven working via /add-group and /bulk-upload-group.
async function _fetchAllGroupsRaw() {
  let page = 0, all = [], hasMore = true
  while (hasMore && page < 50) {
    const r = await klaarApi(`/groupsj/api/v1/groups/paginated/?size=100&page=${page}&forDropdown=false`)
    if (!r.ok) break
    const list = (r.data && r.data.data) || []
    all.push(...list)
    hasMore = list.length >= 100
    page++
  }
  return all
}

// Every group currently in the workspace — used to rotate Group OKRs/KRs/child
// objectives (and Reviews' reviewee groups) across multiple real groups instead of
// piling everything onto one.
export async function fetchAllGroups() {
  return _fetchAllGroupsRaw()
}

// Ported from the "prefer custom groups, exclude built-ins" filter in createReviews()
// (src/modules/reviews/actions.js) — promoted here once IDPs' createIDP()/createPIP()
// needed the exact same logic for their own group-cycling, matching ReviewsModule's own
// usableGroups pattern instead of tripling it.
export async function resolveUsableGroups() {
  const groups = (await fetchAllGroups()).filter(g => g.id)
  const customGroups = groups.filter(g => !/^(all\s*company|workspace\s*group)/i.test(g.name || ''))
  return customGroups.length ? customGroups : groups
}

// Ported from fetchGroups() in src/utils/fetchGroups.js, trimmed to just the group-id
// pick (no state write): prefer "All Company", then a "Workspace Group"-named one, then
// the largest group by member count. The original groupOKR()/keyResultGroup()/
// addChildObjectiveGroup() all just read the singular state.workspaceGroupId — which,
// per this repo's own users/actions.js, is actually only ever populated as a side effect
// of fetchGroups() (neither addGroup() nor bulkUploadGroup() sets that exact key, a
// pre-existing gap in the original code). Re-deriving it live here sidesteps that gap
// entirely rather than inheriting it. Used for createTimePeriodJob's optional single
// group association, where "one best group" is the right call, not a rotation.
export async function fetchWorkspaceGroupId() {
  const all = await _fetchAllGroupsRaw()
  const allCompany = all.find(g => /^all\s*company$/i.test(g.name || ''))
  const defaultWs  = all.find(g => /workspace\s*group/i.test(g.name || ''))
  const largest    = all.slice().sort((a, b) => (b.groupMembersCount || 0) - (a.groupMembersCount || 0))[0]
  return (allCompany || defaultWs || largest)?.id || null
}

// response_url is valid ~30 min and usable up to 5 times; it can legitimately
// 404/410 once expired — non-fatal, just log and move on.
export async function postToResponseUrl(responseUrl, payload) {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.warn('[postToResponseUrl] failed to deliver to response_url:', e.message)
  }
}

// Shared by every job's runXJob({response_url}) wrapper — never throws, always posts
// either the real result or a Slack-shaped error message to response_url.
export async function runJobAndReply(jobFn, response_url) {
  let result
  try {
    result = await jobFn()
  } catch (e) {
    console.error('[runJobAndReply] job threw:', e.message)
    result = { ok: false, message: `Unexpected error: ${e.message}` }
  }

  await postToResponseUrl(response_url, {
    response_type: result.ok ? 'in_channel' : 'ephemeral',
    text: result.ok ? result.message : `⚠️ ${result.message}`,
  })
}
