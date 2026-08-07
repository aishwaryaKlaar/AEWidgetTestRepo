import { api } from '../core/api.js'
import { state, saveState } from '../core/state.js'

export async function fetchTimePeriods() {
  const adminId = state.adminUserId || state.adminOrgUserId || ''
  if (!adminId) return { ok: false, message: 'Admin unknown — run "Bulk Upload User" first.' }
  let page = 1, all = [], hasMore = true
  while (hasMore && page < 30) {
    const url = `/okr/performance/time_period/?sheet_user_id=${adminId}&page=${page}&page_size=10`
    const r = await api(url)
    if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` }
    const list = (r.data && r.data.results) || []
    all.push(...list)
    hasMore = !!(r.data && r.data.next)
    page++
  }
  state.timePeriods = all.map(tp => ({ id: tp.id, name: tp.name, start_at: tp.start_at, end_at: tp.end_at }))
  const cy = all.find(tp => /^CY\s/i.test(tp.name || ''))
  if (cy) state.timePeriodId = cy.id
  saveState()
  return {
    ok: true,
    message: `Fetched ${all.length} time periods` + (cy ? `; CY = ${cy.name}` : ''),
    data: { count: all.length },
  }
}
