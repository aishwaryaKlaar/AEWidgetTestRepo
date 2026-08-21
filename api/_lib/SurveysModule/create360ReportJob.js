// Node-safe port of create360Report() from src/modules/surveys/actions.js ("Create 360
// Report" in the widget UI), for the Slack slash-command proof-of-concept.
//
// CONFIRMED live via network capture: /surveyms/get_survey_group_from_template only
// returns something for a template that's had an actual survey launched from it
// (/surveys create-360-survey) — most templates never get one, especially after repeated
// /surveys create-360-template runs pile up unused duplicates. The original approach
// (cycle through raw templates, then look up that template's survey group) was bound to
// miss most of the time. Fixed: fetch every survey group in the workspace directly via
// /surveyms/get_survey_group_for_org (each entry already carries its own template_id),
// and cycle through THOSE instead — every pick is then guaranteed to have a real group.
import { klaarApi, runJobAndReply, extractField } from '../shared/klaarCore.js'
import { _extractArray } from '../ReviewsModule/reviewsCore.js'

// The 5 report names from REPORT_360_NAMES in actions.js.
const REPORT_360_NAMES = [
  'Architectural Scale & Systems Rigor 360 Report',
  'Cross-Functional Influence & Matrix Leadership 360 Report',
  'Data-Driven Decision Making & Empirical Insight 360 Report',
  'Customer Empathy & Product Value Delivery 360 Report',
  'Talent Enablement & Succession Engineering 360 Report',
];

// Ported from create360Report() in actions.js, with the survey-group lookup fixed per
// the comment above.
export async function create360ReportJob() {
  const sgOrgR = await klaarApi('/surveyms/get_survey_group_for_org', { method: 'POST', body: JSON.stringify({}) })
  const allGroups = _extractArray(sgOrgR.data).filter(g => g.type === '360' && g.id && g.template_id)
  if (!allGroups.length) return { ok: false, message: 'No 360 survey groups found. Run /surveys create-360-survey first.' }

  // The report payload needs the TEMPLATE's own name (e.g. "360° Incident Response &
  // Crisis Composure Diagnostic"), not the survey's name (e.g. "Crisis Composure &
  // Incident Leadership 360") — fetch templates once and match by id. CONFIRMED live: the
  // filter shape originally ported from actions.js's create360Report() (`type: '360'` as a
  // bare string, `name: ['']`, no status filter) returns some other unrelated set of 16
  // templates that never overlaps with the ones survey groups actually reference — the
  // filter shape create360SurveyJob.js already uses successfully (proper `type`/`status`
  // arrays) is what actually finds them, so this now matches that exactly.
  const tplR = await klaarApi('/surveyms/get_template_for_org?is_reduced_data=true', {
    method: 'POST',
    body: JSON.stringify({ offset: 1, limit: 50, filters: { name: [], status: ['PUBLISHED'], type: ['360'] }, sort: { sort_field: 'created_at', sort_order: 'asc' } }),
  })
  const templateById = new Map(_extractArray(tplR.data).map(t => [t.id, t]))

  const created = [], failed = []

  for (let i = 0; i < REPORT_360_NAMES.length; i++) {
    const reportName = REPORT_360_NAMES[i]
    const sg = allGroups[i % allGroups.length]
    const template = templateById.get(sg.template_id)
    if (!template) { failed.push(`${reportName} (no template found for survey group)`); continue }

    // Step 1: Create system report
    const r1 = await klaarApi('/surveyms/create_system_report', {
      method: 'POST',
      body: JSON.stringify({ name: reportName }),
    })
    if (!r1.ok) { failed.push(`${reportName} (create ${r1.status})`); continue }

    const srId = extractField(r1.data, 'id') || extractField(r1.data, 'sr_id')
    if (!srId) { failed.push(`${reportName} (no sr_id)`); continue }

    // Step 2: Link template + survey group to the report — one PATCH, matching the real
    // payload shape: template as {id, name}, selected_survey_groups as an array.
    const r4 = await klaarApi(`/surveyms/update_system_report?sr_id=${srId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        template: { id: template.id, name: template.name },
        selected_survey_groups: [sg.id],
      }),
    })
    if (!r4.ok) { failed.push(`${reportName} (update ${r4.status})`); continue }

    // Step 3: Publish report
    const r5 = await klaarApi(`/surveyms/publish_system_report?sr_id=${srId}`)

    if (r5.ok) created.push(reportName)
    else failed.push(`${reportName} (publish ${r5.status})`)
  }

  if (!created.length) return { ok: false, message: `All reports failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 reports: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}. Go to Reports in Klaar to view them.` }
}

export async function runCreate360ReportJob({ response_url }) {
  await runJobAndReply(create360ReportJob, response_url)
}
