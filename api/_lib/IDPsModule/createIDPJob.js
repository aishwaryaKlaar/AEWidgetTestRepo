// Node-safe port of createIDP() from src/modules/idps/actions.js ("Create IDP" in the
// widget UI), for the Slack slash-command proof-of-concept.
//
// Admin identity for the workspace-settings PATCH resolved via resolveSheetUserId() (the
// is_admin-flagged manager's real UUID) instead of a JWT — same trick used across every
// other module. Groups resolved live via the shared resolveUsableGroups() (promoted from
// ReviewsModule's own usableGroups pattern once this module needed the exact same logic).
import { klaarApi, runJobAndReply, resolveSheetUserId, resolveUsableGroups } from '../shared/klaarCore.js'
import { setupPlans } from './idpsCore.js'

// The 10 IDP names from IDP_NAMES in actions.js.
const IDP_NAMES = [
  'Systems Architect & Technical Mastery Pathway',
  'Strategic General Management Acceleration Track',
  'High-Agency Execution & Core Craftsmanship Plan',
  'Cross-Functional Catalyst & Influence Roadmap',
  'Frontier Technologies & Applied Innovation Track',
  'Individual Contributor to Force Multiplier Blueprint',
  'Ecosystem Leadership & Domain Breadth Fellowship',
  'Operational Resilience & Crisis Leadership Program',
  'Foundational Excellence & Career Velocity Matrix',
  'Enterprise Steward & Transformational Impact Circuit',
];

// Ported from _createIDPPlan() in actions.js.
async function _createIDPPlan({ name, groupId }) {
  const r1 = await klaarApi('/idp/idp/development_plan/', {
    method: 'POST',
    body: JSON.stringify({ name, created_by: 'Admin', start_at: null, end_at: null }),
  })
  if (!r1.ok) return { ok: false, message: `Create plan failed: ${r1.status}` }
  const planId = r1.data?.id || r1.data?.data?.id
  if (!planId) return { ok: false, message: 'No plan id in response' }

  const planUrl   = `/idp/idp/development_plan/${planId}/?view=undefined`
  const checksUrl = `/idp/idp/plans/${planId}/checks/`
  const patch = (body) => klaarApi(planUrl,   { method: 'PATCH', body: JSON.stringify(body) })
  const check = (body) => klaarApi(checksUrl, { method: 'PUT',   body: JSON.stringify(body) })

  const now    = new Date().toISOString()
  const end45d = new Date(Date.now() + 45 * 86400000).toISOString()

  const steps = [
    [patch, { participants: [groupId], exclusion_list: [] }],
    [check, { type: 'IDP', checks: ['participant_check'] }],
    [patch, { start_at: now, end_at: end45d }],
    [check, { type: 'IDP', checks: ['duration_check'] }],
    [patch, { dev_plan_introduction: null }],
    [check, { type: 'IDP', checks: ['introduction_check'] }],
    [check, { type: 'IDP', checks: ['configure_goals_check'] }],
    [patch, { is_strength_enable: false }],
    [check, { type: 'IDP', checks: ['strength_check'] }],
    [patch, { allowed_additional_goal: false, allow_editing_existing_goal: false, allow_adding_notes: true }],
    [check, { type: 'IDP', checks: ['optional_settings_check'] }],
  ]
  for (const [fn, body] of steps) {
    const r = await fn(body)
    if (!r.ok) return { ok: false, message: `Step failed (${r.status}): ${JSON.stringify(body).slice(0, 60)}` }
  }
  return { ok: true }
}

// Ported from createIDP() in actions.js, minus the state.js reads.
export async function createIDPJob() {
  const { sheetUserId: adminUuid } = await resolveSheetUserId()

  const setup = await setupPlans(adminUuid)
  if (!setup.ok) return setup

  const usableGroups = await resolveUsableGroups()
  if (!usableGroups.length) return { ok: false, message: 'No groups found. Run /add-group or /bulk-upload-group first.' }

  const created = [], failed = []
  for (let i = 0; i < IDP_NAMES.length; i++) {
    const groupId = usableGroups[i % usableGroups.length].id
    const r = await _createIDPPlan({ name: IDP_NAMES[i], groupId })
    if (r.ok) created.push(IDP_NAMES[i])
    else failed.push(`${IDP_NAMES[i]} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `Setup ok but all plans failed: ${failed.join(' | ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Configured IDP settings + created ${created.length}/${IDP_NAMES.length} plans: ${created.join(', ')}${failNote}. Go to Development Plans (IDP tab) in Klaar to view them.` }
}

export async function runCreateIDPJob({ response_url }) {
  await runJobAndReply(createIDPJob, response_url)
}
