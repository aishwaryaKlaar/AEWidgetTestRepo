// Node-safe port of createReports() from src/modules/reviews/actions.js ("Reports" in the
// widget UI), for the Slack slash-command proof-of-concept.
//
// Needs calibration IDs from createCalibrationJob — cross-module lookup resolved live via
// resolveCalibrationIds() (CalibrationModule/calibrationCore.js), confirmed against a real
// network capture of Klaar's own Calibration list page.
import { klaarApi, runJobAndReply, extractField } from '../shared/klaarCore.js'
import { resolveCalibrationIds } from '../CalibrationModule/calibrationCore.js'
import { CALIBRATION_NAMES } from '../CalibrationModule/createCalibrationJob.js'

// The 10 report names from REPORT_NAMES in src/modules/reviews/actions.js:262-273.
const REPORT_NAMES = [
  'Systems Reliability & Incident Latency Ledger',
  'Unit Economics & Infrastructure ROI Analytics',
  'Developer Experience & Toil Reduction Pulse',
  'Cross-Functional Matrix Execution Assessment',
  'Continuous Delivery & Deployment Velocity Brief',
  'Autonomous Workforce & Skill Density Diagnostic',
  'Strategic Roadmap Horizon & Milestone Scorecard',
  'Customer Empathy & Retention Telemetry Report',
  'Zero-Trust Security & Audit Preparedness Brief',
  'Asynchronous Workflow & Knowledge Hygiene Index',
];

// Ported from _createOneReport() in actions.js.
async function _createOneReport({ name, calibrationId }) {
  const r1 = await klaarApi('/review/create_system_report', {
    method: 'POST',
    body: JSON.stringify({ name, are_acknowledgements_required: false }),
  })
  if (!r1.ok) return { ok: false, message: `Create "${name}" failed: ${r1.status}` }
  const reportId = extractField(r1.data, 'id')
  if (!reportId) return { ok: false, message: `No report id returned for "${name}"` }

  const r2 = await klaarApi(`/review/update_reviews_or_calibration_in_system_report?pms_sr_id=${reportId}`, {
    method: 'PATCH',
    body: JSON.stringify({ selected_calibration: calibrationId }),
  })
  if (!r2.ok) return { ok: false, message: `Link calibration for "${name}" failed: ${r2.status}` }

  const r3 = await klaarApi(`/review/update_system_report?pms_sr_id=${reportId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cover_page: { report_name: name } }),
  })
  if (!r3.ok) return { ok: false, message: `Cover page for "${name}" failed: ${r3.status}` }

  const r4 = await klaarApi(`/review/publish_system_report?pms_sr_id=${reportId}`)
  if (!r4.ok) return { ok: false, message: `Publish "${name}" failed: ${r4.status}` }

  return { ok: true }
}

// Ported from createReports() in actions.js, minus the state.js read.
export async function createReportsJob() {
  const calibrationIds = (await resolveCalibrationIds(CALIBRATION_NAMES)).filter(Boolean)
  if (!calibrationIds.length) return { ok: false, message: 'No calibrations found. Run /create-calibration first.' }

  const created = [], failed = []
  for (let i = 0; i < REPORT_NAMES.length; i++) {
    const name = REPORT_NAMES[i]
    const calibrationId = calibrationIds[i % calibrationIds.length]
    const r = await _createOneReport({ name, calibrationId })
    if (r.ok) created.push(name)
    else failed.push(`${name} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All reports failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} reports: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}. Go to Reports in Klaar to view them.` }
}

export async function runCreateReportsJob({ response_url }) {
  await runJobAndReply(createReportsJob, response_url)
}
