// Node-safe port of createPIP() from src/modules/idps/actions.js ("Create PIP" in the
// widget UI), for the Slack slash-command proof-of-concept. createPIP2 (additional PIP
// configuration steps) is a notImplemented() stub not wired into the widget UI either, so
// it's not ported here.
//
// Same admin-identity and group-resolution approach as createIDPJob.js — see its comment.
import { klaarApi, runJobAndReply, resolveSheetUserId, resolveUsableGroups } from '../shared/klaarCore.js'
import { setupPlans } from './idpsCore.js'

// The 10 PIP names from PIP_NAMES in actions.js.
const PIP_NAMES = [
  'Milestone Realignment & Delivery Roadmap',
  'Execution Consistency & Focus Blueprint',
  'Core Impact & Accountabilities Compact',
  'Professional Competency Restoration Framework',
  'Strategic Velocity Recovery Initiative',
  'Targeted Output & Delivery Pathway',
  'Operational Standards Alignment Plan',
  'Performance Turnaround & Mentorship Action Plan',
  'Skill Precision & Execution Enhancement Program',
  'Foundational Excellence & Growth Protocol',
];

// Ported from _createPIPPlan() in actions.js.
async function _createPIPPlan({ name, groupId }) {
  const r1 = await klaarApi('/idp/idp/meta/pip/admin/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  if (!r1.ok) return { ok: false, message: `Create PIP failed: ${r1.status}` }
  const planId = r1.data?.id || r1.data?.data?.id || r1.data?.plan_id
  if (!planId) return { ok: false, message: 'No plan id in PIP create response' }

  const checksUrl = `/idp/idp/plans/${planId}/checks/`
  const check = (checks) => klaarApi(checksUrl, { method: 'PUT', body: JSON.stringify({ type: 'PIP', checks }) })

  await klaarApi(`${checksUrl}?type=PIP`)

  const steps = [
    () => klaarApi(`/idp/idp/meta/participants/${planId}/`, {
      method: 'POST',
      body: JSON.stringify({ reviews: [], calibration: [], groups: [groupId.startsWith('group_') ? groupId : `group_${groupId}`], exclusion_list: [] }),
    }),
    () => check(['participant_check']),
    () => klaarApi(`/idp/idp/meta/${planId}/duration/`, {
      method: 'POST',
      body: JSON.stringify({ durations: [{ filter: 'default', type: 'days', value: 30 }] }),
    }),
    () => check(['duration_check']),
    () => klaarApi(`/idp/idp/meta/pip/admin/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ introduction: null }),
    }),
    () => check(['introduction_check']),
    () => check(['configure_goals_check']),
    () => klaarApi(`/idp/idp/meta/settings/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ strength_enabled: false }),
    }),
    () => check(['strength_check']),
    () => klaarApi(`/idp/idp/meta/settings/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        allow_modify_action_items: false,
        allow_modify_admin_created_improv_actions: false,
        allow_modify_improvements: false,
        enable_notes_participants: false,
      }),
    }),
    () => check(['optional_settings_check']),
  ]

  for (let i = 0; i < steps.length; i++) {
    const r = await steps[i]()
    if (!r.ok) return { ok: false, message: `PIP step ${i + 2} failed (${r.status})` }
  }
  return { ok: true }
}

// Ported from createPIP() in actions.js, minus the state.js reads.
export async function createPIPJob() {
  const { sheetUserId: adminUuid } = await resolveSheetUserId()

  const setup = await setupPlans(adminUuid)
  if (!setup.ok) return setup

  const usableGroups = await resolveUsableGroups()
  if (!usableGroups.length) return { ok: false, message: 'No groups found. Run /add-group or /bulk-upload-group first.' }

  const created = [], failed = []
  for (let i = 0; i < PIP_NAMES.length; i++) {
    const groupId = usableGroups[i % usableGroups.length].id
    const r = await _createPIPPlan({ name: PIP_NAMES[i], groupId })
    if (r.ok) created.push(PIP_NAMES[i])
    else failed.push(`${PIP_NAMES[i]} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `Setup ok but all PIP plans failed: ${failed.join(' | ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/${PIP_NAMES.length} PIP plans: ${created.join(', ')}${failNote}. Go to Development Plans (PIP tab) in Klaar to view them.` }
}

export async function runCreatePIPJob({ response_url }) {
  await runJobAndReply(createPIPJob, response_url)
}
