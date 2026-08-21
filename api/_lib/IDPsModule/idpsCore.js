// IDPs-module-specific shared helpers: the workspace-level IDP/PIP setup shared by both
// Create IDP and Create PIP (exactly as in the browser widget — _setupPlans() is called
// from both createIDP() and createPIP() in src/modules/idps/actions.js too), and
// competency-type resolution for Create Competencies.
import { klaarApi } from '../shared/klaarCore.js'
import { resolveRatingScaleIds, _extractArray } from '../ReviewsModule/reviewsCore.js'
import { RATING_SCALE_NAMES } from '../ReviewsModule/createRatingScaleJob.js'

// Ported verbatim from buildIdpOtherSettings() in actions.js, except
// workspace_admins_to_send_notification now takes an explicit adminUuid param instead of
// reading state.adminUserId/state.adminOrgUserId — resolved live via resolveSheetUserId()
// by the caller, same admin-identity trick used across every other module.
function buildIdpOtherSettings(srsds, adminUuid) {
  return {
    toen: true, uepipg: true, uepipai: true, uepiptd: true,
    mepipg: true, mepipai: true, mepiptd: true, pipaidm: true,
    pipcg: true, pipcai: true, pipmg: 10, pipmai: 10, efrds: true,
    srsds, epipier: true, epipiec: true, piprdmta: 0,
    pipaem: true, pipaei: true, pipaeaa: true, pipaa: false, pipa: true,
    meidpg: true, meidpai: true, meidptd: true, mg: true, mai: true,
    idpa: true, idpr: true, pipr: true, pipauagt: true, pipauaat: true,
    pipmap: true, pipgdm: true, idpuaseg: true, idpuaseai: true,
    pipuaseg: true, pipuaseai: true, aicm: true, aidm: true, gcm: true,
    gdm: true, pdm: false,
    custom_labels: { idp: 'IDP', pip: 'PIP', action_item_name_column: 'Name', action_item: 'Action items', goals: 'Goals' },
    last_updated: new Date().toISOString(),
    allow_user_to_add_goal_type: true, allow_user_to_add_action_type: true,
    tracking_goal_and_action_item: 'status', maximum_action_items: 9,
    display_duedate_for_goal_and_action_items: false,
    allow_user_to_add_development_plan: true,
    goal_status_list: ['Getting Started', 'On Track', 'Completed'],
    workspace_admins_to_send_notification: [adminUuid].filter(Boolean),
    reminder_configuration: {
      times: [], channels: ['EMAIL', 'SLACK'],
      monthly: { one: { days: [] }, two: { days: [] }, three: { days: [] }, four: { days: [] }, five: { days: [] } },
      time: '11:40',
      weekly: { days: [
        { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'THURSDAY' },
        { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'FRIDAY' },
      ] },
      every_hour: false,
    },
    action_item_status_list: ['Getting Started', 'On Track', 'Completed'],
    allow_user_to_add_date_action_items: true, maximum_goals: 10,
    AICM: true, AIDM: true, GCM: true, GDM: true, PDM: false,
  }
}

// Ported from _setupPlans() in actions.js, minus the state.js reads/writes: no
// state.idpClassificationsSetup gate — with no durable state, every run just re-attempts
// classification creation, which is already idempotent via the "already exists" check
// below (matching how every other module re-derives everything live). The rating scale for
// srsds is resolved live via ReviewsModule's confirmed real list endpoint instead of reading
// state.ratingScaleId — if none exist yet (Create Rating Scale hasn't run), that update step
// is just skipped, same as the browser's own fallback when state.ratingScaleId is unset.
export async function setupPlans(adminUuid) {
  const wsId = process.env.KLAAR_STOPGAP_WORKSPACE_ID
  if (!wsId) return { ok: false, message: 'KLAAR_STOPGAP_WORKSPACE_ID env var not set.' }
  const pasUrl = `/pas/api/v1/pas/${wsId}`

  let r = await klaarApi(pasUrl, {
    method: 'PATCH',
    body: JSON.stringify({ org_level: { allowed_modules: { idp: {
      other_settings: buildIdpOtherSettings([], adminUuid),
      sub_modules: { development_plans: { is_visible: true }, my_team: { is_visible: true }, admin_overview: { is_visible: true }, admin_development_plans: { is_visible: true } },
    } } } }),
  })
  if (!r.ok) return { ok: false, message: `PAS baseline failed: ${r.status}` }

  const ratingScaleIds = (await resolveRatingScaleIds(RATING_SCALE_NAMES)).filter(Boolean)
  const ratingScaleId = ratingScaleIds[0] || null

  const classifications = [
    { type_name: 'Quantifiable',     classification_for: 'goal',        plan_type: 'pip' },
    { type_name: 'Qualitative',      classification_for: 'goal',        plan_type: 'pip' },
    { __pasSrsdsUpdate: true },
    { type_name: 'Behavioral',       classification_for: 'goal',        plan_type: 'idp' },
    { type_name: 'Technical',        classification_for: 'goal',        plan_type: 'idp' },
    { type_name: 'On-the-job',       classification_for: 'action_item', plan_type: 'idp' },
    { type_name: 'Peer',             classification_for: 'action_item', plan_type: 'idp' },
    { type_name: 'Formal classroom', classification_for: 'action_item', plan_type: 'idp' },
  ]
  // Classification-type creation (/idp/idp/settings/classification_type/) 404s under our
  // stopgap token, and there's no page in Klaar's own UI where it could be captured/verified
  // for a real-session comparison (checked — no such settings screen was found). Nothing
  // in _createIDPPlan()/_createPIPPlan() actually depends on these types existing (they're
  // just pre-seeded taxonomy for the goal/action-item type dropdowns), so treat failures
  // here as non-fatal instead of blocking plan creation on an endpoint we can't verify.
  const classificationFailed = []
  for (const c of classifications) {
    if (c.__pasSrsdsUpdate) {
      if (ratingScaleId) {
        r = await klaarApi(pasUrl, { method: 'PATCH', body: JSON.stringify({ org_level: { allowed_modules: { idp: { other_settings: buildIdpOtherSettings([ratingScaleId], adminUuid) } } } }) })
        if (!r.ok) return { ok: false, message: `PAS srsds update failed: ${r.status}` }
      }
    } else {
      r = await klaarApi('/idp/idp/settings/classification_type/', { method: 'POST', body: JSON.stringify(c) })
      if (!r.ok) {
        const body = (r.text || '').toLowerCase()
        if (!body.includes('exist')) classificationFailed.push(`${c.type_name} (${r.status})`)
      }
    }
  }
  const failNote = classificationFailed.length ? ` | Classification types failed (non-fatal): ${classificationFailed.join(', ')}` : ''
  return { ok: true, message: `Configured PAS + ${classifications.length - 1} classification types (PIP: 2, IDP: 5)${failNote}` }
}

// Ported from _resolveCompetencyTypeId() in actions.js. The browser's own real-session
// capture shows POST with no body, response {success, message, data: [{id, type_name, ...}]}
// — but every other /review/* POST endpoint hit so far (get_ratings_for_org,
// get_reviews_for_org, get_all_calibrations) has needed _extractArray()'s defensive
// unwrapping under our stopgap token instead of the flat shape a real browser session gets,
// so this uses it too rather than assuming this one endpoint is the exception. Picks the
// first available type. No durable-state caching (unlike the browser's
// state.competencyTypeId) — cheap enough to just re-resolve live each run.
export async function resolveCompetencyTypeId() {
  const r = await klaarApi('/review/get_competency_types', { method: 'POST' })
  if (!r.ok) return null
  const types = _extractArray(r.data)
  return types[0]?.id || null
}
