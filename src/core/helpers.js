import { state } from './state.js'

// UUID generator with crypto.randomUUID fallback
export function _uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Some Klaar endpoints return error bodies AES-encrypted (see core/api.js,
// which decrypts `data.data` in place when possible). Prefer that decrypted
// content for substring checks (e.g. "already exists"); fall back to the raw
// response text for endpoints/responses that aren't encrypted.
export function errorBodyText(r) {
  const decrypted = r.data?.data
  const text = typeof decrypted === 'string' ? decrypted
    : decrypted ? JSON.stringify(decrypted)
    : (r.text || '')
  return text.toLowerCase()
}

// Some services (e.g. /survey/feedback-nomination/) further wrap their
// already-decrypted payload as {success, message, data: {...actual object...}}
// (or data: [...actual array...]). This peels through both the outer
// HTTP-response `.data` wrapper (see core/api.js) AND that inner envelope,
// so callers always get the real business object/array regardless of how
// many layers a given service happens to wrap its response in.
export function unwrapPayload(r) {
  let d = r.data?.data ?? r.data
  if (d && typeof d === 'object' && !Array.isArray(d) && 'data' in d && ('success' in d || 'message' in d)) {
    d = d.data
  }
  return d
}

// Paginated list endpoints (e.g. /um/accounts/employee/?search=...) wrap their
// {count, results, ...} body as an encrypted `data` string. core/api.js decrypts
// it in place, but that lands the real payload at `r.data.data.results` —
// one level deeper than an unencrypted list response's `r.data.results`.
// Check both shapes so this works whether or not a given response was encrypted.
export function searchResults(r) {
  return r.data?.data?.results || r.data?.results || []
}

// Find a user in state by name (case-insensitive substring match)
export function findUserByName(name) {
  if (!state.users || !Array.isArray(state.users)) return null
  const lower = name.toLowerCase()
  return state.users.find(u => {
    const full = (u.full_name || '').toLowerCase()
    return full === lower || full.includes(lower)
  })
}

// Build the standard ~50-field employee PUT payload.
// Klaar returns "manager" as a derived role but the PUT endpoint rejects it — strip it.
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

// Returns an async function that reports "not yet wired"
export function notImplemented(intent) {
  return async function () {
    return { ok: false, message: 'Not yet wired — ' + intent }
  }
}
