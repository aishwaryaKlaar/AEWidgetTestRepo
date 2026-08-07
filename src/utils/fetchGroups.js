import { api } from '../core/api.js'
import { state, saveState } from '../core/state.js'

export async function fetchGroups() {
  let page = 0, all = [], hasMore = true
  while (hasMore && page < 50) {
    const url = `/groupsj/api/v1/groups/paginated/?size=100&page=${page}&forDropdown=false`
    const r = await api(url)
    if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` }
    const list = (r.data && r.data.data) || []
    all.push(...list)
    hasMore = list.length >= 100
    page++
  }
  state.groups = all.map(g => ({ id: g.id, name: g.name, source: g.source }))
  const allCompany = all.find(g => /^all\s*company$/i.test(g.name || ''))
  const defaultWs  = all.find(g => /workspace\s*group/i.test(g.name || ''))
  const largest    = all.slice().sort((a, b) => (b.groupMembersCount || 0) - (a.groupMembersCount || 0))[0]
  const chosen = allCompany || defaultWs || largest
  if (chosen) {
    state.workspaceGroupId   = chosen.id
    state.workspaceGroupName = chosen.name
  }
  saveState()
  return {
    ok: true,
    message: `Fetched ${all.length} groups` + (chosen ? `; using "${chosen.name}"` : '; no usable group found'),
    data: { count: all.length },
  }
}
