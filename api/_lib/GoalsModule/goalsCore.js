// Goals-module-specific helper. The generic pieces this file used to hold
// (resolveSheetUserId, fetchTimePeriods, resolveActivePeriod, fetchAllGroups,
// fetchWorkspaceGroupId) have been promoted to api/_lib/shared/klaarCore.js now that
// ReviewsModule needs the exact same resolutions — re-exported here so every existing
// GoalsModule job file's `import {...} from './goalsCore.js'` keeps working unchanged.
export {
  resolveSheetUserId, fetchTimePeriods, resolveActivePeriod,
  fetchAllGroups, fetchWorkspaceGroupId,
} from '../shared/klaarCore.js'

import { klaarApi } from '../shared/klaarCore.js'

// Live-fetch this workspace's existing objectives and match them by name (in the same
// order as `names`) to recover the IDs individualOKR()/groupOKR() created earlier — no
// durable store, same "re-derive live" pattern used throughout this project.
//
// CONFIRMED live (captured from Klaar's own "My Goals" page network traffic): the real
// list endpoint is /okr/performance/all_objectives/, not /okr/performance/objective/ —
// the browser widget only ever POSTs to the latter, so there was no prior art for this
// and an earlier guess at the wrong path 500'd unconditionally regardless of query params.
// Response comes back wrapped one level deeper than Klaar's own browser network capture
// showed: our stopgap-token call gets {data: {count, next, previous, results}}, not a
// bare {count, next, previous, results} — confirmed live (klaarApi's decrypt check only
// fires when data.data is a *string*, so this plain-object wrapper passes through
// untouched, same "extra data envelope" pattern seen on default/assignments' create
// response elsewhere in this project). Filters to state=Published, matching what objects
// created without an explicit `state` field default to (confirmed: individualOKR's
// created records showed up this way).
export async function resolveObjectiveIds(names, sheetUserId, timePeriodId) {
  const filter = encodeURIComponent(JSON.stringify([['state', '__in', ['Published'], '']]))
  const found = new Map()
  let page = 1, hasMore = true
  while (hasMore && page < 50 && found.size < names.length) {
    const r = await klaarApi(
      `/okr/performance/all_objectives/?sheet_user_id=${sheetUserId}&time_period_id=${timePeriodId}` +
      `&page=${page}&page_size=100&sort_by_key=created_at&sort_by_value=DESC&filter=${filter}`
    )
    if (!r.ok) break
    const page_ = r.data?.data ?? r.data
    const results = page_?.results || []
    for (const o of results) {
      if (o?.name && o?.id && !found.has(o.name)) found.set(o.name, o.id)
    }
    hasMore = !!page_?.next && results.length > 0
    page++
  }
  return names.map(name => found.get(name) || null)
}
