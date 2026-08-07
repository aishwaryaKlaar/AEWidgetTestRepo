import { api, getAdminUserIdFromJwt } from '../core/api.js'
import { state, saveState } from '../core/state.js'
import { searchResults } from '../core/helpers.js'

export async function fetchUsers() {
  let page = 1, all = [], hasMore = true
  while (hasMore && page < 30) {
    const url = `/um/accounts/employee/?page=${page}&page_size=100&search=&get_disabled=true&filter=%5B%5D`
    const r = await api(url)
    if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` }
    const list = searchResults(r)
    all.push(...list)
    hasMore = !!(r.data?.data?.next || r.data?.next)
    page++
  }
  state.users = all.map(u => ({
    user_id:       u.user?.id,
    full_name:     u.user?.full_name,
    email:         u.user?.email,
    org_user_id:   u.org_user?.id,
    roles:         u.org_user?.roles,
    status:        u.user?.status,
    department:    u.user?.department,
    title:         u.user?.title,
    business_unit: u.user?.business_unit,
    manager_email: u.user?.manager,
    employee_id:   u.user?.employee_id,
  }))
  const myId = getAdminUserIdFromJwt()
  const me = all.find(u => u.user?.id === myId)
  if (me) {
    state.adminUserId    = me.user.id
    state.adminOrgUserId = me.org_user?.id
    state.adminEmail     = me.user.email
    state.adminFullName  = me.user.full_name
  }
  saveState()
  return {
    ok: true,
    message: `Fetched ${all.length} users` + (me ? `; admin = ${state.adminFullName}` : ''),
    data: { count: all.length },
  }
}
