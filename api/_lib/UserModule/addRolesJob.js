// Node-safe port of addRoles() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar logic lives in klaarStopgapCore.js.
//
// Departments/business units are NOT derived from MANAGERS/EMPLOYEES (the browser's
// state.userDepartments/state.userBusinessUnits equivalent) — see the comment on
// addRolesJob() below for why that was actually the root cause of collisions, not a fix
// for them.
//
// The create response never includes an id (confirmed live — success is
// `{data:{success:true,message:"role is created"}}`, no id, ever), so `r.ok` alone is the
// right success signal — matching the original browser code. A 400 collision with a
// DIFFERENTLY-named role is reported as a real failure; only a same-name collision
// (genuinely the role we wanted, from an earlier run) counts as existing/success.
import { klaarApi, searchResults, errorBodyText, runJobAndReply } from './klaarStopgapCore.js'

// The 6 role names from DUMMY_ROLES in src/modules/users/actions.js:9-16.
const DUMMY_ROLES = [
  'Applied AI & Agentic Systems Lead',
  'Decentralized Identity Architect',
  'Cloud Unit Economics & FinOps Director',
  'Hyperscale Infrastructure Reliability Principal',
  'Platform Developer Experience Specialist',
  'Enterprise Data Provenance Strategist',
];

// Ported 1:1 from fetchParamIds() (a closure inside addRoles() in actions.js).
async function fetchParamIds(paramType, nameFilter) {
  const ids = []
  let page = 1
  while (ids.length < 6) {
    const r = await klaarApi(`/um/accounts/workspace_role/meta/param/value/?param_type=${paramType}&page_size=50&page=${page}`)
    const pageResults = r.ok ? searchResults(r) : []
    if (!pageResults.length) break
    const matched = pageResults
      .filter(d => !nameFilter.length || nameFilter.includes(d.value))
      .map(d => d.id).filter(Boolean)
    ids.push(...matched)
    if (!(r.data?.data?.next || r.data?.next) || ids.length >= 6) break
    page++
  }
  return ids
}

// Ported from addRoles() in actions.js, minus the state.js read/write. Deliberately NOT
// narrowed to MANAGERS/EMPLOYEES' own department/business_unit values (as the browser's
// state.userDepartments/state.userBusinessUnits does) — that artificially limited role
// creation to only 5 departments / 2 business units, guaranteeing collisions on repeated
// runs. fetchParamIds() with an empty filter returns everything Klaar already has
// configured for this workspace (confirmed live via GET /um/accounts/org/department/
// details/: this org has 9 real departments, 4 of which — Talent Management, Operations,
// Business Development, Corporate Strategy — have zero roles on them at all), so this
// gives every run access to genuinely unused department+business_unit slots instead of
// recycling the same narrow 5.
export async function addRolesJob() {
  const deptIds = await fetchParamIds('department',    [])
  const buIds   = await fetchParamIds('business_unit', [])

  const created = [], failed = []

  for (let i = 0; i < DUMMY_ROLES.length; i++) {
    const name   = DUMMY_ROLES[i]
    const params = []

    if (deptIds.length) {
      params.push({ param_type: 'department',    param_condition: 'list', param_values: [deptIds[i % deptIds.length]] })
    }
    if (buIds.length) {
      params.push({ param_type: 'business_unit', param_condition: 'list', param_values: [buIds[i % buIds.length]] })
    }

    const r = await klaarApi('/um/accounts/workspace_role/', {
      method: 'POST',
      body: JSON.stringify({ name, params }),
    })
    if (r.ok) {
      created.push({ name })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && body.includes('same name')) {
        // A role with THIS exact name already exists — genuinely the role we wanted,
        // just created by an earlier run. Idempotent re-run, matches other commands.
        created.push({ name, existing: true })
      } else if (r.status === 400 && body.includes('exist')) {
        // A DIFFERENT role already occupies this department+business_unit combination.
        // Report honestly rather than claiming the attempted name was added.
        failed.push(`${name} (param combination already used by a differently-named role)`)
      } else {
        failed.push(`${name} (${r.status})`)
      }
    }
  }

  if (failed.length) return { ok: false, message: `Created ${created.length}/${DUMMY_ROLES.length}, failed: ${failed.join(', ')}` }
  return { ok: true, message: `Added ${created.length} roles: ${created.map(r => r.name).join(', ')}` }
}

export async function runAddRolesJob({ response_url }) {
  await runJobAndReply(addRolesJob, response_url)
}
