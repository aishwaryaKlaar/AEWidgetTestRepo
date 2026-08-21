// Users-module-specific Node-safe helpers for the Slack slash-command jobs. Generic,
// module-agnostic pieces (auth, fetch wrapper, response posting) live in
// api/_lib/shared/klaarCore.js and are re-exported here so every existing job file's
// `import {...} from './klaarStopgapCore.js'` keeps working unchanged.
export {
  errorBodyText, searchResults, stopgapHeaders, klaarApi,
  getStopgapDomain, resolveUuidByEmail, postToResponseUrl, runJobAndReply,
} from '../shared/klaarCore.js'

import { klaarApi, searchResults, errorBodyText, getStopgapDomain, resolveUuidByEmail, stopgapHeaders } from '../shared/klaarCore.js'

export function buildEmployeePayload(user, overrides = {}) {
  return {
    data: Object.assign({
      email:                    user.email,
      personal_email:           null,
      gender:                   null,
      mobile_number:            null,
      date_of_birth:            null,
      nationality:              null,
      home_address:             null,
      verification_status:      user.status || 'active',
      status:                   user.status || 'active',
      national_id_no:           null,
      social_security_no:       null,
      social_security_1:        null,
      social_security_2:        null,
      roles:                    (user.roles || []).filter(r => r && r.toLowerCase() !== 'manager'),
      user_id:                  null,
      date_of_joining:          null,
      is_fulltime_employee:     'YES',
      department:               user.department    || null,
      department_code:          null,
      level:                    null,
      level_code:               null,
      discipline:               null,
      discipline_code:          null,
      location:                 null,
      location_code:            null,
      business_unit:            user.business_unit || null,
      business_unit_code:       null,
      title:                    user.title         || null,
      title_code:               null,
      legal_entity:             null,
      hiring_date:              null,
      manager_email:            user.manager_email || null,
      hrbp_email:               null,
      hrbp_list:                [],
      primary_matrix_manager_id:   null,
      secondary_matrix_manager_id: null,
      sepration_status:         null,
      date_of_resignation:      null,
      date_of_exit:             null,
      grade:                    null,
      grade_code:               null,
      work_address:             null,
      workspace_role:           '',
      confirmation_date:        null,
      cost:                     '0.00',
      cost_center:              null,
      is_admin:                 'NO',
      is_survey_creator:        'NO',
      is_employee:              'NO',
      teams_admin:              'NO',
      teams_manager:            'NO',
      teams_viewer:             'NO',
      teams_browser:            'NO',
      mentoring_admin:          'NO',
      mentoring_program_admin:  'NO',
      idp_admin:                'NO',
      nomination_creator:       'NO',
      review_creator:           'NO',
      extra:                    {},
      id:                       user.org_user_id || user.user_id,
      name:                     user.full_name,
    }, overrides),
  }
}

// Ported from the 'create_mailbox' action in api/migadu.js (lines 81-109) — duplicated
// rather than called over HTTP, since this runs in the same deployment. Reuses the same
// MIGADU_EMAIL/MIGADU_API_KEY/MIGADU_DEFAULT_PASSWORD env vars already set for that function.
// Mirrors createMigaduMailbox() in src/core/migadu.js: returns true/false, never throws.
export async function createMailbox(domain, localPart, displayName) {
  const migaduEmail = process.env.MIGADU_EMAIL
  const migaduKey   = process.env.MIGADU_API_KEY
  const defaultPassword = process.env.MIGADU_DEFAULT_PASSWORD
  if (!migaduEmail || !migaduKey || !defaultPassword) {
    console.warn('[createMailbox] MIGADU_EMAIL/MIGADU_API_KEY/MIGADU_DEFAULT_PASSWORD env vars not set')
    return false
  }

  const auth = Buffer.from(`${migaduEmail}:${migaduKey}`).toString('base64')
  const migaduHeaders = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }

  try {
    const r = await fetch(`https://api.migadu.com/v1/domains/${domain}/mailboxes/`, {
      method:  'POST',
      headers: migaduHeaders,
      body:    JSON.stringify({
        local_part:        localPart,
        name:              displayName || localPart,
        password:          defaultPassword,
        is_sender_allowed: true,
      }),
    })
    let data = {}
    try { data = await r.json() } catch (_) { data = { error: await r.text().catch(() => 'unknown') } }

    const alreadyExists = r.status === 409 ||
      (typeof data.local_part === 'string' && data.local_part === localPart)
    if (!r.ok && !alreadyExists) {
      console.warn(`[createMailbox] ${localPart}@${domain} failed:`, data.error || JSON.stringify(data))
    }
    return r.ok || alreadyExists
  } catch (e) {
    console.warn('[createMailbox] fetch error:', e.message)
    return false
  }
}

// Ported from resolveCreatedUuid() in src/modules/users/actions.js. The POST-response-shape
// check here is specific to just-created employees; the fallback delegates to the generic
// resolveUuidByEmail() in shared/klaarCore.js.
export async function resolveCreatedUuid(r, email) {
  if (r?.ok) {
    const dataField = r.data?.data
    const rec = Array.isArray(dataField) ? dataField[0]
      : Array.isArray(r.data?.results)    ? r.data.results[0]
      : Array.isArray(r.data)             ? r.data[0]
      : null
    const uuid = rec?.id || rec?.org_user?.id || rec?.org_user_id
    if (uuid) return uuid
  }
  return resolveUuidByEmail(email)
}

// Ported 1:1 from fetchParamMap()/fetchWorkspaceParamMaps() in src/modules/users/actions.js.
export async function fetchParamMap(paramType) {
  const map = {}
  try {
    let page = 1
    while (true) {
      const r = await klaarApi(`/um/accounts/workspace_role/meta/param/value/?param_type=${paramType}&page_size=50&page=${page}`)
      if (!r.ok || !r.data?.results?.length) break
      for (const rec of r.data.results) {
        if (rec.value && rec.id) map[rec.value] = rec.id
      }
      if (!r.data.next) break
      page++
    }
  } catch (e) {
    console.warn(`[fetchParamMap] fetchParamMap(${paramType}) error:`, e.message)
  }
  return map
}

export async function fetchWorkspaceParamMaps() {
  const buUuidMap       = await fetchParamMap('business_unit')
  const levelUuidMap    = await fetchParamMap('level')
  const locationUuidMap = await fetchParamMap('location')
  return { buUuidMap, levelUuidMap, locationUuidMap }
}

// Ported 1:1 from putUserProfiles() in src/modules/users/actions.js.
export async function putUserProfiles(users, domain, emailToId, paramMaps) {
  const { buUuidMap, levelUuidMap, locationUuidMap } = paramMaps
  const updated = [], updateFailed = []

  for (let i = 0; i < users.length; i++) {
    const u = users[i]
    const email = `${u.email_prefix}@${domain}`
    const uuid = emailToId[email.toLowerCase()]?.uuid

    const buId       = buUuidMap.hasOwnProperty(u.business_unit) ? u.business_unit : null
    const levelId    = levelUuidMap.hasOwnProperty(u.level)       ? u.level         : null
    const locationId = locationUuidMap.hasOwnProperty(u.location) ? u.location      : null

    const putPayload = buildEmployeePayload({
      email,
      full_name:     u.full_name,
      org_user_id:   uuid,
      status:        'active',
      department:    u.department,
      business_unit: buId,
      title:         u.title,
      manager_email: u.manager_prefix ? `${u.manager_prefix}@${domain}` : null,
      roles:         [],
    }, {
      mobile_number:        u.phone,
      gender:               u.gender,
      date_of_joining:      u.date_of_joining,
      location:             locationId,
      level:                levelId,
      grade:                levelId,
      hrbp_email:           u.hrbp_prefix ? `${u.hrbp_prefix}@${domain}` : null,
      is_admin:             u.is_admin ? 'YES' : 'NO',
      is_employee:          'YES',
      is_fulltime_employee: u.employment_type === 'Full Time' ? 'YES' : 'NO',
    })

    const rPut = await klaarApi('/um/accounts/employee/', {
      method: 'PUT',
      body: JSON.stringify(putPayload),
    })

    if (rPut.ok) {
      updated.push(u.full_name)
    } else {
      console.warn(`[putUserProfiles] PUT failed for ${u.full_name}:`, rPut.status, errorBodyText(rPut).slice(0, 500))
      updateFailed.push(`${u.full_name} (PUT ${rPut.status})`)
    }
    await new Promise(res => setTimeout(res, 200))
  }

  return { updated, updateFailed }
}

// Generic "create + mailbox + resolve UUID, then PUT full profile" loop shared by
// addManagersJob and addEmployeesJob — the only difference between those two steps
// in the browser widget is which slice of DUMMY_USERS gets passed in.
export async function createAndProfileUsers(users) {
  const { domain, error } = getStopgapDomain()
  if (error) return error

  const created = [], failed = []

  for (const u of users) {
    const email = `${u.email_prefix}@${domain}`

    await createMailbox(domain, u.email_prefix, u.full_name)

    const r = await klaarApi('/um/accounts/employee/', {
      method: 'POST',
      body: JSON.stringify({
        data: [{
          full_name:            u.full_name,
          email,
          title:                u.title,
          department:           u.department,
          business_unit:        null,
          mobile_number:        null,
          location:             u.location,
          manager_email:        null,
          hrbp_email:           null,
          is_admin:             u.is_admin ? 'YES' : 'NO',
          hrbp:                 u.is_hrbp  ? 'YES' : 'NO',
          is_employee:          'YES',
          is_fulltime_employee: u.employment_type === 'Full Time' ? 'YES' : 'NO',
          status:               'active',
          verification_status:  'active',
        }],
        send_mail: false, single_mode: true,
      }),
    })

    if (r.ok) {
      const uuid = await resolveCreatedUuid(r, email)
      created.push({ name: u.full_name, email, uuid })
    } else {
      const bodyText = errorBodyText(r)
      if (r.status === 400 && (bodyText.includes('exist') || bodyText.includes('already'))) {
        const uuid = await resolveCreatedUuid(null, email)
        created.push({ name: u.full_name, email, uuid })
      } else {
        failed.push(`${u.full_name} (${r.status})`)
        console.warn(`[createAndProfileUsers] POST failed for ${u.full_name}:`, r.status, bodyText.slice(0, 200))
      }
    }
    await new Promise(res => setTimeout(res, 200))
  }

  const emailToId = {}
  for (const m of created) {
    if (m.email && m.uuid) emailToId[m.email.toLowerCase()] = { uuid: m.uuid }
  }

  const paramMaps = await fetchWorkspaceParamMaps()
  const { updated, updateFailed } = await putUserProfiles(users, domain, emailToId, paramMaps)

  return { ok: true, domain, created, failed, updated, updateFailed, total: users.length }
}

// Ported verbatim from createGroup() in src/modules/users/actions.js:804. Tries the
// CSV-upload endpoint first (proven to work on India/US prod), falling back to the
// plain JSON endpoint if that fails — which the source code's own comment flags as
// the expected outcome on dev-api specifically, our stopgap target environment.
export async function createGroup(name, members, adminEmail, adminOrgUserId) {
  const memberEmails = members.map(m => m.email).filter(Boolean)

  if (memberEmails.length && adminEmail) {
    const csvLines = ['members,admins']
    for (let k = 0; k < memberEmails.length; k++) {
      csvLines.push(`${memberEmails[k]},${k === 0 ? adminEmail : ''}`)
    }
    const formData = new FormData()
    formData.append('file', new Blob([csvLines.join('\n')], { type: 'text/csv' }), 'members.csv')

    try {
      const res = await fetch(
        process.env.KLAAR_STOPGAP_API_BASE + `/groupsj/api/v1/groups/csv?name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: stopgapHeaders(), body: formData }
      )
      if (res.ok) return { ok: true }
      const txt = (await res.text()).toLowerCase()
      if (res.status === 400 && txt.includes('exist')) return { ok: true, existing: true }
      console.warn(`[createGroup] CSV upload failed for "${name}" (${res.status}) — falling back to JSON endpoint`)
    } catch (e) {
      console.warn(`[createGroup] CSV upload fetch error for "${name}":`, e.message)
    }
  }

  const memberIds = members.map(m => m.uuid).filter(Boolean)
  if (!memberIds.length || !adminOrgUserId) return { ok: false, status: 400 }

  const r = await klaarApi('/groupsj/api/v1/groups/', {
    method: 'POST',
    body: JSON.stringify({ name, description: '', adminIds: [adminOrgUserId], memberIds }),
  })
  if (r.ok) return { ok: true }
  const body = errorBodyText(r)
  if (r.status === 400 && body.includes('exist')) return { ok: true, existing: true }
  return { ok: false, status: r.status }
}

// Fetch up to `pageSize` employees currently in the workspace as {email, uuid} pairs.
// Shared by any job that needs real UUIDs for existing employees without a durable
// store — just re-fetch live each run (mirrors bulkUploadGroup()'s own fallback fetch
// at src/modules/users/actions.js:847, and resolveCreatedUuid()'s single-email search).
export async function fetchAllEmployees(pageSize = 100) {
  const r = await klaarApi(`/um/accounts/employee/?page=1&page_size=${pageSize}`)
  const results = r.ok ? searchResults(r) : []
  return results
    .map(e => ({
      email: e.email || e.company_email || e.user?.email || e.work_email,
      uuid:  e.org_user?.id || e.id || e.user?.id,
    }))
    .filter(m => m.email)
}

// Given the MANAGERS array, `domain`, and an already-fetched members list, resolve the
// is_admin-flagged manager's email + real UUID — the identity createGroup() needs for its
// adminEmail/adminOrgUserId params. Shared by addGroupJob and bulkUploadGroupJob so both
// avoid the JWT-harvesting problem the same way (see addGroupJob.js's comment for why).
export function resolveAdminIdentity(managers, domain, members) {
  const adminManager = managers.find(m => m.is_admin)
  if (!adminManager) return { error: 'No manager flagged is_admin — needed as the group admin.' }
  const adminEmail = `${adminManager.email_prefix}@${domain}`.toLowerCase()
  const adminOrgUserId = members.find(m => m.email?.toLowerCase() === adminEmail)?.uuid
  if (!adminOrgUserId) return { error: `Could not resolve ${adminEmail}'s UUID — has /create-manager run for this workspace?` }
  return { adminEmail, adminOrgUserId }
}
