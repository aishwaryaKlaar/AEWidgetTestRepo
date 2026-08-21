// Node-safe port of createReviews() from src/modules/reviews/actions.js ("Reviews" in the
// widget UI), for the Slack slash-command proof-of-concept.
//
// Three inputs to resolve live instead of from state: groups (shared fetchAllGroups(),
// filtered to custom groups the same way the original excludes built-in "All Company"),
// rating scales (resolveRatingScaleIds() in reviewsCore.js, against the confirmed real
// /review/get_ratings_for_org list endpoint), and time periods (shared fetchTimePeriods(),
// same endpoint GoalsModule already uses). Review creation itself needs no admin identity
// — none of the /review*/reviewj* calls take a sheet_user_id param, only the time-period
// fetch does.
import { klaarApi, runJobAndReply, resolveSheetUserId, fetchTimePeriods, resolveUsableGroups } from '../shared/klaarCore.js'
import { resolveRatingScaleIds } from './reviewsCore.js'
import { RATING_SCALE_NAMES } from './createRatingScaleJob.js'

function _quarterlyEvalParams(ratingScaleId) {
  const dataItem = (id, name, opOverride = 'OPTIONAL') => ({
    id, name,
    reviewees_goals: { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'BOTH' },
    feedback_form: { survey: { name: '', id: '' }, status: 'MANDATORY' },
    competencies: { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'ALL' },
    overall_performance: { comments: 'MANDATORY', ratings: opOverride },
  })
  return {
    headers_config: { no: true, reviewees_goals: false, feedback_form: false, competencies: false, overall_performance: true, reviewers: true },
    reviewers_config: { PAST_L1_MANAGER: false, DIRECT_REPORTS: false, PEERS: false, SECONDARY_MATRIX_MANAGER: false, L1_MANAGER: true, SELF: true, PRIMARY_MATRIX_MANAGER: false, DEPARTMENT_HEAD: false, L2_MANAGER: false },
    data: [
      dataItem('SELF', 'Self', 'MANDATORY'),
      dataItem('L1_MANAGER', 'Manager', 'MANDATORY'),
      dataItem('L2_MANAGER', 'Skip Manager'),
      dataItem('DIRECT_REPORTS', 'Direct Reports'),
      dataItem('PEERS', 'Peers'),
      dataItem('PAST_L1_MANAGER', 'Previous Manager'),
      dataItem('PRIMARY_MATRIX_MANAGER', 'Primary Matrix Manager'),
      dataItem('SECONDARY_MATRIX_MANAGER', 'Secondary Matrix Manager'),
      dataItem('DEPARTMENT_HEAD', 'Department Head'),
    ],
    rating_scale_ids: { overall_performance: ratingScaleId, reviewees_goals: ratingScaleId, competencies: ratingScaleId },
  }
}

// Ported from _createReview() in actions.js. Returns the created reviewId directly
// instead of writing state.lastReviewId — there's no separate step that needs to recover
// it afterward (unlike Goals objectives / Calibration's review lookup, review creation and
// its own follow-up PATCHes all happen inside this one call).
async function _createReview(opts) {
  // CONFIRMED live via network capture of Klaar's own "Create Review" flow: the browser
  // never sends fromTemplate to this endpoint — GET .../templates/ is just an informational
  // list for the UI, and the create call itself is a plain POST with an empty body. Sending
  // ?fromTemplate=... (as originally ported from actions.js) 500s under our stopgap token.
  const r1 = await klaarApi('/reviewj/api/v1/reviews/', { method: 'POST', body: JSON.stringify({}) })
  if (!r1.ok) return { ok: false, message: `Create review failed: ${r1.status}` }
  const reviewId = r1.data?.data?.id || r1.data?.id
  if (!reviewId) return { ok: false, message: 'No review id in response' }

  const reviewsUrl = `/reviewj/api/v1/reviews/?reviewId=${reviewId}`
  const updateUrl = `/review/update_review_for_review_id/${reviewId}`
  const patch = (url, body) => klaarApi(url, { method: 'PATCH', body: JSON.stringify(body) })

  if (opts.endDate) {
    const r1b = await patch(reviewsUrl, { end_date: opts.endDate })
    if (!r1b.ok) return { ok: false, message: `Set end_date failed: ${r1b.status}` }
  }
  const calls = [
    [reviewsUrl, { name: opts.reviewName }, 'name'],
    [reviewsUrl, { config_chapter_status: { settings: true } }, 'settings'],
    [updateUrl, { reviewees: [opts.groupId] }, 'reviewees'],
    [reviewsUrl, { config_chapter_status: { reviewees: true } }, 'reviewees-status'],
    [updateUrl, { time_period: opts.timePeriod }, 'time_period'],
    [reviewsUrl, { config_chapter_status: { reviewers: true } }, 'reviewers-status'],
    [updateUrl, { evaluation_parameters: _quarterlyEvalParams(opts.ratingScaleId) }, 'evaluation_parameters'],
    [reviewsUrl, { config_chapter_status: { reviewersScope: true } }, 'reviewersScope'],
    [reviewsUrl, { config_chapter_status: { nudges: true } }, 'nudges'],
    [reviewsUrl, { config_chapter_status: { optionalSettings: true } }, 'optionalSettings'],
    [updateUrl, { state: 'Published' }, 'publish'],
  ]
  let n = 2
  for (const [url, body, label] of calls) {
    const r = await patch(url, body)
    if (!r.ok) return { ok: false, message: `Call ${n} (${label}) failed: ${r.status}` }
    n++
  }
  return { ok: true, reviewId, message: `Review "${opts.reviewName}" published (${reviewId.slice(0, 8)}…)` }
}

function _currentYear() { return new Date().getFullYear() }

// The 6 review definitions from REVIEWS in createReviews() (actions.js:231-241) — names
// depend on the current year, so this is a function, not a static array. Exported:
// createCalibrationJob.js needs the exact same name list to recover these reviews' real
// IDs live via resolveReviewIds().
export function buildReviews() {
  const y = _currentYear()
  return [
    { fromTemplate: 'yearEnd', reviewName: `Annual Strategic Horizon & Delivery Assessment ${y}`, endDate: `${y}-12-30T23:59:59.000Z` },
    { fromTemplate: 'midYear', reviewName: `Mid-Year Core Capability & Milestone Evaluation ${y}`, endDate: `${y}-12-30T23:59:59.000Z` },
    { fromTemplate: 'quarterly', reviewName: `Q1 Objective Alignment & Foundation Kickoff ${y}` },
    { fromTemplate: 'quarterly', reviewName: `Q2 Execution Velocity & Friction Diagnostic ${y}` },
    { fromTemplate: 'quarterly', reviewName: `Q3 Value Delivery & Cross-Team Synergy Check ${y}` },
    { fromTemplate: 'quarterly', reviewName: `Q4 Annual Impact Synthesis & Wrap-Up ${y}` },
  ]
}

// Ported from createReviews() in actions.js, minus the state.js reads/writes.
export async function createReviewsJob() {
  const usableGroups = await resolveUsableGroups()
  if (!usableGroups.length) return { ok: false, message: 'No groups found. Run /bulk-upload-group or /add-group first.' }

  const ratingScaleIds = (await resolveRatingScaleIds(RATING_SCALE_NAMES)).filter(Boolean)
  if (!ratingScaleIds.length) return { ok: false, message: 'No rating scales found. Run /create-rating-scale first.' }

  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }
  const timePeriods = (await fetchTimePeriods(sheetUserId)).filter(t => t.id)
  if (!timePeriods.length) return { ok: false, message: 'No time periods found. Run /create-time-period first.' }

  const REVIEWS = buildReviews()

  const created = [], failed = []
  for (let i = 0; i < REVIEWS.length; i++) {
    const rev = REVIEWS[i]
    const groupId = usableGroups[i % usableGroups.length].id
    const timePeriod = timePeriods[i % timePeriods.length]
    const ratingScaleId = ratingScaleIds[i % ratingScaleIds.length]
    const r = await _createReview({ ...rev, groupId, timePeriod, ratingScaleId })
    if (r.ok) created.push(rev.reviewName)
    else failed.push(`${rev.reviewName} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All reviews failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/${REVIEWS.length} reviews: ${created.join(', ')}${failNote}. Go to Reviews in Klaar to view them.` }
}

export async function runCreateReviewsJob({ response_url }) {
  await runJobAndReply(createReviewsJob, response_url)
}
