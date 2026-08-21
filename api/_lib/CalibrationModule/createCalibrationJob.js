// Node-safe port of createCalibration() from src/modules/calibration/actions.js ("Create
// Calibration" in the widget UI), for the Slack slash-command proof-of-concept.
//
// Needs both review IDs (createReviewsJob) and rating scale IDs (createRatingScaleJob) —
// both cross-module, cross-command lookups resolved live via confirmed real list endpoints
// (see reviewsCore.js's resolveReviewIds/resolveRatingScaleIds comments for how each was
// confirmed — network captures of Klaar's own Reviews/Rating list pages).
import { klaarApi, runJobAndReply, extractField } from '../shared/klaarCore.js'
import { resolveReviewIds, resolveRatingScaleIds } from '../ReviewsModule/reviewsCore.js'
import { buildReviews } from '../ReviewsModule/createReviewsJob.js'
import { RATING_SCALE_NAMES } from '../ReviewsModule/createRatingScaleJob.js'

// The 7 calibration names from CALIBRATION_NAMES in
// src/modules/calibration/actions.js:5-13. Exported — createReportsJob.js needs the exact
// same list to recover these calibrations' real IDs live via resolveCalibrationIds().
export const CALIBRATION_NAMES = [
  'Holistic Performance Normalization Forum',
  'Talent Density & Capability Calibration',
  'Strategic Leveling & Equity Alignment',
  'Cross-Domain Merit & Impact Council',
  'Objective Performance Parity Summit',
  'Enterprise Output Calibration Board',
  'Organizational Benchmark & Consensus Panel',
];

// Node's crypto.randomUUID with a manual fallback — copied verbatim from _uuid() in
// src/core/helpers.js (pure, not importable directly due to that file's state.js import).
function _uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Ported from _createOneCalibration() in actions.js.
async function _createOneCalibration({ name, reviewId, ratingScaleId }) {
  const r1 = await klaarApi('/review/create_calibration', {
    method: 'POST',
    body: JSON.stringify({ name, review_ids: [reviewId] }),
  })
  if (!r1.ok) return { ok: false, message: `Create "${name}" failed: ${r1.status}` }
  const caliId = extractField(r1.data, 'id')
  if (!caliId) return { ok: false, message: `No calibration id returned for "${name}"` }

  let params = extractField(r1.data, 'calibration_parameters') || []
  if (params.length && ratingScaleId) {
    params = params.map(p =>
      p.parameter_type === 'rating' ? { ...p, rating_scale: ratingScaleId } : p
    )
  } else if (ratingScaleId) {
    params = [{
      id: _uuid(),
      parameter_name: 'Final Rating (Calibration)',
      parameter_type: 'rating',
      is_disabled: false,
      for_graph_rating: true,
      rating_scale: ratingScaleId,
      prefill: false,
      prefill_linkage: { config: false, data: [] },
      default_value_config: 'NO',
      default_value_set: false,
      default_rating_value: {},
      parameter_description: '',
    }]
  }
  if (params.length) {
    const r2 = await klaarApi(`/review/update_calibration?cali_id=${caliId}`, {
      method: 'PATCH',
      body: JSON.stringify({ calibration_parameters: params }),
    })
    if (!r2.ok) return { ok: false, message: `Update params for "${name}" failed: ${r2.status}` }
  }

  const r3 = await klaarApi(`/review/publish_calibration?cali_id=${caliId}`)
  if (!r3.ok) return { ok: false, message: `Publish "${name}" failed: ${r3.status}` }

  return { ok: true, caliId }
}

// Ported from createCalibration() in actions.js, minus the state.js read/write.
export async function createCalibrationJob() {
  const reviewNames = buildReviews().map(r => r.reviewName)
  const reviewIds = (await resolveReviewIds(reviewNames)).filter(Boolean)
  if (!reviewIds.length) return { ok: false, message: 'No reviews found. Run /create-reviews first.' }

  const ratingScaleIds = (await resolveRatingScaleIds(RATING_SCALE_NAMES)).filter(Boolean)

  const created = [], failed = [], createdIds = []
  for (let i = 0; i < CALIBRATION_NAMES.length; i++) {
    const name = CALIBRATION_NAMES[i]
    const reviewId = reviewIds[i % reviewIds.length]
    const ratingScaleId = ratingScaleIds.length ? ratingScaleIds[i % ratingScaleIds.length] : null
    const r = await _createOneCalibration({ name, reviewId, ratingScaleId })
    if (r.ok) { created.push(name); if (r.caliId) createdIds.push(r.caliId) }
    else failed.push(`${name} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All calibrations failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} calibrations: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}. Go to Calibration in Klaar to view them.` }
}

export async function runCreateCalibrationJob({ response_url }) {
  await runJobAndReply(createCalibrationJob, response_url)
}
