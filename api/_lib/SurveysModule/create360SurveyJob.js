// Node-safe port of create360Survey() from src/modules/surveys/actions.js ("Create 360
// Survey" in the widget UI), for the Slack slash-command proof-of-concept.
//
// Admin identity resolved via resolveSheetUserId() instead of a JWT. Template-list and
// nomination shape unwrapping reuses ReviewsModule's _extractArray() / this module's own
// unwrapPayload() — the same defensive-shape-checking pattern already needed everywhere
// else under our stopgap token. The browser's CORS-fallback-proxy path (klaar_proxy.js,
// used only when a browser's own CORS policy blocks the request) is dropped — a Node
// server-side fetch has no CORS restriction, so it can never apply here.
import { klaarApi, runJobAndReply, resolveSheetUserId } from '../shared/klaarCore.js'
import { _extractArray } from '../ReviewsModule/reviewsCore.js'
import { unwrapPayload } from './surveysCore.js'

// The 5 survey names from SURVEY_360_NAMES in actions.js.
const SURVEY_360_NAMES = [
  'Crisis Composure & Incident Leadership 360',
  'Commercial Acumen & Value Realization 360',
  'Cross-Functional Synergy & Matrix Leadership 360',
  'Adaptive Agility & Change Management 360',
  'Governance, Risk Integrity & Compliance 360',
];

// Ported from create360Survey() in actions.js, minus the state.js reads/writes.
export async function create360SurveyJob() {
  const { sheetUserId: adminId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  // Always fetch 360 templates fresh, sorted oldest-first (pre-existing templates before
  // automation ones).
  const r = await klaarApi('/surveyms/get_template_for_org?is_reduced_data=true', {
    method: 'POST',
    body: JSON.stringify({ offset: 1, limit: 50, filters: { name: [], status: ['PUBLISHED'], type: ['360'] }, sort: { sort_field: 'created_at', sort_order: 'asc' } }),
  })
  const templateIds = _extractArray(r.data).map(t => t.id).filter(Boolean)
  if (!templateIds.length) return { ok: false, message: 'No 360 templates found. Run /create-360-template first.' }

  // Fetch nominations and pick one where is_survey_linked is false
  const nr = await klaarApi('/survey/feedback-nomination/feedback-nomination/?offset=0&with_admins=True&limit=10&status=closed,paused,approvals_awaited,published,ready_to_publish')
  const nrPayload = unwrapPayload(nr)
  const nomList = Array.isArray(nrPayload?.results) ? nrPayload.results
    : Array.isArray(nrPayload) ? nrPayload
    : []

  let finalNominationId = null
  for (const cand of nomList) {
    const nf = await klaarApi(`/survey/feedback-nomination/feedback-nomination/${cand.id}/`)
    const nfd = unwrapPayload(nf) || {}
    if (!nfd.is_survey_linked) {
      finalNominationId = cand.id
      break
    }
  }
  if (!finalNominationId) {
    return { ok: false, message: 'All nominations are already survey-linked. Run /create-360-nomination to make new ones.' }
  }

  const startAt = new Date().toISOString()
  const endAt   = new Date(Date.now() + 7 * 86400000).toISOString()
  const created = [], failed = []

  for (let i = 0; i < SURVEY_360_NAMES.length; i++) {
    const name       = SURVEY_360_NAMES[i]
    const templateId = templateIds[i % templateIds.length]

    const payload = {
      data: {
        start_at: startAt,
        end_at: endAt,
        name,
        survey_admins: [adminId],
        template_id: templateId,
        send_email_notification: false,
        send_gchat_notification: false,
        send_slack_notification: false,
        is_anonymous: false,
        is_skippable: false,
        skip_survey_comment: '',
        description: '',
        reminders: [],
        feedback_request_for_part_time: false,
        feedback_request_from_part_time: false,
        is_flat_survey: true,
        introduction: { file: { name: '', s3_object_key: '' }, config: false, content: '' },
        nomination_id: finalNominationId,
        survey_groups: [{
          survey_group_name: name,
          group_audience_id: [],
          audience_members: [],
          description: '',
          survey_for: '',
          respondents: [],
        }],
      },
    }

    const rr = await klaarApi('/surveyms/launch_multiple_survey', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (rr.ok) {
      created.push(name)
    } else {
      const body = (rr.text || '').toLowerCase()
      if (body.includes('exist')) created.push(name)
      else { failed.push(`${name} (${rr.status})`); break }
    }
  }

  if (!created.length) return { ok: false, message: `All 360 surveys failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 surveys: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}. Go to Surveys in Klaar to view them.` }
}

export async function runCreate360SurveyJob({ response_url }) {
  await runJobAndReply(create360SurveyJob, response_url)
}
