// Node-safe port of createNomination() from src/modules/surveys/actions.js ("Create
// Nomination" in the widget UI) — feedback nominations are exclusively 360-flow
// infrastructure (create360Survey needs one with is_survey_linked:false to attach each
// survey to), so this is ported as part of the 360 command set even though its own button
// label doesn't say "360".
//
// Admin identity resolved via resolveSheetUserId() instead of a JWT — same trick used
// across every other module. Groups use ALL groups (fetchAllGroups()), not the
// custom-groups-preferred resolveUsableGroups() — matching the original, which never
// excludes built-in groups here.
import { klaarApi, runJobAndReply, resolveSheetUserId, fetchAllGroups, errorBodyText, searchResults } from '../shared/klaarCore.js'
import { unwrapPayload } from './surveysCore.js'

// The 7 nomination names from NOMINATION_NAMES in actions.js.
const NOMINATION_NAMES = [
  'Beacon of Uncompromising Integrity',
  'Pioneer of Scalable Innovation',
  'Customer Value Champion Honor',
  'Master of Strategic Execution',
  'Empowerment & Inclusivity Vanguard',
  'Unsung Operational Hero Award',
  'Sustainable Impact & Stewardship Distinction',
];

// Ported from createNomination() in actions.js, minus the state.js reads/writes.
export async function createNominationJob() {
  const { sheetUserId: adminId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const groups = (await fetchAllGroups()).filter(g => g.id)
  if (!groups.length) return { ok: false, message: 'No groups found. Run /add-group or /bulk-upload-group first.' }

  // Resolve one other org user (besides the admin) so each nomination can be finalized
  // with a non-zero audience — without this, "audience" stays 0 and the linked survey has
  // no respondents.
  let otherUserId = null
  {
    const ur = await klaarApi('/um/accounts/employee/?page=1&page_size=20&get_disabled=true&filter=%5B%5D')
    const emp = searchResults(ur).find(e => e.org_user?.id && e.org_user.id !== adminId)
    otherUserId = emp?.org_user?.id || null
  }

  const endDate = new Date(Date.now() + 14 * 86400000).toISOString()

  const _nomSettings = (name, nomGroupIds, extra = {}) => ({
    name,
    nomination_group_ids: nomGroupIds,
    end_date: endDate,
    allow_notifications: true,
    auto_close_enabled: false,
    respondent_status_enabled: false,
    hrbp_add_participants_enabled: false,
    total_min_respondents: 1,
    total_max_respondents: 100,
    team_min_respondents: 2,
    team_max_respondents: 20,
    peer_min_respondents: 2,
    peer_max_respondents: 20,
    stakeholder_min_respondents: 2,
    stakeholder_max_respondents: 20,
    is_team_max_enabled: true,
    is_peer_max_enabled: true,
    is_stakeholder_max_enabled: true,
    is_total_max_enabled: true,
    peers_category: 'mandatory',
    stakeholders_category: 'mandatory',
    reminders: [],
    approver_settings: { approval_required_from: 'none', approver_action: 'back_to_participant' },
    completion_criteria: {
      participant: false, manager_limit: 0, manager: false, manager_l2: false,
      primary_matrix_manager: false, secondary_matrix_manager: false,
      team_limit: 0, direct_reports: 0, direct_report_of_direct_report: 0, peers: 0, stakeholders: 0,
    },
    settings: {
      participant: { enabled: true, override: false },
      participant_manager: { enabled: true, override: false },
      participant_manager_l2: { enabled: true, override: false },
      participant_primary_matrix_manager: { enabled: true, override: false },
      participant_secondary_matrix_manager: { enabled: true, override: false },
      participant_direct_reports: { enabled: true, override: false },
      participant_direct_report_of_direct_report: { enabled: true, override: false },
      participant_peers: { enabled: true, override: true },
      participant_stakeholders: { enabled: false, override: true },
    },
    ...extra,
  })

  const created = [], failed = []
  for (let i = 0; i < NOMINATION_NAMES.length; i++) {
    const name = NOMINATION_NAMES[i]
    const g1 = groups[i % groups.length].id
    const g2 = groups[(i + 1) % groups.length].id
    const nomGroupIds = g1 === g2 ? [g1] : [g1, g2]

    // Step 1: Create
    const r = await klaarApi('/survey/feedback-nomination/feedback-nomination/', {
      method: 'POST',
      body: JSON.stringify({ name, admin_ws_user_ids: [adminId], nomination_group_ids: nomGroupIds }),
    })
    if (!r.ok) {
      const body = errorBodyText(r)
      if (body.includes('exist')) created.push(name)
      else failed.push(`${name} (${r.status})`)
      continue
    }
    const nomId = unwrapPayload(r)?.id
    if (!nomId) { failed.push(`${name} (no id)`); continue }

    // Step 2: Submit with full settings — kicks off background audience-populate task
    const subR = await klaarApi(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(_nomSettings(name, nomGroupIds, { submit: true })),
    })
    const approverSettingsId = unwrapPayload(subR)?.approver_settings?.id

    // Step 3: Poll until ready_to_publish (background task may take a few seconds)
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(res => setTimeout(res, 2000))
      const sr = await klaarApi(`/survey/feedback-nomination/feedback-nomination/${nomId}/?only=status`)
      if (unwrapPayload(sr)?.status === 'ready_to_publish') break
    }

    // Step 4: Add admin (+ one other user) as participants — lets the demo be run entirely
    // via Slack instead of needing a second account login.
    const participantIds = otherUserId ? [adminId, otherUserId] : [adminId]
    const addR = await klaarApi(`/survey/feedback-nomination/add-participants/${nomId}/`, {
      method: 'POST',
      body: JSON.stringify({ participants: participantIds }),
    })
    const addPayload = unwrapPayload(addR)
    const nomRequestIds = (Array.isArray(addPayload) ? addPayload : []).map(d => d.id).filter(Boolean)

    if (nomRequestIds.length) {
      await klaarApi(`/survey/feedback-nomination/add-participants/${nomId}/`, {
        method: 'POST',
        body: JSON.stringify({ nom_requests: nomRequestIds, submit: true }),
      })
    }

    // Step 5: Publish
    const pubSettings = _nomSettings(name, nomGroupIds, { publish: true })
    if (approverSettingsId) pubSettings.approver_settings = { ...pubSettings.approver_settings, id: approverSettingsId }
    const pubR = await klaarApi(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(pubSettings),
    })

    // Step 6: Finalise the admin's request + one other participant's request so the
    // nomination has a non-zero audience once it's linked to a survey.
    for (const reqId of nomRequestIds) {
      await klaarApi(`/survey/feedback-nomination/requests/${reqId}/finalise/`, { method: 'POST' })
    }

    // Step 7: Save — resave settings (no submit/publish flag) to reflect the finalised state
    const finalApproverId = unwrapPayload(pubR)?.approver_settings?.id || approverSettingsId
    const saveSettings = _nomSettings(name, nomGroupIds)
    if (finalApproverId) saveSettings.approver_settings = { ...saveSettings.approver_settings, id: finalApproverId }
    await klaarApi(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(saveSettings),
    })

    created.push(name)
  }

  if (!created.length) return { ok: false, message: `All nominations failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} nominations: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}. Go to Feedback Nominations in Klaar to view them.` }
}

export async function runCreateNominationJob({ response_url }) {
  await runJobAndReply(createNominationJob, response_url)
}
